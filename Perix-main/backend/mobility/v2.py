"""Stable Mobility V2 read API (Phase 1 facade).

The Locator will cut over to these endpoints in a later phase. They only
expose the canonical domain - no GTFS/OSM/GPS internals - so future
sources (own GPS boxes, phone trackers, manual networks) can be added
without touching the client.
"""
from typing import Optional

from fastapi import APIRouter, Depends

from database import db
from mobility.domain import build_domain, NETWORK_ID, _service_date
from models.user import UserPublic
from routes.dependencies import get_current_user_optional
from mobility.motion.traffic import TrafficContext

router = APIRouter(prefix="/mobility/v2", tags=["MobilityV2"])


async def _domain():
    from mobility.regions import get_active_region
    from routes.mobility import _get_active_network

    region = get_active_region()
    network = await _get_active_network()
    if not network:
        return None
    overrides = await db.mobility_stop_overrides.find(
        {"region_id": region.region_id, "network_id": region.network_id},
        {"_id": 0},
    ).to_list(500)
    return build_domain(network, NETWORK_ID, list(overrides))


@router.get("/networks")
async def v2_networks(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return [domain["network"]]


@router.get("/routes")
async def v2_routes(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return domain["routes"]


@router.get("/patterns")
async def v2_patterns(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return await _patterns_resolved(domain)


async def _patterns_resolved(domain: dict) -> list:
    """Patterns with one validated geometry authority per runtime mode."""
    from mobility.generations import (
        atomic_generations_enabled,
        geometry_fingerprint,
        geometry_inputs_for_version,
    )
    from mobility.graph import get_overlays, resolve_pattern_geometry

    platforms_by_id = {}
    for stop in domain.get("stops", []):
        for p in stop.get("platforms", []):
            platforms_by_id[str(p.get("platform_id"))] = p
    overlays = await get_overlays()
    version_id = str(domain.get("network", {}).get("version_id") or "")

    generation_meta = {}
    if atomic_generations_enabled():
        inputs = await geometry_inputs_for_version(version_id)
        roads_by_pattern = inputs["roads_by_pattern"]
        rails_by_pattern = inputs["rails_by_pattern"]
        segments_by_pattern = inputs["segments_by_pattern"]
        generation_meta = inputs["meta_by_pattern"]
    else:
        road_docs = await db.mobility_road_geometries.find(
            {"version_id": version_id}, {"_id": 0}
        ).to_list(1000)
        roads_by_pattern = {
            str(doc.get("pattern_id")): doc.get("points") or []
            for doc in road_docs
            if (doc.get("mode") or "bus") != "tram"
        }
        rails_by_pattern = {
            str(doc.get("pattern_id")): doc.get("points") or []
            for doc in road_docs
            if (doc.get("mode") or "bus") == "tram"
        }
        seg_docs = await db.mobility_geometry_segments.find(
            {"version_id": version_id}, {"_id": 0}
        ).to_list(3000)
        segments_by_pattern = {}
        for doc in seg_docs:
            segments_by_pattern.setdefault(
                str(doc.get("pattern_id")), []
            ).append(doc)

    out = []
    for pat in domain.get("patterns", []):
        pid = str(pat.get("pattern_id") or "")
        resolved = resolve_pattern_geometry(
            pat,
            platforms_by_id,
            overlays,
            roads_by_pattern,
            rails_by_pattern,
            segments_by_pattern.get(pid),
        )
        if (
            resolved.get("valid")
            and resolved.get("render")
            and resolved.get("points")
        ):
            try:
                from mobility import geometry_cache

                meta = generation_meta.get(pid) or {}
                source = str(resolved.get("source") or "")
                if source == "PERIX_MANUAL":
                    geom_fp = geometry_fingerprint(resolved["points"])
                    generation_id = f"manual:{geom_fp[:18]}"
                    osm_snapshot_v = None
                else:
                    geom_fp = meta.get("geometry_fingerprint")
                    generation_id = meta.get("generation_id")
                    osm_snapshot_v = meta.get("osm_snapshot_v")

                geometry_cache.set_cached(
                    pid,
                    resolved["points"],
                    version_id=version_id,
                    generation_id=generation_id,
                    source=source,
                    osm_snapshot_v=osm_snapshot_v,
                    geometry_fingerprint=geom_fp,
                )
                resolved["derived_generation"] = generation_id
                resolved["osm_snapshot_v"] = osm_snapshot_v
            except Exception:
                pass
        out.append(
            {
                **{k: v for k, v in pat.items() if k != "points"},
                "geometry": resolved,
            }
        )
    return out


def _polyline_len_m(pts: list) -> float:
    import math

    total = 0.0
    for i in range(len(pts) - 1):
        total += math.sqrt((pts[i + 1][0] - pts[i][0]) ** 2 + (pts[i + 1][1] - pts[i][1]) ** 2)
    return total * 111000.0


def _avg_polyline_dist_m(a: list, b: list) -> float:
    import math

    total = 0.0
    n = 0
    step = max(1, len(a) // 40)
    for i in range(0, len(a), step):
        lat, lng = a[i]
        best = float("inf")
        for j in range(len(b) - 1):
            x0, y0 = b[j]
            x1, y1 = b[j + 1]
            dx, dy = x1 - x0, y1 - y0
            den = dx * dx + dy * dy
            t = 0.0 if den == 0 else max(0.0, min(1.0, ((lat - x0) * dx + (lng - y0) * dy) / den))
            d = math.sqrt((lat - (x0 + t * dx)) ** 2 + (lng - (y0 + t * dy)) ** 2)
            if d < best:
                best = d
        total += best
        n += 1
    return (total / max(1, n)) * 111000.0


@router.get("/diagnostic/pattern-conflicts")
async def v2_pattern_conflicts(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Pattern pairs with the SAME stop sequence but DIFFERENT geometry -
    the cases where two patterns legitimately run on different roads/tracks
    (directions, branches) or where the corridor hint routed them apart by
    mistake. Lets us tell 'two real MVB patterns' from 'routing illusion'."""
    domain = await _domain()
    if not domain:
        return []
    patterns = await _patterns_resolved(domain)
    by_key = {}
    for p in patterns:
        key = (str(p.get("route_number")), tuple(sorted(str(x) for x in (p.get("stop_ids") or []))))
        by_key.setdefault(key, []).append(p)
    out = []
    for (rn, stops_key), pats in by_key.items():
        if len(pats) < 2:
            continue
        for i in range(len(pats)):
            for j in range(i + 1, len(pats)):
                a, b = pats[i], pats[j]
                ga = (a.get("geometry") or {}).get("points") or []
                gb = (b.get("geometry") or {}).get("points") or []
                if len(ga) < 2 or len(gb) < 2:
                    continue
                d = _avg_polyline_dist_m(ga, gb)
                if d > 25:
                    out.append(
                        {
                            "route_number": rn,
                            "pattern_a": a.get("pattern_id"),
                            "direction_a": a.get("direction"),
                            "shape_a": a.get("shape_id"),
                            "source_a": (a.get("geometry") or {}).get("source"),
                            "pattern_b": b.get("pattern_id"),
                            "direction_b": b.get("direction"),
                            "shape_b": b.get("shape_id"),
                            "source_b": (b.get("geometry") or {}).get("source"),
                            "avg_distance_m": round(d, 1),
                            "stops": len(stops_key),
                            "len_a_m": round(_polyline_len_m(ga)),
                            "len_b_m": round(_polyline_len_m(gb)),
                        }
                    )
    return sorted(out, key=lambda x: -x["avg_distance_m"])[:60]


@router.get("/diagnostic/patterns")
async def v2_diagnostic_patterns(
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Per-pattern geometry/generation state for the active version."""
    from mobility.generations import (
        atomic_generations_enabled,
        list_pattern_generations,
    )

    domain = await _domain()
    if not domain:
        return []
    version_id = str(domain.get("network", {}).get("version_id") or "")

    by_pid = {}
    meta_by_pid = {}
    if atomic_generations_enabled():
        bundles = await list_pattern_generations(version_id)
        for bundle in bundles:
            pid = str(bundle.get("pattern_id") or "")
            by_pid[pid] = bundle.get("segments") or []
            infra = bundle.get("infrastructure") or {}
            meta_by_pid[pid] = {
                "generation_id": bundle.get("generation_id"),
                "osm_snapshot_v": bundle.get("osm_snapshot_v"),
                "signal_count": infra.get("signal_count"),
                "motion_signal_count": infra.get("motion_signal_count"),
            }
    else:
        seg_docs = await db.mobility_geometry_segments.find(
            {"version_id": version_id}, {"_id": 0}
        ).to_list(5000)
        for doc in seg_docs:
            by_pid.setdefault(str(doc.get("pattern_id")), []).append(doc)

    out = []
    for pat in domain.get("patterns", []):
        pid = str(pat.get("pattern_id") or "")
        n_stops = len(pat.get("stop_ids") or [])
        segs = sorted(
            by_pid.get(pid, []),
            key=lambda segment: (
                int(segment.get("a_idx", 0)),
                int(segment.get("b_idx", 0)),
            ),
        )
        ok_pairs = {
            (int(segment.get("a_idx")), int(segment.get("b_idx")))
            for segment in segs
            if segment.get("points")
        }
        missing = [
            [i, i + 1]
            for i in range(max(0, n_stops - 1))
            if (i, i + 1) not in ok_pairs
        ]
        state = "COMPLETE"
        if not segs:
            state = "NO_SEGMENTS"
        elif missing:
            state = "MISSING_PAIRS"
        if segs and n_stops > 0 and len(ok_pairs) == n_stops - 1:
            from mobility.graph import assemble_segments

            state = (
                "COMPLETE"
                if assemble_segments(segs) is not None
                else "DISCONNECTED"
            )

        meta = meta_by_pid.get(pid) or {}
        out.append(
            {
                "pattern_id": pid,
                "route_number": pat.get("route_number"),
                "mode": pat.get("mode"),
                "direction": pat.get("direction"),
                "state": state,
                "stops": n_stops,
                "segments_ok": len(ok_pairs),
                "missing_pairs": missing,
                "generation_id": meta.get("generation_id"),
                "osm_snapshot_v": meta.get("osm_snapshot_v"),
                "signal_count": meta.get("signal_count"),
                "motion_signal_count": meta.get("motion_signal_count"),
            }
        )
    return out


@router.get("/map")
async def v2_map(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """The stable map payload the Locator consumes: resolved lines
    (validated geometry + source + per-line stops) and physical stops."""
    domain = await _domain()
    if not domain:
        return {"lines": [], "stops": []}
    patterns = await _patterns_resolved(domain)
    # stop lookup for per-line stop lists
    stop_by_id = {}
    for stop in domain.get("stops", []):
        for p in stop.get("platforms", []):
            stop_by_id[str(p.get("platform_id"))] = p
    lines = []
    for p in patterns:
        g = p.get("geometry") or {}
        points = g.get("points") or []
        if len(points) < 2:
            continue
        line_stops = []
        for sid in p.get("stop_ids") or []:
            sp = stop_by_id.get(str(sid))
            if sp:
                line_stops.append(
                    {
                        "stop_id": str(sid),
                        "name": sp.get("name"),
                        "latitude": sp.get("latitude"),
                        "longitude": sp.get("longitude"),
                    }
                )
        lines.append(
            {
                "pattern_id": p.get("pattern_id"),
                "route_number": p.get("route_number"),
                "mode": p.get("mode"),
                "direction": p.get("direction"),
                "points": [{"latitude": pt[0], "longitude": pt[1]} for pt in points],
                "source": g.get("source"),
                "valid": g.get("valid"),
                "max_platform_distance_m": g.get("max_platform_distance_m"),
                "stops": line_stops,
            }
        )
    stops = _stops_with_sides(domain.get("stops", []), lines)
    return {"lines": lines, "stops": stops}


def _side_of_road(points: list, lat: float, lng: float) -> Optional[str]:
    """'left'/'right' of the road centerline (relative to its direction),
    None when the platform is not near the geometry."""
    import math as _math

    best = None
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        dx, dy = x1 - x0, y1 - y0
        denom = dx * dx + dy * dy
        t = 0.0 if denom == 0 else max(0.0, min(1.0, ((lat - x0) * dx + (lng - y0) * dy) / denom))
        px, py = x0 + t * dx, y0 + t * dy
        d = _haversine_km(lat, lng, px, py)
        if best is None or d < best[0]:
            best = (d, dx, dy, x0, y0)
    if not best:
        return None
    d, dx, dy, x0, y0 = best
    if d > 0.2:
        return None
    kl = _math.cos(_math.radians((lat + y0) / 2.0))
    cross = dx * (lat - y0) - (dy * kl) * ((lng - x0) * kl)
    return "left" if cross > 0 else "right"


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    import math as _math

    r = 6371.0
    p1, p2 = _math.radians(lat1), _math.radians(lat2)
    dp, dl = _math.radians(lat2 - lat1), _math.radians(lng2 - lng1)
    a = _math.sin(dp / 2) ** 2 + _math.cos(p1) * _math.cos(p2) * _math.sin(dl / 2) ** 2
    return r * 2 * _math.atan2(_math.sqrt(a), _math.sqrt(1 - a))


def _stops_with_sides(stops: list, lines: list) -> list:
    """Attach left/right side to each stop/platform using the geometry of
    a line that serves it."""
    for stop in stops:
        stop_side = None
        plat_sides = {}
        for platform in stop.get("platforms", []):
            side = None
            for line in lines:
                if str(platform.get("platform_id")) in {str(s.get("stop_id")) for s in line.get("stops", [])}:
                    pts = [[p["latitude"], p["longitude"]] for p in line.get("points", [])]
                    if len(pts) >= 2:
                        side = _side_of_road(pts, platform.get("latitude"), platform.get("longitude"))
                        if side:
                            break
            platform["side"] = side
            plat_sides[str(platform.get("platform_id"))] = side
            if stop_side is None and side:
                stop_side = side
        stop["side"] = stop_side
    return stops


@router.get("/graph/overlays")
async def v2_overlays(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    from mobility.graph import get_overlays

    return await get_overlays()


@router.post("/graph/overlays")
async def v2_create_overlay(payload: dict, current_user: UserPublic = Depends(get_current_user_optional)):
    """Operator-drawn road/track correction (Perix manual graph overlay).
    Overlays never mutate imported data - the resolver prefers them only
    when verified and mode-compatible."""
    from fastapi import HTTPException

    from mobility.graph import create_overlay
    from routes.mobility import _require_operator

    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        await _require_operator(current_user)
    except HTTPException:
        raise
    try:
        return await create_overlay(payload or {})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stops")
async def v2_stops(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    domain = await _domain()
    if not domain:
        return []
    return domain["stops"]


@router.get("/stops/{stop_id}/arrivals")
async def v2_stop_arrivals(stop_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional),
                           traffic_context: TrafficContext = "baseline"):
    """Unified arrivals for a physical stop: LIVE GPS, realtime and
    schedule arrivals from one engine, honoring canceled/skipped."""
    from mobility.arrivals import unified_arrivals

    return await unified_arrivals(stop_id, traffic_context=traffic_context)


@router.get("/plan")
async def v2_plan(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
    traffic_context: TrafficContext = "baseline",
):
    """Journey planning - same engine as V1, exposed on the stable API."""
    from routes.mobility import plan_journey

    return await plan_journey(from_lat, from_lng, to_lat, to_lng, current_user,
                              traffic_context=traffic_context)


@router.get("/alerts")
async def v2_alerts(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """GTFS-RT ServiceAlerts (Störung / Umleitung / Sperrung / Halt entfällt)
    imported from the realtime feed."""
    from mobility.regions import get_active_region

    region = get_active_region()
    docs = await db.mobility_service_alerts.find(
        {"region_id": region.region_id, "network_id": region.network_id},
        {"_id": 0},
    ).sort("updated_at", -1).to_list(50)
    return docs


@router.get("/diagnostic/region")
async def v2_diagnostic_region(
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Active mobility region/network configuration (secrets excluded)."""
    from mobility.regions import get_active_region

    return get_active_region().as_dict()


@router.get("/diagnostic/osm-signals")
async def v2_diagnostic_osm_signals(
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Raw signal nodes from the active region's local OSM snapshot."""
    from mobility.osm_store import active_version, get_local_signals
    from mobility.regions import get_active_region

    region = get_active_region()
    osm_snapshot_v = await active_version(region.region_id)
    if osm_snapshot_v is None:
        return {
            "region_id": region.region_id,
            "network_id": region.network_id,
            "osm_snapshot_v": None,
            "count": 0,
            "signals": [],
        }
    signals = await get_local_signals(
        region_id=region.region_id,
        graph_v=int(osm_snapshot_v),
    )
    return {
        "region_id": region.region_id,
        "network_id": region.network_id,
        "osm_snapshot_v": int(osm_snapshot_v),
        "count": len(signals),
        "signals": signals,
    }


@router.get("/diagnostic/infrastructure/{pattern_id}")
async def v2_diagnostic_infrastructure(
    pattern_id: str,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Full edge/signal infrastructure from the same runtime authority."""
    from mobility.generations import (
        atomic_generations_enabled,
        get_pattern_generation,
    )
    from mobility.regions import get_active_region

    region = get_active_region()
    domain = await _domain()
    if not domain:
        return {"pattern_id": pattern_id, "state": "NO_NETWORK"}

    version_id = str(domain.get("network", {}).get("version_id") or "")
    pattern = next(
        (
            p
            for p in domain.get("patterns", [])
            if str(p.get("pattern_id")) == str(pattern_id)
        ),
        None,
    )
    if not pattern:
        return {"pattern_id": pattern_id, "state": "PATTERN_NOT_FOUND"}

    if atomic_generations_enabled():
        bundle = await get_pattern_generation(
            str(pattern_id),
            version_id,
            region_id=region.region_id,
            network_id=region.network_id,
        )
        if not bundle:
            return {
                "pattern_id": pattern_id,
                "state": "GENERATION_NOT_READY",
            }
        doc = dict(bundle.get("infrastructure") or {})
        if not doc:
            return {
                "pattern_id": pattern_id,
                "state": "INFRASTRUCTURE_NOT_READY",
            }
        doc["derived_generation"] = bundle.get("generation_id")
        return doc

    from mobility.infrastructure import ensure_pattern_infrastructure

    doc = await ensure_pattern_infrastructure(
        str(pattern_id),
        version_id,
        str(pattern.get("mode") or "bus"),
        region_id=region.region_id,
        network_id=region.network_id,
    )
    if not doc:
        return {
            "pattern_id": pattern_id,
            "state": "INFRASTRUCTURE_NOT_READY",
        }
    return doc


@router.get("/diagnostic/signals/{pattern_id}")
async def v2_diagnostic_signals(
    pattern_id: str,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Direction resolution + intersection clustering for one pattern."""
    from mobility.generations import (
        atomic_generations_enabled,
        get_pattern_generation,
    )
    from mobility.regions import get_active_region
    from mobility.signal_semantics import signal_semantics_enabled

    region = get_active_region()
    domain = await _domain()
    if not domain:
        return {
            "pattern_id": str(pattern_id),
            "state": "NO_NETWORK",
        }

    version_id = str(domain.get("network", {}).get("version_id") or "")
    pattern = next(
        (
            p
            for p in domain.get("patterns", [])
            if str(p.get("pattern_id") or "") == str(pattern_id)
        ),
        None,
    )
    if not pattern:
        return {
            "pattern_id": str(pattern_id),
            "state": "PATTERN_NOT_FOUND",
        }

    generation_id = None
    if atomic_generations_enabled():
        bundle = await get_pattern_generation(
            str(pattern_id),
            version_id,
            region_id=region.region_id,
            network_id=region.network_id,
        )
        infra = (bundle or {}).get("infrastructure")
        generation_id = (bundle or {}).get("generation_id")
    else:
        infra = await db.mobility_pattern_infrastructure.find_one(
            {
                "pattern_id": str(pattern_id),
                "version_id": version_id,
                "region_id": region.region_id,
                "network_id": region.network_id,
            },
            {"_id": 0},
        )

    if not infra:
        return {
            "pattern_id": str(pattern_id),
            "state": "INFRASTRUCTURE_NOT_READY",
        }

    return {
        "state": "READY",
        "region_id": region.region_id,
        "network_id": region.network_id,
        "version_id": version_id,
        "pattern_id": str(pattern_id),
        "route_number": pattern.get("route_number"),
        "mode": pattern.get("mode"),
        "direction": pattern.get("direction"),
        "derived_generation": generation_id,
        "osm_snapshot_v": infra.get("osm_snapshot_v"),
        "signal_semantics_enabled": signal_semantics_enabled(),
        "infrastructure_schema_v": infra.get("schema_v"),
        "signal_semantics_schema_v": infra.get(
            "signal_semantics_schema_v"
        ),
        "summary": infra.get("signal_semantics") or {},
        "raw_signals": infra.get("signals") or [],
        "signal_events": infra.get("signal_events") or [],
    }


@router.get("/diagnostic/traffic/{pattern_id}")
async def v2_diagnostic_traffic(
    pattern_id: str,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Traffic profiles for ways used by the active runtime generation."""
    from mobility.generations import (
        atomic_generations_enabled,
        get_pattern_generation,
    )
    from mobility.regions import get_active_region

    region = get_active_region()
    domain = await _domain()
    if not domain:
        return {
            "pattern_id": pattern_id,
            "state": "NO_NETWORK",
            "profiles": [],
        }

    version_id = str(domain.get("network", {}).get("version_id") or "")
    generation_id = None
    if atomic_generations_enabled():
        bundle = await get_pattern_generation(
            str(pattern_id),
            version_id,
            region_id=region.region_id,
            network_id=region.network_id,
        )
        infra = (bundle or {}).get("infrastructure")
        generation_id = (bundle or {}).get("generation_id")
    else:
        infra = await db.mobility_pattern_infrastructure.find_one(
            {
                "pattern_id": str(pattern_id),
                "version_id": version_id,
                "region_id": region.region_id,
                "network_id": region.network_id,
            },
            {"_id": 0},
        )

    if not infra:
        return {
            "pattern_id": pattern_id,
            "state": "INFRASTRUCTURE_NOT_READY",
            "profiles": [],
        }

    way_ids = sorted(
        {
            int(edge.get("way_id"))
            for edge in (infra.get("edges") or [])
            if edge.get("way_id") is not None
        }
    )
    profiles = await db.mobility_traffic_profiles.find(
        {
            "region_id": region.region_id,
            "network_id": region.network_id,
            "way_id": {"$in": way_ids},
        },
        {"_id": 0},
    ).to_list(max(1, len(way_ids) * 3))
    return {
        "pattern_id": pattern_id,
        "region_id": region.region_id,
        "network_id": region.network_id,
        "version_id": version_id,
        "derived_generation": generation_id,
        "osm_snapshot_v": infra.get("osm_snapshot_v"),
        "way_count": len(way_ids),
        "profile_count": len(profiles),
        "profiles": profiles,
    }


@router.get("/diagnostic/geometry-conformance")
async def v2_diagnostic_geometry_conformance(
    current_user: Optional[UserPublic] = Depends(
        get_current_user_optional
    ),
):
    """Audit every rendered line against its atomic OSM edge chain."""
    from mobility.generations import list_pattern_generations
    from mobility.geometry_audit import (
        audit_generation_bundle,
        audit_rendered_geometry,
    )

    domain = await _domain()
    if not domain:
        return {"state": "NO_NETWORK", "patterns": []}

    version_id = str(
        domain.get("network", {}).get("version_id") or ""
    )
    resolved_patterns = await _patterns_resolved(domain)
    bundles = await list_pattern_generations(version_id)
    bundle_by_pid = {
        str(bundle.get("pattern_id") or ""): bundle
        for bundle in bundles
    }

    platforms_by_id = {}
    for stop in domain.get("stops", []):
        for platform in stop.get("platforms", []):
            platforms_by_id[str(platform.get("platform_id"))] = platform

    rows = []
    for pattern in resolved_patterns:
        pid = str(pattern.get("pattern_id") or "")
        bundle = bundle_by_pid.get(pid)
        stop_platforms = [
            platforms_by_id.get(str(stop_id))
            for stop_id in (pattern.get("stop_ids") or [])
            if platforms_by_id.get(str(stop_id))
        ]
        generation_audit = (
            audit_generation_bundle(
                bundle,
                platforms=stop_platforms,
            )
            if bundle
            else {
                "canonical_osm_conformant": False,
                "failures": ["GENERATION_NOT_FOUND"],
            }
        )
        render_audit = audit_rendered_geometry(
            resolved_geometry=pattern.get("geometry") or {},
            bundle=bundle,
        )
        rows.append(
            {
                "pattern_id": pid,
                "route_number": pattern.get("route_number"),
                "mode": pattern.get("mode"),
                "direction": pattern.get("direction"),
                **generation_audit,
                **render_audit,
            }
        )

    rendered = [row for row in rows if row.get("rendered")]
    canonical = [
        row
        for row in rendered
        if row.get("canonical_osm_rendered")
        and row.get("canonical_osm_conformant")
    ]
    manual = [
        row
        for row in rendered
        if row.get("render_authority")
        == "VERIFIED_MANUAL_OVERRIDE"
    ]
    mismatched = [
        row
        for row in rendered
        if row not in canonical and row not in manual
    ]
    hidden = [row for row in rows if not row.get("rendered")]

    return {
        "state": "READY",
        "version_id": version_id,
        "pattern_count": len(rows),
        "rendered_count": len(rendered),
        "canonical_osm_rendered_count": len(canonical),
        "verified_manual_override_count": len(manual),
        "hidden_count": len(hidden),
        "mismatch_count": len(mismatched),
        "all_rendered_lines_have_verified_authority": (
            len(mismatched) == 0
        ),
        "all_rendered_lines_are_canonical_osm": (
            len(rendered) > 0
            and len(canonical) == len(rendered)
        ),
        "patterns": rows,
    }


@router.get("/diagnostic/physical-alignment/{pattern_id}")
async def v2_diagnostic_physical_alignment(
    pattern_id: str,
    current_user: Optional[UserPublic] = Depends(
        get_current_user_optional
    ),
):
    """Aggregate raw GPS + GTFS reference vs canonical OSM generation.

    Raw GPS observations are never returned; only aggregate evidence is
    exposed.
    """
    from mobility.generations import get_pattern_generation
    from mobility.physical_alignment import physical_alignment_report
    from mobility.regions import get_active_region

    region = get_active_region()
    domain = await _domain()
    if not domain:
        return {
            "state": "NO_NETWORK",
            "pattern_id": str(pattern_id),
        }

    version_id = str(
        domain.get("network", {}).get("version_id") or ""
    )
    pattern = next(
        (
            item
            for item in domain.get("patterns", [])
            if str(item.get("pattern_id") or "")
            == str(pattern_id)
        ),
        None,
    )
    if not pattern:
        return {
            "state": "PATTERN_NOT_FOUND",
            "pattern_id": str(pattern_id),
        }

    bundle = await get_pattern_generation(
        str(pattern_id),
        version_id,
        region_id=region.region_id,
        network_id=region.network_id,
    )
    if not bundle:
        return {
            "state": "GENERATION_NOT_FOUND",
            "pattern_id": str(pattern_id),
        }

    generation_id = str(bundle.get("generation_id") or "")
    observations = await db.mobility_position_observations.find(
        {
            "pattern_id": str(pattern_id),
            "generation_id": generation_id,
            "snapped": True,
        },
        {
            "_id": 0,
            "vehicle_id": 1,
            "trip_id": 1,
            "observed_at": 1,
            "latitude": 1,
            "longitude": 1,
            "accuracy_m": 1,
            "heading": 1,
            "snapped_distance_m": 1,
            "matched_bearing": 1,
            "matched_edge_id": 1,
        },
    ).sort("observed_at", -1).to_list(10000)

    # Only a real trip-specific GTFS shape is treated as operator/reference
    # geometry. A legacy inherited route.shape is intentionally excluded.
    operator_points = (
        pattern.get("points") or []
        if pattern.get("shape_id")
        else []
    )

    report = physical_alignment_report(
        pattern_id=str(pattern_id),
        generation_id=generation_id,
        canonical_points=(bundle.get("geometry") or {}).get(
            "points"
        )
        or [],
        operator_points=operator_points,
        observations=observations,
    )
    return {
        "state": "READY",
        "region_id": region.region_id,
        "network_id": region.network_id,
        "version_id": version_id,
        "route_number": pattern.get("route_number"),
        "mode": pattern.get("mode"),
        "direction": pattern.get("direction"),
        "shape_id": pattern.get("shape_id"),
        **report,
    }


@router.get("/diagnostic/generations")
async def v2_diagnostic_generations(
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Active-version atomic-generation readiness and OSM freshness."""
    from mobility.generations import (
        atomic_generations_enabled,
        summarize_generation_version,
    )

    domain = await _domain()
    if not domain:
        return {
            "state": "NO_NETWORK",
            "atomic_generations_enabled": atomic_generations_enabled(),
        }
    version_id = str(domain.get("network", {}).get("version_id") or "")
    summary = await summarize_generation_version(version_id)
    return {
        "atomic_generations_enabled": atomic_generations_enabled(),
        **summary,
    }


@router.get("/diagnostic/motion/summary")
async def v2_diagnostic_motion_summary(
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Current fleet-level Phase-2.1 observability snapshot."""
    from datetime import datetime, timezone

    from mobility.motion.diagnostics import summarize_vehicle_motion
    from mobility.regions import get_active_region
    from routes.mobility import MOTION_ENGINE_ENABLED, _all_active_vehicles, _get_active_network

    region = get_active_region()
    network = await _get_active_network()
    vehicles = await _all_active_vehicles(allow_live_fetch=False)
    summary = summarize_vehicle_motion(vehicles)
    return {
        "region_id": region.region_id,
        "network_id": region.network_id,
        "version_id": (network or {}).get("version_id"),
        "service_date": (network or {}).get("service_date"),
        "motion_enabled": bool(MOTION_ENGINE_ENABLED),
        "observed_at": datetime.now(timezone.utc).isoformat(),
        **summary,
    }


@router.get("/diagnostic/motion/trips/{trip_id}")
async def v2_diagnostic_motion_trip(
    trip_id: str,
    current_user: Optional[UserPublic] = Depends(get_current_user_optional),
):
    """Explain every physical leg of one active-network trip."""
    return await _motion_trip_report(trip_id)


async def _motion_trip_report(trip_id: str, research=False):
    from mobility.motion.explain import explain_trip_plan
    from mobility.regions import get_active_region
    from routes.mobility import (
        _get_active_network,
        _predicted_stop_timeline,
        _realtime_delays_for,
        _trip_path_geometry,
    )

    region = get_active_region()
    network = await _get_active_network()
    if not network:
        return {
            "available": False,
            "trip_id": str(trip_id),
            "fallback_reason": "NO_ACTIVE_NETWORK",
            "legs": [],
        }

    route = None
    trip = None
    for candidate_route in network.get("routes", []):
        candidate_trip = next(
            (
                value
                for value in candidate_route.get("trips", [])
                if str(value.get("trip_id") or "") == str(trip_id)
            ),
            None,
        )
        if candidate_trip:
            route = candidate_route
            trip = candidate_trip
            break

    if route is None or trip is None:
        return {
            "available": False,
            "trip_id": str(trip_id),
            "fallback_reason": "TRIP_NOT_FOUND",
            "legs": [],
        }

    realtime = (await _realtime_delays_for([str(trip_id)])).get(str(trip_id))
    timeline = _predicted_stop_timeline(route, trip, realtime)
    if len(timeline) < 2:
        return {
            "available": False,
            "trip_id": str(trip_id),
            "route_number": route.get("route_number"),
            "fallback_reason": "TIMELINE_NOT_AVAILABLE",
            "legs": [],
        }

    path = await _trip_path_geometry(route, trip, timeline)
    if not path:
        return {
            "available": False,
            "trip_id": str(trip_id),
            "route_number": route.get("route_number"),
            "fallback_reason": "NO_CANONICAL_PATH",
            "legs": [],
        }

    report = await explain_trip_plan(
        trip_id=str(trip_id),
        mode=str(route.get("mode") or "bus"),
        version_id=str(network.get("version_id") or ""),
        timeline=timeline,
        path=path,
        **({'include_research': True} if research else {}),
    )
    return {
        "region_id": region.region_id,
        "network_id": region.network_id,
        "version_id": network.get("version_id"),
        "service_date": network.get("service_date"),
        "route_number": route.get("route_number"),
        "direction": trip.get("headsign"),
        "realtime_source": (realtime or {}).get("source"),
        **report,
    }


def _research_admin(user):
    from fastapi import HTTPException
    if user is None:
        raise HTTPException(401, 'Authentication required')
    if getattr(user, 'is_admin', False) is not True:
        raise HTTPException(403, 'Administrator required')


@router.get('/diagnostic/research/allocation/{trip_id}')
async def v2_research_allocation(trip_id: str, current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    _research_admin(current_user)
    from mobility.motion.time_allocation import enabled
    if not enabled():
        return {'enabled': False, 'reason': 'MOBILITY_TIME_ALLOCATION_ENABLED_FALSE'}
    return await _motion_trip_report(trip_id, research=True)


@router.get('/diagnostic/research/status')
async def v2_research_status(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    _research_admin(current_user)
    from mobility.motion.time_allocation import enabled, shadow_only
    from mobility.motion.native_recalibration import enabled as native_enabled
    return {'time_allocation_enabled': enabled(), 'time_allocation_shadow_only': shadow_only(),
            'native_recalibration_enabled': native_enabled(), 'native_recalibration_shadow_only': True}


@router.get("/traffic")
async def v2_traffic(current_user: Optional[UserPublic] = Depends(get_current_user_optional)):
    """Compatibility endpoint; external traffic observations are not supplied."""
    return {"incidents": [], "closures": [], "updated_at": None}


@router.get("/vehicles")
async def v2_vehicles(current_user: Optional[UserPublic] = Depends(get_current_user_optional),
                       traffic_context: TrafficContext = "baseline"):
    """Canonical vehicle state: position always carries source/quality, and
    every scheduled vehicle has a stable trip_instance_id. Adding a new
    position source later only changes `source` - never the shape."""
    from datetime import datetime

    from routes.mobility import _all_active_vehicles

    domain = await _domain()
    service_date = (domain or {}).get("network", {}).get("service_date")
    vehicles = await _all_active_vehicles(traffic_context=traffic_context)
    now = datetime.now().astimezone()
    out = []
    for v in vehicles:
        source = str(v.get("position_source") or "VEHICLE_GPS")
        estimated = bool(v.get("estimated"))
        quality = "LIVE" if not estimated else ("REALTIME" if source == "REALTIME_ESTIMATE" else "SCHEDULE")
        age_seconds = 0
        try:
            if v.get("updated_at"):
                dt = datetime.fromisoformat(str(v.get("updated_at")))
                if dt.tzinfo is None:
                    from zoneinfo import ZoneInfo

                    dt = dt.replace(tzinfo=ZoneInfo("UTC"))
                age_seconds = max(0, int((now - dt).total_seconds()))
        except Exception:
            age_seconds = 0
        trip_id = v.get("trip_id")
        # Explicit identity: every map icon is either a registered PHYSICAL
        # vehicle (own GPS) or a VIRTUAL representation of an active trip
        # (realtime-constrained or schedule-only). Never ambiguous.
        if not estimated:
            identity_kind = "PHYSICAL"
            registered_vehicle_id = v.get("vehicle_id")
        elif source == "REALTIME_ESTIMATE":
            identity_kind = "VIRTUAL_REALTIME"
            registered_vehicle_id = None
        else:
            identity_kind = "VIRTUAL_SCHEDULE"
            registered_vehicle_id = None
        # Observable position semantics for diagnostics:
        # - estimated vehicles: ON_PATTERN (riding the canonical line) or
        #   STOP_ANCHOR (parked at the next stop, geometry still pending)
        # - live GPS: LIVE_MATCHED (snapped to the canonical pattern) or
        #   LIVE_RAW (kept raw only for taxis).
        pos_state = v.get("position_state")
        geom_pending = bool(v.get("geometry_pending"))
        if pos_state is None:
            if not estimated:
                pos_state = "LIVE_MATCHED" if v.get("snapped") else "LIVE_RAW"
            else:
                pos_state = "ON_PATTERN" if v.get("pattern_id") else "STOP_ANCHOR"
        out.append(
            {
                "vehicle_id": v.get("vehicle_id"),
                "identity_kind": identity_kind,
                "registered_vehicle_id": registered_vehicle_id,
                "mode": v.get("mode"),
                "route": {"number": v.get("route_number"), "direction": v.get("route_direction")},
                "position": {
                    "latitude": v.get("latitude"),
                    "longitude": v.get("longitude"),
                    "heading": v.get("heading"),
                    "source": source,
                    "quality": quality,
                    "accuracy_m": v.get("accuracy_m"),
                    "age_seconds": age_seconds,
                },
                "trip_instance_id": f"{NETWORK_ID}:{service_date}:{trip_id}" if trip_id and service_date else None,
                "trip_id": trip_id,
                "delay_minutes": v.get("delay_minutes") or 0,
                "estimated": estimated,
                "next_stop_id": v.get("next_stop_id"),
                "next_stop_name": v.get("next_stop_name"),
                "distance_to_next_stop_m": v.get("distance_to_next_stop_m"),
                "pattern_id": v.get("pattern_id"),
                "progress_m": v.get("progress_m"),
                "position_state": pos_state,
                "geometry_pending": geom_pending,
                "motion": v.get("motion"),
            }
        )
    return out

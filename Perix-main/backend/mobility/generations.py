"""Atomic per-pattern mobility generations.

A generation is the single source of truth for one pattern/version:
  - validated canonical geometry,
  - exact directed OSM stop-pair segments,
  - derived edge/signal infrastructure.

The whole bundle is stored in one Mongo document. replace_one therefore
promotes geometry + infrastructure atomically without requiring
multi-document transactions.

Legacy geometry/segment/infrastructure collections are dual-written after
the generation is committed. They remain available for rollback while the
atomic-generation runtime is feature-flagged.
"""
import copy
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Iterable, Optional

from database import db
from mobility.regions import get_active_region


GENERATION_SCHEMA_VERSION = 1
GEOMETRY_SCHEMA_VERSION = 3


def atomic_generations_enabled() -> bool:
    return os.getenv("MOBILITY_ATOMIC_GENERATIONS_ENABLED", "false").lower() == "true"


def _sha1(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()


def geometry_fingerprint(points: list) -> str:
    clean = [
        [round(float(p[0]), 6), round(float(p[1]), 6)]
        for p in (points or [])
        if isinstance(p, (list, tuple)) and len(p) >= 2
    ]
    return _sha1(json.dumps(clean, separators=(",", ":"), ensure_ascii=False))


def pattern_fingerprint(pattern: dict) -> str:
    points = pattern.get("points") or []
    payload = {
        "mode": str(pattern.get("mode") or "bus"),
        "route_number": str(pattern.get("route_number") or ""),
        "direction": str(pattern.get("direction") or ""),
        "stop_ids": [str(x) for x in (pattern.get("stop_ids") or [])],
        "shape_id": str(pattern.get("shape_id") or ""),
        # shape_id alone is not enough: operators can update the shape
        # while retaining the same identifier.
        "shape_fingerprint": geometry_fingerprint(points) if points else None,
    }
    return _sha1(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def generation_id_for(
    *,
    version_id: str,
    pattern_id: str,
    pattern_fp: str,
    geometry_fp: str,
    osm_snapshot_v: int,
) -> str:
    raw = "|".join(
        (
            str(version_id),
            str(pattern_id),
            str(pattern_fp),
            str(geometry_fp),
            str(int(osm_snapshot_v)),
        )
    )
    return f"gen_{_sha1(raw)[:18]}"


def generation_matches_path(bundle: Optional[dict], path: Optional[dict]) -> bool:
    if not bundle or not path:
        return False
    generation_id = str(bundle.get("generation_id") or "")
    path_generation = str(path.get("derived_generation") or "")
    return bool(generation_id and generation_id == path_generation)


def readiness_state(
    *,
    expected: int,
    ready: int,
    source_expected: int = 0,
    source_ready: int = 0,
    blocking_missing: Optional[Iterable[str]] = None,
) -> str:
    blocking = [str(x) for x in (blocking_missing or []) if str(x)]
    if blocking:
        return "BLOCKED_CHANGED_PATTERNS"
    if expected > 0 and ready <= 0:
        return "BLOCKED_NO_READY_PATTERNS"
    if source_expected > 0 and source_ready <= 0:
        return "BLOCKED_BASELINE_NOT_READY"
    if source_expected > 0:
        source_ratio = source_ready / max(1, source_expected)
        candidate_ratio = ready / max(1, expected)
        if candidate_ratio + 1e-9 < source_ratio:
            return "BLOCKED_COVERAGE_REGRESSION"
    return "READY"


def _bundle_key(
    *,
    region_id: str,
    network_id: str,
    version_id: str,
    pattern_id: str,
) -> dict:
    return {
        "region_id": str(region_id),
        "network_id": str(network_id),
        "version_id": str(version_id),
        "pattern_id": str(pattern_id),
    }


async def get_pattern_generation(
    pattern_id: str,
    version_id: str,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> Optional[dict]:
    region = get_active_region()
    return await db.mobility_pattern_generations.find_one(
        _bundle_key(
            region_id=str(region_id or region.region_id),
            network_id=str(network_id or region.network_id),
            version_id=str(version_id),
            pattern_id=str(pattern_id),
        ),
        {"_id": 0},
    )


async def list_pattern_generations(
    version_id: str,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> list[dict]:
    region = get_active_region()
    return await db.mobility_pattern_generations.find(
        {
            "region_id": str(region_id or region.region_id),
            "network_id": str(network_id or region.network_id),
            "version_id": str(version_id),
            "ready": True,
        },
        {"_id": 0},
    ).to_list(5000)


async def geometry_inputs_for_version(
    version_id: str,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> dict:
    bundles = await list_pattern_generations(
        version_id,
        region_id=region_id,
        network_id=network_id,
    )
    roads_by_pattern = {}
    rails_by_pattern = {}
    segments_by_pattern = {}
    meta_by_pattern = {}
    for bundle in bundles:
        pid = str(bundle.get("pattern_id") or "")
        geometry = bundle.get("geometry") or {}
        points = geometry.get("points") or []
        if str(bundle.get("mode") or "bus") == "tram":
            rails_by_pattern[pid] = points
        else:
            roads_by_pattern[pid] = points
        segments_by_pattern[pid] = bundle.get("segments") or []
        meta_by_pattern[pid] = {
            "generation_id": bundle.get("generation_id"),
            "osm_snapshot_v": bundle.get("osm_snapshot_v"),
            "geometry_fingerprint": geometry.get("geometry_fingerprint"),
            "source": geometry.get("source"),
        }
    return {
        "roads_by_pattern": roads_by_pattern,
        "rails_by_pattern": rails_by_pattern,
        "segments_by_pattern": segments_by_pattern,
        "meta_by_pattern": meta_by_pattern,
    }


def _platforms_by_id(domain: dict) -> dict:
    out = {}
    for stop in domain.get("stops", []):
        for platform in stop.get("platforms", []):
            pid = str(platform.get("platform_id") or "")
            if pid:
                out[pid] = platform
    return out


def _normalized_segments(
    raw_segments: list[dict],
    *,
    pattern_id: str,
    version_id: str,
    mode: str,
    region_id: str,
    network_id: str,
    osm_snapshot_v: int,
    generation_id: str,
) -> list[dict]:
    out = []
    for segment in raw_segments or []:
        if not segment.get("ok") or not segment.get("points"):
            continue
        a_idx = int(segment.get("a_idx", 0))
        b_idx = int(segment.get("b_idx", a_idx + 1))
        out.append(
            {
                "segment_id": f"{pattern_id}:{a_idx}:{b_idx}",
                "pattern_id": str(pattern_id),
                "version_id": str(version_id),
                "region_id": str(region_id),
                "network_id": str(network_id),
                "mode": str(mode),
                "a_idx": a_idx,
                "b_idx": b_idx,
                "points": [
                    [float(p[0]), float(p[1])]
                    for p in (segment.get("points") or [])
                ],
                "start_node_id": segment.get("start_node_id"),
                "end_node_id": segment.get("end_node_id"),
                "edge_ids": [str(x) for x in (segment.get("edge_ids") or [])],
                "source": "OSM_RAIL" if str(mode) == "tram" else "OSM_ROADS",
                "graph_v": GEOMETRY_SCHEMA_VERSION,
                "osm_snapshot_v": int(osm_snapshot_v),
                "derived_generation": str(generation_id),
            }
        )
    return out


async def _mirror_generation_to_legacy(bundle: dict) -> Optional[str]:
    """Best-effort dual write for feature-flag rollback.

    The atomic runtime never reads these three writes as a transaction.
    The generation document was already committed before this function.
    """
    key = _bundle_key(
        region_id=bundle["region_id"],
        network_id=bundle["network_id"],
        version_id=bundle["version_id"],
        pattern_id=bundle["pattern_id"],
    )
    geometry = bundle.get("geometry") or {}
    segments = copy.deepcopy(bundle.get("segments") or [])
    infrastructure = copy.deepcopy(bundle.get("infrastructure") or {})
    try:
        await db.mobility_road_geometries.replace_one(
            key,
            {
                **key,
                "mode": bundle.get("mode"),
                "points": geometry.get("points") or [],
                "source": geometry.get("source"),
                "graph_v": GEOMETRY_SCHEMA_VERSION,
                "osm_snapshot_v": int(bundle.get("osm_snapshot_v")),
                "derived_generation": bundle.get("generation_id"),
                "created_at": bundle.get("built_at"),
            },
            upsert=True,
        )
        await db.mobility_geometry_segments.delete_many(key)
        if segments:
            await db.mobility_geometry_segments.insert_many(segments)
        if infrastructure:
            infrastructure["derived_generation"] = bundle.get("generation_id")
            await db.mobility_pattern_infrastructure.replace_one(
                key,
                infrastructure,
                upsert=True,
            )
        await db.mobility_pattern_generations.update_one(
            key,
            {
                "$set": {
                    "legacy_mirror_state": "OK",
                    "legacy_mirror_error": None,
                }
            },
        )
        return None
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        await db.mobility_pattern_generations.update_one(
            key,
            {
                "$set": {
                    "legacy_mirror_state": "FAILED",
                    "legacy_mirror_error": message[:500],
                }
            },
        )
        return message


async def build_pattern_generation(
    *,
    network: dict,
    domain: dict,
    pattern: dict,
    reason: str,
    osm_snapshot_v: Optional[int] = None,
) -> dict:
    from mobility.graph import validate_geometry
    from mobility.infrastructure import derive_pattern_infrastructure
    from mobility.osm_store import active_version
    from mobility.roads import compute_pattern_segments

    region = get_active_region()
    region_id = str(network.get("region_id") or region.region_id)
    network_id = str(network.get("network_id") or region.network_id)
    version_id = str(network.get("version_id") or "")
    pattern_id = str(pattern.get("pattern_id") or "")
    mode = str(pattern.get("mode") or "bus")
    pattern_fp = pattern_fingerprint(pattern)

    if not version_id or not pattern_id:
        return {"ok": False, "reason": "MISSING_ID", "pattern_id": pattern_id}

    snapshot = (
        int(osm_snapshot_v)
        if osm_snapshot_v is not None
        else await active_version(region_id)
    )
    if snapshot is None:
        return {"ok": False, "reason": "NO_OSM_SNAPSHOT", "pattern_id": pattern_id}

    platforms = _platforms_by_id(domain)
    coords = []
    missing_platforms = []
    for stop_id in pattern.get("stop_ids") or []:
        platform = platforms.get(str(stop_id))
        if (
            not platform
            or platform.get("latitude") is None
            or platform.get("longitude") is None
        ):
            missing_platforms.append(str(stop_id))
            continue
        coords.append(
            {
                "latitude": float(platform["latitude"]),
                "longitude": float(platform["longitude"]),
            }
        )
    if missing_platforms or len(coords) < 2:
        return {
            "ok": False,
            "reason": "MISSING_PLATFORM_COORDINATES",
            "pattern_id": pattern_id,
            "missing_platforms": missing_platforms,
        }

    shape_hint = (
        pattern.get("points")
        if pattern.get("points") and len(pattern.get("points") or []) >= 2
        else None
    )
    routed = await compute_pattern_segments(
        coords,
        mode,
        shape_hint,
        osm_snapshot_v=int(snapshot),
    )
    missing_pairs = routed.get("missing_pairs") or []
    points = routed.get("full") or []
    if missing_pairs or len(points) < 2:
        return {
            "ok": False,
            "reason": "GEOMETRY_INCOMPLETE",
            "pattern_id": pattern_id,
            "missing_pairs": missing_pairs,
            "resolved_pairs": len(
                [s for s in (routed.get("segments") or []) if s.get("ok")]
            ),
        }

    validation = validate_geometry(points, coords)
    if not validation.get("valid"):
        return {
            "ok": False,
            "reason": "GEOMETRY_VALIDATION_FAILED",
            "pattern_id": pattern_id,
            "validation": validation,
        }

    geometry_fp = geometry_fingerprint(points)
    generation_id = generation_id_for(
        version_id=version_id,
        pattern_id=pattern_id,
        pattern_fp=pattern_fp,
        geometry_fp=geometry_fp,
        osm_snapshot_v=int(snapshot),
    )
    segments = _normalized_segments(
        routed.get("segments") or [],
        pattern_id=pattern_id,
        version_id=version_id,
        mode=mode,
        region_id=region_id,
        network_id=network_id,
        osm_snapshot_v=int(snapshot),
        generation_id=generation_id,
    )
    expected_pairs = max(0, len(pattern.get("stop_ids") or []) - 1)
    if len(segments) != expected_pairs:
        return {
            "ok": False,
            "reason": "SEGMENT_COUNT_MISMATCH",
            "pattern_id": pattern_id,
            "expected_pairs": expected_pairs,
            "segments": len(segments),
        }

    infrastructure = await derive_pattern_infrastructure(
        pattern_id,
        version_id,
        mode,
        segments=segments,
        region_id=region_id,
        network_id=network_id,
        osm_snapshot_v=int(snapshot),
    )
    if not infrastructure:
        return {
            "ok": False,
            "reason": "INFRASTRUCTURE_BUILD_FAILED",
            "pattern_id": pattern_id,
        }
    infrastructure["derived_generation"] = generation_id

    built_at = datetime.now(timezone.utc).isoformat()
    bundle = {
        **_bundle_key(
            region_id=region_id,
            network_id=network_id,
            version_id=version_id,
            pattern_id=pattern_id,
        ),
        "schema_v": GENERATION_SCHEMA_VERSION,
        "ready": True,
        "mode": mode,
        "route_number": str(pattern.get("route_number") or ""),
        "direction": str(pattern.get("direction") or ""),
        "pattern_fingerprint": pattern_fp,
        "generation_id": generation_id,
        "osm_snapshot_v": int(snapshot),
        "geometry": {
            "points": [[float(p[0]), float(p[1])] for p in points],
            "source": "OSM_RAIL" if mode == "tram" else "OSM_ROADS",
            "graph_v": GEOMETRY_SCHEMA_VERSION,
            "geometry_fingerprint": geometry_fp,
            "validation": validation,
            "total_m": infrastructure.get("total_m"),
        },
        "segments": segments,
        "infrastructure": infrastructure,
        "build_reason": str(reason or "UNSPECIFIED"),
        "reused_from_version_id": None,
        "reused_from_generation_id": None,
        "built_at": built_at,
        "legacy_mirror_state": "PENDING",
        "legacy_mirror_error": None,
    }

    # Atomic source-of-truth promotion. Until this single replace succeeds,
    # the prior generation for this pattern/version stays untouched.
    await db.mobility_pattern_generations.replace_one(
        _bundle_key(
            region_id=region_id,
            network_id=network_id,
            version_id=version_id,
            pattern_id=pattern_id,
        ),
        bundle,
        upsert=True,
    )
    mirror_error = await _mirror_generation_to_legacy(bundle)
    return {
        "ok": True,
        "pattern_id": pattern_id,
        "generation_id": generation_id,
        "osm_snapshot_v": int(snapshot),
        "mirror_error": mirror_error,
        "bundle": bundle,
    }


async def copy_generation_to_version(
    source: dict,
    *,
    target_network: dict,
    target_pattern: dict,
    reason: str = "NETWORK_REUSE",
) -> dict:
    target_fp = pattern_fingerprint(target_pattern)
    if str(source.get("pattern_fingerprint") or "") != target_fp:
        return {
            "ok": False,
            "reason": "PATTERN_FINGERPRINT_MISMATCH",
            "pattern_id": str(target_pattern.get("pattern_id") or ""),
        }

    region = get_active_region()
    region_id = str(target_network.get("region_id") or region.region_id)
    network_id = str(target_network.get("network_id") or region.network_id)
    version_id = str(target_network.get("version_id") or "")
    pattern_id = str(target_pattern.get("pattern_id") or "")
    cloned = copy.deepcopy(source)

    geometry = cloned.get("geometry") or {}
    generation_id = generation_id_for(
        version_id=version_id,
        pattern_id=pattern_id,
        pattern_fp=target_fp,
        geometry_fp=str(geometry.get("geometry_fingerprint") or ""),
        osm_snapshot_v=int(cloned.get("osm_snapshot_v")),
    )

    cloned.update(
        {
            **_bundle_key(
                region_id=region_id,
                network_id=network_id,
                version_id=version_id,
                pattern_id=pattern_id,
            ),
            "route_number": str(target_pattern.get("route_number") or ""),
            "direction": str(target_pattern.get("direction") or ""),
            "pattern_fingerprint": target_fp,
            "generation_id": generation_id,
            "build_reason": str(reason),
            "reused_from_version_id": source.get("version_id"),
            "reused_from_generation_id": source.get("generation_id"),
            "built_at": datetime.now(timezone.utc).isoformat(),
            "legacy_mirror_state": "PENDING",
            "legacy_mirror_error": None,
        }
    )
    for segment in cloned.get("segments") or []:
        segment.update(
            {
                "version_id": version_id,
                "region_id": region_id,
                "network_id": network_id,
                "pattern_id": pattern_id,
                "derived_generation": generation_id,
            }
        )
    infrastructure = cloned.get("infrastructure") or {}
    infrastructure.update(
        {
            "version_id": version_id,
            "region_id": region_id,
            "network_id": network_id,
            "pattern_id": pattern_id,
            "derived_generation": generation_id,
        }
    )

    await db.mobility_pattern_generations.replace_one(
        _bundle_key(
            region_id=region_id,
            network_id=network_id,
            version_id=version_id,
            pattern_id=pattern_id,
        ),
        cloned,
        upsert=True,
    )
    mirror_error = await _mirror_generation_to_legacy(cloned)
    return {
        "ok": True,
        "pattern_id": pattern_id,
        "generation_id": generation_id,
        "reused": True,
        "mirror_error": mirror_error,
        "bundle": cloned,
    }


async def summarize_generation_version(
    version_id: str,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> dict:
    from mobility.domain import build_domain
    from mobility.osm_store import active_version

    region = get_active_region()
    resolved_region = str(region_id or region.region_id)
    resolved_network = str(network_id or region.network_id)
    network = await db.bus_network_versions.find_one(
        {
            "version_id": str(version_id),
            "region_id": resolved_region,
            "network_id": resolved_network,
        },
        {"_id": 0},
    )
    if not network:
        return {
            "version_id": str(version_id),
            "state": "NETWORK_NOT_FOUND",
            "expected": 0,
            "ready": 0,
            "missing": [],
        }

    domain = build_domain(network, resolved_network)
    pattern_ids = {
        str(p.get("pattern_id") or "")
        for p in domain.get("patterns", [])
        if p.get("pattern_id")
    }
    bundles = await list_pattern_generations(
        str(version_id),
        region_id=resolved_region,
        network_id=resolved_network,
    )
    by_pid = {str(x.get("pattern_id")): x for x in bundles}
    snapshot = await active_version(resolved_region)
    stale = []
    signal_count = 0
    motion_signal_count = 0
    for pid, bundle in by_pid.items():
        if snapshot is not None and int(bundle.get("osm_snapshot_v") or -1) != int(snapshot):
            stale.append(pid)
        infra = bundle.get("infrastructure") or {}
        signal_count += int(infra.get("signal_count") or 0)
        motion_signal_count += int(infra.get("motion_signal_count") or 0)
    ready_ids = pattern_ids & set(by_pid)
    missing = sorted(pattern_ids - ready_ids)
    expected = len(pattern_ids)
    ready = len(ready_ids)
    return {
        "version_id": str(version_id),
        "state": network.get("generation_state") or "UNPREPARED",
        "expected": expected,
        "ready": ready,
        "ready_ratio": round(ready / max(1, expected), 4),
        "current_osm_snapshot_v": int(snapshot) if snapshot is not None else None,
        "current_snapshot_ready": ready - len(stale),
        "stale_count": len(stale),
        "stale_patterns": sorted(stale),
        "missing_count": len(missing),
        "missing": missing,
        "signal_count": signal_count,
        "motion_signal_count": motion_signal_count,
        "legacy_mirror_failed": sum(
            1 for x in bundles if x.get("legacy_mirror_state") == "FAILED"
        ),
    }


async def prepare_network_version(
    version_id: str,
    *,
    source_version_id: Optional[str] = None,
    reason: str = "WARM_NETWORK_PREPARE",
) -> dict:
    """Prepare an INACTIVE network without touching the active one.

    Unchanged patterns copy the last-known-good generation. Changed/new
    patterns are rebuilt against the currently active OSM snapshot.
    """
    from mobility.domain import build_domain

    region = get_active_region()
    candidate = await db.bus_network_versions.find_one(
        {
            "version_id": str(version_id),
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {"_id": 0},
    )
    if not candidate:
        return {"state": "NETWORK_NOT_FOUND", "version_id": str(version_id)}

    source = None
    if source_version_id:
        source = await db.bus_network_versions.find_one(
            {
                "version_id": str(source_version_id),
                "region_id": region.region_id,
                "network_id": region.network_id,
            },
            {"_id": 0},
        )
    if source is None:
        source = await db.bus_network_versions.find_one(
            {
                "region_id": region.region_id,
                "network_id": region.network_id,
                "active": True,
                "version_id": {"$ne": str(version_id)},
            },
            {"_id": 0},
        )

    candidate_domain = build_domain(candidate, region.network_id)
    source_domain = build_domain(source, region.network_id) if source else {"patterns": []}
    source_bundles = (
        await list_pattern_generations(
            str(source.get("version_id")),
            region_id=region.region_id,
            network_id=region.network_id,
        )
        if source
        else []
    )
    source_by_fp = {
        str(bundle.get("pattern_fingerprint") or ""): bundle
        for bundle in source_bundles
        if bundle.get("pattern_fingerprint")
    }
    source_pattern_fps = {
        pattern_fingerprint(pattern)
        for pattern in source_domain.get("patterns", [])
    }

    reused = []
    rebuilt = []
    baseline_missing = []
    blocking_missing = []
    failures = {}

    for pattern in candidate_domain.get("patterns", []):
        pid = str(pattern.get("pattern_id") or "")
        fp = pattern_fingerprint(pattern)
        source_bundle = source_by_fp.get(fp)
        if source_bundle:
            result = await copy_generation_to_version(
                source_bundle,
                target_network=candidate,
                target_pattern=pattern,
                reason="NETWORK_REUSE",
            )
            if result.get("ok"):
                reused.append(pid)
                continue

        result = await build_pattern_generation(
            network=candidate,
            domain=candidate_domain,
            pattern=pattern,
            reason=reason,
        )
        if result.get("ok"):
            rebuilt.append(pid)
            continue

        failures[pid] = {
            k: v
            for k, v in result.items()
            if k not in {"bundle"}
        }
        if fp in source_pattern_fps:
            baseline_missing.append(pid)
        else:
            blocking_missing.append(pid)

    summary = await summarize_generation_version(
        str(version_id),
        region_id=region.region_id,
        network_id=region.network_id,
    )
    if source:
        source_summary = await summarize_generation_version(
            str(source.get("version_id")),
            region_id=region.region_id,
            network_id=region.network_id,
        )
    else:
        source_summary = {
            "expected": 0,
            "ready": 0,
            "ready_ratio": 0.0,
        }

    state = readiness_state(
        expected=int(summary.get("expected") or 0),
        ready=int(summary.get("ready") or 0),
        source_expected=int(source_summary.get("expected") or 0),
        source_ready=int(source_summary.get("ready") or 0),
        blocking_missing=blocking_missing,
    )
    report = {
        **summary,
        "state": state,
        "source_version_id": source.get("version_id") if source else None,
        "source_expected": source_summary.get("expected"),
        "source_ready": source_summary.get("ready"),
        "source_ready_ratio": source_summary.get("ready_ratio"),
        "reused": len(reused),
        "rebuilt": len(rebuilt),
        "reused_patterns": sorted(reused),
        "rebuilt_patterns": sorted(rebuilt),
        "baseline_missing": sorted(baseline_missing),
        "blocking_missing": sorted(blocking_missing),
        "failures": failures,
        "prepared_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bus_network_versions.update_one(
        {
            "version_id": str(version_id),
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {
            "$set": {
                "generation_state": state,
                "generation_report": report,
            }
        },
    )
    return report


async def refresh_network_version(
    version_id: str,
    *,
    only_patterns: Optional[set[str]] = None,
    reason: str = "PERIODIC_REFRESH",
) -> dict:
    """Refresh one already-active version pattern-by-pattern.

    Failed candidate builds NEVER delete the last-known-good generation.
    """
    from mobility.domain import build_domain
    from mobility.osm_store import active_version

    region = get_active_region()
    network = await db.bus_network_versions.find_one(
        {
            "version_id": str(version_id),
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {"_id": 0},
    )
    if not network:
        return {"state": "NETWORK_NOT_FOUND", "version_id": str(version_id)}

    domain = build_domain(network, region.network_id)
    snapshot = await active_version(region.region_id)
    if snapshot is None:
        return {"state": "NO_OSM_SNAPSHOT", "version_id": str(version_id)}

    current = {
        str(x.get("pattern_id")): x
        for x in await list_pattern_generations(
            str(version_id),
            region_id=region.region_id,
            network_id=region.network_id,
        )
    }
    refreshed = []
    retained = []
    skipped = []
    failed = {}

    for pattern in domain.get("patterns", []):
        pid = str(pattern.get("pattern_id") or "")
        if only_patterns is not None and pid not in only_patterns:
            continue
        existing = current.get(pid)
        fp = pattern_fingerprint(pattern)
        if (
            existing
            and existing.get("ready")
            and str(existing.get("pattern_fingerprint") or "") == fp
            and int(existing.get("osm_snapshot_v") or -1) == int(snapshot)
        ):
            skipped.append(pid)
            continue

        result = await build_pattern_generation(
            network=network,
            domain=domain,
            pattern=pattern,
            reason=reason,
            osm_snapshot_v=int(snapshot),
        )
        if result.get("ok"):
            refreshed.append(pid)
        elif existing and existing.get("ready"):
            retained.append(pid)
            failed[pid] = {
                k: v for k, v in result.items() if k != "bundle"
            }
        else:
            failed[pid] = {
                k: v for k, v in result.items() if k != "bundle"
            }

    summary = await summarize_generation_version(
        str(version_id),
        region_id=region.region_id,
        network_id=region.network_id,
    )
    state = "ACTIVE_READY" if int(summary.get("ready") or 0) > 0 else "ACTIVE_EMPTY"
    report = {
        **summary,
        "state": state,
        "refreshed": len(refreshed),
        "retained_last_good": len(retained),
        "skipped_current": len(skipped),
        "refreshed_patterns": sorted(refreshed),
        "retained_patterns": sorted(retained),
        "failures": failed,
        "refresh_reason": str(reason),
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bus_network_versions.update_one(
        {
            "version_id": str(version_id),
            "region_id": region.region_id,
            "network_id": region.network_id,
        },
        {
            "$set": {
                "generation_state": state,
                "generation_report": report,
            }
        },
    )
    return report

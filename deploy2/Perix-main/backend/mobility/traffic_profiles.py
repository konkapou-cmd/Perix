"""Build static road traffic profiles from normalized city traffic counts.

The first profile model is intentionally transparent and replaceable. It uses
count-derived volume/capacity plus a BPR-style volume-delay curve to estimate a
road speed. Signals are NOT folded into this speed; signal delay remains a
separate future motion-engine component.

The model is marked UNCALIBRATED until its parameters are fitted against Perix
scheduled/realtime transit observations.
"""
import hashlib
from datetime import datetime, timezone
from typing import Optional

from database import db
from mobility.osm_store import active_version, get_local_ways_by_ids
from mobility.regions import get_active_region, get_region

PROFILE_SCHEMA_VERSION = 1
MODEL_NAME = "BPR_V1_UNCALIBRATED"
BPR_ALPHA = 0.15
BPR_BETA = 4.0
MIN_SPEED_KMH = 5.0

DEFAULT_SPEED_KMH = {
    "motorway": 80.0,
    "trunk": 70.0,
    "primary": 50.0,
    "secondary": 50.0,
    "tertiary": 45.0,
    "unclassified": 40.0,
    "residential": 30.0,
    "service": 20.0,
    "living_street": 10.0,
}

LANE_CAPACITY_VPH = {
    "motorway": 1800.0,
    "trunk": 1600.0,
    "primary": 1200.0,
    "secondary": 1100.0,
    "tertiary": 1000.0,
    "unclassified": 900.0,
    "residential": 750.0,
    "service": 600.0,
    "living_street": 400.0,
}


def _int_tag(value) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return max(1, int(float(str(value).split(";", 1)[0].strip())))
    except Exception:
        return None


def _maxspeed_kmh(value) -> Optional[float]:
    if value in (None, ""):
        return None
    text = str(value).strip().lower()
    try:
        if "mph" in text:
            return float(text.replace("mph", "").strip()) * 1.609344
        return float(text.split(" ", 1)[0])
    except Exception:
        return None


def _day_type(date_text: str) -> str:
    weekday = datetime.strptime(date_text, "%Y-%m-%d").weekday()
    if weekday == 5:
        return "SATURDAY"
    if weekday == 6:
        return "SUNDAY"
    return "WEEKDAY"


def _minutes(hhmm: str) -> int:
    h, m = str(hhmm).split(":", 1)
    return int(h) * 60 + int(m)


def _interval_minutes(start: str, end: str) -> int:
    a, b = _minutes(start), _minutes(end)
    if b <= a:
        b += 24 * 60
    return max(1, b - a)


def _directional_lanes(tags: dict, osm_direction: str) -> int:
    if osm_direction == "FORWARD":
        lanes = _int_tag(tags.get("lanes:forward"))
        if lanes:
            return lanes
    if osm_direction == "BACKWARD":
        lanes = _int_tag(tags.get("lanes:backward"))
        if lanes:
            return lanes

    total = _int_tag(tags.get("lanes")) or 2
    oneway = str(tags.get("oneway") or "").lower() in {"yes", "1", "-1", "reverse"}
    if oneway:
        return total
    return max(1, int(round(total / 2.0)))


def _road_baseline(way: dict, osm_direction: str) -> dict:
    tags = way.get("tags") or {}
    highway = str(tags.get("highway") or "unclassified")
    free_speed = _maxspeed_kmh(tags.get("maxspeed")) or DEFAULT_SPEED_KMH.get(highway, 40.0)
    lanes = _directional_lanes(tags, osm_direction)
    capacity_per_lane = LANE_CAPACITY_VPH.get(highway, 900.0)
    capacity_vph = max(1.0, lanes * capacity_per_lane)
    return {
        "highway": highway,
        "free_speed_kmh": round(float(free_speed), 2),
        "directional_lanes": int(lanes),
        "capacity_per_lane_vph": round(float(capacity_per_lane), 2),
        "capacity_vph": round(float(capacity_vph), 2),
    }


def _speed_from_volume(free_speed_kmh: float, flow_vph: float, capacity_vph: float) -> tuple:
    vc_ratio = max(0.0, flow_vph / max(1.0, capacity_vph))
    multiplier = 1.0 + BPR_ALPHA * (vc_ratio ** BPR_BETA)
    speed = max(MIN_SPEED_KMH, free_speed_kmh / multiplier)
    return vc_ratio, speed


def _profile_version(records: list) -> str:
    keys = sorted(str(r.get("count_record_id") or "") for r in records)
    digest = hashlib.sha1("|".join(keys).encode("utf-8")).hexdigest()[:12]
    return f"traffic-v{PROFILE_SCHEMA_VERSION}:{digest}"


async def rebuild_traffic_profiles(
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> dict:
    """Rebuild way/direction profiles for one region/network."""
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    osm_snapshot_v = await active_version(region.region_id)
    if osm_snapshot_v is None:
        return {
            "ok": False,
            "region_id": region.region_id,
            "network_id": resolved_network_id,
            "reason": "NO_OSM_SNAPSHOT",
            "profiles": 0,
        }

    records = await db.mobility_traffic_counts.find(
        {"region_id": region.region_id, "network_id": resolved_network_id},
        {"_id": 0},
    ).to_list(100000)
    records = [r for r in records if r.get("matched_way_id") is not None]
    if not records:
        return {
            "ok": True,
            "region_id": region.region_id,
            "network_id": resolved_network_id,
            "profiles": 0,
            "profile_version": None,
        }

    # Use the newest measurement date independently for each way + OSM
    # direction. Older measurements stay in mobility_traffic_counts for
    # diagnostics/history but do not dilute the current profile.
    grouped = {}
    for record in records:
        way_id = int(record.get("matched_way_id"))
        osm_direction = str(record.get("osm_direction") or "BOTH").upper()
        if osm_direction not in {"FORWARD", "BACKWARD", "BOTH"}:
            osm_direction = "BOTH"
        key = (way_id, osm_direction)
        grouped.setdefault(key, []).append(record)

    all_way_ids = sorted({way_id for way_id, _ in grouped})
    ways = await get_local_ways_by_ids(
        all_way_ids,
        "bus",
        region_id=region.region_id,
        graph_v=int(osm_snapshot_v),
    )
    ways_by_id = {int(w.get("id") or 0): w for w in ways}

    profile_version = _profile_version(records)
    written = 0

    for (way_id, osm_direction), rows in grouped.items():
        way = ways_by_id.get(way_id)
        if not way:
            continue
        newest_date = max(str(r.get("measurement_date") or "") for r in rows)
        rows = [r for r in rows if str(r.get("measurement_date") or "") == newest_date]
        baseline = _road_baseline(way, osm_direction)

        buckets = {}
        # Multiple records may describe the same way/time from distinct count
        # sites. Use the maximum directional flow instead of summing sites and
        # accidentally double-counting the same corridor.
        for row in rows:
            start = str(row.get("interval_start"))
            end = str(row.get("interval_end"))
            duration = _interval_minutes(start, end)
            flow_vph = float(row.get("total") or 0) * 60.0 / duration
            day_type = _day_type(str(row.get("measurement_date")))
            bucket_key = f"{day_type}|{start}-{end}"
            current = buckets.get(bucket_key)
            if current and float(current.get("flow_vph") or 0) >= flow_vph:
                continue

            vc_ratio, speed = _speed_from_volume(
                float(baseline["free_speed_kmh"]),
                flow_vph,
                float(baseline["capacity_vph"]),
            )
            buckets[bucket_key] = {
                "day_type": day_type,
                "interval_start": start,
                "interval_end": end,
                "flow_vph": round(flow_vph, 2),
                "vc_ratio": round(vc_ratio, 4),
                "expected_speed_kmh": round(speed, 2),
                "source_count_record_id": row.get("count_record_id"),
                "measurement_date": row.get("measurement_date"),
            }

        doc = {
            "profile_key": f"{region.region_id}:{resolved_network_id}:{way_id}:{osm_direction}",
            "region_id": region.region_id,
            "network_id": resolved_network_id,
            "schema_v": PROFILE_SCHEMA_VERSION,
            "profile_version": profile_version,
            "model": MODEL_NAME,
            "calibrated": False,
            "osm_snapshot_v": int(osm_snapshot_v),
            "way_id": way_id,
            "osm_direction": osm_direction,
            "road_name": way.get("name") or (way.get("tags") or {}).get("name"),
            "baseline": baseline,
            "buckets": buckets,
            "built_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.mobility_traffic_profiles.replace_one(
            {
                "profile_key": doc["profile_key"],
                "region_id": region.region_id,
                "network_id": resolved_network_id,
            },
            doc,
            upsert=True,
        )
        written += 1

    await db.mobility_traffic_profiles.delete_many(
        {
            "region_id": region.region_id,
            "network_id": resolved_network_id,
            "profile_version": {"$ne": profile_version},
        }
    )
    return {
        "ok": True,
        "region_id": region.region_id,
        "network_id": resolved_network_id,
        "profiles": written,
        "profile_version": profile_version,
        "model": MODEL_NAME,
    }


def _time_in_bucket(now_minutes: int, start: str, end: str) -> bool:
    a, b = _minutes(start), _minutes(end)
    value = now_minutes
    if b <= a:
        b += 24 * 60
        if value < a:
            value += 24 * 60
    return a <= value < b


async def traffic_for_edges(
    edges: list[dict],
    when: datetime,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> dict:
    """Batch traffic lookup keyed by canonical edge_id.

    Hot-path motion code must never issue one Mongo query per road edge.
    """
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    way_ids = sorted(
        {
            int(edge.get("way_id"))
            for edge in (edges or [])
            if edge.get("way_id") is not None
        }
    )
    if not way_ids:
        return {}

    profiles = await db.mobility_traffic_profiles.find(
        {
            "region_id": region.region_id,
            "network_id": resolved_network_id,
            "way_id": {"$in": way_ids},
        },
        {"_id": 0},
    ).to_list(max(1, len(way_ids) * 3))

    by_way = {}
    for profile in profiles:
        by_way.setdefault(int(profile.get("way_id")), []).append(profile)

    day_type = "WEEKDAY"
    if when.weekday() == 5:
        day_type = "SATURDAY"
    elif when.weekday() == 6:
        day_type = "SUNDAY"
    now_minutes = when.hour * 60 + when.minute

    out = {}
    for edge in edges or []:
        edge_id = str(edge.get("edge_id") or "")
        way_id = edge.get("way_id")
        if not edge_id or way_id is None:
            continue

        follows = (edge.get("way") or {}).get("follows_osm_way")
        if follows is True:
            preferred_direction = "FORWARD"
        elif follows is False:
            preferred_direction = "BACKWARD"
        else:
            preferred_direction = "BOTH"

        candidates = list(by_way.get(int(way_id)) or [])
        candidates.sort(
            key=lambda p: 0 if p.get("osm_direction") == preferred_direction else 1
        )
        for profile in candidates:
            if profile.get("osm_direction") not in {preferred_direction, "BOTH"}:
                continue
            for bucket in (profile.get("buckets") or {}).values():
                if bucket.get("day_type") != day_type:
                    continue
                if not _time_in_bucket(
                    now_minutes,
                    bucket.get("interval_start"),
                    bucket.get("interval_end"),
                ):
                    continue
                out[edge_id] = {
                    **bucket,
                    "profile_key": profile.get("profile_key"),
                    "profile_version": profile.get("profile_version"),
                    "model": profile.get("model"),
                    "calibrated": bool(profile.get("calibrated")),
                    "baseline": profile.get("baseline"),
                }
                break
            if edge_id in out:
                break
    return out


async def traffic_for_way(
    way_id: int,
    when: datetime,
    *,
    follows_osm_way: Optional[bool] = None,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> Optional[dict]:
    """Return the best static traffic bucket for one directed route edge."""
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)

    if follows_osm_way is True:
        preferred_direction = "FORWARD"
    elif follows_osm_way is False:
        preferred_direction = "BACKWARD"
    else:
        preferred_direction = "BOTH"

    profiles = await db.mobility_traffic_profiles.find(
        {
            "region_id": region.region_id,
            "network_id": resolved_network_id,
            "way_id": int(way_id),
            "osm_direction": {"$in": [preferred_direction, "BOTH"]},
        },
        {"_id": 0},
    ).to_list(4)
    if not profiles:
        return None

    day_type = "WEEKDAY"
    if when.weekday() == 5:
        day_type = "SATURDAY"
    elif when.weekday() == 6:
        day_type = "SUNDAY"
    now_minutes = when.hour * 60 + when.minute

    profiles.sort(key=lambda p: 0 if p.get("osm_direction") == preferred_direction else 1)
    for profile in profiles:
        for bucket in (profile.get("buckets") or {}).values():
            if bucket.get("day_type") != day_type:
                continue
            if _time_in_bucket(now_minutes, bucket.get("interval_start"), bucket.get("interval_end")):
                return {
                    **bucket,
                    "profile_key": profile.get("profile_key"),
                    "profile_version": profile.get("profile_version"),
                    "model": profile.get("model"),
                    "calibrated": bool(profile.get("calibrated")),
                    "baseline": profile.get("baseline"),
                }
    return None

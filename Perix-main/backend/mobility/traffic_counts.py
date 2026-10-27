"""Canonical storage and OSM matching for city traffic counts.

Official city documents are acquisition inputs, never runtime inputs. Importers
must normalize each measurement interval into this module's record shape. When
a normalized record has latitude/longitude, it can be matched to the active
local OSM road snapshot; unmatched records remain stored for manual review.
"""
import hashlib
import math
import re
from datetime import datetime, timezone
from typing import Iterable, Optional

from database import db
from mobility.osm_store import active_version, get_local_ways
from mobility.regions import get_active_region, get_region

COUNT_SCHEMA_VERSION = 1
DEFAULT_MATCH_RADIUS_DEG = 0.0012
DEFAULT_MATCH_MAX_M = 40.0


def _int_or_zero(value) -> int:
    try:
        return max(0, int(float(str(value).strip() or "0")))
    except Exception:
        return 0


def _float_or_none(value) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except Exception:
        return None


def _int_or_none(value) -> Optional[int]:
    if value in (None, ""):
        return None
    try:
        return int(float(str(value).strip()))
    except Exception:
        return None


def _hhmm(value: str) -> str:
    text = str(value or "").strip()
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", text):
        raise ValueError(f"invalid HH:MM value: {value!r}")
    return text


def _iso_date(value: str) -> str:
    text = str(value or "").strip()
    datetime.strptime(text, "%Y-%m-%d")
    return text


def normalize_road_name(value: str) -> str:
    text = str(value or "").strip().casefold().replace("ß", "ss")
    text = text.replace("straße", "strasse").replace("str.", "strasse")
    text = re.sub(r"[^a-z0-9äöü]+", " ", text)
    return " ".join(text.split())


def normalize_count_row(
    row: dict,
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
) -> dict:
    """Validate one normalized CSV/dict row and return its Mongo shape."""
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    count_site_id = str(row.get("count_site_id") or "").strip()
    road_name = str(row.get("road_name") or "").strip()
    approach_key = str(row.get("approach_key") or "").strip().upper()
    if not count_site_id:
        raise ValueError("count_site_id is required")
    if not road_name:
        raise ValueError("road_name is required")
    if not approach_key:
        raise ValueError("approach_key is required")

    measurement_date = _iso_date(row.get("measurement_date"))
    interval_start = _hhmm(row.get("interval_start"))
    interval_end = _hhmm(row.get("interval_end"))
    total = _int_or_zero(row.get("total"))

    source = str(row.get("source") or f"CITY_TRAFFIC_COUNTS:{region.region_id}").strip()
    method = str(row.get("method") or "UNKNOWN").strip().upper()
    if method not in {"AUTOMATIC", "MANUAL", "UNKNOWN"}:
        raise ValueError(f"invalid method: {method}")

    osm_direction = str(row.get("osm_direction") or "BOTH").strip().upper()
    if osm_direction not in {"FORWARD", "BACKWARD", "BOTH"}:
        raise ValueError(f"invalid osm_direction: {osm_direction}")

    key_text = "|".join(
        [region.region_id, resolved_network_id, source, count_site_id, measurement_date, interval_start, interval_end, approach_key]
    )
    record_id = hashlib.sha1(key_text.encode("utf-8")).hexdigest()

    return {
        "count_record_id": record_id,
        "schema_v": COUNT_SCHEMA_VERSION,
        "region_id": region.region_id,
        "network_id": resolved_network_id,
        "source": source,
        "source_document": str(row.get("source_document") or "").strip() or None,
        "source_url": str(row.get("source_url") or "").strip() or None,
        "source_page": _int_or_none(row.get("source_page")),
        "method": method,
        "count_site_id": count_site_id,
        "measurement_date": measurement_date,
        "source_year": int(measurement_date[:4]),
        "interval_start": interval_start,
        "interval_end": interval_end,
        "road_name": road_name,
        "road_name_normalized": normalize_road_name(road_name),
        "cross_street": str(row.get("cross_street") or "").strip() or None,
        "approach_key": approach_key,
        "direction": str(row.get("direction") or "").strip().upper() or None,
        "osm_direction": osm_direction,
        "cars": _int_or_zero(row.get("cars")),
        "buses": _int_or_zero(row.get("buses")),
        "trucks": _int_or_zero(row.get("trucks")),
        "motorcycles": _int_or_zero(row.get("motorcycles")),
        "total": total,
        "latitude": _float_or_none(row.get("latitude")),
        "longitude": _float_or_none(row.get("longitude")),
        "matched_way_id": _int_or_none(row.get("matched_way_id")),
        "match_method": str(row.get("match_method") or "").strip() or None,
        "match_confidence": _float_or_none(row.get("match_confidence")),
    }


def _point_segment_distance_m(lat, lng, a, b) -> float:
    mean_lat = math.radians((lat + float(a[0]) + float(b[0])) / 3.0)
    x_scale = 111320.0 * math.cos(mean_lat)
    y_scale = 110540.0
    ax = (float(a[1]) - lng) * x_scale
    ay = (float(a[0]) - lat) * y_scale
    bx = (float(b[1]) - lng) * x_scale
    by = (float(b[0]) - lat) * y_scale
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / denom))
    px, py = ax + t * dx, ay + t * dy
    return math.sqrt(px * px + py * py)


def _point_polyline_distance_m(lat: float, lng: float, points: list) -> float:
    best = float("inf")
    for i in range(len(points) - 1):
        best = min(best, _point_segment_distance_m(lat, lng, points[i], points[i + 1]))
    return best


async def match_count_record_to_way(record: dict) -> dict:
    """Best-effort match using location + road name against the local snapshot."""
    if record.get("matched_way_id") is not None:
        return record
    lat = record.get("latitude")
    lng = record.get("longitude")
    if lat is None or lng is None:
        return record

    region_id = str(record.get("region_id") or get_active_region().region_id)
    osm_snapshot_v = await active_version(region_id)
    if osm_snapshot_v is None:
        return record

    r = DEFAULT_MATCH_RADIUS_DEG
    ways = await get_local_ways(
        (lat - r, lng - r, lat + r, lng + r),
        "bus",
        region_id=region_id,
        graph_v=int(osm_snapshot_v),
    )
    wanted_name = normalize_road_name(record.get("road_name") or "")

    candidates = []
    for way in ways:
        way_name = normalize_road_name(way.get("name") or (way.get("tags") or {}).get("name") or "")
        if wanted_name and way_name and way_name != wanted_name:
            continue
        points = way.get("points") or []
        if len(points) < 2:
            continue
        distance_m = _point_polyline_distance_m(float(lat), float(lng), points)
        candidates.append((distance_m, way))

    if not candidates:
        return record
    candidates.sort(key=lambda x: x[0])
    distance_m, way = candidates[0]
    if distance_m > DEFAULT_MATCH_MAX_M:
        return record

    updated = dict(record)
    updated["matched_way_id"] = int(way.get("id"))
    updated["matched_osm_snapshot_v"] = int(osm_snapshot_v)
    updated["match_method"] = "ROAD_NAME_AND_DISTANCE"
    updated["match_distance_m"] = round(distance_m, 2)
    updated["match_confidence"] = round(max(0.0, 1.0 - distance_m / DEFAULT_MATCH_MAX_M), 3)
    return updated


async def upsert_count_records(
    records: Iterable[dict],
    *,
    region_id: Optional[str] = None,
    network_id: Optional[str] = None,
    try_match: bool = True,
) -> dict:
    """Normalize, optionally OSM-match and upsert count records."""
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    stored = 0
    matched = 0
    unmatched = 0

    for raw in records:
        record = normalize_count_row(
            raw,
            region_id=region.region_id,
            network_id=resolved_network_id,
        )
        if try_match:
            record = await match_count_record_to_way(record)
        record["imported_at"] = datetime.now(timezone.utc).isoformat()

        if record.get("matched_way_id") is None:
            unmatched += 1
        else:
            matched += 1

        await db.mobility_traffic_counts.replace_one(
            {
                "count_record_id": record["count_record_id"],
                "region_id": region.region_id,
                "network_id": resolved_network_id,
            },
            record,
            upsert=True,
        )
        stored += 1

    return {"stored": stored, "matched": matched, "unmatched": unmatched}

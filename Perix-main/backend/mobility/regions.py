"""Mobility region/network configuration.

Phase 1 remains one active runtime region per deployment. Static network,
infrastructure, overrides and traffic documents are namespaced by
region_id/network_id so adding another city does not require a code fork.
Running several active cities concurrently (live vehicle state, sockets and
operator fleets) is a later phase and is intentionally not enabled here.

A region can come from a built-in preset or from MOBILITY_REGION_CONFIG_JSON.
The JSON override is the preferred path for new cities because it does not
require changing application code.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Dict, Iterable, Optional, Tuple

BBox = Tuple[float, float, float, float]


@dataclass(frozen=True)
class MobilityRegion:
    region_id: str
    network_id: str
    city: str
    country: str
    timezone: str
    service_day_start_hour: int
    bbox: BBox
    agency_regex: str
    modes: tuple[str, ...]
    static_transit_type: str = "GTFS"
    static_gtfs_url: str = ""
    realtime_type: str = "GTFS_RT"
    realtime_url: str = ""
    realtime_interval_seconds: float = 15.0
    traffic_adapter: str = "normalized_csv"
    motion: dict = field(default_factory=dict)
    # Optional archive-independent publisher record for feeds that ship no
    # feed_info.txt (e.g. VBB). Only used when the archive supplies nothing;
    # never merged with or overriding an archive-supplied record.
    static_publisher: Optional[dict] = None

    def as_dict(self) -> dict:
        return {
            "region_id": self.region_id,
            "network_id": self.network_id,
            "city": self.city,
            "country": self.country,
            "timezone": self.timezone,
            "service_day_start_hour": self.service_day_start_hour,
            "bbox": {
                "south": self.bbox[0],
                "west": self.bbox[1],
                "north": self.bbox[2],
                "east": self.bbox[3],
            },
            "agency_regex": self.agency_regex,
            "modes": list(self.modes),
            "static_transit_type": self.static_transit_type,
            "static_gtfs_url": self.static_gtfs_url,
            "realtime_type": self.realtime_type,
            "realtime_url": self.realtime_url,
            "realtime_interval_seconds": self.realtime_interval_seconds,
            "traffic_adapter": self.traffic_adapter,
            "motion": dict(self.motion),
        }


_PRESETS: Dict[str, MobilityRegion] = {
    "magdeburg": MobilityRegion(
        region_id="magdeburg",
        network_id="de-magdeburg-mvb",
        city="Magdeburg",
        country="DE",
        timezone="Europe/Berlin",
        service_day_start_hour=4,
        bbox=(52.00, 11.45, 52.25, 11.80),
        agency_regex=r"Magdeburger Verkehrsbetriebe|\bMVB\b",
        modes=("bus", "tram"),
        static_transit_type="GTFS",
        static_gtfs_url="",
        realtime_type="GTFS_RT",
        realtime_url="https://realtime.gtfs.de/realtime-free.pb",
        realtime_interval_seconds=15.0,
        traffic_adapter="normalized_csv",
    ),
    # Gardelegen (Altmarkkreis): PVG Salzwedel, bus-only, same national GTFS-DE base.
    # Dry-run 2026-11-11 on nv_free_latest.zip (264MB, 383 agencies):
    # agency 9 = 'PVG Salzwedel', 82 bus routes. Generic Nahverkehr regex
    # matched Jena/Suhl/Weimar false positives, so keep it exact.
    "gardelegen": MobilityRegion(
        region_id="gardelegen",
        network_id="de-gardelegen-bus",
        city="Gardelegen",
        country="DE",
        timezone="Europe/Berlin",
        service_day_start_hour=4,
        bbox=(52.45, 11.25, 52.62, 11.65),
        agency_regex=r"PVG Salzwedel",
        modes=("bus",),
        static_transit_type="GTFS",
        static_gtfs_url="https://download.gtfs.de/germany/nv_free/latest.zip",
        realtime_type="GTFS_RT",
        realtime_url="https://realtime.gtfs.de/realtime-free.pb",
        realtime_interval_seconds=15.0,
        traffic_adapter="normalized_csv",
    ),
    # Berlin: VBB open-data GTFS (all schedules in VBB area, incl. S-Bahn).
    # Dry-run 2026-11-11 on VBB feed (84MB, 32 agencies, 1289 routes,
    # 71191 trips today): S-Bahn Berlin GmbH (68 routes), BVG (265),
    # DB Regio (55), ODEG (40), NEB. Extended route types 100/106=rail,
    # 109=s-bahn, 400=subway, 700/3=bus, 900=tram, 1000=ferry.
    # GTFS-DE national feeds carry no S-Bahn Berlin agency at all.
    "berlin": MobilityRegion(
        region_id="berlin",
        network_id="de-berlin-vbb",
        city="Berlin",
        country="DE",
        timezone="Europe/Berlin",
        service_day_start_hour=4,
        bbox=(52.35, 13.05, 52.70, 13.80),
        agency_regex=r"S-Bahn Berlin GmbH|Berliner Verkehrsbetriebe|DB Regio AG|Ostdeutsche Eisenbahn|NEB Betriebsgesellschaft",
        modes=("bus", "tram", "subway", "s-bahn", "rail", "ferry"),
        static_transit_type="GTFS",
        static_gtfs_url="https://unternehmen.vbb.de/gtfs",
        realtime_type="GTFS_RT",
        realtime_url="https://realtime.gtfs.de/realtime-free.pb",
        realtime_interval_seconds=15.0,
        traffic_adapter="normalized_csv",
        # VBB ships no feed_info.txt; publisher is declared by the region so
        # the version-bound source_manifest still carries an attribution.
        static_publisher={"publisher_name": "VBB Verkehrsverbund Berlin-Brandenburg GmbH",
                          "publisher_url": "https://unternehmen.vbb.de/en/digital-services/datasets"},
    ),
    # Syros: review GTFS from the official KTEL Syrou timetable
    # (Dromologia-31.10.26.pdf). Manual import only (no feed URL), no
    # realtime (no AVL on the island) -> schedule + virtual estimates.
    # Inactive until explicitly selected.
    "syros": MobilityRegion(
        region_id="syros",
        network_id="gr-syros-ktel",
        city="Syros",
        country="GR",
        timezone="Europe/Athens",
        service_day_start_hour=4,
        bbox=(37.32, 24.80, 37.55, 25.07),
        agency_regex=r"ΚΤΕΛ Ν\. ΣΥΡΟΥ|ΚΤΕΛ Σύρου|KTEL Syrou",
        modes=("bus",),
        static_transit_type="GTFS",
        static_gtfs_url="",
        realtime_type="NONE",
        realtime_url="",
        realtime_interval_seconds=15.0,
        traffic_adapter="normalized_csv",
    ),
    # Mykonos: review GTFS from the Mykonos Bus timetable (manual import).
    # Inactive until explicitly selected.
    "mykonos": MobilityRegion(
        region_id="mykonos",
        network_id="gr-mykonos-ktel",
        city="Mykonos",
        country="GR",
        timezone="Europe/Athens",
        service_day_start_hour=4,
        bbox=(37.34, 25.23, 37.52, 25.51),
        agency_regex=r"ΚΤΕΛ Μυκόνου|Mykonos Bus|KTEL Mykonos",
        modes=("bus",),
        static_transit_type="GTFS",
        static_gtfs_url="",
        realtime_type="NONE",
        realtime_url="",
        realtime_interval_seconds=15.0,
        traffic_adapter="normalized_csv",
    ),
    # Attica: OASA road GTFS (bus/trolley) + STASY fixed GTFS (metro/tram),
    # manual import from data.gov.gr RARs. Realtime: OASA telematics adapter
    # (later phase; built-in worker is GTFS_RT-only). Inactive until selected.
    "attica": MobilityRegion(
        region_id="attica",
        network_id="gr-athens-oasa",
        city="Athens",
        country="GR",
        timezone="Europe/Athens",
        service_day_start_hour=4,
        bbox=(37.60, 23.20, 38.40, 24.20),
        agency_regex=r"Athens Urban Transport Organization|Urban Rail Transport",
        modes=("bus", "trolleybus", "subway", "tram"),
        static_transit_type="GTFS",
        static_gtfs_url="",
        realtime_type="OASA_TELEMATICS",
        realtime_url="",
        realtime_interval_seconds=30.0,
        traffic_adapter="normalized_csv",
    ),
}


def _bbox_from_value(value) -> BBox:
    if isinstance(value, dict):
        parts = [value.get("south"), value.get("west"), value.get("north"), value.get("east")]
    else:
        parts = list(value or [])
    if len(parts) != 4:
        raise ValueError("bbox must contain south, west, north, east")
    south, west, north, east = [float(x) for x in parts]
    if not (-90 <= south < north <= 90 and -180 <= west < east <= 180):
        raise ValueError("invalid bbox coordinates")
    return south, west, north, east


def _region_from_dict(data: dict) -> MobilityRegion:
    required = ["region_id", "network_id", "city", "country", "timezone", "bbox", "agency_regex"]
    missing = [key for key in required if not data.get(key)]
    if missing:
        raise ValueError(f"region config missing fields: {', '.join(missing)}")

    modes = tuple(str(x).strip().lower() for x in (data.get("modes") or ["bus", "tram"]) if str(x).strip())
    if not modes:
        raise ValueError("region modes cannot be empty")

    return MobilityRegion(
        region_id=str(data["region_id"]).strip(),
        network_id=str(data["network_id"]).strip(),
        city=str(data["city"]).strip(),
        country=str(data["country"]).strip().upper(),
        timezone=str(data["timezone"]).strip(),
        service_day_start_hour=int(data.get("service_day_start_hour", 4)),
        bbox=_bbox_from_value(data["bbox"]),
        agency_regex=str(data["agency_regex"]),
        modes=modes,
        static_transit_type=str(data.get("static_transit_type") or "GTFS").upper(),
        static_gtfs_url=str(data.get("static_gtfs_url") or ""),
        realtime_type=str(data.get("realtime_type") or "GTFS_RT").upper(),
        realtime_url=str(data.get("realtime_url") or ""),
        realtime_interval_seconds=float(data.get("realtime_interval_seconds", 15.0)),
        traffic_adapter=str(data.get("traffic_adapter") or "normalized_csv"),
        motion=dict(data.get("motion") or {}),
        static_publisher=dict(data["static_publisher"]) if isinstance(data.get("static_publisher"), dict) else None,
    )


def _json_override() -> Optional[MobilityRegion]:
    raw = str(os.getenv("MOBILITY_REGION_CONFIG_JSON") or "").strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"MOBILITY_REGION_CONFIG_JSON is invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("MOBILITY_REGION_CONFIG_JSON must be a JSON object")
    return _region_from_dict(data)


def get_region(region_id: Optional[str] = None) -> MobilityRegion:
    override = _json_override()
    env_region_id = str(os.getenv("MOBILITY_REGION_ID") or "").strip()
    requested = str(
        region_id
        or env_region_id
        or (override.region_id if override else "magdeburg")
    ).strip()

    if override and override.region_id == requested:
        return _apply_env_overrides(override)

    preset = _PRESETS.get(requested)
    if preset:
        return _apply_env_overrides(preset)

    if override:
        raise ValueError(
            f"requested region {requested!r} does not match MOBILITY_REGION_CONFIG_JSON "
            f"region_id {override.region_id!r}"
        )
    raise ValueError(
        f"unknown mobility region {requested!r}; set MOBILITY_REGION_CONFIG_JSON for a new city"
    )


def get_active_region() -> MobilityRegion:
    return get_region(None)


def _apply_env_overrides(region: MobilityRegion) -> MobilityRegion:
    bbox = region.bbox
    raw_bbox = str(os.getenv("MOBILITY_REGION_BBOX") or "").strip()
    if raw_bbox:
        bbox = _bbox_from_value([x.strip() for x in raw_bbox.split(",")])

    modes_raw = str(os.getenv("MOBILITY_MODES") or "").strip()
    modes = region.modes if not modes_raw else tuple(x.strip().lower() for x in modes_raw.split(",") if x.strip())

    return MobilityRegion(
        region_id=str(os.getenv("MOBILITY_REGION_ID") or region.region_id).strip(),
        network_id=str(os.getenv("MOBILITY_NETWORK_ID") or region.network_id).strip(),
        city=str(os.getenv("MOBILITY_CITY") or region.city).strip(),
        country=str(os.getenv("MOBILITY_COUNTRY") or region.country).strip().upper(),
        timezone=str(os.getenv("MOBILITY_TIMEZONE") or region.timezone).strip(),
        service_day_start_hour=int(os.getenv("MOBILITY_SERVICE_DAY_START_HOUR") or region.service_day_start_hour),
        bbox=bbox,
        agency_regex=str(os.getenv("MOBILITY_AGENCY_REGEX") or region.agency_regex),
        modes=modes,
        static_transit_type=str(
            os.getenv("MOBILITY_STATIC_TRANSIT_TYPE") or region.static_transit_type
        ).upper(),
        static_gtfs_url=str(os.getenv("MOBILITY_STATIC_GTFS_URL") or region.static_gtfs_url),
        realtime_type=str(os.getenv("MOBILITY_REALTIME_TYPE") or region.realtime_type).upper(),
        realtime_url=str(os.getenv("MOBILITY_REALTIME_URL") or region.realtime_url),
        realtime_interval_seconds=float(
            os.getenv("MOBILITY_REALTIME_INTERVAL_SECONDS") or region.realtime_interval_seconds
        ),
        traffic_adapter=str(os.getenv("MOBILITY_TRAFFIC_ADAPTER") or region.traffic_adapter),
        motion=dict(region.motion),
        static_publisher=dict(region.static_publisher) if region.static_publisher else None,
    )


def split_bbox(bbox: BBox, rows: int = 2, cols: int = 2) -> list[BBox]:
    """Split one region bbox into deterministic smaller Overpass requests."""
    if rows < 1 or cols < 1:
        raise ValueError("rows and cols must be >= 1")
    south, west, north, east = bbox
    lat_step = (north - south) / rows
    lng_step = (east - west) / cols
    out = []
    for row in range(rows):
        s = south + row * lat_step
        n = north if row == rows - 1 else south + (row + 1) * lat_step
        for col in range(cols):
            w = west + col * lng_step
            e = east if col == cols - 1 else west + (col + 1) * lng_step
            out.append((s, w, n, e))
    return out


def known_region_ids() -> Iterable[str]:
    ids = set(_PRESETS)
    override = _json_override()
    if override:
        ids.add(override.region_id)
    return sorted(ids)

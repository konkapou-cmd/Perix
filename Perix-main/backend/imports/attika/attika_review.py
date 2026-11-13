"""Attica (OASA road + STASY fixed) review record. Offline artifact only.

Sources (data.gov.gr, OASA high-value datasets):
  - Road GTFS:  https://data.gov.gr/dataset/fb049bb1-aea6-4443-95fa-8b941dd6a057
    (osy_gtfs.rar, resource modified 2026-11-09, archive dated 2026-08-06)
  - Fixed GTFS:  https://data.gov.gr/dataset/4e897a75-975a-4ce7-af65-f32ea01f93b9
    (stasy_gtfs.rar, resource modified 2026-11-09, archive dated 2026-10-06)
"""
import json
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
REVIEW = {
    "schema_version": 1,
    "status": "REVIEW_ARTIFACT_NOT_ACTIVATED",
    "runtime_eligible": False,
    "public_release_allowed": False,
    "region": "attica",
    "network_id": "gr-athens-oasa",
    "fetched": "2026-11-12",
    "attribution": "ΟΑΣΑ Α.Ε. / ΣΤΑ.ΣΥ. Α.Ε. via data.gov.gr (open data); OpenStreetMap contributors, ODbL",
    "feeds": {
        "road": {
            "source_url": "https://data.gov.gr/dataset/fb049bb1-aea6-4443-95fa-8b941dd6a057/resource/119db488-16ea-4c76-b560-41c472872390/download/osy_gtfs.rar",
            "agency": "Athens Urban Transport Organization (Ο.ΣΥ.)",
            "routes_total": 486,
            "route_types": {"3_bus": 463, "11_trolley": 23},
            "trips": 95304,
            "calendar_window": "2026-08-03 .. 2026-08-24",
            "dry_run_date": "2026-08-15",
            "dry_run_routes_active": 262,
            "dry_run_modes": {"bus": 242, "trolleybus": 20},
            "stop_catalogue": 8172,
            "stale_for_today": True,
        },
        "fixed": {
            "source_url": "https://data.gov.gr/dataset/4e897a75-975a-4ce7-af65-f32ea01f93b9/resource/5e3858ee-d9ba-48c2-9015-744ea160976d/download/stasy_gtfs.rar",
            "agency": "Urban Rail Transport S.A. (ΣΤΑ.ΣΥ.)",
            "routes_total": 5,
            "route_types": {"0_tram": 2, "1_subway": 3},
            "trips": 69845,
            "calendar_window": "calendar_dates 2026-09-16 .. 2026-10-31",
            "dry_run_date": "2026-10-15",
            "dry_run_routes_active": 5,
            "dry_run_modes": {"subway": 3, "tram": 2},
            "stale_for_today": True,
        },
    },
    "parser_changes": [
        "utils/gtfs.py now accepts routes.txt without agency_id when exactly one agency matched (GTFS conditional-required), needed for the OASA road feed.",
    ],
    "activation_blockers": [
        "ROAD_FEED_WINDOW_2026-08_ONLY_STALE_FOR_TODAY",
        "FIXED_FEED_WINDOW_2026-09_10_ONLY_STALE_FOR_TODAY",
        "NO_GTFS_RT_FOR_OASA_TELEMATICS_ADAPTER_REQUIRED",
        "SUMMER_GTFS_KNOWN_GAPS_VS_REAL_OPERATION",
        "OPERATOR_REUSE_RIGHTS_TO_CONFIRM",
    ],
    "notes": [
        "OASA publishes GTFS three times a year; the current road archive is the summer window (Aug 2026), not today's schedule.",
        "STASY has no calendar.txt; service days are calendar_dates-only (October window).",
        "Live data path: OASA telematics (telematics.oasa.gr) needs a region realtime adapter; built-in worker supports GTFS_RT only.",
        "AUEB athens-gtfs-realtime (MIT, independent) documents stop_id=StopCode mapping and 98% trip matching as a reference design for the adapter.",
        "Parser fix is additive; Magdeburg/VBB feeds carry agency_id and are unaffected.",
    ],
}

with open(os.path.join(OUT_DIR, "attika_review.json"), "w", encoding="utf-8") as f:
    json.dump(REVIEW, f, ensure_ascii=False, indent=1)
print("wrote", os.path.join(OUT_DIR, "attika_review.json"))

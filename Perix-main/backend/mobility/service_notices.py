"""Source-backed timetable advisories; never geometry, clocks or closures.

An operator notice can establish that a timetable is obsolete without proving
an OSM edge chain or a measured vehicle location. Surface that conflict without
silently rerouting, suppressing vehicles or inventing stop times.
"""
from datetime import date
from pathlib import Path
import json


def notices_for_domain(domain: dict, records=None) -> dict[str, dict]:
    network = (domain or {}).get("network") or {}
    try:
        day = date.fromisoformat(str(network.get("service_date") or ""))
    except ValueError:
        return {}
    if records is None:
        try:
            records = json.loads((Path(__file__).parent / "service_notices.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
    names = {}
    for stop in (domain or {}).get("stops") or []:
        for sid in [stop.get("stop_id"), *(stop.get("stop_ids") or []),
                    *(p.get("platform_id") for p in stop.get("platforms") or [])]:
            if sid is not None:
                names[str(sid)] = str(stop.get("name") or "")
    result = {}
    for record in records:
        if (record.get("region_id") != network.get("region_id")
                or record.get("network_id") != network.get("network_id")
                or record.get("source_kind") != "OPERATOR_PUBLIC_NOTICE"
                or not record.get("source_url") or not record.get("reviewed_at")):
            continue
        try:
            if day < date.fromisoformat(record["valid_from"]):
                continue
            if record.get("valid_until") and day > date.fromisoformat(record["valid_until"]):
                continue
            review_due = day > date.fromisoformat(record["review_through"])
        except (KeyError, ValueError, TypeError):
            continue
        for pattern in (domain or {}).get("patterns") or []:
            if (str(pattern.get("route_number")) not in record.get("route_numbers", [])
                    or pattern.get("mode") not in record.get("modes", [])):
                continue
            # Stop matching confines the advisory to obsolete sequences; a
            # corrected importer generation must clear it automatically.
            obsolete = set(record.get("obsolete_stop_names") or [])
            if not obsolete or not obsolete.intersection(names.get(str(s)) for s in pattern.get("stop_ids") or []):
                continue
            result[str(pattern["pattern_id"])] = {
                "route_number": str(pattern["route_number"]), "mode": pattern["mode"],
                "direction": pattern.get("direction"),
                "status": "OPERATOR_NOTICE_REVIEW_REQUIRED" if review_due else "OPERATOR_DIVERSION_NOT_IN_TIMETABLE",
                "notice_id": record["notice_id"], "source_url": record["source_url"],
                "reviewed_at": record["reviewed_at"], "source_kind": record["source_kind"],
                "message": "Operator notice requires revalidation; the stored timetable conflict is unresolved."
                    if review_due else record["message"], "position_verified": False,
                "review_required": review_due,
            }
    return result

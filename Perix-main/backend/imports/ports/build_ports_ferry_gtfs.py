"""Compile the NAP maritime reference dataset (2023) into a review ferry GTFS
for the Syros/Mykonos port layer. Static reference only, no activation.

Source: data.nap.gov.gr "Information about maritime transport in Greece"
(2023 XLSX, Hellenic Institute of Transport / CERTH), ODbL.
Routinely stale (2023) - flagged; verify current operator timetables before use.
"""
from __future__ import annotations

import csv
import io
import json
import os
import zipfile

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
AGENCY_ID = "NAP_FERRY"
TIMEZONE = "Europe/Athens"
DATASET_YEAR = "2023"
FETCHED = "2026-11-12"
CALENDAR_START = "20230101"
CALENDAR_END = "20261231"  # reference window only; verify before use

PORTS = {
    "GR_PIR": ("Πειραιάς", 37.94195, 23.62523, "OSM_NODE_668895582"),
    "GR_SYR": ("Σύρος", 37.44090, 24.94140, "OSM_NODE_660636549"),
    "GR_TIN": ("Τήνος", 37.53864, 25.15650, "OSM_NODE_3131520333"),
    "GR_MYK": ("Μύκονος (Νέο Λιμάνι)", 37.46401, 25.32474, "OSM_NODE_660644797"),
    "GR_RAF": ("Ραφήνα", 38.02249, 24.00962, "OSM_NODE_13120982188"),
}

# NAP 2023 Blue Star / Hellenic Seaways rows touching Syros/Mykonos.
# (from, to, departures, arrivals, duration_minutes, days_greek)
NAP_ROWS = [
    # PIRAEUS -> MYKONOS via SYROS, TINOS (intermediate times not printed)
    ("GR_PIR", "GR_MYK", ["07:30", "15:00"], ["12:45", "19:35"], [315, 275],
     ["ΔΕΥ,ΤΡΙ,ΠΑΡ,ΣΑΒ,ΚΥΡ", "ΔΕΥ,ΤΡΙ,ΠΑΡ,ΣΑΒ,ΚΥΡ"], ["GR_SYR", "GR_TIN"]),
    # MYKONOS -> PIRAEUS via TINOS, SYROS
    ("GR_MYK", "GR_PIR", ["14:15"], ["19:45"], [330],
     ["ΔΕΥ,ΤΡΙ,ΤΕΤ,ΠΕΜ,ΠΑΡ,ΣΑΒ,ΚΥΡ"], ["GR_TIN", "GR_SYR"]),
]

DAY_MAP = {
    "ΔΕΥ": 0, "ΤΡΙ": 1, "ΤΡΙΤ": 1, "ΤΕΤ": 2, "ΠΕΜ": 3, "ΠΑΡ": 4, "ΣΑΒ": 5, "ΚΥΡ": 6,
}


def day_pattern(days_greek: str) -> str:
    bits = ["0"] * 7
    for token in days_greek.split(","):
        token = token.strip()
        idx = DAY_MAP.get(token)
        if idx is not None:
            bits[idx] = "1"
    return "".join(bits)


def to_gtfs(t: str) -> str:
    h, m = t.split(":")
    return "%s:%s:00" % (h, m)


def add_minutes(t_gtfs: str, minutes: int) -> str:
    h, m, s = map(int, t_gtfs.split(":"))
    total = h * 3600 + m * 60 + s + minutes * 60
    return "%02d:%02d:%02d" % (total // 3600, (total % 3600) // 60, total % 60)


def build() -> tuple[dict, dict]:
    rows = {
        "agency.txt": [["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"]],
        "stops.txt": [["stop_id", "stop_name", "stop_lat", "stop_lon"]],
        "routes.txt": [["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"]],
        "trips.txt": [["route_id", "service_id", "trip_id", "trip_headsign", "direction_id"]],
        "stop_times.txt": [["trip_id", "stop_sequence", "stop_id", "arrival_time", "departure_time"]],
        "calendar.txt": [["service_id", "monday", "tuesday", "wednesday", "thursday", "friday",
                          "saturday", "sunday", "start_date", "end_date"]],
        "feed_info.txt": [["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version"]],
    }
    rows["agency.txt"].append([AGENCY_ID, "Ακτοπλοΐα (NAP reference)", "https://data.nap.gov.gr", TIMEZONE, "el"])
    for sid, (name, lat, lon, method) in PORTS.items():
        rows["stops.txt"].append([sid, name, "%.6f" % lat, "%.6f" % lon])
    rows["routes.txt"].append(["FERRY_PIR_MYK", AGENCY_ID, "ΠΕΙΡΑΙΑΣ-ΜΥΚΟΝΟΣ",
                               "Πειραιάς - Σύρος - Τήνος - Μύκονος", "4"])
    # one service per distinct weekday pattern
    patterns = {}
    for row in NAP_ROWS:
        for days in row[5]:
            pat = day_pattern(days)
            if pat not in patterns:
                patterns[pat] = "S%d" % len(patterns)
    for pat, sid in patterns.items():
        rows["calendar.txt"].append([sid, *list(pat), CALENDAR_START, CALENDAR_END])
    rows["feed_info.txt"].append([
        "Hellenic Institute of Transport / CERTH (NAP)",
        "https://data.nap.gov.gr/dataset/f1829566-388d-4bde-afc7-b9a6498b701b",
        "el", "nap-maritime-" + DATASET_YEAR + "-transcription-" + FETCHED])

    trip_seq = 0
    review = {"trips": [], "notes": []}

    def add_trip(direction, headsign, origin, dest, dep, arr, dur_min, service_id, intermediates):
        nonlocal trip_seq
        trip_seq += 1
        trip_id = "FERRY_%03d" % trip_seq
        rows["trips.txt"].append(["FERRY_PIR_MYK", service_id, trip_id, headsign, direction])
        pairs = [(origin, dep)]
        legs = len(intermediates) + 1
        per_leg = dur_min // legs
        cursor = to_gtfs(dep)
        for sid in intermediates:
            cursor = add_minutes(cursor, per_leg)
            pairs.append((sid, cursor))
        pairs.append((dest, to_gtfs(arr)))
        for seq, (sid, t) in enumerate(pairs, start=1):
            tg = t if t.count(":") == 2 else to_gtfs(t)
            rows["stop_times.txt"].append([trip_id, str(seq), sid, tg, tg])
        review["trips"].append({"trip_id": trip_id, "direction": direction,
                                "origin": origin, "destination": dest,
                                "intermediates_estimated": intermediates,
                                "flags": ["INTERMEDIATE_TIMES_ESTIMATED_EQUAL_SPLIT_NOT_PRINTED",
                                          "DATASET_YEAR_" + DATASET_YEAR]})

    for origin, dest, deps, arrs, durs, days_list, intermediates in NAP_ROWS:
        direction = "0" if origin == "GR_PIR" else "1"
        headsign = "Μύκονος" if dest == "GR_MYK" else "Πειραιάς"
        for dep, arr, dur, days in zip(deps, arrs, durs, days_list):
            add_trip(direction, headsign, origin, dest, dep, arr, dur,
                     patterns[day_pattern(days)], intermediates)
    return rows, review


def main():
    rows, review = build()
    review.update({
        "schema_version": 1,
        "status": "REVIEW_ARTIFACT_NOT_ACTIVATED",
        "runtime_eligible": False,
        "public_release_allowed": False,
        "source_dataset": "data.nap.gov.gr - Information about maritime transport in Greece (2023)",
        "source_url": "https://data.nap.gov.gr/dataset/f1829566-388d-4bde-afc7-b9a6498b701b",
        "attribution": "Hellenic Institute of Transport / CERTH; OpenStreetMap contributors, ODbL",
        "fetched": FETCHED,
        "activation_blockers": [
            "DATASET_2023_STALE_VERIFY_CURRENT_OPERATOR_TIMETABLES",
            "INTERMEDIATE_PORT_TIMES_NOT_PRINTED_EQUAL_SPLIT_ESTIMATE",
            "CALENDAR_END_ASSUMED_REFERENCE_WINDOW",
            "COMPANIES_PARTIAL_4_OF_OPERATORS",
            "LIVE_AIS_NOT_INCLUDED",
        ],
        "notes": [
            "Static reference only: the NAP dataset year is 2023 and covers 4 operators (Blue Star/Hellenic, Anek, Zante, Minoan).",
            "Only rows whose origin, destination and intermediate ports resolve to OSM ferry terminals are included.",
            "Intermediate arrivals (Σύρος, Τήνος) are not printed in the dataset; they are equal-split estimates over the printed duration.",
            "Syros-Lavrio line exists in the dataset (via Kythnos/Kea) but Kythnos has no tagged OSM ferry terminal, so it is omitted.",
            "Minoan Heraklion-Mykonos row exists but Heraklion is outside the current port set.",
            "Live arrivals/departures require an AIS/operator realtime source, which is not open/free; this layer is schedule-only.",
        ],
    })
    trips_count = len(rows["trips.txt"]) - 1
    st_count = len(rows["stop_times.txt"]) - 1
    review["coverage"] = {"ports": len(PORTS), "trips": trips_count, "stop_times": st_count}

    os.makedirs(OUT_DIR, exist_ok=True)
    zip_path = os.path.join(OUT_DIR, "ports_ferry_gtfs.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, rows_ in rows.items():
            buf = io.StringIO()
            csv.writer(buf, lineterminator="\n").writerows(rows_)
            zf.writestr(name, buf.getvalue().encode("utf-8-sig"))
    with open(os.path.join(OUT_DIR, "ports_ferry_review.json"), "w", encoding="utf-8") as f:
        json.dump(review, f, ensure_ascii=False, indent=1)
    print("wrote", zip_path)
    print("ports=%d trips=%d stop_times=%d" % (len(PORTS), trips_count, st_count))


if __name__ == "__main__":
    main()

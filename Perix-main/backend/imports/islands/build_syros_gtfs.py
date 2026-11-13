"""Compile the official KTEL Syrou timetable (Dromologia-31.10.26.pdf) into a
review GTFS archive. Offline artifact only: no runtime import, no activation.

Source: https://ktelsyrou.gr/dromologia/ -> Dromologia-31.10.26.pdf
Attribution: © ΚΤΕΛ Ν. ΣΥΡΟΥ Α.Ε. (https://ktelsyrou.gr); OSM stops ODbL.
"""
from __future__ import annotations

import csv
import io
import json
import os
import zipfile

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

AGENCY_ID = "SYR_KTEL"
TIMEZONE = "Europe/Athens"
PUBLISHED = "2026-10-31"
WEEKDAY_FROM = "2026-11-02"
WEEKEND_FROM = "2026-10-31"
CALENDAR_END = "2027-03-31"  # validity printed "from" only; must be re-verified

# stop_id -> (stop_name, lat, lon, resolution, review_flag)
STOPS = {
    "SYR_ERM": ("Ερμούπολη Αφετηρία", 37.44141, 24.94139,
                "OSM_NODE_3350617816_LIMANI", "KTEL departure/terminus at port; OSM node name 'Λιμάνι'"),
    "SYR_KINI": ("Κίνι", 37.44616, 24.90036, "OSM_NODE_13597767508_KINI", None),
    "SYR_GALISSAS": ("Γαλησσά", 37.42128, 24.87886, "OSM_NODE_5848129300_GALISSAS", None),
    "SYR_FINIKAS": ("Φοίνικας", 37.39827, 24.87781, "OSM_NODE_3429464180_FINIKAS_2",
                    "finikas 2 chosen over finikas 1/3; operator confirmation pending"),
    "SYR_POSEIDONIA": ("Ποσειδωνία", 37.38540, 24.89347, "OSM_NODE_3429464179_POSEIDONIA_1", None),
    "SYR_VARI": ("Βάρη", 37.39105, 24.94424, "OSM_NODE_2688618081_REVIEW_CATALOG",
                 "name from 2026-10-22 review catalog; fresh pull has no name tag"),
    "SYR_AZOLIMNOS": ("Αζόλιμνος", 37.41215, 24.95823, "OSM_NODE_9932638261_AZOLIMNOS", None),
    "SYR_K_MANNA": ("Κάτω Μάννα", 37.42018, 24.94823, "OSM_NODE_3535148459_KATO_MANNA", None),
}
# Column stops dropped from the feed because no exact OSM name exists:
# Δανακός, Μέγα Γιαλό (candidates unnamed) -> kept in review notes only.
UNRESOLVED_COLUMN_STOPS = ["Δανακός", "Μέγα Γιαλό"]

L1_ERM = ["SYR_ERM", "SYR_KINI", "SYR_GALISSAS", "SYR_FINIKAS",
          "SYR_POSEIDONIA", "SYR_VARI", "SYR_AZOLIMNOS", "SYR_ERM"]
L1_TIMES_FULL = {  # departure ERM -> ... -> ERM terminus, published columns
    "09:00": ["09:00", "09:20", "09:30", "09:40", "09:45", "10:00", "10:05", "10:15"],
    "14:30": ["14:30", "14:50", "15:00", "15:10", "15:15", "15:30", "15:35", "15:45"],
    "16:00": ["16:00", "16:20", "16:30", "16:40", "16:45", "17:00", "17:05", "17:15"],
}
L1_SHORT = {  # 12:00 ends at Finikas (published xxx afterwards)
    "12:00": [("SYR_ERM", "12:00"), ("SYR_KINI", "12:20"), ("SYR_GALISSAS", "12:30"),
              ("SYR_FINIKAS", "12:40")],
}
L3_ERM = ["SYR_ERM", "SYR_AZOLIMNOS", "SYR_VARI", "SYR_POSEIDONIA",
          "SYR_FINIKAS", "SYR_GALISSAS", "SYR_KINI", "SYR_ERM"]
L3_TIMES_FULL = {
    "11:30": ["11:30", "11:45", "11:55", "12:05", "12:15", "12:20", "12:25", "12:45"],
    "14:30": ["14:30", "14:45", "14:55", "15:05", "15:15", "15:20", "15:25", "15:45"],
    "17:30": ["17:30", "17:45", "17:55", "18:05", "18:15", "18:20", "18:25", "18:45"],
}
L3_SHORT = {  # 12:30 ends at Poseidonia
    "12:30": [("SYR_ERM", "12:30"), ("SYR_AZOLIMNOS", "12:45"), ("SYR_VARI", "12:55"),
              ("SYR_POSEIDONIA", "13:00")],
}
# Weekend columns (Sat/Sun/holidays from 31/10/2026)
WE_L1_TIMES_FULL = {
    "10:00": ["10:00", "10:20", "10:30", "10:40", "10:45", "11:00", "11:05", "11:15"],
    "12:15": ["12:15", "12:35", "12:45", "12:55", "13:00", "13:15", "13:20", "13:30"],
    "16:00": ["16:00", "16:20", "16:30", "16:40", "16:45", "17:00", "17:05", "17:15"],
}
WE_L3_TIMES_FULL = {
    "14:30": ["14:30", "14:45", "14:55", "15:05", "15:15", "15:20", "15:25", "15:45"],
    "17:30": ["17:30", "17:45", "17:55", "18:05", "18:15", "18:20", "18:25", "18:45"],
}
# Kini direct line: the PDF lists departures, not pairings. One-directional
# trips with the printed 20-minute journey time; pairing is NOT inferred.
KINI_ERM_DEPARTURES = {  # weekday + weekend as printed (07:10 school-only)
    "07:10": "SCHOOL",
    "09:00": "ALL",
    "12:00": "ALL",
    "14:30": "ALL",
    "16:00": "ALL",
}
KINI_FROM_KINI_DEPARTURES = {
    "07:30": "SCHOOL",
    "12:25": "ALL",
    "13:35": "ALL",
    "15:25": "ALL",
    "18:25": "ALL",
}
# School-day-only runs as printed (origin -> ... -> terminus, no times).
# Anchors resolved to stops; legs uniform-estimated, flagged.
SCHOOL_RUNS = [
    ("06:30", ["Ερμούπολη", "Κ.Μάννα", "Βάρη", "Μ.Γιαλό", "Ποσειδωνία", "Φοίνικα", "Γαλησσά", "Πάγο", "Τάλαντα", "Ερμούπολη"]),
    ("06:30", ["Ερμούπολη", "Άνω Μάννα", "Χρούσσα", "Παρακοπή", "Βήσσα", "Αδειάτα", "Ποσειδωνία", "Μ.Γιαλό", "Βάρη", "Αζόλιμνο", "Ερμούπολη"]),
    ("07:10", ["Ερμούπολη", "Κίνι", "Ερμούπολη"]),
    ("07:30", ["Ερμούπολη", "Ξηρόκαμπος", "Λαλάκια", "Ερμούπολη", "Άνω Μάννα", "Λιβάδια"]),
    ("08:00", ["Ερμούπολη", "Ξηρόκαμπος", "Λαλάκια", "Ερμούπολη", "Άνω Μάννα", "Λιβάδια"]),
    ("08:00", ["Ποσειδωνία", "Φοίνικα", "Γαλησσά", "Πάγο", "Τάλαντα", "Ερμούπολη"]),
    ("08:00", ["Ποσειδωνία", "Αδειάτα", "Βήσσα", "Παρακοπή", "Αγρός", "Άνω Μάννα", "Ερμούπολη"]),
    ("08:00", ["Δημ. Σχολείο Βάρης", "Κάτω Μάννα", "Ερμούπολη", "Λιβάδια", "Άνω Μάννα"]),
    ("08:00", ["Δημ. Σχολείο Βάρης", "Αζόλιμνο", "Κάτω Μάννα", "Ερμούπολη"]),
    ("14:10", ["Ξηρόκαμπος (Γυμνάσια)", "Λαλάκια", "Ερμούπολη"]),
    ("14:10", ["Λιβάδια", "Άνω Μάννα", "Ερμούπολη", "Λαλάκια", "Ερμούπολη"]),
    ("14:10", ["Λιβάδια", "Άνω Μάννα", "Αφετηρία ΚΤΕΛ", "Ερμούπολη"]),
    ("14:15", ["Λιβάδια", "Άνω Μάννα", "Ερμούπολη", "Λαλάκια", "Ερμούπολη"]),
    ("14:30", ["Ερμούπολη", "Άνω Μάννα", "Χρούσσα", "Παρακοπή", "Βήσσα", "Αδειάτα", "Παρακοπή", "Τάλαντα", "Ερμούπολη"]),
]
# School runs whose stop labels map to resolved OSM stop ids.
SCHOOL_LABEL_TO_STOP = {
    "Ερμούπολη": "SYR_ERM", "Αφετηρία ΚΤΕΛ": "SYR_ERM",
    "Κίνι": "SYR_KINI", "Γαλησσά": "SYR_GALISSAS", "Φοίνικα": "SYR_FINIKAS",
    "Ποσειδωνία": "SYR_POSEIDONIA", "Βάρη": "SYR_VARI", "Αζόλιμνο": "SYR_AZOLIMNOS",
    "Κ.Μάννα": "SYR_K_MANNA", "Κάτω Μάννα": "SYR_K_MANNA",
}
SCHOOL_LEG_SECONDS = 360  # uniform 6 min estimate, flagged ESTIMATED

SERVICES = {
    "WD": ("2026-11-02", "1111100"),
    "WE": ("2026-10-31", "0011110"),
    "SCHOOL": ("2026-11-02", "1111100"),
}


def hhmm_to_gtfs(t: str) -> str:
    h, m = t.split(":")
    return "%s:%s:00" % (h, m)


def to_gtfs(t: str) -> str:
    if t.count(":") == 2:
        return t
    return hhmm_to_gtfs(t)


def add_seconds(t_gtfs: str, seconds: int) -> str:
    h, m, s = map(int, t_gtfs.split(":"))
    total = h * 3600 + m * 60 + s + seconds
    total %= 86400
    return "%02d:%02d:%02d" % (total // 3600, (total % 3600) // 60, total % 60)


def build() -> dict:
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
    rows["agency.txt"].append([AGENCY_ID, "ΚΤΕΛ Ν. ΣΥΡΟΥ Α.Ε.", "https://ktelsyrou.gr", TIMEZONE, "el"])
    for stop_id, (name, lat, lon, method, flag) in STOPS.items():
        rows["stops.txt"].append([stop_id, name, "%.6f" % lat, "%.6f" % lon])
    rows["routes.txt"].append(["SYR_L1", AGENCY_ID, "1", "Γραμμή 1 Ερμούπολη - Κίνι - Γαλησσά - Βάρη (κυκλική)", "3"])
    rows["routes.txt"].append(["SYR_L3", AGENCY_ID, "3", "Γραμμή 3 Ερμούπολη - Αζόλιμνος - Βάρη - Γαλησσά (κυκλική)", "3"])
    rows["routes.txt"].append(["SYR_KINI", AGENCY_ID, "ΚΙΝΙ", "Ερμούπολη - Κίνι απευθείας", "3"])
    rows["routes.txt"].append(["SYR_SCHOOL", AGENCY_ID, "ΣΧΟΛΙΚΑ", "Σχολικά δρομολόγια (μόνο ημέρες λειτουργίας σχολείων)", "3"])
    for service, (start, weekdays) in SERVICES.items():
        rows["calendar.txt"].append([service, *weekdays, start.replace("-", ""), CALENDAR_END.replace("-", "")])
    rows["feed_info.txt"].append(["ΚΤΕΛ Ν. ΣΥΡΟΥ Α.Ε.", "https://ktelsyrou.gr/dromologia/", "el",
                                  "manual-transcription-" + PUBLISHED])

    trip_seq = 0
    review = {"trips": [], "unresolved_column_stops": UNRESOLVED_COLUMN_STOPS,
              "school_runs": [], "notes": []}

    def add_trip(route_id, service_id, headsign, stop_time_pairs, direction_id="0", flags=None):
        nonlocal trip_seq
        trip_seq += 1
        trip_id = "%s_%s_%03d" % (route_id, service_id, trip_seq)
        rows["trips.txt"].append([route_id, service_id, trip_id, headsign, direction_id])
        for seq, (sid, t) in enumerate(stop_time_pairs, start=1):
            tg = to_gtfs(t)
            rows["stop_times.txt"].append([trip_id, str(seq), sid, tg, tg])
        review["trips"].append({"trip_id": trip_id, "route_id": route_id,
                                "service_id": service_id, "flags": flags or [],
                                "published": True})
        return trip_id

    for dep, times in L1_TIMES_FULL.items():
        add_trip("SYR_L1", "WD", "Ερμούπολη Αφετηρία → Ερμούπολη (μέσω Κίνι)",
                 list(zip(L1_ERM, times)))
    for dep, pairs in L1_SHORT.items():
        add_trip("SYR_L1", "WD", "Ερμούπολη → Φοίνικας (σύντομη)", pairs,
                 flags=["SHORT_WORKING_AS_PRINTED_xxx"])
    for dep, times in L3_TIMES_FULL.items():
        add_trip("SYR_L3", "WD", "Ερμούπολη Αφετηρία → Ερμούπολη (μέσω Αζόλιμνου)",
                 list(zip(L3_ERM, times)))
    for dep, pairs in L3_SHORT.items():
        add_trip("SYR_L3", "WD", "Ερμούπολη → Ποσειδωνία (σύντομη)", pairs,
                 flags=["SHORT_WORKING_AS_PRINTED_xxx"])
    for dep, times in WE_L1_TIMES_FULL.items():
        add_trip("SYR_L1", "WE", "Ερμούπολη Αφετηρία → Ερμούπολη (μέσω Κίνι)",
                 list(zip(L1_ERM, times)))
    for dep, times in WE_L3_TIMES_FULL.items():
        add_trip("SYR_L3", "WE", "Ερμούπολη Αφετηρία → Ερμούπολη (μέσω Αζόλιμνου)",
                 list(zip(L3_ERM, times)))
    for dep, scope in KINI_ERM_DEPARTURES.items():
        service = "SCHOOL" if scope == "SCHOOL" else "WD"
        add_trip("SYR_KINI", service, "Ερμούπολη → Κίνι",
                 [("SYR_ERM", dep), ("SYR_KINI", add_seconds(hhmm_to_gtfs(dep), 1200))],
                 flags=["SCHOOL_DAYS_ONLY"] if scope == "SCHOOL" else ["DIRECTIONAL_RUN_PAIRING_NOT_INFERRED"])
        if scope == "ALL":
            add_trip("SYR_KINI", "WE", "Ερμούπολη → Κίνι",
                     [("SYR_ERM", dep), ("SYR_KINI", add_seconds(hhmm_to_gtfs(dep), 1200))],
                     flags=["WEEKEND_VALIDITY_INFERRED_FROM_JOINT_BLOCK", "DIRECTIONAL_RUN_PAIRING_NOT_INFERRED"])
    for dep, scope in KINI_FROM_KINI_DEPARTURES.items():
        service = "SCHOOL" if scope == "SCHOOL" else "WD"
        add_trip("SYR_KINI", service, "Κίνι → Ερμούπολη",
                 [("SYR_KINI", dep), ("SYR_ERM", add_seconds(hhmm_to_gtfs(dep), 1200))],
                 flags=["SCHOOL_DAYS_ONLY"] if scope == "SCHOOL" else ["DIRECTIONAL_RUN_PAIRING_NOT_INFERRED"])
        if scope == "ALL":
            add_trip("SYR_KINI", "WE", "Κίνι → Ερμούπολη",
                     [("SYR_KINI", dep), ("SYR_ERM", add_seconds(hhmm_to_gtfs(dep), 1200))],
                     flags=["WEEKEND_VALIDITY_INFERRED_FROM_JOINT_BLOCK", "DIRECTIONAL_RUN_PAIRING_NOT_INFERRED"])

    # School runs: anchors only, uniform estimated legs, flagged.
    for dep, labels in SCHOOL_RUNS:
        dedup = []
        missing = []
        for label in labels:
            sid = SCHOOL_LABEL_TO_STOP.get(label)
            if sid is None:
                missing.append(label)
                continue
            if dedup and dedup[-1][0] == sid:
                continue
            dedup.append((sid, label))
        if len(dedup) < 2:
            review["school_runs"].append({"departure": dep, "labels": labels,
                                          "resolved": dedup, "missing": missing,
                                          "status": "SKIPPED_FEWER_THAN_TWO_ANCHORS"})
            continue
        pairs = []
        current = hhmm_to_gtfs(dep)
        pairs.append((dedup[0][0], current))
        for (sid, _label) in dedup[1:]:
            current = add_seconds(current, SCHOOL_LEG_SECONDS)
            pairs.append((sid, current))
        add_trip("SYR_SCHOOL", "SCHOOL", "Σχολικό: " + " - ".join(labels[:3]) + ("…" if len(labels) > 3 else ""),
                 pairs, flags=["ESTIMATED_UNIFORM_LEGS_NOT_PUBLISHED", "SCHOOL_DAYS_ONLY"])
        review["school_runs"].append({"departure": dep, "labels": labels,
                                      "resolved": dedup, "missing": missing,
                                      "status": "INCLUDED_ESTIMATED_ANCHORS_ONLY",
                                      "leg_seconds_estimate": SCHOOL_LEG_SECONDS})
    return rows, review


def main():
    rows, review = build()
    review.update({
        "schema_version": 1,
        "status": "REVIEW_ARTIFACT_NOT_ACTIVATED",
        "runtime_eligible": False,
        "public_release_allowed": False,
        "source_pdf": "https://ktelsyrou.gr/wp-content/uploads/2026/10/Dromologia-31.10.26.pdf",
        "source_page": "https://ktelsyrou.gr/dromologia/",
        "published": PUBLISHED,
        "weekday_from": WEEKDAY_FROM,
        "weekend_from": WEEKEND_FROM,
        "calendar_end_assumed": CALENDAR_END,
        "attribution": "© ΚΤΕΛ Ν. ΣΥΡΟΥ Α.Ε.; OpenStreetMap contributors, ODbL",
        "activation_blockers": [
            "STOP_COORDINATES_PARTIAL_OPERATOR_UNCONFIRMED",
            "DANAKOS_AND_MEGA_GIALO_UNRESOLVED",
            "WEEKEND_KINI_VALIDITY_INFERRED",
            "SCHOOL_RUN_LEGS_ESTIMATED",
            "CALENDAR_END_ASSUMED",
            "OPERATOR_REUSE_RIGHTS_TO_CONFIRM",
        ],
        "notes": [
            "Line 1 = clockwise loop (via Kini first); Line 3 = counterclockwise (via Azolimnos).",
            "12:00 (L1) and 12:30 (L3) weekdays are short workings: published columns end with xxx.",
            "Δανακός and Μέγα Γιαλό columns exist in the PDF but have no exact named OSM stop; omitted until operator confirmation.",
            "Kini line departures are printed as two independent lists; direction pairing not inferred.",
            "The Kini block sits inside the weekday section; weekend copies are flagged as inferred.",
            "School runs carry published anchors only; intermediate times are uniform 6-minute estimates.",
            "Calendar end date is not printed in the PDF; 2027-03-31 is an assumption to re-verify.",
        ],
    })
    stops_count = len(STOPS)
    trips_count = len(rows["trips.txt"]) - 1
    st_count = len(rows["stop_times.txt"]) - 1
    review["coverage"] = {"stops": stops_count, "trips": trips_count, "stop_times": st_count}

    os.makedirs(OUT_DIR, exist_ok=True)
    zip_path = os.path.join(OUT_DIR, "syros_ktel_gtfs.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, rows_ in rows.items():
            buf = io.StringIO()
            csv.writer(buf, lineterminator="\n").writerows(rows_)
            zf.writestr(name, buf.getvalue().encode("utf-8-sig"))
    with open(os.path.join(OUT_DIR, "syros_gtfs_review.json"), "w", encoding="utf-8") as f:
        json.dump(review, f, ensure_ascii=False, indent=1)
    print("wrote", zip_path)
    print("stops=%d trips=%d stop_times=%d" % (stops_count, trips_count, st_count))
    print("blockers:", len(review["activation_blockers"]))


if __name__ == "__main__":
    main()

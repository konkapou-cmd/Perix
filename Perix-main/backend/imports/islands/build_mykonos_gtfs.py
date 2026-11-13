"""Compile the Mykonos Bus winter timetable into a review GTFS archive.

Source: https://mykonosbus.com/bus-timetables/ (fetched 2026-11-12).
The site publishes only a sparse winter summary; several corridors are empty
and the page still carries the stale "2024 Official Bus Schedule" title.
Offline artifact only: no runtime import, no activation.

Attribution: © ΚΤΕΛ Μυκόνου / Mykonos Bus (mykonosbus.com); OSM ODbL.
"""
from __future__ import annotations

import csv
import io
import json
import os
import zipfile

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
AGENCY_ID = "MYK_KTEL"
TIMEZONE = "Europe/Athens"
FETCHED = "2026-11-12"
# Per-corridor validity printed on the Greek timetable page:
#  - OLD PORT - NEW PORT: valid from 11/11/2026
#  - ANO MERA: valid from 1/11/2026 (board from the New Peripheral)
#  - ORNOS/AGIOS IOANNIS, PARADISE, PARAGA, PLATIS GIALOS: valid from 1/11/2026
# The page header still says "Λεωφορεία 2024"; dates above are the per-block
# printed values and are recorded per corridor in the review.
CALENDAR_END = "2027-03-31"  # winter service; end not printed on page

STOPS = {
    "MYK_FABRIKA": ("Φάμπρικα", 37.44282, 25.32849,
                    "INTERIOR_POINT_OF_OSM_WAY_736284303_BUS_STATION_FABRIKA",
                    "bus_station polygon interior point, not an entrance"),
    "MYK_OLD_PORT": ("Παλιό Λιμάνι", 37.45087, 25.32872, "OSM_NODE_6534142968_OLD_PORT", None),
    "MYK_NEW_PORT": ("Νέο Λιμάνι", 37.46481, 25.32321, "OSM_NODE_5891717523_NEW_PORT", None),
    "MYK_ORNOS": ("Όρνος", 37.42281, 25.32380, "OSM_NODE_5891795972_ORNOS", None),
    "MYK_AGIOS_IOANNIS": ("Άγιος Ιωάννης", 37.42314, 25.31221, "OSM_NODE_9887401131_AGIOS_IOANNIS", None),
    "MYK_PLATYS_GIALOS": ("Πλατύς Γιαλός", 37.41446, 25.34196, "OSM_NODE_892788630_PLATYS_GIALOS", None),
    "MYK_PARADISE": ("Paradise", 37.41435, 25.35360, "OSM_NODE_9886622720_PARADISE_VIEW",
                     "Paradise View node near Paradise bus stop; operator confirmation pending"),
}
# Corridors published but skipped: stops unresolved or no times printed.
SKIPPED_CORRIDORS = {
    "FABRIKA <-> PARAGA": "Paraga stop has no named OSM node; times printed (07:15/14:10, 07:25) but endpoint unresolved.",
    "NEW PERIPHERAL <-> ANO MERA": ("Ano Mera stop has no named OSM node; valid from 1/11/2026, "
                                     "departs the New Peripheral (printed: from Old Port column 10:00/13:15/16:30; "
                                     "from Ano Mera 07:30/10:15/13:30/16:45). Boarding relocation note applies."),
    "OLD PORT <-> AGIOS STEFANOS": "no times printed on page",
    "NEW PERIPHERAL <-> KALAFATIS": "no times printed on page; New Peripheral relocation note applies",
    "NEW PERIPHERAL <-> ELIA": "no times printed on page; New Peripheral relocation note applies",
    "OLD PORT <-> KALO LIVADI": "no times printed on page",
    "OLD PORT <-> PANORMOS": "no times printed on page",
    "FABRIKA <-> NEW PORT": "no times printed on page",
    "FABRIKA <-> AIRPORT": "no times printed on page",
    "FABRIKA <-> SUPER PARADISE": "no times printed on page",
    "AIRPORT <-> NEW PORT": "no times printed on page",
}

# published summary tables (winter, as printed on 2026-11-12)
OLD_NEW = {  # FROM OLD PORT | FROM NEW PORT
    "FROM_OLD": ["11:45", "12:45"],
    "FROM_NEW": ["12:00", "13:00"],
}
LEG_OLD_NEW_MIN = 15  # 11:45 -> 12:00 consistent (inferred, flagged)

FAB_ORNOS_AGI = {  # FROM FABRIKA | FROM ORNOS | FROM AGIOS IOANNIS
    "FROM_FAB": ["07:15", "14:10"],
    "FROM_ORNOS": ["07:25"],
    "FROM_AGI": ["07:30"],
}
LEG_FAB_ORNOS_MIN = 10   # 07:15 -> 07:25 published on the same row
LEG_ORNOS_AGI_MIN = 5    # 07:25 -> 07:30 published on the same row

FAB_PARADISE = {"FROM_FAB": ["07:15", "14:10"], "FROM_PARADISE": ["07:30"]}
LEG_FAB_PARADISE_MIN = 15  # 07:15 -> 07:30 published on the same row

FAB_PLATYS = {"FROM_FAB": ["07:40", "14:10"], "FROM_PLATYS": ["07:50"]}
LEG_FAB_PLATYS_MIN = 10  # 07:40 -> 07:50 published on the same row


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
    rows["agency.txt"].append([AGENCY_ID, "ΚΤΕΛ Μυκόνου / Mykonos Bus", "https://mykonosbus.com", TIMEZONE, "el"])
    for stop_id, (name, lat, lon, method, flag) in STOPS.items():
        rows["stops.txt"].append([stop_id, name, "%.6f" % lat, "%.6f" % lon])
    route_defs = [
        ("MYK_OLDNEW", "ΠΑΛΙΟ-ΝΕΟ", "Παλιό Λιμάνι - Νέο Λιμάνι", "3"),
        ("MYK_FAB_ORNOS_AGI", "ΦΑΜΠΡΙΚΑ-ΟΡΝΟΣ-ΑΓΙΟΣ", "Φάμπρικα - Όρνος - Άγιος Ιωάννης", "3"),
        ("MYK_FAB_PARADISE", "ΦΑΜΠΡΙΚΑ-PARADISE", "Φάμπρικα - Paradise", "3"),
        ("MYK_FAB_PLATYS", "ΦΑΜΠΡΙΚΑ-ΠΛΑΤΥΣ", "Φάμπρικα - Πλατύς Γιαλός", "3"),
    ]
    for rid, short, long, rt in route_defs:
        rows["routes.txt"].append([rid, AGENCY_ID, short, long, rt])
    # The page prints no weekday/weekend split and no service period: assume
    # daily winter service, heavily flagged.
    rows["calendar.txt"].append(["ALL", "1", "1", "1", "1", "1", "1", "1",
                                 FETCHED.replace("-", ""), CALENDAR_END.replace("-", "")])
    rows["feed_info.txt"].append(["ΚΤΕΛ Μυκόνου / Mykonos Bus", "https://mykonosbus.com/bus-timetables/",
                                  "el", "manual-transcription-" + FETCHED])

    trip_seq = 0
    review = {"trips": [], "skipped_corridors": SKIPPED_CORRIDORS, "notes": []}

    def add_trip(route_id, headsign, stop_time_pairs, direction_id="0", flags=None):
        nonlocal trip_seq
        trip_seq += 1
        trip_id = "%s_%03d" % (route_id, trip_seq)
        rows["trips.txt"].append([route_id, "ALL", trip_id, headsign, direction_id])
        for seq, (sid, t) in enumerate(stop_time_pairs, start=1):
            tg = to_gtfs(t) if t.count(":") == 1 else t
            rows["stop_times.txt"].append([trip_id, str(seq), sid, tg, tg])
        review["trips"].append({"trip_id": trip_id, "route_id": route_id, "flags": flags or []})
        return trip_id

    for dep in OLD_NEW["FROM_OLD"]:
        add_trip("MYK_OLDNEW", "Παλιό Λιμάνι → Νέο Λιμάνι",
                 [("MYK_OLD_PORT", dep), ("MYK_NEW_PORT", add_minutes(to_gtfs(dep), LEG_OLD_NEW_MIN))],
                 flags=["LEG_MINUTES_INFERRED_FROM_PAIRED_COLUMN"])
    for dep in OLD_NEW["FROM_NEW"]:
        add_trip("MYK_OLDNEW", "Νέο Λιμάνι → Παλιό Λιμάνι",
                 [("MYK_NEW_PORT", dep), ("MYK_OLD_PORT", add_minutes(to_gtfs(dep), LEG_OLD_NEW_MIN))],
                 direction_id="1", flags=["LEG_MINUTES_INFERRED_FROM_PAIRED_COLUMN"])

    # 07:15 chain: Fabrika -> Ornos -> Agios Ioannis (published on one row)
    add_trip("MYK_FAB_ORNOS_AGI", "Φάμπρικα → Όρνος → Άγιος Ιωάννης",
             [("MYK_FABRIKA", "07:15"), ("MYK_ORNOS", "07:25"), ("MYK_AGIOS_IOANNIS", "07:30")],
             flags=["PUBLISHED_ROW_CHAIN"])
    add_trip("MYK_FAB_ORNOS_AGI", "Φάμπρικα → Όρνος",
             [("MYK_FABRIKA", "14:10"), ("MYK_ORNOS", add_minutes(to_gtfs("14:10"), LEG_FAB_ORNOS_MIN))],
             flags=["ONWARD_LEG_NOT_PRINTED", "LEG_MINUTES_FROM_PUBLISHED_ROW"])
    add_trip("MYK_FAB_ORNOS_AGI", "Όρνος → Φάμπρικα",
             [("MYK_ORNOS", "07:25"), ("MYK_FABRIKA", add_minutes(to_gtfs("07:25"), LEG_FAB_ORNOS_MIN))],
             direction_id="1", flags=["LEG_MINUTES_INFERRED_FROM_OUTBOUND_ROW"])
    add_trip("MYK_FAB_ORNOS_AGI", "Άγιος Ιωάννης → Φάμπρικα",
             [("MYK_AGIOS_IOANNIS", "07:30"), ("MYK_ORNOS", add_minutes(to_gtfs("07:30"), LEG_ORNOS_AGI_MIN)),
              ("MYK_FABRIKA", add_minutes(to_gtfs("07:30"), LEG_ORNOS_AGI_MIN + LEG_FAB_ORNOS_MIN))],
             direction_id="1", flags=["LEG_MINUTES_INFERRED_FROM_OUTBOUND_ROW"])

    for dep in FAB_PARADISE["FROM_FAB"]:
        add_trip("MYK_FAB_PARADISE", "Φάμπρικα → Paradise",
                 [("MYK_FABRIKA", dep), ("MYK_PARADISE", add_minutes(to_gtfs(dep), LEG_FAB_PARADISE_MIN))],
                 flags=["LEG_MINUTES_FROM_PUBLISHED_ROW"])
    for dep in FAB_PARADISE["FROM_PARADISE"]:
        add_trip("MYK_FAB_PARADISE", "Paradise → Φάμπρικα",
                 [("MYK_PARADISE", dep), ("MYK_FABRIKA", add_minutes(to_gtfs(dep), LEG_FAB_PARADISE_MIN))],
                 direction_id="1", flags=["LEG_MINUTES_INFERRED_FROM_OUTBOUND_ROW"])

    for dep in FAB_PLATYS["FROM_FAB"]:
        add_trip("MYK_FAB_PLATYS", "Φάμπρικα → Πλατύς Γιαλός",
                 [("MYK_FABRIKA", dep), ("MYK_PLATYS_GIALOS", add_minutes(to_gtfs(dep), LEG_FAB_PLATYS_MIN))],
                 flags=["LEG_MINUTES_FROM_PUBLISHED_ROW"])
    for dep in FAB_PLATYS["FROM_PLATYS"]:
        add_trip("MYK_FAB_PLATYS", "Πλατύς Γιαλός → Φάμπρικα",
                 [("MYK_PLATYS_GIALOS", dep), ("MYK_FABRIKA", add_minutes(to_gtfs(dep), LEG_FAB_PLATYS_MIN))],
                 direction_id="1", flags=["LEG_MINUTES_INFERRED_FROM_OUTBOUND_ROW"])
    return rows, review


def main():
    rows, review = build()
    review.update({
        "schema_version": 1,
        "status": "REVIEW_ARTIFACT_NOT_ACTIVATED",
        "runtime_eligible": False,
        "public_release_allowed": False,
        "source_page": "https://mykonosbus.com/bus-timetables/",
        "fetched": FETCHED,
        "attribution": "© ΚΤΕΛ Μυκόνου / Mykonos Bus; OpenStreetMap contributors, ODbL",
        "activation_blockers": [
            "PAGE_TITLE_STALE_2024",
            "DAY_VALIDITY_NOT_PRINTED",
            "SERVICE_PERIOD_END_NOT_PRINTED",
            "PARAGA_AND_ANO_MERA_STOPS_UNRESOLVED",
            "ANO_MERA_BOARDING_AT_NEW_PERIPHERAL_NOT_A_NAMED_STOP",
            "RETURN_LEGS_INFERRED",
            "SUMMER_SCHEDULE_NOT_PUBLISHED_ON_SITE",
            "OPERATOR_REUSE_RIGHTS_TO_CONFIRM",
        ],
        "notes": [
            "Winter schedule only; the page prints no weekday/weekend split, so ALL-day calendar is assumed and flagged.",
            "Per-corridor printed validity: OLD-NEW from 11/11/2026; ANO MERA/ORNOS/PARADISE/PARAGA/PLATIS from 1/11/2026.",
            "Ano Mera, Kalafati and Elia routes now board from the New Peripheral (page note), not the Old Port.",
            "The page header still reads 'Λεωφορεία 2024' despite the fresh per-block dates above.",
            "Empty corridor tables (Airport, Elia, Kalafatis, Kalo Livadi, Panormos, Agios Stefanos, Super Paradise, Paraga, Ano Mera stops) are recorded in skipped_corridors.",
            "Fabrika coordinates are the interior point of the OSM bus_station polygon, not a confirmed entrance.",
            "Paradise coordinates use the nearby 'Paradise View' OSM node; operator confirmation pending.",
        ],
    })
    trips_count = len(rows["trips.txt"]) - 1
    st_count = len(rows["stop_times.txt"]) - 1
    review["coverage"] = {"stops": len(STOPS), "trips": trips_count, "stop_times": st_count}

    os.makedirs(OUT_DIR, exist_ok=True)
    zip_path = os.path.join(OUT_DIR, "mykonos_ktel_gtfs.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, rows_ in rows.items():
            buf = io.StringIO()
            csv.writer(buf, lineterminator="\n").writerows(rows_)
            zf.writestr(name, buf.getvalue().encode("utf-8-sig"))
    with open(os.path.join(OUT_DIR, "mykonos_gtfs_review.json"), "w", encoding="utf-8") as f:
        json.dump(review, f, ensure_ascii=False, indent=1)
    print("wrote", zip_path)
    print("stops=%d trips=%d stop_times=%d" % (len(STOPS), trips_count, st_count))
    print("blockers:", len(review["activation_blockers"]))


if __name__ == "__main__":
    main()

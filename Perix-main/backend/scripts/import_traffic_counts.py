"""Import reviewed normalized traffic-count CSV into Perix.

This script intentionally does NOT parse city PDFs/Excel/HTML. Source-specific
acquisition happens outside runtime and must produce the canonical CSV below.
That keeps the motion engine independent from each city's publication format.

Required CSV columns:
    count_site_id,measurement_date,interval_start,interval_end,
    road_name,approach_key,total

Recommended columns:
    source,source_document,source_url,source_page,method,cross_street,
    direction,osm_direction,cars,buses,trucks,motorcycles,
    latitude,longitude,matched_way_id,match_method,match_confidence

`osm_direction` is FORWARD, BACKWARD or BOTH relative to OSM way node order.
If unknown, use BOTH. Never infer OSM direction from a human label without
verifying the measured travel direction.

Usage from backend/:
    python -m scripts.import_traffic_counts path/to/counts.csv
    python -m scripts.import_traffic_counts counts.csv --region-id magdeburg
"""
import argparse
import asyncio
import csv
from pathlib import Path

from mobility.regions import get_active_region, get_region
from mobility.traffic_counts import upsert_count_records
from mobility.traffic_profiles import rebuild_traffic_profiles


def _read_csv(path: Path) -> list:
    raw = path.read_text(encoding="utf-8-sig")
    try:
        dialect = csv.Sniffer().sniff(raw[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return list(csv.DictReader(raw.splitlines(), dialect=dialect))


async def _run(
    path: Path,
    *,
    region_id: str | None,
    network_id: str | None,
    try_match: bool,
    rebuild_profiles: bool,
) -> None:
    region = get_region(region_id) if region_id else get_active_region()
    resolved_network_id = str(network_id or region.network_id)
    rows = _read_csv(path)
    if not rows:
        raise SystemExit("CSV contains no data rows")

    result = await upsert_count_records(
        rows,
        region_id=region.region_id,
        network_id=resolved_network_id,
        try_match=try_match,
    )
    print(
        f"traffic counts [{region.region_id}/{resolved_network_id}]: "
        f"stored={result['stored']} matched={result['matched']} "
        f"unmatched={result['unmatched']}"
    )

    if rebuild_profiles:
        profiles = await rebuild_traffic_profiles(
            region_id=region.region_id,
            network_id=resolved_network_id,
        )
        print(f"traffic profiles: {profiles}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--region-id", default=None)
    parser.add_argument("--network-id", default=None)
    parser.add_argument(
        "--no-match",
        action="store_true",
        help="Do not attempt matching to the selected region's OSM snapshot.",
    )
    parser.add_argument(
        "--no-profiles",
        action="store_true",
        help="Import counts only; do not rebuild traffic profiles afterwards.",
    )
    args = parser.parse_args()

    if not args.csv_path.exists():
        raise SystemExit(f"file not found: {args.csv_path}")

    asyncio.run(
        _run(
            args.csv_path,
            region_id=args.region_id,
            network_id=args.network_id,
            try_match=not args.no_match,
            rebuild_profiles=not args.no_profiles,
        )
    )


if __name__ == "__main__":
    main()

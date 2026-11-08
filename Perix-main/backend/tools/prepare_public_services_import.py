"""Create a gated staging JSON from the supplied PERIX public-service export."""
import argparse
import json
from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from public_services.staging_import import read_source


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="PERIX_90_IMAGES_AND_COORDINATES_WEBP.zip or a mapped JSON file")
    parser.add_argument("output", type=Path, help="Destination for the review-gated staging API documents")
    parser.add_argument("--coordinates-user-approved", action="store_true",
                        help="Promote supplied coordinate candidates after an explicit review approval")
    parser.add_argument("--publish-approved-coordinates", action="store_true",
                        help="Mark coordinate-approved records as published; requires explicit review approval")
    args = parser.parse_args()
    approve_coordinates = args.coordinates_user_approved or args.publish_approved_coordinates
    records = read_source(args.input, approve_candidate_coordinates=approve_coordinates,
                          publish_approved_coordinates=args.publish_approved_coordinates)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(records)} staging records at {args.output}")
    print("Illustration paths are linked; records without coordinates remain hidden.")
    if args.publish_approved_coordinates:
        print("Coordinate-approved records are marked published in the staging export.")
    elif approve_coordinates:
        print("Approved coordinates are promoted, but records remain unpublished.")
    else:
        print("Coordinate candidates remain review-gated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Read-only comparison of MVB public stop sequence against exported Perix network.

No network access, no scraping, no secrets. Returns:
  0: stop lists match and reference operator_approved metadata is true
  2: hard discrepancy with provided network
  3: missing evidence / outside reference period / unapproved transcription
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mobility.official_route_audit import official_route_audit


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--network', required=True, type=Path)
    ap.add_argument('--reference', required=True, type=Path)
    ap.add_argument('--output', type=Path)
    args = ap.parse_args(argv)
    network = json.loads(args.network.read_text(encoding='utf-8'))
    reference = json.loads(args.reference.read_text(encoding='utf-8'))
    report = official_route_audit(network, reference)
    body = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    print(body, end='')
    if args.output:
        args.output.write_text(body, encoding='utf-8')
    return {'STOP_LIST_TECHNICAL_MATCH': 0, 'BLOCKED': 2,
            'INSUFFICIENT_EVIDENCE': 3, 'OUTSIDE_REFERENCE_WINDOW': 3}[report['status']]


if __name__ == '__main__':
    raise SystemExit(main())

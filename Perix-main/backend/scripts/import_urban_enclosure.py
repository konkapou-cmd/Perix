"""Import offline building footprints as per-way urban enclosure ratios.

Source acquisition happens outside runtime (Overpass export to JSON).
This command only converts reviewed evidence into way attributes:

    python -m scripts.import_urban_enclosure compact overpass_tiles/ -o buildings.json
    python -m scripts.import_urban_enclosure import buildings.json --mongo-url ... --db ... --region-id magdeburg --graph-v 1793043763

Without --apply this is a dry run: it prints counts and the value
distribution without writing. Enclosure is a documented v1 heuristic
(building centroids in 50 m sample boxes along the centerline), never
a legal measurement. Ways outside fetch coverage keep urban_enclosure
unset (unknown), never 0.0.
"""
import argparse
import asyncio
import datetime
import json
import math
from pathlib import Path


def _equirect_area_m2(ring):
    pts = [(float(p[0]), float(p[1])) for p in (ring or []) if len(p) >= 2]
    if len(pts) < 3:
        return 0.0, None
    ref = sum(p[0] for p in pts) / len(pts)
    kx = 111320.0 * math.cos(math.radians(ref))
    xy = [(lo * kx, la * 110540.0) for la, lo in pts]
    area = abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(xy, xy[1:] + xy[:1]))) / 2.0
    return (area if math.isfinite(area) else 0.0,
            [sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)])


def compact_tiles(tile_dir: Path):
    buildings = []
    coverage = []
    files = sorted(tile_dir.glob('tile_*.json'))
    if not files:
        raise SystemExit(f'no tile_*.json in {tile_dir}')
    for fp in files:
        data = json.loads(fp.read_text(encoding='utf-8'))
        for el in data.get('elements', []):
            if el.get('type') != 'way' or not isinstance(el.get('id'), int):
                continue
            geom = el.get('geometry') or []
            ring = [[g['lat'], g['lon']] for g in geom
            area, centroid = _equirect_area_m2(ring)
            if area <= 0.0 or centroid is None:
                continue
            buildings.append({'ring': ring, 'area_m2': round(area, 1),
                              'centroid': [round(centroid[0], 7), round(centroid[1], 7)],
                              'osm_id': el['id']})
        parts = fp.stem.split('_')[1:]
        try:
            coverage.append([float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])])
        except (IndexError, ValueError):
            pass
    return {'buildings': buildings, 'coverage': coverage,
            'source': 'OpenStreetMap Overpass API, building=* ways'}


async def run_import(args) -> int:
    from mobility.infrastructure import build_building_grid, way_enclosure
    payload = json.loads(Path(args.buildings).read_text(encoding='utf-8'))
    buildings = payload.get('buildings', [])
    grid = build_building_grid(buildings)
    grid['coverage'] = payload.get('coverage', [])
    print(f'buildings: {len(grid["index"])}, coverage boxes: {len(grid["coverage"])}')

    from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

    mongo = AsyncIOMotorClient(args.mongo_url, serverSelectionTimeoutMS=15000)
    db = mongo[args.db]
    filt = {'region_id': args.region_id, 'graph_v': int(args.graph_v)}
    kinds = [k.strip() for k in args.kinds.split(',') if k.strip()]
    if kinds:
        filt['kind'] = {'$in': kinds}
    total = await db.mobility_osm_ways.count_documents(filt)
    print(f'ways in scope: {total}')
    values = []
    examined = 0
    async for doc in db.mobility_osm_ways.find(filt, {'_id': 0, 'way_id': 1, 'points': 1}):
        examined += 1
        pts = doc.get('points') or []
        enc = way_enclosure([[p[0], p[1]] for p in pts], grid, buffer_m=args.buffer_m)
        if enc is None:
            continue
        values.append((doc.get('way_id'), round(enc, 3)))
        if examined % 2000 == 0:
            print(f'... {examined}/{total}')
    import statistics
    hist = {}
    for _, v in values:
        hist[round(v, 1)] = hist.get(round(v, 1), 0) + 1
    print(f'computed: {len(values)}, distribution: {dict(sorted(hist.items()))}')
    if values:
        print(f'median: {statistics.median(v for _, v in values):.3f}')
    if not args.apply:
        print('dry run: no writes (pass --apply to write urban_enclosure)')
        return 0
    updated = 0
    for way_id, enc in values:
        r = await db.mobility_osm_ways.update_one(
            {'region_id': args.region_id, 'graph_v': int(args.graph_v), 'way_id': way_id},
            {'$set': {'urban_enclosure': enc,
                      'enclosure_computed_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}})
        updated += r.modified_count
    print(f'updated way docs: {updated}')
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description='Offline building-enclosure import (dry run unless --apply).')
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('compact', help='Overpass tile dir -> buildings.json')
    c.add_argument('tile_dir')
    c.add_argument('-o', '--output', required=True)
    im = sub.add_parser('import', help='buildings.json -> mobility_osm_ways.urban_enclosure')
    im.add_argument('buildings')
    im.add_argument('--mongo-url', required=True)
    im.add_argument('--db', required=True)
    im.add_argument('--region-id', required=True)
    im.add_argument('--graph-v', required=True)
    im.add_argument('--kinds', default='road,rail')
    im.add_argument('--buffer-m', type=float, default=50.0)
    im.add_argument('--apply', action='store_true')
    args = ap.parse_args(argv)
    if args.cmd == 'compact':
        payload = compact_tiles(Path(args.tile_dir))
        Path(args.output).write_text(json.dumps(payload), encoding='utf-8')
        print(f'compacted {len(payload["buildings"])} buildings -> {args.output}')
        return 0
    return asyncio.run(run_import(args))


if __name__ == '__main__':
    raise SystemExit(main())

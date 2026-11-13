"""PERIX 3D EUBUCCO matching — Germany only (official cadastre ground truth).
Greece EUBUCCO rows are repackaged OSM/MS (same underlying data) — skipped by
design; Greece keeps OSM-direct + Microsoft. Per-PERIX-point DWithin queries
(meters, EPSG:3035), no bulk downloads. Priority: LoD2 > EUBUCCO-ground-truth
~= OSM-verified > EUBUCCO-estimated/MS. ODbL license, attribution kept.
"""
import io, sys, json, math, csv
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
from collections import Counter
import duckdb

STAGE = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging')
EUB_ASSETS = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d\perix-3d-assets-eub.json')
QA_CSV = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\eub-match-qa.csv')
OPEN_SPACE = {'parks-gardens', 'beaches', 'squares', 'playgrounds', 'cemeteries',
              'sports-grounds', 'natural-landmarks', 'greenery', 'memorials'}
FAMILY_TOPS = {'civic-admin', 'social-support', 'health', 'education-culture-sport', 'employment',
               'economy-business', 'environment', 'construction-property-transport', 'justice-safety'}
LOC_SUBS = {'churches', 'parks-gardens', 'squares', 'sports-grounds', 'memorials', 'historic-buildings',
            'playgrounds', 'beaches', 'natural-landmarks'}
_SUB_TOP = {}
try:
    _tax = json.load(open(STAGE.parent / 'taxonomy.json', encoding='utf-8'))
    for _top in _tax['children']:
        for _s in _top.get('children', []):
            _SUB_TOP[_s['id']] = _top['id']
except OSError:
    pass
SUB_TOP = _SUB_TOP


def dress_of(sub):
    if sub in FAMILY_TOPS:
        return sub
    if sub in LOC_SUBS:
        return 'locations'
    return SUB_TOP.get(sub, 'default')


def main():
    stage = []
    for fn in ['perix_90_candidates.json', 'perix_gardelegen_candidates.json']:
        stage += json.load(open(STAGE / fn, encoding='utf-8'))
    pts = []
    for r in stage:
        sub = (r.get('subcategory_ids') or [None])[0]
        lat, lng = r.get('latitude'), r.get('longitude')
        if lat is None:
            lat, lng = r.get('candidate_latitude'), r.get('candidate_longitude')
        if lat is None or sub in OPEN_SPACE:
            continue
        pts.append({'perixId': r['service_id'], 'source': r['source_record_id'],
                    'city': r['city_id'], 'sub': sub, 'lat': lat, 'lng': lng})
    print('DE matchable points:', len(pts))
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_endpoint='s3.eubucco.com';")
    con.execute("SET s3_url_style='path';")
    con.execute("SET s3_region='eu';")
    con.execute("SET geometry_always_xy=true;")
    assets, rows = [], []
    for p in pts:
        q = f"""SELECT id, height, height_source, geometry_source, type, subtype,
            ST_AsText(ST_Transform(geometry, 'EPSG:3035', 'EPSG:4326')) AS wkt
            FROM 's3://eubucco/v0.2/buildings/parquet/nuts_id=DEE0/DEE0.parquet'
            WHERE ST_DWithin(geometry,
              ST_Transform(ST_Point({p['lng']}, {p['lat']}), 'EPSG:4326', 'EPSG:3035'), 120)
            LIMIT 25"""
        row = {'perix_id': p['perixId'], 'source': p['source'], 'city': p['city'],
               'sub': p['sub'], 'candidates': 0, 'verdict': '', 'detail': ''}
        try:
            res = con.execute(q).fetchall()
        except Exception as e:
            row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'query {type(e).__name__}')
            rows.append(row)
            continue
        inside = []
        for bid, h, hsrc, gsrc, typ, sub, wkt in res:
            try:
                ring = [(float(x.split()[0]), float(x.split()[1])) for x in wkt[wkt.index('((')+2:wkt.index('))')].split(',')]
            except ValueError:
                continue
            if len(ring) < 4:
                continue
            if point_in_ring(p['lng'], p['lat'], ring):
                inside.append({'ring': ring, 'h': h, 'hsrc': hsrc, 'gsrc': gsrc,
                               'type': typ, 'subtype': sub, 'bid': bid})
        row['candidates'] = len(inside)
        gt = [c for c in inside if c['hsrc'] != 'estimated' and c['h'] is not None]
        if not inside:
            row.update(verdict='GAP', detail='no EUBUCCO footprint contains point')
        elif len(gt) > 1:
            row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'{len(gt)} ground-truth footprints contain point')
        elif len(inside) > 1 and not gt:
            row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'{len(inside)} footprints contain point')
        else:
            c = gt[0] if gt else inside[0]
            ring = c['ring']
            if ring[0] != ring[-1]:
                ring = ring + [ring[0]]
            area = ring_area(ring)
            measured = c['hsrc'] != 'estimated' and c['h'] is not None
            try:
                hv = float(c['h']) if measured else None
            except (TypeError, ValueError):
                hv, measured = None, False
            if not (10 <= area <= 200000):
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'area {area:.0f}')
            else:
                assets.append({
                    'perixId': p['perixId'], 'level': 'C' if measured else 'D',
                    'latitude': p['lat'], 'longitude': p['lng'],
                    'footprint': [[round(x, 7), round(y, 7)] for x, y in ring],
                    **({'heightM': round(hv, 2)} if measured and hv and 2 <= hv <= 120 else {}),
                    'roofShape': None, 'color': None,
                    'dress': dress_of(p['sub']), 'city': p['city'],
                    'evidence': {'sourceUrl': f'eubucco#{c["bid"]}', 'license': 'ODbL-1.0',
                                 'checkedAt': '2026-11-13', 'areaM2': round(area),
                                 'heightSource': c['hsrc'], 'geometrySource': c['gsrc'],
                                 'measuredHeight': bool(measured and hv)},
                })
                row.update(verdict='3D_READY' if (measured and hv) else 'OUTLINE_ONLY',
                           detail=f'{c["gsrc"]}/{c["hsrc"]} area {area:.0f}' + (f' h {hv}m' if measured and hv else ''))
        rows.append(row)
    EUB_ASSETS.write_text(json.dumps({'schema': 'perix-3d-assets/v1', 'assets': assets}, ensure_ascii=False), encoding='utf-8')
    with open(QA_CSV, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print('eubucco assets:', len(assets), '|', Counter(r['verdict'] for r in rows))


def ring_area(ring):
    if len(ring) < 4:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = 111320 * math.cos(lat0 * math.pi / 180)
    s = 0.0
    for i in range(len(ring) - 1):
        s += ring[i][0] * kx * ring[i+1][1] * 111320 - ring[i+1][0] * kx * ring[i][1] * 111320
    return abs(s) / 2


def point_in_ring(lng, lat, ring):
    inside = False
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside


if __name__ == '__main__':
    main()

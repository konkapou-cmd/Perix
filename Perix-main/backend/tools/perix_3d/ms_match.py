"""PERIX 3D Microsoft footprints matching (CDLA Permissive 2.0).
Streams the 7 cached tiles once; matches PERIX coords by point-in-polygon.
MS outlines feed OUTLINE_ONLY candidates; MS heights are ALWAYS estimates.
Never touches verified assets (writes a SEPARATE ms file; merge step applies priority).
Non-building categories (parks, beaches, squares...) are skipped by design.
"""
import io, sys, json, gzip, math, csv
from pathlib import Path
from collections import Counter, defaultdict
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

STAGE = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging')
TILES = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\ms-tiles')
MS_ASSETS = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d\perix-3d-assets-ms.json')
ENRICH = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d\perix-3d-enrichment.json')
QA_CSV = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\ms-match-qa.csv')

AREA_CITIES = {'magdeburg': ['de-magdeburg'], 'gardelegen': ['de-gardelegen'],
               'acharnes': ['gr-acharnes'], 'aak': ['gr-agioi-anargyroi'],
               'syros': ['gr-syros'], 'mykonos': ['gr-mykonos']}
OPEN_SPACE = {'parks-gardens', 'beaches', 'squares', 'playgrounds', 'cemeteries',
              'sports-grounds', 'natural-landmarks', 'greenery', 'memorials'}
FAMILY_TOPS = {'civic-admin', 'social-support', 'health', 'education-culture-sport', 'employment',
               'economy-business', 'environment', 'construction-property-transport', 'justice-safety'}
LOC_SUBS = {'churches', 'parks-gardens', 'squares', 'sports-grounds', 'memorials', 'historic-buildings',
            'playgrounds', 'beaches', 'natural-landmarks'}


def dress_of(sub):
    if sub in FAMILY_TOPS:
        return sub
    if sub in LOC_SUBS:
        return 'locations'
    return 'default'


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


def main():
    stage = []
    for fn in ['perix_90_candidates.json', 'perix_gardelegen_candidates.json',
               'perix_athens_candidates.json', 'perix_islands_candidates.json']:
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
    print('matchable points:', len(pts))
    cands = defaultdict(list)
    nfeat = 0
    for tf in sorted(TILES.glob('*.csv.gz')):
        area = tf.name.split('_')[0]
        plist = [p for p in pts if p['city'] in AREA_CITIES.get(area, [])]
        if not plist:
            continue
        grid = defaultdict(list)
        for p in plist:
            grid[(round(p['lat'], 2), round(p['lng'], 2))].append(p)
        with gzip.open(tf, 'rt', encoding='utf-8') as f:
            for line in f:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                nfeat += 1
                coords = (d.get('geometry') or {}).get('coordinates', [[]])[0]
                if len(coords) < 4:
                    continue
                lons = [c[0] for c in coords]
                lats = [c[1] for c in coords]
                lox, hix = min(lons), max(lons)
                loy, hiy = min(lats), max(lats)
                seen = set()
                for cx in range(int(math.floor(lox * 100)), int(math.floor(hix * 100)) + 1):
                    for cy in range(int(math.floor(loy * 100)), int(math.floor(hiy * 100)) + 1):
                        for p in grid.get((cy / 100, cx / 100), []):
                            if p['perixId'] in seen:
                                continue
                            if lox <= p['lng'] <= hix and loy <= p['lat'] <= hiy:
                                if point_in_ring(p['lng'], p['lat'], coords):
                                    pr = d.get('properties', {})
                                    cands[p['perixId']].append({
                                        'ring': coords, 'height': pr.get('height'),
                                        'confidence': pr.get('confidence'), 'tile': tf.name})
                                    seen.add(p['perixId'])
        print(f'{tf.name}: candidates so far {sum(len(v) for v in cands.values())}', flush=True)
    print('features scanned:', nfeat, '| points with candidates:', len(cands))
    assets, enrich, rows = [], {}, []
    for p in pts:
        lst = cands.get(p['perixId'], [])
        row = {'perix_id': p['perixId'], 'source': p['source'], 'city': p['city'],
               'sub': p['sub'], 'candidates': len(lst), 'verdict': '', 'detail': ''}
        est, conf = None, -1.0
        if not lst:
            row.update(verdict='GAP', detail='no MS footprint contains point')
        elif len(lst) > 1:
            areas = sorted(ring_area(c['ring']) for c in lst)
            row.update(verdict='MATCH_REVIEW_REQUIRED',
                       detail=f"{len(lst)} footprints contain point (areas {[round(a) for a in areas][:4]})")
        else:
            c = lst[0]
            area = ring_area(c['ring'])
            conf = c['confidence'] if isinstance(c['confidence'], (int, float)) else -1
            h = c['height']
            est = (float(h) if isinstance(h, (int, float)) and h is not None and h >= 0 else None)
            if conf < 0.6:
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'low confidence {conf}')
            elif not (10 <= area <= 200000):
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'area out of range {area:.0f}')
            else:
                ring = c['ring']
                if ring[0] != ring[-1]:
                    ring = ring + [ring[0]]
                assets.append({
                    'perixId': p['perixId'], 'level': 'D', 'latitude': p['lat'], 'longitude': p['lng'],
                    'footprint': [[round(x, 7), round(y, 7)] for x, y in ring],
                    'color': None, 'dress': dress_of(p['sub']), 'city': p['city'],
                    'evidence': {'sourceUrl': f"microsoft/GlobalMLBuildingFootprints#{c['tile']}",
                                 'license': 'CDLA-Permissive-2.0', 'checkedAt': '2026-11-13',
                                 'areaM2': round(area), 'footprintConfidence': conf},
                })
                row.update(verdict='OUTLINE_ONLY', detail=f'area {area:.0f} conf {round(conf, 2)}' +
                           (f' est_h {est}m' if est else ' no height'))
        if row['verdict'] in ('OUTLINE_ONLY', 'MATCH_REVIEW_REQUIRED') and lst:
            c0 = lst[0]
            enrich[p['perixId']] = {
                'perix_id': p['perixId'], 'name': None, 'geometry': None,
                'height_m': None, 'estimated_height_m': est,
                'building_levels': None, 'roof_shape': None, 'roof_height_m': None,
                'ground_elevation_m': None, 'facade_material': None, 'facade_color': None,
                'model_url': None, 'source': 'microsoft/GlobalMLBuildingFootprints',
                'license': 'CDLA-Permissive-2.0', 'source_version': '2026-08-13',
                'verification': row['verdict'], 'visual_style': 'perix_diorama',
                'building_footprint_source': 'microsoft',
                'footprint_confidence': conf if isinstance(conf, float) else None,
                'geometry_source_id': c0['tile'], 'geometry_quality': 'MS_ML_PREDICTION'}
        rows.append(row)
    MS_ASSETS.write_text(json.dumps({'schema': 'perix-3d-assets/v1', 'assets': assets}, ensure_ascii=False), encoding='utf-8')
    ENRICH.write_text(json.dumps({'schema': 'perix-3d-enrichment/v1', 'records': enrich}, ensure_ascii=False), encoding='utf-8')
    with open(QA_CSV, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print('ms assets:', len(assets), '|', Counter(r['verdict'] for r in rows))


if __name__ == '__main__':
    main()

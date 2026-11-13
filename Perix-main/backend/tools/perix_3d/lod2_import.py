"""PERIX 3D LoD2 local import (Sachsen-Anhalt CityGML, DL-DE BY 2.0).
The lvermgeo portal is unreachable from some environments, so this module
imports CityGML/.gml/ZIP files dropped into lod2_inbox/ — no network needed.
Parses LoD2 Buildings: footprint ring, measured height, roof type, ground
elevation, envelope. Matches selected PERIX IDs by point-in-polygon with the
same QA discipline as the OSM/MS matchers. Priority: official LoD2 wins over
OSM outlines and MS predictions for geometry, roofs and dimensions.
CRS: ETRS89/UTM zone 32N (EPSG:25832) <-> WGS84 via closed-form series (~cm).
Only stdlib (zipfile/xml) — no new dependencies.
"""
import io, sys, json, math, csv, zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

INBOX = Path(__file__).with_name('lod2_inbox')
CACHE = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\perix-3d-lod2')
STAGE = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging')
NS = {'gml': 'http://www.opengis.net/gml', 'bldg': 'http://www.opengis.net/citygml/building/2.0',
      'gen': 'http://www.opengis.net/citygml/generics/2.0'}

# LoD2 roofType codes (CityGML codelist): only forms our renderer builds stay 3D.
ROOF_OK = {'1000': 'flat', '2100': 'gabled', '2200': 'hipped', '2400': 'hipped',
           '3100': 'shed', '3200': 'shed', '3300': 'shed'}


def utm32_to_wgs84(e, n):
    k0, a, f = 0.9996, 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    lon0 = math.radians(9.0)
    m = n / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    lat1 = (mu + (3*e1/2 - 27*e1**3/32) * math.sin(2*mu) + (21*e1**2/16 - 55*e1**4/32) * math.sin(4*mu)
            + (151*e1**3/96) * math.sin(6*mu))
    n1 = a / math.sqrt(1 - e2 * math.sin(lat1)**2)
    t1 = math.tan(lat1)**2
    c1 = e2 / (1 - e2) * math.cos(lat1)**2
    r1 = a * (1 - e2) / (1 - e2 * math.sin(lat1)**2) ** 1.5
    d = (e - 500000) / (n1 * k0)
    lat = lat1 - (n1 * math.tan(lat1) / r1) * (d**2/2 - (5 + 3*t1 + 10*c1 - 4*c1**2) * d**4/24)
    lon = lon0 + (d - (1 + 2*t1 + c1) * d**3/6) / math.cos(lat1)
    return math.degrees(lon), math.degrees(lat)


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


def parse_pos_list(text, dim, utm):
    nums = [float(x.replace(',', '.')) for x in text.split()]
    dim = dim if dim in (2, 3) else 3
    nums = nums[:len(nums) - len(nums) % dim]
    out = []
    for i in range(0, len(nums), dim):
        x, y = nums[i], nums[i+1]
        z = nums[i+2] if dim == 3 else 0.0
        if utm:
            lon, lat = utm32_to_wgs84(x, y)
            out.append((lon, lat, z))
        else:
            out.append((x, y, z))
    return out


def parse_buildings(path):
    """Yield dicts: gml_id, ring[(lng,lat)], zmin, zmax, roof, measured_h, tags."""
    data = path.read_bytes()
    if path.suffix.lower() == '.zip':
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            gmls = [n for n in z.namelist() if n.lower().endswith(('.gml', '.xml'))]
            assert gmls, f'no GML in {path.name}'
            data = z.read(sorted(gmls)[0])
    root = ET.fromstring(data)
    utm = '25832' in (root.get('srsName') or '') or 'ETRS89' in (root.get('srsName') or '')
    for b in root.iter():
        if b.tag.split('}')[-1] != 'Building':
            continue
        gid = b.get('{http://www.opengis.net/gml}id') or b.get('id')
        roof, height, ground = None, None, None
        for el in b.iter():
            tag = el.tag.split('}')[-1]
            if tag == 'roofType' and el.text:
                roof = el.text.strip().split('/')[-1]
            elif tag in ('measuredHeight', 'measuredheight') and el.text:
                try:
                    height = float(el.text.strip().split()[0])
                except ValueError:
                    pass
        rings, zmin, zmax = [], None, None
        for poly in b.iter('{http://www.opengis.net/gml}Polygon'):
            for lr in poly.findall('gml:exterior/gml:LinearRing', NS):
                pl = lr.find('gml:posList', NS)
                if pl is not None and pl.text:
                    dim = pl.get('srsDimension') or lr.get('srsDimension') or poly.get('srsDimension') or '3'
                    try:
                        dim = int(str(dim).strip())
                    except ValueError:
                        dim = 3
                    pts = parse_pos_list(pl.text, dim, utm)
                    rings.append([(x, y) for x, y, _ in pts])
                    zs = [z for _, _, z in pts]
                    if zs:
                        zmin = min(zs) if zmin is None else min(zmin, min(zs))
                        zmax = max(zs) if zmax is None else max(zmax, max(zs))
        if rings:
            yield {'gml_id': gid, 'ring': max(rings, key=len), 'zmin': zmin, 'zmax': zmax,
                   'roof': roof, 'measured_h': height}


def main():
    files = sorted(p for p in INBOX.glob('*') if p.suffix.lower() in ('.gml', '.xml', '.zip')) if INBOX.exists() else []
    print('inbox files:', [p.name for p in files])
    buildings = []
    for p in files:
        bl = list(parse_buildings(p))
        print(p.name, 'buildings:', len(bl))
        buildings += bl
    if not buildings:
        print('EMPTY INBOX — nothing to match. See LOD2_FILES.md for what to download.')
        Path(r'C:\Users\PC\AppData\Local\Temp\opencode\perix-3d-lod2-report.txt').write_text(
            'EMPTY INBOX\n', encoding='utf-8')
        return
    stage = []
    for fn in ['perix_90_candidates.json', 'perix_gardelegen_candidates.json']:
        stage += json.load(open(STAGE / fn, encoding='utf-8'))
    de = [r for r in stage if r.get('country_code') == 'DE']
    rows, assets = [], []
    for r in de:
        sub = (r.get('subcategory_ids') or [None])[0]
        lat, lng = r.get('latitude'), r.get('longitude')
        if lat is None:
            lat, lng = r.get('candidate_latitude'), r.get('candidate_longitude')
        if lat is None:
            continue
        hits = [b for b in buildings if b['ring'] and point_in_ring(lng, lat, b['ring'])]
        row = {'perix_id': r['service_id'], 'source': r['source_record_id'], 'city': r['city_id'],
               'sub': sub, 'hits': len(hits), 'verdict': '', 'detail': ''}
        if not hits:
            row.update(verdict='GAP', detail='no LoD2 footprint contains point')
        elif len(hits) > 1:
            row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f"{len(hits)} LoD2 footprints contain point")
        else:
            b = hits[0]
            area = ring_area(b['ring'])
            roof = ROOF_OK.get(str(b['roof'] or ''))
            h = b['measured_h']
            if not (10 <= area <= 200000):
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'area {area:.0f}')
            elif h is None or not (2 <= h <= 120):
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail='no plausible measured height')
            else:
                ring = b['ring']
                if ring[0] != ring[-1]:
                    ring = ring + [ring[0]]
                # Level B: official footprint + measured height. Roof shape recorded;
                # the renderer builds gable/hip only with a verified roof rise, else flat top.
                assets.append({
                    'perixId': r['service_id'], 'level': 'B',
                    'latitude': lat, 'longitude': lng,
                    'footprint': [[round(x, 7), round(y, 7)] for x, y in ring],
                    'heightM': round(h, 2),
                    'roofShape': roof or 'flat',
                    'color': None, 'dress': None, 'city': r['city_id'],
                    'evidence': {'sourceUrl': f"lvermgeo-LoD2#{b['gml_id']}",
                                 'license': 'DL-DE BY 2.0', 'checkedAt': '2026-11-13',
                                 'areaM2': round(area), 'roofType': b['roof']},
                })
                row.update(verdict='3D_READY', detail=f'h {h}m roof {b["roof"]} area {area:.0f}')
        rows.append(row)
    with open(r'C:\Users\PC\AppData\Local\Temp\opencode\perix-3d-lod2-qa.csv', 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d\perix-3d-assets-lod2.json').write_text(
        json.dumps({'schema': 'perix-3d-assets/v1', 'assets': assets}, ensure_ascii=False), encoding='utf-8')
    print('lod2 assets:', len(assets), '|', Counter(r['verdict'] for r in rows))


if __name__ == '__main__':
    main()

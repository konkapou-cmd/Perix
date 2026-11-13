"""PERIX 3D Phase-B pilot ingestion: OSM ways/relations -> verified outlines.
Strict matching QA. Only explicit height=* tags allow extrusion; building:levels
is NOT a height. Output: verified assets JSON + QA CSV. Nothing invented.
Cache: local dir (rerunnable offline). Polite Overpass use: batched ids, retries.
"""
import io, sys, json, time, math, re, csv, hashlib
import unicodedata
import urllib.request, urllib.parse
from pathlib import Path
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

MANIFEST = r'C:\Users\PC\Downloads\PERIX_3D_FULL_HANDOFF_FOR_KI\PERIX_3D_HANDOFF\02_3D_REGISTRY\PERIX_3D_ALL_LOCATIONS_MANIFEST.json'
STAGING = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging')
CACHE = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\perix-3d-osm-cache')
CACHE.mkdir(parents=True, exist_ok=True)
ASSETS_OUT = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d\perix-3d-assets.json')
QA_CSV = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\perix-3d-qa.csv')
OVERPASS = 'https://overpass-api.de/api/interpreter'


def overpass(query, tries=4):
    data = urllib.parse.urlencode({'data': query}).encode()
    for attempt in range(tries):
        try:
            req = urllib.request.Request(OVERPASS, data=data, headers={
                'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json',
                'User-Agent': 'Perix3D-Pilot/1.0 (selective lawful reuse; cached reruns)'})
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception as e:
            print(f'  overpass attempt {attempt+1} failed: {type(e).__name__}', flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('overpass unreachable after retries')


def fetch(kind, oid):
    key = CACHE / f'{kind}_{oid}.json'
    if key.exists():
        return json.load(open(key, encoding='utf-8'))
    if kind == 'way':
        d = overpass(f'[out:json][timeout:90];{kind}({oid});out geom;')
    else:
        d = overpass(f'[out:json][timeout:90];rel({oid});>;out geom;')
        # attach relation tags
        rel = overpass(f'[out:json][timeout:90];rel({oid});out tags;')
        d['relation_tags'] = (rel.get('elements') or [{}])[0].get('tags', {})
        d['relation_id'] = oid
    json.dump(d, open(key, 'w', encoding='utf-8'))
    time.sleep(1.5)
    return d


def ring_area_m2(ring):
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
    n = len(ring)
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1 + 1e-12) + x1:
            inside = not inside
    return inside


def strip_acc(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn').casefold()


STOP_TOKENS = {'αγιος', 'αγιου', 'αγιον', 'αγια', 'αγιας', 'αγιων', 'μονη', 'μοναστηρι',
               'ναος', 'ιερος', 'ιερα', 'εκκλησια', 'παναγια', 'αγ', 'αγι', 'οσιος', 'οσια'}

# ELOT 743 simplified Greek->Latin (for matching OSM transliterated names).
_GR_MULTI = {'ου': 'ou', 'αι': 'ai', 'ει': 'ei', 'οι': 'oi', 'αυ': 'au', 'ευ': 'eu',
             'γκ': 'gk', 'μπ': 'b', 'ντ': 'd', 'τσ': 'ts', 'τζ': 'tz', 'γγ': 'ng', 'γκ': 'gk'}
_GR_SINGLE = {'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i',
              'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x',
              'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'y',
              'φ': 'f', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o'}


def transliterate(s):
    s = strip_acc(s or '')
    out, i = [], 0
    while i < len(s):
        pair = s[i:i+2]
        if pair in _GR_MULTI:
            out.append(_GR_MULTI[pair])
            i += 2
        else:
            out.append(_GR_SINGLE.get(s[i], s[i]))
            i += 1
    return ''.join(out)


def name_tokens(s):
    return {t for t in re.split(r'\W+', strip_acc(s)) if len(t) > 3} - STOP_TOKENS


def names_agree(osm_names, rec_names):
    """Exact match wins. Else Greek-declension-tolerant stem overlap (≥5 chars)."""
    o = {strip_acc(n) for n in osm_names if n}
    r = {strip_acc(n) for n in rec_names if n}
    if o & r:
        return True
    ost = set()
    for n in o:
        ost |= name_tokens(n)
    rst = set()
    for n in r:
        rst |= name_tokens(n)
    for a in ost:
        for b in rst:
            sa, sb = a[:6], b[:6]
            if len(sa) >= 5 and len(sb) >= 5 and (sa.startswith(sb) or sb.startswith(sa)):
                return True
    return False


def main():
    feats = json.load(open(MANIFEST, encoding='utf-8'))['features']
    # OUR canonical ids: islands join on source_record_id; legacy514 joins by
    # verified seq order (1:1 with staging file order — asserted per record).
    tats = {}
    for fn in ['perix_90_candidates.json', 'perix_gardelegen_candidates.json',
               'perix_athens_candidates.json', 'perix_islands_candidates.json']:
        for r in json.load(open(STAGING / fn, encoding='utf-8')):
            tats[r['source_record_id']] = r
    seq_stage = []
    for fn in ['perix_90_candidates.json', 'perix_gardelegen_candidates.json', 'perix_athens_candidates.json']:
        seq_stage += json.load(open(STAGING / fn, encoding='utf-8'))
    jobs = []
    for f in feats:
        for u in (f.get('osm_feature_links') or ([f.get('source_osm_feature_url')] if f.get('source_osm_feature_url') else [])):
            m = re.search(r'openstreetmap\.org/(way|relation)/(\d+)', str(u or ''))
            if m:
                jobs.append((f, m.group(1), m.group(2)))
                break
    print('jobs:', len(jobs))
    assets, rows = [], []

    def our_record(f):
        """Resolve OUR staging record: islands by source_record_id, legacy514 by verified seq order."""
        if f['id'] in tats:
            return tats[f['id']]
        mseq = re.fullmatch(r'legacy514_seq_(\d+)', f['id'] or '')
        assert mseq, f['id']
        r = seq_stage[int(mseq.group(1)) - 1]
        assert r['name'] == f.get('name'), (f['id'], f.get('name'), r['name'])
        return r
    for f, kind, oid in jobs:
        rec = our_record(f)
        pos = f.get('position') or {}
        plat, plng = pos.get('lat'), pos.get('lng')
        if plat is None:
            plat, plng = rec.get('latitude') or rec.get('candidate_latitude'), rec.get('longitude') or rec.get('candidate_longitude')
        row = {'perix_id': rec['service_id'], 'name': f.get('name'), 'osm': f'{kind}/{oid}',
               'verdict': '', 'level': '', 'detail': ''}
        try:
            d = fetch(kind, oid)
            els = d.get('elements', [])
            if kind == 'way':
                el = next((e for e in els if e.get('type') == 'way'), None)
                tags = (el or {}).get('tags', {})
                rings = [[(p['lon'], p['lat']) for p in (el.get('geometry') or [])]] if el else []
            else:
                tags = d.get('relation_tags', {})
                outer_ids = []
                for e in els:
                    if e.get('type') == 'relation':
                        for mbr in e.get('members', []):
                            if mbr.get('role') in ('outer', '') and mbr.get('type') == 'way':
                                outer_ids.append(mbr.get('ref'))
                ways = {e['id']: e for e in els if e.get('type') == 'way'}
                rings = [[(p['lon'], p['lat']) for p in ways[w].get('geometry', [])] for w in outer_ids if w in ways]
            if not rings or not any(len(r) >= 4 for r in rings):
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail='no closed polygon geometry')
                rows.append(row)
                continue
            ring = max((r for r in rings if len(r) >= 4), key=len)
            if ring[0] != ring[-1]:
                ring = ring + [ring[0]]
            area = ring_area_m2(ring)
            inside = point_in_ring(plng, plat, ring) if plat is not None else False
            name_ok = names_agree(
                [tags.get('name'), tags.get('name:el')],
                [f.get('name'), f.get('name_en'), f.get('name_de')])
            tag_keys = set(tags)
            has_place_tag = bool(tag_keys & {'building', 'amenity', 'leisure', 'natural', 'tourism', 'historic', 'landuse', 'aeroway', 'man_made'})
            h = tags.get('height')
            try:
                height = float(str(h).replace('m', '').strip()) if h else None
            except ValueError:
                height = None
            if not inside:
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'POI outside polygon (area {area:.0f} m2)')
            elif not name_ok:
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'name mismatch OSM={tags.get("name")!r}')
            elif not has_place_tag:
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'no place tag {sorted(tag_keys)[:8]}')
            elif not (10 <= area <= 200000):
                row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'area out of range {area:.0f} m2')
            else:
                level = 'C' if height else 'D'
                sub = (rec.get('subcategory_ids') or [None])[0]
                assets.append({
                    'perixId': rec['service_id'], 'level': level,
                    'latitude': plat, 'longitude': plng,
                    'footprint': [[round(x, 7), round(y, 7)] for x, y in ring],
                    **({'heightM': height} if height else {}),
                    'roofShape': tags.get('roof:shape'),
                    'color': f.get('style_color') or '#5D93D0',
                    'dress': None, 'city': rec.get('city_id'),
                    'evidence': {'sourceUrl': f'https://www.openstreetmap.org/{kind}/{oid}',
                                 'license': 'ODbL-1.0', 'checkedAt': '2026-11-13',
                                 'areaM2': round(area), 'name': tags.get('name')},
                })
                row.update(verdict='3D_READY' if level == 'C' else 'OUTLINE_ONLY', level=level,
                           detail=f'area {area:.0f} m2' + (f' height {height} m' if height else ''))
        except Exception as e:
            row.update(verdict='MATCH_REVIEW_REQUIRED', detail=f'fetch/error {type(e).__name__}: {str(e)[:100]}')
        rows.append(row)
    ASSETS_OUT.write_text(json.dumps({'schema': 'perix-3d-assets/v1', 'assets': assets}, ensure_ascii=False), encoding='utf-8')
    with open(QA_CSV, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print('verified assets:', len(assets), '|', Counter(r['verdict'] for r in rows))
    print('levels:', Counter(a['level'] for a in assets))


if __name__ == '__main__':
    main()

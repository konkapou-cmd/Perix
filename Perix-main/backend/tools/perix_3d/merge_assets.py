"""Merge verified 3D assets with strict source priority. Never downgrades.
Priority: LoD2 (official) > OSM verified outline/height > Microsoft outline.
Stamps design dress (from OUR staging subcategory) + city on every asset.
Reads: perix-3d-assets.json (OSM ingest), -ms.json (Microsoft), -lod2.json (LoD2).
Writes: perix-3d-assets.json (merged; OSM file is the merge home).
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
from collections import Counter

A = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\perix-3d')
STAGE = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging')

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
    if sub in SUB_TOP:
        return SUB_TOP[sub]
    return 'default'


def load(name):
    p = A / name
    if not p.exists():
        return []
    return json.load(open(p, encoding='utf-8')).get('assets', [])


def main():
    stage = {}
    for fn in ['perix_90_candidates.json', 'perix_gardelegen_candidates.json',
               'perix_athens_candidates.json', 'perix_islands_candidates.json']:
        for r in json.load(open(STAGE / fn, encoding='utf-8')):
            stage[r['service_id']] = r
    # Module-level SUB_TOP maps every subcategory to its top-level dress.
    osm = {a['perixId']: a for a in load('perix-3d-assets.json') if a.get('perixId')}
    # NOTE: perix-3d-assets.json currently HOLDS ONLY OSM ingest output (or empty).
    # Re-read raw lists to apply priority cleanly.
    ms = {a['perixId']: a for a in load('perix-3d-assets-ms.json') if a.get('perixId')}
    lod = {a['perixId']: a for a in load('perix-3d-assets-lod2.json') if a.get('perixId')}
    # separate pure-OSM entries currently mixed in the merge home
    mixed = list(osm.values())
    osm_only = [a for a in mixed if (a.get('evidence') or {}).get('license') != 'CDLA-Permissive-2.0'
                and 'lvermgeo' not in str((a.get('evidence') or {}).get('sourceUrl'))]
    merged, origin = {}, {}
    for pid, a in lod.items():
        merged[pid], origin[pid] = a, 'lod2'
    for a in osm_only:
        if a.get('perixId') not in merged:
            merged[a['perixId']], origin[a['perixId']] = a, 'osm'
    for pid, a in ms.items():
        if pid not in merged:
            merged[pid], origin[pid] = a, 'microsoft'
    # stamp dress + city from OUR staging truth
    unstamped = 0
    for pid, a in merged.items():
        r = stage.get(pid)
        if not r:
            print('WARN no staging record for', pid)
            continue
        sub = (r.get('subcategory_ids') or [None])[0]
        if not a.get('dress'):
            a['dress'] = dress_of(sub)
        else:
            unstamped += 0
        if not a.get('city'):
            a['city'] = r.get('city_id')
    out = sorted(merged.values(), key=lambda a: a['perixId'])
    (A / 'perix-3d-assets.json').write_text(
        json.dumps({'schema': 'perix-3d-assets/v1', 'assets': out}, ensure_ascii=False), encoding='utf-8')
    print('merged:', len(out), '| by origin:', Counter(origin.values()))
    print('levels:', Counter(a.get('level') for a in out))


if __name__ == '__main__':
    main()

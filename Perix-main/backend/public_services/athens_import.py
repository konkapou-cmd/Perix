"""Build Athens staging candidates (Acharnes + Agioi Anargyroi) from PERIX_QUICK_EXPORT.

Staged approval: ALL records stay review_required (no DE/EN descriptions anywhere,
no entrance-verified coordinates). Nothing in this file can reach approved_import
selection until GIS + translation review flips flags per record.
Excluded (kept in source ZIP + review CSV, NOT staged): 37 neighbourhood nodes
(need a districts branch), OTE/DEI shops (outside taxonomy), railway Crossing.
Mirrors the Gardelegen perix_gardelegen_candidates.json record shape.
"""
import csv
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

SRC = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\aak-ach')
OUT = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging\perix_athens_candidates.json')
TAXONOMY = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\taxonomy.json')
ASSETS_OUT = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\frontend\assets\public-services')
REVIEW_CSV = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\athens-remap-review.csv')

CITY = {'perix_aak_': 'gr-agioi-anargyroi', 'perix_ach_': 'gr-acharnes'}

LOC_MAP = {
    'churches-religious-sites': 'churches',
    'parks-gardens': 'parks-gardens',
    'sports-facilities': 'sports-facilities',
    'memorials': 'memorials',
    'historic-sites': 'historic-buildings',
    'cultural-venues': 'cultural-centers',
    'playgrounds': 'playgrounds',
    'squares': 'squares',
    'public-art': 'memorials',
    'municipal-reception': 'town-halls',
    'museums': 'museums-galleries',
    'landmarks': 'squares',
}
SVC_MAP = {
    'older-people': 'senior-centers',
    'citizen-services': 'citizen-offices',
    'home-care': 'home-care',
    'police-services': 'police',
    'civil-registry': 'civil-registry',
    'food-basic-goods': 'food-banks',
    'culture-sport-programmes': 'cultural-centers',
    'municipal-reception': 'town-halls',
    'social-work': 'social-services',
    'libraries': 'libraries',
    'primary-care': 'health-centers',
    'municipal-register': 'population-registry',
    'municipal-finance': 'tax-services',
    'waste-recycling': 'recycling-waste',
    'municipal-works': 'municipal-works',
    'street-lighting': 'lighting',
    'community-centre': 'cultural-centers',
    'social-pharmacy': 'social-pharmacies',
    'civil-protection': 'civil-protection',
    'women-counselling': 'counseling',
    'animal-welfare': 'animal-welfare',
    'mediation-complaints': 'complaints-ombudsman',
    'cemetery-administration': 'cemeteries',
    'building-planning': 'urban-planning',
    'parks-trees': 'greenery',
    'tax-services': 'tax-services',
    'social-insurance': 'insurance-pensions',
    'employment-support': 'employment-services',
    'land-registry': 'land-registry',
    'forestry': 'forestry',
    'older-people-day-care': 'daycare',
    'disability-support': 'disability-support',
}
OVERRIDE = {
    'perix_ach_node_11081442814': 'historic-buildings',
    'perix_aak_node_9178396453': 'historic-buildings',
    'perix_ach_way_1051735697': 'historic-buildings',
    'perix_aak_way_990140918': 'historic-buildings',
    'perix_ach_node_1389201222': 'parks-gardens',
    'perix_ach_node_2802120158': 'museums-galleries',
    'perix_ach_node_4585775190': 'sports-grounds',
    'perix_ach_node_4585790792': 'sports-grounds',
    'perix_ach_node_4585790990': 'sports-grounds',
    'perix_ach_node_6268675485': 'traffic-transport',
    'perix_ach_way_303888486': 'museums-galleries', 'perix_ach_way_303888487': 'museums-galleries',
    'perix_ach_way_303888488': 'museums-galleries', 'perix_ach_way_303888489': 'museums-galleries',
    'perix_ach_way_303888490': 'museums-galleries', 'perix_ach_way_303888491': 'museums-galleries',
    'perix_ach_way_303888492': 'museums-galleries', 'perix_ach_way_303888493': 'museums-galleries',
    'perix_ach_way_303888494': 'museums-galleries', 'perix_ach_way_304010428': 'museums-galleries',
    'perix_ach_way_304010429': 'museums-galleries', 'perix_ach_way_304010430': 'museums-galleries',
    'perix_ach_way_304010432': 'museums-galleries',
    'perix_ach_node_12473953959': 'cultural-centers',
    'perix_aak_node_13526252766': 'cultural-centers',
    'perix_aak_node_13622979105': 'food-banks',
    'perix_ach_way_1346747195': 'citizen-offices',
    'perix_ach_node_1909095536': 'employment-services',
    'perix_ach_way_227052505': 'insurance-pensions',
    'perix_ach_way_244450997': 'sports-facilities',
    'perix_ach_way_270328533': 'forestry',
    'perix_ach_way_286899696': 'land-registry',
    'perix_ach_way_596226440': 'cultural-centers',
    'perix_aak_way_679650775': 'cultural-centers',
    'perix_aak_education': 'education-admin',
    'perix_ach_education': 'lifelong-learning',
    'perix_ach_citymobile_75': 'lifelong-learning',
}
KEP_IDS = {
    'perix_ach_node_11614901398', 'perix_aak_node_11614901500', 'perix_ach_node_11614901648',
    'perix_ach_node_11614901718', 'perix_aak_node_11614901882', 'perix_aak_node_11614902014',
    'perix_ach_node_11614902077', 'perix_ach_node_11614902114', 'perix_ach_node_11614902195',
}
# Excluded from staging (kept in source ZIP, documented in review CSV).
EXCLUDED_SUBS = {'neighbourhoods-settlements': 'needs a districts branch in taxonomy'}
EXCLUDED_IDS = {
    'perix_ach_node_6778931209': 'railway crossing, not a visitable POI',
    'perix_ach_node_1909095537': 'OTE telecom shop, outside taxonomy',
    'perix_ach_way_275244399': 'DEI utility, outside taxonomy',
}

CITY_COVER_SRC = {
    'gr-agioi-anargyroi': 'generated/perix_aak_civil_anargyroi_3d113ecd669e.webp',
    'gr-acharnes': 'generated/perix_ach_thrak_office_2ecd0fc78651.webp',
}

DISCLAIMER = {
    'el': 'Το PERIX είναι ανεξάρτητος ενημερωτικός κατάλογος, όχι επίσημη κυβερνητική ιστοσελίδα. Επιβεβαίωσε τα δεσμευτικά στοιχεία στον αρμόδιο φορέα.',
    'de': 'PERIX ist ein unabhängiges Informationsverzeichnis und keine offizielle Behördenseite. Verbindliche Angaben bitte bei der zuständigen Stelle prüfen.',
    'en': 'PERIX is an independent information directory, not an official government website. Confirm binding details with the relevant authority.',
}


def tax_index(tax):
    idx = {}
    def walk(n):
        idx[n['id']] = n
        for c in n.get('children', []):
            walk(c)
    walk(tax)
    return idx


def main():
    tax = tax_index(json.loads(TAXONOMY.read_text(encoding='utf-8')))
    locs = json.load(open(SRC / 'data' / 'locations.json', encoding='utf-8'))
    svcs = json.load(open(SRC / 'data' / 'services.json', encoding='utf-8'))
    assert len(locs) == 226 and len(svcs) == 85

    prof_out = ASSETS_OUT / 'profiles'
    cov_out = ASSETS_OUT / 'covers'
    prof_out.mkdir(parents=True, exist_ok=True)
    cov_out.mkdir(parents=True, exist_ok=True)
    copied = 0
    for sub in ('profiles', 'generated'):
        for f in (SRC / sub).glob('*.webp'):
            dst = prof_out / f.name
            if not dst.exists():
                shutil.copyfile(f, dst)
            copied += 1
    covers = {}
    for city, src in CITY_COVER_SRC.items():
        assert (SRC / src).is_file(), src
        tag = 'aak' if city == 'gr-agioi-anargyroi' else 'ach'
        dst = cov_out / f'perix_{tag}_cover.webp'
        if not dst.exists():
            shutil.copyfile(SRC / src, dst)
        covers[city] = f'covers/{dst.name}'

    records, rows = [], []
    seen = set()

    def build(x, is_svc):
        sid = x['id']
        if (x.get('subcategory') in EXCLUDED_SUBS) or (sid in EXCLUDED_IDS):
            reason = EXCLUDED_SUBS.get(x.get('subcategory'), EXCLUDED_IDS.get(sid))
            rows.append({'service_id': '', 'source_record_id': sid,
                         'city': next((c for p, c in CITY.items() if sid.startswith(p)), '?'),
                         'name': (x.get('name') or '')[:60], 'src_sub': x.get('subcategory'),
                         'new_sub': 'EXCLUDED: ' + reason, 'label_de': '', 'geo': (x.get('geo_status') or '')[:60]})
            return
        city = next((c for p, c in CITY.items() if sid.startswith(p)), None)
        assert city, sid
        if sid in KEP_IDS:
            sub = 'citizen-offices'
        elif sid in OVERRIDE:
            sub = OVERRIDE[sid]
        else:
            sub = (SVC_MAP if is_svc else LOC_MAP).get(x.get('subcategory') or '')
        assert sub, (sid, x.get('subcategory'))
        assert sub in tax, (sid, sub)
        node = tax[sub]
        psid = 'ps_' + hashlib.sha256(sid.encode()).hexdigest()[:24]
        assert psid not in seen, sid
        seen.add(psid)
        lat, lng = x.get('latitude'), x.get('longitude')
        base = (x.get('profile_webp') or x.get('profile_image') or '').replace('.png', '.webp').split('/')[-1]
        prof = f'profiles/{base}'
        assert base and (ASSETS_OUT / prof).is_file(), (sid, prof)
        desc_el = x.get('description_el') or x.get('detailed_description_el')
        records.append({
            'service_id': psid, 'entity_type': 'public_service', 'country_code': 'GR',
            'city_id': city, 'source_record_id': sid, 'catalog_number': x.get('catalog_number'),
            'name': x.get('name'), 'category_ids': ['public-services'], 'subcategory_ids': [sub],
            'leaf_category_ids': [], 'category_label_el': 'Δημόσιες Υπηρεσίες',
            'category_label_de': 'Öffentliche Dienste & Behörden',
            'category_label_en': 'Public Services & Authorities',
            'subcategory_label_el': node['label_el'], 'subcategory_label_de': node['label_de'],
            'subcategory_label_en': node['label_en'], 'description_el': desc_el,
            'description_de': x.get('description_de'), 'description_en': x.get('description_en'),
            'address': x.get('address'), 'latitude': None, 'longitude': None,
            'candidate_latitude': lat, 'candidate_longitude': lng,
            'coordinate_review_status': 'review_required',
            'coordinate_review_note': 'entrance not verified; GIS check on map before live',
            'geo_status': x.get('geo_status'), 'official_address_source': x.get('official_address_source'),
            'phone': x.get('phone') or x.get('phone_display'), 'website': x.get('official_website'),
            'source_provider': 'OpenStreetMap contributors (ODbL 1.0)' if not is_svc else (x.get('municipality') or 'municipal guide'),
            'source_record_url': x.get('source_url') or x.get('official_website'),
            'source_dataset_url': x.get('source_url'), 'source_rights_url': None,
            'source_license_id': x.get('source_license') or 'TERMS_REVIEW_REQUIRED',
            'source_license_url': None, 'source_url': x.get('source_url'),
            'source_credits_url': x.get('source_url'),
            'attribution': '© OpenStreetMap contributors, ODbL 1.0' if not is_svc else 'Municipal editorial guide; verify binding details with the authority.',
            'sources': [],
            'licensing_note': 'ODbL 1.0 for OSM geometry/facts; official text without general reuse license.' if not is_svc else 'Limited official-information facts; no general text license.',
            'reuse_assessment': 'OSM_ODBL_FACTS' if not is_svc else 'LIMITED_OFFICIAL_INFORMATION_FACTS; NO_GENERAL_TEXT_OR_IMAGE_LICENSE',
            'independent_directory_disclaimer_el': DISCLAIMER['el'],
            'independent_directory_disclaimer_de': DISCLAIMER['de'],
            'independent_directory_disclaimer_en': DISCLAIMER['en'],
            'publication_status': 'review_required', 'verification_status': None,
            'bio_status': None, 'publication_rights_status': None,
            'profile_image_asset': prof, 'cover_image_asset': covers[city],
            'profile_image_url': None, 'cover_image_url': None,
            'cover_icon': 'business-outline', 'cover_context': 'illustrative_location_not_verified_facade',
            'visual_is_illustration': True, 'visual_asset_type': 'original_wooden_diorama_illustration',
            'visual_location_verified': False, 'data_collected_at': '2026-11-12',
            'source_verification_date': None,
            'modifications': 'Independent editorial directory entry; source terms and publication rights require review.',
            'source_locator': x.get('address'), 'source_credits_url': x.get('source_url'),
            'imported_at': None, 'is_hidden': None, 'is_deleted': None,
        })
        rows.append({'service_id': psid, 'source_record_id': sid, 'city': city,
                     'name': (x.get('name') or '')[:60], 'src_sub': x.get('subcategory'),
                     'new_sub': sub, 'label_de': node['label_de'],
                     'geo': (x.get('geo_status') or '')[:60]})

    for x in locs:
        build(x, False)
    for x in svcs:
        build(x, True)
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with open(REVIEW_CSV, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print('staged:', len(records), '| excluded rows:', sum(1 for r in rows if r["new_sub"].startswith('EXCLUDED')))
    print('by city:', Counter(r['city_id'] for r in records))
    print('new-sub distribution:', Counter(r['subcategory_ids'][0] for r in records))
    print('assets copied:', copied)
    for city in ('gr-acharnes', 'gr-agioi-anargyroi'):
        pts = [(r['candidate_latitude'], r['candidate_longitude']) for r in records if r['city_id'] == city]
        print(city, 'n=', len(pts), 'lat:', round(min(p[0] for p in pts), 4), round(max(p[0] for p in pts), 4),
              'lng:', round(min(p[1] for p in pts), 4), round(max(p[1] for p in pts), 4))


if __name__ == '__main__':
    main()

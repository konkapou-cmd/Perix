"""Build islands staging candidates (Syros + Mykonos) from PERIX_FINAL_EDITORIAL_437.
Staged approval: ALL records stay review_required (final human signoff pending).
TEXT_ONLY records are staged WITHOUT any coordinates. WITHHOLD/archived excluded.
Per-record profile images await the sheet-mapping key; shared island covers used.
Mirrors the Athens/Gardelegen record shape.
"""
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

import openpyxl

XLSX = Path(r'C:\Users\PC\Downloads\PERIX_FINAL_EDITORIAL_437.xlsx')
OUT = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging\perix_islands_candidates.json')
TAXONOMY = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\taxonomy.json')
REVIEW_CSV = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\islands-remap-review.csv')

CITY = {'Syros': 'gr-syros', 'Mykonos': 'gr-mykonos'}

CAT_MAP = {
    'church': 'churches', 'beach': 'beaches', 'artwork': 'memorials', 'bay': 'beaches',
    'sports': 'sports-facilities', 'square': 'squares', 'park': 'parks-gardens',
    'marina': 'port-services', 'museum': 'museums-galleries', 'memorial': 'memorials',
    'cinema': 'cultural-centers', 'playground': 'playgrounds', 'theatre': 'cultural-centers',
    'airport': 'traffic-transport', 'port': 'port-services', 'archaeology': 'historic-buildings',
    'lighthouse': 'historic-buildings', 'education': 'schools', 'gallery': 'museums-galleries',
    'industrial_heritage': 'historic-buildings', 'library': 'libraries',
    'health_service': 'health-centers', 'healthcare': 'health-centers',
    'castle': 'historic-buildings', 'attraction': 'memorials', 'cemetery': 'cemeteries',
    'cultural_centre': 'cultural-centers', 'nature': None,
    'building': None, 'sight': None, 'public_service': None,
    'settlement': None, 'cape': None, 'islet': None, 'peak': None,
    'dam': None, 'industrial': None,
}
# Explicit per-record mapping for mixed source categories.
OVERRIDE = {
    'perix_gr_0071': 'cultural-centers',
    'perix_gr_0072': 'museums-galleries', 'perix_gr_0077': 'museums-galleries',
    'perix_gr_0123': 'museums-galleries', 'perix_gr_0124': 'museums-galleries',
    'perix_gr_0125': 'museums-galleries', 'perix_gr_0186': 'museums-galleries',
    'perix_gr_0073': 'historic-buildings', 'perix_gr_0128': 'historic-buildings',
    'perix_gr_0129': 'historic-buildings', 'perix_gr_0120': 'historic-buildings',
    'perix_gr_0121': 'historic-buildings', 'perix_gr_0122': 'historic-buildings',
    'perix_gr_0097': 'memorials', 'perix_gr_0098': 'memorials', 'perix_gr_0187': 'memorials',
    'perix_gr_0188': 'memorials', 'perix_gr_0189': 'memorials', 'perix_gr_0127': 'memorials',
    'perix_gr_0184': 'memorials', 'perix_gr_0206': 'memorials', 'perix_gr_0208': 'memorials',
    'perix_gr_0105': 'beaches', 'perix_gr_0126': 'port-services',
    'perix_gr_0408': 'historic-buildings', 'perix_gr_0409': 'historic-buildings',
    'perix_gr_0410': 'courts', 'perix_gr_0411': 'historic-buildings',
    'perix_gr_0412': 'historic-buildings', 'perix_gr_0413': 'customs',
    'perix_gr_0001': 'town-halls', 'perix_gr_0036': 'town-halls', 'perix_gr_0087': 'town-halls',
    'perix_gr_0002': 'citizen-offices', 'perix_gr_0085': 'citizen-offices', 'perix_gr_0086': 'citizen-offices',
    'perix_gr_0037': 'citizen-offices',
    'perix_gr_0003': 'port-services', 'perix_gr_0038': 'port-services',
    'perix_gr_0004': 'police', 'perix_gr_0005': 'tax-services',
    'perix_gr_0006': 'regional-state-bodies', 'perix_gr_0007': 'regional-state-bodies',
    'perix_gr_0040': 'regional-state-bodies',
    'perix_gr_0039': 'water-sewage',
    'perix_gr_0448': 'historic-buildings',
}
# Excluded from staging (kept in source XLSX + review CSV with reason).
EXCLUDED_CAT = {
    'settlement': 'needs a districts branch in taxonomy',
    'cape': 'no natural-coast branch yet (candidate: extend natural-landmarks)',
    'islet': 'no islet branch yet (candidate: extend natural-landmarks)',
    'peak': 'no peak branch yet', 'dam': 'utility infrastructure, outside taxonomy',
}
EXCLUDED_IDS = {
    'perix_gr_0074': 'cave, no branch yet', 'perix_gr_0075': 'cave, no branch yet',
    'perix_gr_0472': 'trail, no branch yet', 'perix_gr_0101': 'WITHHOLD_IDENTITY_PENDING',
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
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    rows = list(wb['Catalog_437'].iter_rows(min_row=2, values_only=True))
    assert len(rows) == 437, len(rows)
    (I_ID, I_ISL, I_CAT, I_EL, I_EN, I_DE, I_DEL, I_DEN, I_DDE, I_LAT, I_LNG, I_SRC,
     I_WEB, I_GP, I_GR, I_PUB, I_MAP, I_NOTE, I_APP, I_GV) = range(20)
    records, review = [], []
    seen = set()
    for r in rows:
        sid, isl, cat = r[I_ID], r[I_ISL], r[I_CAT]
        if cat in EXCLUDED_CAT or sid in EXCLUDED_IDS:
            review.append({'service_id': '', 'source_record_id': sid, 'city': CITY.get(isl, isl),
                           'name': (r[I_EL] or '')[:60], 'src_sub': cat,
                           'new_sub': 'EXCLUDED: ' + (EXCLUDED_CAT.get(cat) or EXCLUDED_IDS.get(sid)),
                           'label_de': '', 'geo': (r[I_MAP] or '')[:60]})
            continue
        sub = OVERRIDE.get(sid, CAT_MAP.get(cat))
        assert sub, (sid, cat)
        assert sub in tax, (sid, sub)
        node = tax[sub]
        city = CITY[isl]
        psid = 'ps_' + hashlib.sha256(sid.encode()).hexdigest()[:24]
        assert psid not in seen, sid
        seen.add(psid)
        hide = (r[I_MAP] or '').startswith('HIDE_ALL')
        lat = float(r[I_LAT]) if r[I_LAT] not in (None, '') else None
        lng = float(r[I_LNG]) if r[I_LNG] not in (None, '') else None
        if hide:
            lat = lng = None
        cover = 'covers/perix_syr_cover.webp' if city == 'gr-syros' else 'covers/perix_myk_cover.webp'
        records.append({
            'service_id': psid, 'entity_type': 'public_service', 'country_code': 'GR',
            'city_id': city, 'source_record_id': sid, 'catalog_number': None,
            'name': r[I_EL], 'name_en': r[I_EN], 'name_de': r[I_DE],
            'category_ids': ['public-services'], 'subcategory_ids': [sub], 'leaf_category_ids': [],
            'category_label_el': 'Δημόσιες Υπηρεσίες',
            'category_label_de': 'Öffentliche Dienste & Behörden',
            'category_label_en': 'Public Services & Authorities',
            'subcategory_label_el': node['label_el'], 'subcategory_label_de': node['label_de'],
            'subcategory_label_en': node['label_en'], 'description_el': r[I_DEL],
            'description_de': r[I_DDE], 'description_en': r[I_DEN],
            'address': None, 'latitude': None, 'longitude': None,
            'candidate_latitude': lat, 'candidate_longitude': lng,
            'coordinate_review_status': 'review_required',
            'coordinate_review_note': ('coords hidden per map policy; text only' if hide
                                       else 'entrance not verified; GIS check on map before live'),
            'geo_status': r[I_MAP], 'official_address_source': None,
            'phone': None, 'website': r[I_WEB] or None,
            'source_provider': 'PERIX Editorial V29 + OpenStreetMap contributors (ODbL 1.0)',
            'source_record_url': (r[I_SRC] or '').split('|')[0].strip() or None,
            'source_dataset_url': None, 'source_rights_url': None,
            'source_license_id': 'TERMS_REVIEW_REQUIRED', 'source_license_url': None,
            'source_url': (r[I_SRC] or '').split('|')[0].strip() or None,
            'source_credits_url': None,
            'attribution': 'PERIX Editorial V29; OSM contributors ODbL where sourced.',
            'sources': [], 'licensing_note': 'Editorial text without general reuse license; OSM facts ODbL.',
            'reuse_assessment': 'LIMITED_EDITORIAL_FACTS; NO_GENERAL_TEXT_OR_IMAGE_LICENSE',
            'independent_directory_disclaimer_el': DISCLAIMER['el'],
            'independent_directory_disclaimer_de': DISCLAIMER['de'],
            'independent_directory_disclaimer_en': DISCLAIMER['en'],
            'publication_status': 'review_required', 'verification_status': None,
            'bio_status': None, 'publication_rights_status': None,
            'profile_image_asset': None, 'cover_image_asset': cover,
            'profile_image_url': None, 'cover_image_url': None,
            'cover_icon': 'business-outline', 'cover_context': 'illustrative_location_not_verified_facade',
            'visual_is_illustration': True, 'visual_asset_type': 'original_wooden_diorama_illustration',
            'visual_location_verified': False, 'data_collected_at': '2026-11-12',
            'source_verification_date': None,
            'editorial_note': r[I_NOTE], 'editorial_approval': r[I_APP],
            'google_verification': r[I_GV],
            'modifications': 'Independent editorial directory entry; source terms and publication rights require review.',
            'source_locator': None, 'source_credits_url': None,
            'imported_at': None, 'is_hidden': None, 'is_deleted': None,
        })
        review.append({'service_id': psid, 'source_record_id': sid, 'city': city,
                       'name': (r[I_EL] or '')[:60], 'src_sub': cat, 'new_sub': sub,
                       'label_de': node['label_de'], 'geo': (r[I_MAP] or '')[:60]})
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with open(REVIEW_CSV, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(review[0].keys()))
        w.writeheader(); w.writerows(review)
    print('staged:', len(records), '| excluded:', sum(1 for r in review if r['new_sub'].startswith('EXCLUDED')))
    print('by city:', Counter(r['city_id'] for r in records))
    print('text-only (no coords):', sum(1 for r in records if r['candidate_latitude'] is None))
    print('new-sub distribution:', Counter(r['subcategory_ids'][0] for r in records))
    for city in ('gr-syros', 'gr-mykonos'):
        pts = [(r['candidate_latitude'], r['candidate_longitude']) for r in records
               if r['city_id'] == city and r['candidate_latitude'] is not None]
        print(city, 'n=', len(pts), 'lat:', round(min(p[0] for p in pts), 4), round(max(p[0] for p in pts), 4),
              'lng:', round(min(p[1] for p in pts), 4), round(max(p[1] for p in pts), 4))


if __name__ == '__main__':
    main()

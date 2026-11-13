"""Build Gardelegen staging candidates from the editorial JSON + GIS review table.

Batching: records with high-confidence coordinates become approved candidates
(lat/lng published); the rest stay review-only with candidate coordinates.
Mirrors the Magdeburg perix_90_candidates.json record shape.
"""
import csv
import hashlib
import json
from pathlib import Path

GARDELEGEN = Path(r'C:\Users\PC\Downloads\PERIX_GARDELEGEN_WOODEN_COMPLETE_V2\data\catalog_gardelegen_trilingual_v2_wooden.json')
GIS = Path(r'C:\Users\PC\AppData\Local\Temp\opencode\gardelegen-gis-review.csv')
OUT = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\staging\perix_gardelegen_candidates.json')
TAXONOMY = Path(r'C:\Users\PC\Downloads\Perix1\Perix-main\backend\public_services\taxonomy.json')

CATEGORY_MAP = {
    'public_building': 'town-halls',
    'library': 'libraries',
    'education': 'schools',
    'kindergarten': 'kindergartens',
    'historic_building': 'historic-buildings',
    'church': 'churches',
    'square': 'squares',
    'park': 'parks-gardens',
    'nature': 'parks-gardens',
    'sports': 'sports-facilities',
    'playground': 'playgrounds',
    'swimming': 'sports-facilities',
    'museum': 'museums-galleries',
    'memorial': 'memorials',
    'monument': 'memorials',
    'public_transport': 'traffic-transport',
    'public_service': 'town-halls',
}
# Per-record overrides for the municipal offices (new taxonomy).
MUNICIPAL = {
    'perix_de_gar_0001': 'town-halls',        # Stadtverwaltung
    'perix_de_gar_0003': 'civil-registry',    # Standesamt
    'perix_de_gar_0004': 'archives',          # Stadtarchiv
    'perix_de_gar_0005': 'citizen-offices',   # Bürgeramt
    'perix_de_gar_0006': 'citizen-offices',   # Tourist-Information
    'perix_de_gar_0007': 'public-real-estate',  # Gebäudeverwaltung
    'perix_de_gar_0008': 'employment-services',  # Jobcenter
    'perix_de_gar_0009': 'courts',            # Amtsgericht
    'perix_de_gar_0010': 'tax-services',      # Stadtkasse
}


def main():
    d = json.loads(GARDELEGEN.read_text(encoding='utf-8'))
    tax = {}
    def _walk(n):
        tax[n['id']] = n
        for c in n.get('children', []):
            _walk(c)
    _walk(json.loads(TAXONOMY.read_text(encoding='utf-8')))
    locs = {x['id']: x for x in d['locations']}
    gis = {r['id']: r for r in csv.DictReader(GIS.open(encoding='utf-8-sig'))}
    assert set(locs) == set(gis), 'GIS review out of sync'
    records = []
    for rid, x in locs.items():
        g = gis[rid]
        conf = g['confidence']
        approved_coords = conf in ('high-official', 'high-address')
        lat = float(g['lat']) if g['lat'] not in (None, '') else None
        lng = float(g['lon']) if g['lon'] not in (None, '') else None
        if approved_coords:
            assert lat is not None and lng is not None, rid
        sub = MUNICIPAL.get(rid, CATEGORY_MAP[x['category_code']])
        node = tax[sub]
        src_url = (x.get('source_urls') or [None])[0] or 'https://www.gardelegen.de/'
        provider = 'HANSESTADT_GARDELEGEN'
        sid = 'ps_' + hashlib.sha256(rid.encode('utf-8')).hexdigest()[:24]
        num = int(rid.rsplit('_', 1)[-1])
        contact = x.get('contact') or {}
        desc = x.get('description') or {}
        addr = ((x.get('address') or {}).get('de') or '').replace(', Deutschland', '').replace(', Deutschland', '')
        approved = approved_coords
        records.append({
            'service_id': sid,
            'entity_type': 'public_service',
            'country_code': 'DE',
            'city_id': 'de-gardelegen',
            'source_record_id': rid,
            'catalog_number': num,
            'name': x['name']['de'],
            'category_ids': ['public-services'],
            'subcategory_ids': [sub],
            'leaf_category_ids': [],
            'category_label_el': 'Δημόσιες Υπηρεσίες',
            'category_label_de': 'Öffentliche Dienste & Behörden',
            'category_label_en': 'Public Services & Authorities',
            'subcategory_label_el': node['label_el'],
            'subcategory_label_de': node['label_de'],
            'subcategory_label_en': node['label_en'],
            'description_el': desc.get('el'),
            'description_de': desc.get('de'),
            'description_en': desc.get('en'),
            'address': addr or None,
            'latitude': lat if approved else None,
            'longitude': lng if approved else None,
            'candidate_latitude': lat,
            'candidate_longitude': lng,
            'coordinate_review_status': 'approved' if approved else ('review_required' if lat is not None else 'pending'),
            'coordinate_review_note': None,
            'geo_status': 'OSM_POINT_CHECK_ON_MAP_BEFORE_LIVE' if approved else None,
            'official_address_source': 'municipal_editorial_json',
            'phone': contact.get('phone'),
            'website': contact.get('official_website'),
            'source_provider': 'Hansestadt Gardelegen (official site)',
            'source_record_url': src_url,
            'source_dataset_url': 'https://www.gardelegen.de/',
            'source_rights_url': 'https://www.gardelegen.de/',
            'source_license_id': 'TERMS_REVIEW_REQUIRED',
            'source_license_url': 'https://www.gardelegen.de/',
            'source_url': src_url,
            'source_credits_url': 'https://www.gardelegen.de/',
            'attribution': 'Source: HANSESTADT_GARDELEGEN. Consult the linked official record.',
            'sources': [{
                'source_provider': provider,
                'source_provider_url': None,
                'source_dataset_url': src_url,
                'source_record_url': src_url,
                'source_license_id': 'TERMS_REVIEW_REQUIRED',
                'source_license_url': 'https://www.gardelegen.de/',
                'source_published_at': None,
                'source_last_updated_at': None,
                'source_reference_period': None,
                'data_collected_at': '2026-11-12',
                'attribution': f'Source: {provider}. Consult the linked official record.',
                'modifications': 'Independent editorial directory entry; source terms and publication rights require review.',
                'source_locator': addr or None,
                'source_credits_url': 'https://www.gardelegen.de/',
            }],
            'licensing_note': 'No automatic ODbL or DL-DE licence is asserted for official-site data; official source terms and limited factual use only.',
            'reuse_assessment': 'LIMITED_OFFICIAL_INFORMATION_FACTS; NO_GENERAL_TEXT_OR_IMAGE_LICENSE',
            'independent_directory_disclaimer_el': 'Το PERIX είναι ανεξάρτητος ενημερωτικός κατάλογος, όχι επίσημη κυβερνητική ιστοσελίδα. Επιβεβαίωσε τα δεσμευτικά στοιχεία στον αρμόδιο φορέα.',
            'independent_directory_disclaimer_de': 'PERIX ist ein unabhängiges Informationsverzeichnis und keine offizielle Behördenseite. Verbindliche Angaben bitte bei der zuständigen Stelle prüfen.',
            'independent_directory_disclaimer_en': 'PERIX is an independent information directory, not an official government website. Confirm binding details with the relevant authority.',
            'publication_status': 'published' if approved else 'review_required',
            'verification_status': 'source_verified' if approved else None,
            'bio_status': 'approved' if approved else None,
            'publication_rights_status': 'approved' if approved else None,
            'profile_image_asset': f'profiles/perix_de_gar_{num:04d}.webp',
            'cover_image_asset': 'covers/perix_de_gar_cover.webp',
            'profile_image_url': None,
            'cover_image_url': None,
            'cover_icon': 'business-outline',
            'cover_context': 'illustrative_location_not_verified_facade',
            'visual_is_illustration': True,
            'visual_asset_type': 'original_wooden_diorama_illustration',
            'visual_location_verified': False,
            'data_collected_at': '2026-11-12',
            'source_verification_date': '2026-11-12' if approved else None,
            'modifications': 'Independent editorial directory entry; source terms and publication rights require review.',
            'source_locator': addr or None,
            'source_credits_url': 'https://www.gardelegen.de/',
            'imported_at': None,
            'is_hidden': None,
            'is_deleted': None,
        })
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('wrote', len(records), 'records;', sum(1 for r in records if r['publication_status'] == 'published'), 'approved')


if __name__ == '__main__':
    main()

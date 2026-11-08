import { apiRequest } from "../api/core";

export type PublicServiceSource = {
  source_provider: string;
  source_provider_url: string | null;
  source_dataset_url: string;
  source_record_url: string | null;
  source_license_id: string;
  source_license_url: string;
  source_published_at: string | null;
  source_last_updated_at: string | null;
  source_reference_period: string | null;
  data_collected_at: string;
  attribution: string;
  modifications: string;
  source_locator: string | null;
  source_credits_url: string | null;
};

export type PublicService = PublicServiceSource & {
  service_id: string;
  entity_type: "public_service";
  country_code: string;
  city_id: string;
  source_record_id?: string | null;
  catalog_number?: number | null;
  name: string;
  category_ids: string[];
  subcategory_ids: string[];
  leaf_category_ids: string[];
  category_label_el?: string | null;
  category_label_de?: string | null;
  category_label_en?: string | null;
  subcategory_label_el?: string | null;
  subcategory_label_de?: string | null;
  subcategory_label_en?: string | null;
  description_el: string | null;
  description_de: string | null;
  description_en: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinate_review_status?: "pending" | "review_required" | "approved" | "rejected" | null;
  coordinate_review_note?: string | null;
  geo_status?: string | null;
  coordinate_match_type?: string | null;
  coordinate_osm_id?: string | null;
  coordinate_source_url?: string | null;
  coordinate_source_license?: string | null;
  coordinate_manual_review_required?: string | null;
  source_geo_manual_review_note?: string | null;
  coordinate_crs?: string | null;
  official_address_source?: string | null;
  phone: string | null;
  phone_display?: string | null;
  phone_scope?: string | null;
  additional_phones?: string[];
  email?: string | null;
  email_scope?: string | null;
  additional_emails?: string[];
  website: string | null;
  opening_hours: string | null;
  opening_hours_scope?: string | null;
  telephone_hours?: string | null;
  visitor_notice_el?: string | null;
  visitor_notice_de?: string | null;
  visitor_notice_en?: string | null;
  special_notice?: string | null;
  services_supported_el?: string[];
  services_supported_de?: string[];
  services_supported_en?: string[];
  source_url?: string | null;
  official_source_urls?: string[];
  source_rights_url?: string | null;
  source_verification_date?: string | null;
  reuse_assessment?: string | null;
  licensing_note?: string | null;
  independent_directory_disclaimer_el?: string | null;
  independent_directory_disclaimer_de?: string | null;
  independent_directory_disclaimer_en?: string | null;
  profile_image_url?: string | null;
  cover_image_url?: string | null;
  profile_image_asset?: string | null;
  cover_image_asset?: string | null;
  visual_asset_type?: string | null;
  visual_is_illustration?: boolean;
  visual_location_verified?: boolean;
  cover_context?: string | null;
  additional_fields?: Record<string, unknown>;
  cover_icon: string;
  sources: PublicServiceSource[];
  publication_status?: "draft" | "published" | "hidden";
  verification_status?: "needs_review" | "source_verified" | "rejected";
  bio_status?: "draft" | "approved";
  publication_rights_status?: "review_required" | "approved" | "restricted" | null;
};

export type PublicServiceCategory = {
  id: string;
  label_el: string;
  label_de: string;
  label_en?: string;
  icon?: string;
  children?: PublicServiceCategory[];
};

export type CityBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export const MAGDEBURG_BOUNDS: CityBounds = { minLat: 52.06, maxLat: 52.22, minLng: 11.52, maxLng: 11.75 };
export const PUBLIC_SERVICE_THEME = { navy: "#064472", blue: "#216BA2", gold: "#B19165", ivory: "#F8F7F3" };

export const getPublicServiceTaxonomy = () => apiRequest<PublicServiceCategory>("/public-services/taxonomy", "GET");
export const getPublicService = (id: string) => apiRequest<PublicService>(`/public-services/${encodeURIComponent(id)}`, "GET");

export function getPublicServices(input: { countryCode: string; cityId: string; categoryId?: string; q?: string; bounds: CityBounds; cursor?: string }) {
  const params = new URLSearchParams({ country_code: input.countryCode, city_id: input.cityId, limit: "50", include_unlocated: "true" });
  if (input.categoryId) params.set("category_id", input.categoryId);
  if (input.q) params.set("q", input.q);
  if (input.cursor) params.set("cursor", input.cursor);
  Object.entries({ min_lat: input.bounds.minLat, max_lat: input.bounds.maxLat, min_lng: input.bounds.minLng, max_lng: input.bounds.maxLng }).forEach(([key, value]) => params.set(key, String(value)));
  return apiRequest<{ items: PublicService[]; next_cursor: string | null }>(`/public-services?${params}`, "GET");
}

// Render on the existing BusinessMap; entity identity stays public_service.
// The renderer's existing generic service artwork avoids changing shared map types.
export function publicServiceMarkers(records: PublicService[]) {
  return records.filter(r => (r.coordinate_review_status == null || r.coordinate_review_status === "approved")
    && Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map(r => ({ id: r.service_id, latitude: r.latitude!, longitude: r.longitude!, title: r.name,
      type: "service" as const, pinColor: PUBLIC_SERVICE_THEME.navy }));
}

export function mergeCityResults<T extends { id: string; type: string }>(existing: T[], publicServices: PublicService[]) {
  // Thin integration boundary for the Gateway's common business/results collection.
  const services = publicServices.map(record => ({ id: record.service_id, type: "public_service" as const, record }));
  return [...new Map([...existing, ...services].map(item => [`${item.type}:${item.id}`, item])).values()];
}

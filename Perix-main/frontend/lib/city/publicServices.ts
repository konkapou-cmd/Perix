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
  name: string;
  category_ids: string[];
  subcategory_ids: string[];
  leaf_category_ids: string[];
  description_el: string | null;
  description_de: string | null;
  description_en: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  opening_hours: string | null;
  cover_icon: string;
  sources: PublicServiceSource[];
};

export type PublicServiceCategory = {
  id: string;
  label_el: string;
  label_de: string;
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
  return records.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map(r => ({ id: r.service_id, latitude: r.latitude!, longitude: r.longitude!, title: r.name,
      type: "service" as const, pinColor: PUBLIC_SERVICE_THEME.navy }));
}

export function mergeCityResults<T extends { id: string; type: string }>(existing: T[], publicServices: PublicService[]) {
  // Thin integration boundary for the Gateway's common business/results collection.
  const services = publicServices.map(record => ({ id: record.service_id, type: "public_service" as const, record }));
  return [...new Map([...existing, ...services].map(item => [`${item.type}:${item.id}`, item])).values()];
}

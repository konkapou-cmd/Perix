import { apiRequest } from "./core";

export type CityAdCreative = {
  media_url?: string | null;
  media_type?: "image" | "video" | null;
  title?: string | null;
  text?: string | null;
  click_target_type?: string | null;
  click_target_id?: string | null;
  mux_playback_id?: string | null;
  mux_thumbnail_url?: string | null;
};

export type CityAdCarouselPosition = {
  position: number;
  shown_group: "A" | "B";
  campaign_id?: string | null;
  business_id?: string | null;
  creative?: CityAdCreative | null;
  sponsored: boolean;
};

export type CityAdCarousel = {
  city_id: string;
  local_date: string;
  positions: CityAdCarouselPosition[];
};

export type CityAdAvailabilityDay = {
  occupied: number;
  free: number;
  sold_out: boolean;
};

/** 24 paid slots per city/day, carousel shows up to 12 positions (v18). */
export const CITY_AD_TOTAL_SLOTS = 24;
export const CITY_AD_CAROUSEL_POSITIONS = 12;

export async function fetchCityAdCarousel(
  cityId: string,
  localDate: string,
  viewerKey: string,
): Promise<CityAdCarousel> {
  const query = new URLSearchParams({ city_id: cityId, local_date: localDate, viewer_key: viewerKey });
  return apiRequest<CityAdCarousel>(`/promotions/carousel?${query.toString()}`, "GET");
}

export async function recordCityAdImpression(payload: {
  campaign_id: string;
  city_id: string;
  local_date: string;
  slot_number: number;
  viewer_key: string;
}): Promise<{ counted: boolean; reason?: string | null }> {
  return apiRequest(`/promotions/impressions`, "POST", undefined, payload);
}

export async function fetchCityAdAvailability(
  cityId: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, CityAdAvailabilityDay>> {
  const query = new URLSearchParams({ city_id: cityId, start_date: startDate, end_date: endDate });
  return apiRequest(`/promotions/availability?${query.toString()}`, "GET");
}

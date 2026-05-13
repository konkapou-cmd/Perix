import { apiRequest } from "./core";
import type { Rental } from "./core";

export type RentalsResponse = {
  rentals: Rental[];
  total: number;
};

export type RentalCreatePayload = {
  title: string;
  description: string;
  cover_image?: string | null;
  rent_price?: string | null;
  rooms_size?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  available_from?: string | null;
  deposit?: string | null;
  property_type?: string | null;
  gallery_images?: string[];
};

export type RentalUpdatePayload = {
  title?: string | null;
  description?: string | null;
  cover_image?: string | null;
  rent_price?: string | null;
  rooms_size?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  available_from?: string | null;
  deposit?: string | null;
  property_type?: string | null;
  is_active?: boolean;
  gallery_images?: string[];
};

export const getRentals = async (
  token: string,
  mapBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  filters?: { rootCategory?: string; subcategory?: string; propertyType?: string; latitude?: number; longitude?: number },
  skip?: number,
  limit?: number
): Promise<RentalsResponse> => {
  const searchParams = new URLSearchParams();
  if (mapBounds) {
    searchParams.append("min_lat", String(mapBounds.minLat));
    searchParams.append("max_lat", String(mapBounds.maxLat));
    searchParams.append("min_lng", String(mapBounds.minLng));
    searchParams.append("max_lng", String(mapBounds.maxLng));
  }
  if (filters?.rootCategory) searchParams.append("root_category", filters.rootCategory);
  if (filters?.subcategory) searchParams.append("subcategory", filters.subcategory);
  if (filters?.propertyType) searchParams.append("property_type", filters.propertyType);
  if (filters?.latitude != null) searchParams.append("latitude", String(filters.latitude));
  if (filters?.longitude != null) searchParams.append("longitude", String(filters.longitude));
  if (skip != null) searchParams.append("skip", String(skip));
  if (limit != null) searchParams.append("limit", String(limit));
  const query = searchParams.toString();
  return apiRequest<RentalsResponse>(`/rentals${query ? `?${query}` : ""}`, "GET", token);
};

export const getRental = async (token: string, rentalId: string): Promise<Rental> => {
  return apiRequest<Rental>(`/rentals/${rentalId}`, "GET", token);
};

export const getMyRentals = async (token: string): Promise<Rental[]> => {
  return apiRequest<Rental[]>("/rentals/my", "GET", token);
};

export const createRental = async (
  token: string,
  payload: RentalCreatePayload
): Promise<Rental> => {
  return apiRequest<Rental>("/rentals", "POST", token, payload);
};

export const updateRental = async (
  token: string,
  rentalId: string,
  payload: RentalUpdatePayload
): Promise<Rental> => {
  return apiRequest<Rental>(`/rentals/${rentalId}`, "PUT", token, payload);
};

export const deleteRental = async (
  token: string,
  rentalId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/rentals/${rentalId}`, "DELETE", token);
};

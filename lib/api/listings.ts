import { apiRequest } from "./core";

export type ListingType = "product" | "home_rental";
export type ListingStatus = "draft" | "published" | "sold" | "rented";

export type Listing = {
  listing_id: string;
  owner_id: string;
  listing_type: ListingType;
  title: string;
  description?: string;
  price?: string;
  cover_image_url?: string;
  image_urls: string[];
  gallery_images: string[];
  gallery_videos: string[];
  video_url?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  category?: string;
  status: ListingStatus;
  is_active: boolean;
  created_at: string;
  condition?: string;
  brand?: string;
  delivery_method?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  size_sqm?: number;
  furnished?: boolean;
  available_from?: string;
  lease_duration?: string;
  deposit?: string;
};

export type ListingCreatePayload = {
  listing_type: ListingType;
  title: string;
  description?: string | null;
  price?: string | null;
  cover_image_url?: string | null;
  image_urls?: string[];
  gallery_images?: string[];
  gallery_videos?: string[];
  video_url?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  status?: ListingStatus;
  condition?: string | null;
  brand?: string | null;
  delivery_method?: string | null;
  property_type?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  size_sqm?: number | null;
  furnished?: boolean | null;
  available_from?: string | null;
  lease_duration?: string | null;
  deposit?: string | null;
};

export type ListingUpdatePayload = Partial<ListingCreatePayload> & {
  is_active?: boolean;
};

export const getListings = async (
  listingType?: ListingType,
  skip?: number,
  limit?: number,
): Promise<Listing[]> => {
  const params = new URLSearchParams();
  if (listingType) params.append("listing_type", listingType);
  if (skip != null) params.append("skip", String(skip));
  if (limit != null) params.append("limit", String(limit));
  const qs = params.toString() ? `?${params}` : "";
  return apiRequest<Listing[]>(`/listings${qs}`, "GET");
};

export const getMyListings = async (
  token: string,
  listingType?: ListingType,
  status?: string,
): Promise<Listing[]> => {
  const params = new URLSearchParams();
  if (listingType) params.append("listing_type", listingType);
  if (status) params.append("status", status);
  const qs = params.toString() ? `?${params}` : "";
  return apiRequest<Listing[]>(`/listings/my${qs}`, "GET", token);
};

export const getListing = async (listingId: string): Promise<Listing> => {
  return apiRequest<Listing>(`/listings/${listingId}`, "GET");
};

export const createListing = async (
  token: string,
  payload: ListingCreatePayload,
): Promise<Listing> => {
  return apiRequest<Listing>("/listings", "POST", token, payload);
};

export const updateListing = async (
  token: string,
  listingId: string,
  payload: ListingUpdatePayload,
): Promise<Listing> => {
  return apiRequest<Listing>(`/listings/${listingId}`, "PUT", token, payload);
};

export const deleteListing = async (
  token: string,
  listingId: string,
): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/listings/${listingId}`, "DELETE", token);
};

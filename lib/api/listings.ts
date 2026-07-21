import { apiRequest } from "./core";

export type ListingType = "product" | "home_rental";
export type ListingStatus = "draft" | "published" | "sold" | "rented";

export type LocationVisibility = "approximate" | "exact";
export type SellerType = "user" | "business";
export type PublicationScope = "profile_only" | "profile_and_marketplace";

export type ListingSeller = {
  type: SellerType;
  id: string;
  business_id?: string;
};

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
  public_location_label?: string;
  location_visibility: LocationVisibility;
  category?: string;
  subcategory?: string;
  attributes?: Record<string, string | number | boolean | string[]>;
  status: ListingStatus;
  is_active: boolean;
  created_at: string;
  seller_type: SellerType;
  seller_id?: string;
  business_id?: string;
  publication_scope: PublicationScope;
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
  public_location_label?: string | null;
  location_visibility?: LocationVisibility;
  category?: string | null;
  subcategory?: string | null;
  attributes?: Record<string, string | number | boolean | string[]> | null;
  seller_type?: SellerType;
  seller_id?: string | null;
  business_id?: string | null;
  publication_scope?: PublicationScope;
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

export type ListingDiscoveryQuery = {
  listingType: ListingType;
  search?: string;

  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;

  category?: string;
  subcategory?: string;
  conditions?: string[];
  condition?: string;
  deliveryMethod?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;

  propertyType?: string;
  minBedrooms?: number;
  furnished?: boolean;

  attributeFilters?: Record<string, string>;

  skip?: number;
  limit?: number;
};

export const getListings = async (
  query: ListingDiscoveryQuery,
): Promise<Listing[]> => {
  const params = new URLSearchParams();
  params.append("listing_type", query.listingType);

  if (query.search) params.append("q", query.search);

  if (query.minLat != null) params.append("min_lat", String(query.minLat));
  if (query.maxLat != null) params.append("max_lat", String(query.maxLat));
  if (query.minLng != null) params.append("min_lng", String(query.minLng));
  if (query.maxLng != null) params.append("max_lng", String(query.maxLng));

  if (query.category) params.append("category", query.category);
  if (query.subcategory) params.append("subcategory", query.subcategory);
  if (query.conditions && query.conditions.length > 0) {
    params.append("conditions", query.conditions.join(","));
  } else if (query.condition) {
    params.append("condition", query.condition);
  }
  if (query.deliveryMethod) params.append("delivery_method", query.deliveryMethod);
  if (query.pickupAvailable != null) params.append("pickup_available", String(query.pickupAvailable));
  if (query.shippingAvailable != null) params.append("shipping_available", String(query.shippingAvailable));
  if (query.propertyType) params.append("property_type", query.propertyType);
  if (query.minBedrooms != null) params.append("min_bedrooms", String(query.minBedrooms));
  if (query.furnished != null) params.append("furnished", String(query.furnished));

  if (query.attributeFilters) {
    Object.entries(query.attributeFilters).forEach(([key, value]) => {
      params.append(`attr_${key}`, value);
    });
  }

  if (query.skip != null) params.append("skip", String(query.skip));
  if (query.limit != null) params.append("limit", String(query.limit));

  return apiRequest<Listing[]>(`/listings?${params}`, "GET");
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

export const getUserSellerListings = async (userId: string): Promise<Listing[]> => {
  return apiRequest<Listing[]>(`/listings/seller/user/${userId}`, "GET");
};

export const getBusinessSellerListings = async (businessId: string): Promise<Listing[]> => {
  return apiRequest<Listing[]>(`/listings/seller/business/${businessId}`, "GET");
};

export const getManageListings = async (
  token: string,
  sellerType?: SellerType,
  sellerId?: string,
): Promise<Listing[]> => {
  const params = new URLSearchParams();
  if (sellerType) params.append("seller_type", sellerType);
  if (sellerId) params.append("seller_id", sellerId);
  const qs = params.toString() ? `?${params}` : "";
  return apiRequest<Listing[]>(`/listings/manage${qs}`, "GET", token);
};

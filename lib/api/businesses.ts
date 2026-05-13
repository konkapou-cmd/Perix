import { apiRequest, Business, BusinessDetail, CategoryGroup, ProfileTheme } from "./core";

export const getBusinessCategories = async (token: string): Promise<{ categories: CategoryGroup[] }> => {
  const response = await apiRequest<CategoryGroup[]>("/categories", "GET", token);
  return { categories: response };
};

export const getCategoryTree = async (token: string): Promise<CategoryGroup[]> => {
  const response = await apiRequest<{ categories: CategoryGroup[] }>("/businesses/category-tree", "GET", token);
  return response.categories;
};

export const getBusinesses = async (
  token: string,
  rootCategory?: string,
  subcategory?: string
): Promise<Business[]> => {
  const params = new URLSearchParams();
  if (rootCategory) params.append("root_category", rootCategory);
  if (subcategory) params.append("subcategory", subcategory);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<Business[]>(`/businesses${query}`, "GET", token);
};

export const getBusinessDetail = async (
  token: string,
  businessId: string,
  actor?: { type: string; id?: string | null }
): Promise<BusinessDetail> => {
  const params = new URLSearchParams();
  if (actor?.type) params.append("actor_type", actor.type);
  if (actor?.id) params.append("actor_id", actor.id);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<BusinessDetail>(`/businesses/${businessId}${query}`, "GET", token);
};

export const updateBusinessTheme = async (
  token: string,
  businessId: string,
  theme: ProfileTheme
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/businesses/${businessId}/theme`, "PUT", token, theme);
};

export const getNearbyBusinesses = async (
  token: string,
  latitude: number,
  longitude: number,
  rootCategory?: string,
  subcategory?: string,
  mapBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
): Promise<Business[]> => {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    max_distance_meters: "10000",
  });
  if (rootCategory && rootCategory !== "All") params.append("root_category", rootCategory);
  if (subcategory && subcategory !== "All") params.append("subcategory", subcategory);
  if (mapBounds) {
    params.append("min_lat", mapBounds.minLat.toString());
    params.append("max_lat", mapBounds.maxLat.toString());
    params.append("min_lng", mapBounds.minLng.toString());
    params.append("max_lng", mapBounds.maxLng.toString());
  }
  return apiRequest<Business[]>(`/businesses/nearby?${params.toString()}`, "GET", token);
};

export const createBusiness = async (
  token: string,
  payload: {
    name: string;
    root_category: string;
    subcategory: string;
    description?: string | null;
    address: string;
    logo_image?: string | null;
    cover_image?: string | null;
    phone?: string | null;
    website?: string | null;
    email?: string | null;
    social_links?: Record<string, string> | null;
    opening_hours?: Record<string, string> | null;
    gallery_images?: string[];
    gallery_videos?: string[];
    tags?: string[];
    latitude: number;
    longitude: number;
  }
): Promise<Business> => {
  return apiRequest<Business>("/businesses", "POST", token, payload);
};

export const updateBusiness = async (
  token: string,
  businessId: string,
  payload: Partial<Business>
): Promise<Business> => {
  return apiRequest<Business>(`/businesses/${businessId}`, "PUT", token, payload);
};

export const toggleBusinessFavorite = async (
  token: string,
  businessId: string
): Promise<{ favorites_count: number; is_favorited: boolean }> => {
  return apiRequest<{ favorites_count: number; is_favorited: boolean }>(`/businesses/${businessId}/favorite`, "POST", token);
};

export const getMyBusinesses = async (token: string): Promise<Business[]> => {
  const business = await apiRequest<Business | null>("/businesses/my", "GET", token);
  return business ? [business] : [];
};

export const deleteBusiness = async (token: string, businessId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/businesses/${businessId}`, "DELETE", token);
};

export const reportBusiness = async (token: string, businessId: string, reason: string): Promise<{ success: boolean; message: string; report_id: string }> => {
  return apiRequest(`/businesses/${businessId}/report`, "POST", token, { reason });
};

export const getBusinessFanGallery = async (token: string, businessId: string): Promise<import("./core").Post[]> => {
  return apiRequest<import("./core").Post[]>(`/businesses/${businessId}/fan-gallery`, "GET", token);
};

export const hideBusinessFanGalleryPost = async (token: string, businessId: string, postId: string): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(`/businesses/${businessId}/fan-gallery/${postId}/hide`, "POST", token);
};

export const updateBusinessGallery = async (
  token: string,
  businessId: string,
  payload: { images?: string[]; videos?: string[]; remove_images?: string[]; remove_videos?: string[] }
): Promise<Business> => {
  return apiRequest<Business>(`/businesses/${businessId}/gallery`, "POST", token, payload);
};

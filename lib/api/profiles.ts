import { apiRequest, User, ProfileTheme } from "./core";

export const updateProfileGallery = async (
  token: string,
  payload: { images?: string[]; videos?: string[]; remove_images?: string[]; remove_videos?: string[] }
): Promise<User> => {
  return apiRequest<User>("/profiles/gallery", "POST", token, payload);
};

export const updateGalleryCaption = async (
  token: string,
  url: string,
  caption: string,
  itemType: "image" | "video" = "image"
): Promise<User> => {
  return apiRequest<User>("/profiles/gallery/caption", "POST", token, { url, caption, item_type: itemType });
};

export const updateProfileMedia = async (
  token: string,
  payload: { profile_photo?: string | null; cover_photo?: string | null }
): Promise<User> => {
  return apiRequest<User>("/profiles/media", "POST", token, payload);
};

export const updateProfileInfo = async (
  token: string,
  payload: { name?: string | null; bio?: string | null; location?: string | null; latitude?: number | null; longitude?: number | null }
): Promise<User> => {
  return apiRequest<User>("/profiles/info", "POST", token, payload);
};

export const updateProfileTheme = async (
  token: string,
  theme: ProfileTheme
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>("/profiles/theme", "PUT", token, theme);
};

export const getHomeFeed = async (
  token: string,
  location?: { latitude: number; longitude: number } | null,
  maxDistanceKm?: number,
  mapBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null,
  offset?: number,
  friendsOnly?: boolean
): Promise<import("./core").HomeFeed> => {
  const params = new URLSearchParams();
  if (location) {
    params.append("latitude", location.latitude.toString());
    params.append("longitude", location.longitude.toString());
  }
  if (maxDistanceKm) params.append("radius_km", maxDistanceKm.toString());
  if (mapBounds) {
    params.append("min_lat", mapBounds.minLat.toString());
    params.append("max_lat", mapBounds.maxLat.toString());
    params.append("min_lng", mapBounds.minLng.toString());
    params.append("max_lng", mapBounds.maxLng.toString());
  }
  if (offset && offset > 0) params.append("offset", offset.toString());
  if (friendsOnly) params.append("friends_only", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<import("./core").HomeFeed>(`/feed/home${query}`, "GET", token);
};

export const getUserAttendance = async (token: string, userId: string): Promise<import("./core").UserAttendance> => {
  return apiRequest<import("./core").UserAttendance>(`/users/${userId}/attendance`, "GET", token);
};

export { uploadImageToCloudinary } from "./media";

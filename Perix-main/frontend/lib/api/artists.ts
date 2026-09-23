import { apiRequest, Artist, ArtistDetail, ProfileTheme, BookingRequest } from "./core";
import { MapBounds } from "./events";

export const getArtists = async (
  token: string,
  mapBounds?: MapBounds
): Promise<Artist[]> => {
  const params = new URLSearchParams();
  if (mapBounds) {
    params.append("min_lat", mapBounds.minLat.toString());
    params.append("max_lat", mapBounds.maxLat.toString());
    params.append("min_lng", mapBounds.minLng.toString());
    params.append("max_lng", mapBounds.maxLng.toString());
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<Artist[]>(`/artists${query}`, "GET", token);
};

export const getMyArtist = async (token: string): Promise<Artist | null> => {
  return apiRequest<Artist | null>("/artists/my", "GET", token);
};

export const createArtist = async (
  token: string,
  payload: {
    name: string;
    bio?: string | null;
    genres: string[];
    socials: Record<string, string>;
    town?: string | null;
    address?: string | null;
    gallery_images: string[];
    fan_gallery: string[];
    video_urls: string[];
    profile_photo?: string | null;
    cover_photo?: string | null;
  }
): Promise<Artist> => {
  return apiRequest<Artist>("/artists", "POST", token, payload);
};

export const getArtistDetail = async (token: string, artistId: string): Promise<ArtistDetail> => {
  return apiRequest<ArtistDetail>(`/artists/${artistId}`, "GET", token);
};

export const updateArtistTheme = async (
  token: string,
  artistId: string,
  theme: ProfileTheme
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/artists/${artistId}/theme`, "PUT", token, theme);
};

export const updateArtist = async (
  token: string,
  artistId: string,
  payload: {
    name?: string | null;
    bio?: string | null;
    genres?: string[] | null;
    socials?: Record<string, string> | null;
    town?: string | null;
    address?: string | null;
    gallery_images?: string[] | null;
    fan_gallery?: string[] | null;
    video_urls?: string[] | null;
    profile_photo?: string | null;
    cover_photo?: string | null;
  }
): Promise<Artist> => {
  return apiRequest<Artist>(`/artists/${artistId}`, "PUT", token, payload);
};

export const createBookingRequest = async (
  token: string,
  artistId: string,
  payload: {
    event_date?: string | null;
    message: string;
    contact_email?: string | null;
  }
): Promise<BookingRequest> => {
  return apiRequest<BookingRequest>(`/artists/${artistId}/bookings`, "POST", token, payload);
};

export const deleteArtist = async (token: string, artistId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/artists/${artistId}`, "DELETE", token);
};

export const reportArtist = async (token: string, artistId: string, reason: string): Promise<{ success: boolean; message: string; report_id: string }> => {
  return apiRequest(`/artists/${artistId}/report`, "POST", token, { reason });
};

export const getArtistFanGallery = async (token: string, artistId: string): Promise<import("./core").Post[]> => {
  return apiRequest<import("./core").Post[]>(`/artists/${artistId}/fan-gallery`, "GET", token);
};

export const hideArtistFanGalleryPost = async (token: string, artistId: string, postId: string): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(`/artists/${artistId}/fan-gallery/${postId}/hide`, "POST", token);
};

export const getArtistFanPosts = async (token: string, artistId: string): Promise<import("./core").Post[]> => {
  return apiRequest<import("./core").Post[]>(`/profiles/artists/${artistId}/fan-posts`, "GET", token);
};

import { apiRequest } from "./core";
export type { UserAnalytics, ArtistAnalytics, BusinessAnalytics } from "./core";

export const getUserAnalytics = async (token: string, days: number = 30): Promise<import("./core").UserAnalytics> => {
  return apiRequest<import("./core").UserAnalytics>(`/analytics/user?days=${days}`, "GET", token);
};

export const getArtistAnalytics = async (
  token: string,
  artistId: string,
  days: number = 30
): Promise<import("./core").ArtistAnalytics> => {
  return apiRequest<import("./core").ArtistAnalytics>(`/analytics/artist/${artistId}?days=${days}`, "GET", token);
};

export const getBusinessAnalytics = async (
  token: string,
  businessId: string,
  days: number = 30
): Promise<import("./core").BusinessAnalytics> => {
  return apiRequest<import("./core").BusinessAnalytics>(`/analytics/business/${businessId}?days=${days}`, "GET", token);
};

export const trackProfileView = async (
  token: string,
  viewedUserId?: string,
  viewedArtistId?: string,
  viewedBusinessId?: string
): Promise<{ tracked: boolean }> => {
  const params = new URLSearchParams();
  if (viewedUserId) params.append("viewed_user_id", viewedUserId);
  if (viewedArtistId) params.append("viewed_artist_id", viewedArtistId);
  if (viewedBusinessId) params.append("viewed_business_id", viewedBusinessId);
  return apiRequest<{ tracked: boolean }>(`/analytics/track-view?${params.toString()}`, "POST", token);
};

import { apiRequest } from "./core";
export type { GeospatialSearchResponse, ArtistSearchResult, PostSearchResult } from "./core";

export const searchNearby = async (
  token: string,
  city?: string,
  latitude?: number,
  longitude?: number,
  radiusKm: number = 25
): Promise<import("./core").GeospatialSearchResponse> => {
  const params = new URLSearchParams();
  if (city) params.append("city", city);
  if (latitude !== undefined) params.append("latitude", latitude.toString());
  if (longitude !== undefined) params.append("longitude", longitude.toString());
  params.append("radius_km", radiusKm.toString());
  return apiRequest<import("./core").GeospatialSearchResponse>(`/search/nearby?${params.toString()}`, "GET", token);
};

export const searchArtistsByCity = async (
  token: string,
  cityName: string,
  radiusKm: number = 25
): Promise<import("./core").ArtistSearchResult[]> => {
  return apiRequest<import("./core").ArtistSearchResult[]>(
    `/search/artists/city/${encodeURIComponent(cityName)}?radius_km=${radiusKm}`,
    "GET",
    token
  );
};

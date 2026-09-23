import { apiRequest, UserPublicProfile } from "./core";

export const getUserBySlug = async (token: string, slug: string): Promise<UserPublicProfile> => {
  return apiRequest<UserPublicProfile>(`/users/slug/${slug}`, "GET", token);
};

export const updateUserSlug = async (token: string, userId: string, slug: string): Promise<{ slug: string }> => {
  return apiRequest<{ slug: string }>(`/users/${userId}/slug`, "PUT", token, { slug });
};

export const getBusinessBySlug = async (token: string, slug: string): Promise<any> => {
  return apiRequest<any>(`/businesses/slug/${slug}`, "GET", token);
};

export const updateBusinessSlug = async (token: string, businessId: string, slug: string): Promise<{ slug: string }> => {
  return apiRequest<{ slug: string }>(`/businesses/${businessId}/slug`, "PUT", token, { slug });
};

export const getArtistBySlug = async (token: string, slug: string): Promise<any> => {
  return apiRequest<any>(`/artists/slug/${slug}`, "GET", token);
};

export const updateArtistSlug = async (token: string, artistId: string, slug: string): Promise<{ slug: string }> => {
  return apiRequest<{ slug: string }>(`/artists/${artistId}/slug`, "PUT", token, { slug });
};

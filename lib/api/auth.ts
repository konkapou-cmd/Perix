import { apiRequest, AuthResponse } from "./core";

export const registerUser = async (
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  city: string,
  latitude?: number,
  longitude?: number
): Promise<AuthResponse> => {
  const body: Record<string, unknown> = {
    name: `${firstName} ${lastName}`.trim(),
    email,
    password,
  };
  if (city) body.city = city;
  if (latitude != null) body.latitude = latitude;
  if (longitude != null) body.longitude = longitude;
  return apiRequest<AuthResponse>("/auth/register", "POST", null, body);
};

export const loginUser = async (email: string, password: string): Promise<AuthResponse> => {
  return apiRequest<AuthResponse>("/auth/login", "POST", null, { email, password });
};

export const getMe = async (token: string): Promise<import("./core").User> => {
  return apiRequest<import("./core").User>("/auth/me", "GET", token);
};

export const logoutUser = async (token: string): Promise<void> => {
  await apiRequest("/auth/logout", "POST", token);
};

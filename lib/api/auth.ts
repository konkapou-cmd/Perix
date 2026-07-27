import { apiRequest, AuthResponse } from "./core";

export const registerUser = async (
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  city: string,
  role: string = "user",
  rootCategory?: string,
  subcategory?: string,
  businessName?: string,
  latitude?: number,
  longitude?: number
): Promise<AuthResponse> => {
  const body: Record<string, unknown> = {
    name: `${firstName} ${lastName}`.trim(),
    email,
    password,
    role,
  };
  if (city) body.city = city;
  if (rootCategory) body.root_category = rootCategory;
  if (subcategory) body.subcategory = subcategory;
  if (businessName) body.business_name = businessName;
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

export const forgotPassword = async (email: string): Promise<{ reset_token: string }> => {
  return apiRequest("/auth/forgot-password", "POST", null, { email });
};

export const resetPassword = async (token: string, new_password: string): Promise<{ status: string }> => {
  return apiRequest("/auth/reset-password", "POST", null, { token, new_password });
};

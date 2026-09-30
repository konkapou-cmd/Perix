import { apiRequest } from "./core";

export type MobilityMode = "bus" | "taxi";

export type LiveVehicle = {
  vehicle_id: string;
  business_id: string;
  mode: MobilityMode;
  fleet_number: string;
  name: string;
  registration?: string | null;
  route_number?: string | null;
  route_direction?: string | null;
  latitude: number | null;
  longitude: number | null;
  heading?: number | null;
  speed?: number | null;
  status: string;
  updated_at: string;
};

export type DriverSession = {
  session_token: string;
  vehicle_id: string;
  mode: MobilityMode;
  fleet_number: string;
  name: string;
  registration?: string | null;
  route_number?: string | null;
  route_direction?: string | null;
  status: string;
};

export const getLiveVehicles = (token?: string | null) =>
  apiRequest<LiveVehicle[]>("/mobility/live", "GET", token || undefined);

export const createMobilityVehicle = (
  token: string,
  payload: {
    mode: MobilityMode;
    fleet_number: string;
    name?: string;
    registration?: string;
    route_number?: string;
    route_direction?: string;
  }
) => apiRequest("/mobility/vehicles", "POST", token, payload);

export const listMobilityVehicles = (token: string) =>
  apiRequest<any[]>("/mobility/vehicles", "GET", token);

export const generateDriverCode = (token: string, vehicleId: string) =>
  apiRequest<{ code: string; expires_at: string }>(
    `/mobility/vehicles/${vehicleId}/code`,
    "POST",
    token
  );

export const driverStart = (code: string) =>
  apiRequest<DriverSession>("/mobility/driver/start", "POST", undefined, { code });

export const driverLocation = (
  token: string,
  latitude: number,
  longitude: number,
  heading?: number | null,
  speed?: number | null
) =>
  apiRequest("/mobility/driver/location", "POST", undefined, {
    token,
    latitude,
    longitude,
    heading,
    speed,
  });

export const driverStatus = (token: string, status: string) =>
  apiRequest("/mobility/driver/status", "POST", undefined, { token, status });

export const driverEnd = (token: string) =>
  apiRequest("/mobility/driver/end", "POST", undefined, { code: token });

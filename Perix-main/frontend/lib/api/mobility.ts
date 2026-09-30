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

export const getMobilityOperatorInfo = (token: string) =>
  apiRequest<{ business_id: string | null; mobility_role: string | null }>(
    "/mobility/me",
    "GET",
    token
  );

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

// ---------------------------------------------------------------------------
// Bus network (routes/stops/timetable) + passenger destination search
// ---------------------------------------------------------------------------

export type BusStop = {
  stop_id: string;
  name: string;
  lat: number;
  lng: number;
  scheduled?: string;
};

export type BusRoute = {
  route_number: string;
  name: string;
  stops: BusStop[];
};

export type BusNetwork = {
  version_id: string | null;
  name: string | null;
  imported_at: string | null;
  routes: BusRoute[];
};

export type ServingBus = {
  vehicle_id: string;
  route_number: string;
  route_direction: string;
  status: string;
  delay_minutes: number;
  eta_minutes: number;
  distance_to_bus_m: number | null;
  distance_to_stop_m: number;
};

export const getBusNetwork = (token?: string | null) =>
  apiRequest<BusNetwork>("/mobility/network", "GET", token || undefined);

export const importBusNetwork = (token: string, name: string, routes: BusRoute[]) =>
  apiRequest<{ version_id: string; diff: any }>("/mobility/network/import", "POST", token, {
    name,
    routes,
  });

export const activateBusNetwork = (token: string, versionId: string) =>
  apiRequest<{ active: string }>("/mobility/network/activate", "POST", token, {
    version_id: versionId,
  });

export const searchBusStops = (token: string | null | undefined, q: string) =>
  apiRequest<{ stop_id: string; name: string; lat: number; lng: number; routes: { route_number: string; headsign: string }[] }[]>(
    `/mobility/buses/search?q=${encodeURIComponent(q)}`,
    "GET",
    token || undefined
  );

export const getBusesServing = (
  token: string | null | undefined,
  stopId: string,
  lat?: number | null,
  lng?: number | null
) =>
  apiRequest<ServingBus[]>(
    `/mobility/buses/serving?stop_id=${encodeURIComponent(stopId)}${
      lat != null && lng != null ? `&lat=${lat}&lng=${lng}` : ""
    }`,
    "GET",
    token || undefined
  );

// ---------------------------------------------------------------------------
// Taxi: pricing, passenger requests, company assignment
// ---------------------------------------------------------------------------

export type TaxiPricing = {
  business_id: string;
  base_fare: number;
  per_km: number;
  minimum: number;
  currency: string;
};

export type TaxiRequest = {
  request_id: string;
  business_id: string;
  business_name: string;
  client_id: string;
  client_name: string;
  pickup_address: string | null;
  pickup_lat: number;
  pickup_lng: number;
  destination_address: string | null;
  destination_lat: number;
  destination_lng: number;
  distance_km: number;
  duration_minutes: number;
  fare_min: number;
  fare_max: number;
  currency: string;
  assigned_vehicle_id: string | null;
  status: "requested" | "accepted" | "declined" | "cancelled" | "completed";
  created_at: string;
  vehicle_eta_minutes: number | null;
  vehicle_distance_m: number | null;
};

export const getTaxiPricing = (token: string) =>
  apiRequest<TaxiPricing>("/mobility/taxi/pricing", "GET", token);

export const setTaxiPricing = (token: string, pricing: Partial<TaxiPricing>) =>
  apiRequest<TaxiPricing>("/mobility/taxi/pricing", "PUT", token, pricing);

export const createTaxiRequest = (
  token: string,
  payload: {
    pickup_address?: string;
    pickup_lat: number;
    pickup_lng: number;
    destination_address?: string;
    destination_lat: number;
    destination_lng: number;
  }
) => apiRequest<TaxiRequest>("/mobility/taxi/request", "POST", token, payload);

export const myTaxiRequests = (token: string) =>
  apiRequest<TaxiRequest[]>("/mobility/taxi/requests/mine", "GET", token);

export const cancelTaxiRequest = (token: string, requestId: string) =>
  apiRequest(`/mobility/taxi/requests/${requestId}/cancel`, "POST", token);

export const listTaxiRequests = (token: string) =>
  apiRequest<TaxiRequest[]>("/mobility/taxi/requests", "GET", token);

export const acceptTaxiRequest = (token: string, requestId: string, vehicleId: string) =>
  apiRequest(`/mobility/taxi/requests/${requestId}/accept`, "POST", token, {
    vehicle_id: vehicleId,
  });

export const declineTaxiRequest = (token: string, requestId: string) =>
  apiRequest(`/mobility/taxi/requests/${requestId}/decline`, "POST", token);

export const completeTaxiRequest = (token: string, requestId: string) =>
  apiRequest(`/mobility/taxi/requests/${requestId}/complete`, "POST", token);

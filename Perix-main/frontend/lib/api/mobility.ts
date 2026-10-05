import { apiRequest, API_BASE } from "./core";

export type MobilityMode = "bus" | "tram" | "taxi";

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
  estimated?: boolean;
  position_source?: string;
  delay_minutes?: number;
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
  parent_station?: string | null;
  location_type?: string;
  platform_code?: string | null;
};

export type BusTrip = {
  trip_id: string;
  headsign?: string;
  start: string;
  end: string;
  stop_ids?: string[];
  stop_times?: Record<string, string>;
  shape_id?: string | null;
};

export type BusRoute = {
  route_number: string;
  name: string;
  mode?: "bus" | "tram";
  stops: BusStop[];
  trips?: BusTrip[];
  // legacy representative geometry (one direction)
  shape?: number[][];
  // trip-specific geometry by shape_id
  shapes?: Record<string, number[][]>;
};

export type BusNetwork = {
  version_id: string | null;
  name: string | null;
  imported_at: string | null;
  routes: BusRoute[];
};

export type TransitStopMarker = {
  stop_id: string;
  stop_ids: string[];
  name: string;
  latitude: number;
  longitude: number;
  modes: ("bus" | "tram")[];
  routes: {
    route_number: string;
    mode: "bus" | "tram";
    directions: string[];
  }[];
};

export const getTransitStops = (token: string | null | undefined) =>
  apiRequest<TransitStopMarker[]>(`/mobility/stops`, "GET", token || undefined);

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

/** Upload a GTFS zip - the backend converts it into the bus/tram network. */
export const importGtfsZip = async (token: string, file: Blob, fileName: string) => {
  const form = new FormData();
  form.append("file", file, fileName);
  const res = await fetch(`${API_BASE}/mobility/network/import-gtfs`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    let detail = "GTFS import failed";
    try {
      const body = await res.json();
      detail = body?.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<{
    version_id: string;
    diff: any;
    summary?: { bus_lines: number; tram_lines: number; trips: number; service_date: string };
  }>;
};

export const searchBusStops = (token: string | null | undefined, q: string) =>
  apiRequest<{ stop_id: string; name: string; lat: number; lng: number; routes: { route_number: string; headsign: string }[] }[]>(
    `/mobility/buses/search?q=${encodeURIComponent(q)}`,
    "GET",
    token || undefined
  );

export type PlaceSuggestion = {
  id?: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  category?: string;
};

export type StopSuggestion = {
  stop_id: string;
  name: string;
  lat: number;
  lng: number;
};

export type StreetSuggestion = {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  type?: string;
};

export const searchPlaces = (token: string | null | undefined, q: string) =>
  apiRequest<{ places: PlaceSuggestion[]; stops: StopSuggestion[]; streets: StreetSuggestion[] }>(
    `/mobility/places/search?q=${encodeURIComponent(q)}`,
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

export type TripStopProgress = {
  stop_id: string;
  name: string;
  scheduled: string | null;
  delay_seconds: number;
  predicted: string;
  passed: boolean;
};

export type VehicleTripProgress = {
  vehicle_id: string;
  route_number: string;
  route_direction: string;
  mode: string;
  delay_minutes: number;
  position_source: string;
  estimated: boolean;
  stops: TripStopProgress[];
};

export const getVehicleTrip = (token: string | null | undefined, vehicleId: string) =>
  apiRequest<VehicleTripProgress>(
    `/mobility/vehicles/${encodeURIComponent(vehicleId)}/trip`,
    "GET",
    token || undefined
  );

// ---------------------------------------------------------------------------
// Journey planning (point-to-point, transfers + walking)
// ---------------------------------------------------------------------------

export type PlanLeg = {
  type: "walk" | "walk_transfer" | "ride";
  minutes: number;
  label?: string;
  lat?: number;
  lng?: number;
  route_number?: string;
  mode?: string;
  direction?: string;
  board?: string;
  alight?: string;
  depart?: string;
  arrive?: string;
  points?: (number[] | null)[];
};

export type JourneyPlan = {
  duration_minutes: number;
  walking_minutes: number;
  departure: string;
  arrival: string;
  legs: PlanLeg[];
};

export const planJourney = (
  token: string | null | undefined,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) =>
  apiRequest<{ itineraries: JourneyPlan[]; note?: string }>(
    `/mobility/plan?from_lat=${fromLat}&from_lng=${fromLng}&to_lat=${toLat}&to_lng=${toLng}`,
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

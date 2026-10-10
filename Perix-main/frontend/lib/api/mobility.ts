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
  position_quality?: "LIVE" | "REALTIME" | "SCHEDULE" | string;
  position_age_seconds?: number;
  accuracy_m?: number | null;
  trip_id?: string | null;
  trip_instance_id?: string | null;
  delay_minutes?: number;
  next_stop_id?: string | null;
  next_stop_name?: string | null;
  distance_to_next_stop_m?: number | null;
  pattern_id?: string | null;
  progress_m?: number | null;
  position_state?: "ON_PATTERN" | "STOP_ANCHOR" | "TURNAROUND_ANCHOR" | "LIVE_MATCHED" | "LIVE_RAW" | string | null;
  geometry_pending?: boolean;
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

export const getLiveVehicles = async (token?: string | null): Promise<LiveVehicle[]> => {
  // Stable V2 API: the Locator no longer knows GTFS/GPS internals.
  const raw = await apiRequest<V2Vehicle[]>("/mobility/v2/vehicles", "GET", token || undefined);
  return (raw || []).map((v) => {
    const ageSeconds = Math.max(0, Number(v.position?.age_seconds ?? 0));
    return {
      vehicle_id: v.vehicle_id,
      business_id: "",
      mode: v.mode as MobilityMode,
      fleet_number: String(v.route?.number ?? ""),
      name: String(v.route?.number ?? v.vehicle_id),
      route_number: v.route?.number ?? null,
      route_direction: v.route?.direction ?? null,
      latitude: v.position?.latitude ?? null,
      longitude: v.position?.longitude ?? null,
      heading: v.position?.heading ?? null,
      status: v.position?.source ?? "active",
      updated_at: new Date(Date.now() - ageSeconds * 1000).toISOString(),
      estimated: v.estimated ?? false,
      position_source: v.position?.source,
      position_quality: v.position?.quality,
      position_age_seconds: ageSeconds,
      accuracy_m: v.position?.accuracy_m ?? null,
      trip_id: v.trip_id ?? null,
      trip_instance_id: v.trip_instance_id ?? null,
      delay_minutes: v.delay_minutes ?? 0,
      next_stop_id: v.next_stop_id ?? null,
      next_stop_name: v.next_stop_name ?? null,
      distance_to_next_stop_m: v.distance_to_next_stop_m ?? null,
      pattern_id: v.pattern_id ?? null,
      progress_m: v.progress_m ?? null,
      position_state: v.position_state,
      geometry_pending: v.geometry_pending ?? false,
    };
  });
};

export type V2Vehicle = {
  vehicle_id: string;
  mode: string;
  route?: { number?: string | null; direction?: string | null };
  position?: {
    latitude?: number | null;
    longitude?: number | null;
    heading?: number | null;
    source?: string;
    quality?: string;
    accuracy_m?: number | null;
    age_seconds?: number;
  };
  trip_instance_id?: string | null;
  trip_id?: string | null;
  delay_minutes?: number;
  estimated?: boolean;
  next_stop_id?: string | null;
  next_stop_name?: string | null;
  distance_to_next_stop_m?: number | null;
  pattern_id?: string | null;
  progress_m?: number | null;
  position_state?: string | null;
  geometry_pending?: boolean;
};

export type V2Arrival = {
  trip_instance_id?: string;
  trip_id?: string;
  route_number: string;
  direction?: string | null;
  mode?: string;
  eta_seconds?: number;
  predicted?: string;
  delay_seconds?: number;
  source?: string;
  vehicle_id: string;
  distance_to_stop_m?: number | null;
};

export type V2MapLineStop = {
  stop_id: string;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type V2MapLine = {
  pattern_id: string;
  route_number: string;
  mode?: "bus" | "tram";
  direction?: string;
  points: { latitude: number; longitude: number }[];
  source?: string;
  valid?: boolean;
  max_platform_distance_m?: number | null;
  stops?: V2MapLineStop[];
};

export type V2Map = {
  lines: V2MapLine[];
  stops: TransitStopMarker[];
};

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
  platforms?: {
    platform_id: string;
    latitude?: number | null;
    longitude?: number | null;
    name?: string;
    platform_code?: string | null;
    directions?: string[];
    side?: string | null;
  }[];
  routes: {
    route_number: string;
    mode: "bus" | "tram";
    directions: string[];
  }[];
};

export const getTransitStops = (token: string | null | undefined) =>
  apiRequest<TransitStopMarker[]>(`/mobility/v2/stops`, "GET", token || undefined);

/** Stable map payload: resolved transit lines + physical stops. */
export const getV2Map = (token: string | null | undefined) =>
  apiRequest<V2Map>(`/mobility/v2/map`, "GET", token || undefined);

export type TrafficClosure = {
  restriction_id: string;
  kind: string;
  geometry: [number, number][] | null;
  geometry_parts?: [number, number][][];
  blocked_modes?: string[];
  allowed_modes?: string[];
  verified?: boolean;
  geometry_source?: string;
  match_confidence?: number;
  max_match_error_m?: number;
  blocked_way_ids?: number[];
  from?: string;
  to?: string;
  description?: string;
  road_numbers?: string[];
  valid_from?: string | null;
  valid_until?: string | null;
};

export type TrafficInfo = {
  incidents: Record<string, any>[];
  closures: TrafficClosure[];
  updated_at?: string | null;
};

export const getTraffic = (token: string | null | undefined) =>
  apiRequest<TrafficInfo>(`/mobility/v2/traffic`, "GET", token || undefined);

export type ServingBus = {
  vehicle_id: string;
  route_number: string;
  route_direction: string;
  status: string;
  delay_minutes: number;
  eta_minutes: number;
  distance_to_bus_m: number | null;
  distance_to_stop_m: number | null;
  mode?: string;
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

export const getBusesServing = async (
  token: string | null | undefined,
  stopId: string,
  _lat?: number | null,
  _lng?: number | null
): Promise<ServingBus[]> => {
  // Stable V2 unified arrivals engine (LIVE / REALTIME / SCHEDULE).
  const raw = await apiRequest<V2Arrival[]>(
    `/mobility/v2/stops/${encodeURIComponent(stopId)}/arrivals`,
    "GET",
    token || undefined
  );
  return (raw || []).map((a) => ({
    vehicle_id: a.vehicle_id,
    route_number: a.route_number,
    route_direction: a.direction ?? "",
    status: a.source ?? "SCHEDULE",
    delay_minutes: Math.max(0, Math.round((a.delay_seconds ?? 0) / 60)),
    eta_minutes: Math.max(0, Math.ceil((a.eta_seconds ?? 0) / 60)),
    distance_to_bus_m: null,
    distance_to_stop_m: a.distance_to_stop_m ?? null,
    mode: a.mode,
  }));
};

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
    `/mobility/v2/plan?from_lat=${fromLat}&from_lng=${fromLng}&to_lat=${toLat}&to_lng=${toLng}`,
    "GET",
    token || undefined
  );

// ---------------------------------------------------------------------------
// Network Editor (V2): GPS devices, graph overlays, stop/trip overrides
// ---------------------------------------------------------------------------

export type MobilityDevice = {
  device_id: string;
  name?: string;
  source_type: string;
  vehicle_id?: string | null;
  active?: boolean;
  created_at?: string;
};

export const registerDevice = (token: string, payload: { name?: string; source_type?: string; vehicle_id?: string }) =>
  apiRequest<{ device_id: string; secret: string } & MobilityDevice>("/mobility/v2/devices", "POST", token, payload);

export const listDevices = (token: string) =>
  apiRequest<MobilityDevice[]>("/mobility/v2/devices", "GET", token);

export const assignDevice = (token: string, deviceId: string, vehicleId: string) =>
  apiRequest(`/mobility/v2/devices/${deviceId}/assign`, "POST", token, { vehicle_id: vehicleId });

export const deleteDevice = (token: string, deviceId: string) =>
  apiRequest(`/mobility/v2/devices/${deviceId}`, "DELETE", token);

export type GraphOverlay = {
  overlay_id: string;
  name?: string;
  geometry: number[][];
  allowed_modes?: string[];
  route_number?: string | null;
  direction?: string | null;
  verified?: boolean;
  created_at?: string;
};

export const createGraphOverlay = (token: string, payload: Partial<GraphOverlay>) =>
  apiRequest<GraphOverlay>("/mobility/v2/graph/overlays", "POST", token, payload);

export const listGraphOverlays = (token: string) =>
  apiRequest<GraphOverlay[]>("/mobility/v2/graph/overlays", "GET", token);

export const createStopOverride = (token: string, payload: Record<string, any>) =>
  apiRequest("/mobility/v2/editor/overrides", "POST", token, payload);

export const listStopOverrides = (token: string) =>
  apiRequest<any[]>("/mobility/v2/editor/overrides", "GET", token);

export const deleteStopOverride = (token: string, overrideId: string) =>
  apiRequest(`/mobility/v2/editor/overrides/${overrideId}`, "DELETE", token);

export const createTripOverride = (token: string, payload: Record<string, any>) =>
  apiRequest("/mobility/v2/editor/trip-overrides", "POST", token, payload);

export const listTripOverrides = (token: string) =>
  apiRequest<any[]>("/mobility/v2/editor/trip-overrides", "GET", token);

export const deleteTripOverride = (token: string, overrideId: string) =>
  apiRequest(`/mobility/v2/editor/trip-overrides/${overrideId}`, "DELETE", token);

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

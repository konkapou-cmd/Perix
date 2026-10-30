import { apiRequest, API_BASE } from "./core";

export type MobilityMode = "bus" | "tram" | "taxi";
export type TrafficContext = "baseline" | "google_locator";

export type MotionDiagnostics = {
  model?: string | null;
  quality?: string | null;
  state?: string | null;
  speed_kmh?: number | null;
  leg_from_stop_id?: string | null;
  leg_to_stop_id?: string | null;
  delay_delta_s?: number | null;
  scheduled_duration_s?: number | null;
  predicted_leg_duration_s?: number | null;
  engine_available_duration_s?: number | null;
  natural_duration_s?: number | null;
  fastest_duration_s?: number | null;
  recovery_ratio?: number | null;
  physics_limited_s?: number | null;
  arrival_target_error_s?: number | null;
  incremental_physics_limited_s?: number | null;
  carried_lateness_s?: number | null;
  recovered_lateness_s?: number | null;
  fit?: string | null;
  traffic_edge_count?: number | null;
  signal_stop_count?: number | null;
  traffic_provider?: string | null;
  traffic_profile_versions?: string[];
  plan_final_arrival_target_error_s?: number | null;
  plan_max_arrival_target_error_s?: number | null;
  plan_incremental_physics_limited_s?: number | null;
  fallback_reason?: string | null;
};

export type EffectivePrediction = {
  motion_plan_revision?: string | null;
  next_timeline_index?: number | null;
  prediction_basis?: string;
  realtime_feed_timestamp?: number | null;
  realtime_updated_at?: string | null;
  next_stop_eta_seconds?: number | null;
  next_stop_predicted_arrival?: string | null;
  source_next_stop_predicted_arrival?: string | null;
  next_stop_eta_source?: string | null;
};

export type LiveVehicle = EffectivePrediction & {
  network_version_id?: string;
  service_date?: string;
  vehicle_id: string;
  business_id: string;
  mode: MobilityMode;
  identity_kind?: "PHYSICAL" | "VIRTUAL_REALTIME" | "VIRTUAL_SCHEDULE" | string;
  registered_vehicle_id?: string | null;
  fleet_number: string;
  name: string;
  registration?: string | null;
  route_number?: string | null;
  display_route_number?: string | null;
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
  motion?: MotionDiagnostics | null;
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

export const getLiveVehicles = async (token?: string | null, trafficContext: TrafficContext = "baseline"): Promise<LiveVehicle[]> => {
  // Stable V2 API: the Locator no longer knows GTFS/GPS internals.
  const raw = await apiRequest<V2Vehicle[]>(`/mobility/v2/vehicles${trafficContext === "google_locator" ? "?traffic_context=google_locator" : ""}`, "GET", token || undefined);
  return (raw || []).map((v) => {
    const ageSeconds = Math.max(0, Number(v.position?.age_seconds ?? 0));
    return {
      vehicle_id: v.vehicle_id,
      business_id: "",
      mode: v.mode as MobilityMode,
      identity_kind: v.identity_kind,
      registered_vehicle_id: v.registered_vehicle_id ?? null,
      fleet_number: String(v.route?.number ?? ""),
      name: String(v.route?.number ?? v.vehicle_id),
      route_number: v.route?.number ?? null,
      display_route_number: v.display_route_number ?? null,
      route_direction: v.route?.direction ?? null,
      latitude: v.position?.latitude ?? null,
      longitude: v.position?.longitude ?? null,
      heading: v.position?.heading ?? null,
      speed: v.motion?.speed_kmh ?? null,
      status: v.position?.source ?? "active",
      updated_at: new Date(Date.now() - ageSeconds * 1000).toISOString(),
      estimated: v.estimated ?? false,
      position_source: v.position?.source,
      position_quality: v.position?.quality,
      position_age_seconds: ageSeconds,
      accuracy_m: v.position?.accuracy_m ?? null,
      trip_id: v.trip_id ?? null,
      trip_instance_id: v.trip_instance_id ?? null,
      network_version_id: v.network_version_id,
      service_date: v.service_date,
      delay_minutes: v.delay_minutes ?? 0,
      next_stop_id: v.next_stop_id ?? null,
      next_stop_name: v.next_stop_name ?? null,
      distance_to_next_stop_m: v.distance_to_next_stop_m ?? null,
      pattern_id: v.pattern_id ?? null,
      progress_m: v.progress_m ?? null,
      position_state: v.position_state,
      geometry_pending: v.geometry_pending ?? false,
      motion: v.motion ?? null,
      motion_plan_revision: v.motion_plan_revision,
      next_timeline_index: v.next_timeline_index,
      prediction_basis: v.prediction_basis,
      realtime_feed_timestamp: v.realtime_feed_timestamp,
      realtime_updated_at: v.realtime_updated_at,
      next_stop_eta_seconds: v.next_stop_eta_seconds,
      next_stop_predicted_arrival: v.next_stop_predicted_arrival,
      source_next_stop_predicted_arrival: v.source_next_stop_predicted_arrival,
      next_stop_eta_source: v.next_stop_eta_source,
    };
  });
};

export type V2Vehicle = EffectivePrediction & {
  network_version_id?: string;
  service_date?: string;
  vehicle_id: string;
  identity_kind?: "PHYSICAL" | "VIRTUAL_REALTIME" | "VIRTUAL_SCHEDULE" | string;
  registered_vehicle_id?: string | null;
  mode: string;
  display_route_number?: string | null;
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
  motion?: MotionDiagnostics | null;
};

export type V2Arrival = {
  trip_instance_id?: string;
  trip_id?: string;
  route_number: string;
  display_route_number?: string;
  display_route_source?: string;
  position_eta_consistency?: string;
  position_required_kmh?: number | null;
  direction?: string | null;
  mode?: string;
  eta_seconds?: number | null;
  platform_id?: string;
  source_predicted_arrival?: string;
  source_eta_source?: string;
  motion_plan_revision?: string | null;
  predicted?: string;
  scheduled_arrival?: string;
  scheduled_departure?: string;
  predicted_arrival?: string;
  predicted_departure?: string;
  delay_seconds?: number;
  departure_delay_seconds?: number;
  source?: string;
  eta_source?: "REALTIME" | "SCHEDULE" | string;
  position_source?: "LIVE" | "ESTIMATED" | string;
  realtime_updated_at?: string | null;
  realtime_feed_timestamp?: number | null;
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
  network_version_id?: string;
  service_date?: string;
  approach_geometry_fingerprint?: string;
  pattern_id: string;
  route_number: string;
  display_route_number?: string;
  display_route_source?: string;
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
  diversion_warnings?: { route_number: string; mode?: string; direction?: string; status: string }[];
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
  stop_place_id?: string;
  stop_ids: string[];
  name: string;
  aliases?: string[];
  members?: {
    stop_id: string;
    name: string;
    latitude?: number | null;
    longitude?: number | null;
  }[];
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
    routes?: string[];
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

export type ServingBus = {
  vehicle_id: string;
  route_number: string;
  display_route_number?: string;
  position_eta_consistency?: string;
  route_direction: string;
  status: string;
  delay_minutes: number; // signed: negative means early
  eta_minutes: number | null;
  platform_id?: string;
  source_predicted_arrival?: string;
  source_eta_source?: string;
  motion_plan_revision?: string | null;
  scheduled_arrival?: string;
  scheduled_departure?: string;
  predicted_arrival?: string;
  predicted_departure?: string;
  eta_source?: string;
  position_source?: string;
  realtime_updated_at?: string | null;
  realtime_feed_timestamp?: number | null;
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
  _lng?: number | null,
  trafficContext: TrafficContext = "baseline",
  platformId?: string
): Promise<ServingBus[]> => {
  // Stable V2 unified arrivals engine (LIVE / REALTIME / SCHEDULE).
  const query: string[] = [];
  if (trafficContext === "google_locator") query.push("traffic_context=google_locator");
  if (platformId) query.push(`platform_id=${encodeURIComponent(platformId)}`);
  const raw = await apiRequest<V2Arrival[]>(
    `/mobility/v2/stops/${encodeURIComponent(stopId)}/arrivals${query.length ? `?${query.join("&")}` : ""}`,
    "GET",
    token || undefined
  );
  return (raw || []).map((a) => ({
    vehicle_id: a.vehicle_id,
    route_number: a.route_number,
    display_route_number: a.display_route_number,
    position_eta_consistency: a.position_eta_consistency,
    route_direction: a.direction ?? "",
    status: a.source ?? "SCHEDULE",
    delay_minutes: Math.round((a.delay_seconds ?? 0) / 60),
    eta_minutes: typeof a.eta_seconds === "number" && Number.isFinite(a.eta_seconds)
      ? Math.max(0, Math.ceil(a.eta_seconds / 60)) : null,
    platform_id: a.platform_id,
    source_predicted_arrival: a.source_predicted_arrival,
    source_eta_source: a.source_eta_source,
    motion_plan_revision: a.motion_plan_revision,
    scheduled_arrival: a.scheduled_arrival,
    scheduled_departure: a.scheduled_departure,
    predicted_arrival: a.predicted_arrival ?? a.predicted,
    predicted_departure: a.predicted_departure,
    eta_source: a.eta_source ?? a.source ?? "SCHEDULE",
    position_source: a.position_source ?? "ESTIMATED",
    realtime_updated_at: a.realtime_updated_at,
    realtime_feed_timestamp: a.realtime_feed_timestamp,
    distance_to_bus_m: null,
    distance_to_stop_m: a.distance_to_stop_m ?? null,
    mode: a.mode,
  }));
};

export type TripStopProgress = {
  source_predicted?: string;
  predicted_departure?: string;
  prediction_basis?: string;
  stop_id: string;
  name: string;
  scheduled: string | null;
  delay_seconds: number;
  predicted: string;
  passed: boolean;
  skipped?: boolean;
  schedule_relationship?: string;
};

export type VehicleTripProgress = {
  motion_plan_revision?: string | null;
  next_timeline_index?: number | null;
  vehicle_id: string;
  trip_id?: string | null;
  route_number: string;
  route_direction: string;
  mode: string;
  delay_minutes: number;
  position_source: string;
  estimated: boolean;
  stops: TripStopProgress[];
};

export const getVehicleTrip = (token: string | null | undefined, vehicleId: string, trafficContext: TrafficContext = "baseline") =>
  apiRequest<VehicleTripProgress>(
    `/mobility/vehicles/${encodeURIComponent(vehicleId)}/trip${trafficContext === "google_locator" ? "?traffic_context=google_locator" : ""}`,
    "GET",
    token || undefined
  );

// ---------------------------------------------------------------------------
// Journey planning (point-to-point, transfers + walking)
// ---------------------------------------------------------------------------

export type PlanLeg = {
  trip_id?: string;
  trip_instance_id?: string;
  pattern_id?: string;
  board_stop_id?: string;
  alight_stop_id?: string;
  board_timeline_index?: number;
  board_progress_m?: number;
  board_geometry_fingerprint?: string;
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

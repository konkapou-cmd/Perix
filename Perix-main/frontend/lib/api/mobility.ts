import { apiRequest, API_BASE } from "./core";
import { captureServerClock, sampleServerClock } from "../city/serverClock";
import type { ServerClock } from "../city/serverClock";

export type MobilityMode = "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry" | "taxi";

export type MotionPreview = {
  schema: number; revision: string; journey_id: string; pattern_id: string;
  semantics?: string; physical_speed_assurance?: boolean;
  approach_geometry_fingerprint?: string | null;
  stop_occurrence_index: number; stop_progress_m: number; effective_arrival_at_ms: number;
  sampled_at_ms: number; valid_until_ms: number; server_received_at_ms: number; server_sent_at_ms: number;
  client_request_at_ms: number; client_received_at_ms: number;
  client_received_monotonic_ms?: number;
  client_request_started_monotonic_ms?: number;
  client_navigation_started_monotonic_ms?: number;
  coverage_end_reason?: string;
  client_server_clock_at_receive_ms?: number;
  client_clock_uncertainty_ms?: number;
  client_clock_calibrated_monotonic_ms?: number;
  visual_rule_version?: string | null;
  stop_progress_by_occurrence_m?: number[];
  station_window?: StationCycle[] | null;
  visual_parameters?: { handover_min_ramp_s: number; relative_motion_rate_per_s: number;
    initial_coverage_s: number; rolling_coverage_s: number;
    relative_motion_continuous?: boolean; relative_motion_fractional_step?: number;
    relative_motion_level_marks?: number[]; station_approach_lead_s?: number;
    station_stop_lead_s?: number; station_window_occurrences?: number } | null;
  phases: { t0: number; t1: number; p0: number; p1: number; v0: number; a: number; state?: string;
    stop_occurrence_index?: number; start_progress_m?: number; stop_progress_m?: number;
    effective_arrival_at_ms?: number; relative_motion_level0?: number; relative_motion_level1?: number; station_cycle?: StationCycle }[];
};

export type StationCycle = { stop_occurrence_index: number; stop_id: string;
  modeled_arrival_at_ms: number; modeled_departure_at_ms: number; approach_started_at_ms: number;
  countdown_event: 'DEPARTURE' | 'WAITING_FOR_SOURCE_UPDATE'; countdown_target_at_ms: number | null;
  release_condition: string; departure_basis: string; cycle_limited: boolean;
  incoming_leg_available: boolean; outgoing_leg_available: boolean };

export type MotionDiagnostics = {
  geometry_fingerprint?: string | null;
  visual_context?: {
    schema: number; modeled_not_observed: boolean; spatial_strength: number;
    traffic_provider: string | null; traffic_edge_counts: number[];
    traffic_profile_versions: string[]; traffic_models: string[]; traffic_calibrated: boolean;
    density_model: boolean; dwell_basis: string;
    optical_delay_allocation?: string; active_spatial_strength?: number;
    visual_rule_version?: string;
    wait_state?: { stop_occurrence_index: number; release_condition: 'KNOWN_DEPARTURE' | 'RELEVANT_SOURCE_UPDATE';
      modeled_departure_s: number; wait_started_s: number; waited_s: number; relevant_source_revision: string } | null;
  } | null;
  physical_speed_assurance?: boolean;
  observed_arrival?: boolean;
  publication_status?: "READY" | "PENDING" | "HIDDEN" | null;
  continuation_state?: "ESTIMATED" | "EXPIRED" | null;
  preview?: MotionPreview | null;
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

export type LiveVehicle = {
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
  network_version_id?: string | null;
  service_date?: string | null;
  delay_minutes?: number;
  next_stop_id?: string | null;
  next_stop_name?: string | null;
  next_timeline_index?: number | null;
  next_stop_eta_seconds?: number | null;
  display_eta_seconds?: number | null;
  eta_sampled_at_ms?: number | null;
  next_stop_predicted_arrival?: string | null;
  next_stop_eta_source?: string | null;
  distance_to_next_stop_m?: number | null;
  pattern_id?: string | null;
  progress_m?: number | null;
  motion_plan_revision?: string | null;
  estimate_revision?: string | null;
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

let visualServerClock: ServerClock | null = null;
let visualClockRequest: Promise<void> | null = null;
function refreshVisualClock() {
  if (typeof performance === "undefined" || visualClockRequest) return;
  const requested=performance.now();
  if (visualServerClock && requested-visualServerClock.monotonicMs<60000) return;
  visualClockRequest=apiRequest<{server_received_at_ms:number;server_sent_at_ms:number}>("/mobility/v2/clock","GET")
    .then(response=>{const clock=captureServerClock(response,requested,performance.now());if(clock)visualServerClock=clock;})
    .catch(()=>{}).finally(()=>{visualClockRequest=null;});
}

export const getLiveVehicles = async (token?: string | null, initialSync = false, capturePreviewClock = false): Promise<LiveVehicle[]> => {
  // Stable V2 API: the Locator no longer knows GTFS/GPS internals.
  const requestedAt = Date.now();
  const requestedMonotonic = typeof performance !== 'undefined' ? performance.now() : undefined;
  const navigationStarted = typeof performance !== 'undefined'
    ? performance.getEntriesByType?.('navigation')?.[0]?.startTime ?? 0 : undefined;
  if (capturePreviewClock) refreshVisualClock();
  const query = [initialSync ? "initial_sync=true" : "", capturePreviewClock
    ? "visual_preview_seconds=45&visual_rule_version=station-cycle-v2" : ""].filter(Boolean).join("&");
  const raw = await apiRequest<V2Vehicle[]>(`/mobility/v2/vehicles${query ? `?${query}` : ""}`, "GET", token || undefined);
  const receivedAt = Date.now();
  const receivedMonotonic = typeof performance !== "undefined" ? performance.now() : undefined;
  return adaptV2Vehicles(raw,requestedAt,requestedMonotonic,navigationStarted,receivedAt,receivedMonotonic,capturePreviewClock);
};

function adaptV2Vehicles(raw:V2Vehicle[] | null | undefined,requestedAt:number,requestedMonotonic:number | undefined,
  navigationStarted:number | undefined,receivedAt:number,receivedMonotonic:number | undefined,capturePreviewClock:boolean):LiveVehicle[] {
  const clock=receivedMonotonic != null ? sampleServerClock(visualServerClock,receivedMonotonic) : null;
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
      network_version_id: v.network_version_id ?? null,
      service_date: v.service_date ?? null,
      delay_minutes: v.delay_minutes ?? 0,
      next_stop_id: v.next_stop_id ?? null,
      next_stop_name: v.next_stop_name ?? null,
      next_timeline_index: v.next_timeline_index ?? null,
      next_stop_eta_seconds: v.next_stop_eta_seconds ?? null,
      // Raw ETA/progress remain the sampled publication identity. Display age
      // uses the same server clock as the authorized curve, never a fixed +8 s.
      display_eta_seconds: clock && Number.isFinite(v.eta_sampled_at_ms) && v.next_stop_eta_seconds != null
        ? Math.max(0, v.next_stop_eta_seconds-Math.max(0, clock.serverMs-v.eta_sampled_at_ms!)/1000)
        : v.next_stop_eta_seconds ?? null,
      eta_sampled_at_ms: v.eta_sampled_at_ms ?? null,
      next_stop_predicted_arrival: v.next_stop_predicted_arrival ?? null,
      next_stop_eta_source: v.next_stop_eta_source ?? null,
      distance_to_next_stop_m: v.distance_to_next_stop_m ?? null,
      pattern_id: v.pattern_id ?? null,
      progress_m: v.progress_m ?? null,
      motion_plan_revision: v.motion_plan_revision ?? null,
      estimate_revision: v.estimate_revision ?? null,
      position_state: v.position_state,
      geometry_pending: v.geometry_pending ?? false,
      motion: v.motion && (capturePreviewClock || v.motion.model === "TIME_NORMALIZED_VISUAL_ESTIMATE") ? { ...v.motion, preview: v.motion.preview ? {
        ...v.motion.preview, client_request_at_ms: requestedAt, client_received_at_ms: receivedAt,
        client_received_monotonic_ms: receivedMonotonic,
        client_request_started_monotonic_ms: requestedMonotonic,
        client_navigation_started_monotonic_ms: navigationStarted,
        client_server_clock_at_receive_ms: clock?.serverMs,
        client_clock_uncertainty_ms: clock?.uncertaintyMs,
        client_clock_calibrated_monotonic_ms: clock?.calibratedMonotonicMs,
      } : null } : v.motion ?? null,
    };
  });
};

export type V2Vehicle = {
  eta_sampled_at_ms?: number | null;
  vehicle_id: string;
  identity_kind?: "PHYSICAL" | "VIRTUAL_REALTIME" | "VIRTUAL_SCHEDULE" | string;
  registered_vehicle_id?: string | null;
  mode: string;
  route?: { number?: string | null; direction?: string | null };
  display_route_number?: string | null;
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
  network_version_id?: string | null;
  service_date?: string | null;
  trip_id?: string | null;
  delay_minutes?: number;
  estimated?: boolean;
  next_stop_id?: string | null;
  next_stop_name?: string | null;
  next_timeline_index?: number | null;
  next_stop_eta_seconds?: number | null;
  next_stop_predicted_arrival?: string | null;
  next_stop_eta_source?: string | null;
  distance_to_next_stop_m?: number | null;
  pattern_id?: string | null;
  progress_m?: number | null;
  motion_plan_revision?: string | null;
  estimate_revision?: string | null;
  position_state?: string | null;
  geometry_pending?: boolean;
  motion?: MotionDiagnostics | null;
};

export type V2Arrival = {
  countdown_event?: string;
  countdown_target_at_ms?: number | null;
  countdown_seconds?: number | null;
  trip_instance_id?: string;
  trip_id?: string;
  pattern_id?: string | null;
  network_version_id?: string;
  service_date?: string;
  route_number: string;
  direction?: string | null;
  mode?: string;
  eta_seconds?: number;
  eta_sampled_at_ms?: number;
  effective_arrival_at_ms?: number;
  predicted?: string;
  delay_seconds?: number;
  source?: string;
  vehicle_id: string;
  platform_id?: string;
  platform_code?: string | null;
  position_source?: string;
  position_assurance?: string | null;
  motion_plan_revision?: string | null;
  next_stop_id?: string | null;
  next_stop_name?: string | null;
  position_latitude?: number | null;
  position_longitude?: number | null;
  vehicle_link_basis?: "EXACT_TRIP" | "VERIFIED_BLOCK_PREDECESSOR" | string;
  position_trip_id?: string | null;
  position_trip_instance_id?: string | null;
  position_pattern_id?: string | null;
  position_route_number?: string | null;
  position_mode?: string | null;
  position_motion_plan_revision?: string | null;
  distance_to_stop_m?: number | null;
}

export type V2MapLineStop = {
  stop_id: string;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type V2MapLine = {
  service_active?: boolean;
  pattern_id: string;
  network_version_id?: string | null;
  service_date?: string | null;
  approach_geometry_fingerprint?: string | null;
  route_number: string;
  mode?: "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry";
  direction?: string;
  points: { latitude: number; longitude: number }[];
  source?: string;
  valid?: boolean;
  max_platform_distance_m?: number | null;
  stops?: V2MapLineStop[];
};

export type V2SourceManifest = {
  network_version_id?: string | null;
  service_date?: string | null;
  manifest?: {
    kind?: string;
    sha256?: string;
    ingestion?: string;
    notices?: Record<string, { status?: string; sha256?: string }>;
    publisher?: { publisher_name?: string; publisher_url?: string };
  } | null;
};

export type V2Map = {
  lines: V2MapLine[];
  stops: TransitStopMarker[];
  source_manifests?: V2SourceManifest[];
};

export type V2NearbyStops = { stops: TransitStopMarker[]; radius_m?: number; zoom_required?: boolean };
export type V2NearbyLines = Omit<V2Map,"stops"> & { diversion_warnings?: unknown[] };

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
  mode?: "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry";
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
  physical_stop_id?: string;
  platform_id?: string;
  platform_code?: string | null;
  service_active?: boolean;
  /** Street side from the backend line geometry ("left"/"right"); null when unknown. */
  side?: string | null;
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
  modes: ("bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry")[];
  platforms?: {
    platform_id: string;
    latitude?: number | null;
    longitude?: number | null;
    name?: string;
    platform_code?: string | null;
    directions?: string[];
    routes?: string[];
    modes?: ('bus' | 'tram' | 'subway' | 's-bahn' | 'rail' | 'ferry')[];
    service_active?: boolean;
    side?: string | null;
  }[];
  routes: {
    route_number: string;
    mode: "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry";
    directions: string[];
  }[];
};

/**
 * The V2 map/stops catalogue is public and identical for signed-in and
 * anonymous callers. Share one in-flight read and a short in-memory snapshot
 * across App/Home/Locator route mounts. Stops and origin-scoped map geometry
 * also have a bounded disk cache; clocks and fleet publications never do.
 */
export const V2_MAP_CACHE_TTL_MS = 4 * 60 * 1000;
const mapRequests = new Map<string, Promise<V2Map>>();
const mapSnapshots = new Map<string, { expiresAt: number; value: V2Map }>();
const stopRequests = new Map<string, Promise<TransitStopMarker[]>>();
const stopSnapshots = new Map<string, { expiresAt: number; value: TransitStopMarker[] }>();
const nearbyMapRequests = new Map<string, Promise<V2NearbyLines>>();
const nearbyMapSnapshots = new Map<string, { expiresAt: number; value: V2NearbyLines }>();
const nearbyStopsRequests = new Map<string, Promise<V2NearbyStops>>();
const nearbyStopsSnapshots = new Map<string, { expiresAt: number; value: V2NearbyStops }>();

// Reuse existing public catalogue/geometry. Nearby keys include origin/bounds,
// so Magdeburg, Syros and Mykonos never share a nearby snapshot.
export const PERSIST_TTL_MS = 12 * 3600 * 1000;
function persistGet<T>(key: string,validate:(value:unknown)=>boolean): T | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()
      || data.schema!==2 || data.day!==cacheServiceDay() || !validate(data.value)) return null;
    return data.value as T;
  } catch { return null; }
}
function persistSet(key: string, value: unknown) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const storage=window.localStorage;
    const prefix='@perix_v2_';
    // Bound disk use to at most eight snapshots. Do not evict unrelated app data.
    const existing=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((k):k is string=>!!k&&k.startsWith(prefix)&&k!==key);
    while(existing.length>=8){const oldest=existing.shift();if(oldest)storage.removeItem(oldest);}
    storage.setItem(key, JSON.stringify({schema:2,day:cacheServiceDay(),value,expiresAt:Date.now()+PERSIST_TTL_MS}));
  } catch {}
}
function cacheServiceDay(){
  // A route snapshot contains dated service information, not just static roads.
  // Invalidate on either region's service-date rollover (DST-safe).
  return ['Europe/Berlin','Europe/Athens'].map(timeZone=>new Intl.DateTimeFormat('en-CA',
    {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())).join('|');
}
const validStoredStops=(value:unknown)=>Array.isArray(value)&&value.every(stop=>stop&&typeof stop.stop_id==='string'
  &&Number.isFinite(stop.latitude)&&Number.isFinite(stop.longitude)&&Array.isArray(stop.routes)&&Array.isArray(stop.modes));
const validStoredLines=(value:unknown)=>!!value&&typeof value==='object'&&Array.isArray((value as V2NearbyLines).lines)
  &&(value as V2NearbyLines).lines.every(line=>line&&Array.isArray(line.points)
    &&line.points.every(point=>Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)));
const validStoredNearbyStops=(value:unknown)=>!!value&&typeof value==='object'&&validStoredStops((value as V2NearbyStops).stops);
export const getV2Map = (token: string | null | undefined, options: { force?: boolean } = {}): Promise<V2Map> => {
  const key = `${API_BASE}|${cacheServiceDay()}`;
  const cached=mapSnapshots.get(key);
  if(!options.force && cached && cached.expiresAt>Date.now())return Promise.resolve(cached.value);
  const existing = mapRequests.get(key);
  if (existing) return existing;
  const request = apiRequest<V2Map>(`/mobility/v2/map`, "GET", token || undefined)
    .then(value=>{
      const expiresAt=Date.now()+V2_MAP_CACHE_TTL_MS;
      mapSnapshots.set(key,{value,expiresAt});
      if(Array.isArray(value.stops))stopSnapshots.set(key,{value:value.stops,expiresAt});
      return value;
    })
    .finally(() => { if (mapRequests.get(key) === request) mapRequests.delete(key); });
  mapRequests.set(key, request);
  return request;
};

/**
 * Load the physical stop catalogue independently so confirmed-origin screens
 * can show nearby stops before asking the backend to build route geometries.
 * A later map response refreshes this same short-lived in-memory snapshot.
 */
export const getTransitStops = (token: string | null | undefined): Promise<TransitStopMarker[]> => {
  const key=`${API_BASE}|${cacheServiceDay()}`,cached=stopSnapshots.get(key);
  if(cached && cached.expiresAt>Date.now())return Promise.resolve(cached.value);
  const persisted=persistGet<TransitStopMarker[]>(`@perix_v2_stops_v1:${key}`,validStoredStops);
  if(persisted){stopSnapshots.set(key,{value:persisted,expiresAt:Date.now()+V2_MAP_CACHE_TTL_MS});return Promise.resolve(persisted);}
  const existing=stopRequests.get(key);
  if(existing)return existing;
  const request=apiRequest<TransitStopMarker[]>(`/mobility/v2/stops`,"GET",token || undefined)
    .then(value=>{const rows=value || [];stopSnapshots.set(key,{value:rows,expiresAt:Date.now()+V2_MAP_CACHE_TTL_MS});
      persistSet(`@perix_v2_stops_v1:${key}`,rows);return rows;})
    .finally(()=>{if(stopRequests.get(key)===request)stopRequests.delete(key);});
  stopRequests.set(key,request);
  return request;
};

function nearbyRequestKey(origin:{latitude:number;longitude:number},bounds:{minLat:number;maxLat:number;minLng:number;maxLng:number},limit:number,radiusM:number,
  positionPatternIds:readonly string[]=[]){
  const viewport=[bounds.minLat,bounds.maxLat,bounds.minLng,bounds.maxLng].map(value=>value.toFixed(5));
  return JSON.stringify([API_BASE,origin.latitude.toFixed(5),origin.longitude.toFixed(5),viewport,limit,radiusM,[...positionPatternIds].sort(),cacheServiceDay()]);
}
function nearbyRequestBody(origin:{latitude:number;longitude:number},bounds:{minLat:number;maxLat:number;minLng:number;maxLng:number},limit:number,radiusM:number,
  positionPatternIds:readonly string[]=[]){
  const body:{latitude:number;longitude:number;bounds:{min_lat:number;max_lat:number;min_lng:number;max_lng:number};limit:number;radius_m:number;position_pattern_ids?:string[]}={
    latitude:origin.latitude,longitude:origin.longitude,
    bounds:{min_lat:bounds.minLat,max_lat:bounds.maxLat,min_lng:bounds.minLng,max_lng:bounds.maxLng},limit,radius_m:radiusM};
  if(positionPatternIds.length)body.position_pattern_ids=[...new Set(positionPatternIds.map(String).filter(Boolean))].sort();
  return body;
}

// Production releases may still enforce the former 250 m request minimum.
// Negotiate once on that specific validation error, never on network failures.
// The caller's 150 m display scope remains unchanged.
let nearbyServerMinimumRadiusM = 1;
let nearbyServerLegacyLimit=false;
function legacyNearbyLimit(error:unknown){
  const detail=error as {status?:number;message?:string};
  // apiRequest exposes Pydantic's message, not its field location. On these
  // two known schemas only the stop limit has a maximum of 1 or 3.
  return detail.status===422 && /less than or equal to (?:1|3)(?!\d)/.test(detail.message || '');
}
async function nearbyRead<T>(path:string, token:string|null|undefined,
  body:ReturnType<typeof nearbyRequestBody> & Record<string,unknown>, timeoutMs:number):Promise<T> {
  const payload={...body,radius_m:Math.max(body.radius_m,nearbyServerMinimumRadiusM)};
  try {
    return await apiRequest<T>(path,"POST",token || undefined,payload,timeoutMs);
  } catch (error) {
    const detail=error as {status?:number;message?:string};
    if(detail.status!==422 || payload.radius_m>=250 || !/greater than or equal to 250/.test(detail.message || ""))throw error;
    nearbyServerMinimumRadiusM=250;
    return apiRequest<T>(path,"POST",token || undefined,{...body,radius_m:250},timeoutMs);
  }
}

/** Fast first stage: only the visible, nearby physical stop records. */
export const getNearbyStops = (token: string | null | undefined,
  origin: { latitude: number; longitude: number },
  bounds: { minLat:number; maxLat:number; minLng:number; maxLng:number },
  options: { limit?: number; radiusM?: number; force?: boolean } = {}): Promise<V2NearbyStops> => {
  const limit=Math.max(1,Math.min(6,Math.floor(options.limit ?? 1)));
  const radiusM=Math.max(1,Math.min(5000,Math.floor(options.radiusM ?? 150)));
  const key=nearbyRequestKey(origin,bounds,limit,radiusM);
  const cached=nearbyStopsSnapshots.get(key);
  if(!options.force && cached && cached.expiresAt>Date.now())return Promise.resolve(cached.value);
  const persisted=persistGet<V2NearbyStops>(`@perix_v2_nearbystops_v1:${key}`,validStoredNearbyStops);
  if(!options.force&&persisted){nearbyStopsSnapshots.set(key,{value:persisted,expiresAt:Date.now()+V2_MAP_CACHE_TTL_MS});return Promise.resolve(persisted);}
  const existing=nearbyStopsRequests.get(key);
  if(existing)return existing;
  const catalogue=async()=>({stops:await getTransitStops(token),radius_m:radiusM});
  const request=(nearbyServerLegacyLimit && limit>3 ? catalogue() : nearbyRead<V2NearbyStops>(`/mobility/v2/nearby-stops`,token,
    nearbyRequestBody(origin,bounds,limit,radiusM),20000))
    .catch(async error=>{if(!legacyNearbyLimit(error))throw error;
      // Old servers cannot return five places. Reuse the existing catalogue;
      // the caller still ranks real platforms within its exact 150 m scope.
      nearbyServerLegacyLimit=true;return catalogue();})
    .then(value=>{nearbyStopsSnapshots.set(key,{value,expiresAt:Date.now()+V2_MAP_CACHE_TTL_MS});
      persistSet(`@perix_v2_nearbystops_v1:${key}`,value);return value;})
    .finally(()=>{if(nearbyStopsRequests.get(key)===request)nearbyStopsRequests.delete(key);});
  nearbyStopsRequests.set(key,request);
  return request;
};

/** Second stage: route geometries only, for the same compact visible viewport. */
export const getNearbyMap = (token: string | null | undefined,
  origin: { latitude: number; longitude: number },
  bounds: { minLat:number; maxLat:number; minLng:number; maxLng:number },
  options: { limit?: number; radiusM?: number; force?: boolean; positionPatternIds?: string[] } = {}): Promise<V2NearbyLines> => {
  const limit=Math.max(1,Math.min(6,Math.floor(options.limit ?? 1)));
  const radiusM=Math.max(1,Math.min(5000,Math.floor(options.radiusM ?? 150)));
  const positionPatternIds=[...new Set(options.positionPatternIds || [])].sort();
  const key=nearbyRequestKey(origin,bounds,limit,radiusM,positionPatternIds);
  const cached=nearbyMapSnapshots.get(key);
  if(!options.force && cached && cached.expiresAt>Date.now())return Promise.resolve(cached.value);
  const persisted=persistGet<V2NearbyLines>(`@perix_v2_nearbymap_v1:${key}`,validStoredLines);
  if(!options.force && persisted){nearbyMapSnapshots.set(key,{value:persisted,expiresAt:Date.now()+V2_MAP_CACHE_TTL_MS});return Promise.resolve(persisted);}
  const existing=nearbyMapRequests.get(key);
  if(existing)return existing;
  const request=(nearbyServerLegacyLimit && limit>3 || positionPatternIds.length>40
    ? getV2Map(token,{force:options.force}) : nearbyRead<V2NearbyLines>(`/mobility/v2/nearby-map`,token,
    nearbyRequestBody(origin,bounds,limit,radiusM,positionPatternIds),45000))
    .catch(async error=>{if(!legacyNearbyLimit(error))throw error;
      nearbyServerLegacyLimit=true;
      return getV2Map(token,{force:options.force});})
    .then(value=>{nearbyMapSnapshots.set(key,{value,expiresAt:Date.now()+V2_MAP_CACHE_TTL_MS});
      persistSet(`@perix_v2_nearbymap_v1:${key}`,value);return value;})
    .finally(()=>{if(nearbyMapRequests.get(key)===request)nearbyMapRequests.delete(key);});
  nearbyMapRequests.set(key,request);
  return request;
};

/** Nearby-only fleet snapshot for the exact compact viewport/selected stops. */
// Older backends answer the scoped POST with the SPA fallback's 405. Once
// observed, skip the doomed POST on later polls and read the canonical fleet.
let nearbyVehiclesScopedRouteMissing = false;
export const getNearbyVehicles = async (token:string | null | undefined,
  origin:{latitude:number;longitude:number},
  bounds:{minLat:number;maxLat:number;minLng:number;maxLng:number},initialSync=false,vehicleIds:readonly string[]=[],
  options:{limit?:number;lifetime?:boolean}={}):Promise<LiveVehicle[]>=>{
  const scopedVehicleIds=[...new Set(vehicleIds.map(String).filter(Boolean))];
  if(!scopedVehicleIds.length)return [];
  const requestedAt=Date.now();
  const requestedMonotonic=typeof performance!=='undefined'?performance.now():undefined;
  const navigationStarted=typeof performance!=='undefined'
    ? performance.getEntriesByType?.('navigation')?.[0]?.startTime ?? 0 : undefined;
  refreshVisualClock();
  const finish=(raw:V2Vehicle[])=>{
    const receivedAt=Date.now();
    const receivedMonotonic=typeof performance!=='undefined'?performance.now():undefined;
    return adaptV2Vehicles(raw,requestedAt,requestedMonotonic,navigationStarted,receivedAt,receivedMonotonic,true);
  };
  const readCanonical=async()=>{
    const params = [`visual_rule_version=station-cycle-v2`, `visual_preview_seconds=45`];
    if (initialSync) params.push("initial_sync=true");
    const all = await apiRequest<V2Vehicle[]>(`/mobility/v2/vehicles?${params.join("&")}`,"GET",token || undefined,undefined,45000);
    const wanted = new Set(scopedVehicleIds);
    return finish(all.filter(vehicle => wanted.has(String(vehicle.vehicle_id))));
  };
  // The nearby POST excludes routes no longer serving the origin. Lifetime
  // tracking uses the SAME canonical source serializer, with exact ID filtering.
  if (nearbyVehiclesScopedRouteMissing || options.lifetime || scopedVehicleIds.length>40) return readCanonical();
  try {
    const raw=await nearbyRead<V2Vehicle[]>(`/mobility/v2/nearby-vehicles`,token,
      {...nearbyRequestBody(origin,bounds,options.limit ?? 1,150),initial_sync:initialSync,visual_preview_seconds:45,
        vehicle_ids:scopedVehicleIds,
      },45000);
    return finish(raw);
  } catch (error) {
    if ((error as {status?:number})?.status !== 405) throw error;
    nearbyVehiclesScopedRouteMissing = true;
    return readCanonical();
  }
};

/** Fleet churn is not a geometry revision. Refresh only uncovered authorities. */
export function missingVisualGeometryKeys(vehicles: LiveVehicle[], lines: V2MapLine[]) {
  return [...new Set(vehicles.filter(v => v.motion?.model === "TIME_NORMALIZED_VISUAL_ESTIMATE"
    && v.network_version_id && v.service_date && v.pattern_id && v.motion.geometry_fingerprint
    && !lines.some(l => l.network_version_id === v.network_version_id && l.service_date === v.service_date
      && l.pattern_id === v.pattern_id && l.approach_geometry_fingerprint === v.motion?.geometry_fingerprint))
    .map(v => JSON.stringify([v.network_version_id, v.service_date, v.pattern_id, v.motion?.geometry_fingerprint])))];
}

export type ServingBus = {
  countdown_deadline_monotonic_ms?: number | null;
  countdown_event?: string;
  display_countdown_seconds?: number | null;
  countdown_target_at_ms?: number | null;
  client_received_monotonic_ms?: number;
  predicted_arrival?: string | null;
  vehicle_id: string;
  route_number: string;
  route_direction: string;
  status: string;
  delay_minutes: number;
  eta_minutes: number;
  display_eta_seconds?: number;
  eta_seconds?: number;
  eta_sampled_at_ms?: number;
  distance_to_bus_m: number | null;
  distance_to_stop_m: number | null;
  mode?: string;
  trip_id?: string;
  trip_instance_id?: string;
  network_version_id?: string;
  service_date?: string;
  pattern_id?: string | null;
  platform_id?: string;
  platform_code?: string | null;
  position_source?: string;
  position_assurance?: string | null;
  motion_plan_revision?: string | null;
  next_stop_id?: string | null;
  next_stop_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  vehicle_link_basis?: "EXACT_TRIP" | "VERIFIED_BLOCK_PREDECESSOR" | string;
  position_trip_id?: string | null;
  position_trip_instance_id?: string | null;
  position_pattern_id?: string | null;
  position_route_number?: string | null;
  position_mode?: string | null;
  position_motion_plan_revision?: string | null;
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
  platform_id?: string | null,
  page?:{limit:number;offset:number}
): Promise<ServingBus[]> => {
  // Stable V2 unified arrivals engine (LIVE / REALTIME / SCHEDULE).
  refreshVisualClock();
  const pagination=page ? `&limit=${Math.max(1,Math.min(50,Math.floor(page.limit)))}&offset=${Math.max(0,Math.min(100,Math.floor(page.offset)))}` : '';
  const raw = await apiRequest<V2Arrival[]>(
    `/mobility/v2/stops/${encodeURIComponent(stopId)}/arrivals?visual_rule_version=station-cycle-v2${platform_id ? `&platform_id=${encodeURIComponent(platform_id)}` : ''}${pagination}`,
    "GET",
    token || undefined
  );
  const receivedMonotonic = typeof performance !== 'undefined' ? performance.now() : undefined;
  const clock = receivedMonotonic != null ? sampleServerClock(visualServerClock,receivedMonotonic) : null;
  return (raw || []).map((a) => {
    const display_eta_seconds = clock && Number.isFinite(a.effective_arrival_at_ms)
      ? Math.max(0,(a.effective_arrival_at_ms!-clock.serverMs)/1000) : a.eta_seconds ?? 0;
    return {
      vehicle_id: a.vehicle_id,
      trip_id: a.trip_id,
      trip_instance_id: a.trip_instance_id,
      pattern_id: a.pattern_id,
      network_version_id: a.network_version_id,
      service_date: a.service_date,
      platform_id: a.platform_id,
      platform_code: a.platform_code,
      position_source: a.position_source,
      position_assurance: a.position_assurance,
      motion_plan_revision: a.motion_plan_revision,
      next_stop_id: a.next_stop_id,
      next_stop_name: a.next_stop_name,
      latitude: a.position_latitude,
      longitude: a.position_longitude,
      vehicle_link_basis: a.vehicle_link_basis,
      position_trip_id: a.position_trip_id,
      position_trip_instance_id: a.position_trip_instance_id,
      position_pattern_id: a.position_pattern_id,
      position_route_number: a.position_route_number,
      position_mode: a.position_mode,
      position_motion_plan_revision: a.position_motion_plan_revision,
      route_number: a.route_number,
      route_direction: a.direction ?? "",
      status: a.source ?? "SCHEDULE",
      delay_minutes: Math.max(0, Math.round((a.delay_seconds ?? 0) / 60)),
      eta_minutes: Math.max(0, Math.ceil(display_eta_seconds / 60)),
      predicted_arrival: a.predicted ?? null,
      client_received_monotonic_ms: receivedMonotonic,
      display_eta_seconds,
      countdown_event: a.countdown_event ?? 'ARRIVAL',
      countdown_target_at_ms: a.countdown_target_at_ms,
      // Retain a signed deadline: repeated reads of the same passed target
      // must not restart the five-second zero display grace on every packet.
      countdown_deadline_monotonic_ms: clock && receivedMonotonic != null && Number.isFinite(a.countdown_target_at_ms)
        && a.countdown_event !== 'WAITING_FOR_SOURCE_UPDATE'
        ? receivedMonotonic+(a.countdown_target_at_ms!-clock.serverMs) : null,
      display_countdown_seconds: a.countdown_event === 'WAITING_FOR_SOURCE_UPDATE' ? null
        : clock && Number.isFinite(a.countdown_target_at_ms) ? Math.max(0,(a.countdown_target_at_ms!-clock.serverMs)/1000)
        : a.countdown_seconds ?? display_eta_seconds,
      eta_seconds: a.eta_seconds,
      eta_sampled_at_ms: a.eta_sampled_at_ms,
      distance_to_bus_m: null,
      distance_to_stop_m: a.distance_to_stop_m ?? null,
      mode: a.mode,
    };
  });
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

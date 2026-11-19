/** Arcade flight only. Does not read/write application location or transit state.
 * Altitude is in meters above Google's ground surface, not a surveyed MSL height.
 */
export const FLIGHT_RULES = {
  cruiseMps: 18, minSpeedMps: 8, maxSpeedMps: 140, speedClickMps: 10,
  startAltitude: 25, minAltitude: 12, maxAltitude: 1_000_000, overheadAltitude: 600,
  climbMps: 22, jetClimbMps: 45, maxPitch: Math.PI / 12, throttleMpsPerSecond: 24, maxBank: Math.PI / 5, maxTurnRate: 0.5, maxFrameSeconds: 0.05,
  travelBoostMax: 12, cityZoom: 18, overviewMinZoom: 3,
  highAltitudeLiftScaleM: 300, maxVerticalTravelMps: 60_000,
  highTempoAltitude: 4_000, highTempoUnlockSeconds: 60, highMaxSpeedMps: 360,
  countryTravelMps: 150_000,
} as const;
export const FLIGHT_TILT = 67;
export const FLIGHT_MAX_TILT = 67.5;
/** Inverse camera response requested by the flight controls: nose DOWN raises
 * map tilt toward its maximum; nose UP reduces it. Aircraft pitch/altitude
 * signs are unchanged. As altitude rises, smoothly flatten the view toward
 * straight down at 600m, independent of the much higher travel ceiling.
 * Maps may impose a lower device limit. */
export function flightCameraTilt(pitch: number, altitude: number = FLIGHT_RULES.startAltitude) {
  const height = Number.isFinite(altitude) ? altitude : FLIGHT_RULES.startAltitude;
  const t = Math.max(0, Math.min(1, (height - FLIGHT_RULES.startAltitude)
    / (FLIGHT_RULES.overheadAltitude - FLIGHT_RULES.startAltitude)));
  const overheadBlend = t * t * (3 - 2 * t);
  const lowTilt = Math.max(0, Math.min(FLIGHT_MAX_TILT, FLIGHT_TILT - (Number.isFinite(pitch) ? pitch : 0) * 180 / Math.PI));
  return lowTilt * (1 - overheadBlend);
}
/** `climb` is the normalized NOSE-PITCH command (legacy axis name), not an
 * altitude step. Positive pitches up; negative pitches down. */
export type FlightInput = { climb: number; turn: number; throttle?: number };
export type FlightState = { latitude: number; longitude: number; altitude: number;
  heading: number; bank: number; pitch: number; verticalSpeed: number; distanceM: number;
  speedMps: number; targetSpeedMps: number; highTempoSeconds: number };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const input = (n: number) => Number.isFinite(n) ? clamp(n, -1, 1) : 0;
const longitude = (n: number) => n >= -180 && n < 180 ? n : ((n + 180) % 360 + 360) % 360 - 180;

export function createFlightState(origin: { latitude: number; longitude: number }): FlightState {
  if (!Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)
    || Math.abs(origin.latitude) > 85 || Math.abs(origin.longitude) > 180) throw Error('Invalid flight origin');
  return { latitude: origin.latitude, longitude: origin.longitude, altitude: FLIGHT_RULES.startAltitude,
    // Level low flight: neither the nose nor the wings start tilted.
    heading: 0, bank: 0, pitch: 0, verticalSpeed: 0, distanceM: 0,
    speedMps: FLIGHT_RULES.cruiseMps, targetSpeedMps: FLIGHT_RULES.cruiseMps, highTempoSeconds: 0 };
}

/** Above 4km, unlock tempo 10 -> 25 over one minute of active flight.
 * Unlocking is not acceleration: the selected tempo still belongs to W/S
 * or the left stick. Returning below 4km resets to the city limit. */
export function flightSpeedLimit(state: Pick<FlightState, 'altitude' | 'highTempoSeconds'>) {
  const progress = state.altitude >= FLIGHT_RULES.highTempoAltitude
    ? clamp(state.highTempoSeconds / FLIGHT_RULES.highTempoUnlockSeconds, 0, 1) : 0;
  return FLIGHT_RULES.maxSpeedMps + (FLIGHT_RULES.highMaxSpeedMps - FLIGHT_RULES.maxSpeedMps) * progress;
}

export function changeFlightSpeed(state: FlightState, deltaMps: number): FlightState {
  if (!Number.isFinite(deltaMps)) return state;
  return { ...state, targetSpeedMps: clamp(state.targetSpeedMps + deltaMps, FLIGHT_RULES.minSpeedMps, flightSpeedLimit(state)) };
}

/** Arcade world-travel boost, not a claim about real aircraft performance.
 * Calm at the city start; smoothly reaches about 100 km of map travel/minute
 * at the city upper setting, allowing inter-city trips without teleporting.
 * Above tempo 10, progressively reach country-scale travel at tempo 25:
 * 450km in 3 seconds, deliberately arcade motion rather than real airspeed.
 */
export function flightTravelSpeed(speed: number) {
  if (speed > FLIGHT_RULES.maxSpeedMps) {
    const highTempo = clamp((speed - FLIGHT_RULES.maxSpeedMps)
      / (FLIGHT_RULES.highMaxSpeedMps - FLIGHT_RULES.maxSpeedMps), 0, 1);
    const cityTop = FLIGHT_RULES.maxSpeedMps * FLIGHT_RULES.travelBoostMax;
    return cityTop + (FLIGHT_RULES.countryTravelMps - cityTop) * highTempo * highTempo;
  }
  const normal = clamp((speed - FLIGHT_RULES.cruiseMps) / (FLIGHT_RULES.maxSpeedMps - FLIGHT_RULES.cruiseMps), 0, 1);
  return speed * (1 + (FLIGHT_RULES.travelBoostMax - 1) * normal);
}
export function flightTravelLevel(speed: number) {
  return 1 + 9 * (clamp(speed, FLIGHT_RULES.minSpeedMps, FLIGHT_RULES.highMaxSpeedMps) - FLIGHT_RULES.minSpeedMps)
    / (FLIGHT_RULES.maxSpeedMps - FLIGHT_RULES.minSpeedMps);
}

export function stepFlight(state: FlightState, controls: FlightInput, elapsed: number): FlightState {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return state;
  const dt = Math.min(elapsed, FLIGHT_RULES.maxFrameSeconds);
  const blend = 1 - Math.exp(-4 * dt);
  const highTempoSeconds = state.altitude >= FLIGHT_RULES.highTempoAltitude
    ? Math.min(FLIGHT_RULES.highTempoUnlockSeconds, state.highTempoSeconds + dt) : 0;
  const targetSpeedMps = clamp(state.targetSpeedMps + input(controls.throttle ?? 0) * FLIGHT_RULES.throttleMpsPerSecond * dt,
    FLIGHT_RULES.minSpeedMps, flightSpeedLimit({altitude: state.altitude, highTempoSeconds}));
  const speedMps = state.speedMps + (targetSpeedMps - state.speedMps) * (1 - Math.exp(-1.5 * dt));
  const bank = state.bank + (-input(controls.turn) * FLIGHT_RULES.maxBank - state.bank) * blend;
  const pitch = state.pitch + (input(controls.climb) * FLIGHT_RULES.maxPitch - state.pitch) * blend;
  // Arcade jet lift: full nose-up reaches 45m/s even at the calm city tempo,
  // rather than the old ~4.7m/s. Smoothed pitch also eases lift in/out, and
  // partial stick input remains proportional. Low-city descent stays unchanged.
  let verticalSpeed = pitch > 0
    ? clamp(Math.sin(pitch) / Math.sin(FLIGHT_RULES.maxPitch), 0, 1) * FLIGHT_RULES.jetClimbMps
    : clamp(Math.sin(pitch) * speedMps, -FLIGHT_RULES.climbMps, FLIGHT_RULES.climbMps);
  // Country-scale overview must be reachable (and escapable) without hours
  // of holding the stick. Beyond the city overview, continuously boost both
  // vertical directions while leaving horizontal tempo completely alone.
  const highAltitude = Math.max(0, state.altitude - FLIGHT_RULES.overheadAltitude);
  const pitchAxis = clamp(Math.sin(pitch) / Math.sin(FLIGHT_RULES.maxPitch), -1, 1);
  verticalSpeed = clamp(verticalSpeed + pitchAxis * FLIGHT_RULES.jetClimbMps
    * highAltitude / FLIGHT_RULES.highAltitudeLiftScaleM,
    -FLIGHT_RULES.maxVerticalTravelMps, FLIGHT_RULES.maxVerticalTravelMps);
  const altitude = clamp(state.altitude + verticalSpeed * dt, FLIGHT_RULES.minAltitude, FLIGHT_RULES.maxAltitude);
  if ((altitude === FLIGHT_RULES.minAltitude && verticalSpeed < 0)
    || (altitude === FLIGHT_RULES.maxAltitude && verticalSpeed > 0)) verticalSpeed = 0;
  const heading = (state.heading - bank / FLIGHT_RULES.maxBank * FLIGHT_RULES.maxTurnRate * dt + Math.PI * 2) % (Math.PI * 2);
  const distance = flightTravelSpeed(speedMps) * dt;
  const latitude = clamp(state.latitude + Math.cos(heading) * distance / 6378137 * 180 / Math.PI, -85, 85);
  const lng = state.longitude + Math.sin(heading) * distance / (6378137 * Math.cos(state.latitude * Math.PI / 180)) * 180 / Math.PI;
  const activeHighTempoSeconds = altitude >= FLIGHT_RULES.highTempoAltitude ? highTempoSeconds : 0;
  return { latitude, longitude: longitude(lng), altitude, heading, bank, speedMps,
    targetSpeedMps: Math.min(targetSpeedMps, flightSpeedLimit({altitude, highTempoSeconds: activeHighTempoSeconds})),
    highTempoSeconds: activeHighTempoSeconds,
    pitch, verticalSpeed, distanceM: state.distanceM + distance };
}

/** Look ahead on the ground so the elevated plane stays at screen center.
 * Tilt/projection are owned by this map, never copied back into /app.
 * Close city framing exposes Google's 3D buildings where the map style/data
 * provides them. Tempo never changes zoom or implies a climb.
 */
export function flightCamera(state: FlightState, openingZoom: number, acceptedTilt?: number) {
  const tilt = flightCameraTilt(state.pitch, state.altitude);
  const groundTilt = Number.isFinite(acceptedTilt) ? clamp(acceptedTilt!, 0, 85) : tilt;
  const ahead = state.altitude * Math.tan(groundTilt * Math.PI / 180);
  const cityZoom = clamp(openingZoom, FLIGHT_RULES.cityZoom, 19);
  return {
    center: {
      lat: clamp(state.latitude + Math.cos(state.heading) * ahead / 6378137 * 180 / Math.PI, -85, 85),
      lng: longitude(state.longitude + Math.sin(state.heading) * ahead
        / (6378137 * Math.cos(state.latitude * Math.PI / 180)) * 180 / Math.PI),
    },
    heading: state.heading * 180 / Math.PI,
    tilt,
    zoom: clamp(cityZoom - Math.log2(Math.max(1, state.altitude / 120)), FLIGHT_RULES.overviewMinZoom, 19),
  };
}

export type GoogleTravelMode = "walking" | "transit" | "driving";
export type DirectionsPoint = { latitude: number; longitude: number };
export type DirectionsOrigin = DirectionsPoint & { kind?: "live" | "manual"; name?: string };
export type DirectionsDestination = DirectionsPoint & { title: string; sub?: string | null };

export function validDirectionsPoint(point: DirectionsPoint | null | undefined): point is DirectionsPoint {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}

const modes: GoogleTravelMode[] = ["walking", "transit", "driving"];
const coordinates = (point: DirectionsPoint) => `${point.latitude},${point.longitude}`;

/** Google calculates this preview independently of the PERIX transit plan. */
export function googleDirectionsEmbedUrl(key: string, origin: DirectionsPoint | null, destination: DirectionsPoint,
  mode: GoogleTravelMode, language: string): string | null {
  if (!key.trim() || !validDirectionsPoint(origin) || !validDirectionsPoint(destination) || !modes.includes(mode)) return null;
  const params = new URLSearchParams({ key: key.trim(), origin: coordinates(origin), destination: coordinates(destination),
    mode, units: "metric", language: /^[a-z]{2}(-[A-Za-z]{2})?$/.test(language) ? language : "en" });
  return `https://www.google.com/maps/embed/v1/directions?${params}`;
}

/** No origin means Google may use device location or ask for a starting point. */
export function googleDirectionsOpenUrl(origin: DirectionsPoint | null, destination: DirectionsPoint,
  mode: GoogleTravelMode): string | null {
  if (!validDirectionsPoint(destination) || !modes.includes(mode)) return null;
  const params = new URLSearchParams({ api: "1", destination: coordinates(destination), travelmode: mode });
  if (validDirectionsPoint(origin)) params.set("origin", coordinates(origin));
  // A manual origin is a route preview, not necessarily the device's location.
  return `https://www.google.com/maps/dir/?${params}`;
}

import Constants from "expo-constants";
import { API_BASE } from "./api/core";
import i18n from "../i18n";

const googleKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GEO_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GEO_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

/**
 * Reverse geocode a coordinate into a friendly, localized address label,
 * e.g. "Next to Egnatia Street" in the app language. Google reverse
 * geocoding is tried first (it localizes street names properly); the
 * Nominatim-backed backend endpoint is the fallback. Returns null when
 * no label can be resolved.
 */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number,
  sessionToken?: string | null
): Promise<string | null> {
  const lang = i18n.language || "en";

  // 1. Google reverse geocoding — properly translated street names.
  if (googleKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
          lat
        )},${encodeURIComponent(lng)}&language=${encodeURIComponent(lang)}&key=${encodeURIComponent(
          googleKey
        )}`
      );
      if (res.ok) {
        const data = await res.json();
        const results = data?.results;
        if (Array.isArray(results) && results.length > 0) {
          const comps = results[0].address_components || [];
          const route = comps.find((c: any) => Array.isArray(c.types) && c.types.includes("route"));
          if (route?.long_name) {
            const prefix = i18n.t("map.nextTo", "Next to");
            return `${prefix} ${route.long_name}`;
          }
          const formatted = results[0].formatted_address;
          if (typeof formatted === "string" && formatted) {
            return formatted;
          }
        }
      }
    } catch {}
  }

  // 2. Backend Nominatim fallback.
  try {
    const url = `${API_BASE}/places/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&lang=${encodeURIComponent(lang)}`;
    const headers: Record<string, string> = sessionToken
      ? { Authorization: `Bearer ${sessionToken}` }
      : {};
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const label = data?.label;
    if (!label || typeof label !== "string") return null;
    const prefix = i18n.t("map.nextTo", "Next to");
    return `${prefix} ${label}`;
  } catch {
    return null;
  }
}

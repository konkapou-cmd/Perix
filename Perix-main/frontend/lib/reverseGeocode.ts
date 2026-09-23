import { API_BASE } from "./api/core";
import i18n from "../i18n";

/**
 * Reverse geocode a coordinate into a friendly "nearby" label, e.g.
 * "Next to Egnatia Street". Returns null when no label can be resolved
 * (the caller should fall back to raw coordinates).
 */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number,
  sessionToken?: string | null
): Promise<string | null> {
  try {
    const url = `${API_BASE}/places/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&lang=${encodeURIComponent(i18n.language || "en")}`;
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

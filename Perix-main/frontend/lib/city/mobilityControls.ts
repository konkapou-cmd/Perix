import type { TransitStopMarker } from "../api/mobility";

export type MobilityMode = "all" | "bus" | "tram" | "taxi";

// Physical modes survive a dated timetable change; no parallel stop catalogue.
export function stopMatchesMode(stop: TransitStopMarker, mode: MobilityMode): boolean {
  return mode === "all" || (mode !== "taxi" && (stop.modes || []).includes(mode));
}

export function findGatewayStops(stops: TransitStopMarker[], mode: MobilityMode, query: string,
  center: { latitude: number; longitude: number }, limit = 8): TransitStopMarker[] {
  const text = query.trim().toLocaleLowerCase();
  const distance = (s: TransitStopMarker) => Math.hypot((s.latitude! - center.latitude),
    (s.longitude! - center.longitude) * Math.cos(center.latitude * Math.PI / 180));
  return stops.filter(s => stopMatchesMode(s, mode) && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    && (!text || s.name.toLocaleLowerCase().includes(text)))
    .sort((a, b) => distance(a) - distance(b) || a.stop_id.localeCompare(b.stop_id)).slice(0, limit);
}

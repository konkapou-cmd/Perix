import type { LiveVehicle } from "../api/mobility";

export const transitMarkerId = (vehicleId: string) => `transit:${vehicleId}`;

export function mobilityVehicleRoute(vehicle: LiveVehicle) {
  return { pathname: "/locator" as const, params: {
    tab: "mobility", vehicle_id: vehicle.vehicle_id,
    journey_id: vehicle.trip_instance_id || "", mode: vehicle.mode,
    vehicle_lat: String(vehicle.latitude), vehicle_lng: String(vehicle.longitude),
  } };
}

export function readMobilityVehicleLink(params: Record<string, unknown>) {
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const id = text(params.vehicle_id);
  if (params.tab !== "mobility" || !id || !["bus", "tram"].includes(text(params.mode))) return null;
  const lat = Number(params.vehicle_lat), lng = Number(params.vehicle_lng);
  const coordinates = text(params.vehicle_lat).trim() !== "" && text(params.vehicle_lng).trim() !== ""
    && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng } : null;
  return { id, journeyId: text(params.journey_id), mode: params.mode as "bus" | "tram", coordinates };
}

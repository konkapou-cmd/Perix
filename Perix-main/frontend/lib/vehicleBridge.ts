import type { GoogleVehicleMarker } from "../components/GoogleMobilityMap";

export type VehiclePathState = Map<string, { journey: string | null; path: GoogleVehicleMarker["path"]; fingerprint?: string }>;
const geometryKey = (path: GoogleVehicleMarker["path"]) => path ? JSON.stringify(path.map(p => [p.latitude, p.longitude])) : "";

/** Canonical paths are immutable static snapshot references, not per-poll JSON. */
export function vehicleBridgeUpdates(vehicles: GoogleVehicleMarker[], previous: VehiclePathState) {
  const paths: VehiclePathState = new Map();
  const updates = vehicles.map(v => {
    const journey = v.journeyId ?? null;
    const old = previous.get(v.id);
    let samePath = !!old && old.path === v.path;
    const fingerprint = samePath ? old?.fingerprint : geometryKey(v.path);
    if (old && !samePath) samePath = (old.fingerprint ?? geometryKey(old.path)) === fingerprint;
    paths.set(v.id, { journey, path: v.path, fingerprint });
    return { id: v.id, journeyId: journey, latitude: v.latitude, longitude: v.longitude,
      type: v.type || "bus", label: v.label, direction: v.direction, estimated: !!v.estimated, heading: v.heading,
      ...(!old || old.journey !== journey || !samePath ? { path: v.path ?? null } : {}),
      progressM: v.progressM, positionState: v.positionState, speed: v.speed, motionState: v.motionState };
  });
  return { updates, paths };
}

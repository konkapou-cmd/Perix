import type { LiveVehicle, JourneyPlan, V2MapLine } from "./api/mobility";

export type VehicleApproach = {
  vehicleId: string;
  journeyId: string;
  platformId: string;
  boardProgressM: number;
  pathKey: string;
};

/** No route-number/name fallback: ambiguous or inactive journeys show no line. */
export function boardingApproaches(plan: JourneyPlan | undefined, vehicles: LiveVehicle[], lines: V2MapLine[]): VehicleApproach[] {
  if (!plan) return [];
  for (const leg of plan.legs) {
    if (leg.type !== "ride" || !leg.trip_instance_id || !leg.pattern_id || !leg.board_stop_id
        || !Number.isFinite(leg.board_progress_m) || !Number.isInteger(leg.board_timeline_index)) continue;
    const matches = vehicles.filter(v => v.trip_instance_id === leg.trip_instance_id
      && v.pattern_id === leg.pattern_id && v.mode === leg.mode);
    if (matches.length !== 1) continue;
    const vehicle = matches[0];
    // Only canonical matched positions and an exact future occurrence qualify.
    if (!Number.isFinite(vehicle.progress_m) || vehicle.latitude == null || vehicle.longitude == null
        || !["ON_PATTERN", "LIVE_MATCHED"].includes(vehicle.position_state || "")
        || !Number.isInteger(vehicle.next_timeline_index)
        || vehicle.next_timeline_index! > leg.board_timeline_index!
        || vehicle.progress_m! >= leg.board_progress_m!) continue;
    const paths = lines.filter(l => l.pattern_id === leg.pattern_id && l.valid !== false
      && !!leg.board_geometry_fingerprint && l.approach_geometry_fingerprint === leg.board_geometry_fingerprint);
    if (paths.length !== 1 || paths[0].points.length < 2) continue;
    return [{ vehicleId: vehicle.vehicle_id, journeyId: leg.trip_instance_id,
      platformId: leg.board_stop_id, boardProgressM: leg.board_progress_m!,
      pathKey: JSON.stringify(paths[0].points.map(p => [p.latitude, p.longitude])) }];
  }
  return [];
}

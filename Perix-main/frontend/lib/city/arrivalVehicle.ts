import type { LiveVehicle, ServingBus, V2MapLine } from "../api/mobility";
import { visualGeometryReady } from "./visualGeometry";

/**
 * Link a timetable row only to its exact dated vehicle, either on that trip
 * or on an explicitly verified adjacent block predecessor. Route text, stop
 * names, and a nearby pin are not vehicle identity.
 */
export function vehicleForDeparture(row: ServingBus, vehicles: readonly LiveVehicle[], lines: readonly V2MapLine[]) {
  const predecessor=row.vehicle_link_basis === "VERIFIED_BLOCK_PREDECESSOR";
  const expectedTripId=predecessor ? row.position_trip_id : row.trip_id;
  const expectedInstanceId=predecessor ? row.position_trip_instance_id : row.trip_instance_id;
  const expectedPatternId=predecessor ? row.position_pattern_id : row.pattern_id;
  const expectedRoute=predecessor ? row.position_route_number : row.route_number;
  const expectedMode=predecessor ? row.position_mode : row.mode;
  if (!row.trip_id || !row.trip_instance_id || !row.vehicle_id || !row.network_version_id
      || !row.service_date || !row.platform_id || !row.pattern_id || !row.mode
      || !expectedTripId || !expectedInstanceId || !expectedRoute || !expectedMode
      || (!predecessor && row.vehicle_link_basis && row.vehicle_link_basis !== "EXACT_TRIP")) return null;
  const matches=vehicles.filter(vehicle => vehicle.vehicle_id === row.vehicle_id
    && vehicle.trip_id === expectedTripId
    && vehicle.trip_instance_id === expectedInstanceId
    && vehicle.network_version_id === row.network_version_id
    && vehicle.service_date === row.service_date
    && (!expectedPatternId || vehicle.pattern_id === expectedPatternId)
    && vehicle.route_number === expectedRoute
    && vehicle.mode === expectedMode
    && vehicle.latitude != null && Number.isFinite(vehicle.latitude)
    && vehicle.longitude != null && Number.isFinite(vehicle.longitude));
  if(matches.length!==1)return null;
  const vehicle=matches[0];
  if(vehicle.motion?.model === "TIME_NORMALIZED_VISUAL_ESTIMATE"
      && (vehicle.motion.publication_status!=="READY" || !visualGeometryReady(vehicle,lines)))return null;
  return vehicle;
}

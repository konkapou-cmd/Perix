import type { ServingBus } from "../api/mobility";

/** Stable, dated identity for the departures whose vehicles are currently loading. */
export function departureBatchKey(rows:readonly ServingBus[]):string{
  const identity=rows.map(row=>[
    row.network_version_id || "",row.service_date || "",row.trip_instance_id || row.trip_id || "",
    row.platform_id || "",row.vehicle_id || "",row.vehicle_link_basis || "",
    row.position_trip_instance_id || "",row.position_pattern_id || "",
  ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(identity);
}

export function departureVehicleIds(rows:readonly ServingBus[]):string[]{
  return [...new Set(rows.map(row=>String(row.vehicle_id || "")).filter(Boolean))].sort();
}

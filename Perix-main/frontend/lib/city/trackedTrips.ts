import type { LiveVehicle, ServingBus, V2MapLine } from '../api/mobility';
import { vehicleForDeparture } from './arrivalVehicle';
import { visualGeometryReady } from './visualGeometry';
import { authorizePreview, sampleAuthorizedPreview } from './transitPublication';
import { visualPathCumulative } from './transitPath';

export function trackedTripKey(row:ServingBus) {
  return JSON.stringify([row.network_version_id,row.service_date,row.trip_instance_id,row.vehicle_id,row.pattern_id,row.mode]);
}

/** Two waves across real boarding groups; a shared same-side icon is one group. */
export function nearbyArrivalWaves(rows:readonly ServingBus[],groups:readonly {platform_ids:string[]}[]) {
  const first:ServingBus[]=[],second:ServingBus[]=[];
  for(const group of groups){
    const unique=new Map<string,ServingBus>();
    for(const row of [...rows].sort((a,b)=>(a.eta_seconds ?? Infinity)-(b.eta_seconds ?? Infinity))){
      if(!group.platform_ids.includes(String(row.platform_id || '')) || !row.trip_instance_id || !row.vehicle_id)continue;
      const key=trackedTripKey(row);if(!unique.has(key))unique.set(key,row);
    }
    const arrivals=[...unique.values()];
    if(arrivals[0])first.push(arrivals[0]);if(arrivals[1])second.push(arrivals[1]);
  }
  const distinct=(wave:ServingBus[])=>[...new Map(wave.map(row=>[trackedTripKey(row),row])).values()];
  return {first:distinct(first),second:distinct(second)};
}

export type TrackedTrips = { rows:Record<string,ServingBus>; completed:Record<string,true> };
export const emptyTrackedTrips=():TrackedTrips=>({rows:{},completed:{}});

/** Only source-owned final occurrence/arrival evidence may terminate a trip.
 * Missing packets, stale previews, a vanished card, and the end of a polling
 * window are NOT end-of-trip evidence. Repeated stop IDs use occurrence index. */
export function tripAtTerminus(vehicle:LiveVehicle,lines:readonly V2MapLine[]) {
  const preview=vehicle.motion?.preview,progress=preview?.stop_progress_by_occurrence_m;
  const terminal=vehicle.motion?.publication_status==='READY' && visualGeometryReady(vehicle,lines)
    && !!preview && !!progress && progress.length>=2
    && preview.journey_id===vehicle.trip_instance_id && preview.pattern_id===vehicle.pattern_id
    && preview.revision===vehicle.motion_plan_revision && preview.schema===2
    && preview.stop_occurrence_index===vehicle.next_timeline_index
    && vehicle.next_timeline_index===progress.length-1
    && vehicle.next_stop_eta_seconds===0 && vehicle.distance_to_next_stop_m!=null
    && vehicle.distance_to_next_stop_m<=0.25 && vehicle.progress_m!=null
    && Math.abs(vehicle.progress_m-progress[progress.length-1])<=0.25
    && preview.sampled_at_ms>=preview.effective_arrival_at_ms;
  if(!terminal || !preview)return false;
  const line=lines.find(line=>line.valid===true && line.pattern_id===vehicle.pattern_id && line.mode===vehicle.mode
    && line.network_version_id===vehicle.network_version_id && line.service_date===vehicle.service_date
    && line.approach_geometry_fingerprint===vehicle.motion?.geometry_fingerprint);
  if(!line)return false;
  const cumulative=visualPathCumulative(line.points),mono=performance.now();
  const active=authorizePreview(preview,{estimated:!!vehicle.estimated,mode:vehicle.mode,journeyId:vehicle.trip_instance_id,
    patternId:vehicle.pattern_id,planRevision:vehicle.motion_plan_revision,progressM:vehicle.progress_m,
    pathLengthM:cumulative[cumulative.length-1],geometryFingerprint:line.approach_geometry_fingerprint,
    nextTimelineIndex:vehicle.next_timeline_index,distanceToNextStopM:vehicle.distance_to_next_stop_m,
    nextStopEtaSeconds:vehicle.next_stop_eta_seconds},Date.now(),mono);
  const sample=active && sampleAuthorizedPreview(active,mono);
  return !!sample && !sample.expired;
}

/** Enrollment is independent of board visibility; existing dated bindings live
 * until a verified terminus. Never switch a tracked trip to another bus sharing
 * a route number, physical vehicle ID, or stop name. */
export function advanceTrackedTrips(previous:TrackedTrips,departures:readonly ServingBus[],
  vehicles:readonly LiveVehicle[],lines:readonly V2MapLine[]):TrackedTrips {
  const rows={...previous.rows},completed={...previous.completed};
  for(const row of departures){
    const key=trackedTripKey(row);
    if(!completed[key] && vehicleForDeparture(row,vehicles,lines))rows[key]=row;
  }
  for(const [key,row] of Object.entries(rows)){
    // A verified predecessor is not the requested trip's terminus.
    const exact={...row,vehicle_link_basis:'EXACT_TRIP'};
    const vehicle=vehicleForDeparture(exact,vehicles,lines);
    if(vehicle && tripAtTerminus(vehicle,lines)){delete rows[key];completed[key]=true;}
  }
  return {rows,completed};
}

export function trackedVehicles(state:TrackedTrips,vehicles:readonly LiveVehicle[],lines:readonly V2MapLine[]) {
  return [...new Map(Object.values(state.rows).map(row=>
    vehicleForDeparture({...row,vehicle_link_basis:'EXACT_TRIP'},vehicles,lines)
      || vehicleForDeparture(row,vehicles,lines)).filter((v):v is LiveVehicle=>!!v)
    .map(v=>[v.vehicle_id,v])).values()];
}

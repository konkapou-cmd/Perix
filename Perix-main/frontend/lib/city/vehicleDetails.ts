import type { LiveVehicle, TransitStopMarker, V2MapLine } from "../api/mobility";
import { authorizePreview, sampleAuthorizedPreview, ActivePreview } from "./transitPublication";
import { visualPathCumulative } from "./transitPath";

function stopName(id:string | null | undefined,vehicle:LiveVehicle,stops:TransitStopMarker[],lines:V2MapLine[]) {
  if(!id)return undefined;
  if(id===vehicle.next_stop_id && vehicle.next_stop_name)return vehicle.next_stop_name;
  const stop=stops.find(s=>s.stop_id===id || s.stop_ids?.includes(id) || s.platforms?.some(p=>p.platform_id===id) || s.members?.some(p=>p.stop_id===id));
  return stop?.name || lines.flatMap(line=>line.stops || []).find(s=>s.stop_id===id)?.name;
}

/** Read only the same scoped, bounded publication used by the map. Do not use
 * a source HH:mm string as an optical departure or invent a new stop timeline. */
export function vehicleStopDetails(vehicle:LiveVehicle,lines:V2MapLine[],stops:TransitStopMarker[],monotonicMs:number,wallMs=Date.now(),accepted?:ActivePreview) {
  const fallback={nextStopName:vehicle.next_stop_name || stopName(vehicle.next_stop_id,vehicle,stops,lines),nextStopId:vehicle.next_stop_id || undefined,
    currentStopName:undefined as string | undefined,serviceStopName:undefined as string | undefined,
    parkingAtMs:undefined as number | undefined,departureAtMs:undefined as number | undefined,
    parkingSeconds:null as number | null,departureSeconds:null as number | null,
    parked:false,terminal:false,waiting:false,timingAvailable:false,cycleLimited:false,acceptedPreview:undefined as ActivePreview | undefined};
  const preview=vehicle.motion?.preview;
  if(vehicle.motion?.publication_status!=='READY' || !preview || preview.visual_rule_version!=='station-cycle-v2' || preview.visual_parameters?.station_stop_lead_s!==30)return fallback;
  const fingerprint=vehicle.motion?.geometry_fingerprint || preview.approach_geometry_fingerprint;
  const line=lines.find(l=>l.valid===true && l.mode===vehicle.mode && l.pattern_id===vehicle.pattern_id
    && l.network_version_id===vehicle.network_version_id && l.service_date===vehicle.service_date
    && l.approach_geometry_fingerprint===fingerprint && l.points?.length>=2);
  if(!line)return fallback;
  const cumulative=visualPathCumulative(line.points);
  const reusable=accepted?.preview===preview && !!vehicle.estimated && ['bus','tram'].includes(vehicle.mode)
    && preview.journey_id===vehicle.trip_instance_id && preview.pattern_id===vehicle.pattern_id && preview.revision===vehicle.motion_plan_revision
    && preview.stop_occurrence_index===vehicle.next_timeline_index;
  const active=reusable ? accepted : authorizePreview(preview,{estimated:!!vehicle.estimated,mode:vehicle.mode,journeyId:vehicle.trip_instance_id,
    patternId:vehicle.pattern_id,planRevision:vehicle.motion_plan_revision,progressM:vehicle.progress_m,
    pathLengthM:cumulative[cumulative.length-1],geometryFingerprint:fingerprint,nextTimelineIndex:vehicle.next_timeline_index,
    distanceToNextStopM:vehicle.distance_to_next_stop_m,nextStopEtaSeconds:vehicle.next_stop_eta_seconds},wallMs,monotonicMs);
  const sample=active && sampleAuthorizedPreview(active,monotonicMs);
  if(!active || !sample || sample.expired || !sample.stationStopId)return fallback;
  const parked=sample.state==='VISUAL_STOP_ESTIMATE';
  const next=(preview.station_window || []).find(c=>c.stop_occurrence_index===sample.stopOccurrenceIndex+1)
    || preview.phases.find(p=>p.stop_occurrence_index===sample.stopOccurrenceIndex+1)?.station_cycle;
  const serviceStopName=stopName(sample.stationStopId,vehicle,stops,[line]) || sample.stationStopId;
  const nextStopId=parked ? next?.stop_id : sample.stationStopId;
  const serverMs=active.serverMs+monotonicMs-active.monotonicMs;
  const cycle=(preview.station_window || []).find(c=>c.stop_occurrence_index===sample.stopOccurrenceIndex)
    || preview.phases.find(p=>p.stop_occurrence_index===sample.stopOccurrenceIndex)?.station_cycle;
  return {...fallback,acceptedPreview:active,parked,serviceStopName,currentStopName:parked?serviceStopName:undefined,nextStopId,
    nextStopName:stopName(nextStopId,vehicle,stops,[line]) || nextStopId,
    parkingAtMs:sample.stationArrivalAtMs,departureAtMs:sample.stationDepartureAtMs ?? undefined,
    parkingSeconds:sample.stationArrivalAtMs==null?null:Math.max(0,(sample.stationArrivalAtMs-serverMs)/1000),
    departureSeconds:sample.countdownSeconds,waiting:sample.countdownEvent==='WAITING_FOR_SOURCE_UPDATE',
    terminal:parked && sample.stopOccurrenceIndex===(preview.stop_progress_by_occurrence_m?.length || 0)-1,
    timingAvailable:true,cycleLimited:!!cycle?.cycle_limited};
}

export function formatTransitEventTime(atMs:number | null | undefined,language='en') {
  if(atMs==null || !Number.isFinite(atMs))return '—';
  // The existing transit network uses Europe/Berlin; choosing a map base never
  // changes its service timezone. Source epoch is preserved exactly.
  try{return new Intl.DateTimeFormat(language,{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(atMs));}
  catch{return '—';}
}

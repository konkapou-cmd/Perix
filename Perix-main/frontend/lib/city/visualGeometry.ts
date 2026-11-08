import type { LiveVehicle, V2MapLine } from "../api/mobility";

type StopShape = {
  stop_id: string; physical_stop_id?: string; platform_id?: string;
  platform_code?: string | null; stop_ids?: string[];
  name: string; latitude: number; longitude: number; modes: ('bus' | 'tram')[];
  routes: { route_number: string; mode: 'bus' | 'tram'; directions?: string[] }[];
  platforms?: { platform_id: string; latitude?: number | null; longitude?: number | null;
    name?: string; modes?: ('bus' | 'tram')[]; routes?: string[]; directions?: string[]; platform_code?: string | null }[];
};

/** Actual boarding locations, not a nearest-point cluster or timetable guess. */
export function transitStopPins<T extends StopShape>(stops: readonly T[]) {
  return stops.flatMap(stop => {
    const physical_stop_id = stop.physical_stop_id || stop.stop_id;
    if (stop.platform_id) return [{ ...stop, physical_stop_id }];
    const platforms = (stop.platforms || []).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    if (!platforms.length) return [{ ...stop, physical_stop_id }];
    return platforms.map(p => {
      const routes = stop.routes.filter(r => (p.routes || []).includes(r.route_number)
        && (!p.modes?.length || p.modes.includes(r.mode)));
      const inferred = Array.from(new Set(routes.map(r => r.mode)));
      const modes = p.modes?.length ? p.modes : inferred.length ? inferred : stop.modes;
      return { ...stop, physical_stop_id, platform_id: p.platform_id, platform_code: p.platform_code,
        latitude: p.latitude!, longitude: p.longitude!, modes, routes,
        platforms: undefined, directions: p.directions || [], name: stop.name };
    });
  });
}

export type TransitStopIconGroup<T extends StopShape = StopShape> = T & {
  stop_ids: string[];
  platform_ids: string[];
  platform_codes: string[];
  platforms: NonNullable<StopShape["platforms"]>;
};

function distanceMeters(a:StopShape,b:StopShape){
  const rad=Math.PI/180,lat1=a.latitude*rad,lat2=b.latitude*rad;
  const dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
}

/**
 * Rendering-only aggregation: platforms with one station name share a single
 * stop icon, while the original platform rows and identifiers remain intact
 * for exact arrivals selection. Same-name platform objects from distinct
 * physical IDs combine only when they are within 200 m.
 */
export function groupTransitStopIcons<T extends StopShape>(stops:readonly T[]):TransitStopIconGroup<T>[] {
  type Group=TransitStopIconGroup<T> & {__nameKey:string;__pointCount:number};
  const groups:Group[]=[];
  const nameKey=(name:string)=>name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase();
  for(const stop of stops){
    const key=nameKey(stop.name),physical=String(stop.physical_stop_id || stop.stop_id);
    const index=groups.findIndex(group=>group.__nameKey===key && (
      String(group.physical_stop_id || group.stop_id)===physical || distanceMeters(group,stop)<=200));
    const candidatePlatforms=stop.platform_id
      ? [{platform_id:String(stop.platform_id),platform_code:stop.platform_code || null,latitude:stop.latitude,longitude:stop.longitude,
          modes:[...stop.modes],routes:stop.routes.map(route=>route.route_number)}]
      : (stop.platforms || []);
    if(index<0){
      const platformIds=Array.from(new Set(candidatePlatforms.map(platform=>String(platform.platform_id)).filter(Boolean)));
      const platformCodes=Array.from(new Set([...candidatePlatforms.map(platform=>String(platform.platform_code || "").trim()),
        String(stop.platform_code || "").trim()].filter(Boolean)));
      const stopIds=Array.from(new Set([...(stop.stop_ids || []),stop.stop_id].filter(Boolean).map(String)));
      groups.push({...stop,stop_ids:stopIds,platform_ids:platformIds,platform_codes:platformCodes,
        platforms:[...candidatePlatforms],__nameKey:key,__pointCount:1});
      continue;
    }
    const group=groups[index],platformMap=new Map(group.platforms.map(platform=>[String(platform.platform_id),platform]));
    candidatePlatforms.forEach(platform=>platformMap.set(String(platform.platform_id),platform));
    group.platforms=Array.from(platformMap.values());
    group.stop_ids=Array.from(new Set([...group.stop_ids,...(stop.stop_ids || []),stop.stop_id].filter(Boolean).map(String)));
    group.platform_ids=Array.from(new Set([...group.platform_ids,...candidatePlatforms.map(platform=>String(platform.platform_id)).filter(Boolean)]));
    group.platform_codes=Array.from(new Set([...group.platform_codes,...candidatePlatforms.map(platform=>String(platform.platform_code || "").trim()),
      String(stop.platform_code || "").trim()].filter(Boolean)));
    const routeMap=new Map([...group.routes,...stop.routes].map(route=>[`${route.mode}:${route.route_number}`,route]));
    group.routes=Array.from(routeMap.values());
    group.modes=Array.from(new Set([...group.modes,...stop.modes])) as ('bus'|'tram')[];
    group.latitude=(group.latitude*group.__pointCount+stop.latitude)/(group.__pointCount+1);
    group.longitude=(group.longitude*group.__pointCount+stop.longitude)/(group.__pointCount+1);
    group.__pointCount+=1;
  }
  return groups.map(({__nameKey:_name,__pointCount:_count,...group})=>({
    ...group,
    platform_id:group.platform_ids.length===1?group.platform_ids[0]:undefined,
    platform_code:group.platform_codes.length===1?group.platform_codes[0]:null,
  } as TransitStopIconGroup<T>));
}

/** Drawing only: retain all dated metadata in the original array for authority. */
export function distinctGeometryLines(lines: readonly V2MapLine[]) {
  const seen = new Set<string>();
  return lines.filter(line => {
    const key = JSON.stringify([line.mode, line.route_number,
      line.approach_geometry_fingerprint || line.points]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A recovered visual marker waits for the map's exact dated geometry.
 * GPS/taxis and legacy publications keep their existing behavior.
 */
export function visualGeometryReady(vehicle: Pick<LiveVehicle,
  "estimated" | "mode" | "motion" | "pattern_id" | "network_version_id" | "service_date">,
  lines: readonly V2MapLine[]): boolean {
  if (vehicle.motion?.model !== "TIME_NORMALIZED_VISUAL_ESTIMATE") return true;
  const fingerprint = vehicle.motion.geometry_fingerprint || vehicle.motion.preview?.approach_geometry_fingerprint;
  if (!vehicle.estimated || !["bus", "tram"].includes(vehicle.mode) || !fingerprint
      || !vehicle.pattern_id || !vehicle.network_version_id || !vehicle.service_date) return false;
  return lines.some(line => line && line.valid === true && Array.isArray(line.points) && line.points.length >= 2 && line.mode === vehicle.mode
    && line.pattern_id === vehicle.pattern_id && line.network_version_id === vehicle.network_version_id
    && line.service_date === vehicle.service_date && line.approach_geometry_fingerprint === fingerprint);
}

import type { TransitStopMarker } from "../api/mobility";
import { transitStopPins } from "./visualGeometry";
import type { CityBounds } from "./publicServices";

export type OriginPoint = { latitude: number; longitude: number; name?: string };
export const NEARBY_STOP_RADIUS_M = 3000;
export const APP_NEARBY_STOP_RADIUS_M = 150;
// A zoomed local viewport may be taller than it is wide on a phone. It remains
// bounded to a city-local window while leaving room to catch stops around origin.
export const NEARBY_MAP_MAX_VIEWPORT_M = 14000;
export function isCompactNearbyViewport(bounds: CityBounds | null | undefined) {
  if(!bounds || ![bounds.minLat,bounds.maxLat,bounds.minLng,bounds.maxLng].every(Number.isFinite)
    || bounds.maxLat<=bounds.minLat || bounds.maxLng<=bounds.minLng)return false;
  const latMeters=(bounds.maxLat-bounds.minLat)*111132;
  const center=(bounds.maxLat+bounds.minLat)*Math.PI/360;
  const lngMeters=(bounds.maxLng-bounds.minLng)*111320*Math.max(0,Math.cos(center));
  return Math.max(latMeters,lngMeters)<=NEARBY_MAP_MAX_VIEWPORT_M;
}
/** A stable data scope around the selected origin, independent of map zoom/pan. */
export function nearbyScopeBounds(origin:OriginPoint,marginM=APP_NEARBY_STOP_RADIUS_M+10):CityBounds{
  const latDelta=marginM/111132;
  const lngDelta=marginM/(111320*Math.max(0.01,Math.cos(origin.latitude*Math.PI/180)));
  return {minLat:Math.max(-90,origin.latitude-latDelta),maxLat:Math.min(90,origin.latitude+latDelta),
    minLng:Math.max(-180,origin.longitude-lngDelta),maxLng:Math.min(180,origin.longitude+lngDelta)};
}
export function validOrigin(point: OriginPoint | null | undefined): point is OriginPoint {
  return !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude)<=90 && Math.abs(point.longitude)<=180;
}
function meters(a: OriginPoint,b: OriginPoint) {
  const r=Math.PI/180,h=Math.sin((b.latitude-a.latitude)*r/2)**2
    +Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin((b.longitude-a.longitude)*r/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
/** Rank physical places by their real boarding platforms, not map bounds or
 * a parent's possibly remote centroid. Preserve source IDs for arrivals reads. */
export function nearestTransitStops(stops: TransitStopMarker[],origin: OriginPoint | null,limit=5,radiusM=NEARBY_STOP_RADIUS_M) {
  if (!validOrigin(origin)) return [];
  return stops.map(stop => {
    const candidates=transitStopPins([stop]).filter(validOrigin).map(point=>({point,distanceM:meters(origin,point)}));
    const closest=candidates.reduce<typeof candidates[number] | null>((best,value)=>!best || value.distanceM<best.distanceM ? value : best,null);
    return {stop,distanceM:closest?.distanceM ?? Infinity,target:closest?.point};
  }).filter(row => row.distanceM<=radiusM)
    .sort((a,b)=>a.distanceM-b.distanceM || a.stop.stop_id.localeCompare(b.stop.stop_id)).slice(0,limit);
}

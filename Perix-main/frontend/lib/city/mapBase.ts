export type MapBase = { latitude:number; longitude:number; label:string; latitudeDelta:number; longitudeDelta:number };
export const DEFAULT_MAP_BASE: MapBase = {latitude:52.14,longitude:11.635,label:'Magdeburg, Germany',latitudeDelta:0.16,longitudeDelta:0.23};
export function validMapBase(value: unknown): value is MapBase {
  const base=value as MapBase | null;
  return !!base && [base.latitude,base.longitude,base.latitudeDelta,base.longitudeDelta].every(Number.isFinite)
    && Math.abs(base.latitude)<=90 && Math.abs(base.longitude)<=180 && base.latitudeDelta>0 && base.latitudeDelta<=180
    && base.longitudeDelta>0 && base.longitudeDelta<=360 && typeof base.label==='string' && base.label.trim().length>0 && base.label.length<=250;
}
export function mapBaseBounds(base: MapBase) {
  return {minLat:Math.max(-90,base.latitude-base.latitudeDelta/2),maxLat:Math.min(90,base.latitude+base.latitudeDelta/2),
    minLng:Math.max(-180,base.longitude-base.longitudeDelta/2),maxLng:Math.min(180,base.longitude+base.longitudeDelta/2),
    centerLat:base.latitude,centerLng:base.longitude};
}

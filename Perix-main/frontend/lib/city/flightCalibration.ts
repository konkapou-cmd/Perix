/** Presentation-only survey camera. Never changes the flight simulation or /app. */
const bounded=(value:number,min:number,max:number,fallback:number)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
/** View destinations only; matching own-catalogue town-hall coordinates.
 * These never replace any building/flight/GPS source coordinate. */
export const FLIGHT_CALIBRATION_REGIONS=[
  {id:'default',label:'Magdeburg / λοιπές περιοχές',center:{lat:52.1372132,lng:11.6384846}},
  {id:'mykonos',label:'Μύκονος',center:{lat:37.447378,lng:25.3268954}},
  {id:'syros',label:'Σύρος',center:{lat:37.4451052,lng:24.9427797}},
] as const;
export function flightCalibrationRegion(center?:{lat:number;lng:number}):'default'|'mykonos'|'syros'{
  if(center&&center.lat>=37.3&&center.lat<=37.6){
    if(center.lng>=25.2&&center.lng<=25.55)return 'mykonos';
    if(center.lng>=24.8&&center.lng<=25.03)return 'syros';
  }
  return 'default';
}
export function flightCalibrationView(view:{zoom:number;tilt:number;heading:number;altitude:number}){
  return {zoom:bounded(view.zoom,3,23,18),tilt:bounded(view.tilt,0,85,60),
    heading:Number.isFinite(view.heading)?((view.heading%360)+360)%360:0,
    altitude:bounded(view.altitude,0,50000,25)};
}
export function flightCalibrationAircraft(aircraft:{latitude:number;longitude:number;altitude:number},center:{lat:number;lng:number}|undefined,altitude:number){
  const valid=center&&Number.isFinite(center.lat)&&Number.isFinite(center.lng);
  return {...aircraft,latitude:valid?center.lat:aircraft.latitude,longitude:valid?center.lng:aircraft.longitude,
    altitude:bounded(altitude,0,50000,aircraft.altitude)};
}

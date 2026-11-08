import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { LiveVehicle, TransitStopMarker, V2MapLine } from "../../lib/api/mobility";
import { formatTransitEventTime, vehicleStopDetails } from "../../lib/city/vehicleDetails";
import { formatCountdown } from "../../lib/city/serverClock";
import type { ActivePreview } from "../../lib/city/transitPublication";

export default function TransitVehicleDetails({vehicle,lines=[],stops=[]}:{vehicle:LiveVehicle | null;lines?:V2MapLine[];stops?:TransitStopMarker[]}){
  const {t,i18n}=useTranslation();
  const [clock,setClock]=useState(()=>typeof performance!=='undefined'?performance.now():0);
  const accepted=useRef<{vehicle:LiveVehicle;preview:ActivePreview} | null>(null);
  useEffect(()=>{const timer=setInterval(()=>setClock(typeof performance!=='undefined'?performance.now():0),1000);return()=>clearInterval(timer);},[]);
  if(!vehicle)return <Text>{t('mobility.vehicleUnavailable','Vehicle information is unavailable.')}</Text>;
  const details=vehicleStopDetails(vehicle,lines,stops,Math.max(clock,vehicle.motion?.preview?.client_received_monotonic_ms ?? clock),Date.now(),
    accepted.current?.vehicle===vehicle ? accepted.current.preview : undefined);
  accepted.current=details.acceptedPreview ? {vehicle,preview:details.acceptedPreview} : null;
  const virtual=!!vehicle.estimated || vehicle.identity_kind?.startsWith('VIRTUAL');
  const gps=!virtual && vehicle.position_quality==='LIVE';
  const label=t(`mobility.${vehicle.mode}`,vehicle.mode);
  return <View testID="transit-vehicle-details" style={styles.card}>
    <Text style={styles.title}>{label} {vehicle.display_route_number || vehicle.route_number || vehicle.name}</Text>
    {!!vehicle.route_direction && <Text style={styles.text}>→ {vehicle.route_direction}</Text>}
    <Text style={styles.note} numberOfLines={2}>{t('mobility.markerIdentity','PERIX marker')}: {vehicle.vehicle_id}</Text>
    {!!vehicle.registered_vehicle_id && <Text style={styles.note}>{t('mobility.linkedVehicle','Vehicle')}: {vehicle.registered_vehicle_id}</Text>}
    {!!(vehicle.trip_instance_id || vehicle.trip_id) && <Text style={styles.note} numberOfLines={2}>{t('mobility.trip','Trip')}: {vehicle.trip_instance_id || vehicle.trip_id}</Text>}
    <Text style={styles.note}>{virtual ? t('mobility.estimated','Estimated') : gps ? t('mobility.gpsLive','GPS Live') : vehicle.position_quality || t('mobility.positionUnknown','Position source not reported')}{vehicle.position_source ? ` · ${vehicle.position_source}` : ''}</Text>
    {details.currentStopName && <Text style={styles.text}>{t('mobility.currentStop','At stop')}: {details.currentStopName}</Text>}
    <Text testID="vehicle-next-stop" style={styles.text}>{details.timingAvailable ? t('mobility.nextStop','Next stop') : t('mobility.reportedNextStop','Reported next stop')}: {details.terminal
      ? t('mobility.endOfTrip','End of trip') : details.nextStopName || t('mobility.nextStopUnknown','Not reported')}</Text>
    {details.timingAvailable ? <View style={styles.times}>
      <Text style={styles.note}>{details.serviceStopName}</Text>
      <Text testID="vehicle-parking-time" style={styles.text}>{t('mobility.parking','Parking')}: {formatTransitEventTime(details.parkingAtMs,i18n.language)}
        {details.parked ? ` · ${t('mobility.parked','At the stop')}` : ` · ${formatCountdown(details.parkingSeconds)}`}</Text>
      <Text testID="vehicle-departure-time" style={styles.text}>{t('mobility.departure','Departure')}: {formatTransitEventTime(details.departureAtMs,i18n.language)}
        {` · ${details.waiting ? t('mobility.waitingForUpdate','Waiting for update') : formatCountdown(details.departureSeconds)}`}</Text>
      <Text style={styles.note}>{details.cycleLimited ? t('mobility.limitedStationCycle','Short source window; the full station cycle is unavailable.')
        : t('mobility.parkThirtyBeforeDeparture','At 0:30 before departure the PERIX marker is already at the stop.')}</Text>
    </View> : vehicle.mode!=='taxi' && <Text style={styles.note}>{t('mobility.stationTimesUnavailable','Parking/departure clocks are not available in the current publication.')}</Text>}
  </View>;
}
const styles=StyleSheet.create({card:{gap:8},title:{fontSize:18,fontWeight:'700',color:'#264348'},text:{fontSize:14,lineHeight:21,color:'#264348'},
  note:{fontSize:11,lineHeight:17,color:'#59616A'},times:{gap:4,borderTopWidth:1,borderTopColor:'#e1e7e9',paddingTop:8},
});

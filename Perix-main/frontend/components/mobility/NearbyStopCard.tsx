import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { LiveVehicle, ServingBus, TransitStopMarker, V2MapLine } from "../../lib/api/mobility";
import type { OriginPoint } from "../../lib/city/nearbyTransit";
import { useGatewayJourney, GatewayJourneyState } from "../../hooks/city/useGatewayJourney";
import CityInlineDetails from "../city/CityInlineDetails";
import JourneyDirectionsCard from "./JourneyDirectionsCard";

export type NearbyJourney = { destinationId?: string; journey: GatewayJourneyState & { retry: () => void } };

export default function NearbyStopCard({ stop,distanceM,target,origin,closest,liveVehicles,transitLines,onArrivalsUpdate,onDirections,activeJourney,onSelectStop,
  progressiveDepartures=false,pairOppositeSides=false,fleetBatchLoadedKey="" }: {
  stop:TransitStopMarker; distanceM:number; target:OriginPoint & {platform_id?:string}; origin:OriginPoint & {kind?:"live"|"manual"}; closest:boolean;
  liveVehicles?:LiveVehicle[];transitLines?:V2MapLine[];
  onArrivalsUpdate?:(key:string,rows:ServingBus[],visibleCount?:number)=>void;
  onDirections?:(stop:TransitStopMarker)=>void; activeJourney?:NearbyJourney;
  onSelectStop?:(stop:TransitStopMarker)=>void;
  progressiveDepartures?:boolean;pairOppositeSides?:boolean;fleetBatchLoadedKey?:string;
}) {
  const {t}=useTranslation();
  const [directionsOpen,setDirectionsOpen]=useState(false);
  const destinationId=`stopplace:${stop.stop_id}`;
  // /app reuses its already active planner/map route; Home uses that same hook
  // locally. Never start a second request for an externally planned route.
  const localJourney=useGatewayJourney(!onDirections && directionsOpen
    ? {id:destinationId,title:stop.name,latitude:target.latitude,longitude:target.longitude} : null,origin);
  const journey=onDirections ? activeJourney?.destinationId===destinationId ? activeJourney.journey : null : localJourney;
  const expanded=directionsOpen && (!onDirections || activeJourney?.destinationId===destinationId);
  return <View testID={`nearby-stop-${stop.stop_id}`} style={styles.card}>
    <View style={styles.header}>
      <Pressable style={styles.nameBlock} accessibilityRole="button" disabled={!onSelectStop}
        onPress={()=>onSelectStop?.({...stop,latitude:target.latitude,longitude:target.longitude,platform_id:target.platform_id})}>
        <Text style={styles.name} numberOfLines={1}>{stop.name}</Text>
        <Text style={styles.meta}>{Math.round(distanceM)} m{closest ? ` · ${t('mobility.closestStop','Closest stop')}` : ''}</Text>
      </Pressable>
      <Pressable testID={`nearby-directions-${stop.stop_id}`} accessibilityRole="button" accessibilityState={{expanded}}
        accessibilityLabel={`${t('mobility.directions','Directions')} · ${stop.name}`} style={styles.directions} onPress={()=>{
          setDirectionsOpen(!expanded);
          if(!expanded){
            if(onDirections)onDirections({...stop,latitude:target.latitude,longitude:target.longitude});
            else localJourney.retry();
          }
        }}>
        <Ionicons name="navigate-outline" size={15} color="#216BA2" /><Text style={styles.link}>{t('mobility.directions','Directions')}</Text>
      </Pressable>
    </View>
    <CityInlineDetails entity={{id:`stop:${stop.stop_id}`,type:'stop',title:stop.name,
      facts:target.platform_id ? {platform_id:target.platform_id} : undefined}}
      bounds={{minLat:origin.latitude-0.01,maxLat:origin.latitude+0.01,minLng:origin.longitude-0.01,maxLng:origin.longitude+0.01}}
      onSelect={()=>{}} compactStopBoard initialDepartureLimit={progressiveDepartures?2:3} progressiveDepartures={progressiveDepartures}
      pairOppositeSides={pairOppositeSides}
      fleetBatchLoadedKey={fleetBatchLoadedKey} liveVehicles={liveVehicles} transitLines={transitLines}
      onArrivalsUpdate={onArrivalsUpdate} />
    {expanded && journey && <View style={styles.plan}><JourneyDirectionsCard journey={journey}
      onLocate={()=>{}} locating={false} onRetry={journey.retry} /></View>}
  </View>;
}

const styles=StyleSheet.create({
  card:{paddingHorizontal:10,paddingVertical:6,borderRadius:10,borderWidth:1,borderColor:'#dce5e9',gap:4},
  header:{flexDirection:'row',alignItems:'center',gap:8},nameBlock:{flex:1,minWidth:0},
  name:{fontSize:14,fontWeight:'700',color:'#264348'},meta:{fontSize:11,color:'#59616A',lineHeight:16},
  directions:{minHeight:44,flexDirection:'row',alignItems:'center',gap:4,paddingLeft:4},link:{fontSize:12,color:'#216BA2'},
  plan:{borderTopWidth:1,borderTopColor:'#e1e7e9',paddingTop:8},
});

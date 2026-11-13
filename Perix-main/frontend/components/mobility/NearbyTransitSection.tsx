import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useLocation } from "../../context/LocationContext";
import { getTransitStops, searchPlaces, LiveVehicle, ServingBus, TransitStopMarker, V2MapLine } from "../../lib/api/mobility";
import { nearestTransitStops, NEARBY_STOP_RADIUS_M, OriginPoint, validOrigin } from "../../lib/city/nearbyTransit";
import NearbyStopCard, { NearbyJourney } from "./NearbyStopCard";
import TransitSourceNotice from "../city/TransitSourceNotice";
import { transitStopPins } from "../../lib/city/visualGeometry";
import { prefetchNearbyCatalogue } from "../../lib/city/nearbyTransitCache";
import type { CityBounds } from "../../lib/city/publicServices";

type Suggestion = OriginPoint & { id: string; title: string };
type Props = {
  /** /app supplies its existing catalogue; Home loads it only after an origin. */
  stops?: TransitStopMarker[]; stopsLoaded?: boolean; stopsError?: boolean; onRetryStops?: () => void;
  liveVehicles?: LiveVehicle[]; transitLines?: V2MapLine[];
  onArrivalsUpdate?:(key:string,rows:ServingBus[],visibleCount?:number)=>void;
  originOverride?: (OriginPoint & {kind?:"live"|"manual"}) | null;
  onUseCurrentOrigin?:()=>void;
  onOriginSelect?: (point: OriginPoint) => void;
  onDirections?: (stop: TransitStopMarker) => void;
  activeJourney?: NearbyJourney;
  collapsible?: boolean;
  initialExpanded?: boolean;
  /** Number of closest physical stops to show once the origin is confirmed. */
  stopLimit?: number;
  excludeStopId?:string|null;
  /** Station search radius; /app uses a 150 m anchor scope. */
  radiusM?: number;
  progressiveDepartures?: boolean;
  arrivalRounds?:boolean;
  arrivalPlatformIds?:string[];
  /** 1+1: one departure per opposite side of the stop name (union read). */
  pairOppositeSides?: boolean;
  fleetBatchLoadedKey?: string;
  hideWhenEmpty?: boolean;
  bounds?: CityBounds;
  onSelectStop?: (stop: TransitStopMarker) => void;
  /** Reuses the same origin editor inside the map's location popup. */
  originEditorOnly?: boolean;
};

export default function NearbyTransitSection({ stops, stopsLoaded, stopsError, onRetryStops, liveVehicles, transitLines, onArrivalsUpdate, onOriginSelect, onDirections, activeJourney,
  collapsible=false, initialExpanded, hideWhenEmpty=false, bounds, onSelectStop, originEditorOnly=false, stopLimit=2,
   originOverride,onUseCurrentOrigin,radiusM=NEARBY_STOP_RADIUS_M,progressiveDepartures=false,pairOppositeSides=false,arrivalRounds=false,arrivalPlatformIds,excludeStopId,fleetBatchLoadedKey="" }: Props) {
  const { t }=useTranslation();
  const { t:city }=useTranslation("city");
  const { userOrigin, setUserOrigin, useLiveLocation }=useLocation();
  const anchored=validOrigin(originOverride);
  const origin=anchored ? originOverride : validOrigin(userOrigin) ? userOrigin : null;
  const [editingOrigin,setEditingOrigin]=useState(originEditorOnly);
  const [expanded,setExpanded]=useState(initialExpanded ?? (!collapsible || originEditorOnly));
  const [locating,setLocating]=useState(false),[locateError,setLocateError]=useState(false);
  const pending=useRef(false),mounted=useRef(true);
  const originAction=useRef(0);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [query,setQuery]=useState("");
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [searching,setSearching]=useState(false),[searchError,setSearchError]=useState(false);
  const [searchRetry,setSearchRetry]=useState(0);
  useEffect(()=>{
    const text=query.trim();
    if(text.length<3){setSuggestions([]);setSearching(false);setSearchError(false);return;}
    let active=true;setSearching(true);setSearchError(false);setSuggestions([]);
    const timer=setTimeout(()=>{
      searchPlaces(null,text).then(result=>{
        if(!active)return;
        const values: Suggestion[]=[
          ...(result.places || []).map(p=>({id:`place:${p.name}:${p.lat}:${p.lng}`,title:p.address || p.name,latitude:p.lat!,longitude:p.lng!})),
          ...(result.streets || []).map(p=>({id:`street:${p.name}:${p.lat}:${p.lng}`,title:p.address || p.name,latitude:p.lat!,longitude:p.lng!})),
          ...(result.stops || []).map(p=>({id:`stop:${p.stop_id}`,title:p.name,latitude:p.lat!,longitude:p.lng!})),
        ];
        setSuggestions(values.filter(validOrigin).slice(0,6));setSearching(false);
      }).catch(()=>{if(active){setSearching(false);setSearchError(true);}});
    },400);
    return()=>{active=false;clearTimeout(timer);};
  },[query,searchRetry]);
  const [catalogue,setCatalogue]=useState<{rows:TransitStopMarker[];loaded:boolean;error:boolean}>({rows:[],loaded:false,error:false});
  const [catalogueRetry,setCatalogueRetry]=useState(0);
  const hasSuppliedStops=stops!==undefined,hasOrigin=!!origin;
  useEffect(()=>{
    if(hasSuppliedStops || !hasOrigin)return;
    let active=true;setCatalogue(previous=>({...previous,loaded:false,error:false}));
    getTransitStops(null).then(rows=>{if(active)setCatalogue({rows,loaded:true,error:false});})
      .catch(()=>{if(active)setCatalogue(previous=>({...previous,loaded:true,error:true}));});
    return()=>{active=false;};
  },[hasSuppliedStops,hasOrigin,catalogueRetry]);
  const rows=stops ?? catalogue.rows,loaded=hasSuppliedStops ? !!stopsLoaded : catalogue.loaded;
  const error=hasSuppliedStops ? !!stopsError : catalogue.error;
  const visibleStopIds=useMemo(()=>bounds ? new Set(transitStopPins(rows).filter(p=>p.latitude!>=bounds.minLat && p.latitude!<=bounds.maxLat
    && p.longitude!>=bounds.minLng && p.longitude!<=bounds.maxLng).map(p=>p.stop_id)) : null,[rows,bounds]);
  const scopedRows=useMemo(()=>visibleStopIds ? rows.filter(s=>visibleStopIds.has(s.stop_id)) : rows,[rows,visibleStopIds]);
  const nearest=useMemo(()=>nearestTransitStops(scopedRows,origin,stopLimit+(excludeStopId?1:0),radiusM)
    .filter(({stop})=>stop.stop_id!==excludeStopId).slice(0,stopLimit),[scopedRows,origin?.latitude,origin?.longitude,stopLimit,radiusM,excludeStopId]);
  const locate=async()=>{
    if(pending.current)return;
    pending.current=true;setLocating(true);setLocateError(false);
    const action=++originAction.current;
    try{
      const fix=await useLiveLocation(15000);
      if(!mounted.current || action!==originAction.current)return;
      if(fix){setEditingOrigin(false);setQuery("");setSuggestions([]);onOriginSelect?.(fix);}else setLocateError(true);
    }catch{if(mounted.current && action===originAction.current)setLocateError(true);}
    finally{pending.current=false;if(mounted.current)setLocating(false);}
  };
  if (!originEditorOnly && hideWhenEmpty && loaded && !error && !scopedRows.length) return null;
  return <View testID={originEditorOnly ? "map-origin-editor" : "nearby-transit-section"} style={styles.card}>
    {!originEditorOnly && (collapsible ? <Pressable testID="nearby-transit-toggle" accessibilityRole="button"
      accessibilityState={{expanded}} onPress={()=>setExpanded(value=>!value)} style={[styles.originBar,{minHeight:44}]}>
      <Text style={[styles.heading,{flex:1}]}>{t("mobility.nearbyStops","Nearby stops")}</Text>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={24} color="#59ABE3" />
    </Pressable> : <Text style={styles.heading}>{t("mobility.nearbyStops","Nearby stops")}</Text>)}
    {expanded && <>
    {origin ? <View style={styles.originBar}><Text testID="nearby-transit-origin" style={[styles.text,styles.originText]} numberOfLines={2}>
      {anchored ? t("mobility.selectedStop","Selected stop")
        : userOrigin?.kind==="manual" ? t("mobility.manualLocation","Entered location") : t("mobility.liveLocation","Live location")}
      {" · "}{origin.name || `${origin.latitude.toFixed(5)}, ${origin.longitude.toFixed(5)}`}
    </Text>
      {anchored ? <>
        {onUseCurrentOrigin && <Pressable testID="nearby-transit-use-current-origin" accessibilityRole="button"
          accessibilityLabel={t("home.useMyLocation","Use my location")} onPress={onUseCurrentOrigin} style={styles.iconButton}>
          <Ionicons name="locate" size={19} color="#216BA2" />
        </Pressable>}
        {!!onOriginSelect && <Pressable testID="nearby-transit-edit-origin" accessibilityRole="button"
          accessibilityLabel={t("mobility.changeLocation","Change location")} accessibilityState={{expanded:editingOrigin}}
          onPress={()=>{setQuery("");setSuggestions([]);setEditingOrigin(value=>!value);}} style={styles.iconButton}>
          <Ionicons name="pencil-outline" size={18} color="#216BA2" />
        </Pressable>}
      </> : <>
        <Pressable testID="nearby-transit-locate" accessibilityRole="button" accessibilityLabel={t("home.useMyLocation")} disabled={locating} onPress={locate} style={styles.iconButton}>
          {locating ? <ActivityIndicator /> : <Ionicons name="locate" size={19} color="#216BA2" />}
        </Pressable>
        <Pressable testID="nearby-transit-edit-origin" accessibilityRole="button" accessibilityLabel={t("mobility.changeLocation","Change location")}
          accessibilityState={{expanded:editingOrigin}} onPress={()=>{
            if(editingOrigin){setQuery("");setSuggestions([]);}
            setEditingOrigin(!editingOrigin);
          }} style={styles.iconButton}>
          <Ionicons name="pencil-outline" size={18} color="#216BA2" />
        </Pressable>
      </>}
    </View> : <>
      <Text style={styles.text}>{t("mobility.locationNeeded","Use your live location or enter your address to see nearby stops and departures.")}</Text>
      <Pressable testID="nearby-transit-locate" accessibilityRole="button" disabled={locating} onPress={locate} style={styles.button}>
        {locating && <ActivityIndicator />}<Text style={styles.link}>{t(locating ? "home.locating" : "home.useMyLocation")}</Text>
      </Pressable>
    </>}
    {locateError && <Text accessibilityLiveRegion="polite">{t("home.locateFailed")}</Text>}
    {(!origin || editingOrigin) && <TextInput testID="nearby-transit-origin-input" value={query} onChangeText={setQuery} style={styles.input}
      accessibilityLabel={t("mobility.enterLocation","Enter your address or location…")}
      placeholder={t("mobility.enterLocation","Enter your address or location…")} />}
    {searching && <ActivityIndicator />}
    {searchError && <Pressable accessibilityRole="button" style={styles.button} onPress={()=>setSearchRetry(value=>value+1)}>
      <Text>{city("ui.unavailable")} · {city("ui.retry")}</Text>
    </Pressable>}
    {!searching && !searchError && query.trim().length>=3 && !suggestions.length && <Text>{t("mobility.noLocationResults","No locations found")}</Text>}
    {suggestions.map(place=><Pressable key={place.id} accessibilityRole="button" style={styles.button} onPress={()=>{
      originAction.current+=1;
      setUserOrigin(place.latitude,place.longitude,place.title);
      prefetchNearbyCatalogue({latitude:place.latitude,longitude:place.longitude});
      setQuery("");setSuggestions([]);setEditingOrigin(false);setLocateError(false);onOriginSelect?.({...place,name:place.title});
    }}><Text style={styles.link}>{place.title}</Text></Pressable>)}
    {!originEditorOnly && origin && !loaded && !error && <ActivityIndicator />}
    {!originEditorOnly && origin && error && <Pressable accessibilityRole="button" style={styles.button} onPress={()=>hasSuppliedStops ? onRetryStops?.() : setCatalogueRetry(value=>value+1)}>
      <Text>{city("ui.unavailable")} · {city("ui.retry")}</Text>
    </Pressable>}
    {!originEditorOnly && origin && loaded && !error && !nearest.length && <Text>{t("mobility.noNearbyStops","No stops within {{km}} km of this location.",{km:radiusM/1000})}</Text>}
     </>}
     {!originEditorOnly && (expanded || arrivalRounds) && origin && !error && nearest.length>0 && <View testID="nearby-transit-departures" style={[styles.stopCards,!expanded && {display:'none'}]}>
      {nearest.map(({stop,distanceM,target},index)=>target && <NearbyStopCard key={stop.stop_id} stop={stop} distanceM={distanceM}
         target={target} origin={origin!} closest={index===0} liveVehicles={liveVehicles} transitLines={transitLines}
         onArrivalsUpdate={onArrivalsUpdate} onDirections={onDirections} activeJourney={activeJourney} onSelectStop={onSelectStop}
          progressiveDepartures={progressiveDepartures} pairOppositeSides={pairOppositeSides} arrivalRounds={arrivalRounds}
          arrivalPlatformIds={arrivalPlatformIds} fleetBatchLoadedKey={fleetBatchLoadedKey} />)}
      <TransitSourceNotice />
    </View>}
   </View>;
}

const styles=StyleSheet.create({
  card:{paddingVertical:10,paddingHorizontal:0,gap:6,backgroundColor:"#fff",borderRadius:12,marginVertical:6},
  heading:{fontSize:16,fontWeight:"700",color:"#264348",fontFamily:"Quicksand_600SemiBold"},
  text:{fontSize:13,lineHeight:20,color:"#59616A",fontFamily:"Quicksand_400Regular"},link:{color:"#216BA2",fontSize:14,fontFamily:"Quicksand_400Regular"},
  button:{minHeight:44,justifyContent:"center",flexDirection:"row",alignItems:"center",gap:8},
  input:{height:48,borderWidth:1,borderColor:"#ccd6da",borderRadius:10,paddingHorizontal:12,color:"#264348",fontFamily:"Quicksand_400Regular"},
  stopCards:{gap:8},originBar:{flexDirection:'row',alignItems:'center',gap:4},originText:{flex:1,minWidth:0},
  iconButton:{height:44,width:44,alignItems:'center',justifyContent:'center'},
});

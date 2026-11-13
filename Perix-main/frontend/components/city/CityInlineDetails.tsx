import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest } from "../../lib/api/core";
import { DirectoryEntity, EntityKind, getDirectoryDetail } from "../../lib/city/gateway";
import { CityBounds, PUBLIC_SERVICE_THEME as theme } from "../../lib/city/publicServices";
import { PublicServiceCard } from "./PublicServiceCard";
import { useTranslation } from "react-i18next";
import "../../i18n/city";
import { getBusesServing } from '../../lib/api/mobility';
import type { ServingBus, LiveVehicle, TransitStopMarker, V2MapLine } from '../../lib/api/mobility';
import TransitVehicleDetails from '../mobility/TransitVehicleDetails';
import { startFleetPolling } from '../../lib/city/fleetPoller';
import { countdownPresentation, formatCountdown, departureRefreshKey } from '../../lib/city/serverClock';
import { subscribeVisualRefresh, requestVisualRefresh } from '../../lib/city/transitPublication';
import { vehicleForDeparture } from '../../lib/city/arrivalVehicle';
import { departureBatchKey } from '../../lib/city/departureBatch';

/** 1+1 opposite sides: earliest departure per platform (one from each side
 * of the stop name), preferred side first, sorted by ETA. Falls back to the
 * next earliest overall so the board still shows 2 rows when the other side
 * has no upcoming departures. */
export function pickPairedOppositeRows(rows:ServingBus[], preferredPlatformId?: string | null):ServingBus[] {
  const byPlatform=new Map<string,ServingBus[]>();
  for(const row of rows){
    const key=String(row.platform_id || "");
    if(!byPlatform.has(key))byPlatform.set(key,[]);
    byPlatform.get(key)!.push(row);
  }
  const heads:ServingBus[]=[];
  for(const group of byPlatform.values()){
    group.sort((a,b)=>(a.eta_seconds||0)-(b.eta_seconds||0));
    if(group[0])heads.push(group[0]);
  }
  heads.sort((a,b)=>(a.eta_seconds||0)-(b.eta_seconds||0));
  const picked:ServingBus[]=[];
  if(preferredPlatformId){
    const pref=heads.find(row=>String(row.platform_id||"")===String(preferredPlatformId));
    if(pref)picked.push(pref);
  }
  for(const head of heads){
    if(picked.length>=2)break;
    if(!picked.includes(head))picked.push(head);
  }
  if(picked.length<2){
    const rest=[...rows].sort((a,b)=>(a.eta_seconds||0)-(b.eta_seconds||0));
    for(const row of rest){
      if(picked.length>=2)break;
      if(!picked.some(done=>(done.trip_instance_id||done.trip_id)===(row.trip_instance_id||row.trip_id)
        && String(done.platform_id||"")===String(row.platform_id||"")))picked.push(row);
    }
  }
  return picked.slice(0,2).sort((a,b)=>(a.eta_seconds||0)-(b.eta_seconds||0));
}

export default function CityInlineDetails({ entity, bounds, onSelect, stopBoardTitle, compactStopBoard=false, initialDepartureLimit=8,
  progressiveDepartures=false,pairOppositeSides=false,arrivalRounds=false,fleetBatchLoadedKey="",vehicle, liveVehicles, transitLines, transitCatalogue, onArrivalsUpdate }: {
  entity: DirectoryEntity; bounds: CityBounds; onSelect: (entity: DirectoryEntity) => void; stopBoardTitle?: string;
  compactStopBoard?: boolean; initialDepartureLimit?: number;
  progressiveDepartures?:boolean;pairOppositeSides?:boolean;fleetBatchLoadedKey?:string;
  arrivalRounds?:boolean;
  vehicle?:LiveVehicle | null; liveVehicles?:LiveVehicle[]; transitLines?:V2MapLine[]; transitCatalogue?:TransitStopMarker[];
  onArrivalsUpdate?:(key:string,rows:ServingBus[],visibleCount?:number)=>void;
}) {
  const { t } = useTranslation("city");
  const { t: mobilityText } = useTranslation();
  const selectedPlatformIds=String(entity.facts?.platform_ids || '').split('|').filter(Boolean);
  const arrivalKey = `${entity.id}|${entity.facts?.platform_id || ''}${selectedPlatformIds.length ? `|group:${selectedPlatformIds.slice().sort().join('|')}` : ''}`;
  const [departuresExpanded,setDeparturesExpanded] = useState(false);
  const [visibleDepartureLimit,setVisibleDepartureLimit]=useState(initialDepartureLimit);
  const [arrivalPageState,setArrivalPageState]=useState({key:'',page:0});
  const arrivalPage=arrivalPageState.key===arrivalKey?arrivalPageState.page:0;
  const advancedBatchKey=useRef("");
  const arrivalRowsRef=useRef<{key:string;rows:ServingBus[]}>({key:'',rows:[]});
  useEffect(()=>{
    setDeparturesExpanded(false);setVisibleDepartureLimit(initialDepartureLimit);
    advancedBatchKey.current="";arrivalRowsRef.current={key:arrivalKey,rows:[]};
  },[arrivalKey,initialDepartureLimit]);
  const [arrivalState, setArrivalState] = useState<{key:string; rows:ServingBus[]; loaded:boolean; error:boolean;pageSize:number}>(
    {key:'',rows:[],loaded:false,error:false,pageSize:0});
  const [arrivalClock, setArrivalClock] = useState(0);
  const arrivalsUpdateRef=useRef(onArrivalsUpdate);arrivalsUpdateRef.current=onArrivalsUpdate;
  const refreshedDepartures = useRef(new Set<string>());
  useEffect(() => {
    if (entity.type !== 'stop' || arrivalState.key !== arrivalKey) return;
    for (const row of arrivalState.rows) {
      const key = departureRefreshKey(row,arrivalClock);
      if (key && !refreshedDepartures.current.has(key)) {
        if (refreshedDepartures.current.size > 256) refreshedDepartures.current.clear();
        refreshedDepartures.current.add(key);requestVisualRefresh(arrivalClock);
      }
    }
  },[arrivalClock,arrivalState,arrivalKey,entity.type]);
  useEffect(() => {
    if (entity.type !== 'stop') return;
    arrivalsUpdateRef.current?.(arrivalKey,[]);
    arrivalRowsRef.current={key:arrivalKey,rows:[]};
    setArrivalState({key:arrivalKey,rows:[],loaded:false,error:false,pageSize:0});
    const timer = setInterval(() => setArrivalClock(typeof performance !== 'undefined' ? performance.now() : 0),1000);
    return () => {clearInterval(timer);arrivalsUpdateRef.current?.(arrivalKey,[]);};
  },[arrivalKey,entity.type]);
  useEffect(()=>{
    if(entity.type!=='stop' || arrivalState.key!==arrivalKey)return;
    let active=true;
    const paired=(pairOppositeSides || arrivalRounds) && entity.type==='stop';
    const offset=(progressiveDepartures && !paired?arrivalPage:0)*2;
    const page=(progressiveDepartures && !paired)?{limit:2,offset}:paired?{limit:20,offset:0}:undefined;
    let readHadError=false;
    const stop=startFleetPolling({intervalMs:10000,subscribeRefresh:subscribeVisualRefresh,
      load:()=>{
        // Paired mode always reads the union across platforms; facts.platform_id
        // is only a preference hint for which side is picked first, never a filter.
        const stopId=entity.id.replace(/^stop:/,'');
        // Reuse exact platform reads: an unusually busy platform cannot fill
        // a union page and starve the first/second arrivals of its neighbours.
        const read=arrivalRounds && selectedPlatformIds.length
          ? Promise.allSettled(selectedPlatformIds.map(platformId=>getBusesServing(null,stopId,null,null,platformId,{limit:2,offset:0}))).then(pages=>{
            readHadError=pages.some(page=>page.status==='rejected');
            return pages.flatMap((page,index)=>{
              const platformId=selectedPlatformIds[index];
              const rows=page.status==='fulfilled' ? page.value : arrivalRowsRef.current.rows;
              // Older servers may ignore pagination; preserve exact platforms
              // and select their two earliest source arrivals on the client.
              return rows.filter(row=>String(row.platform_id || '')===platformId)
                .sort((a,b)=>(a.eta_seconds ?? Infinity)-(b.eta_seconds ?? Infinity)).slice(0,2);
            });})
          : getBusesServing(null,stopId,null,null,paired?undefined:entity.facts?.platform_id,page);
        return read.catch(error=>{if(active){
          setArrivalState(state=>state.key===arrivalKey?{...state,error:true}:state);
          if(arrivalRounds){const known=arrivalRowsRef.current.key===arrivalKey?arrivalRowsRef.current.rows:[];
            arrivalsUpdateRef.current?.(arrivalKey,known,known.length);}
        }throw error;});
      },
      publish:pageRows=>{
        const previous=arrivalRowsRef.current.key===arrivalKey?arrivalRowsRef.current.rows:[];
        let rows=pageRows;
        if(arrivalRounds){
          rows=(selectedPlatformIds.length ? pageRows.filter(row=>selectedPlatformIds.includes(String(row.platform_id || ''))) : pageRows)
            .sort((a,b)=>(a.eta_seconds ?? Infinity)-(b.eta_seconds ?? Infinity));
        }else if(paired){
           rows=pickPairedOppositeRows(selectedPlatformIds.length
             ? pageRows.filter(row=>selectedPlatformIds.includes(String(row.platform_id || ''))) : pageRows,entity.facts?.platform_id);
        }else if(progressiveDepartures){
          const merged=new Map<string,ServingBus>();
          for(const row of previous)merged.set(`${row.trip_instance_id||row.trip_id}|${row.platform_id||""}`,row);
          for(const row of pageRows)merged.set(`${row.trip_instance_id||row.trip_id}|${row.platform_id||""}`,row);
          rows=[...merged.values()].sort((a,b)=>(a.eta_seconds||0)-(b.eta_seconds||0));
        }
        arrivalRowsRef.current={key:arrivalKey,rows};
        setArrivalState({key:arrivalKey,rows,loaded:true,error:readHadError,pageSize:pageRows.length});
        if(!progressiveDepartures || paired)arrivalsUpdateRef.current?.(arrivalKey,rows,arrivalRounds?rows.length:undefined);
      }});
    return()=>{active=false;stop();};
   },[arrivalKey,arrivalState.key,arrivalPage,entity.id,entity.type,entity.facts?.platform_id,progressiveDepartures,pairOppositeSides,arrivalRounds]);
  const [related, setRelated] = useState<DirectoryEntity[]>([]);
  const [relatedError, setRelatedError] = useState(false);
  const [comments, setComments] = useState<{ id: string; text: string; author: string }[]>([]);
  const [commentCursor, setCommentCursor] = useState<number | null>(null);
  const activeEntity = useRef(entity.id); activeEntity.current = entity.id;
  const commentLoading = useRef(false);
  useEffect(() => {
    let active = true;
    setRelated([]); setRelatedError(false);
    setComments([]); setCommentCursor(null);
    commentLoading.current = false;
    if (entity.type === "post") {
      apiRequest<{ items: { id: string; text: string; author: string }[]; next_cursor: number | null }>(`/public-directory/post/${encodeURIComponent(entity.id)}/comments`, "GET")
        .then(page => { if (active) { setComments(page.items); setCommentCursor(page.next_cursor); } })
        .catch(() => { if (active) setRelatedError(true); });
      return () => { active = false; };
    }
    if (!["business", "artist", "user"].includes(entity.type)) return;
    const params = new URLSearchParams({ publisher_id: entity.id, publisher_type: entity.type,
      min_lat: String(bounds.minLat), max_lat: String(bounds.maxLat), min_lng: String(bounds.minLng), max_lng: String(bounds.maxLng) });
    apiRequest<{ items: DirectoryEntity[] }>(`/public-directory/post?${params}`, "GET").then(page => {
      if (active) setRelated(page.items);
    }).catch(() => { if (active) setRelatedError(true); });
    return () => { active = false; };
  }, [entity.id, entity.type, bounds]);
  const visibleArrivals = arrivalState.key === arrivalKey
    ? arrivalState.rows.filter(row => countdownPresentation(row,arrivalClock).visible) : [];
  const displayedArrivals=visibleArrivals.slice(0,compactStopBoard && progressiveDepartures
    ? visibleDepartureLimit : compactStopBoard && departuresExpanded ? undefined : initialDepartureLimit);
  const displayedBatchKey=departureBatchKey(displayedArrivals);
  useEffect(()=>{
    if(!compactStopBoard || !progressiveDepartures || entity.type!=='stop'
      || arrivalState.key!==arrivalKey || !arrivalState.loaded || arrivalState.pageSize!==2 || !displayedArrivals.length)return;
    if(fleetBatchLoadedKey!==displayedBatchKey || displayedArrivals.length<visibleDepartureLimit
      || advancedBatchKey.current===displayedBatchKey)return;
    advancedBatchKey.current=displayedBatchKey;
    setVisibleDepartureLimit(visibleDepartureLimit+2);
    setArrivalPageState({key:arrivalKey,page:arrivalPage+1});
  },[arrivalKey,arrivalState.key,arrivalState.loaded,arrivalState.rows,compactStopBoard,displayedBatchKey,
    arrivalState.pageSize,arrivalPage,displayedArrivals.length,entity.type,fleetBatchLoadedKey,progressiveDepartures,visibleDepartureLimit]);
  useEffect(()=>{
    if(!compactStopBoard || !progressiveDepartures || !onArrivalsUpdate || entity.type!=='stop'
      || arrivalState.key!==arrivalKey || !arrivalState.loaded)return;
    onArrivalsUpdate(arrivalKey,displayedArrivals,displayedArrivals.length);
  },[arrivalKey,arrivalState.key,arrivalState.loaded,arrivalState.rows,compactStopBoard,displayedBatchKey,
    entity.type,onArrivalsUpdate,progressiveDepartures]);
  if (entity.publicService) return <View style={{ gap: 8 }}>
    <PublicServiceCard service={entity.publicService} full showMap={false} />
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.push({
    pathname: "/public-services/[id]", params: { id: entity.publicService!.service_id },
    })}>
      <Text style={styles.link}>{t("source.13")} ↗</Text>
    </Pressable>
  </View>;
  const vehicleEntity=['bus','tram','taxi'].includes(entity.type);
  const openPublisher = async () => {
    if (!entity.publisher_id || !entity.publisher_type) return;
    try { onSelect(await getDirectoryDetail(entity.publisher_type as EntityKind, entity.publisher_id)); }
    catch { setRelatedError(true); }
  };
  return <View style={compactStopBoard && entity.type === 'stop' ? styles.compactCard : styles.card}>
    {!vehicleEntity && !(compactStopBoard && entity.type === 'stop') && <Text style={styles.title}>{entity.title}</Text>}
    {vehicleEntity && <TransitVehicleDetails vehicle={vehicle || null} lines={transitLines} stops={transitCatalogue} />}
    {entity.cover_image && <Image source={{ uri: entity.cover_image }} style={styles.image} resizeMode="cover" accessibilityLabel={entity.title} />}
    {entity.address && <Text>{entity.address}</Text>}
    {!vehicleEntity && entity.description && <Text style={styles.text}>{entity.description}</Text>}
     {Object.entries(entity.facts || {}).filter(([label]) => label !== 'platform_id' && label !== 'platform_ids').map(([label, value]) => <Text key={label} style={styles.text}>{label}: {value}</Text>)}
    {entity.type === 'stop' && <View>
      {!compactStopBoard && <Text style={styles.title}>{stopBoardTitle || mobilityText('mobility.arrival','Arrival')}</Text>}
      {(arrivalState.key !== arrivalKey || !arrivalState.loaded) && !arrivalState.error ? <ActivityIndicator /> : null}
      {arrivalState.key === arrivalKey && arrivalState.error ? <Text>{t('ui.unavailable')}</Text> : null}
      {arrivalState.key === arrivalKey && arrivalState.loaded && !arrivalState.error && visibleArrivals.length === 0
        ? <Text>{mobilityText('mobility.noArrivals','No upcoming arrivals')}</Text> : null}
      {displayedArrivals.map((row,index) => {
        const presentation = countdownPresentation(row,arrivalClock);
        const countdown = formatCountdown(presentation.seconds);
        const locatedVehicle=vehicleForDeparture(row,liveVehicles || [],transitLines || []);
        const vehicleStatus=locatedVehicle
          ? mobilityText(row.vehicle_link_basis === 'VERIFIED_BLOCK_PREDECESSOR'
            ? 'mobility.vehicleOnVerifiedPreviousTrip' : 'mobility.exactVehicleLocated',
            row.vehicle_link_basis === 'VERIFIED_BLOCK_PREDECESSOR'
              ? 'Exact vehicle located on its verified previous trip' : 'Exact vehicle located')
          : mobilityText('mobility.vehiclePositionUnavailable','Vehicle position not verified');
        const event = row.countdown_event === 'WAITING_FOR_SOURCE_UPDATE' ? mobilityText('mobility.waitingForUpdate','Waiting for update')
          : row.countdown_event === 'DEPARTURE' ? mobilityText('mobility.departure','Departure') : mobilityText('mobility.arrival','Arrival');
        const boardRowKey=`${row.trip_instance_id || row.trip_id || row.vehicle_id}:${row.platform_id || 'platform'}:${index}`;
        if (compactStopBoard) return <View key={boardRowKey}>
          <View testID="compact-departure-row" style={styles.departureRow}>
            <Text style={styles.routeBadge}>{row.mode === 'tram' ? '🚋' : '🚌'} {row.route_number}{row.platform_code ? ` · ${row.platform_code}` : ''}</Text>
            <Text style={styles.direction} numberOfLines={1}>{row.route_direction}</Text>
            <Text style={styles.departureTime}>{row.predicted_arrival || '—'}</Text>
            <View style={styles.countdown}><Text style={styles.countdownValue}>{countdown}</Text><Text style={styles.event}>{event}</Text></View>
          </View>
          <Text testID={`departure-vehicle-${row.trip_id || index}`} style={styles.departureVehicle}>
            {vehicleStatus}{locatedVehicle?.next_stop_name ? ` · ${mobilityText('mobility.nextStop','Next stop')}: ${locatedVehicle.next_stop_name}` : ''}
          </Text>
        </View>;
        return <View key={boardRowKey}>
          <Text style={styles.text}>
            {row.mode === 'tram' ? '🚋' : '🚌'} {row.route_number}{row.platform_code ? ` · ${row.platform_code}` : ''} → {row.route_direction} · {row.predicted_arrival || '—'} · {event} {countdown}
            {(presentation.stale || arrivalState.error) ? ` · ${mobilityText('mobility.lastKnownTiming','Last known timing · no new update')}` : ''}
          </Text>
          <Text testID={`departure-vehicle-${row.trip_id || index}`} style={styles.departureVehicle}>{vehicleStatus}
            {locatedVehicle?.next_stop_name ? ` · ${mobilityText('mobility.nextStop','Next stop')}: ${locatedVehicle.next_stop_name}` : ''}</Text>
        </View>;
      })}
      {compactStopBoard && visibleArrivals.some(row=>countdownPresentation(row,arrivalClock).stale || arrivalState.error)
        && <Text style={styles.event}>{mobilityText('mobility.lastKnownTiming','Last known timing · no new update')}</Text>}
      {compactStopBoard && !progressiveDepartures && visibleArrivals.length>initialDepartureLimit && <Pressable testID="compact-departures-toggle"
        accessibilityRole="button" accessibilityState={{expanded:departuresExpanded}}
        accessibilityLabel={departuresExpanded ? mobilityText('mobility.fewerDepartures','Fewer departures') : mobilityText('mobility.moreDepartures','More departures')}
        onPress={()=>setDeparturesExpanded(value=>!value)} style={styles.departureToggle}>
        <Ionicons name={departuresExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.blue} />
        {!departuresExpanded && <Text style={styles.link}>+{visibleArrivals.length-initialDepartureLimit}</Text>}
      </Pressable>}
    </View>}
    {entity.images?.filter(url => url !== entity.cover_image).map(url => <Image key={url} source={{ uri: url }} style={styles.image} resizeMode="contain" accessibilityLabel={`Gallery ${entity.title}`} />)}
    {entity.videos?.map(url => <Pressable key={url} accessibilityRole="link" style={styles.button} onPress={() => { if (/^https?:\/\//i.test(url)) void Linking.openURL(url); }}><Text style={styles.link}>{t("ui.video")}</Text></Pressable>)}
    {entity.phone && <Pressable accessibilityRole="link" style={styles.button} onPress={() => { void Linking.openURL(`tel:${entity.phone!.replace(/[^+\d]/g, "")}`); }}><Text style={styles.link}>{entity.phone}</Text></Pressable>}
    {entity.website && <Pressable accessibilityRole="link" style={styles.button} onPress={() => { if (/^https?:\/\//i.test(entity.website!)) void Linking.openURL(entity.website!); }}><Text style={styles.link}>{t("ui.website")}</Text></Pressable>}
    {entity.publisher_id && <Pressable accessibilityRole="button" style={styles.button} onPress={openPublisher}><Text style={styles.link}>{t("ui.publisher")}</Text></Pressable>}
    {relatedError && <Text>{t("ui.relatedError")}</Text>}
    {related.length > 0 && <Text style={styles.title}>{t("ui.posts")}</Text>}
    {related.map(post => <Pressable key={post.id} accessibilityRole="button" style={styles.button} onPress={() => onSelect(post)}><Text style={styles.link}>{post.title}</Text></Pressable>)}
    {comments.length > 0 && <Text style={styles.title}>{t("ui.comments")}</Text>}
    {comments.map((comment, i) => <View key={`${comment.id}:${i}`}><Text style={styles.title}>{comment.author}</Text><Text style={styles.text}>{comment.text}</Text></View>)}
    {commentCursor !== null && <Pressable accessibilityRole="button" style={styles.button} onPress={() => {
      if (commentLoading.current) return;
      commentLoading.current = true;
      const postId = entity.id;
      apiRequest<{ items: typeof comments; next_cursor: number | null }>(`/public-directory/post/${encodeURIComponent(postId)}/comments?skip=${commentCursor}`, "GET")
        .then(page => { if (activeEntity.current === postId) { setComments(prev => [...prev, ...page.items]); setCommentCursor(page.next_cursor); } })
        .catch(() => { if (activeEntity.current === postId) setRelatedError(true); })
        .finally(() => { if (activeEntity.current === postId) commentLoading.current = false; });
    }}><Text style={styles.link}>{t("ui.moreComments")}</Text></Pressable>}
  </View>;
}

export function PublicEntityLoader({ kind, id }: { kind: EntityKind; id: string }) {
  const { t } = useTranslation("city");
  const [state, setState] = useState<{ key: string; entity?: DirectoryEntity; error?: boolean }>({ key: "" });
  const key = `${kind}:${id}`;
  useEffect(() => {
    let active = true;
    const request = getDirectoryDetail(kind, id).catch(error => {
      if (kind === "product") return getDirectoryDetail("home", id);
      throw error;
    });
    request.then(entity => { if (active) setState({ key, entity }); }).catch(() => { if (active) setState({ key, error: true }); });
    return () => { active = false; };
  }, [key, kind, id]);
  if (state.key !== key) return <ActivityIndicator />;
  return state.entity ? <CityInlineDetails entity={state.entity} bounds={{ minLat: 52.06, maxLat: 52.22, minLng: 11.52, maxLng: 11.75 }} onSelect={entity => setState({ key, entity })} /> : <Text>{t("ui.unavailable")}</Text>;
}

const styles = StyleSheet.create({ card: { padding: 16, backgroundColor: "#fff", borderRadius: 20, gap: 12 }, title: { fontSize: 22, fontWeight: "700", color: theme.navy }, image: { width: "100%", height: 240, borderRadius: 16 }, text: { lineHeight: 24 }, button: { minHeight: 44, padding: 8, justifyContent: "center" }, link: { color: theme.blue },
  compactCard:{gap:2},departureRow:{flexDirection:'row',alignItems:'center',gap:6,minHeight:32},
  departureVehicle:{fontSize:10,color:'#59616A',paddingLeft:4,paddingBottom:3},
  routeBadge:{fontSize:12,fontWeight:'600',color:theme.navy,minWidth:42},direction:{flex:1,minWidth:0,fontSize:12,color:theme.navy},
  departureTime:{fontSize:12,color:'#59616A'},countdown:{minWidth:50,alignItems:'flex-end'},
  countdownValue:{fontSize:13,fontWeight:'700',fontVariant:['tabular-nums'],color:theme.navy},event:{fontSize:10,color:'#59616A'},
  departureToggle:{minHeight:44,flexDirection:'row',justifyContent:'center',alignItems:'center',gap:4},
});

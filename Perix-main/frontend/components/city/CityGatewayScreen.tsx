import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import BusinessMap from "../BusinessMap";
import { SafeAreaView } from "react-native-safe-area-context";
import { MAP_PAGE_BACKGROUND, MAP_PAGE_GUTTER, MAP_PAGE_MAX_WIDTH, mapHeaderMetrics, initialNearbyMapZoom } from "../../lib/city/mapLayout";
import { useAuth } from "../../context/AuthContext";
import { useLocation } from "../../context/LocationContext";
import MapScreenHeader from "./MapScreenHeader";
import { useMapBounds } from "../../context/MapBoundsContext";
import { mapBaseBounds } from "../../lib/city/mapBase";
import { useGatewayJourney } from "../../hooks/city/useGatewayJourney";
import { journeyPlanLines } from "../../lib/city/journeyDirections";
import { stopMatchesMode, MobilityMode } from "../../lib/city/mobilityControls";
import { apiRequest, CategoryGroup } from "../../lib/api/core";
import { getNearbyVehicles, getNearbyStops, getNearbyMap, getTransitStops, TransitStopMarker, V2MapLine, LiveVehicle, ServingBus, searchPlaces } from "../../lib/api/mobility";
import type { V2SourceManifest } from "../../lib/api/mobility";
import { missingVisualGeometryKeys } from "../../lib/api/mobility";
import { translateCategory } from "../../lib/categoryTranslation";
import { getPublicServiceTaxonomy, CityBounds, MAGDEBURG_BOUNDS, PublicServiceCategory, PUBLIC_SERVICE_THEME as theme } from "../../lib/city/publicServices";
import { DirectoryEntity, gatewayCategories, GatewayNode } from "../../lib/city/gateway";
import { useCityDiscovery } from "../../hooks/city/useCityDiscovery";
import { hasOsmTransitRouting, schedulePublisher } from "../../lib/city/transitAttribution";
import CityInlineDetails from "./CityInlineDetails";
import PerixLogo from "../brand/PerixLogo";
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";
import { gatewayEntityColor, gatewayNodeColor, GATEWAY_ENTITY_COLORS } from "../../lib/city/presentation";
import { CATEGORY_COLORS } from "../../lib/categoryIcons";import { confirmedEmpty, localizeGatewayNodes } from "../../lib/city/localization";
import { CITY_ROOT_IDS } from "../../i18n/city";
import CityLanguagePicker from "./CityLanguagePicker";
import { startFleetPolling } from "../../lib/city/fleetPoller";
import { subscribeVisualRefresh } from "../../lib/city/transitPublication";
import { visualGeometryReady, distinctGeometryLines, transitStopPins } from "../../lib/city/visualGeometry";
import TransitSourceNotice from "./TransitSourceNotice";
import GoogleDirectionsPreview from "../mobility/GoogleDirectionsPreview";
import { validDirectionsPoint } from "../../lib/city/googleDirections";
import { APP_NEARBY_STOP_RADIUS_M, nearbyScopeBounds, nearestTransitStops, validOrigin } from "../../lib/city/nearbyTransit";
import { sliceVisualPath } from "../../lib/city/transitPath";
import { vehicleForDeparture } from "../../lib/city/arrivalVehicle";
import { departureBatchKey, departureVehicleIds } from "../../lib/city/departureBatch";
import NearbyTransitSection from "../mobility/NearbyTransitSection";
import MapLocationPopup from "./MapLocationPopup";
import GatewayResultCard from "./GatewayResultCard";
import IllustratedIcon, { type IllustratedIconKind } from "../icons/IllustratedIcon";

const INITIAL_REGION = { latitude: 52.14, longitude: 11.635, latitudeDelta: 0.16, longitudeDelta: 0.23 };
const transitRouteKey=(mode?:string,route?:string|null)=>`${mode || ""}:${String(route || "")}`;
const LOCATOR_FONT_FAMILY={regular:"Quicksand_400Regular",semibold:"Quicksand_600SemiBold",bold:"Quicksand_700Bold"} as const;
function markerProfileImage(entity:DirectoryEntity){
  const record=entity as DirectoryEntity & {profile_photo?:string|null;picture?:string|null;logo_image?:string|null;avatar?:string|null};
  return record.profile_photo || record.picture || record.logo_image || record.avatar || entity.cover_image || entity.images?.[0] || undefined;
}
function gatewayIllustration(node:GatewayNode):{kind:IllustratedIconKind;key:string}|null{
  if(node.query.service_type)return {kind:"service-module",key:node.query.service_type};
  if(node.query.property_type)return {kind:"business-subcategory",key:node.query.property_type};
  if(node.id==="products")return {kind:"home",key:"products"};
  if(node.id==="events" || node.id==="activities")return {kind:"home",key:node.id};
  const kinds=node.query.kinds || [];
  if(kinds.includes("product"))return {kind:node.query.subcategories?.length?"marketplace-subcategory":"marketplace-parent",key:node.query.subcategories?.[0] || node.id};
  if(node.query.root){
    if(node.query.subcategories?.length===1)return {kind:"business-subcategory",key:node.query.subcategories[0]};
    if(node.query.subcategories?.length && node.query.subcategories.length>1)return {kind:"business-group",key:`${node.query.root}--${node.id}`};
    return {kind:"business-root",key:node.query.root};
  }
  return {kind:"home-or-root",key:node.id};
}
const nextPaint=()=>new Promise<void>(resolve=>{
  let complete=false;
  let fallback:ReturnType<typeof setTimeout> | null=null;
  const finish=()=>{
    if(complete)return;
    complete=true;
    if(fallback!==null)clearTimeout(fallback);
    resolve();
  };
  fallback=setTimeout(finish,80);
  if(typeof requestAnimationFrame==="function")requestAnimationFrame(finish);
});

export default function CityGatewayScreen({ initialRoot }: { initialRoot?: string }) {
  const { t, i18n } = useTranslation();
  const { t: city } = useTranslation("city");
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const { user, loading: authLoading } = useAuth();
  const {mapBase,mapBaseRevision}=useMapBounds();
  const { livePosition, userOrigin } = useLocation();
  const hasConfirmedOrigin = validOrigin(userOrigin);
  const locating = false; // The shared popup owns permission-request busy/error state.
  const [locationPopup, setLocationPopup] = useState(false);
  const { height, width } = useWindowDimensions();
  const [tree, setTree] = useState<CategoryGroup[]>([]);
  const [publicTree, setPublicTree] = useState<PublicServiceCategory | null>(null);
  const [taxonomyError, setTaxonomyError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [path, setPath] = useState<GatewayNode[]>([]);
  const [startRoot, setStartRoot] = useState(initialRoot);
  const [bounds, setBounds] = useState<CityBounds>(MAGDEBURG_BOUNDS);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DirectoryEntity | null>(null);
  const [detailBack, setDetailBack] = useState<DirectoryEntity[]>([]);
  const nearbyOrigin=selected?.type==="stop" && selected.latitude!=null && selected.longitude!=null
    ? {latitude:selected.latitude,longitude:selected.longitude,name:selected.title,kind:"manual" as const} : userOrigin;
  const nearbyOriginRequestKey=validOrigin(nearbyOrigin)
    ? `${nearbyOrigin.latitude.toFixed(3)}:${nearbyOrigin.longitude.toFixed(3)}:${selected?.type==="stop" ? `${selected.id}:${selected.facts?.platform_id || ""}` : "origin"}` : null;
  const nearbyFleetScopeKey=nearbyOriginRequestKey;
  const nearbyQueryBounds=useMemo(()=>validOrigin(nearbyOrigin) ? nearbyScopeBounds(nearbyOrigin) : MAGDEBURG_BOUNDS,
    [nearbyOriginRequestKey]);
  // Live fleet, refreshed on the locator cadence. Directory results never
  // refetch for this: pins move without abrupt list/map reloads.
  const [liveVehicles, setLiveVehicles] = useState<LiveVehicle[]>([]);
  const [liveStops, setLiveStops] = useState<TransitStopMarker[]>([]);
  const [mapStops, setMapStops] = useState<TransitStopMarker[]>([]);
  const [transitLines, setTransitLines] = useState<V2MapLine[]>([]);
  const [scheduleManifests, setScheduleManifests] = useState<V2SourceManifest[]>([]);
  const [mapInfoExpanded, setMapInfoExpanded] = useState(false);
  const [fleetLoaded, setFleetLoaded] = useState(false);
  const [fleetBatchLoadedKey,setFleetBatchLoadedKey]=useState("");
  const [stopsLoaded, setStopsLoaded] = useState(false);
  const [nearbyLinesLoaded, setNearbyLinesLoaded] = useState(false);
  const nearbyFleetReadyKey=useRef<string | null>(null);
  const [stopsError,setStopsError] = useState(false);
  const [nearbyLinesError,setNearbyLinesError] = useState(false);
  const [stopsRetry,setStopsRetry] = useState(0);
  const [nearbyDepartures,setNearbyDepartures] = useState<Record<string,ServingBus[]>>({});
  const nearbyDeparturesRef=useRef<Record<string,ServingBus[]>>({});
  // Destination search (address/place/stop, not map-point bound): debounced,
  // stale-guarded, single dropdown. Selecting centers the same map.
  type PlaceSuggestion = { id: string; title: string; sub?: string | null; latitude: number; longitude: number; kind: string };
  const [destination, setDestination] = useState<PlaceSuggestion | null>(null);
  const journey = useGatewayJourney(destination, userOrigin);
  const onNearbyArrivals=useCallback((key:string,rows:ServingBus[],visibleCount?:number)=>{
    const nextRows=visibleCount==null?rows:rows.slice(0,visibleCount);
    const previous=nearbyDeparturesRef.current;
    const previousKey=departureBatchKey(previous[key] || []),nextKey=departureBatchKey(nextRows);
    if(previousKey!==nextKey){setFleetLoaded(false);setFleetBatchLoadedKey("");}
    const next={...previous};
    if(nextRows.length)next[key]=nextRows;else delete next[key];
    nearbyDeparturesRef.current=next;
    setNearbyDepartures(next);
  },[]);
  const nearestStops = useMemo(()=>hasConfirmedOrigin ? nearestTransitStops(liveStops,nearbyOrigin,1,APP_NEARBY_STOP_RADIUS_M) : [],
    [liveStops,hasConfirmedOrigin,nearbyOriginRequestKey]);
  const nearestRouteKeys = useMemo(()=>new Set(nearestStops.flatMap(({stop})=>(stop.routes || [])
    .filter(route=>route.mode==="bus"||route.mode==="tram").map(route=>transitRouteKey(route.mode,route.route_number)))),[nearestStops]);
  const nearbyTransitLines = useMemo(()=>transitLines.filter(line=>nearestRouteKeys.has(transitRouteKey(line.mode,line.route_number))),[transitLines,nearestRouteKeys]);
  const nearbyDepartureRows=useMemo(()=>Object.values(nearbyDepartures).flat(),[nearbyDepartures]);
  const nearbyVehicleBatchKey=useMemo(()=>departureBatchKey(nearbyDepartureRows),[nearbyDepartureRows]);
  const nearbyVehicleIds=useMemo(()=>departureVehicleIds(nearbyDepartureRows),[nearbyVehicleBatchKey]);
  const nearbyPositionPatternIds=useMemo(()=>[...new Set(nearbyDepartureRows
    .filter(row=>row.vehicle_link_basis==="VERIFIED_BLOCK_PREDECESSOR")
    .map(row=>String(row.position_pattern_id || "")).filter(Boolean))].sort(),[nearbyDepartureRows]);
  const nearbyPositionPatternKey=JSON.stringify(nearbyPositionPatternIds);
  const pendingDepartureGeometry=useMemo(()=>nearbyDepartureRows.some(row=>{
    if(row.vehicle_link_basis!=="VERIFIED_BLOCK_PREDECESSOR" || !row.position_trip_id
      || !row.position_trip_instance_id || !row.position_pattern_id)return false;
    const vehicle=liveVehicles.find(v=>v.vehicle_id===row.vehicle_id && v.trip_id===row.position_trip_id
      && v.trip_instance_id===row.position_trip_instance_id && v.network_version_id===row.network_version_id
      && v.service_date===row.service_date && v.pattern_id===row.position_pattern_id);
    return !!vehicle && vehicle.motion?.model==="TIME_NORMALIZED_VISUAL_ESTIMATE"
      && !visualGeometryReady(vehicle,transitLines);
  }),[nearbyDepartureRows,liveVehicles,transitLines]);
  const nearbyBoardVehicleIds=useMemo(()=>new Set(nearbyDepartureRows
    .map(row=>vehicleForDeparture(row,liveVehicles,transitLines)?.vehicle_id).filter((id):id is string=>!!id)),
     [nearbyDepartureRows,liveVehicles,transitLines]);
  const approachLines = useMemo(()=>{
    const result:{points:{latitude:number;longitude:number}[];color:string;weight:number;opacity:number}[]=[];
    for(const vehicle of liveVehicles){
      if(!nearbyBoardVehicleIds.has(vehicle.vehicle_id))continue;
      if(!vehicle.estimated || vehicle.motion?.model!=="TIME_NORMALIZED_VISUAL_ESTIMATE"
        || vehicle.motion.publication_status!=="READY" || !vehicle.next_stop_id || vehicle.progress_m==null
        || vehicle.distance_to_next_stop_m==null || !vehicle.motion.preview)continue;
      const stop=nearestStops.find(({stop:place})=>(place.stop_ids || [place.stop_id]).map(String).includes(String(vehicle.next_stop_id)));
      if(!stop)continue;
      const line=transitLines.find(item=>item.valid===true && item.pattern_id===vehicle.pattern_id && item.mode===vehicle.mode
        && item.network_version_id===vehicle.network_version_id && item.service_date===vehicle.service_date
        && item.approach_geometry_fingerprint===vehicle.motion?.geometry_fingerprint
        && (item.stops || []).some(row=>String(row.stop_id)===String(vehicle.next_stop_id)));
      if(!line || !visualGeometryReady(vehicle,transitLines))continue;
      const targetM=vehicle.motion.preview.stop_progress_m,fromM=vehicle.progress_m;
      if(!Number.isFinite(targetM) || targetM<=fromM || Math.abs((targetM-fromM)-vehicle.distance_to_next_stop_m)>2)continue;
      const points=sliceVisualPath(line.points,fromM,targetM);
      if(points.length>=2)result.push({points,color:"#16A34A",weight:6,opacity:0.95});
    }
    return result;
  },[liveVehicles,nearestStops,transitLines,nearbyBoardVehicleIds]);
  const planLines = useMemo(() => [...journeyPlanLines(journey.plan),...approachLines], [journey.plan,approachLines]);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [mapFocus, setMapFocus] = useState<{ latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null>(null);
  const originFocusApplied=useRef(false);
  const focusPoint = useCallback((point: { latitude: number; longitude: number }) => {
    setMapFocus({ latitude: point.latitude, longitude: point.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 });
    setFocusToken(token => token + 1);
    originFocusApplied.current=true;
  }, []);
  useEffect(()=>{
    if(!hasConfirmedOrigin){originFocusApplied.current=false;return;}
    if(!originFocusApplied.current)focusPoint(userOrigin);
  },[hasConfirmedOrigin,userOrigin?.kind,focusPoint]);
  useEffect(()=>{
    if(!mapBaseRevision || hasConfirmedOrigin)return;
    setMapFocus({latitude:mapBase.latitude,longitude:mapBase.longitude,latitudeDelta:mapBase.latitudeDelta,longitudeDelta:mapBase.longitudeDelta});
    setBounds(mapBaseBounds(mapBase));setFocusToken(value=>value+1);
  },[mapBaseRevision,mapBase,hasConfirmedOrigin]);
  useEffect(() => {
    if (!hasConfirmedOrigin) { setSuggestions([]); setSuggesting(false); return; }
    const q = search.trim();
    if (q.length < 3) { setSuggestions([]); setSuggesting(false); return; }
    let active = true;
    setSuggesting(true);
    const timer = setTimeout(() => {
      searchPlaces(null, q).then(res => {
        if (!active) return;
        const items: PlaceSuggestion[] = [
          ...(res.places || []).filter(p => p.lat != null && p.lng != null).map(p => ({ id: `place:${p.name}:${p.lat},${p.lng}`, title: p.name, sub: p.address ?? null, latitude: p.lat as number, longitude: p.lng as number, kind: "place" })),
          ...(res.stops || []).filter(p => p.lat != null && p.lng != null).map(p => ({ id: `stopplace:${p.stop_id}`, title: p.name, sub: null, latitude: p.lat as number, longitude: p.lng as number, kind: "stop" })),
          ...(res.streets || []).filter(p => p.lat != null && p.lng != null).map(p => ({ id: `street:${p.name}`, title: p.name, sub: p.address ?? null, latitude: p.lat as number, longitude: p.lng as number, kind: "street" })),
        ];
        setSuggestions(items.slice(0, 8));
        setSuggesting(false);
      }).catch(() => { if (active) { setSuggestions([]); setSuggesting(false); } });
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [search,hasConfirmedOrigin]);
  useEffect(()=>{
    if(!hasConfirmedOrigin){setMapStops([]);return;}
    let active=true;
    getTransitStops(null).then(rows=>{if(active)setMapStops(rows);}).catch(()=>{if(active)setMapStops([]);});
    return()=>{active=false;};
  },[hasConfirmedOrigin]);
  useEffect(() => {
    const queryOrigin=nearbyOrigin;
    if (!hasConfirmedOrigin || !validOrigin(queryOrigin) || !nearbyLinesLoaded
        || nearbyFleetReadyKey.current!==nearbyFleetScopeKey || !nearbyVehicleIds.length) return;
    let initialSync = true;
    const batchKey=nearbyVehicleBatchKey;
    return startFleetPolling({
      load: async () => {
        const vehicles = await getNearbyVehicles(null, queryOrigin, nearbyQueryBounds, initialSync, nearbyVehicleIds);
        if (vehicles.some(v => v.latitude != null && (!v.estimated || v.motion?.publication_status === 'READY'))) initialSync = false;
        return vehicles;
      },
      publish: vehicles => {
        const waitForGeometry=nearbyDepartureRows.some(row=>{
          if(row.vehicle_link_basis!=="VERIFIED_BLOCK_PREDECESSOR" || !row.position_trip_id
            || !row.position_trip_instance_id || !row.position_pattern_id)return false;
          const vehicle=vehicles.find(v=>v.vehicle_id===row.vehicle_id && v.trip_id===row.position_trip_id
            && v.trip_instance_id===row.position_trip_instance_id && v.network_version_id===row.network_version_id
            && v.service_date===row.service_date && v.pattern_id===row.position_pattern_id);
          return !!vehicle && vehicle.motion?.model==="TIME_NORMALIZED_VISUAL_ESTIMATE"
            && !visualGeometryReady(vehicle,transitLines);
        });
        setLiveVehicles(vehicles);setFleetLoaded(true);setFleetBatchLoadedKey(waitForGeometry?"":batchKey);
      },
      intervalMs: 8000,
      subscribeRefresh: subscribeVisualRefresh,
    });
  }, [hasConfirmedOrigin,nearbyLinesLoaded,nearbyFleetScopeKey,nearbyOriginRequestKey,nearbyQueryBounds,
    nearbyVehicleBatchKey,nearbyVehicleIds,pendingDepartureGeometry]);
  useEffect(()=>{
    if(fleetLoaded && nearbyVehicleBatchKey && nearbyVehicleIds.length && !pendingDepartureGeometry)
      setFleetBatchLoadedKey(nearbyVehicleBatchKey);
  },[fleetLoaded,nearbyVehicleBatchKey,nearbyVehicleIds.length,pendingDepartureGeometry]);
  useEffect(()=>{
    if(hasConfirmedOrigin && nearbyLinesLoaded && nearbyFleetReadyKey.current===nearbyFleetScopeKey && !nearbyVehicleIds.length){
      setFleetLoaded(true);setFleetBatchLoadedKey(nearbyVehicleBatchKey);
    }
  },[hasConfirmedOrigin,nearbyFleetScopeKey,nearbyLinesLoaded,nearbyVehicleBatchKey,nearbyVehicleIds.length]);
  useEffect(() => {
    if (!hasConfirmedOrigin) {
      nearbyFleetReadyKey.current=null;
      setLiveStops([]);setStopsLoaded(false);setNearbyLinesLoaded(false);setStopsError(false);setNearbyLinesError(false);
      setTransitLines([]);setScheduleManifests([]);setLiveVehicles([]);setFleetLoaded(false);
      setFleetBatchLoadedKey("");setMapStops([]);nearbyDeparturesRef.current={};setNearbyDepartures({});
      return;
    }
    if(!validOrigin(nearbyOrigin)){
      nearbyFleetReadyKey.current=null;
      setLiveStops([]);setTransitLines([]);setScheduleManifests([]);
      setLiveVehicles([]);setFleetLoaded(false);
      setStopsLoaded(false);setNearbyLinesLoaded(false);setStopsError(false);setNearbyLinesError(false);
      return;
    }
    const queryOrigin=nearbyOrigin;
    let active=true;
    nearbyFleetReadyKey.current=null;
    // Never keep vehicles from the previous anchor/viewport visible while its
    // new stop-scoped fleet snapshot is being assembled.
    setLiveVehicles([]);setFleetLoaded(false);setFleetBatchLoadedKey("");
    nearbyDeparturesRef.current={};setNearbyDepartures({});
    setStopsError(false);setNearbyLinesError(false);setStopsLoaded(false);setNearbyLinesLoaded(false);
    const timer=setTimeout(()=>{
      void (async()=>{
        try{
          const firstStage=await getNearbyStops(null,queryOrigin,nearbyQueryBounds,{limit:1,radiusM:APP_NEARBY_STOP_RADIUS_M});
          if(!active)return;
          const rows=(firstStage.stops || []).slice(0,1);
          setLiveStops(rows);setStopsLoaded(true);
          if(!rows.length){setTransitLines([]);setScheduleManifests([]);setLiveVehicles([]);setFleetLoaded(true);setNearbyLinesLoaded(true);return;}
          // Let the nearest station's first two departures paint before loading
          // its route geometry and then the exact vehicles for those rows.
          await nextPaint();if(!active)return;
        }catch{if(active)setStopsError(true);return;}
        try{
          const nearbyLines=await getNearbyMap(null,queryOrigin,nearbyQueryBounds,{limit:1,radiusM:APP_NEARBY_STOP_RADIUS_M});
          if(active){nearbyFleetReadyKey.current=nearbyFleetScopeKey;setTransitLines(nearbyLines.lines || []);
            setScheduleManifests(nearbyLines.source_manifests || []);setNearbyLinesLoaded(true);setNearbyLinesError(false);}
        }catch{if(active)setNearbyLinesError(true);}
      })();
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[hasConfirmedOrigin,nearbyFleetScopeKey,nearbyOriginRequestKey,nearbyQueryBounds,stopsRetry]);
  const geometryAttempts = useRef(new Set<string>());
  const [geometryRefresh, setGeometryRefresh] = useState(0);
  useEffect(() => {
    const missing = missingVisualGeometryKeys(liveVehicles, transitLines).filter(key => !geometryAttempts.current.has(key));
    if (!missing.length) return;
    missing.forEach(key => geometryAttempts.current.add(key));
    setGeometryRefresh(value => value+1);
  }, [liveVehicles, transitLines]);
  useEffect(() => {
    // Periodically refresh only this station's relevant route geometry.
    const queryOrigin=nearbyOrigin;
    if (!hasConfirmedOrigin || !validOrigin(queryOrigin) || !nearbyLinesLoaded
        || nearbyFleetReadyKey.current!==nearbyFleetScopeKey) return;
    return startFleetPolling({ intervalMs: 300000, load: () => getNearbyMap(null,queryOrigin,nearbyQueryBounds,
      {limit:1,radiusM:APP_NEARBY_STOP_RADIUS_M,force:geometryRefresh>0,positionPatternIds:nearbyPositionPatternIds}).catch(error => {
      geometryAttempts.current.clear(); throw error;
    }), publish: map => {
      setTransitLines(map.lines || []);
      setScheduleManifests(map.source_manifests || []);
    } });
  }, [geometryRefresh,hasConfirmedOrigin,nearbyOriginRequestKey,nearbyFleetScopeKey,nearbyLinesLoaded,
    nearbyQueryBounds,nearbyPositionPatternKey]);
  const categories = useMemo(() => localizeGatewayNodes(gatewayCategories(tree, publicTree, slug => translateCategory(slug, t), language), t, city), [tree, publicTree, t, city, language]);
  const rootNode = startRoot ? categories.find(c => c.id === startRoot) : undefined;
  const resolvedPath: GatewayNode[] = [];
  let current = rootNode;
  let branch = rootNode?.children || categories;
  for (const saved of path) {
    current = branch.find(node => node.id === saved.id) || saved;
    resolvedPath.push(current);
    branch = current.children || [];
  }
  const query = current?.query || { kinds: [], publicOnly: true, publicCategory: "public-services" };
  // The separately polled fleet/stops below are also the list's source. Do
  // not fetch them again when the viewport, query or pagination changes.
  const discovery = useCityDiscovery(query, bounds, "", false,hasConfirmedOrigin && nearbyLinesLoaded);
  const showMobility = !current || !!query.mobilityOnly;
  const effectiveMode: MobilityMode = showMobility
    ? (["bus", "tram", "taxi"].includes(query.mobilityMode || "") ? query.mobilityMode as MobilityMode : "all")
    : "all";
  const mobilityItems = useMemo((): DirectoryEntity[] => {
    if (!showMobility) return [];
    const items: DirectoryEntity[] = [
      ...liveVehicles.filter(v => effectiveMode === "all" || v.mode === effectiveMode).map(v => ({ id: `mobility:${v.vehicle_id}`, type: v.mode,
        title: `${v.mode} ${v.display_route_number || v.route_number || v.name}`,
        latitude: v.latitude, longitude: v.longitude, description: v.route_direction,
        facts: { source: v.position_source || "", updated_at: v.updated_at,
          assurance: v.estimated ? (v.motion?.continuation_state === "EXPIRED"
            ? "Εκτίμηση PERIX σε αναμονή — όχι μετρημένο GPS"
            : v.motion?.continuation_state === "ESTIMATED"
              ? "Ελεγχόμενη εκτιμώμενη συνέχεια PERIX — όχι μετρημένο GPS ή νέα πρόβλεψη"
              : "Εκτιμώμενη θέση — όχι μετρημένο GPS") : (v.position_quality || "") } })),
      ...liveStops.filter(s => stopMatchesMode(s, effectiveMode)).map(s => ({ id: `stop:${s.stop_id}`, type: "stop" as const, title: s.name,
        latitude: s.latitude, longitude: s.longitude, facts: { routes: (s.routes || []).map(r => r.route_number).join(", ") } })),
    ];
    const text=search.trim().toLocaleLowerCase();
    return items.filter(r => (query.mobilityMode !== "stop" || r.type === "stop")
      && r.latitude != null && r.longitude != null && r.latitude>=bounds.minLat && r.latitude<=bounds.maxLat
      && r.longitude>=bounds.minLng && r.longitude<=bounds.maxLng && (!text || r.title.toLocaleLowerCase().includes(text)));
  }, [showMobility, liveVehicles, liveStops, query.mobilityMode, effectiveMode, bounds, search]);
  const discoveryItems = useMemo(() => [...discovery.items, ...mobilityItems], [discovery.items, mobilityItems]);
  const resultItems = (current?.query.mobilityOnly ? discoveryItems : discovery.items)
    .filter(entity => entity.type !== "stop" && (current?.query.mobilityOnly || !["bus", "tram", "taxi"].includes(entity.type)));
  const empty = !!current && (!showMobility || (fleetLoaded && nearbyLinesLoaded))
    && confirmedEmpty({ ...discovery, items: discoveryItems });
  const rootId = current?.query.publicCategory?.startsWith("ps:sos") ? "sos" : startRoot || resolvedPath[0]?.id;
  const visibleCategories = current ? (current.children || []) : categories;
  const emptyIndex = Math.max(0, CITY_ROOT_IDS.indexOf(rootId as typeof CITY_ROOT_IDS[number]));
  const allCategories = () => { setPath([]); setStartRoot(undefined); setSelected(null); setDestination(null); };
  const back = () => { if (path.length) setPath(path.slice(0, -1)); else setStartRoot(undefined); setSelected(null); setDestination(null); };
  useEffect(() => {
    if(!hasConfirmedOrigin)return;
    let active = true;
    setTaxonomyError(false);
    Promise.allSettled([apiRequest<{ categories: CategoryGroup[] }>("/businesses/category-tree", "GET"), getPublicServiceTaxonomy()]).then(([businesses, services]) => {
      if (!active) return;
      if (businesses.status === "fulfilled") setTree(businesses.value.categories);
      if (services.status === "fulfilled") setPublicTree(services.value);
      setTaxonomyError(businesses.status === "rejected" || services.status === "rejected");
    });
    return () => { active = false; };
  }, [retry,hasConfirmedOrigin]);
  // Keep the actual map node and initial camera stable through all filter changes.
  // Directory pins exclude live fleet/stops: vehicles refresh on their own
  // poll while stops render as zoom-aware transit pins, like the main map.
  const inBounds = useCallback((lat?: number | null, lng?: number | null) =>
    lat != null && lng != null && lat >= bounds.minLat && lat <= bounds.maxLat
      && lng >= bounds.minLng && lng <= bounds.maxLng, [bounds]);
   const placeMarkers = useMemo(() => discoveryItems.filter(r => r.type !== "bus" && r.type !== "tram" && r.type !== "taxi" && r.type !== "stop")
     .filter(r=>!destination || `${r.type}:${r.id}`!==destination.id)
    .filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
     .map(r => ({ id: `${r.type}:${r.id}`, latitude: r.latitude!, longitude: r.longitude!, title: r.title,
       type: (r.type === "public_service" ? "service" : ["business", "event", "activity", "job", "rental", "product", "home", "service"].includes(r.type) ? r.type : "rental") as "service",
        pinColor: gatewayEntityColor(r), pinImage: markerProfileImage(r) })), [discoveryItems,destination?.id]);
  const vehicleMarkers = useMemo(() => liveVehicles
    .filter(v => effectiveMode === "all" || v.mode === effectiveMode)
    .filter(v => v.latitude != null && v.longitude != null && inBounds(v.latitude, v.longitude) && (v.mode === "bus" || v.mode === "tram"))
    .filter(v => nearestRouteKeys.has(transitRouteKey(v.mode,v.route_number)))
    .filter(v => visualGeometryReady(v, transitLines))
    .map(v => {
      const line = transitLines.find(l => !!v.pattern_id && !!v.network_version_id && !!v.service_date
        && l.pattern_id === v.pattern_id && l.mode === v.mode && l.valid === true
        && l.network_version_id === v.network_version_id && l.service_date === v.service_date);
      return { id: `mobility:${v.vehicle_id}`, latitude: v.latitude!, longitude: v.longitude!, title: `${v.mode} ${v.route_number || v.name}`,
      type: v.mode as "bus" | "tram" | "taxi", pinColor: GATEWAY_ENTITY_COLORS[v.mode] ?? "#216BA2",
       estimated: v.estimated ?? false, label: v.route_number, heading: v.heading, positionState: v.position_state,
       visualEstimate: v.motion?.model === "TIME_NORMALIZED_VISUAL_ESTIMATE",
      journeyId: v.trip_instance_id, publicationStatus: v.motion?.publication_status,
      patternId: v.pattern_id, planRevision: v.motion_plan_revision, estimateRevision: v.estimate_revision,
      progressM: v.progress_m, motionPreview: v.motion?.preview, nextTimelineIndex: v.next_timeline_index,
      distanceToNextStopM: v.distance_to_next_stop_m, nextStopEtaSeconds: v.next_stop_eta_seconds,
       geometryFingerprint: line?.approach_geometry_fingerprint, path: line?.points }; }), [liveVehicles, inBounds, transitLines, effectiveMode,nearestRouteKeys]);
   // Destination is a regular place marker, never the live user's avatar pin.
   const markers = useMemo(() => [...placeMarkers, ...vehicleMarkers,
      ...(userOrigin?.kind === "manual" ? [{id:"gateway-user-origin",latitude:userOrigin.latitude,longitude:userOrigin.longitude,
        title:userOrigin.name || t("mobility.manualLocation","Entered location"),pinColor:theme.blue}] : []), ...(destination ? [{
      id: "gateway-destination", latitude: destination.latitude, longitude: destination.longitude,
       title: destination.title, pinColor: theme.blue, selectionCompass: true,
      }] : [])].filter((marker,index,all)=>!(marker as {selectionCompass?:boolean}).selectionCompass
        || all.findIndex(other=>(other as {selectionCompass?:boolean}).selectionCompass)===index),
      [placeMarkers, vehicleMarkers, destination, userOrigin, t]);
  // Resolve actual boarding platforms before mode/viewport filtering, using
  // the existing shared resolver rather than guessing from the parent place.
    const transitStops = useMemo(() => transitStopPins(mapStops)
     .filter(s => stopMatchesMode(s, effectiveMode))
    .filter(s => inBounds(s.latitude, s.longitude))
    .map(s => {
       const routes = (s.routes || []).filter(r => (r.mode === "bus" || r.mode === "tram") && (effectiveMode === "all" || r.mode === effectiveMode));
      // Physical mode survives a dated service change; routes describe today.
       const modes = (s.modes || []).filter(mode => (mode === 'bus' || mode === 'tram') && (effectiveMode === "all" || mode === effectiveMode));
       return { stop_id: String(s.stop_id), physical_stop_id: s.physical_stop_id, platform_id: s.platform_id,
         name: s.name, latitude: s.latitude!, longitude: s.longitude!,
        modes,
         platforms: s.platforms,
        routes: routes.map(r => ({ route_number: r.route_number, mode: r.mode as "bus" | "tram" })) };
      }), [mapStops, inBounds, effectiveMode]);
  const onBounds = useCallback((next: CityBounds) => {
    if (![next.minLat, next.maxLat, next.minLng, next.maxLng].every(Number.isFinite)) return;
    setBounds(prev => Object.keys(prev).every(key => Math.abs(prev[key as keyof CityBounds] - next[key as keyof CityBounds]) < 0.000001) ? prev : next);
  }, []);
  const select = (entity: DirectoryEntity) => { setSelected(entity); setDetailBack([]); };
   const selectDestination = useCallback((s: PlaceSuggestion) => {
     setDestination(s);
     setSelected(null);setDetailBack([]);setSearch("");
     journey.retry();
     setSuggestions([]);
     focusPoint(s);
  }, [focusPoint, journey.retry]);
  const selectPlace = (entity: DirectoryEntity) => {
    select(entity);
    if (entity.type === "stop") {
      setDestination(null);
      if(entity.latitude!=null && entity.longitude!=null)focusPoint({latitude:entity.latitude,longitude:entity.longitude});
      return;
    }
    if (entity.latitude != null && entity.longitude != null && validDirectionsPoint({latitude:entity.latitude,longitude:entity.longitude})) {
      selectDestination({id:`${entity.type}:${entity.id}`,title:entity.title,sub:entity.address,
        latitude:entity.latitude,longitude:entity.longitude,kind:"place"});
    }
  };
  const closeDestination = (clearSearch=true) => {
    setDestination(null);setSelected(null);setDetailBack([]);setSuggestions([]);
    if(clearSearch)setSearch("");
  };
  const selectLive = useCallback((id: string) => {
    const v = liveVehicles.find(x => `mobility:${x.vehicle_id}` === id);
    if (v && v.latitude != null && v.longitude != null) {
      select({ id: `mobility:${v.vehicle_id}`, type: v.mode as DirectoryEntity["type"],
        title: `${v.mode} ${v.route_number || v.name}`, description: v.route_direction || undefined,
        latitude: v.latitude, longitude: v.longitude } as DirectoryEntity);
    }
  }, [liveVehicles]);
  const choose = (node: GatewayNode) => {
    if (node.action === "login") { if (!authLoading) router.push((user ? "/home" : "/login") as never); return; }
    setPath([...resolvedPath, node]);
    closeDestination(); setSearch(""); setSuggestions([]);
  };
  const columns = width > 1100 ? 4 : width > 760 ? 3 : 2;
  const compact = height < 500;
  const headerHeight = mapHeaderMetrics(width).compact?116:68;
  const mapWidth=Math.max(160,Math.min(width,MAP_PAGE_MAX_WIDTH)-MAP_PAGE_GUTTER*2);
  const availableMapHeight=Math.max(110,height-headerHeight);
  const preferredMapHeight=availableMapHeight*(compact?0.42:0.54);
  const mapHeight=Math.max(110,Math.min(preferredMapHeight,width<600?mapWidth*0.75:preferredMapHeight));
  const originMapZoom=initialNearbyMapZoom(mapWidth,mapHeight,userOrigin?.latitude ?? INITIAL_REGION.latitude,300,850,18);
  const initialMapRegion=mapFocus || (hasConfirmedOrigin ? {latitude:userOrigin.latitude,longitude:userOrigin.longitude,
    latitudeDelta:0.02,longitudeDelta:0.02} : INITIAL_REGION);
  return <SafeAreaView style={styles.page} edges={['top']}>
     <MapScreenHeader publicScreen brand={compactHeader=><View testID="city-centered-brand"><PerixLogo size={compactHeader?'mobileHeader':'compact'} variant="english" /></View>} right={<CityLanguagePicker />} />
    <ScrollView style={styles.lower} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {!hasConfirmedOrigin ? <View testID="city-origin-gate" style={styles.originGate}>
        <Text style={styles.heading}>{t("mobility.confirmOrigin", "Choose your location first")}</Text>
        <NearbyTransitSection originEditorOnly stops={[]} stopsLoaded onOriginSelect={focusPoint} />
      </View> : <>
      <View testID="city-search-bar" style={styles.searchBar}>
        <Ionicons name="search-outline" size={21} color={theme.blue} />
        <TextInput value={search} onChangeText={value => { setSearch(value); closeDestination(false); }} accessibilityLabel={t("mobility.whereToGo", "Where do you want to go?")}
          placeholder={t("mobility.whereToGo", "Where do you want to go?")} placeholderTextColor={COLORS.textMuted} style={styles.input} />
        {!!search && <Pressable accessibilityRole="button" accessibilityLabel={city("ui.clear")} style={styles.clearSearch} onPress={() => closeDestination()}><Ionicons name="close" size={20} color={theme.blue} /></Pressable>}
      </View>
      {suggesting && <Text style={styles.hint}>…</Text>}
      {suggestions.length > 0 && <View testID="city-suggestions" style={styles.result}>
        {suggestions.map(s => (
          <Pressable key={s.id} accessibilityRole="button" onPress={() => selectDestination(s)} style={styles.suggestion}>
            <Ionicons name={s.kind === "stop" ? "train-outline" : s.kind === "street" ? "navigate-outline" : "location-outline"} size={18} color={theme.blue} />
            <View style={styles.suggestionText}><Text style={styles.tileTitle}>{s.title}</Text>{!!s.sub && <Text style={styles.note} numberOfLines={1}>{s.sub}</Text>}</View>
          </Pressable>))}
      </View>}
      <View testID="city-map-frame" style={{ height: mapHeight, flexShrink: 0, marginTop: 12 }}>
        <BusinessMap initialRegion={initialMapRegion} markers={markers} height={mapHeight} horizontalInset={0} showUserLocation={!!livePosition}
          focusZoom={originMapZoom} authoritativeTransit
          userPinImage={user?.profile_photo || user?.picture || undefined} userPinName={user?.name}
          transitLines={distinctGeometryLines(nearbyTransitLines).filter(line => effectiveMode === "all" || line.mode === effectiveMode).map(line => ({
            points: line.points, routeNumber: line.route_number,
            color: line.mode === 'tram' ? '#8B0000' : '#1E3A8A',
            opacity: line.service_active === false ? 0.1 : 0.22, weight: 2,
          }))}
          transitStops={transitStops}
          planLines={planLines}
          focusRegion={mapFocus}
          focusToken={focusToken}
          pinLocation={livePosition}
           onMapPress={(latitude, longitude) => {
             if (!validDirectionsPoint({ latitude, longitude })) return;
             selectDestination({ id: `map:${latitude},${longitude}`, title: city("googleDirections.mapPoint"),
               sub: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, latitude, longitude, kind: "place" });
           }}
           onRegionChangeComplete={onBounds} onMarkerPress={id => {
             if (id === "gateway-destination") return;
             const entity = discoveryItems.find(r => `${r.type}:${r.id}` === id); if (entity) selectPlace(entity); else selectLive(id);
           }}
          onTransitStopPress={s => {
            const stop = mapStops.find(item => item.stop_id === s.stop_id) || liveStops.find(item => item.stop_id === s.stop_id);
              if (stop) selectPlace({ id: `stop:${stop.stop_id}`, type: 'stop', title: stop.name,
               latitude: s.latitude, longitude: s.longitude,
               facts: { routes: s.routes.map(r => r.route_number).join(', '), platform_id: s.platform_id || '' } });
            }} />
       <View testID="city-map-border" pointerEvents="none" style={styles.mapBorder} />
        <Pressable testID="city-locate-me" accessibilityRole="button" accessibilityLabel={t("mobility.changeLocation", "Change location")}
          accessibilityState={{ expanded: locationPopup }} onPress={()=>setLocationPopup(true)} style={styles.locateButton}>
          {locating ? <ActivityIndicator color={theme.blue} /> : <Ionicons name="locate" size={23} color={theme.blue} />}
        </Pressable>
        {hasOsmTransitRouting(transitLines) && <Pressable testID="city-osm-routing-attribution"
          accessibilityRole="link" accessibilityLabel="© OpenStreetMap contributors" style={styles.osmCredit}
          onPress={() => { void Linking.openURL("https://www.openstreetmap.org/copyright").catch(() => {}); }}>
          <Text numberOfLines={1} style={styles.osmCreditText}>© OpenStreetMap contributors</Text>
        </Pressable>}
      </View>
      <View style={styles.mapInfo}>
        <Pressable testID="city-map-info-toggle" accessibilityRole="button" accessibilityState={{expanded:mapInfoExpanded}}
          onPress={()=>setMapInfoExpanded(value=>!value)} style={styles.mapInfoToggle}>
          <Text style={styles.mapInfoTitle}>{t("mobility.mapInfo", "Map & timetable information")}</Text>
          <Ionicons name={mapInfoExpanded ? "chevron-up" : "chevron-down"} size={20} color={theme.blue} />
        </Pressable>
        {mapInfoExpanded && <View testID="city-map-info-panel" style={styles.mapInfoPanel}>
          <TransitSourceNotice />
          {(() => { const schedule = schedulePublisher(scheduleManifests); return schedule && (
            <View testID="city-schedule-attribution" style={styles.mapAttribution}>
              <Text style={styles.attributionText}>{city("schedulePrefix")} </Text>
              <Text accessibilityRole="link" style={[styles.attributionText, styles.attributionLink]}
                onPress={() => { void Linking.openURL(schedule.url).catch(() => {}); }}>
                {schedule.name}
              </Text>
            </View>); })()}
        </View>}
      </View>
      {destination && <View testID="city-destination" style={styles.inlinePanel}>
        <View style={styles.row}><Text style={[styles.tileTitle,{flex:1}]}>{destination.title}</Text>
          <Pressable testID="city-close-destination" accessibilityRole="button" accessibilityLabel={city("ui.close")}
            onPress={()=>closeDestination()} style={styles.button}><Ionicons name="close" size={22} color={theme.blue} /></Pressable></View>
        <GoogleDirectionsPreview key={destination.id} destination={destination} origin={userOrigin}
          onLocate={()=>setLocationPopup(true)} locating={locating} />
        {selected && !["bus","tram","taxi"].includes(selected.type) && <CityInlineDetails entity={selected} bounds={bounds}
          onSelect={selectPlace} />}
      </View>}
      {!stopsLoaded || !nearbyLinesLoaded ? <View testID="city-nearby-loading" style={styles.loadingStops}>
        {stopsError || nearbyLinesError ? <>
          <Text style={styles.hint}>{t(stopsError ? "mobility.nearbyLoadError" : "mobility.nearbyLinesError",
            stopsError ? "Nearby stops could not be loaded." : "Routes for nearby stops could not be loaded.")}</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={()=>setStopsRetry(value=>value+1)}>
            <Text style={styles.blue}>{city("ui.retry")}</Text>
          </Pressable>
        </> : <><ActivityIndicator color={theme.blue} /><Text style={styles.hint}>{t(stopsLoaded ? "mobility.loadingNearbyLines" : "mobility.loadingNearby", stopsLoaded ? "Loading routes for these stops…" : "Finding the closest stops…")}</Text></>}
      </View> : null}
      {nearbyLinesLoaded && !liveStops.length && <Text testID="city-no-nearby-stops" style={styles.hint}>
        {t("mobility.noStopsNearby", "No transit station within {{m}} m of this location.",{m:APP_NEARBY_STOP_RADIUS_M})}
      </Text>}
      {selected?.type === "stop" && <View testID="city-selected-stop-programme" style={styles.inlinePanel}>
        <View style={styles.row}><Text style={[styles.tileTitle,{flex:1}]}>{selected.title}</Text>
          <Pressable testID="city-close-stop-programme" accessibilityRole="button" accessibilityLabel={city("ui.close")}
            onPress={()=>{closeDestination();if(validOrigin(userOrigin))focusPoint(userOrigin);}} style={styles.button}>
            <Ionicons name="close" size={22} color={theme.blue} /></Pressable></View>
        <CityInlineDetails entity={selected} bounds={bounds} transitCatalogue={mapStops} liveVehicles={liveVehicles} transitLines={transitLines}
          onSelect={selectPlace} onArrivalsUpdate={onNearbyArrivals} compactStopBoard initialDepartureLimit={2}
          progressiveDepartures pairOppositeSides fleetBatchLoadedKey={fleetBatchLoadedKey} />
        {selected.latitude != null && selected.longitude != null && <GoogleDirectionsPreview key={selected.id}
          destination={{title:selected.title,latitude:selected.latitude,longitude:selected.longitude}} origin={userOrigin}
          onLocate={()=>setLocationPopup(true)} locating={locating} />}
      </View>}
      {!destination && selected && !["stop","bus","tram","taxi"].includes(selected.type) && <View style={styles.inlinePanel}>
        <Pressable accessibilityRole="button" accessibilityLabel={city("ui.close")} onPress={()=>closeDestination()} style={styles.button}>
          <Ionicons name="close" size={22} color={theme.blue} /></Pressable>
        <CityInlineDetails entity={selected} bounds={bounds} onSelect={selectPlace} />
      </View>}
      {stopsLoaded && !current && !destination && selected?.type!=="stop" && <NearbyTransitSection collapsible initialExpanded hideWhenEmpty
        stopLimit={1} radiusM={APP_NEARBY_STOP_RADIUS_M} progressiveDepartures pairOppositeSides fleetBatchLoadedKey={fleetBatchLoadedKey}
        stops={liveStops} stopsLoaded={stopsLoaded} stopsError={stopsError} liveVehicles={liveVehicles} transitLines={transitLines}
        onArrivalsUpdate={onNearbyArrivals}
        onRetryStops={()=>setStopsRetry(value=>value+1)}
        onOriginSelect={point=>{closeDestination();focusPoint(point);journey.retry();}}
        onSelectStop={stop=>selectPlace({id:`stop:${stop.stop_id}`,type:"stop",title:stop.name,latitude:stop.latitude,longitude:stop.longitude,
          facts:stop.platform_id ? {platform_id:stop.platform_id} : undefined})}
        onDirections={stop=>selectDestination({id:`stopplace:${stop.stop_id}`,title:stop.name,kind:"stop",latitude:stop.latitude,longitude:stop.longitude})} />}
      {current && <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={city("ui.back")} style={styles.button} onPress={back}><Text style={styles.blue}>← {city("ui.back")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={city("ui.all")} style={styles.button} onPress={allCategories}><Ionicons name="grid-outline" size={19} color={theme.blue} /></Pressable>
        {resolvedPath.map((node, i) => <Pressable key={`${i}:${node.id}`} accessibilityRole="button" style={styles.button} onPress={() => setPath(resolvedPath.slice(0, i + 1))}><Text style={styles.blue}>› {node.label}</Text></Pressable>)}
        {resolvedPath.length === 0 && <Text style={styles.tileTitle}>{current.label}</Text>}
      </View>}
      {current?.query.publicCategory?.startsWith("ps:sos") && <View style={styles.result}>
        <Text style={styles.tileTitle}>{city("ui.sosHeading")}</Text>
        {[["112", city("ui.sosRescue")], ["110", city("ui.sosPolice")], ["116117", city("ui.sosMedical")]].map(([number, label]) =>
          <Pressable key={number} accessibilityRole="link" accessibilityLabel={`${city("ui.call")} ${number}: ${label}`} style={styles.button} onPress={() => { void Linking.openURL(`tel:${number}`).catch(() => {}); }}><Text style={styles.blue}>{number} — {label}</Text></Pressable>)}
        <Text style={styles.hint}>{city("ui.sosNote")}</Text>
      </View>}
      {taxonomyError && <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry(n => n + 1)}><Text>{city("ui.taxonomyError")} {city("ui.retry")}</Text></Pressable>}
      {visibleCategories.length>0 && <View testID="city-category-grid" style={styles.grid}>{visibleCategories.map(node => {
        const illustration=gatewayIllustration(node);
        return <View key={node.id} style={{ width: `${100 / columns}%`, padding: 4 }}>
          <Pressable accessibilityRole="button" disabled={node.action === "login" && authLoading} accessibilityLabel={node.label}
            style={[styles.tile,node.id==="public-services"&&styles.publicServiceTile]} onPress={() => choose(node)}>
            {illustration ? <IllustratedIcon kind={illustration.kind} iconKey={illustration.key} size={32}
              fallback={node.icon as keyof typeof Ionicons.glyphMap} color={node.id==="public-services" ? "#59ABE3" : (CATEGORY_COLORS[node.id] ?? gatewayNodeColor(node))} />
              : <Ionicons name={node.icon as keyof typeof Ionicons.glyphMap} size={32} color={CATEGORY_COLORS[node.id] ?? gatewayNodeColor(node)} />}
            <Text style={[styles.tileTitle,node.id==="public-services"&&styles.publicServiceTitle]}>{node.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.gold} style={styles.chevron} />
          </Pressable>
        </View>;
      })}</View>}
      {(resultItems.length > 0 || discovery.hasMore) && <View style={styles.row}><Text style={styles.note}>{city("ui.counts", { results: resultItems.length, pins: markers.length })}</Text><Pressable accessibilityRole="button" style={styles.button} onPress={discovery.retry}><Text style={styles.blue}>{city("ui.refresh")}</Text></Pressable></View>}
      {discovery.loading && <ActivityIndicator color={theme.blue} accessibilityLabel={city("ui.loading")} />}
      {(discovery.error || discovery.partial) && <Pressable accessibilityRole="button" style={styles.button} onPress={discovery.retry}><Text>{city(discovery.error ? `ui.${discovery.error}` : "ui.partialError")} {city("ui.retry")}</Text></Pressable>}
      {empty && <View testID="city-empty-state" accessibilityLiveRegion="polite" style={styles.emptyState}><Ionicons name="time-outline" size={26} color={theme.blue} /><Text style={styles.emptyText}>{city(`empty.${emptyIndex}`)}</Text></View>}
      {resultItems.map(entity => <GatewayResultCard key={`${entity.type}:${entity.id}`} entity={entity} onPress={()=>selectPlace(entity)} />)}
      {discovery.hasMore && <Pressable disabled={discovery.loading} accessibilityRole="button" style={styles.button} onPress={discovery.more}><Text style={styles.blue}>{city("ui.more")}</Text></Pressable>}
      {current?.query.mobilityOnly && <Text style={styles.hint}>{city("ui.mobilityNote")}</Text>}
      </>}
    </ScrollView>
    <MapLocationPopup visible={locationPopup} onClose={()=>setLocationPopup(false)} onOriginSelect={point=>{
      setSelected(null);setDetailBack([]);focusPoint(point);journey.retry();
    }} />
    <Modal visible={!!selected && ["bus","tram","taxi"].includes(selected.type)} transparent animationType="none" onRequestClose={() => setSelected(null)}>
      <View style={styles.scrim}><View accessibilityViewIsModal style={[styles.drawer, { width: Math.min(width, 620) }]}>
        <View style={styles.row}>
          {detailBack.length > 0 && <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setSelected(detailBack[detailBack.length - 1]); setDetailBack(detailBack.slice(0, -1)); }}><Text style={styles.blue}>← {city("ui.back")}</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={city("ui.close")} style={styles.button} onPress={() => setSelected(null)}><Text style={styles.blue}>{city("ui.close")} ✕</Text></Pressable>
        </View>
         <ScrollView>{selected && ["bus","tram","taxi"].includes(selected.type) && <CityInlineDetails entity={selected} bounds={bounds}
           vehicle={liveVehicles.find(v=>`mobility:${v.vehicle_id}`===selected.id) || null} transitLines={transitLines} transitCatalogue={liveStops}
           onSelect={entity => { setDetailBack([...detailBack, selected]); setSelected(entity); }} />}
         </ScrollView>
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: "#fff" }, headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, flexShrink: 0, backgroundColor: "#fff" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  headerLanguage: { justifyContent: "center", flexShrink: 0 },
  city: { color: theme.navy, fontFamily: LOCATOR_FONT_FAMILY.regular, fontSize: FONT_SIZES.micro, lineHeight: 14 }, lower: { flex: 1, minHeight: 0,backgroundColor:MAP_PAGE_BACKGROUND }, content: { padding: MAP_PAGE_GUTTER, paddingTop: 6, gap: 6, maxWidth: MAP_PAGE_MAX_WIDTH, width: "100%", alignSelf: "center",backgroundColor:MAP_PAGE_BACKGROUND },
  originGate: { gap: 10, paddingTop: 12 }, loadingStops: { minHeight: 160, justifyContent: "center", alignItems: "center", gap: 8 },
  mapBorder: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderWidth: 1, borderColor: COLORS.divider, borderRadius: BORDER_RADIUS.md },
   locateButton: { position: "absolute", right: 12, top: 12, width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  stopRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  stopResults: { maxHeight: 208 },
  mapAttribution: { flexDirection: "row", flexWrap: "wrap" },
  attributionText: { color: "#434B54", fontSize: FONT_SIZES.small, lineHeight: 20 },
  attributionLink: { color: theme.blue, textDecorationLine: "underline" },
  osmCredit: { position: "absolute", left: 8, top: 8, maxWidth: "72%", minHeight: 24, justifyContent: "center", paddingHorizontal: 6, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.94)" },
  osmCreditText: { color: "#202124", fontSize: 10, lineHeight: 14, textDecorationLine: "underline" },
  mapInfo: { gap: 2 }, mapInfoToggle: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8 },
  mapInfoTitle: { flex: 1, color: theme.navy, fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold },
  mapInfoPanel: { paddingVertical: 4, gap: 2 },
   heading: { color: theme.navy, fontFamily: LOCATOR_FONT_FAMILY.bold, fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold }, note: { color: "#59616A", fontFamily: LOCATOR_FONT_FAMILY.regular, fontSize: FONT_SIZES.bodySmall, lineHeight: 22 }, hint: { color: "#59616A", fontFamily: LOCATOR_FONT_FAMILY.regular, fontSize: FONT_SIZES.small, lineHeight: 18 }, blue: { color: theme.blue, fontFamily: LOCATOR_FONT_FAMILY.regular },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }, button: { minHeight: 44, padding: 8, justifyContent: "center" }, suggestion: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }, suggestionText: { flex: 1, minWidth: 0, gap: 2 }, grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
    tile: { minHeight: 96, padding: 16, borderRadius: BORDER_RADIUS.lg, backgroundColor: "#fff", gap: 8, alignItems:"center" },
   publicServiceTile: { backgroundColor:"#fff" }, publicServiceTitle:{color:"#59ABE3"},
     tileTitle: { color: theme.navy, fontFamily: LOCATOR_FONT_FAMILY.semibold, fontWeight: FONT_WEIGHTS.semibold, fontSize: FONT_SIZES.bodySmall, textAlign:"center" }, chevron: { position: "absolute", top: 18, right: 12 },
   searchBar: { height: 48, flexShrink: 0, marginHorizontal: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, borderRadius: BORDER_RADIUS.lg, backgroundColor: "#fff" },
  input: { flex: 1, minWidth: 0, height: 44, paddingRight: 12, fontSize: FONT_SIZES.bodySmall, color: theme.navy }, clearSearch: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
   inlinePanel: { paddingVertical: 8, gap: 8, backgroundColor: "#fff" },
   result: { padding: 16, borderRadius: BORDER_RADIUS.lg, backgroundColor: "#fff", gap: 6 },
    emptyState: { padding: 24, borderRadius: BORDER_RADIUS.lg, backgroundColor: "#fff", alignItems: "center", gap: 12 }, emptyText: { color: theme.blue, fontFamily: LOCATOR_FONT_FAMILY.regular, fontSize: FONT_SIZES.bodySmall, lineHeight: 24, textAlign: "center" },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "flex-end", justifyContent: "flex-end" }, drawer: { maxHeight: "92%", backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 20 },
});

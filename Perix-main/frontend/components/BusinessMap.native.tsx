import { useEffect, useRef, useState, useMemo } from "react";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { StyleSheet, View, Text, Pressable, Platform, Image, Modal, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental, Job, Service } from "../lib/api";
import { formatEventDate } from "../lib/formatDate";
import { COLORS } from "../lib/designTokens";
import { isBusinessOpen } from "../lib/openingHours";
import VisualTransitMarker, { VisualMarkerInput } from "./VisualTransitMarker.native";
import { useNativeStationQueue } from "../hooks/city/useNativeStationQueue";
import { mapEntityPinSize, profileInitial, transitStopAppearance } from "../lib/city/mapPresentation";
import { MOBILITY_VIEW_SOURCES, stopMobilityView, vehicleMobilityViewAngle } from "../lib/mobilityViewSources.generated";
import { groupTransitStopIcons } from "../lib/city/visualGeometry";

type MapMarker = VisualMarkerInput & {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  isOpen?: boolean;
  pinColor?: string;
  pinInnerColor?: string;
  pinImage?: string | null;
  selectionCompass?: boolean;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product" | "bus" | "tram" | "taxi";
  heading?: number | null;
  label?: string | null;
  estimated?: boolean;
  visualEstimate?: boolean;
  path?: { latitude: number; longitude: number }[];
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

function VehicleMarkerArt({mode,viewAngle,size,label}:{mode:"bus"|"tram";viewAngle:number;size:number;label?:string|null}){
  return <View style={{width:size,height:size,alignItems:"center",justifyContent:"center"}}>
    <Image source={MOBILITY_VIEW_SOURCES[mode][viewAngle]} resizeMode="contain" style={{width:size,height:size}} />
    {!!label && <Text numberOfLines={1} style={{position:"absolute",bottom:-3,maxWidth:size+8,paddingHorizontal:2,
      borderRadius:3,overflow:"hidden",backgroundColor:"rgba(255,255,255,0.94)",color:mode==="tram"?"#8B0000":"#1E3A8A",
      fontSize:Math.max(7,Math.min(9,size*0.28)),fontWeight:"800",textAlign:"center"}}>{label}</Text>}
  </View>;
}

function DirectoryPinArt({source,size,color,label}:{source:string;size:number;color:string;label?:string|null}){
  const [failed,setFailed]=useState(false);
  return <View accessibilityLabel={label || "Map location"} style={{width:size,height:size,borderRadius:size/2,
    borderWidth:2,borderColor:"#fff",backgroundColor:color,alignItems:"center",justifyContent:"center",
    overflow:"hidden",shadowColor:"#000",shadowOpacity:0.32,shadowRadius:3,shadowOffset:{width:0,height:1},elevation:4}}>
    {failed ? <Text style={{color:"#fff",fontSize:size*0.42,fontWeight:"800"}}>{profileInitial(label)}</Text>
      : <Image source={{uri:source}} resizeMode="cover" onError={()=>setFailed(true)}
        style={{width:size-4,height:size-4,borderRadius:(size-4)/2}} />}
  </View>;
}

type Props = {
  location?: { latitude: number; longitude: number };
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  focusRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  focusToken?: number;
  focusZoom?: number;
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  jobs?: Job[];
  services?: Service[];
  markers?: MapMarker[];
  extraMarkers?: MapMarker[];
  transitLines?: {
    points: { latitude: number; longitude: number }[];
    color: string;
    opacity?: number;
    weight?: number;
    routeNumber?: string;
    patternId?: string;
  }[];
  onTransitLineClick?: (routeNumber: string, patternId?: string) => void;
  transitStops?: {
    platform_id?: string;
    platform_code?: string | null;
    physical_stop_id?: string;
    stop_ids?: string[];
    stop_id: string;
    name: string;
    latitude: number;
    longitude: number;
    modes: ("bus" | "tram")[];
    routes: { route_number: string; mode: "bus" | "tram" }[];
    platforms?: {platform_id:string;platform_code?:string|null;name?:string;latitude?:number|null;longitude?:number|null;
      modes?:('bus'|'tram')[];routes?:string[];directions?:string[]}[];
    platform_ids?: string[];
    platform_codes?: string[];
  }[];
  onTransitStopPress?: (stop: {
    platform_id?: string;
    platform_code?: string | null;
    stop_ids?: string[];
    platform_ids?: string[];
    platform_codes?: string[];
    stop_id: string;
    name: string;
    latitude: number;
    longitude: number;
    modes: ("bus" | "tram")[];
    routes: { route_number: string; mode: "bus" | "tram" }[];
    platforms?: {platform_id:string;platform_code?:string|null;name?:string;latitude?:number|null;longitude?:number|null;
      modes?:('bus'|'tram')[];routes?:string[];directions?:string[]}[];
  }) => void;
  showUserLocation?: boolean;
  planLines?: { points: { latitude: number; longitude: number }[]; color: string; weight?: number; opacity?: number }[];
  userPinImage?: string | null;
  userPinName?: string | null;
  pinLocation?: { latitude: number; longitude: number } | null;
  onRegionChange?: (bounds: MapBounds) => void;
  onRegionChangeComplete?: (bounds: MapBounds) => void;
  onZoomChange?: (zoom: number) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  height?: number;
  horizontalInset?: number;
  disabled?: boolean;
  disabledHint?: string;
  staticMode?: boolean;
};

// Helper function to determine if business is currently open
// (shared logic in lib/openingHours handles timezones and overnight hours)

export default function BusinessMap({
  location,
  initialRegion,
  focusRegion,
  focusToken,
  focusZoom,
  businesses = [],
  events = [],
  activities = [],
  artists = [],
  rentals = [],
  jobs = [] as Job[],
  services = [] as Service[],
  markers,
  extraMarkers,
  transitLines = [],
  onTransitLineClick,
  transitStops = [],
  onTransitStopPress,
  showUserLocation = false,
  planLines = [],
  userPinImage,
  userPinName,
  pinLocation,
  onRegionChange,
  onRegionChangeComplete,
  onZoomChange,
  onMarkerPress,
  onMapPress,
  height,
  horizontalInset = 0,
  disabled = false,
  disabledHint = "Tap to enable location",
  staticMode = false,
}: Props) {
  const generatedMarkers: MapMarker[] = [
    ...businesses
      .filter(b => b.latitude != null && b.longitude != null)
      .map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      description: business.category,
      isOpen: isBusinessOpen(business),
      type: "business" as const,
      pinImage: business.profile_photo || business.logo_image || business.cover_image,
      pinColor: business.root_category === "hotels"
        ? COLORS.pinHotel
        : (isBusinessOpen(business) ? COLORS.pinBusiness : COLORS.pinClosed),
    })),
      ...events
      .filter(e => e.latitude != null && e.longitude != null)
      .map((event) => ({
        id: event.event_id,
        latitude: event.latitude!,
        longitude: event.longitude!,
        title: event.title,
        description: event.location || formatEventDate(event.start_time),
        type: "event" as const,
        pinImage: event.creator?.profile_photo || event.artist?.profile_photo || event.business?.logo_image || event.cover_image_url,
        pinColor: COLORS.pinEvent,
        pinInnerColor: "#FFC400",
      })),
    ...activities
      .filter(a => a.latitude != null && a.longitude != null)
      .map((activity) => ({
        id: activity.activity_id,
        latitude: activity.latitude!,
        longitude: activity.longitude!,
        title: activity.title,
        description: activity.location || `${formatEventDate(activity.date)} ${activity.time || ''}`,
        type: "activity" as const,
        pinImage: activity.creator?.profile_photo || activity.tagged_business?.logo_image || activity.cover_image_url,
        pinColor: COLORS.pinActivity,
        pinInnerColor: "#FFC400",
      })),
    ...artists
      .filter(a => a.latitude != null && a.longitude != null)
      .map((artist) => ({
        id: artist.artist_id,
        latitude: artist.latitude!,
        longitude: artist.longitude!,
        title: artist.name,
        description: artist.town || artist.genres?.join(", ") || "",
        type: "artist" as const,
        pinImage: artist.profile_photo || artist.cover_photo,
        pinColor: COLORS.pinClosed,
      })),
    ...rentals
      .filter(r => r.latitude != null && r.longitude != null)
      .map((rental) => ({
        id: rental.rental_id,
        latitude: rental.latitude!,
        longitude: rental.longitude!,
        title: rental.title,
        description: rental.rent_price || rental.address || "",
        type: "rental" as const,
        pinImage: rental.business_logo || (rental as any).owner_photo || rental.cover_image,
        pinColor: COLORS.pinRental,
      })),
    ...jobs
      .filter(j => j.latitude != null && j.longitude != null)
      .map((job) => ({
        id: job.job_id,
        latitude: job.latitude!,
        longitude: job.longitude!,
        title: job.title,
        description: job.work_location || "",
        type: "job" as const,
        pinImage: (job as any).business_logo,
        pinColor: COLORS.pinJob,
      })),
    ...services
      .filter(s => s.latitude != null && s.longitude != null && s.root_category !== "rentals" && s.root_category !== "rental-real-estate")
      .map((service) => ({
        id: service.service_id,
        latitude: service.latitude!,
        longitude: service.longitude!,
        title: service.name,
        description: service.address || "",
        type: "service" as const,
        pinImage: (service as any).business_logo || service.cover_image_url,
        pinColor: COLORS.pinService,
        pinInnerColor: "#EF4444",
      })),
  ];

  const mapMarkers: MapMarker[] = markers ?? [
    ...generatedMarkers,
    ...(extraMarkers ?? []),
  ];

  const resolvedInitialRegion = initialRegion || (location ? {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  } : undefined);

  const mapRef = useRef<MapView>(null);
  const { t } = useTranslation();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLocationRef = useRef<string>("");
  const readyRef = useRef(false);
  const [selectedGroup, setSelectedGroup] = useState<MapMarker[] | null>(null);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [cameraHeading,setCameraHeading] = useState(0);
  const [pinImageFailed,setPinImageFailed]=useState(false);
  useEffect(()=>setPinImageFailed(false),[userPinImage]);
  const stopAppearance=transitStopAppearance(zoomLevel);
  const groupedTransitStops=useMemo(()=>groupTransitStopIcons(transitStops || []),[transitStops]);
  const nativeQueueSize=20*Math.max(0.8,Math.min(1.7,zoomLevel/12));
  const stationQueue=useNativeStationQueue(mapMarkers,nativeQueueSize,cameraHeading);
  const [enabling, setEnabling] = useState(false);
  const enablingRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => { readyRef.current = true; }, 800);
    return () => clearTimeout(t);
  }, []);

  const groupedMarkers = useMemo(() => {
    // Transit vehicles keep a STABLE identity (vehicle id) - grouping by
    // coordinates would unmount/remount the marker on every position
    // update and cause flicker.
    const pins = new Map<string, MapMarker[]>();
    const transitSingles: MapMarker[] = [];
    mapMarkers.forEach((m) => {
      if (m.type === "bus" || m.type === "tram" || m.type === "taxi") {
        transitSingles.push(m);
        return;
      }
      const key = `${m.selectionCompass ? m.id + ':' : ''}${m.latitude.toFixed(5)}_${m.longitude.toFixed(5)}`;
      if (!pins.has(key)) pins.set(key, []);
      pins.get(key)!.push(m);
    });
    const pinGroups = Array.from(pins.entries()).map(([key, items]) => {
      const uniqueColors: string[] = [];
      items.forEach((i) => {
        if (i.pinColor && !uniqueColors.includes(i.pinColor)) uniqueColors.push(i.pinColor);
        if (i.pinInnerColor && !uniqueColors.includes(i.pinInnerColor)) uniqueColors.push(i.pinInnerColor);
      });
      return {
        key,
        items,
        latitude: items[0].latitude,
        longitude: items[0].longitude,
        count: items.length,
        pinColor: items.length === 1 ? items[0].pinColor : "#264348",
        pinInnerColor: items.length === 1 ? items[0].pinInnerColor : undefined,
        pinImage: items.length === 1 ? items[0].pinImage : undefined,
        memberColors: items.length > 1 ? uniqueColors.slice(0, 4) : [],
        type: items[0].type,
      };
    });
    const transitGroups = transitSingles.map((m) => ({
      key: m.id,
      items: [m],
      latitude: m.latitude,
      longitude: m.longitude,
      count: 1,
      pinColor: m.pinColor,
      pinInnerColor: m.pinInnerColor,
      memberColors: [],
      type: m.type,
    }));
    return [...pinGroups, ...transitGroups];
  }, [mapMarkers]);

  useEffect(() => {
    if (!location || !mapRef.current) return;
    const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    if (key === prevLocationRef.current) return;
    prevLocationRef.current = key;
    mapRef.current.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.09,
      longitudeDelta: 0.09,
    }, 600);
  }, [location]);

  useEffect(() => {
    if (!focusToken || !focusRegion || !mapRef.current) return;
    if (Number.isFinite(focusZoom)) {
      mapRef.current.animateCamera({center:{latitude:focusRegion.latitude,longitude:focusRegion.longitude},zoom:focusZoom}, {duration:500});
    } else mapRef.current.animateToRegion(focusRegion, 500);
  }, [focusToken,focusZoom]);

  const handleRegionChangeComplete = (region: Region) => {
    void mapRef.current?.getCamera().then(camera => setCameraHeading(camera.heading || 0)).catch(() => {});
    const z = Math.max(2, Math.log2(360 / region.longitudeDelta));
    setZoomLevel(z);
    onZoomChange?.(z);
    if (disabled || !readyRef.current) return;
    const bounds: MapBounds = {
      minLat: region.latitude - region.latitudeDelta / 2,
      maxLat: region.latitude + region.latitudeDelta / 2,
      minLng: region.longitude - region.longitudeDelta / 2,
      maxLng: region.longitude + region.longitudeDelta / 2,
    };
    onRegionChange?.(bounds);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onRegionChangeComplete?.(bounds);
    }, 500);
  };

  const handleMapPress = (event: any) => {
    if (onMapPress && !disabled) {
      const { latitude, longitude } = event.nativeEvent.coordinate;
      onMapPress(latitude, longitude);
    }
  };

  if (disabled) {
    return (
      <Pressable 
        style={[styles.wrapper, { height, marginHorizontal:horizontalInset,width:horizontalInset ? 'auto' : '100%' }]}
        onPress={async () => {
          if (onMapPress && !enablingRef.current) {
            enablingRef.current = true;
            setEnabling(true);
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === "granted") {
                const position = await Location.getCurrentPositionAsync({});
                onMapPress(position.coords.latitude, position.coords.longitude);
              } else {
                Alert.alert(
                  t("common.error") || "Error",
                  t("locator.locationDenied") || "Location permission denied"
                );
              }
            } catch (error) {
              console.error("Failed to get location:", error);
              Alert.alert(
                t("common.error") || "Error",
                t("locator.locationDenied") || "Location permission denied"
              );
            } finally {
              enablingRef.current = false;
              setEnabling(false);
            }
          }
        }}
      >
        <View style={styles.disabledOverlay}>
          <View style={styles.disabledContent}>
            {enabling ? (
              <ActivityIndicator size="large" color="#59ABE3" />
            ) : (
              <Ionicons name="location" size={40} color="#264348" />
            )}
            <Text style={styles.disabledText}>{enabling ? "…" : disabledHint}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  const mapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#5C7A99' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#EDF4FB' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#DCE8F4' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#7C97B3' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#5C7A99' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#C8E2F4' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#EDF4FB' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7C97B3' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E2EEF9' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4A6B8C' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#59ABE3' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#FFFFFF' }] },
  ];

  return (
    <View style={[styles.wrapper, height ? { height } : { aspectRatio: 16 / 9 },{marginHorizontal:horizontalInset,width:horizontalInset ? 'auto' : '100%'}]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation={showUserLocation && !pinLocation}
        initialRegion={resolvedInitialRegion}
        customMapStyle={mapStyle}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        scrollEnabled={!staticMode}
        zoomEnabled={!staticMode}
        pitchEnabled={!staticMode}
        rotateEnabled={!staticMode}
      >
        {planLines.map((line, index) => <Polyline key={`journey-plan-${index}`} coordinates={line.points}
          strokeColor={line.color} strokeWidth={line.weight ?? 5} zIndex={10} />)}
        {showUserLocation && pinLocation && <Marker coordinate={pinLocation} anchor={{ x: 0.5, y: 0.5 }} zIndex={1000}>
          <View style={styles.userPin}>
            {userPinImage && !pinImageFailed ? <Image source={{ uri: userPinImage }} style={styles.userPinImage} onError={()=>setPinImageFailed(true)} />
              : <Text style={styles.userPinInitial}>{profileInitial(userPinName)}</Text>}
          </View>
        </Marker>}
        {transitLines.map((line, i) => (
          <Polyline
            key={`transit-line-${line.patternId || i}`}
            coordinates={line.points}
            strokeColor={line.color}
            strokeWidth={line.weight ?? 2}
            onPress={() => {
              if (onTransitLineClick && line.routeNumber) {
                onTransitLineClick(line.routeNumber as string, (line as any).patternId);
              }
            }}
          />
        ))}
        {groupedTransitStops.map((stop) => {
            const hasBus = stop.modes.includes("bus");
            const hasTram = stop.modes.includes("tram");
            const platformLabel=stop.platform_codes.join(" · ");
            const stopKey=(stop.platform_ids.length ? stop.platform_ids.slice().sort().join("|") : stop.stop_ids.slice().sort().join("|")) || stop.stop_id;
            return (
              <Marker
                key={`transit-stop-${stopKey}:${stopAppearance.bucket}`}
                coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                onPress={() => onTransitStopPress?.(stop)}
                tracksViewChanges={false}
              >
                <View style={styles.transitStopWrap}>
                  {stopAppearance.dot ? <View style={{width:stopAppearance.size,height:stopAppearance.size,borderRadius:stopAppearance.size/2,
                    borderWidth:1,borderColor:'#fff',backgroundColor:hasBus && hasTram ? '#264348' : hasTram ? '#8B0000' : '#1E3A8A'}} /> : <View
                    style={[
                      styles.transitStopPin,
                      {paddingHorizontal:3,paddingVertical:2},
                      {
                        backgroundColor:
                          hasBus && hasTram ? "#264348" : hasTram ? "#8B0000" : "#1E3A8A",
                      },
                    ]}
                  >
                    {(hasBus || hasTram) && <Image source={stopMobilityView(cameraHeading)}
                      style={{width:stopAppearance.icon,height:stopAppearance.icon}} resizeMode="contain" />}
                  </View>}
                  {stopAppearance.platforms && !!platformLabel && <Text numberOfLines={1}
                    style={styles.stopPlatformCodes}>{platformLabel}</Text>}
          {stopAppearance.names && <Text numberOfLines={1} style={{fontSize:10,color:'#264348',backgroundColor:'#fff',maxWidth:120}}>{stop.name}</Text>}
                </View>
              </Marker>
            );
          })}
        {groupedMarkers.map((group) => {
          if (group.count === 1 && group.items[0].selectionCompass) {
            return <Marker key={group.key} coordinate={{latitude:group.latitude,longitude:group.longitude}}
              anchor={{x:0.5,y:0.5}} onPress={()=>onMarkerPress?.(group.items[0].id)}>
              <Image source={require("../assets/brand/perix-compass.png")} style={{width:38,height:38}} resizeMode="contain" />
            </Marker>;
          }
          const zoomScale = Math.max(0.8, Math.min(1.7, zoomLevel / 12));
          const isTransitPin=group.items[0].type === "bus" || group.items[0].type === "tram" || group.items[0].type === "taxi";
          const groupSize = group.count > 1
            ? (group.count < 3 ? 26 : group.count < 10 ? 30 : group.count < 30 ? 34 : 40) * zoomScale
            : isTransitPin ? 20 * zoomScale : mapEntityPinSize(zoomLevel);
          const groupFontSize = Math.min(17, (group.count >= 100 ? 9 : group.count >= 10 ? 10.5 : 12) * zoomScale);
          const dotSize = 7 * zoomScale;
          const groupDotSize = 4 * zoomScale;
          if (group.count === 1 && group.items[0].visualEstimate && (group.items[0].type === "bus" || group.items[0].type === "tram")) {
            const item=group.items[0];
            return <VisualTransitMarker key={group.key} marker={group.items[0]}
              queueOffset={stationQueue.get(group.items[0].id)} iconSizePx={groupSize}
              onPress={() => onMarkerPress?.(group.items[0].id)}
              renderIcon={viewAngle=><VehicleMarkerArt mode={item.type as "bus"|"tram"} viewAngle={viewAngle} size={groupSize} label={item.label} />}>
            </VisualTransitMarker>;
          }
          if(group.count===1 && (group.items[0].type==="bus" || group.items[0].type==="tram")){
            const item=group.items[0];
            return <Marker key={group.key} coordinate={{latitude:group.latitude,longitude:group.longitude}} anchor={{x:0.5,y:0.5}}
              onPress={()=>onMarkerPress?.(item.id)}>
              <VehicleMarkerArt mode={item.type as "bus"|"tram"} viewAngle={vehicleMobilityViewAngle(item.heading ?? 0)} size={groupSize} label={item.label} />
            </Marker>;
          }
          if(group.count===1 && group.items[0].pinImage && group.items[0].type!=="taxi"){
            const item=group.items[0];
            return <Marker key={group.key} coordinate={{latitude:group.latitude,longitude:group.longitude}} anchor={{x:0.5,y:0.5}}
              onPress={()=>onMarkerPress?.(item.id)}>
              <DirectoryPinArt source={item.pinImage!} size={groupSize} color={item.pinColor || COLORS.pinClosed} label={item.title} />
            </Marker>;
          }
          if (group.count === 1 && group.items[0].visualEstimate) {
          return (
          <Marker
            key={group.key}
            coordinate={{ latitude: group.latitude, longitude: group.longitude }}
            onPress={() => {
              if (group.count === 1) {
                onMarkerPress?.(group.items[0].id);
              } else {
                setSelectedGroup(group.items);
              }
            }}
          >
            <View style={[group.count > 1 ? styles.groupPin : styles.customPin, { backgroundColor: group.pinColor || COLORS.pinClosed, width: groupSize, height: groupSize, borderRadius: groupSize / 2 }]}>
              {group.count > 1 ? (
                <>
                  <Text style={[styles.groupPinText, { fontSize: groupFontSize }]}>{group.count}</Text>
                  {group.memberColors.length > 0 && (
                    <View style={styles.groupDotsRow}>
                      {group.memberColors.map((c, i) => (
                        <View key={i} style={[styles.groupDot, { backgroundColor: c, width: groupDotSize, height: groupDotSize, borderRadius: groupDotSize / 2 }]} />
                      ))}
                    </View>
                  )}
                </>
              ) : group.pinInnerColor ? (
                <View style={[styles.pinDot, { backgroundColor: group.pinInnerColor, width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />
              ) : null}
            </View>
          </Marker>
          );
          }
        })}
      </MapView>
      <Modal visible={selectedGroup !== null} transparent animationType="slide" onRequestClose={() => setSelectedGroup(null)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setSelectedGroup(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t("map.itemsAtLocation", "{{count}} items at this location", { count: selectedGroup ? selectedGroup.length : 0 })}</Text>
            <ScrollView style={styles.sheetList}>
              {(selectedGroup || []).map((item) => (
                <TouchableOpacity key={item.id} style={styles.sheetItem} onPress={() => { setSelectedGroup(null); onMarkerPress?.(item.id); }}>
                  <View style={[styles.sheetDot, { backgroundColor: item.pinColor || COLORS.pinClosed }]} />
                  <View style={styles.sheetItemInfo}>
                    <Text style={styles.sheetItemName}>{item.title}</Text>
                    <Text style={styles.sheetItemType}>{t(`map.types.${item.type}`, item.type || "item")}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textPlaceholder} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  userPin: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: '#fff', backgroundColor: '#59ABE3', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userPinImage: { width: 28, height: 28, borderRadius: 14 },
  userPinInitial:{fontSize:16,fontWeight:'700',color:'#fff'},
  wrapper: {
    width: '100%',
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#59ABE3',
  },
  map: {
    flex: 1,
  },
  transitStopWrap: { alignItems: "center" },
  transitStopPin: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  stopPlatformCodes:{marginTop:1,maxWidth:120,paddingHorizontal:4,borderRadius:6,overflow:"hidden",
    backgroundColor:"rgba(255,255,255,0.94)",color:"#264348",fontSize:9,fontWeight:"800",textAlign:"center"},
  disabledOverlay: {
    flex: 1,
    backgroundColor: COLORS.borderGray,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      web: {
        cursor: "pointer",
      },
    }),
  },
  disabledContent: {
    alignItems: "center",
    gap: 12,
  },
  disabledText: {
    fontSize: 15,
    color: "#264348",
    fontWeight: "500",
  },
  customPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  pinDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  groupPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 5,
  },
  groupDotsRow: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 1,
  },
  groupDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  groupPinText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#02022A',
    marginBottom: 16,
  },
  sheetList: {
    maxHeight: 300,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  sheetDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  sheetItemInfo: {
    flex: 1,
  },
  sheetItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#02022A',
  },
  sheetItemType: {
    fontSize: 12,
    color: '#5A6276',
    marginTop: 2,
  },
});

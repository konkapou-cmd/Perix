import { useEffect, useRef, useState, useMemo } from "react";
import MapView, { Marker, Region } from "react-native-maps";
import { StyleSheet, View, Text, Pressable, Platform, Image, Modal, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Location from "expo-location";
import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental, Job, Service } from "../lib/api";
import { formatEventDate } from "../lib/formatDate";
import { COLORS } from "../lib/designTokens";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  isOpen?: boolean;
  pinColor?: string;
  pinInnerColor?: string;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product";
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

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
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  jobs?: Job[];
  services?: Service[];
  markers?: MapMarker[];
  extraMarkers?: MapMarker[];
  showUserLocation?: boolean;
  onRegionChange?: (bounds: MapBounds) => void;
  onRegionChangeComplete?: (bounds: MapBounds) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  height?: number;
  disabled?: boolean;
  disabledHint?: string;
  staticMode?: boolean;
};

// Helper function to determine if business is currently open
const isBusinessOpen = (business: Business): boolean => {
  const openingHours = business.opening_hours as { schedule?: Record<string, { enabled: boolean; periods: { open: string; close: string }[] }> } | undefined;
  if (!openingHours?.schedule) return false; // No registered hours -> treated as closed
  
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDay = days[now.getDay()];
  const daySchedule = openingHours.schedule[currentDay];
  
  if (!daySchedule || !daySchedule.enabled) return false;
  
  const currentTime = now.getHours() * 60 + now.getMinutes();
  
  for (const period of daySchedule.periods) {
    const [openHour, openMin] = period.open.split(":").map(Number);
    const [closeHour, closeMin] = period.close.split(":").map(Number);
    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;
    
    if (currentTime >= openTime && currentTime <= closeTime) {
      return true;
    }
  }
  
  return false;
};

export default function BusinessMap({
  location,
  initialRegion,
  focusRegion,
  focusToken,
  businesses = [],
  events = [],
  activities = [],
  artists = [],
  rentals = [],
  jobs = [] as Job[],
  services = [] as Service[],
  markers,
  extraMarkers,
  showUserLocation = false,
  onRegionChange,
  onRegionChangeComplete,
  onMarkerPress,
  onMapPress,
  height,
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

  useEffect(() => {
    const t = setTimeout(() => { readyRef.current = true; }, 800);
    return () => clearTimeout(t);
  }, []);

  const groupedMarkers = useMemo(() => {
    const groups = new Map<string, MapMarker[]>();
    mapMarkers.forEach((m) => {
      const key = `${m.latitude.toFixed(5)}_${m.longitude.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return Array.from(groups.entries()).map(([key, items]) => {
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
        memberColors: items.length > 1 ? uniqueColors.slice(0, 4) : [],
        type: items[0].type,
      };
    });
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
    mapRef.current.animateToRegion(focusRegion, 500);
  }, [focusToken]);

  const handleRegionChangeComplete = (region: Region) => {
    setZoomLevel(Math.max(2, Math.log2(360 / region.longitudeDelta)));
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
        style={[styles.wrapper, { height }]} 
        onPress={async () => {
          if (onMapPress) {
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === "granted") {
                const position = await Location.getCurrentPositionAsync({});
                onMapPress(position.coords.latitude, position.coords.longitude);
              }
            } catch (error) {
              console.error("Failed to get location:", error);
            }
          }
        }}
      >
        <View style={styles.disabledOverlay}>
          <View style={styles.disabledContent}>
            <Ionicons name="location" size={40} color="#264348" />
            <Text style={styles.disabledText}>{disabledHint}</Text>
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
    <View style={[styles.wrapper, height ? { height } : {}]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation={showUserLocation}
        initialRegion={resolvedInitialRegion}
        customMapStyle={mapStyle}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        scrollEnabled={!staticMode}
        zoomEnabled={!staticMode}
        pitchEnabled={!staticMode}
        rotateEnabled={!staticMode}
      >
        {groupedMarkers.map((group) => {
          const zoomScale = Math.max(0.8, Math.min(1.7, zoomLevel / 12));
          const groupSize = (group.count > 1 ? (group.count < 3 ? 26 : group.count < 10 ? 30 : group.count < 30 ? 34 : 40) : 20) * zoomScale;
          const groupFontSize = Math.min(17, (group.count >= 100 ? 9 : group.count >= 10 ? 10.5 : 12) * zoomScale);
          const dotSize = 7 * zoomScale;
          const groupDotSize = 4 * zoomScale;
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
  wrapper: {
    aspectRatio: 16 / 9,
    width: '100%',
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: '#EAF3FB',
    borderWidth: 1,
    borderColor: '#59ABE3',
  },
  map: {
    flex: 1,
  },
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

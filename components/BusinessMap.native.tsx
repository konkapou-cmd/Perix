import { useEffect, useRef } from "react";
import MapView, { Marker, Region } from "react-native-maps";
import { StyleSheet, View, Text, Pressable, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental } from "../lib/api";
import { formatEventDate } from "../lib/formatDate";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  isOpen?: boolean;
  pinColor?: string;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental";
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
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  markers?: MapMarker[];
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
  if (!openingHours?.schedule) return true; // Assume open if no hours set
  
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
  businesses = [],
  events = [],
  activities = [],
  artists = [],
  rentals = [],
  markers,
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
  const mapMarkers: MapMarker[] = markers ?? [
    ...businesses.map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      description: business.category,
      isOpen: isBusinessOpen(business),
      type: "business" as const,
      pinColor: isBusinessOpen(business) ? "#FFD700" : "#000000",
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
        pinColor: "#FFD700" as const,
      })),
    ...activities
      .filter(a => a.latitude != null && a.longitude != null)
      .map((activity) => ({
        id: activity.activity_id,
        latitude: activity.latitude!,
        longitude: activity.longitude!,
        title: activity.title,
        description: activity.location || `${activity.date} ${activity.time || ''}`,
        type: "activity" as const,
        pinColor: "#FFD700" as const,
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
        pinColor: "#000000" as const,
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
        pinColor: "#4f46e5" as const,
      })),
  ];

  const resolvedInitialRegion = initialRegion || (location ? {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  } : undefined);

  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLocationRef = useRef<string>("");

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

  const handleRegionChangeComplete = (region: Region) => {
    if (disabled) return;
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
            <Ionicons name="location" size={40} color="#000000" />
            <Text style={styles.disabledText}>{disabledHint}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  const mapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d0d0d0' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
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
        {mapMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={marker.title}
            description={marker.description}
            pinColor={marker.pinColor || "#000000"}
            onPress={() => onMarkerPress?.(marker.id)}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    aspectRatio: 16 / 9,
    width: '100%',
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  map: {
    flex: 1,
  },
  disabledOverlay: {
    flex: 1,
    backgroundColor: "#e5e7eb",
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
    color: "#6b7280",
    fontWeight: "500",
  },
});

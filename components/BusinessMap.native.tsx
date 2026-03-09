import MapView, { Marker, Region } from "react-native-maps";
import { StyleSheet, View, Image } from "react-native";
import { Business } from "../lib/api";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  isOpen?: boolean;
  pinColor?: string;
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  location: { latitude: number; longitude: number };
  businesses?: Business[];
  markers?: MapMarker[];
  showUserLocation?: boolean;
  onRegionChange?: (bounds: MapBounds) => void;
  onMarkerPress?: (markerId: string) => void;
  height?: number;
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
  businesses = [],
  markers,
  showUserLocation = false,
  onRegionChange,
  onMarkerPress,
  height = 200,
}: Props) {
  const mapMarkers: MapMarker[] =
    markers ??
    businesses.map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      description: business.category,
      isOpen: isBusinessOpen(business),
    }));

  const handleRegionChangeComplete = (region: Region) => {
    if (onRegionChange) {
      const bounds: MapBounds = {
        minLat: region.latitude - region.latitudeDelta / 2,
        maxLat: region.latitude + region.latitudeDelta / 2,
        minLng: region.longitude - region.longitudeDelta / 2,
        maxLng: region.longitude + region.longitudeDelta / 2,
      };
      onRegionChange(bounds);
    }
  };

  return (
    <View style={[styles.wrapper, { height }]}>
      <MapView
        style={styles.map}
        showsUserLocation={showUserLocation}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {mapMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={marker.title}
            description={marker.description}
            pinColor={marker.pinColor || (marker.isOpen !== false ? "#10b981" : "#ef4444")}
            onPress={() => onMarkerPress?.(marker.id)}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 260,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
});

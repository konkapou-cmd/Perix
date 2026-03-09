import MapView, { Marker, Region } from "react-native-maps";
import { StyleSheet, View } from "react-native";
import { EventItem } from "../lib/api";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  location: { latitude: number; longitude: number };
  events?: EventItem[];
  showUserLocation?: boolean;
  onRegionChange?: (bounds: MapBounds) => void;
  onMarkerPress?: (eventId: string) => void;
  height?: number;
};

export default function EventsMap({
  location,
  events = [],
  showUserLocation = true,
  onRegionChange,
  onMarkerPress,
  height = 180,
}: Props) {
  // Convert events to markers (only those with location)
  const mapMarkers: MapMarker[] = events
    .filter((event) => {
      const lat = event.business?.latitude || event.artist?.latitude;
      const lng = event.business?.longitude || event.artist?.longitude;
      return lat && lng;
    })
    .map((event) => ({
      id: event.event_id,
      latitude: event.business?.latitude || event.artist?.latitude || 0,
      longitude: event.business?.longitude || event.artist?.longitude || 0,
      title: event.title,
      description: event.business?.name || event.artist?.name || event.start_time.split("T")[0],
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
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {mapMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            title={marker.title}
            description={marker.description}
            pinColor="#4c6fff"
            onPress={() => onMarkerPress?.(marker.id)}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  map: {
    flex: 1,
  },
});

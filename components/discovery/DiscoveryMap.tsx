import { useMemo, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { COLORS } from "../../lib/designTokens";
import BusinessMap from "../BusinessMap";

export type DiscoveryMapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  color?: string;
  type?: "product" | "rental";
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  markers: DiscoveryMapMarker[];
  initialLocation?: { latitude: number; longitude: number };
  onMarkerPress: (id: string) => void;
  onViewportChanging?: (bounds: MapBounds) => void;
  onViewportChange: (bounds: MapBounds) => void;
};

export default function DiscoveryMap({ markers, initialLocation, onMarkerPress, onViewportChanging, onViewportChange }: Props) {

  const mapMarkers = useMemo(
    () =>
      markers.map((m) => ({
        id: m.id,
        latitude: m.latitude,
        longitude: m.longitude,
        title: m.title,
        pinColor: m.color ?? COLORS.primary,
        type: m.type,
      })),
    [markers],
  );

  const handleRegionChange = useCallback(
    (bnds: MapBounds) => {
      onViewportChanging?.(bnds);
    },
    [onViewportChanging],
  );

  const handleRegionChangeComplete = useCallback(
    (bnds: MapBounds) => {
      onViewportChange(bnds);
    },
    [onViewportChange],
  );

  const location = initialLocation ?? { latitude: 52.52, longitude: 13.405 };

  return (
    <View style={styles.container}>
      <BusinessMap
        location={location}
        markers={mapMarkers}
        onMarkerPress={onMarkerPress}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        showUserLocation
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 280,
    backgroundColor: COLORS.backgroundPage,
  },
  map: {
    flex: 1,
  },
});

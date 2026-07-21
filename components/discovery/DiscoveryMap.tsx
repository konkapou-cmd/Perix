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

type Props = {
  markers: DiscoveryMapMarker[];
  onMarkerPress: (id: string) => void;
  onViewportChange: (bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }) => void;
};

export default function DiscoveryMap({ markers, onMarkerPress, onViewportChange }: Props) {

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
    (bnds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
      onViewportChange(bnds);
    },
    [onViewportChange],
  );

  return (
    <View style={styles.container}>
      <BusinessMap
        location={{ latitude: 52.52, longitude: 13.405 }}
        markers={mapMarkers}
        onMarkerPress={onMarkerPress}
        onRegionChangeComplete={handleRegionChange}
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

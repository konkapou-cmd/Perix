import { StyleSheet, View, Text, Pressable, Linking, Image as RNImage } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EventItem } from "../lib/api";

type Props = {
  location: { latitude: number; longitude: number };
  events?: EventItem[];
  showUserLocation?: boolean;
  onRegionChange?: (bounds: any) => void;
  onMarkerPress?: (eventId: string) => void;
  height?: number;
};

export default function EventsMap({
  location,
  events = [],
  onMarkerPress,
  height = 180,
}: Props) {
  // Get Google API key from environment
  const googleKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Build markers string for Google Static Maps
  const eventsWithLocation = events.filter((event) => {
    const lat = event.business?.latitude || event.artist?.latitude;
    const lng = event.business?.longitude || event.artist?.longitude;
    return lat && lng;
  });

  const markersParam = eventsWithLocation
    .slice(0, 10) // Limit markers for URL length
    .map((event) => {
      const lat = event.business?.latitude || event.artist?.latitude;
      const lng = event.business?.longitude || event.artist?.longitude;
      return `markers=color:blue%7C${lat},${lng}`;
    })
    .join("&");

  const mapUrl = googleKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${location.latitude},${location.longitude}&zoom=12&size=600x300&maptype=roadmap&${markersParam}&key=${googleKey}`
    : null;

  const openInMaps = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    Linking.openURL(url);
  };

  // Show map with Image component or fallback UI
  if (mapUrl) {
    return (
      <View style={[styles.wrapper, { height }]}>
        <Pressable onPress={openInMaps} style={{ flex: 1 }}>
          <RNImage
            source={{ uri: mapUrl }}
            style={{ width: "100%", height: height, borderRadius: 12 }}
            resizeMode="cover"
          />
        </Pressable>
      </View>
    );
  }

  // Fallback when no API key
  return (
    <View style={[styles.wrapper, { height }]}>
      <View style={styles.fallbackContent}>
        <Ionicons name="map" size={32} color="#4c6fff" />
        <Text style={styles.fallbackText}>
          {eventsWithLocation.length} events nearby
        </Text>
        <Pressable style={styles.mapsButton} onPress={openInMaps}>
          <Ionicons name="navigate" size={14} color="#fff" />
          <Text style={styles.mapsButtonText}>Open Maps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#f3f4f6",
  },
  fallbackContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  fallbackText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
  },
  mapsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#4c6fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 12,
  },
  mapsButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
});

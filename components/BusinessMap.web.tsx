import { StyleSheet, Text, View, Platform, Image as RNImage } from "react-native";
import { Business } from "../lib/api";
import Constants from "expo-constants";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
};

type Props = {
  location: { latitude: number; longitude: number };
  businesses?: Business[];
  markers?: MapMarker[];
  height?: number;
};

const googleKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "AIzaSyAMr1Se10FOuTAV7YMEpDvWaKunxRWMa-c";

export default function BusinessMap({ location, businesses = [], markers, height = 200 }: Props) {
  const mapMarkers: MapMarker[] =
    markers ??
    businesses.map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      description: business.category,
    }));

  // For web, show Google Maps embed with marker
  if (Platform.OS === "web" && googleKey && location) {
    const lat = location.latitude;
    const lng = location.longitude;
    // Use Google Static Maps API instead of embed for better compatibility
    const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${lat},${lng}&key=${googleKey}`;
    
    return (
      <View style={[styles.wrapper, { height }]}>
        <RNImage 
          source={{ uri: staticMapUrl }}
          style={{ width: "100%", height: "100%", borderRadius: 12 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { height }]}>
      <Text style={styles.title}>Map view is available on mobile devices.</Text>
      <Text style={styles.subtitle}>Markers: {mapMarkers.length}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 0,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  title: {
    color: "#9ca3af",
    fontWeight: "600",
  },
  subtitle: {
    color: "#c4c4c4",
    marginTop: 6,
  },
});

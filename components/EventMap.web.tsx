import { StyleSheet, Text, View, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  location: { latitude: number; longitude: number };
  title?: string;
  address?: string;
};

export default function EventMap({ location, title, address }: Props) {
  const openInMaps = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.content}>
        <Ionicons name="location" size={32} color="#4c6fff" />
        <Text style={styles.title}>{title || "Event Location"}</Text>
        {address && <Text style={styles.address}>{address}</Text>}
        <Text style={styles.coords}>
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
        </Text>
        <Pressable style={styles.directionsButton} onPress={openInMaps}>
          <Ionicons name="navigate" size={16} color="#fff" />
          <Text style={styles.directionsText}>Open in Google Maps</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 180,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    marginTop: 16,
    overflow: "hidden",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginTop: 8,
    textAlign: "center",
  },
  address: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center",
  },
  coords: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
  },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#4c6fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 12,
  },
  directionsText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});

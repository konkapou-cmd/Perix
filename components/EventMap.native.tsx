import MapView, { Marker } from "react-native-maps";
import { StyleSheet, View, Pressable, Linking, Platform, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  location: { latitude: number; longitude: number };
  title?: string;
  address?: string;
};

export default function EventMap({ location, title, address }: Props) {
  const openInMaps = () => {
    const label = encodeURIComponent(title || "Event Location");
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${location.latitude},${location.longitude}`,
      android: `geo:${location.latitude},${location.longitude}?q=${location.latitude},${location.longitude}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`,
    });
    Linking.openURL(url);
  };

  return (
    <View style={styles.wrapper}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        <Marker
          coordinate={{ latitude: location.latitude, longitude: location.longitude }}
          title={title}
          description={address}
          pinColor="#4c6fff"
        />
      </MapView>
      <Pressable style={styles.directionsButton} onPress={openInMaps}>
        <Ionicons name="navigate" size={18} color="#fff" />
        <Text style={styles.directionsText}>Get Directions</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 200,
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 16,
    position: "relative",
  },
  map: {
    flex: 1,
  },
  directionsButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#4c6fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  directionsText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});

import MapView, { Marker, MapPressEvent, Region } from "react-native-maps";
import { StyleSheet, View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState, useCallback } from "react";
import Constants from "expo-constants";

type Props = {
  location: { latitude: number; longitude: number } | null;
  onLocationChange: (location: { latitude: number; longitude: number; address?: string }) => void;
};

type PlacePrediction = {
  place_id: string;
  description: string;
};

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

export default function LocationPickerMap({ location, onLocationChange }: Props) {
  const [region, setRegion] = useState<Region>({
    latitude: location?.latitude || 52.52,
    longitude: location?.longitude || 13.405,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);

  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&types=address`
      );
      const data = await response.json();
      if (data.predictions) {
        setPredictions(data.predictions);
        setShowPredictions(true);
      }
    } catch (error) {
      console.error("Places search error:", error);
    }
    setSearching(false);
  }, []);

  const selectPlace = useCallback(async (placeId: string, description: string) => {
    setShowPredictions(false);
    setSearchQuery(description);
    setSearching(true);
    
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location;
        const newRegion = {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        };
        setRegion(newRegion);
        onLocationChange({ 
          latitude: lat, 
          longitude: lng,
          address: data.result.formatted_address || description
        });
      }
    } catch (error) {
      console.error("Place details error:", error);
    }
    setSearching(false);
  }, [onLocationChange]);

  const handleMapPress = async (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setShowPredictions(false);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      const address = data.results?.[0]?.formatted_address;
      onLocationChange({ latitude, longitude, address });
    } catch {
      onLocationChange({ latitude, longitude });
    }
  };

  const handleMarkerDragEnd = async (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      const address = data.results?.[0]?.formatted_address;
      onLocationChange({ latitude, longitude, address });
    } catch {
      onLocationChange({ latitude, longitude });
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for an address..."
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              searchPlaces(text);
            }}
            onFocus={() => predictions.length > 0 && setShowPredictions(true)}
          />
          {searching && <ActivityIndicator size="small" color="#000000" />}
          {searchQuery.length > 0 && !searching && (
            <Pressable 
              onPress={() => {
                setSearchQuery("");
                setPredictions([]);
                setShowPredictions(false);
              }}
            >
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </Pressable>
          )}
        </View>
        
        {/* Predictions List */}
        {showPredictions && predictions.length > 0 && (
          <View style={styles.predictionsContainer}>
            <ScrollView 
              style={styles.predictionsList} 
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {predictions.map((item) => (
                <Pressable
                  key={item.place_id}
                  style={styles.predictionItem}
                  onPress={() => selectPlace(item.place_id, item.description)}
                >
                  <Ionicons name="location-outline" size={18} color="#000000" />
                  <Text style={styles.predictionText} numberOfLines={2}>
                    {item.description}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <Text style={styles.hint}>Tap or drag the marker to set location</Text>
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={handleMapPress}
        >
          {location && (
            <Marker
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              draggable
              onDragEnd={handleMarkerDragEnd}
              pinColor="#000000"
            />
          )}
        </MapView>
        {!location && (
          <View style={styles.overlay}>
            <Ionicons name="location" size={32} color="#000000" />
            <Text style={styles.overlayText}>Tap on the map to set location</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 16,
  },
  searchContainer: {
    marginBottom: 12,
    zIndex: 10,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  predictionsContainer: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxHeight: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  predictionsList: {
    borderRadius: 12,
  },
  predictionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  predictionText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  hint: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
    textAlign: "center",
  },
  mapContainer: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  map: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  overlayText: {
    marginTop: 8,
    fontSize: 14,
    color: "#6b7280",
  },
});

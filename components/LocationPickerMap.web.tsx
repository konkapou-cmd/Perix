import { StyleSheet, Text, View, TextInput, Pressable, Linking, ActivityIndicator, FlatList } from "react-native";
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
  const [latInput, setLatInput] = useState(location?.latitude?.toString() || "");
  const [lonInput, setLonInput] = useState(location?.longitude?.toString() || "");
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
      // Use a CORS proxy for web since Google Places API doesn't support CORS
      const corsProxy = "https://corsproxy.io/?";
      const apiUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&types=address`;
      
      const response = await fetch(corsProxy + encodeURIComponent(apiUrl));
      const data = await response.json();
      if (data.predictions) {
        setPredictions(data.predictions);
        setShowPredictions(true);
      }
    } catch (error) {
      console.error("Places search error:", error);
      // Fallback to using Nominatim (OpenStreetMap) which supports CORS
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1`;
        const response = await fetch(nominatimUrl, {
          headers: { "User-Agent": "Perix App" }
        });
        const data = await response.json();
        if (data && data.length > 0) {
          const addressResults = data.filter((item: any) => {
            const addr = item.address || {};
            const isBusiness = addr.amenity || addr.shop || addr.building;
            if (isBusiness) return false;
            return !!(addr.road || addr.street || addr.footway || addr.house_number || addr.city || addr.town || addr.village || addr.postcode);
          });
          const nominatimPredictions = addressResults.slice(0, 5).map((item: any, index: number) => ({
            place_id: `nominatim_${index}_${item.place_id}`,
            description: item.display_name,
            lat: item.lat,
            lon: item.lon,
          }));
          setPredictions(nominatimPredictions);
          setShowPredictions(true);
        }
      } catch (nomError) {
        console.error("Nominatim search error:", nomError);
      }
    }
    setSearching(false);
  }, []);

  const selectPlace = useCallback(async (placeId: string, description: string, lat?: string, lon?: string) => {
    setShowPredictions(false);
    setSearchQuery(description);
    setSearching(true);
    
    // If lat/lon provided directly (from Nominatim)
    if (lat && lon) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      setLatInput(lat);
      setLonInput(lon);
      onLocationChange({ latitude, longitude, address: description });
      setSearching(false);
      return;
    }

    try {
      const corsProxy = "https://corsproxy.io/?";
      const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(corsProxy + encodeURIComponent(apiUrl));
      const data = await response.json();
      
      if (data.result?.geometry?.location) {
        const { lat: latitude, lng: longitude } = data.result.geometry.location;
        setLatInput(latitude.toString());
        setLonInput(longitude.toString());
        onLocationChange({ 
          latitude, 
          longitude,
          address: data.result.formatted_address || description
        });
      }
    } catch (error) {
      console.error("Place details error:", error);
    }
    setSearching(false);
  }, [onLocationChange]);

  const handleApply = () => {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      onLocationChange({ latitude: lat, longitude: lon });
    }
  };

  const openGoogleMaps = () => {
    const url = location
      ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
      : "https://www.google.com/maps";
    Linking.openURL(url);
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.hint}>Search for an address or enter coordinates manually</Text>
      
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
            {predictions.map((item: any) => (
              <Pressable
                key={item.place_id}
                style={styles.predictionItem}
                onPress={() => selectPlace(item.place_id, item.description, item.lat, item.lon)}
              >
                <Ionicons name="location-outline" size={18} color="#000000" />
                <Text style={styles.predictionText} numberOfLines={2}>
                  {item.description}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Text style={styles.dividerText}>Or enter coordinates manually</Text>
      
      <View style={styles.inputRow}>
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Latitude</Text>
          <TextInput
            style={styles.input}
            placeholder="-90 to 90"
            value={latInput}
            onChangeText={setLatInput}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Longitude</Text>
          <TextInput
            style={styles.input}
            placeholder="-180 to 180"
            value={lonInput}
            onChangeText={setLonInput}
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.buttonRow}>
        <Pressable style={styles.applyButton} onPress={handleApply}>
          <Text style={styles.applyButtonText}>Apply Coordinates</Text>
        </Pressable>
        <Pressable style={styles.mapsButton} onPress={openGoogleMaps}>
          <Ionicons name="map-outline" size={18} color="#000000" />
          <Text style={styles.mapsButtonText}>Open Maps</Text>
        </Pressable>
      </View>

      {location && (
        <View style={styles.preview}>
          <Ionicons name="location" size={24} color="#10b981" />
          <Text style={styles.previewText}>
            Location set: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
  },
  hint: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 12,
    textAlign: "center",
  },
  searchContainer: {
    marginBottom: 12,
    position: "relative",
    zIndex: 10,
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
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
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
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
  dividerText: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginVertical: 12,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputContainer: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  applyButton: {
    flex: 1,
    backgroundColor: "#000000",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  applyButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  mapsButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#eef2ff",
    paddingVertical: 10,
    borderRadius: 8,
  },
  mapsButtonText: {
    color: "#000000",
    fontWeight: "600",
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    padding: 12,
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    color: "#065f46",
  },
});

import { useState, useCallback, useEffect } from "react";
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSelectCity: (cityName: string, lat: number, lng: number) => void;
  placeholder?: string;
  style?: any;
};

type CityPrediction = {
  place_id: string;
  cityName: string;
  displayName: string;
  lat: number;
  lng: number;
};

export default function CityAutocompleteInput({
  value,
  onChangeText,
  onSelectCity,
  placeholder,
  style,
}: Props) {
  const [predictions, setPredictions] = useState<CityPrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const searchCities = useCallback(async (query: string) => {
    if (!query || query.length < 2 || confirmed) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }

    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=6&addressdetails=1&featuretype=settlement`;
      const response = await fetch(url, {
        headers: { "User-Agent": "PerixApp/1.0" },
      });
      const data = await response.json();
      if (data && Array.isArray(data)) {
        const cityResults: CityPrediction[] = data
          .filter((item: any) => {
            const addr = item.address;
            if (!addr) return false;
            return !!(addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state);
          })
          .slice(0, 5)
          .map((item: any) => {
            const addr = item.address;
            const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
            return {
              place_id: item.place_id?.toString() || Math.random().toString(),
              cityName,
              displayName: item.display_name,
              lat: parseFloat(item.lat),
              lng: parseFloat(item.lon),
            };
          });
        setPredictions(cityResults);
        setShowPredictions(cityResults.length > 0);
      }
    } catch (error) {
      // Silent
    } finally {
      setSearching(false);
    }
  }, [confirmed]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value && value.length >= 2 && !confirmed) {
        searchCities(value);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, searchCities, confirmed]);

  const handleTextChange = (text: string) => {
    onChangeText(text);
    if (!text || text.length < 2) {
      setPredictions([]);
      setShowPredictions(false);
    }
  };

  const handleSelectPrediction = (prediction: CityPrediction) => {
    setPredictions([]);
    setShowPredictions(false);
    setConfirmed(true);
    onChangeText(prediction.cityName);
    onSelectCity(prediction.cityName, prediction.lat, prediction.lng);
    Keyboard.dismiss();
  };

  const handleClear = () => {
    onChangeText("");
    setPredictions([]);
    setShowPredictions(false);
    setConfirmed(false);
    onSelectCity("", 0, 0);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.inputRow, style]}>
        <Ionicons name="location-outline" size={20} color="#6b7280" />
        <TextInput
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="#6b7280"
          style={styles.input}
        />
        {searching ? (
          <ActivityIndicator size="small" color="#6b7280" />
        ) : value && value.length > 0 ? (
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>
      {showPredictions && predictions.length > 0 && (
        <View style={styles.predictionsContainer}>
          {predictions.map((item, index) => (
            <Pressable
              key={item.place_id}
              style={[styles.predictionItem, index < predictions.length - 1 && styles.predictionItemBorder]}
              onPress={() => handleSelectPrediction(item)}
            >
              <View style={styles.predictionIconContainer}>
                <Ionicons name="location" size={18} color="#6b7280" />
              </View>
              <View style={styles.predictionTextContainer}>
                <Text style={styles.predictionMainText} numberOfLines={1}>{item.cityName}</Text>
                <Text style={styles.predictionSecondaryText} numberOfLines={1}>
                  {item.displayName.split(",").slice(1).join(",").trim()}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 100,
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, android: 4 }),
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    ...Platform.select({ web: { pointerEvents: "auto" } }),
  },
  clearButton: {
    padding: 4,
  },
  predictionsContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  },
  predictionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  predictionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  predictionIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  predictionTextContainer: {
    flex: 1,
  },
  predictionMainText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  predictionSecondaryText: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
});

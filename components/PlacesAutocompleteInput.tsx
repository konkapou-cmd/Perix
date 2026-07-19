import { useState, useCallback, useEffect, useRef } from "react";
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
  onSelectPlace?: (address: string, lat: number, lng: number) => void;
  onSuggestionsVisible?: (visible: boolean) => void;
  placeholder?: string;
  style?: any;
  nearLat?: number;
  nearLng?: number;
  confirmed?: boolean;
  locked?: boolean;
};

type PlacePrediction = {
  place_id: string;
  description: string;
  lat: number;
  lon: number;
};

export default function PlacesAutocompleteInput({
  value,
  onChangeText,
  onSelectPlace,
  onSuggestionsVisible,
  placeholder,
  style,
  nearLat,
  nearLng,
  confirmed,
  locked,
}: Props) {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [isAddressConfirmed, setIsAddressConfirmed] = useState(false);
  const confirmedValueRef = useRef<string>("");
  const hasUserEditedRef = useRef(false);

  const searchPlaces = useCallback(async (query: string) => {
    if (!query || query.length < 2 || isAddressConfirmed) {
      setPredictions([]);
      setShowPredictions(false);
      onSuggestionsVisible?.(false);
      return;
    }

    setSearching(true);
    try {
      let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=8&addressdetails=1`;
      if (nearLat != null && nearLng != null) {
        nominatimUrl += `&lat=${nearLat}&lon=${nearLng}`;
        const vbLatDelta = 0.5;
        const vbLngDelta = 0.5;
        nominatimUrl += `&viewbox=${nearLng - vbLngDelta},${nearLat + vbLatDelta},${nearLng + vbLngDelta},${nearLat - vbLatDelta}`;
      }
      const response = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "PerixApp/1.0",
        },
      });
      const data = await response.json();
      if (data && Array.isArray(data)) {
        const addressResults = data
          .filter((item: any) => {
            const addr = item.address;
            if (!addr) return false;
            const hasStreet = addr.road || addr.street || addr.footway || addr.path;
            const hasNumber = addr.house_number;
            const hasCity = addr.city || addr.town || addr.village || addr.municipality;
            const hasPostcode = addr.postcode;
            const isBusiness = addr.amenity || addr.shop || addr.building;
            
            if (isBusiness) return false;
            if ((hasStreet || hasNumber || hasCity || hasPostcode) && !isBusiness) return true;
            if (hasPostcode) return true;
            return false;
          })
          .slice(0, 3)
          .map((item: any) => ({
            place_id: item.place_id?.toString() || Math.random().toString(),
            description: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          }));
        setPredictions(addressResults);
        setShowPredictions(addressResults.length > 0);
        onSuggestionsVisible?.(addressResults.length > 0);
      }
    } catch (error) {
      console.error("Places search error:", error);
    } finally {
      setSearching(false);
    }
  }, [onSuggestionsVisible, nearLat, nearLng, isAddressConfirmed]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value && value.length >= 2 && !isAddressConfirmed) {
        searchPlaces(value);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, searchPlaces, isAddressConfirmed]);

  useEffect(() => {
    if (!value) {
      confirmedValueRef.current = "";
      hasUserEditedRef.current = false;
      setIsAddressConfirmed(false);
      return;
    }

    if (confirmed && !confirmedValueRef.current && !hasUserEditedRef.current) {
      confirmedValueRef.current = value;
      setIsAddressConfirmed(true);
      return;
    }

    if (!confirmed) {
      confirmedValueRef.current = "";
      hasUserEditedRef.current = false;
      setIsAddressConfirmed(false);
    }
  }, [confirmed, value]);

  const handleTextChange = (text: string) => {
    hasUserEditedRef.current = true;
    onChangeText(text);
    if (confirmedValueRef.current && text !== confirmedValueRef.current) {
      confirmedValueRef.current = "";
      setIsAddressConfirmed(false);
    }
    if (!text || text.length < 2) {
      setPredictions([]);
      setShowPredictions(false);
      onSuggestionsVisible?.(false);
    }
  };

  const handleSelectPrediction = (prediction: PlacePrediction) => {
    setPredictions([]);
    setShowPredictions(false);
    hasUserEditedRef.current = false;
    confirmedValueRef.current = prediction.description;
    setIsAddressConfirmed(true);
    onSuggestionsVisible?.(false);
    
    onChangeText(prediction.description);
    if (onSelectPlace) {
      onSelectPlace(prediction.description, prediction.lat, prediction.lon);
    }
    
    Keyboard.dismiss();
  };

  const handleClear = () => {
    onChangeText("");
    setPredictions([]);
    setShowPredictions(false);
    confirmedValueRef.current = "";
    hasUserEditedRef.current = false;
    setIsAddressConfirmed(false);
    onSuggestionsVisible?.(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, style]}
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          editable={!locked}
        />
        {locked ? (
          <Ionicons name="lock-closed" size={18} color="#9ca3af" style={{ marginRight: 8 }} />
        ) : searching ? (
          <ActivityIndicator size="small" color="#000000" style={styles.loader} />
        ) : value && value.length > 0 ? (
          <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>
      {showPredictions && predictions && predictions.length > 0 && (
        <View style={styles.predictionsContainer}>
          {predictions.map((item, index) => {
            const parts = item.description.split(',');
            const mainText = parts[0] || item.description;
            const secondaryText = parts.slice(1).join(',').trim();
            return (
              <Pressable
                key={item.place_id}
                style={[styles.predictionItem, index < predictions.length - 1 && styles.predictionItemBorder]}
                onPress={() => handleSelectPrediction(item)}
              >
                <View style={styles.predictionIconContainer}>
                  <Ionicons name="location-outline" size={20} color="#9ca3af" />
                </View>
                <View style={styles.predictionTextContainer}>
                  <Text style={styles.predictionMainText} numberOfLines={1}>{mainText}</Text>
                  {secondaryText ? (
                    <Text style={styles.predictionSecondaryText} numberOfLines={1}>{secondaryText}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    zIndex: 100,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    color: "#111827",
  },
  loader: {
    position: "absolute",
    right: 12,
  },
  clearButton: {
    position: "absolute",
    right: 12,
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
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  predictionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  predictionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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
  predictionIcon: {
    marginRight: 10,
  },
  predictionText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
});

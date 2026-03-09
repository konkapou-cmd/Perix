import { useState, useCallback } from "react";
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Platform,
} from "react-native";
import Constants from "expo-constants";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: any;
};

type PlacePrediction = {
  place_id: string;
  description: string;
};

const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

export default function PlacesAutocompleteInput({
  value,
  onChangeText,
  placeholder,
  style,
}: Props) {
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
      // Use Nominatim for web (supports CORS) and native
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=5&addressdetails=1`;
      const response = await fetch(nominatimUrl, {
        headers: {
          "User-Agent": "PerixApp/1.0",
        },
      });
      const data = await response.json();
      if (data && Array.isArray(data)) {
        setPredictions(
          data.map((item: any) => ({
            place_id: item.place_id?.toString() || Math.random().toString(),
            description: item.display_name,
          }))
        );
        setShowPredictions(true);
      }
    } catch (error) {
      console.error("Places search error:", error);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleTextChange = (text: string) => {
    onChangeText(text);
    searchPlaces(text);
  };

  const handleSelectPrediction = (prediction: PlacePrediction) => {
    onChangeText(prediction.description);
    setPredictions([]);
    setShowPredictions(false);
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
        />
        {searching && (
          <ActivityIndicator
            size="small"
            color="#4c6fff"
            style={styles.loader}
          />
        )}
      </View>
      {showPredictions && predictions.length > 0 && (
        <View style={styles.predictionsContainer}>
          <FlatList
            data={predictions}
            keyExtractor={(item) => item.place_id}
            renderItem={({ item }) => (
              <Pressable
                style={styles.predictionItem}
                onPress={() => handleSelectPrediction(item)}
              >
                <Text style={styles.predictionText} numberOfLines={2}>
                  {item.description}
                </Text>
              </Pressable>
            )}
            style={styles.predictionsList}
            nestedScrollEnabled
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    zIndex: 1000,
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
  predictionsContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 200,
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
  predictionsList: {
    maxHeight: 200,
  },
  predictionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  predictionText: {
    fontSize: 14,
    color: "#374151",
  },
});

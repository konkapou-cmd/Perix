import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";
import { apiRequest } from "../../lib/api/core";

interface PlaceSuggestion {
  place_id: string;
  description: string;
  lat: number | null;
  lng: number | null;
}

interface LocationSearchOverlayProps {
  visible: boolean;
  sessionToken?: string | null;
  onClose: () => void;
  onSelectPlace: (lat: number, lng: number, name: string) => void;
}

export function LocationSearchOverlay({ visible, sessionToken, onClose, onSelectPlace }: LocationSearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const searchPlaces = async (text: string) => {
    setQuery(text);
    if (text.length < 3 || !sessionToken) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{ predictions: PlaceSuggestion[] }>(
        `/places/autocomplete?input=${encodeURIComponent(text)}`, "GET", sessionToken
      );
      setSuggestions(data.predictions || []);
    } catch (error) {
      console.warn("[LocationSearch] failed:", error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (place: PlaceSuggestion) => {
    if (place.lat != null && place.lng != null) {
      onSelectPlace(place.lat, place.lng, place.description.split(",")[0]);
    }
    setQuery("");
    setSuggestions([]);
    onClose();
  };

  const handleClose = () => {
    setQuery("");
    setSuggestions([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#9ca3af" />
            <TextInput
              style={styles.input}
              placeholder="Search city or location..."
              placeholderTextColor="#9ca3af"
              value={query}
              onChangeText={searchPlaces}
              autoFocus
            />
            {query.length > 0 && (
              <Pressable onPress={() => { setQuery(""); setSuggestions([]); }}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </Pressable>
            )}
            <Pressable onPress={handleClose}>
              <Ionicons name="close" size={22} color="#374151" />
            </Pressable>
          </View>
          {loading && <ActivityIndicator style={styles.loader} size="small" color={COLORS.primary} />}
          {suggestions.length > 0 && (
            <ScrollView nestedScrollEnabled style={styles.suggestionList}>
              {suggestions.map((item) => (
                <Pressable key={item.place_id} style={styles.suggestionItem} onPress={() => handleSelect(item)}>
                  <Ionicons name="location" size={18} color={COLORS.primary} />
                  <Text style={styles.suggestionText} numberOfLines={2}>{item.description}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  searchContainer: {
    backgroundColor: "#fff",
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 0,
  },
  loader: {
    marginTop: 12,
    alignSelf: "center",
  },
  suggestionList: {
    maxHeight: 320,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  suggestionText: {
    fontSize: 15,
    color: "#111827",
    flex: 1,
  },
});

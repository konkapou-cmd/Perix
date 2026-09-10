import { StyleSheet, Text, View, TextInput, Pressable, ActivityIndicator } from "react-native";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";
import Constants from "expo-constants";
import { openInMaps } from "../lib/utils/openMapUrl";

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
  const [mapError, setMapError] = useState<string | null>(null);

  const mapDivRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    const google = (window as any).google;
    setLatInput(String(lat));
    setLonInput(String(lng));
    if (!google?.maps?.Geocoder) {
      onLocationChange({ latitude: lat, longitude: lng });
      return;
    }
    if (!geocoderRef.current) geocoderRef.current = new google.maps.Geocoder();
    geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
      const address = status === "OK" && results?.[0] ? results[0].formatted_address : undefined;
      onLocationChange({ latitude: lat, longitude: lng, address });
      if (address) setSearchQuery(address);
    });
  }, [onLocationChange]);

  const placeMarker = useCallback((lat: number, lng: number) => {
    const google = (window as any).google;
    if (google?.maps && mapRef.current) {
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: { lat, lng },
          draggable: true,
        });
        markerRef.current.addListener("dragend", (e: any) => {
          if (!e?.latLng) return;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          mapRef.current?.panTo({ lat, lng });
          reverseGeocode(lat, lng);
        });
      } else {
        markerRef.current.setPosition({ lat, lng });
      }
      mapRef.current.panTo({ lat, lng });
    }
    reverseGeocode(lat, lng);
  }, [reverseGeocode]);

  const initMap = useCallback(() => {
    if (!mapDivRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) {
      setMapError("Map failed to load");
      return;
    }
    const initial = location
      ? { lat: location.latitude, lng: location.longitude }
      : { lat: 52.52, lng: 13.405 };
    const map = new google.maps.Map(mapDivRef.current, {
      center: initial,
      zoom: 13,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
    });
    mapRef.current = map;
    map.addListener("click", (e: any) => {
      if (!e?.latLng) return;
      placeMarker(e.latLng.lat(), e.latLng.lng());
    });
    if (location) {
      placeMarker(location.latitude, location.longitude);
    } else if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try {
            map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            map.setZoom(13);
          } catch (e) {}
        },
        () => {},
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
      );
    }
  }, [location?.latitude, location?.longitude]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const google = (window as any).google;
    if (google?.maps) {
      initMap();
      return;
    }
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      const wait = setInterval(() => {
        if ((window as any).google?.maps) {
          clearInterval(wait);
          initMap();
        }
      }, 300);
      return () => clearInterval(wait);
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.onload = () => initMap();
    script.onerror = () => setMapError("Map failed to load");
    document.head.appendChild(script);
    return () => {};
  }, [initMap]);

  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }

    setSearching(true);
    try {
      const corsProxy = "https://corsproxy.io/?";
      const apiUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&types=geocode`;
      
      const response = await fetch(corsProxy + encodeURIComponent(apiUrl));
      const data = await response.json();
      if (data.predictions) {
        setPredictions(data.predictions);
        setShowPredictions(true);
      }
    } catch (error) {
      console.error("Places search error:", error);
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1`;
        const response = await fetch(nominatimUrl, {
          headers: { "User-Agent": "Perix App" }
        });
        const data = await response.json();
        if (data && data.length > 0) {
          const nominatimPredictions = data.slice(0, 5).map((item: any, index: number) => ({
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
    
    if (lat && lon) {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      placeMarker(latitude, longitude);
      setSearching(false);
      return;
    }

    try {
      const corsProxy = "https://corsproxy.io/?";
      const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(corsProxy + encodeURIComponent(apiUrl));
      const data = await response.json();
      
      if (data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location;
        placeMarker(lat, lng);
      }
    } catch (error) {
      console.error("Place details error:", error);
    }
    setSearching(false);
  }, [placeMarker]);

  const handleApply = () => {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      placeMarker(lat, lon);
    }
  };

  const openGoogleMaps = () => {
    if (location) {
      openInMaps({ latitude: location.latitude, longitude: location.longitude });
    } else {
      openInMaps({});
    }
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.hint}>Tap the map to set your exact location (no street name needed)</Text>

      {/* Interactive Map */}
      <View style={styles.mapContainer}>
        {mapError ? (
          <View style={styles.mapFallback}>
            <Ionicons name="alert-circle-outline" size={28} color="#9ca3af" />
            <Text style={styles.mapFallbackText}>{mapError}</Text>
          </View>
        ) : (
          React.createElement("div", {
            ref: mapDivRef,
            style: { width: "100%", height: "100%" },
          })
        )}
        {location && (
          <View style={styles.mapBadge}>
            <Ionicons name="location" size={14} color="#fff" />
            <Text style={styles.mapBadgeText}>
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </Text>
          </View>
        )}
      </View>

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
          {searching && <ActivityIndicator size="small" color={COLORS.primaryDark} />}
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
        
        {showPredictions && predictions.length > 0 && (
          <View style={styles.predictionsContainer}>
            {predictions.map((item: any) => (
              <Pressable
                key={item.place_id}
                style={styles.predictionItem}
                onPress={() => selectPlace(item.place_id, item.description, item.lat, item.lon)}
              >
                <Ionicons name="location-outline" size={18} color={COLORS.primaryDark} />
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
          <Ionicons name="map-outline" size={18} color={COLORS.primaryDark} />
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
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    padding: 16,
  },
  hint: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 12,
    textAlign: "center",
  },
  mapContainer: {
    height: 240,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
    position: "relative",
    backgroundColor: "#e5e7eb",
  },
  mapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapFallbackText: {
    fontSize: 13,
    color: "#6b7280",
  },
  mapBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  mapBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
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
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.primaryDark,
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
    color: COLORS.primaryDark,
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

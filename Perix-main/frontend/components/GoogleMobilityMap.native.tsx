import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import Constants from "expo-constants";
import type { GoogleTransitLine, GoogleTransitStop, GoogleVehicleMarker } from "./GoogleMobilityMap";

type Props = {
  location?: { latitude: number; longitude: number };
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  focusRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null;
  focusToken?: number;
  vehicles?: GoogleVehicleMarker[];
  transitLines?: GoogleTransitLine[];
  transitStops?: GoogleTransitStop[];
  planLines?: GoogleTransitLine[];
  pinLocation?: { latitude: number; longitude: number } | null;
  showUserLocation?: boolean;
  disabled?: boolean;
  initialZoom?: number | null;
  height?: number;
  onTransitLineClick?: (routeNumber: string, patternId?: string) => void;
  onTransitStopPress?: (stop: GoogleTransitStop) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  onZoomChange?: (zoom: number) => void;
  onRegionChangeComplete?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
};

const gmapsKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY ||
  "";

const APPROVED_MAP_ORIGINS: string[] = [
  "https://app.perixapp.com",
  // TODO: add the exact approved staging origin here (e.g. "https://<staging>.up.railway.app")
];

export default function GoogleMobilityMapNative(props: Props) {
  const {
    location,
    initialRegion,
    focusRegion,
    focusToken,
    vehicles = [],
    transitLines = [],
    transitStops = [],
    planLines = [],
    pinLocation,
    showUserLocation,
    initialZoom,
    height = 300,
    onTransitLineClick,
    onTransitStopPress,
    onMarkerPress,
    onMapPress,
    onZoomChange,
    onRegionChangeComplete,
  } = props;

  const webRef = useRef<WebView>(null);
  const [session, setSession] = useState<string | null>(null);

  // The Mobility map page is served by the frontend, not the backend API.
  // No silent fallback to production: if the URL is missing or not HTTPS, we
  // show an explicit "not configured" state instead of loading app.perixapp.com.
  const mobilityMapUrl =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_MOBILITY_MAP_URL ||
    process.env.EXPO_PUBLIC_MOBILITY_MAP_URL ||
    "";
  let mapOrigin = "";
  let mapUrl = "";
  if (mobilityMapUrl) {
    try {
      const parsed = new URL(mobilityMapUrl);
      if (parsed.protocol === "https:" && parsed.pathname === "/google-mobility-map.html" && APPROVED_MAP_ORIGINS.includes(parsed.origin)) {
        mapOrigin = parsed.origin;
        parsed.searchParams.set("key", gmapsKey);
        parsed.searchParams.set("locale", "de");
        mapUrl = parsed.toString();
      }
    } catch (e) {
      // invalid URL -> not configured
    }
  }

  useEffect(() => {
    if (!session || !webRef.current || !mapUrl) return;
    const payload = {
      lines: transitLines.map((l) => ({
        route_number: l.routeNumber,
        pattern_id: l.patternId,
        mode: l.mode,
        points: l.points,
        color: l.color,
        opacity: l.opacity,
        weight: l.weight,
      })),
      vehicles: vehicles.map((v) => ({
        id: v.id,
        latitude: v.latitude,
        longitude: v.longitude,
        type: v.type || "bus",
        label: v.label,
        estimated: !!v.estimated,
        path: v.path,
        progressM: v.progressM,
      })),
      stops: transitStops,
      planLines: planLines.map((l) => ({
        route_number: l.routeNumber,
        pattern_id: l.patternId,
        segment_id: l.segmentId,
        mode: l.mode,
        points: l.points,
        color: l.color,
        opacity: l.opacity,
        weight: l.weight,
      })),
      userLocation: showUserLocation && location?.latitude != null ? location : null,
      pin: pinLocation || null,
      focus: focusRegion && focusToken ? { latitude: focusRegion.latitude, longitude: focusRegion.longitude } : null,
      focusToken: focusToken ?? null,
      initialRegion: initialRegion ? { latitude: initialRegion.latitude, longitude: initialRegion.longitude } : null,
      initialZoom: initialZoom ?? null,
    };
    webRef.current.injectJavaScript(
      `window.postMessage(${JSON.stringify({ source: "perix-google-map", type: "update", payload })}); true;`
    );
  }, [session, mapUrl, transitLines, vehicles, transitStops, planLines, location, pinLocation, focusToken, focusRegion?.latitude, focusRegion?.longitude, showUserLocation, initialRegion, initialZoom]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      return;
    }
    if (!data || data.source !== "perix-google-map") return;
    if (data.type === "ready") setSession(data.session || Date.now().toString());
    if (data.type === "mapPress" && onMapPress) onMapPress(data.lat, data.lng);
    if (data.type === "markerPress" && onMarkerPress) onMarkerPress(data.id);
    if (data.type === "stopPress" && onTransitStopPress) {
      const stop = transitStops.find((s) => s.stop_id === data.stop_id);
      if (stop) onTransitStopPress({ ...stop, selected_platform_id: data.platform_id, selected_side: data.side });
    }
    if (data.type === "lineClick" && onTransitLineClick) onTransitLineClick(data.routeNumber, data.patternId);
    if (data.type === "zoomChange" && onZoomChange) onZoomChange(data.zoom);
    if (data.type === "regionChange" && onRegionChangeComplete) {
      onRegionChangeComplete({ minLat: data.minLat, maxLat: data.maxLat, minLng: data.minLng, maxLng: data.maxLng });
    }
  };

  const onShouldStartLoadWithRequest = (request: any) => {
    // Only allow navigation within the configured map origin. The Google Maps
    // API script is a resource load, not a navigation, so it is unaffected.
    if (!mapOrigin) return false;
    try {
      return new URL(request.url).origin === mapOrigin;
    } catch (e) {
      return false;
    }
  };

  if (!mapUrl) {
    return (
      <View style={[styles.wrap, { height }, styles.unconfigured]}>
        <Text style={styles.unconfiguredText}>Mobility map is not configured.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={webRef}
        originWhitelist={mapOrigin ? [mapOrigin] : ["https://*"]}
        source={{ uri: mapUrl }}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        javaScriptEnabled
        domStorageEnabled
        style={styles.web}
        containerStyle={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 12, overflow: "hidden" },
  web: { width: "100%", height: "100%", borderRadius: 12, backgroundColor: "#e8e8e8" },
  unconfigured: { alignItems: "center", justifyContent: "center", backgroundColor: "#e8e8e8" },
  unconfiguredText: { color: "#6b7280", fontSize: 13, textAlign: "center", paddingHorizontal: 16 },
});

import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import Constants from "expo-constants";
import type { VehicleApproach } from "../lib/mobilityApproach";
import { useMapSelection } from "../hooks/useMapSelection";
import MapLocationControl from "./shared/MapLocationControl";
import type { GoogleTransitLine, GoogleTransitStop, GoogleVehicleMarker } from "./GoogleMobilityMap";
import { vehicleBridgeUpdates, VehiclePathState } from "../lib/vehicleBridge";

type Props = {
  location?: { latitude: number; longitude: number };
  initialRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  focusRegion?: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null;
  focusToken?: number;
  vehicles?: GoogleVehicleMarker[];
  transitLines?: GoogleTransitLine[];
  transitStops?: GoogleTransitStop[];
  planLines?: GoogleTransitLine[];
  approaches?: VehicleApproach[];
  pinLocation?: { latitude: number; longitude: number } | null;
  showUserLocation?: boolean;
  disabled?: boolean;
  initialZoom?: number | null;
  height?: number;
  onTransitStopPress?: (stop: GoogleTransitStop) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  onZoomChange?: (zoom: number) => void;
  onRegionChangeComplete?: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
};

const gmapsKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GEO_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY ||
  process.env.EXPO_PUBLIC_GEO_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

const APPROVED_MAP_ORIGINS: string[] = [
  ...(Constants.expoConfig?.extra?.EXPO_PUBLIC_MOBILITY_MAP_ORIGINS ||
    process.env.EXPO_PUBLIC_MOBILITY_MAP_ORIGINS ||
    "").split(",").map((s: string) => s.trim()).filter(Boolean),
];
const EMPTY: never[] = [];

export default function GoogleMobilityMapNative(props: Props) {
  const selection = useMapSelection();
  const originChoiceRef = useRef(selection.revision);
  const consumedFocusRef = useRef("");
  const {
    location,
    initialRegion,
    focusRegion,
    focusToken,
    vehicles = EMPTY,
    transitLines = EMPTY,
    transitStops = EMPTY,
    planLines = EMPTY,
    approaches = EMPTY,
    pinLocation,
    showUserLocation,
    initialZoom,
    height = 300,
    onTransitStopPress,
    onMarkerPress,
    onMapPress,
    onZoomChange,
    onRegionChangeComplete,
  } = props;

  const webRef = useRef<WebView>(null);
  const [session, setSession] = useState<string | null>(null);
  const focusLatitude = focusRegion?.latitude;
  const focusLongitude = focusRegion?.longitude;
  const initialLatitude = initialRegion?.latitude;
  const initialLongitude = initialRegion?.longitude;
  const vehiclePathsRef = useRef({ session: null as string | null, paths: new Map() as VehiclePathState });

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

  const sendUpdate = useCallback((payload: object) => {
    if (!session || !webRef.current || !mapUrl) return;
    webRef.current.injectJavaScript(`window.postMessage(${JSON.stringify({ source: "perix-google-map", type: "update", payload })}); true;`);
  }, [session, mapUrl]);

  useEffect(() => {
    if (vehiclePathsRef.current.session !== session) vehiclePathsRef.current = { session, paths: new Map() };
    if (!session || !mapUrl) return;
    const { updates, paths } = vehicleBridgeUpdates(vehicles, vehiclePathsRef.current.paths);
    sendUpdate({ vehicles: updates });
    vehiclePathsRef.current.paths = paths;
  }, [session, mapUrl, sendUpdate, vehicles]);

  useEffect(() => {
    sendUpdate({ lines: transitLines.map(l => ({ route_number: l.routeNumber, pattern_id: l.patternId,
      mode: l.mode, points: l.points, color: l.color, opacity: l.opacity, weight: l.weight })) });
  }, [sendUpdate, transitLines]);

  useEffect(() => { sendUpdate({ stops: transitStops }); }, [sendUpdate, transitStops]);

  useEffect(() => {
    sendUpdate({
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
    });
  }, [sendUpdate, planLines]);

  useEffect(() => { sendUpdate({ approaches }); }, [sendUpdate, approaches]);

  useEffect(() => {
    if (!session || !webRef.current || !mapUrl) return;
    const focusKey = `${session}:${focusToken}`;
    const sendFocus = !!focusToken && consumedFocusRef.current !== focusKey;
    if (sendFocus) consumedFocusRef.current = focusKey;
    sendUpdate({
      userLocation: !selection.available && showUserLocation && location?.latitude != null ? location : null,
      pin: selection.available ? (selection.position ? { ...selection.position, source: selection.mode } : null) : pinLocation || null,
      focus: focusLatitude != null && focusLongitude != null && sendFocus ? { latitude: focusLatitude, longitude: focusLongitude } : null,
      focusToken: sendFocus ? focusToken : null,
      initialRegion: initialLatitude != null && initialLongitude != null ? { latitude: initialLatitude, longitude: initialLongitude } : null,
      initialZoom: initialZoom ?? null,
    });
  }, [session, mapUrl, sendUpdate, location, pinLocation, focusToken, focusLatitude, focusLongitude,
    showUserLocation, initialLatitude, initialLongitude, initialZoom, selection.position, selection.mode, selection.available]);

  useEffect(() => {
    if (!session || !webRef.current || originChoiceRef.current === selection.revision) return;
    originChoiceRef.current = selection.revision;
    if (selection.position) webRef.current.injectJavaScript(`window.postMessage(${JSON.stringify({
      source: "perix-google-map", type: "update", payload: { focus: selection.position, focusToken: `area-${selection.revision}` },
    })}); true;`);
  }, [session, selection.revision, selection.position]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch (e) {
      return;
    }
    if (!data || data.source !== "perix-google-map") return;
    if (data.type === "ready") setSession(data.session || Date.now().toString());
    if (data.type === "notReady") setSession(null);
    if (data.type === "mapPress" && onMapPress) onMapPress(data.lat, data.lng);
    if (data.type === "markerPress" && onMarkerPress) onMarkerPress(data.id);
    if (data.type === "stopPress" && onTransitStopPress) {
      const stop = transitStops.find((s) => s.stop_id === data.stop_id);
      if (stop) onTransitStopPress({ ...stop, selected_platform_id: data.platform_id, selected_side: data.side });
    }
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
      <MapLocationControl />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 12, overflow: "hidden" },
  web: { width: "100%", height: "100%", borderRadius: 12, backgroundColor: "#e8e8e8" },
  unconfigured: { alignItems: "center", justifyContent: "center", backgroundColor: "#e8e8e8" },
  unconfiguredText: { color: "#6b7280", fontSize: 13, textAlign: "center", paddingHorizontal: 16 },
});

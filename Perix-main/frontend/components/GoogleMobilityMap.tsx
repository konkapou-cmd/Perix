import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import type { VehicleApproach } from "../lib/mobilityApproach";
import { useMapSelection } from "../hooks/useMapSelection";
import MapLocationControl from "./shared/MapLocationControl";
import { vehicleBridgeUpdates, VehiclePathState } from "../lib/vehicleBridge";

export type GoogleTransitLine = {
  routeNumber?: string;
  patternId?: string;
  segmentId?: string;
  headsign?: string;
  mode?: "bus" | "tram" | "taxi";
  points: { latitude: number; longitude: number }[];
  color?: string;
  opacity?: number;
  weight?: number;
};

export type GoogleVehicleMarker = {
  id: string;
  journeyId?: string | null;
  latitude: number;
  longitude: number;
  type?: "bus" | "tram" | "taxi";
  label?: string | null;
  direction?: string | null;
  estimated?: boolean;
  heading?: number | null;
  path?: { latitude: number; longitude: number }[];
  progressM?: number | null;
  positionState?: string | null;
  speed?: number | null;
  motionState?: string | null;
};

export type GoogleTransitPlatform = {
  platform_id?: string;
  latitude?: number | null;
  longitude?: number | null;
  name?: string;
  directions?: string[];
  routes?: string[];
  side?: string | null;
};

export type GoogleTransitStop = {
  stop_id: string;
  name: string;
  latitude: number;
  longitude: number;
  platforms?: GoogleTransitPlatform[];
  selected_platform_id?: string;
  selected_side?: string | null;
};

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
  onReadyChange?: (ready: boolean) => void;
  showTrafficLayer?: boolean;
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

const EMPTY: never[] = [];

export default function GoogleMobilityMap(props: Props) {
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
    onReadyChange,
    showTrafficLayer = false,
    onTransitStopPress,
    onMarkerPress,
    onMapPress,
    onZoomChange,
    onRegionChangeComplete,
  } = props;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState<string | null>(null);
  const vehiclePathsRef = useRef({ session: null as string | null, paths: new Map() as VehiclePathState });
  const onReadyChangeRef = useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;

  useEffect(() => {
    onReadyChangeRef.current?.(false);
    return () => onReadyChangeRef.current?.(false);
  }, []);

  const mapUrl = `${typeof window !== "undefined" ? window.location.origin : "https://app.perixapp.com"}/google-mobility-map.html?key=${encodeURIComponent(gmapsKey)}&locale=de`;
  const focusLatitude = focusRegion?.latitude;
  const focusLongitude = focusRegion?.longitude;
  const initialLatitude = initialRegion?.latitude;
  const initialLongitude = initialRegion?.longitude;

  // Vehicles get the first update; static layers never gate their visibility.
  useEffect(() => {
    if (vehiclePathsRef.current.session !== session) {
      vehiclePathsRef.current = { session, paths: new Map() };
    }
    if (!session || !iframeRef.current?.contentWindow) return;
    const { updates, paths } = vehicleBridgeUpdates(vehicles, vehiclePathsRef.current.paths);
    const payload = { vehicles: updates };
    iframeRef.current.contentWindow.postMessage({ source: "perix-google-map", type: "update", payload }, window.location.origin);
    vehiclePathsRef.current.paths = paths;
  }, [session, vehicles]);

  // Static geometry and stop visibility have independent lifetimes.
  useEffect(() => {
    if (!session || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ source: "perix-google-map", type: "update", payload: {
      lines: transitLines.map(l => ({ route_number: l.routeNumber, pattern_id: l.patternId, mode: l.mode,
        points: l.points, color: l.color, opacity: l.opacity, weight: l.weight })),
    } }, window.location.origin);
  }, [session, transitLines]);

  useEffect(() => {
    if (!session || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ source: "perix-google-map", type: "update",
      payload: { stops: transitStops } }, window.location.origin);
  }, [session, transitStops]);

  useEffect(() => {
    if (!session || !iframeRef.current?.contentWindow) return;
    const payload = {
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
    };
    iframeRef.current.contentWindow.postMessage({ source: "perix-google-map", type: "update", payload }, window.location.origin);
  }, [session, planLines]);

  useEffect(() => {
    if (!session || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ source: "perix-google-map", type: "update",
      payload: { approaches } }, window.location.origin);
  }, [session, approaches]);

  useEffect(() => {
    if (!session || !iframeRef.current?.contentWindow) return;
    const focusKey = `${session}:${focusToken}`;
    const sendFocus = !!focusToken && consumedFocusRef.current !== focusKey;
    if (sendFocus) consumedFocusRef.current = focusKey;
    const payload = {
      userLocation: !selection.available && showUserLocation && location?.latitude != null ? location : null,
      pin: selection.available ? (selection.position ? { ...selection.position, source: selection.mode } : null) : pinLocation || null,
      focus: focusLatitude != null && focusLongitude != null && sendFocus ? { latitude: focusLatitude, longitude: focusLongitude } : null,
      focusToken: sendFocus ? focusToken : null,
      initialRegion: initialLatitude != null && initialLongitude != null ? { latitude: initialLatitude, longitude: initialLongitude } : null,
      initialZoom: initialZoom ?? null,
      showTrafficLayer,
    };
    iframeRef.current.contentWindow?.postMessage({ source: "perix-google-map", type: "update", payload }, window.location.origin);
  }, [session, location, pinLocation, focusToken, focusLatitude, focusLongitude, showUserLocation,
    initialLatitude, initialLongitude, initialZoom, showTrafficLayer, selection.position, selection.mode, selection.available]);

  useEffect(() => {
    if (!session || !iframeRef.current?.contentWindow || originChoiceRef.current === selection.revision) return;
    originChoiceRef.current = selection.revision;
    if (selection.position) iframeRef.current.contentWindow.postMessage({ source: "perix-google-map", type: "update",
      payload: { focus: selection.position, focusToken: `area-${selection.revision}` } }, window.location.origin);
  }, [session, selection.revision, selection.position]);

  // Map -> parent bridge
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== "perix-google-map") return;
      if (data.type === "ready" && typeof data.session === "string" && data.session) {
        setSession(data.session);
        onReadyChangeRef.current?.(true);
      }
      if (data.type === "notReady") {
        setSession(null);
        onReadyChangeRef.current?.(false);
      }
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
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMapPress, onMarkerPress, onTransitStopPress, onZoomChange, onRegionChangeComplete, transitStops]);

  return (
    <View style={[styles.wrap, { height }]}>
      <iframe
        ref={iframeRef}
        src={mapUrl}
        onLoad={() => {
          // initMap may finish before iframe load; ask the loaded document again.
          iframeRef.current?.contentWindow?.postMessage({ source: "perix-google-map", type: "requestReady" }, window.location.origin);
        }}
        title="perix-google-map"
        style={{ width: "100%", height: "100%", border: 0, borderRadius: 12 }}
        allow="geolocation"
      />
      <MapLocationControl />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 0, marginHorizontal: 16, borderRadius: 12, overflow: "hidden" },
});

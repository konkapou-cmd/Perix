import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";

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
  latitude: number;
  longitude: number;
  type?: "bus" | "tram" | "taxi";
  label?: string | null;
  estimated?: boolean;
  heading?: number | null;
  path?: { latitude: number; longitude: number }[];
  progressM?: number | null;
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
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GEO_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY ||
  process.env.EXPO_PUBLIC_GEO_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

export default function GoogleMobilityMap(props: Props) {
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

const iframeRef = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState<string | null>(null);

  const mapUrl = `${typeof window !== "undefined" ? window.location.origin : "https://app.perixapp.com"}/google-mobility-map.html?key=${encodeURIComponent(gmapsKey)}&locale=de`;

// Parent -> map bridge
  useEffect(() => {
    if (!session || !iframeRef.current?.contentWindow) return;
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
    iframeRef.current.contentWindow?.postMessage({ source: "perix-google-map", type: "update", payload }, window.location.origin);
  }, [session, transitLines, vehicles, transitStops, planLines, location, pinLocation, focusToken, focusRegion?.latitude, focusRegion?.longitude, showUserLocation, initialRegion, initialZoom]);

  // Map -> parent bridge
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
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
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onMapPress, onMarkerPress, onTransitStopPress, onTransitLineClick, onZoomChange, onRegionChangeComplete, transitStops]);

return (
    <View style={[styles.wrap, { height }]}>
      <iframe
        ref={iframeRef}
        src={mapUrl}
        title="perix-google-map"
        style={{ width: "100%", height: "100%", border: 0, borderRadius: 12 }}
        allow="geolocation"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 12, overflow: "hidden" },
});

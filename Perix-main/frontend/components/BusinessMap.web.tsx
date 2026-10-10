import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { StyleSheet, Text, View, Platform, Pressable, Modal, Image as RNImage, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental, Job, Service } from "../lib/api";
import { formatEventDate } from "../lib/formatDate";
import { translateCategory } from "../lib/categoryTranslation";
import { COLORS } from "../lib/designTokens";
import { useTranslation } from "react-i18next";
import { getCurrentLanguageSync } from "../i18n";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  pinColor?: string;
  pinInnerColor?: string;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product" | "bus" | "tram" | "taxi";
  heading?: number | null;
  estimated?: boolean;
  label?: string | null;
  /** The canonical line geometry the vehicle rides - animations follow
   *  every curve of the road/rail instead of cutting straight across. */
  path?: { latitude: number; longitude: number }[];
  /** Backend progress along the canonical line (meters) - authoritative
   *  position, never re-projected in the browser. */
  progressM?: number | null;
  positionState?: string | null;
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  location?: { latitude: number; longitude: number };
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  focusRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  focusToken?: number;
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  jobs?: Job[];
  services?: Service[];
  markers?: MapMarker[];
  extraMarkers?: MapMarker[];
  /** Thin transit route lines drawn under the markers (bus/tram networks). */
  transitLines?: {
    points: { latitude: number; longitude: number }[];
    color: string;
    opacity?: number;
    weight?: number;
    routeNumber?: string;
  }[];
  onTransitLineClick?: (routeNumber: string, patternId?: string) => void;
  /** Transit stops rendered as clickable bus/tram pins (zoom-aware). */
  transitStops?: {
    stop_id: string;
    name: string;
    latitude: number;
    longitude: number;
    modes: ("bus" | "tram")[];
    routes: { route_number: string; mode: "bus" | "tram" }[];
    platforms?: {
      platform_id: string;
      latitude?: number | null;
      longitude?: number | null;
      name?: string;
      directions?: string[];
      side?: string | null;
    }[];
  }[];
  onTransitStopPress?: (stop: {
    stop_id: string;
    name: string;
    latitude: number;
    longitude: number;
    modes: ("bus" | "tram")[];
    routes: { route_number: string; mode: "bus" | "tram" }[];
  }) => void;
  /** Live road closures (TomTom Traffic) as red dashed segments. */
  closures?: {
    id: string;
    points: { latitude: number; longitude: number }[];
    from?: string;
    to?: string;
    description?: string;
  }[];
  onClosureClick?: (closure: {
    id: string;
    from?: string;
    to?: string;
    description?: string;
  }) => void;
  /** Journey-plan route: walking legs light blue, tram green, bus blue. */
  planLines?: {
    points: { latitude: number; longitude: number }[];
    color: string;
    weight?: number;
    opacity?: number;
  }[];
  showUserLocation?: boolean;
  userPinImage?: string | null;
  pinLocation?: { latitude: number; longitude: number } | null;
  onRegionChange?: (bounds: MapBounds) => void;
  onRegionChangeComplete?: (bounds: MapBounds) => void;
  onZoomChange?: (zoom: number) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  height?: number;
  disabled?: boolean;
  disabledHint?: string;
  staticMode?: boolean;
};

const googleKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GEO_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GEO_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

// Vehicle icon scale: smaller, proportional city vehicles. zoom 10 -> 0.35,
// zoom 14 -> 0.78, zoom 16 -> 0.89, zoom 18+ -> 1.05.
const vehicleScale = (zoom: number) => 0.78 * Math.max(0.45, Math.min(1.35, zoom / 14));

const haversineMeters = (
  a: { lat?: number; lng?: number; latitude?: number; longitude?: number },
  b: { lat?: number; lng?: number; latitude?: number; longitude?: number }
) => {
  const alat = a.lat ?? a.latitude!;
  const alng = a.lng ?? a.longitude!;
  const blat = b.lat ?? b.latitude!;
  const blng = b.lng ?? b.longitude!;
  const R = 6371000;
  const dLat = ((blat - alat) * Math.PI) / 180;
  const dLng = ((blng - alng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((alat * Math.PI) / 180) * Math.cos((blat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

// Vehicles move as PROGRESS along their canonical polyline - the icon
// follows the road/rail around every curve. Straight lat/lng lerp between
// polls would cut corners across buildings.
const polylineCumulative = (points: { latitude: number; longitude: number }[]): number[] => {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  return cum;
};

const pointAtProgress = (
  points: { latitude: number; longitude: number }[],
  cum: number[],
  progress: number
): { latitude: number; longitude: number } => {
  if (points.length === 1) return points[0];
  const total = cum[cum.length - 1] || 1;
  const p = Math.max(0, Math.min(total, progress));
  for (let i = 0; i < cum.length - 1; i++) {
    if (cum[i + 1] < p) continue;
    const span = Math.max(0.001, cum[i + 1] - cum[i]);
    const f = Math.min(1, Math.max(0, (p - cum[i]) / span));
    return {
      latitude: points[i].latitude + (points[i + 1].latitude - points[i].latitude) * f,
      longitude: points[i].longitude + (points[i + 1].longitude - points[i].longitude) * f,
    };
  }
  return points[points.length - 1];
};

const progressOfPoint = (
  points: { latitude: number; longitude: number }[],
  cum: number[],
  lat: number,
  lng: number
): number => {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = points[i].latitude;
    const y0 = points[i].longitude;
    const x1 = points[i + 1].latitude;
    const y1 = points[i + 1].longitude;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const denom = dx * dx + dy * dy;
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((lat - x0) * dx + (lng - y0) * dy) / denom));
    const d = haversineMeters({ lat, lng }, { lat: x0 + t * dx, lng: y0 + t * dy });
    if (d < bestD) {
      bestD = d;
      best = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return best;
};

// Cartoon transit icons (SVG) with the route number on a side plate.
// Bus: white + light blue. Tram: white + dark green, articulated in two
// segments with pantograph and doors. Both face right; rotation = heading - 90deg.
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const routePlateText = (num: string, x: number, fontSize: number, y: number) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" fill="#ffffff">${escapeHtml(num)}</text>`;

const busSvg = (label?: string | null, deg = 0) => {
  const num = (label || "").trim();
  const plate = num
    ? `<rect x="32.2" y="6" width="8" height="6.2" rx="1.6" fill="#1E3A8A"/>` +
      routePlateText(num, 36.2, num.length > 2 ? 3.4 : 4.6, 10.7)
    : "";
  // Square transparent canvas: the 46x26 bus rotates inside a 64x64
  // viewport without being clipped when pointing north/south.
  return `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="bs" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#0A143C" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g transform="translate(9 19)">
    <g transform="rotate(${deg} 23 13)" filter="url(#bs)">
    <rect x="1.2" y="3" width="43.6" height="17" rx="5.5" fill="#ffffff" stroke="#1E3A8A" stroke-width="2"/>
    <rect x="4" y="6" width="6" height="6" rx="1.5" fill="#59ABE3"/>
    <rect x="12" y="6" width="5.5" height="6" rx="1.5" fill="#BFDFF7"/>
    <rect x="19" y="6" width="5.5" height="6" rx="1.5" fill="#BFDFF7"/>
    <rect x="26" y="6" width="5.5" height="6" rx="1.5" fill="#BFDFF7"/>
    ${plate}
    <rect x="40.5" y="6.2" width="4.2" height="6" rx="1.4" fill="#59ABE3"/>
    <rect x="36.5" y="1" width="7" height="3.4" rx="1.7" fill="#59ABE3"/>
    <circle cx="11" cy="20.5" r="3.4" fill="#1E3A8A"/>
    <circle cx="35" cy="20.5" r="3.4" fill="#1E3A8A"/>
    <circle cx="11" cy="20.5" r="1.4" fill="#ffffff"/>
    <circle cx="35" cy="20.5" r="1.4" fill="#ffffff"/>
    </g>
  </g>
</svg>`;
};

const tramSvg = (label?: string | null, deg = 0) => {
  const num = (label || "").trim();
  const plate = num
    ? `<rect x="8.2" y="10.8" width="11" height="6.8" rx="1.6" fill="#166534"/>` +
      routePlateText(num, 13.7, num.length > 2 ? 3.9 : 5.2, 15.9)
    : "";
  // Square transparent canvas: the 66x30 tram rotates inside an 82x82
  // viewport without being clipped when pointing north/south.
  return `<svg width="82" height="82" viewBox="0 0 82 82" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ts" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#0A143C" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g transform="translate(8 26)">
    <g transform="rotate(${deg} 33 15)" filter="url(#ts)">
    <line x1="8" y1="1.5" x2="8" y2="9" stroke="#166534" stroke-width="2.2"/>
    <line x1="3" y1="1.5" x2="26" y2="1.5" stroke="#166534" stroke-width="1.7"/>
    <rect x="1.2" y="9" width="29" height="13" rx="4" fill="#ffffff" stroke="#166534" stroke-width="2"/>
    <rect x="35.8" y="9" width="29" height="13" rx="4" fill="#ffffff" stroke="#166534" stroke-width="2"/>
    <rect x="30.3" y="12.2" width="5.5" height="6" rx="2" fill="#0E4022"/>
    <rect x="1.8" y="10.8" width="4.6" height="7" rx="1.8" fill="#BFE3C8"/>
    <rect x="21.5" y="11.5" width="4.5" height="5" rx="1.3" fill="#BFE3C8"/>
    <rect x="39" y="11.5" width="4.5" height="5" rx="1.3" fill="#BFE3C8"/>
    <rect x="45.5" y="11.5" width="4.5" height="5" rx="1.3" fill="#BFE3C8"/>
    <rect x="52" y="11.5" width="4.5" height="5" rx="1.3" fill="#BFE3C8"/>
    <rect x="58" y="10.8" width="4.6" height="7" rx="1.8" fill="#BFE3C8"/>
    <rect x="26.6" y="15.8" width="3.8" height="6" rx="0.9" fill="#0E4022"/>
    <rect x="46.5" y="16.2" width="4.6" height="5.4" rx="1" fill="#0E4022"/>
    ${plate}
    <circle cx="8" cy="23.5" r="3" fill="#166534"/>
    <circle cx="22.5" cy="23.5" r="3" fill="#166534"/>
    <circle cx="43.5" cy="23.5" r="3" fill="#166534"/>
    <circle cx="57.5" cy="23.5" r="3" fill="#166534"/>
    <circle cx="8" cy="23.5" r="1.2" fill="#ffffff"/>
    <circle cx="22.5" cy="23.5" r="1.2" fill="#ffffff"/>
    <circle cx="43.5" cy="23.5" r="1.2" fill="#ffffff"/>
    <circle cx="57.5" cy="23.5" r="1.2" fill="#ffffff"/>
    </g>
  </g>
</svg>`;
};

let googleScriptLoaded = false;
let googleScriptPromise: Promise<void> | null = null;

/** Native google.maps.Marker icon for a transit vehicle: SVG data URL,
 *  scaled size + SVG-internal rotation (deterministic - the icon faces
 *  the direction of travel, never sideways). The map pins the marker to
 *  its geographic coordinate through pan/zoom - it can never drift. */
const makeVehicleIcon = (google: any, rec: any) => {
  const isTram = rec.type === "tram";
  const canvas = isTram ? 82 : 64;
  const w = Math.max(16, Math.round(canvas * rec.scale));
  const heading = typeof rec.heading === "number" ? rec.heading : 0;
  // SVG is drawn facing RIGHT (east): rotate so the nose points at the
  // heading. heading 0 (north) -> -90; heading 90 (east) -> 0.
  const deg = Math.round((heading - 90) * 10) / 10;
  return {
    url:
      "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(isTram ? tramSvg(rec.label, deg) : busSvg(rec.label, deg)),
    scaledSize: new google.maps.Size(w, w),
    anchor: new google.maps.Point(Math.round(w / 2), Math.round(w / 2)),
  };
};

/** Kick off the Google Maps script load early (before a map mounts) so the
 *  first map opens immediately instead of waiting for the script. */
export function preloadGoogleMaps() {
  if (Platform.OS !== "web") return;
  void loadGoogleScript().catch(() => {});
}

function loadGoogleScript() {
  if (googleScriptLoaded && (window as any).google?.maps?.Map) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).google?.maps?.Map) { googleScriptLoaded = true; resolve(); return; }
    const script = document.createElement("script");
    // Classic (non-async) loader: everything loads in one script, so
    // `google.maps.Map` is available on onload — avoids the async bootstrap
    // chunks that Brave/ad-blockers intercept (causing "Map is not a constructor").
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleKey}&language=${encodeURIComponent(getCurrentLanguageSync())}`;
    script.async = true;
    script.onload = () => {
      if (!(window as any).google?.maps?.Map) {
        reject(new Error("Google Maps API not available"));
        googleScriptPromise = null;
        return;
      }
      googleScriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      googleScriptPromise = null;
      reject(new Error("Google Maps script load failed"));
    };
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

export default function BusinessMap({
  location,
  initialRegion,
  focusRegion,
  focusToken,
  businesses = [],
  events = [],
  activities = [],
  artists = [],
  rentals = [],
  jobs = [],
  services = [],
  markers,
  extraMarkers,
  transitLines,
  onTransitLineClick,
  transitStops,
  onTransitStopPress,
  planLines,
  closures,
  onClosureClick,
  showUserLocation,
  userPinImage,
  pinLocation,
  onRegionChange,
  onRegionChangeComplete,
  onZoomChange,
  onMarkerPress,
  onMapPress,
  height = 300,
  disabled = false,
  disabledHint = "Tap to enable location",
  staticMode = false,
}: Props) {
  const { t } = useTranslation();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const mapReadyRef = useRef(false);
  const [mapError, setMapError] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const enablingRef = useRef(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const centerLat = location?.latitude ?? initialRegion?.latitude ?? 52.52;
  const centerLng = location?.longitude ?? initialRegion?.longitude ?? 13.405;
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const lastBoundsRef = useRef<string>("");
  const prevCenterRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The map's one-time listeners must always call the LATEST props (stale
  // closures from the init render would keep old state like planPicking).
  const onMapPressRef = useRef(onMapPress);
  onMapPressRef.current = onMapPress;
  const onRegionChangeRef = useRef(onRegionChange);
  onRegionChangeRef.current = onRegionChange;
  const onRegionChangeCompleteRef = useRef(onRegionChangeComplete);
  onRegionChangeCompleteRef.current = onRegionChangeComplete;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const onClosureClickRef = useRef(onClosureClick);
  onClosureClickRef.current = onClosureClick;

  // Continuous vehicle motion: positions are interpolated in GEOGRAPHIC
  // space between polls (requestAnimationFrame), so vehicles glide along
  // their routes instead of jumping every 4s. Zooming in makes the same
  // geographic step cover more pixels - motion appears faster naturally.
  const animRunningRef = useRef(false);
  const animRafRef = useRef<number | null>(null);
  const loopTick = () => {
    let active = false;
    const now = Date.now();
    markersRef.current.forEach((rec: any) => {
      if (!rec || rec.animStart == null || !rec.marker) return;
      const t = Math.min(1, (now - rec.animStart) / rec.animDuration);
      if (rec.path && rec.cum) {
        // Progress interpolation along the canonical road/rail polyline:
        // the vehicle follows the curves, never a straight chord.
        rec.progNow = rec.progFrom + (rec.progTo - rec.progFrom) * t;
        rec.marker.setPosition(pointAtProgress(rec.path, rec.cum, rec.progNow));
      } else if (rec.geoTo) {
        const lat = rec.geoFrom.lat + (rec.geoTo.lat - rec.geoFrom.lat) * t;
        const lng = rec.geoFrom.lng + (rec.geoTo.lng - rec.geoFrom.lng) * t;
        rec.marker.setPosition({ lat, lng });
      }
      if (t >= 1) rec.animStart = null;
      else active = true;
    });
    if (active) {
      animRafRef.current = requestAnimationFrame(loopTick);
    } else {
      animRunningRef.current = false;
      animRafRef.current = null;
    }
  };
  const kickAnim = () => {
    if (animRunningRef.current) return;
    animRunningRef.current = true;
    animRafRef.current = requestAnimationFrame(loopTick);
  };
  const setVehicleTarget = (rec: any, pos: { lat: number; lng: number }, nowTs: number, targetProgressM?: number | null) => {
    // Anchored states never animate: the vehicle stands exactly on its
    // stop (STOP_ANCHOR) or terminus (TURNAROUND_ANCHOR).
    if (rec.positionState === "STOP_ANCHOR" || rec.positionState === "TURNAROUND_ANCHOR") {
      rec.animStart = null;
      rec.marker.setPosition(pos);
      return;
    }
    // Path mode: interpolate progress (meters along the line). The
    // backend progress_m is authoritative - no browser re-projection
    // (which can grab the wrong segment on loops/returns).
    if (rec.path && rec.path.length >= 2 && rec.cum) {
      const hasProgressM = typeof targetProgressM === "number" && Number.isFinite(targetProgressM);
      const toProg = hasProgressM
        ? (targetProgressM as number)
        : progressOfPoint(rec.path, rec.cum, pos.lat, pos.lng);
      if (!hasProgressM) {
        // Only when re-projecting in the browser: drop the path if the
        // position clearly does not belong to it. Backend progress_m
        // needs no such check - it is the authoritative position.
        const onPath = pointAtProgress(rec.path, rec.cum, toProg);
        const offDist = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: onPath.latitude, lng: onPath.longitude });
        if (offDist > 250) {
          rec.path = null;
          rec.cum = null;
          rec.progNow = null;
          rec.animStart = null;
          rec.marker.setPosition(pos);
          return;
        }
      }
      {
        let fromProg: number;
        if (rec.animStart != null) {
          const t = Math.min(1, (nowTs - rec.animStart) / rec.animDuration);
          fromProg = rec.progFrom + (rec.progTo - rec.progFrom) * t;
        } else {
          fromProg = rec.progNow ?? toProg;
        }
        const d = Math.abs(toProg - fromProg);
        const dt = rec.lastTs ? nowTs - rec.lastTs : 0;
        rec.lastTs = nowTs;
        if (d > 250 || dt <= 0 || dt > 30000) {
          // Snap: brand-new vehicle, trip change, or a stale update.
          rec.progFrom = toProg;
          rec.progTo = null;
          rec.animStart = null;
          rec.progNow = toProg;
          rec.marker.setPosition(pointAtProgress(rec.path, rec.cum, toProg));
        } else {
          rec.progFrom = fromProg;
          rec.progTo = toProg;
          // LIVE GPS: finish slightly before the next poll so the marker
          // never lags one sample behind; estimates glide the full span.
          if (rec.positionState === "LIVE_MATCHED") {
            rec.animDuration = Math.min(3500, Math.max(800, dt * 0.85));
          } else {
            rec.animDuration = Math.max(1500, Math.min(9000, dt));
          }
          rec.animStart = nowTs;
        }
        kickAnim();
        return;
      }
    }
    // Fallback: geographic lerp (no known line geometry). Bus/tram NEVER
    // interpolate through unknown space - they snap to the target (their
    // position is always a stop anchor or a verified coordinate). Only
    // taxis glide geographically.
    if (rec.isTransit) {
      rec.geoFrom = pos;
      rec.geoTo = null;
      rec.animStart = null;
      rec.marker.setPosition(pos);
      return;
    }
    let cur = rec.marker.getPosition();
    if (cur) cur = { lat: cur.lat(), lng: cur.lng() };
    else cur = pos;
    if (rec.animStart != null && rec.geoTo) {
      const t = Math.min(1, (nowTs - rec.animStart) / rec.animDuration);
      cur = {
        lat: rec.geoFrom.lat + (rec.geoTo.lat - rec.geoFrom.lat) * t,
        lng: rec.geoFrom.lng + (rec.geoTo.lng - rec.geoFrom.lng) * t,
      };
    }
    const d = haversineMeters(cur, pos);
    const dt = rec.lastTs ? nowTs - rec.lastTs : 0;
    rec.lastTs = nowTs;
    if (d > 250 || dt <= 0 || dt > 30000) {
      // Snap: brand-new vehicle, trip change, or a stale update.
      rec.geoFrom = pos;
      rec.geoTo = null;
      rec.animStart = null;
      rec.marker.setPosition(pos);
    } else {
      rec.geoFrom = cur;
      rec.geoTo = pos;
      rec.animDuration = Math.max(1500, Math.min(9000, dt));
      rec.animStart = nowTs;
    }
    kickAnim();
  };

  // Stop the animation loop when the map unmounts
  useEffect(() => {
    return () => {
      if (animRafRef.current != null) cancelAnimationFrame(animRafRef.current);
      animRunningRef.current = false;
      animRafRef.current = null;
    };
  }, []);
  const prevLocationRef = useRef<string>("");
  const businessesRef = useRef(businesses);
  businessesRef.current = businesses;
  const router = useRouter();

  const generatedMarkers: MapMarker[] = [
    ...businesses.map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      type: "business" as const,
      description: business.category,
      pinColor: business.root_category === "hotels" ? COLORS.pinHotel : COLORS.pinBusiness,
    })),
    ...events
      .filter(e => e.latitude != null && e.longitude != null)
      .map((event) => ({
        id: event.event_id,
        latitude: event.latitude!,
        longitude: event.longitude!,
        title: event.title,
        type: "event" as const,
        description: event.location || formatEventDate(event.start_time),
        pinColor: COLORS.pinEvent,
      })),
    ...activities
      .filter(a => a.latitude != null && a.longitude != null)
      .map((activity) => ({
        id: activity.activity_id,
        latitude: activity.latitude!,
        longitude: activity.longitude!,
        title: activity.title,
        type: "activity" as const,
        description: activity.location || `${formatEventDate(activity.date)} ${activity.time || ''}`,
        pinColor: COLORS.pinActivity,
      })),
    ...artists
      .filter(a => a.latitude != null && a.longitude != null)
      .map((artist) => ({
        id: artist.artist_id,
        latitude: artist.latitude!,
        longitude: artist.longitude!,
        title: artist.name,
        type: "artist" as const,
        description: artist.town || artist.genres?.join(", ") || "",
        pinColor: COLORS.pinClosed,
      })),
    ...rentals
      .filter(r => r.latitude != null && r.longitude != null)
      .map((rental) => ({
        id: rental.rental_id,
        latitude: rental.latitude!,
        longitude: rental.longitude!,
        title: rental.title,
        type: "rental" as const,
        description: rental.rent_price || rental.address || "",
        pinColor: COLORS.pinRental,
      })),
    ...jobs
      .filter(j => j.latitude != null && j.longitude != null)
      .map((job) => ({
        id: job.job_id,
        latitude: job.latitude!,
        longitude: job.longitude!,
        title: job.title,
        type: "job" as const,
        description: job.work_location || "",
        pinColor: COLORS.pinJob,
      })),
    ...services
      .filter(s => s.latitude != null && s.longitude != null && s.root_category !== "rentals" && s.root_category !== "rental-real-estate")
      .map((service) => ({
        id: service.service_id,
        latitude: service.latitude!,
        longitude: service.longitude!,
        title: service.name,
        type: "service" as const,
        description: service.address || "",
        pinColor: COLORS.pinService,
      })),
  ];

  const allMarkers: MapMarker[] = markers ?? [
    ...generatedMarkers,
    ...(extraMarkers ?? []),
  ];

  // Stable content signature — arrays are recreated every render, so depend on contents instead
  const markersVersion = useMemo(() => {
    const parts: string[] = [];
    allMarkers.forEach((m) => {
      parts.push(
        `${m.id}|${m.latitude}|${m.longitude}|${m.pinColor || ""}|${m.pinInnerColor || ""}` +
        `|s${m.positionState || ""}|p${m.progressM ?? ""}` +
        (m.path && m.path.length ? `|l${m.path.length}:${m.path[0]?.latitude}` : "")
      );
    });
    return parts.join(";");
  }, [allMarkers]);

  const groupedMarkers = useMemo(() => {
    const groups = new Map<string, MapMarker[]>();
    allMarkers.forEach((m) => {
      const key = `${m.latitude.toFixed(5)}_${m.longitude.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return Array.from(groups.entries()).map(([key, items]) => {
      const uniqueColors: string[] = [];
      items.forEach((i) => {
        if (i.pinColor && !uniqueColors.includes(i.pinColor)) uniqueColors.push(i.pinColor);
        if (i.pinInnerColor && !uniqueColors.includes(i.pinInnerColor)) uniqueColors.push(i.pinInnerColor);
      });
      return {
        key,
        items,
        latitude: items[0].latitude,
        longitude: items[0].longitude,
        count: items.length,
        pinColor: items.length === 1 ? items[0].pinColor ?? COLORS.pinClosed : "#264348",
        pinInnerColor: items.length === 1 ? items[0].pinInnerColor : undefined,
        memberColors: items.length > 1 ? uniqueColors.slice(0, 4) : [],
        type: items[0].type,
        heading: items[0].heading ?? null,
        estimated: items[0].estimated ?? false,
        path: items[0].path,
        progressM: items[0].progressM ?? null,
        positionState: items[0].positionState ?? null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersVersion]);

  const [selectedGroup, setSelectedGroup] = useState<MapMarker[] | null>(null);

  // Init map — runs once per map div lifetime (disabled toggles or unmount)
  useEffect(() => {
    if (!mapDivRef.current || mapError) return;
    if (mapRef.current) return; // map already alive for this div
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const google = (window as any).google;
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom: 14,
          disableDefaultUI: staticMode,
          zoomControl: !staticMode,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: !staticMode,
          gestureHandling: staticMode ? "none" : "greedy",
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#5C7A99' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#EDF4FB' }] },
            { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#DCE8F4' }] },
            { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#7C97B3' }] },
            { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#5C7A99' }] },
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#C8E2F4' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#EDF4FB' }] },
            { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7C97B3' }] },
            { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E2EEF9' }] },
            { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4A6B8C' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#59ABE3' }] },
            { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#FFFFFF' }] },
          ],
        });

        map.addListener("bounds_changed", () => {
          // Freeze vehicle glide animations while the map moves: the icons
          // must stay anchored to their GEOGRAPHIC position during a pan,
          // never keep sliding (which reads as 'following the map').
          markersRef.current.forEach((rec: any) => {
            if (rec?.animStart != null) {
              rec.animStart = null;
              if (rec.marker && rec.path && rec.cum && rec.progNow != null) {
                rec.marker.setPosition(pointAtProgress(rec.path, rec.cum, rec.progNow));
              }
            }
          });
          const bounds = map.getBounds();
          if (!bounds) return;
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const key = `${sw.lat()},${ne.lat()},${sw.lng()},${ne.lng()}`;
          if (key === lastBoundsRef.current) return;
          lastBoundsRef.current = key;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onRegionChangeCompleteRef.current?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
          }, 500);
          onRegionChangeRef.current?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
        });

        map.addListener("click", (e: any) => {
          onMapPressRef.current?.(e.latLng.lat(), e.latLng.lng());
        });

        map.addListener("zoom_changed", () => {
          const zoom = map.getZoom() || 14;
          const scale = Math.max(0.8, Math.min(1.7, zoom / 12));
          const vscale = vehicleScale(zoom);
          // Local rendering only: resize existing pins/markers in place -
          // nothing is destroyed or recreated on zoom (persistent map).
          markersRef.current.forEach((rec: any) => {
            try { rec?.resize?.(scale, vscale); } catch (e) {}
          });
          onZoomChangeRef.current?.(zoom);
        });

        if (cancelled) return;
        mapRef.current = map;
        mapReadyRef.current = true;
        setMapReady(true);
        console.log("[WebMap] initialized zoom=" + map.getZoom());
        onZoomChangeRef.current?.(map.getZoom() || 14);
      })
      .catch((e) => { console.error("[WebMap] init failed", e); setMapError(true); });
    return () => {
      cancelled = true;
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, [disabled, mapError]);

  // Sync markers — DOM-based pins (OverlayView) for pixel-perfect app-style rendering
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) {
      console.log("[WebMap] markers skipped (mapRef=" + !!mapRef.current + " ready=" + mapReadyRef.current + ")");
      return;
    }
    const google = (window as any).google;

    // Preserve transit vehicle markers so estimated positions animate
    // smoothly between polls instead of jumping.
    const existingTransit = new Map<string, any>();
    markersRef.current.forEach((rec: any) => {
      if (rec?.vehicleId) {
        existingTransit.set(rec.vehicleId, rec);
      } else {
        try { rec?.overlay?.setMap(null); } catch (e) {}
      }
    });
    markersRef.current = [];

    const zoom = mapRef.current?.getZoom?.() || 14;
    const zoomScale = Math.max(0.8, Math.min(1.7, zoom / 12));
    const vScale = vehicleScale(zoom);

    // Split transit vehicles from the static pins.
    const pinGroups: typeof groupedMarkers = [];
    const transitMarkers: MapMarker[] = [];
    groupedMarkers.forEach((group) => {
      const transitItems = group.items.filter((i) => i.type === "bus" || i.type === "tram");
      if (transitItems.length > 0 && transitItems.length === group.items.length) {
        transitItems.forEach((m) => transitMarkers.push(m));
        return;
      }
      pinGroups.push(group);
    });

    // Deterministic priority: real positions before estimates, then by id
    const sortedTransit = [...transitMarkers].sort((a, b) => {
      const pa = a.estimated ? 1 : 0;
      const pb = b.estimated ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return (a.id || "").localeCompare(b.id || "");
    });

    console.log(
      "[WebMap] markers: pins=" + pinGroups.length + " transit=" + transitMarkers.length +
      " vScale=" + vScale.toFixed(2)
    );

    pinGroups.forEach((group) => {
      const isGroup = group.count > 1;
      const baseSize = isGroup
        ? (group.count < 3 ? 26 : group.count < 10 ? 30 : group.count < 30 ? 34 : 40)
        : 22;
      const baseFont = group.count >= 100 ? 9 : group.count >= 10 ? 10.5 : 12;
      const sizePx = Math.round(baseSize * zoomScale);
      const innerSize = Math.round(Math.max(6, 8 * zoomScale));
      const fontSize = Math.min(17, baseFont * zoomScale);
      const pinColor = group.pinColor || "#264348";

      // Container div (positioned by OverlayView)
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.cursor = "pointer";
      container.style.userSelect = "none";

      const pin = document.createElement("div");
      pin.style.width = sizePx + "px";
      pin.style.height = sizePx + "px";
      pin.style.borderRadius = "50%";
      pin.style.backgroundColor = pinColor;
      pin.style.border = "2px solid #ffffff";
      pin.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
      pin.style.display = "flex";
      pin.style.alignItems = "center";
      pin.style.justifyContent = "center";
      pin.style.position = "relative";
      pin.style.transform = "translate(-50%, -50%)";
      pin.style.boxSizing = "border-box";
      container.appendChild(pin);

      if (isGroup) {
        const countText = document.createElement("div");
        countText.textContent = String(group.count);
        countText.style.color = "#ffffff";
        countText.style.fontWeight = "700";
        countText.style.fontFamily = "Arial, sans-serif";
        countText.style.fontSize = fontSize + "px";
        countText.style.lineHeight = "1";
        pin.appendChild(countText);

        const dots: HTMLDivElement[] = [];
        group.memberColors.slice(0, 4).forEach((c, i) => {
          const dot = document.createElement("div");
          const dotSize = Math.round(Math.max(4, 5 * zoomScale));
          dot.style.position = "absolute";
          dot.style.width = dotSize + "px";
          dot.style.height = dotSize + "px";
          dot.style.borderRadius = "50%";
          dot.style.backgroundColor = c;
          dot.style.border = "1px solid #fff";
          const angle = (i / Math.min(group.memberColors.length, 4)) * Math.PI * 2;
          const r = sizePx / 2 + 3;
          dot.style.left = sizePx / 2 + Math.cos(angle) * r - dotSize / 2 + "px";
          dot.style.top = sizePx / 2 + Math.sin(angle) * r - dotSize / 2 + "px";
          pin.appendChild(dot);
          dots.push(dot);
        });

        const resize = (scale: number) => {
          const px = Math.round(baseSize * scale);
          pin.style.width = px + "px";
          pin.style.height = px + "px";
          countText.style.fontSize = Math.min(17, baseFont * scale) + "px";
          dots.forEach((dot, i) => {
            const dotSize = Math.round(Math.max(4, 5 * scale));
            dot.style.width = dotSize + "px";
            dot.style.height = dotSize + "px";
            const angle = (i / Math.min(group.memberColors.length, 4)) * Math.PI * 2;
            const r = px / 2 + 3;
            dot.style.left = px / 2 + Math.cos(angle) * r - dotSize / 2 + "px";
            dot.style.top = px / 2 + Math.sin(angle) * r - dotSize / 2 + "px";
          });
        };
        markersRef.current.push({ overlay: null as any, resize });
      } else if (group.pinInnerColor) {
        const inner = document.createElement("div");
        inner.style.width = innerSize + "px";
        inner.style.height = innerSize + "px";
        inner.style.borderRadius = "50%";
        inner.style.backgroundColor = group.pinInnerColor;
        pin.appendChild(inner);

        const resize = (scale: number) => {
          const px = Math.round(baseSize * scale);
          pin.style.width = px + "px";
          pin.style.height = px + "px";
          const ins = Math.round(Math.max(6, 8 * scale));
          inner.style.width = ins + "px";
          inner.style.height = ins + "px";
        };
        markersRef.current.push({ overlay: null as any, resize });
      } else {
        const resize = (scale: number) => {
          const px = Math.round(baseSize * scale);
          pin.style.width = px + "px";
          pin.style.height = px + "px";
        };
        markersRef.current.push({ overlay: null as any, resize });
      }

      class PinOverlay extends google.maps.OverlayView {
        div: HTMLDivElement;
        pos: { lat: number; lng: number };
        constructor(div: HTMLDivElement, pos: { lat: number; lng: number }) {
          super();
          this.div = div;
          this.pos = pos;
        }
        onAdd(this: any) {
          this.getPanes().overlayMouseTarget.appendChild(this.div);
        }
        draw(this: any) {
          const overlayProjection = this.getProjection();
          const point = overlayProjection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
          if (point) {
            this.div.style.left = point.x + "px";
            this.div.style.top = point.y + "px";
          }
        }
        onRemove(this: any) {
          if (this.div.parentNode) this.div.parentNode.removeChild(this.div);
        }
      }

      const overlay = new PinOverlay(container, { lat: group.latitude, lng: group.longitude });
      overlay.setMap(mapRef.current);

      container.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isGroup) {
          setSelectedGroup(group.items);
          return;
        }
        const biz = businessesRef.current.find((b) => b.business_id === group.items[0].id);
        if (biz) setSelectedBusiness(biz);
        onMarkerPress?.(group.items[0].id);
      });

      const record = markersRef.current[markersRef.current.length - 1];
      if (record) record.overlay = overlay;
    });

    // Transit vehicles: NATIVE google.maps.Marker with an SVG icon. The
    // map itself pins each marker to its geographic coordinate through
    // pan/zoom - no custom DOM overlay can drift with map gestures.
    sortedTransit.forEach((rep) => {
      const existing = existingTransit.get(rep.id);
      if (existing) {
        const rec = existing;
        // Keep the vehicle's canonical path fresh (the resolved line can
        // change once, e.g. when the geometry worker completes it).
        if (rep.path && rep.path.length >= 2) {
          rec.path = rep.path;
          rec.cum = polylineCumulative(rep.path);
        } else {
          rec.path = null;
          rec.cum = null;
        }
        rec.heading = typeof rep.heading === "number" ? rep.heading : 0;
        rec.scale = vScale;
        rec.type = rep.type;
        rec.label = rep.label;
        rec.estimated = rep.estimated ?? false;
        rec.positionState = rep.positionState ?? null;
        setVehicleTarget(rec, { lat: rep.latitude, lng: rep.longitude }, Date.now(), rep.progressM ?? null);
        rec.marker.setIcon(makeVehicleIcon(google, rec));
        rec.marker.setOpacity(rec.estimated ? 0.72 : 1);
        markersRef.current.push(rec);
        return;
      }

      const marker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: rep.latitude, lng: rep.longitude },
        zIndex: google.maps.Marker.MAX_ZINDEX + 5,
        clickable: true,
      });
      const rec: any = {
        marker,
        resize: (_zoomScaleArg: number, vScaleArg?: number) => {
          const ns = vScaleArg ?? vehicleScale(mapRef.current?.getZoom?.() || 14);
          rec.scale = ns;
          rec.marker.setIcon(makeVehicleIcon(google, rec));
        },
        vehicleId: rep.id,
        heading: typeof rep.heading === "number" ? rep.heading : 0,
        scale: vScale,
        type: rep.type,
        label: rep.label,
        estimated: rep.estimated ?? false,
        isTransit: true,
        positionState: rep.positionState ?? null,
        geoFrom: { lat: rep.latitude, lng: rep.longitude },
        geoTo: null,
        animStart: null,
        lastTs: Date.now(),
      };
      // Attach the canonical line: from now on this vehicle glides along
      // the road/rail polyline (progress interpolation), never in a
      // straight chord between polls.
      if (rep.path && rep.path.length >= 2) {
        rec.path = rep.path;
        rec.cum = polylineCumulative(rep.path);
        const startProg =
          typeof rep.progressM === "number" && Number.isFinite(rep.progressM)
            ? rep.progressM
            : progressOfPoint(rec.path, rec.cum, rep.latitude, rep.longitude);
        rec.progNow = startProg;
        rec.progFrom = startProg;
        rec.progTo = null;
      }
      marker.setIcon(makeVehicleIcon(google, rec));
      marker.setOpacity(rec.estimated ? 0.72 : 1);
      marker.addListener("click", () => {
        onMarkerPress?.(rep.id);
      });
      markersRef.current.push(rec);
    });

    // Remove transit markers whose vehicle is no longer active
    const reusedIds = new Set(
      markersRef.current.map((r: any) => r?.vehicleId).filter(Boolean)
    );
    existingTransit.forEach((rec, id) => {
      if (!reusedIds.has(id)) {
        try { rec.marker.setMap(null); } catch (e) {}
      }
    });
  }, [groupedMarkers, mapReady]);

  // Transit route lines (thin polylines under the vehicle markers).
  // PERSISTENT: polylines are reused per (route+pattern) key - only
  // changed/new lines update, removed ones are deleted. Zoom/pan never
  // destroys and recreates them.
  const transitLinesRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    const google = (window as any).google;
    const seen = new Set<string>();
    (transitLines || []).forEach((line) => {
      if (!line.points || line.points.length < 2) return;
      const key = `${line.routeNumber || ""}:${(line as any).patternId || ""}`;
      seen.add(key);
      const existing = transitLinesRef.current.get(key);
      if (existing) {
        existing.setPath(line.points.map((p) => ({ lat: p.latitude, lng: p.longitude })));
        existing.setOptions({
          strokeColor: line.color,
          strokeWeight: line.weight ?? 2,
          strokeOpacity: line.opacity ?? 0.45,
        });
        return;
      }
      const poly = new google.maps.Polyline({
        path: line.points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: line.color,
        strokeWeight: line.weight ?? 2,
        strokeOpacity: line.opacity ?? 0.45,
        zIndex: 1,
      });
      if (onTransitLineClick && line.routeNumber) {
        poly.addListener("click", () => {
          onTransitLineClick(line.routeNumber as string, (line as any).patternId);
        });
      }
      poly.setMap(mapRef.current);
      transitLinesRef.current.set(key, poly);
    });
    transitLinesRef.current.forEach((poly, key) => {
      if (!seen.has(key)) {
        try { poly.setMap(null); } catch (e) {}
        transitLinesRef.current.delete(key);
      }
    });
  }, [transitLines, mapReady]);

  // Journey-plan route (walking light blue, tram green, bus blue) drawn on
  // top of the network lines so the passenger can follow the itinerary.
  const planLinesRef = useRef<any[]>([]);
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    planLinesRef.current.forEach((p) => {
      try { p.setMap(null); } catch (e) {}
    });
    planLinesRef.current = [];
    const google = (window as any).google;
    (planLines || []).forEach((line) => {
      if (!line.points || line.points.length < 2) return;
      const poly = new google.maps.Polyline({
        path: line.points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: line.color,
        strokeWeight: line.weight ?? 5,
        strokeOpacity: line.opacity ?? 0.9,
        zIndex: 2,
      });
      poly.setMap(mapRef.current);
      planLinesRef.current.push(poly);
    });
  }, [planLines, mapReady]);

  // Road closures (TomTom Traffic) as clickable red dashed segments, drawn
  // above the network lines so closures stay visible on busy corridors.
  // PERSISTENT: one polyline per closure part, reused across renders.
  const closuresRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    const google = (window as any).google;
    const seen = new Set<string>();
    (closures || []).forEach((closure) => {
      if (!closure.points || closure.points.length < 2) return;
      seen.add(closure.id);
      const existing = closuresRef.current.get(closure.id);
      if (existing) {
        existing.setPath(closure.points.map((p) => ({ lat: p.latitude, lng: p.longitude })));
        return;
      }
      const poly = new google.maps.Polyline({
        path: closure.points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: "#DC2626",
        strokeWeight: 5,
        strokeOpacity: 0.85,
        zIndex: 3,
      });
      poly.addListener("click", () => {
        onClosureClickRef.current?.({
          id: closure.id,
          from: closure.from,
          to: closure.to,
          description: closure.description,
        });
      });
      poly.setMap(mapRef.current);
      closuresRef.current.set(closure.id, poly);
    });
    closuresRef.current.forEach((poly, id) => {
      if (!seen.has(id)) {
        try { poly.setMap(null); } catch (e) {}
        closuresRef.current.delete(id);
      }
    });
  }, [closures, mapReady]);

  // Transit stops as CLICKABLE bus/tram pins (zoom-aware detail:
  // tiny icon < 12, full pin 12+, route numbers 14+, stop name 16+).
  // PERSISTENT: pins are cached per (id + zoom bucket) and reused - zoom
  // and pan never destroy/recreate the same pin, only bucket crossings
  // (12/14/16) rebuild their appearance.
  const transitStopsRef = useRef<any[]>([]);
  const stopsCacheRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    const zoom = mapRef.current?.getZoom?.() || 14;
    if (!transitStops || transitStops.length === 0 || zoom < 11) {
      stopsCacheRef.current.forEach((rec) => {
        try { rec.overlay.setMap(null); } catch (e) {}
      });
      stopsCacheRef.current.clear();
      transitStopsRef.current = [];
      return;
    }
    const google = (window as any).google;
    const bounds = mapRef.current.getBounds();
    const list = (transitStops || []).filter(
      (s) =>
        !bounds ||
        (s.latitude >= bounds.getSouthWest().lat() && s.latitude <= bounds.getNorthEast().lat() &&
          s.longitude >= bounds.getSouthWest().lng() && s.longitude <= bounds.getNorthEast().lng())
    );
    // Cap the pins (skip evenly) to avoid DOM overload
    const stride = Math.max(1, Math.ceil(list.length / 300));
    const showBadges = zoom >= 14;
    const showNames = zoom >= 16;
    const bucket = zoom < 12 ? "mini" : zoom < 14 ? "pin" : zoom < 16 ? "badges" : "names";
    class StopOverlay extends google.maps.OverlayView {
      div: HTMLDivElement;
      pos: { lat: number; lng: number };
      constructor(div: HTMLDivElement, pos: { lat: number; lng: number }) {
        super();
        this.div = div;
        this.pos = pos;
      }
      onAdd(this: any) {
        // overlayLayer sits BELOW the vehicle markers (overlayMouseTarget):
        // vehicles always stay on top of stop pins.
        this.getPanes().overlayLayer.appendChild(this.div);
      }
      draw(this: any) {
        const overlayProjection = this.getProjection();
        const point = overlayProjection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
        if (point) {
          this.div.style.left = point.x + "px";
          this.div.style.top = point.y + "px";
        }
      }
      onRemove(this: any) {
        if (this.div.parentNode) this.div.parentNode.removeChild(this.div);
      }
    }
    const seenKeys = new Set<string>();
    const buildPin = (s: any, lat: number, lng: number, withBadges: boolean, platformDirections?: string[], platformSide?: string | null, key?: string) => {
      const hasBus = s.modes.includes("bus");
      const hasTram = s.modes.includes("tram");
      const pinColor = hasBus && hasTram ? "#264348" : hasTram ? "#8B0000" : "#1E3A8A";
      const platforms = (s as any).platforms || [];
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.transform = "translate(-50%, -50%)";
      container.style.pointerEvents = "auto";
      container.style.cursor = "pointer";
      container.style.userSelect = "none";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.alignItems = "center";

      if (zoom < 12) {
        const mini = document.createElement("div");
        mini.textContent = hasBus && hasTram ? "🚏" : hasTram ? "🚋" : "🚌";
        mini.style.fontSize = "13px";
        mini.style.filter = "drop-shadow(0 1px 1px rgba(0,0,0,0.4))";
        container.appendChild(mini);
      } else {
        const pin = document.createElement("div");
        pin.style.display = "flex";
        pin.style.alignItems = "center";
        pin.style.justifyContent = "center";
        pin.style.gap = "3px";
        pin.style.padding = "3px 6px";
        pin.style.borderRadius = "9px";
        pin.style.backgroundColor = pinColor;
        pin.style.border = "2px solid #ffffff";
        pin.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
        pin.style.boxSizing = "border-box";
        pin.style.fontFamily = "Arial, sans-serif";
        if (hasBus) {
          const ic = document.createElement("span");
          ic.textContent = "🚌";
          ic.style.fontSize = "11px";
          pin.appendChild(ic);
        }
        if (hasTram) {
          const ic = document.createElement("span");
          ic.textContent = "🚋";
          ic.style.fontSize = "11px";
          pin.appendChild(ic);
        }
        container.appendChild(pin);

        if (withBadges) {
          const badges = document.createElement("div");
          badges.style.display = "flex";
          badges.style.gap = "2px";
          badges.style.marginTop = "1px";
          s.routes.slice(0, 3).forEach((r: any) => {
            const b = document.createElement("span");
            b.textContent = r.route_number;
            b.style.backgroundColor = r.mode === "tram" ? "#8B0000" : "#1E3A8A";
            b.style.color = "#ffffff";
            b.style.fontSize = "9px";
            b.style.fontWeight = "800";
            b.style.fontFamily = "Arial, sans-serif";
            b.style.borderRadius = "6px";
            b.style.padding = "0 4px";
            b.style.border = "1px solid #ffffff";
            b.style.lineHeight = "12px";
            badges.appendChild(b);
          });
          container.appendChild(badges);
        }
        if (platformDirections && platformDirections.length > 0) {
          const dirEl = document.createElement("div");
          const sideLabel = (platformSide ?? "") ? `${platformSide === "left" ? "L" : "R"} · ` : "";
          dirEl.textContent = sideLabel + platformDirections.slice(0, 2).join(" · ");
          dirEl.style.fontSize = "9px";
          dirEl.style.fontWeight = "700";
          dirEl.style.fontFamily = "Arial, sans-serif";
          dirEl.style.color = "#264348";
          dirEl.style.backgroundColor = "rgba(255,255,255,0.92)";
          dirEl.style.borderRadius = "6px";
          dirEl.style.padding = "1px 4px";
          dirEl.style.marginTop = "1px";
          dirEl.style.whiteSpace = "nowrap";
          dirEl.style.maxWidth = "120px";
          dirEl.style.overflow = "hidden";
          dirEl.style.textOverflow = "ellipsis";
          container.appendChild(dirEl);
        }
        if (showNames && !platformDirections) {
          const nameEl = document.createElement("div");
          nameEl.textContent = s.name;
          nameEl.style.fontSize = "10px";
          nameEl.style.fontWeight = "700";
          nameEl.style.fontFamily = "Arial, sans-serif";
          nameEl.style.color = "#264348";
          nameEl.style.backgroundColor = "rgba(255,255,255,0.92)";
          nameEl.style.borderRadius = "6px";
          nameEl.style.padding = "1px 4px";
          nameEl.style.marginTop = "1px";
          nameEl.style.whiteSpace = "nowrap";
          container.appendChild(nameEl);
        }
      }

      container.addEventListener("click", (e) => {
        e.stopPropagation();
        onTransitStopPress?.(s as any);
      });

      const overlay = new StopOverlay(container, { lat, lng });
      overlay.setMap(mapRef.current);
      transitStopsRef.current.push(overlay);
      if (key) stopsCacheRef.current.set(key, { overlay, container });
      else stopsCacheRef.current.set(`anon:${lat},${lng}`, { overlay, container });
    };

    list.forEach((s, i) => {
      if (i % stride !== 0) return;
      const platforms = (s as any).platforms || [];
      // Both sides of the road: at close zoom show one pin per PLATFORM
      // (each with its own directions), otherwise the single physical stop.
      if (zoom >= 16 && platforms.length >= 2) {
        platforms.forEach((p: any) => {
          if (p.latitude == null || p.longitude == null) return;
          const key = `plat:${p.platform_id}:${bucket}`;
          seenKeys.add(key);
          if (!stopsCacheRef.current.has(key)) {
            buildPin(s, p.latitude, p.longitude, true, p.directions || [], p.side || null, key);
          }
        });
      } else {
        const key = `stop:${s.stop_id}:${bucket}:${s.modes.includes("bus") ? "b" : ""}${s.modes.includes("tram") ? "t" : ""}`;
        seenKeys.add(key);
        if (!stopsCacheRef.current.has(key)) {
          buildPin(s, s.latitude, s.longitude, showBadges, undefined, null, key);
        }
      }
    });

    // Remove pins no longer visible in the current set/bucket
    stopsCacheRef.current.forEach((rec, key) => {
      if (!seenKeys.has(key)) {
        try { rec.overlay.setMap(null); } catch (e) {}
        stopsCacheRef.current.delete(key);
      }
    });
    transitStopsRef.current = Array.from(stopsCacheRef.current.values()).map((r) => r.overlay);
  }, [transitStops, mapReady]);

  // Fly to location
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current || !location) return;
    const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    if (key === prevLocationRef.current) return;
    prevLocationRef.current = key;
    mapRef.current.panTo({ lat: location.latitude, lng: location.longitude });
  }, [location, mapReady]);

  // User location dot — glued to the map
  const userLocationOverlayRef = useRef<any>(null);
  const userLocImageRef = useRef<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    // The "you are here" pin only shows at the live device location.
    const pinPos = pinLocation;
    const imageKey = userPinImage || "";
    if (!showUserLocation || !pinPos) {
      if (userLocationOverlayRef.current) {
        try { userLocationOverlayRef.current.setMap(null); } catch (e) {}
        userLocationOverlayRef.current = null;
        userLocImageRef.current = null;
      }
      return;
    }
    // Same pin, new position: move it in place instead of recreating it
    // (recreating flashes on every GPS update).
    const existing = userLocationOverlayRef.current;
    if (existing && userLocImageRef.current === imageKey) {
      existing.pos = { lat: pinPos.latitude, lng: pinPos.longitude };
      try { existing.draw(); } catch (e) {}
      return;
    }
    if (existing) {
      try { existing.setMap(null); } catch (e) {}
      userLocationOverlayRef.current = null;
    }
    const google = (window as any).google;

    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.pointerEvents = "none";

    if (userPinImage) {
      // User pin with the profile photo (user or business avatar)
      const pin = document.createElement("div");
      pin.style.width = "34px";
      pin.style.height = "34px";
      pin.style.borderRadius = "50%";
      pin.style.border = "3px solid #ffffff";
      pin.style.boxShadow = "0 1px 6px rgba(0,0,0,0.45)";
      pin.style.backgroundColor = "#59ABE3";
      pin.style.overflow = "hidden";
      pin.style.transform = "translate(-50%, -50%)";
      pin.style.boxSizing = "border-box";
      const img = document.createElement("img");
      img.src = userPinImage;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      img.style.borderRadius = "50%";
      img.onerror = () => { img.style.display = "none"; };
      pin.appendChild(img);
      container.appendChild(pin);
    } else {
      const dot = document.createElement("div");
      dot.style.width = "16px";
      dot.style.height = "16px";
      dot.style.borderRadius = "50%";
      dot.style.backgroundColor = "#59ABE3";
      dot.style.border = "3px solid #ffffff";
      dot.style.boxShadow = "0 1px 5px rgba(0,0,0,0.4)";
      dot.style.transform = "translate(-50%, -50%)";
      dot.style.boxSizing = "border-box";
      container.appendChild(dot);
    }

    class UserOverlay extends google.maps.OverlayView {
      div: HTMLDivElement;
      pos: { lat: number; lng: number };
      constructor(div: HTMLDivElement, pos: { lat: number; lng: number }) {
        super();
        this.div = div;
        this.pos = pos;
      }
      onAdd(this: any) {
        this.getPanes().overlayMouseTarget.appendChild(this.div);
      }
      draw(this: any) {
        const overlayProjection = this.getProjection();
        const point = overlayProjection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
        if (point) {
          this.div.style.left = point.x + "px";
          this.div.style.top = point.y + "px";
        }
      }
      onRemove(this: any) {
        if (this.div.parentNode) this.div.parentNode.removeChild(this.div);
      }
    }

    const overlay = new UserOverlay(container, { lat: pinPos.latitude, lng: pinPos.longitude });
    overlay.setMap(map);
    userLocationOverlayRef.current = overlay;
    userLocImageRef.current = imageKey;
  }, [location, showUserLocation, mapReady, userPinImage, pinLocation]);

  // Pan when the initialRegion-based center changes (e.g. home map bounds updates)
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    if (location) return;
    const key = `${centerLat.toFixed(4)},${centerLng.toFixed(4)}`;
    if (key === prevCenterRef.current) return;
    prevCenterRef.current = key;
    mapRef.current.panTo({ lat: centerLat, lng: centerLng });
  }, [centerLat, centerLng, location, mapReady]);

  // Fly to explicitly focused region (e.g. search selection / recenter)
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current || !focusToken || !focusRegion) return;
    mapRef.current.panTo({ lat: focusRegion.latitude, lng: focusRegion.longitude });
    mapRef.current.setZoom(14);
  }, [focusToken, mapReady]);

  if (disabled) {
    return (
      <View style={[s.wrap, { height }]}>
        <Pressable
          style={s.disabledOverlay}
          onPress={() => {
            if (!onMapPress || enablingRef.current) return;
            enablingRef.current = true;
            setEnabling(true);
            setEnableError(null);
            if (!navigator?.geolocation) {
              setEnableError(
                (window as any)?.isSecureContext === false
                  ? t("common.locationHttps", "Location requires HTTPS. Open https://app.perixapp.com and try again.")
                  : t("common.locationUnavailable", "Location is not available in this browser. Check browser settings and try again."),
              );
              enablingRef.current = false;
              setEnabling(false);
              return;
            }
            let attempts = 0;
            const request = () => {
              navigator.geolocation.getCurrentPosition(
                (pos) => {
                  onMapPress(pos.coords.latitude, pos.coords.longitude);
                  enablingRef.current = false;
                  setEnabling(false);
                },
                (err) => {
                  console.warn("Web geolocation error:", err?.code, err?.message);
                  if (err?.code === 1) {
                    setEnableError(
                      t("common.locationDeniedWeb", "Location is blocked for this site. Tap the lock icon in the address bar, open Site settings and allow Location access."),
                    );
                    enablingRef.current = false;
                    setEnabling(false);
                    return;
                  }
                  // Timeout/unavailable: retry once with balanced accuracy (faster on iOS)
                  if (attempts === 0) {
                    attempts += 1;
                    request();
                    return;
                  }
                  setEnableError(
                    t("common.locationUnavailable", "Couldn't get your location. Make sure location/GPS is turned on and try again."),
                  );
                  enablingRef.current = false;
                  setEnabling(false);
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
              );
            };
            request();
          }}
        >
          {enabling ? (
            <ActivityIndicator size="large" color="#59ABE3" />
          ) : (
            <Ionicons name="location" size={40} color={COLORS.pinClosed} />
          )}
          <Text style={s.disabledText}>{enabling ? "…" : disabledHint}</Text>
          {enableError ? (
            <Text style={s.errorText}>{enableError}</Text>
          ) : null}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.wrap, { height }]}>
      {!mapReady && !mapError && (
        <View style={s.loading}><ActivityIndicator size="large" color="#000" /></View>
      )}
      {mapError && (
        <View style={s.loading}><Ionicons name="alert-circle" size={32} color="#ef4444" /><Text style={s.errorText}>{t("map.loadFailed", "Karte konnte nicht geladen werden")}</Text></View>
      )}
      <View
        ref={mapDivRef as any}
        style={{ flex: 1, borderRadius: 12 }}
      />

      <Modal visible={!!selectedGroup} transparent animationType="slide" onRequestClose={() => setSelectedGroup(null)}>
        <Pressable style={s.sheetOverlay} onPress={() => setSelectedGroup(null)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{t("map.itemsAtLocation", "{{count}} items at this location", { count: selectedGroup ? selectedGroup.length : 0 })}</Text>
            <View style={s.sheetList}>
              {(selectedGroup || []).map((item) => (
                <Pressable
                  key={item.id}
                  style={s.sheetItem}
                  onPress={() => { setSelectedGroup(null); onMarkerPress?.(item.id); }}
                >
                  <View style={[s.sheetDot, { backgroundColor: item.pinColor || COLORS.pinClosed }]} />
                  <View style={s.sheetItemInfo}>
                    <Text style={s.sheetItemName} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.sheetItemType} numberOfLines={1}>{t(`map.types.${item.type || "item"}`, item.type || "item")}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textGray} />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!selectedBusiness} transparent animationType="fade" onRequestClose={() => setSelectedBusiness(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelectedBusiness(null)}>
          <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
            <Pressable style={s.cardClose} onPress={() => setSelectedBusiness(null)}>
              <Ionicons name="close" size={20} color={COLORS.textGray} />
            </Pressable>
            <View style={s.cardHead}>
              {selectedBusiness?.logo_image || selectedBusiness?.profile_photo ? (
                <RNImage source={{ uri: (selectedBusiness?.logo_image || selectedBusiness?.profile_photo) as string }} style={s.cardLogo} />
              ) : (
                <View style={s.cardLogoPl}><Text style={s.cardLogoT}>{selectedBusiness?.name?.charAt(0).toUpperCase() || "?"}</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.cardName}>{selectedBusiness?.name}</Text>
                <Text style={s.cardCat}>{translateCategory(selectedBusiness?.subcategory || selectedBusiness?.category || selectedBusiness?.root_category, t)}</Text>
              </View>
            </View>
            {selectedBusiness?.address && (
              <View style={s.cardAddr}>
                <Ionicons name="location-outline" size={14} color={COLORS.textGray} />
                <Text style={s.cardAddrText}>{selectedBusiness.address}</Text>
              </View>
            )}
            {selectedBusiness?.description && (
              <Text style={s.cardDesc} numberOfLines={3}>{selectedBusiness.description}</Text>
            )}
            <View style={s.cardActions}>
              <Pressable style={s.cardBtn2} onPress={() => { if (selectedBusiness) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${selectedBusiness.latitude},${selectedBusiness.longitude}&travelmode=driving`); }}>
                <Ionicons name="navigate-outline" size={18} color={COLORS.pinClosed} />
                <Text style={s.cardBtn2T}>Directions</Text>
              </Pressable>
              <Pressable style={s.cardBtn1} onPress={() => { if (selectedBusiness) { router.push(`/business/${selectedBusiness.business_id}`); setSelectedBusiness(null); } }}>
                <Text style={s.cardBtn1T}>View Business</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, borderRadius: 12, backgroundColor: "#ffffff", overflow: "hidden" },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
    ...Platform.select({ web: { alignItems: "center" as any }, default: {} }),
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    maxHeight: "60%",
    overflow: "hidden",
    ...Platform.select({
      web: { width: "100%", maxWidth: 1280, borderRadius: 20, marginBottom: 24 } as any,
      default: {},
    }),
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#d1d5db", alignSelf: "center", marginTop: 10 },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#264348", paddingHorizontal: 20, marginTop: 14, marginBottom: 8 },
  sheetList: { maxHeight: 360 },
  sheetItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, gap: 12 },
  sheetDot: { width: 14, height: 14, borderRadius: 7 },
  sheetItemInfo: { flex: 1 },
  sheetItemName: { fontSize: 15, fontWeight: "600", color: "#264348" },
  sheetItemType: { fontSize: 12, color: "rgba(38,67,72,0.65)", marginTop: 1 },
  disabledOverlay: { flex: 1, backgroundColor: COLORS.borderGray, justifyContent: "center", alignItems: "center", gap: 12 },
  disabledText: { fontSize: 15, color: COLORS.textGray, fontWeight: "500" },
  loading: { ...StyleSheet.absoluteFillObject as any, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6", zIndex: 10 },
  errorText: { color: "#ef4444", fontSize: 13, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 340 },
  cardClose: { position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  cardLogo: { width: 52, height: 52, borderRadius: 26 },
  cardLogoPl: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.pinClosed, alignItems: "center", justifyContent: "center" },
  cardLogoT: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  cardName: { fontSize: 18, fontWeight: "700", color: "#111827" },
  cardCat: { fontSize: 13, color: COLORS.pinClosed, marginTop: 2 },
  cardAddr: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  cardAddrText: { fontSize: 13, color: COLORS.textGray, flex: 1 },
  cardDesc: { fontSize: 14, color: COLORS.textDark, lineHeight: 20, marginBottom: 16 },
  cardActions: { flexDirection: "row", gap: 10 },
  cardBtn1: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.pinClosed },
  cardBtn1T: { fontSize: 14, fontWeight: "600", color: "#fff" },
  cardBtn2: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.primaryTintDark },
  cardBtn2T: { fontSize: 14, fontWeight: "600", color: COLORS.pinClosed },
});

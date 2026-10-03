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
  onTransitLineClick?: (routeNumber: string) => void;
  showUserLocation?: boolean;
  userPinImage?: string | null;
  pinLocation?: { latitude: number; longitude: number } | null;
  onRegionChange?: (bounds: MapBounds) => void;
  onRegionChangeComplete?: (bounds: MapBounds) => void;
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

// Cartoon transit icons (SVG). Bus: white + light blue. Tram: white + dark
// green. Both face right; rotation = heading - 90deg.
const BUS_SVG = `<svg width="46" height="26" viewBox="0 0 46 26" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="bs" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#0A143C" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g filter="url(#bs)">
    <rect x="1.2" y="3" width="43.6" height="17" rx="5.5" fill="#ffffff" stroke="#1E3A8A" stroke-width="2"/>
    <rect x="4" y="6" width="7" height="6" rx="1.6" fill="#59ABE3"/>
    <rect x="13" y="6" width="6" height="6" rx="1.6" fill="#BFDFF7"/>
    <rect x="21" y="6" width="6" height="6" rx="1.6" fill="#BFDFF7"/>
    <rect x="29" y="6" width="6" height="6" rx="1.6" fill="#BFDFF7"/>
    <rect x="36.5" y="1" width="7" height="3.4" rx="1.7" fill="#59ABE3"/>
    <circle cx="11" cy="20.5" r="3.4" fill="#1E3A8A"/>
    <circle cx="35" cy="20.5" r="3.4" fill="#1E3A8A"/>
    <circle cx="11" cy="20.5" r="1.4" fill="#ffffff"/>
    <circle cx="35" cy="20.5" r="1.4" fill="#ffffff"/>
  </g>
</svg>`;

const TRAM_SVG = `<svg width="50" height="34" viewBox="0 0 50 34" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ts" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#0A143C" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g filter="url(#ts)">
    <line x1="12" y1="3" x2="12" y2="10" stroke="#166534" stroke-width="2.4"/>
    <line x1="4" y1="3" x2="34" y2="3" stroke="#166534" stroke-width="1.8"/>
    <rect x="1.2" y="10" width="47.6" height="15" rx="5" fill="#ffffff" stroke="#166534" stroke-width="2"/>
    <rect x="4" y="12.4" width="6" height="5" rx="1.5" fill="#BFE3C8"/>
    <rect x="12" y="12.4" width="5" height="5" rx="1.5" fill="#BFE3C8"/>
    <rect x="19" y="12.4" width="5" height="5" rx="1.5" fill="#BFE3C8"/>
    <rect x="26" y="12.4" width="5" height="5" rx="1.5" fill="#BFE3C8"/>
    <rect x="33" y="12.4" width="5" height="5" rx="1.5" fill="#BFE3C8"/>
    <rect x="1.2" y="15.4" width="47.6" height="3" fill="#166534"/>
    <circle cx="12" cy="27" r="3.6" fill="#166534"/>
    <circle cx="38" cy="27" r="3.6" fill="#166534"/>
    <circle cx="12" cy="27" r="1.5" fill="#ffffff"/>
    <circle cx="38" cy="27" r="1.5" fill="#ffffff"/>
  </g>
</svg>`;

let googleScriptLoaded = false;
let googleScriptPromise: Promise<void> | null = null;

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
  showUserLocation,
  userPinImage,
  pinLocation,
  onRegionChange,
  onRegionChangeComplete,
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
  const transitContainersRef = useRef<HTMLDivElement[]>([]);
  const transitContainers = transitContainersRef.current;
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
  const zoomLayoutDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
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
    allMarkers.forEach((m) => parts.push(`${m.id}|${m.latitude}|${m.longitude}|${m.pinColor || ""}|${m.pinInnerColor || ""}`));
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
          const bounds = map.getBounds();
          if (!bounds) return;
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const key = `${sw.lat()},${ne.lat()},${sw.lng()},${ne.lng()}`;
          if (key === lastBoundsRef.current) return;
          lastBoundsRef.current = key;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onRegionChangeComplete?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
          }, 500);
          onRegionChange?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
        });

        map.addListener("click", (e: any) => {
          onMapPress?.(e.latLng.lat(), e.latLng.lng());
        });

        map.addListener("zoom_changed", () => {
          const zoom = map.getZoom() || 14;
          const scale = Math.max(0.8, Math.min(1.7, zoom / 12));
          const vscale = vehicleScale(zoom);
          markersRef.current.forEach((rec: any) => {
            try { rec?.resize?.(scale, vscale); } catch (e) {}
          });
          // Collision resolution depends on screen distances - re-layout
          // after the zoom gesture settles.
          if (zoomLayoutDebounceRef.current) clearTimeout(zoomLayoutDebounceRef.current);
          zoomLayoutDebounceRef.current = setTimeout(() => setLayoutTick((n) => n + 1), 180);
        });

        if (cancelled) return;
        mapRef.current = map;
        mapReadyRef.current = true;
        setMapReady(true);
        console.log("[WebMap] initialized zoom=" + map.getZoom());
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

    // Preserve transit vehicle overlays so estimated positions animate
    // smoothly between polls instead of jumping (CSS transitions on the
    // same DOM node). Everything else is rebuilt.
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

    // Split transit vehicles from the static pins. Transit markers are laid
    // out separately with pixel-space collision resolution so vehicles never
    // overlap each other on screen.
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

    // Pixel-space collision resolution: each vehicle occupies a screen box
    // (its icon footprint). Overlapping vehicles collapse into one cluster
    // with a "+N" badge; tapping a cluster cycles through its members.
    const clusterOf = new Map<string, string>();
    const membersByRep = new Map<string, MapMarker[]>();
    const projection = mapRef.current.getProjection();
    if (projection) {
      const placed: { x: number; y: number; id: string; w: number; h: number }[] = [];
      for (const m of sortedTransit) {
        const pt = projection.fromLatLngToDivPixel(new google.maps.LatLng(m.latitude, m.longitude));
        if (!pt) continue;
        const w = (m.type === "tram" ? 50 : 46) * vScale;
        const h = (m.type === "tram" ? 34 : 26) * vScale;
        let owner: string | null = null;
        let best = Infinity;
        for (const pl of placed) {
          const dx = Math.abs(pt.x - pl.x);
          const dy = Math.abs(pt.y - pl.y);
          if (dx < ((w + pl.w) / 2) * 0.9 && dy < ((h + pl.h) / 2) * 0.9) {
            const d = (pt.x - pl.x) ** 2 + (pt.y - pl.y) ** 2;
            if (d < best) {
              best = d;
              owner = pl.id;
            }
          }
        }
        const repId = owner || m.id;
        clusterOf.set(m.id, repId);
        if (!membersByRep.has(repId)) membersByRep.set(repId, []);
        membersByRep.get(repId)!.push(m);
        if (!owner) placed.push({ x: pt.x, y: pt.y, id: m.id, w, h });
      }
    } else {
      sortedTransit.forEach((m) => {
        clusterOf.set(m.id, m.id);
        membersByRep.set(m.id, [m]);
      });
    }

    console.log(
      "[WebMap] markers: pins=" + pinGroups.length + " transit=" + transitMarkers.length +
      " reps=" + membersByRep.size + " vScale=" + vScale.toFixed(2)
    );

    const setBadge = (rec: any, extra: number) => {
      if (!rec.badge) return;
      if (extra <= 0) {
        rec.badge.style.display = "none";
        return;
      }
      rec.badge.style.display = "flex";
      rec.badge.textContent = "+" + extra;
    };

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

    // Transit vehicles: one overlay per cluster (representative icon + badge)
    membersByRep.forEach((members, repId) => {
      const rep = members[0];
      if (!rep) return;
      const heading = typeof rep.heading === "number" ? rep.heading : 0;
      const w = (rep.type === "tram" ? 50 : 46) * vScale;
      const h = (rep.type === "tram" ? 34 : 26) * vScale;

      // Reuse an existing transit overlay: only update its position and
      // rotation - no CSS transition on position, so map pans never make
      // vehicles lag behind and snap back.
      const existing = existingTransit.get(repId);
      if (existing) {
        const rec = existing;
        rec.overlay.pos = { lat: rep.latitude, lng: rep.longitude };
        rec.heading = heading;
        rec.scale = vScale;
        rec.inner.innerHTML = rep.type === "bus" ? BUS_SVG : TRAM_SVG;
        rec.inner.style.transform = `rotate(${heading - 90}deg) scale(${vScale})`;
        rec.inner.style.opacity = rep.estimated ? "0.72" : "1";
        rec.clusterIds = members.map((m) => m.id);
        if (!rec.clusterIds[rec.clusterIdx % rec.clusterIds.length]) rec.clusterIdx = 0;
        setBadge(rec, members.length - 1);
        try { rec.overlay.draw(); } catch (e) {}
        markersRef.current.push(rec);
        return;
      }

      // Container div (positioned by OverlayView)
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.cursor = "pointer";
      container.style.userSelect = "none";

      // Cartoon vehicle icon showing its facing direction. Zoom-aware:
      // zoomed out -> small vehicles "circulating" in the city.
      const rotWrap = document.createElement("div");
      rotWrap.style.position = "absolute";
      rotWrap.style.transform = "translate(-50%, -50%)";
      rotWrap.style.pointerEvents = "none";
      const inner = document.createElement("div");
      inner.style.transform = `rotate(${heading - 90}deg) scale(${vScale})`;
      inner.style.transformOrigin = "center center";
      inner.style.transition = "transform 0.4s ease-out";
      inner.innerHTML = rep.type === "bus" ? BUS_SVG : TRAM_SVG;
      if (rep.estimated) inner.style.opacity = "0.72";
      rotWrap.appendChild(inner);
      container.appendChild(rotWrap);

      let badge: HTMLDivElement | null = null;
      if (members.length > 1) {
        badge = document.createElement("div");
        badge.textContent = "+" + (members.length - 1);
        badge.style.position = "absolute";
        badge.style.left = (w / 2 + 4) + "px";
        badge.style.top = (-h / 2 - 4) + "px";
        badge.style.transform = "translate(-50%, -50%)";
        badge.style.backgroundColor = "#264348";
        badge.style.color = "#ffffff";
        badge.style.fontSize = "10px";
        badge.style.fontWeight = "800";
        badge.style.fontFamily = "Arial, sans-serif";
        badge.style.borderRadius = "50%";
        badge.style.minWidth = "18px";
        badge.style.height = "18px";
        badge.style.display = "flex";
        badge.style.alignItems = "center";
        badge.style.justifyContent = "center";
        badge.style.padding = "0 3px";
        badge.style.border = "2px solid #ffffff";
        badge.style.boxShadow = "0 1px 3px rgba(0,0,0,0.4)";
        badge.style.boxSizing = "border-box";
        container.appendChild(badge);
      }

      const overlay = new (class extends google.maps.OverlayView {
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
      })(container, { lat: rep.latitude, lng: rep.longitude });
      overlay.setMap(mapRef.current);

      const rec: any = {
        overlay,
        resize: (_zoomScaleArg: number, vScaleArg?: number) => {
          const ns = vScaleArg ?? vehicleScale(mapRef.current?.getZoom?.() || 14);
          rec.scale = ns;
          rec.inner.style.transform = `rotate(${rec.heading - 90}deg) scale(${ns})`;
        },
        vehicleId: repId,
        inner,
        heading,
        scale: vScale,
        clusterIds: members.map((m) => m.id),
        clusterIdx: 0,
        badge,
      };

      // Tapping a cluster cycles through the vehicles stacked there.
      container.addEventListener("click", (e: any) => {
        e.stopPropagation();
        rec.clusterIdx = (rec.clusterIdx + 1) % rec.clusterIds.length;
        const target = members.find((m) => m.id === rec.clusterIds[rec.clusterIdx]) || members[0];
        rec.heading = typeof target.heading === "number" ? target.heading : 0;
        rec.inner.innerHTML = target.type === "bus" ? BUS_SVG : TRAM_SVG;
        rec.inner.style.transform = `rotate(${rec.heading - 90}deg) scale(${rec.scale})`;
        rec.inner.style.opacity = target.estimated ? "0.72" : "1";
        onMarkerPress?.(target.id);
      });

      markersRef.current.push(rec);
      transitContainers.push(container);
    });

    // Remove transit overlays whose vehicle is no longer active
    const reusedIds = new Set(
      markersRef.current.map((r: any) => r?.vehicleId).filter(Boolean)
    );
    existingTransit.forEach((rec, id) => {
      if (!reusedIds.has(id)) {
        try { rec.overlay.setMap(null); } catch (e) {}
      }
    });
    transitContainers.length = 0;
    markersRef.current.forEach((r: any) => {
      if (r?.vehicleId && r?.overlay?.div) {
        transitContainers.push(r.overlay.div);
      }
    });
  }, [groupedMarkers, mapReady, layoutTick]);

  // Transit route lines (thin polylines under the vehicle markers)
  const transitLinesRef = useRef<any[]>([]);
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    transitLinesRef.current.forEach((p) => {
      try { p.setMap(null); } catch (e) {}
    });
    transitLinesRef.current = [];
    const google = (window as any).google;
    (transitLines || []).forEach((line) => {
      if (!line.points || line.points.length < 2) return;
      const poly = new google.maps.Polyline({
        path: line.points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: line.color,
        strokeWeight: line.weight ?? 2,
        strokeOpacity: line.opacity ?? 0.45,
        zIndex: 1,
      });
      if (onTransitLineClick && line.routeNumber) {
        poly.addListener("click", () => {
          onTransitLineClick(line.routeNumber as string);
        });
      }
      poly.setMap(mapRef.current);
      transitLinesRef.current.push(poly);
    });
  }, [transitLines, mapReady]);

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
                      t("common.locationDenied", "Location is blocked for this site. Tap the lock icon in the address bar, open Site settings and allow Location access."),
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

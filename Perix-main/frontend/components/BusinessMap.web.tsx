import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { StyleSheet, Text, View, Platform, Pressable, Modal, Image as RNImage, Linking, ActivityIndicator, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental, Job, Service } from "../lib/api";
import { formatEventDate } from "../lib/formatDate";
import { translateCategory } from "../lib/categoryTranslation";
import { COLORS } from "../lib/designTokens";
import { useTranslation } from "react-i18next";
import { acceptVisualPublication, applyGatewayTransitUpdate, authorizePreview, sampleAuthorizedPreview } from "../lib/city/transitPublication";
import { sampleVisualPath } from "../lib/city/transitPath";
import { stationQueueOffsets, smoothQueueOffset, StationQueueCandidate } from "../lib/city/stationQueue";
import { measureVisualApplication } from "../lib/city/transitPublication";
import { groupTransitStopIcons, transitStopPins, stopGeometryBearing, stopViewerBearing } from "../lib/city/visualGeometry";
import { MAP_LAYERS, createUserPinElement, mapEmblemPinSize, mapEntityPinSize, mapMarkerGroupKey, profileInitial, transitStopAppearance, businessEmblemKey, perspectiveMultiplier, routeWeightForZoom, LOCKED_MAP_TILT, RASTER_FALLBACK_TILT, lockedTiltForRendering, PERIX_VECTOR_MAP_ID } from "../lib/city/mapPresentation";
import { illustratedIconSource } from "./icons/IllustratedIcon";
import { clusterLandmarks, landmarkAppearance, landmarkDepthLayout, landmarkIntersectsBounds, landmarkImageSource, landmarkTapTargets, LANDMARK_MAP_MAX_ZOOM, LANDMARK_STREET_DETAIL_ZOOM } from "../lib/city/landmarks";
import { projectedRoutePath } from '../lib/city/routeArtwork';
import type { Landmark } from "../lib/city/landmarks";
import { autoCameraTarget, advanceAutoCamera, type AutoCameraState } from "../lib/city/mapLayout";
import type { MotionPreview } from "../lib/api/mobility";
import { MOBILITY_VIEW_SOURCES, vehicleKindViewAngle, stopMobilityViewAngle } from "../lib/mobilityViewSources.generated";
import { getCurrentLanguageSync } from "../i18n";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  address?: string | null;
  description?: string;
  pinColor?: string;
  pinInnerColor?: string;
  pinImage?: string | null;
  pinImageFit?: "cover" | "contain";
  emblem?: ImageSourcePropType | null;
  selectionCompass?: boolean;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product" | "bus" | "tram" | "taxi";
  heading?: number | null;
  estimated?: boolean;
  visualEstimate?: boolean;
  journeyId?: string | null;
  publicationStatus?: "READY" | "PENDING" | "HIDDEN" | null;
  patternId?: string | null;
  planRevision?: string | null;
  estimateRevision?: string | null;
  geometryFingerprint?: string | null;
  motionPreview?: MotionPreview | null;
  nextTimelineIndex?: number | null;
  distanceToNextStopM?: number | null;
  nextStopEtaSeconds?: number | null;
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
  focusZoom?: number;
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  jobs?: Job[];
  services?: Service[];
  markers?: MapMarker[];
  extraMarkers?: MapMarker[];
  /** Used by /app only: never invent movement between modeled samples. */
  authoritativeTransit?: boolean;
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
    physical_stop_id?: string;
    platform_id?: string;
    platform_code?: string | null;
    stop_ids?: string[];
    stop_id: string;
    name: string;
    latitude: number;
    longitude: number;
    modes: ("bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry")[];
    /** Street side ("left"/"right"); opposite known sides stay separate pins. */
    side?: string | null;
    routes: { route_number: string; mode: "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry" }[];
    platforms?: {
      platform_id: string;
      platform_code?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      name?: string;
      directions?: string[];
      modes?: ('bus' | 'tram' | 'subway' | 's-bahn' | 'rail' | 'ferry')[];
      routes?: string[];
      side?: string | null;
    }[];
    platform_ids?: string[];
    platform_codes?: string[];
  }[];
  onTransitStopPress?: (stop: {
    platform_id?: string;
    platform_code?: string | null;
    stop_ids?: string[];
    platform_ids?: string[];
    platform_codes?: string[];
    stop_id: string;
    name: string;
    latitude: number;
    longitude: number;
    modes: ("bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry")[];
    routes: { route_number: string; mode: "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry" }[];
    platforms?: {platform_id:string;platform_code?:string|null;name?:string;latitude?:number|null;longitude?:number|null;
      modes?:('bus'|'tram'|'subway'|'s-bahn'|'rail'|'ferry')[];routes?:string[];directions?:string[]}[];
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
  userPinName?: string | null;
  pinLocation?: { latitude: number; longitude: number } | null;
  /** Supplement diorama landmarks (MD-X001..MD-X070): zoom-smart, decluttered, tap opens Google directions. */
  landmarks?: Landmark[];
  landmarksMuted?: boolean;
  onMapReady?: (available?: boolean) => void;
  onLandmarksReady?: () => void;
  pinScaleZoom?: number;
  /** Auto camera: fit these points (e.g. user pin + approaching vehicles) and
   *  keep refitting as they converge. Any user gesture cancels it until the
   *  token changes (a new explicit action like selecting a stop). */
  autofit?: { token: number; points: { latitude: number; longitude: number }[] } | null;
  onAutofitCancel?: () => void;
  onRegionChange?: (bounds: MapBounds) => void;
  onRegionChangeComplete?: (bounds: MapBounds) => void;
  onZoomChange?: (zoom: number) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  height?: number;
  horizontalInset?: number;
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
): { lat: number; lng: number } => {
  if (points.length === 1) return { lat: points[0].latitude, lng: points[0].longitude };
  if (!Number.isFinite(progress)) return { lat: points[0].latitude, lng: points[0].longitude };
  const total = cum[cum.length - 1] || 1;
  const p = Math.max(0, Math.min(total, progress));
  for (let i = 0; i < cum.length - 1; i++) {
    if (cum[i + 1] < p) continue;
    const span = Math.max(0.001, cum[i + 1] - cum[i]);
    const f = Math.min(1, Math.max(0, (p - cum[i]) / span));
    return {
      lat: points[i].latitude + (points[i + 1].latitude - points[i].latitude) * f,
      lng: points[i].longitude + (points[i + 1].longitude - points[i].longitude) * f,
    };
  }
  return { lat: points[points.length - 1].latitude, lng: points[points.length - 1].longitude };
};

const progressOfPoint = (
  points: { latitude: number; longitude: number }[],
  cum: number[],
  lat: number,
  lng: number
): number => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || points.length < 2) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = points[i].latitude;
    const y0 = points[i].longitude;
    const x1 = points[i + 1].latitude;
    const y1 = points[i + 1].longitude;
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue;
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
  return Number.isFinite(best) ? best : 0;
};

// Cartoon transit icons (SVG) with the route number on a side plate.
// Bus: white + light blue. Tram: white + dark green, articulated in two
// segments with pantograph and doors. Both face right; rotation = heading - 90deg.
const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const routePlateText = (num: string, x: number, fontSize: number, y: number) =>
  `<text x="${x}" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" fill="#ffffff">${escapeHtml(num)}</text>`;

const resolveMapAssetUri=(asset:any):string=>{
  if(typeof asset==="string")return asset;
  if(asset && typeof asset.uri==="string")return asset.uri;
  const resolver=(RNImage as any).resolveAssetSource;
  return typeof resolver==="function" ? resolver(asset)?.uri || "" : "";
};

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
let transitRouteLabelStylesInstalled = false;
let perixCinemaStylesInstalled = false;
/** PERIX Soft Light Cinema — Film Finish. Separate CSS layer over the map frame
 *  (never inside the Cloud Map Style JSON: it has no glare/bloom/vignette).
 *  pointer-events:none keeps every control clickable; the bottom 48px stay
 *  clear for the Google logo and attribution. Default intensity: PERIX Signature. */
const PERIX_CINEMA_CSS = `.perix-cinema-light{position:absolute;inset:0 0 48px 0;z-index:2;pointer-events:none;background:radial-gradient(ellipse 65% 60% at 12% 4%,rgba(255,240,207,0.30),transparent 72%),radial-gradient(ellipse 55% 50% at 85% 8%,rgba(159,211,231,0.13),transparent 75%),radial-gradient(ellipse 120% 60% at 50% 0%,rgba(255,255,255,0.07),transparent 55%),radial-gradient(ellipse 85% 80% at 50% 46%,transparent 45%,rgba(79,64,52,0.14) 100%);}`;
function ensurePerixCinemaStyles() {
  if (perixCinemaStylesInstalled || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.id = "perix-cinema-light-styles";
  style.textContent = PERIX_CINEMA_CSS;
  document.head.appendChild(style);
  perixCinemaStylesInstalled = true;
}

/** Native google.maps.Marker icon for a transit vehicle: SVG data URL,
 *  scaled size + SVG-internal rotation (deterministic - the icon faces
 *  the direction of travel, never sideways). The map pins the marker to
 *  its geographic coordinate through pan/zoom - it can never drift. */
const makeVehicleIcon = (google: any, rec: any) => {
  const isTram = rec.type === "tram";
  const canvas = isTram ? 82 : 64;
  const w = Math.max(16, Math.round(canvas * rec.scale));
  const heading = typeof rec.heading === "number" ? rec.heading : 0;
  if (rec.type === "bus" || rec.type === "tram" || rec.type === "subway" || rec.type === "s-bahn" || rec.type === "rail" || rec.type === "ferry" || rec.type === "metro" || rec.type === "isap" || rec.type === "athens_bus" || rec.type === "blue_star") {
    const kind=rec.type as "bus"|"tram"|"subway"|"s-bahn"|"rail"|"ferry"|"metro"|"isap"|"athens_bus"|"blue_star";
    const viewAngle=vehicleKindViewAngle(kind,heading,rec.cameraHeading || 0);
    const uri=resolveMapAssetUri(MOBILITY_VIEW_SOURCES[kind][viewAngle]);
    return {
      url:uri,
      scaledSize:new google.maps.Size(w,w),
      anchor:new google.maps.Point(w/2-(rec.queueOffset?.x || 0),w/2-(rec.queueOffset?.y || 0)),
      labelOrigin:new google.maps.Point(w/2,w+2),
    };
  }
  // SVG is drawn facing RIGHT (east): rotate so the nose points at the
  // heading. heading 0 (north) -> -90; heading 90 (east) -> 0.
  const deg = Math.round((heading - 90) * 10) / 10;
  return {
    url:
      "data:image/svg+xml;charset=UTF-8," +
      encodeURIComponent(isTram ? tramSvg(rec.label, deg) : busSvg(rec.label, deg)),
    scaledSize: new google.maps.Size(w, w),
    // Queue decoration only: the marker's geographic coordinate stays exact.
    anchor: new google.maps.Point(w/2-(rec.queueOffset?.x || 0), w/2-(rec.queueOffset?.y || 0)),
  };
};

const vehicleMarkerLabel=(rec:any)=>{
  if((rec.type!=="bus"&&rec.type!=="tram") || !rec.label)return null;
  if(!transitRouteLabelStylesInstalled && typeof document!=="undefined"){
    const style=document.createElement("style");style.id="perix-transit-route-label-styles";
    style.textContent=".gm-style .perix-route-label{line-height:1.2!important;color:#fff!important;text-shadow:none!important;border:1px solid #fff!important;border-radius:.5em!important;padding:0 .35em!important;white-space:nowrap!important}.gm-style .perix-route-label-bus{background:#1E3A8A!important}.gm-style .perix-route-label-tram{background:#166534!important}";
    document.head.appendChild(style);transitRouteLabelStylesInstalled=true;
  }
  return {text:String(rec.label),className:`perix-route-label perix-route-label-${rec.type}`,
    fontFamily:"Arial, sans-serif",fontSize:`${Math.max(8,Math.round(9*rec.scale))}px`,fontWeight:"800"};
};
const updateVehicleMarkerIcon=(google:any,rec:any)=>{
  rec.cameraHeading=rec.marker.getMap?.()?.getHeading?.() || 0;
  rec.marker.setIcon(makeVehicleIcon(google,rec));
  const label=vehicleMarkerLabel(rec),key=`${label}|${rec.scale}`;
  if(rec.routeLabelKey===key)return;
  rec.routeLabelKey=key;
  rec.marker.setLabel(label);
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
  focusZoom,
  businesses = [],
  events = [],
  activities = [],
  artists = [],
  rentals = [],
  jobs = [],
  services = [],
  markers,
  extraMarkers,
  landmarks,
  landmarksMuted = false,
  onMapReady,
  onLandmarksReady,
  pinScaleZoom = 15,
  autofit,
  onAutofitCancel,
  authoritativeTransit = false,
  transitLines,
  onTransitLineClick,
  transitStops,
  onTransitStopPress,
  planLines,
  showUserLocation,
  userPinImage,
  userPinName,
  pinLocation,
  onRegionChange,
  onRegionChangeComplete,
  onZoomChange,
  onMarkerPress,
  onMapPress,
  height = 300,
  horizontalInset = 16,
  disabled = false,
  disabledHint = "Tap to enable location",
  staticMode = false,
}: Props) {
  const { t } = useTranslation();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const readyCallbackRef=useRef(onMapReady);readyCallbackRef.current=onMapReady;
  const landmarksReadyRef=useRef(onLandmarksReady);landmarksReadyRef.current=onLandmarksReady;
  const pinScaleZoomRef=useRef(pinScaleZoom);pinScaleZoomRef.current=pinScaleZoom;
  const landmarkCacheRef = useRef<Map<string, any>>(new Map());
  useEffect(() => () => {
    landmarkCacheRef.current.forEach((rec: any) => { try { rec.overlay?.setMap(null); } catch (e) {} });
    landmarkCacheRef.current.clear();
  }, []);
  const [mapReady, setMapReady] = useState(false);
  const [stopViewportRevision, setStopViewportRevision] = useState(0);
  const [mapHeading, setMapHeading] = useState(0);
  // Pedestrian mode: Street View opens only on explicit tap and only where
  // Google has outdoor coverage; zooming back out (or the close button)
  // returns to the aerial map. Nothing auto-enters.
  const [mapZoomLevel, setMapZoomLevel] = useState(14);
  const [streetView, setStreetView] = useState<{ lat: number; lng: number } | null>(null);
  const [streetViewNotice, setStreetViewNotice] = useState<string | null>(null);
  const streetPanoRef = useRef<any>(null);
  const streetViewDivRef = useRef<HTMLDivElement | null>(null);
  const openStreetView = () => {
    const map = mapRef.current, google = (window as any).google;
    const center = map?.getCenter?.();
    if (!map || !google || !center) return;
    setStreetViewNotice(null);
    try {
      new google.maps.StreetViewService().getPanorama(
        { location: center, radius: 60, source: google.maps.StreetViewSource.OUTDOOR },
        (data: any, status: string) => {
          if (status === google.maps.StreetViewStatus.OK && data?.location?.latLng) {
            setStreetView({ lat: data.location.latLng.lat(), lng: data.location.latLng.lng() });
          } else {
            setStreetViewNotice(t("map.noStreetView", "No street-level view available here yet."));
          }
        });
    } catch (e) { setStreetViewNotice(t("map.noStreetView", "No street-level view available here yet.")); }
  };
  useEffect(() => {
    if (!streetView || !streetViewDivRef.current) return;
    const google = (window as any).google;
    try {
      streetPanoRef.current = new google.maps.StreetViewPanorama(streetViewDivRef.current, {
        position: streetView, pov: { heading: mapRef.current?.getHeading?.() || 0, pitch: 0 },
        zoom: 1, disableDefaultUI: true, linksControl: true, clickToGo: true,
        addressControl: false, showRoadLabels: false, fullscreenControl: false, motionTrackingControl: false,
      });
    } catch (e) { setStreetView(null); }
    return () => { try { streetPanoRef.current?.setVisible(false); } catch (e) {} streetPanoRef.current = null; };
  }, [streetView]);
  const mapReadyRef = useRef(false);
  const mapReadyMonotonicRef = useRef<number | undefined>(undefined);
  const recordVisualApplication = (rec: any) => {
    if (!rec.authorizedPreview) return;
    rec.visualLoadTiming = measureVisualApplication(rec.authorizedPreview, performance.now(), mapReadyMonotonicRef.current);
    const debug = (window as any).__perixDebug || ((window as any).__perixDebug = {});
    debug.visualLastApplied = rec.visualLoadTiming;
    const rect = mapDivRef.current?.getBoundingClientRect();
    const bounds = mapRef.current?.getBounds?.();
    const position = rec.marker.getPosition?.();
    if (debug.visualFirstApplied || debug.visualFirstFramePending || document.visibilityState !== 'visible'
        || !rect?.width || !rect.height || !bounds || !position || !bounds.contains(position)) return;
    debug.visualFirstFramePending = true;
    requestAnimationFrame(() => {
      debug.visualFirstFramePending = false;
      const sample = rec.authorizedPreview && sampleAuthorizedPreview(rec.authorizedPreview, performance.now());
      if (!sample || sample.expired || document.visibilityState !== 'visible') return;
      debug.visualFirstApplied = rec.visualLoadTiming;
      debug.visualFirstFrameAfterApplyMs = performance.now();
      debug.visualPageToFirstFrameMs = debug.visualFirstFrameAfterApplyMs
        - debug.visualFirstApplied.navigation_started_monotonic_ms;
    });
  };
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
  // Zoom fires continuously mid-gesture: overlay rebuilds (stops/landmarks)
  // are debounced so a fast zoom-out/in resizes pins in place instead of
  // destroying/recreating DOM overlays on every fractional tick.
  const zoomDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const onMarkerPressRef = useRef(onMarkerPress);
  onMarkerPressRef.current = onMarkerPress;
  const landmarksMutedRef = useRef(landmarksMuted);
  landmarksMutedRef.current = landmarksMuted;
  const onTransitStopPressRef = useRef(onTransitStopPress);
  onTransitStopPressRef.current = onTransitStopPress;
  // Auto-fit camera state: cancelled by any user gesture, re-armed only when
  // the gateway issues a new token (new explicit action).
  const autoCameraRef = useRef<AutoCameraState|null>(null);
  const autofitRef = useRef(autofit);
  autofitRef.current = autofit;
  const onAutofitCancelRef = useRef(onAutofitCancel);
  onAutofitCancelRef.current = onAutofitCancel;
  const cancelAutofit = () => {
    const config=autofitRef.current;
    if(!config)return;
    const next=advanceAutoCamera(autoCameraRef.current,config.token,null).state;
    if(next.cancelled)return;
    autoCameraRef.current={...next,cancelled:true};
    onAutofitCancelRef.current?.();
  };

  // Visual estimates follow the authorized source-clock curve in geographic
  // space, independent of camera/zoom and React renders. Only the separate
  // legacy GPS branch below uses bounded interpolation/extrapolation.
  const animRunningRef = useRef(false);
  const animRafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);
  const loopTick = () => {
    let active = false;
    const queueCandidates: StationQueueCandidate[] = [];
    const now = Date.now();
    lastFrameRef.current = now;
    markersRef.current.forEach((rec: any) => {
      if (!rec || !rec.marker) return;
      try {
        if (rec.authorizedPreview && rec.path && rec.cum) {
          const sample = sampleAuthorizedPreview(rec.authorizedPreview, performance.now());
          if (!sample || (rec.progNow != null && sample.progressM + 1e-5 < rec.progNow)) {
            rec.authorizedPreview = null;
          } else {
            rec.progNow = sample.progressM;
            rec.visualStopIndex = sample.stopOccurrenceIndex;
            rec.visualState = sample.state;
            rec.display_eta_seconds = sample.displayEtaSeconds;
            rec.countdown_event = sample.countdownEvent;
            rec.countdown_seconds = sample.countdownSeconds;
            rec.station_cycle_state = sample.stationCycleState;
            rec.relative_motion_level = sample.relativeMotionLevel;
            const point = sampleVisualPath(rec.path, rec.cum, sample.progressM);
            if (point) {
              rec.marker.setPosition({lat:point.lat,lng:point.lng});
              if (!(window as any).__perixDebug?.visualFirstApplied) recordVisualApplication(rec);
              if (point.heading != null) {
                rec.heading=point.heading;
                const delta=rec.paintedVisualHeading == null ? 360
                  : Math.abs(((point.heading-rec.paintedVisualHeading+540)%360)-180);
                if (delta>=1 && performance.now()-(rec.lastVisualHeadingPaint || 0)>=80) {
                  updateVehicleMarkerIcon((window as any).google,rec);
                  rec.paintedVisualHeading=point.heading;rec.lastVisualHeadingPaint=performance.now();
                }
              }
              if (!sample.expired) queueCandidates.push({ id: rec.vehicleId, mode: rec.type, estimated: rec.estimated,
                state: sample.state, stopId: sample.stationStopId, latitude: point.lat, longitude: point.lng,
                heading: point.heading, departureAtMs: sample.stationDepartureAtMs, arrivalAtMs: sample.stationArrivalAtMs,
                sizePx: Math.max(16,Math.round((rec.type === 'tram' ? 82 : 64)*rec.scale)) });
            }
            else rec.authorizedPreview = null;
            if (sample.expired) { rec.authorizedPreview = null; rec.marker.setVisible(false); }
            else if (rec.authorizedPreview) active = true;
          }
          return;
        }
        if (rec.animStart == null) return;
        const t = (now - rec.animStart) / Math.max(1, rec.animDuration || 1000);
        // Extrapolation cap: keep gliding at the same speed for up to 3x
        // the glide duration after the target - a late poll stays smooth.
        const tt = Math.min(Math.max(t, 0), 3.0);
        if (rec.path && rec.cum && rec.progTo != null && Number.isFinite(rec.progFrom) && Number.isFinite(rec.progTo)) {
          // Progress interpolation along the canonical road/rail polyline:
          // the vehicle follows the curves, never a straight chord.
          rec.progNow = rec.progFrom + (rec.progTo - rec.progFrom) * tt;
          const np = pointAtProgress(rec.path, rec.cum, rec.progNow);
          if (Number.isFinite(np.lat) && Number.isFinite(np.lng)) {
            rec.marker.setPosition(np);
          } else {
            rec.animStart = null;
          }
        } else if (rec.geoTo) {
          const lat = rec.geoFrom.lat + (rec.geoTo.lat - rec.geoFrom.lat) * tt;
          const lng = rec.geoFrom.lng + (rec.geoTo.lng - rec.geoFrom.lng) * tt;
          rec.marker.setPosition({ lat, lng });
        }
        if (t >= 3.0) {
          rec.animStart = null;
        } else {
          active = true;
        }
      } catch (e) {
        // One bad record must never kill the whole animation loop (a
        // silent death here made markers update only on re-renders).
        rec.animStart = null;
        console.warn("[WebMap] anim tick failed", e);
        const dbg = (window as any).__perixDebug || ((window as any).__perixDebug = {});
        dbg.lastAnimError = String(e);
      }
    });
    // Separate only simultaneously waiting estimated tram symbols on the same
    // directed platform. No source progress, ETA, path or preview is rewritten.
    const queueOffsets = stationQueueOffsets(queueCandidates,mapRef.current?.getHeading?.() || 0);
    const queueNow = performance.now();
    markersRef.current.forEach((rec: any) => {
      if (!rec.marker || rec.type !== 'tram' || !rec.estimated) return;
      const target = queueOffsets.get(rec.vehicleId) || { x: 0, y: 0, rank: 0 };
      const previous = rec.queueOffset;
      rec.queueOffset = smoothQueueOffset(previous,target,queueNow-(rec.queueOffsetAt ?? queueNow));
      rec.queueOffsetAt = queueNow;
      if (!previous || Math.hypot(rec.queueOffset.x-previous.x,rec.queueOffset.y-previous.y)>0.05) {
        updateVehicleMarkerIcon((window as any).google,rec);
      }
      if (Math.hypot(rec.queueOffset.x-target.x,rec.queueOffset.y-target.y)>0.05) active = true;
    });
    if (active) {
      animRafRef.current = requestAnimationFrame(loopTick);
    } else {
      animRunningRef.current = false;
      animRafRef.current = null;
    }
  };
  const kickAnim = () => {
    // Self-healing: if the loop died (exception or throttle), a poll can
    // restart it even when the running flag is still set.
    if (animRunningRef.current && Date.now() - lastFrameRef.current < 1000) return;
    animRunningRef.current = true;
    animRafRef.current = requestAnimationFrame(loopTick);
  };
  const installGatewayPreview = (rec: any, rep: MapMarker) => {
    rec.authorizedPreview = null;
    if (!rep.path || rep.path.length < 2 || rep.progressM == null || rep.publicationStatus === "PENDING") return;
    const cumulative = polylineCumulative(rep.path);
    const sampledPoint = pointAtProgress(rep.path, cumulative, rep.progressM);
    if (!Number.isFinite(sampledPoint.lat) || !Number.isFinite(sampledPoint.lng)
        || haversineMeters({ lat: rep.latitude, lng: rep.longitude }, sampledPoint) > 10) return;
    const preview = authorizePreview(rep.motionPreview, { estimated: !!rep.estimated, mode: rep.type,
      journeyId: rep.journeyId, patternId: rep.patternId, planRevision: rep.planRevision,
      progressM: rep.progressM, pathLengthM: cumulative[cumulative.length - 1],
      geometryFingerprint: rep.geometryFingerprint, nextTimelineIndex: rep.nextTimelineIndex,
      distanceToNextStopM: rep.distanceToNextStopM, nextStopEtaSeconds: rep.nextStopEtaSeconds }, Date.now(), performance.now());
    if (!preview) return;
    rec.path = rep.path;
    rec.cum = cumulative;
    rec.authorizedPreview = preview;
    kickAnim();
  };
  const installVisualPreview = (rec: any, rep: MapMarker) => {
    const sameGeometry = rec.visualGeometryFingerprint === rep.geometryFingerprint;
    const cumulative = sameGeometry && rec.cum ? rec.cum : rep.path && polylineCumulative(rep.path);
    let preview = rep.motionPreview;
    if (!rep.path || rep.path.length < 2 || !cumulative || rep.progressM == null) preview = null;
    else {
      const point = pointAtProgress(rep.path, cumulative, rep.progressM);
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)
          || haversineMeters({ lat: rep.latitude, lng: rep.longitude },point)>10) preview = null;
    }
    const result = acceptVisualPublication(rec,preview,{ estimated:!!rep.estimated,mode:rep.type,
      journeyId:rep.journeyId,patternId:rep.patternId,planRevision:rep.planRevision,
      progressM:rep.progressM,pathLengthM:cumulative?.[cumulative.length-1] ?? 0,
      geometryFingerprint:rep.geometryFingerprint,nextTimelineIndex:rep.nextTimelineIndex,
      distanceToNextStopM:rep.distanceToNextStopM,nextStopEtaSeconds:rep.nextStopEtaSeconds },
      rep.publicationStatus,Date.now(),performance.now());
    if (result === 'hidden') rec.marker.setVisible(false);
    if (result === 'updated') {
      rec.path=rep.path; rec.cum=cumulative; rec.visualGeometryFingerprint=rep.geometryFingerprint;
      rec.estimateRevision=rep.estimateRevision ?? null; rec.journeyId=rep.journeyId ?? null;
      const current = rec.authorizedPreview && sampleAuthorizedPreview(rec.authorizedPreview,performance.now());
      if (current) {
        rec.visualStopIndex=current.stopOccurrenceIndex; rec.visualState=current.state;
        rec.display_eta_seconds=current.displayEtaSeconds; rec.relative_motion_level=current.relativeMotionLevel;
        rec.countdown_event=current.countdownEvent;rec.countdown_seconds=current.countdownSeconds;rec.station_cycle_state=current.stationCycleState;
      }
      rec.marker.setPosition(pointAtProgress(rec.path,rec.cum,rec.progNow));
      rec.marker.setVisible(true);
      recordVisualApplication(rec);
    }
    if (rec.authorizedPreview) kickAnim();
    return result;
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
      let toProg = hasProgressM
        ? (targetProgressM as number)
        : progressOfPoint(rec.path, rec.cum, pos.lat, pos.lng);
      if (!Number.isFinite(toProg)) {
        toProg = progressOfPoint(rec.path, rec.cum, pos.lat, pos.lng);
      }
      if (!Number.isFinite(toProg)) {
        // Nothing usable: place the marker at the raw position, no path.
        rec.animStart = null;
        rec.marker.setPosition({ lat: pos.lat, lng: pos.lng });
        return;
      }
      if (!hasProgressM) {
        // Only when re-projecting in the browser: drop the path if the
        // position clearly does not belong to it. Backend progress_m
        // needs no such check - it is the authoritative position.
        const onPath = pointAtProgress(rec.path, rec.cum, toProg);
        const offDist = haversineMeters({ lat: pos.lat, lng: pos.lng }, { lat: onPath.lat, lng: onPath.lng });
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
        if (d > 250 || dt <= 0 || dt > 30000 || toProg < fromProg) {
          // Snap: brand-new vehicle, trip change, a stale update, or the
          // extrapolation overshot the new poll target (never glide back).
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

  const businessEmblem = (business: { root_category?: string | null; subcategory?: string | null; subcategories?: string[] | null }) => {
    const ref = businessEmblemKey(business);
    return ref ? illustratedIconSource(ref.kind, ref.key) ?? undefined : undefined;
  };

  const generatedMarkers: MapMarker[] = [
    ...businesses.map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      address: business.address,
      type: "business" as const,
      description: business.category,
      pinImage: business.profile_photo || business.logo_image || business.cover_image,
      pinColor: business.root_category === "hotels" ? COLORS.pinHotel : COLORS.pinBusiness,
      emblem: businessEmblem(business as { root_category?: string | null; subcategory?: string | null; subcategories?: string[] | null }),
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
        pinImage: event.creator?.profile_photo || event.artist?.profile_photo || event.business?.logo_image || event.cover_image_url,
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
        pinImage: activity.creator?.profile_photo || activity.tagged_business?.logo_image || activity.cover_image_url,
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
        pinImage: artist.profile_photo || artist.cover_photo,
        pinColor: COLORS.pinClosed,
      })),
    ...rentals
      .filter(r => r.latitude != null && r.longitude != null)
      .map((rental) => ({
        id: rental.rental_id,
        latitude: rental.latitude!,
        longitude: rental.longitude!,
        title: rental.title,
        address: rental.address,
        type: "rental" as const,
        description: rental.rent_price || rental.address || "",
        pinImage: rental.business_logo || (rental as any).owner_photo || rental.cover_image,
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
        pinImage: (job as any).business_logo,
        pinColor: COLORS.pinJob,
      })),
    ...services
      .filter(s => s.latitude != null && s.longitude != null && s.root_category !== "rentals" && s.root_category !== "rental-real-estate")
      .map((service) => ({
        id: service.service_id,
        latitude: service.latitude!,
        longitude: service.longitude!,
        title: service.name,
        address: service.address,
        type: "service" as const,
        description: service.address || "",
        pinImage: (service as any).business_logo || service.cover_image_url,
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
        `${m.id}|${m.latitude}|${m.longitude}|${m.title || ""}|${m.address || ""}|${m.type || ""}|${m.pinColor || ""}|${m.pinInnerColor || ""}|${m.pinImage || ""}|${m.pinImageFit || ""}|emblem${m.emblem ? 1 : 0}|compass${!!m.selectionCompass}` +
        `|h${m.heading ?? ""}|s${m.positionState || ""}|p${m.progressM ?? ""}|j${m.journeyId || ""}|u${m.publicationStatus || ""}|e${!!m.estimated}|label${m.label || ""}` +
        `|r${m.planRevision || ""}|g${m.geometryFingerprint || ""}|c${m.motionPreview?.client_received_at_ms ?? ""}` +
        (m.path && m.path.length ? `|l${m.path.length}:${m.path[0]?.latitude}` : "")
      );
    });
    return parts.join(";");
  }, [allMarkers]);

  const groupedMarkers = useMemo(() => {
    const groups = new Map<string, MapMarker[]>();
    allMarkers.forEach((m) => {
      const key = mapMarkerGroupKey(m);
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
        pinImage: items[0].pinImage,
        pinImageFit: items[0].pinImageFit,
        emblem: items[0].emblem,
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
    const host=mapDivRef.current;
    const listeners:any[]=[];
    // Capture before Google's controls/pinch handlers run. This also covers
    // zoom buttons and keyboard controls, not just dragging and wheel zoom.
    const onUserGesture=(event:Event)=>{if(event.isTrusted)cancelAutofit();};
    for(const event of ['pointerdown','touchstart','wheel','keydown'])host.addEventListener(event,onUserGesture,{capture:true,passive:true});
    ensurePerixCinemaStyles();
    loadGoogleScript()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const google = (window as any).google;
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: centerLat, lng: centerLng },
          zoom: Number.isFinite(focusZoom) ? focusZoom : 14,
          // Vector ROADMAP so buildings render natively in 3D at the locked 67°
          // tilt. (Vector hybrid stays flat: aerial photos have no extrusion.)
          // POI/transit hiding + Perix palette live in the Cloud console style.
          mapId: PERIX_VECTOR_MAP_ID,
          tilt: LOCKED_MAP_TILT,
          heading: 0,
          mapTypeId: "roadmap",
          isFractionalZoomEnabled: true,
          maxZoom: LANDMARK_MAP_MAX_ZOOM,
          disableDefaultUI: staticMode,
          zoomControl: !staticMode,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: !staticMode,
          gestureHandling: staticMode ? "none" : "greedy",
        });
        const applyLockedTilt = (target: any) => {
          try {
            const want = lockedTiltForRendering(target.getRenderingType?.());
            if (Math.abs((target.getTilt?.() || 0) - want) >= 1) target.setTilt?.(want);
          } catch (e) {}
        };
        applyLockedTilt(map);
        map.addListener("tilesloaded", () => applyLockedTilt(map));
        try { (window as any).__perixMap = map; } catch (e) {}

        map.addListener("bounds_changed", () => {
          // NO animation state is touched here anymore. Vehicles are
          // native google.maps.Marker objects - the map itself keeps them
          // pinned to their geographic coordinate during pan/zoom, while
          // the rAF glide continues normally. The old freeze workaround
          // (for DOM overlays) cancelled every in-flight animation on
          // every tiny gesture, which read as 'vehicles never move'.
          const bounds = map.getBounds();
          if (!bounds) return;
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const key = `${sw.lat()},${ne.lat()},${sw.lng()},${ne.lng()}`;
          if (key === lastBoundsRef.current) return;
          lastBoundsRef.current = key;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            if (cancelled) return;
            setStopViewportRevision(value => value + 1);
            onRegionChangeCompleteRef.current?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
          }, 500);
          onRegionChangeRef.current?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
        });

        map.addListener("click", (e: any) => {
          onMapPressRef.current?.(e.latLng.lat(), e.latLng.lng());
        });

        listeners.push(map.addListener("dragstart", cancelAutofit));

        // One in-place refresh for every camera movement (pan, zoom, tilt):
        // pins, vehicles and lines rescale where they stand. Nothing is
        // destroyed or recreated here, so there are no reloads and no jumps.
        const refreshScales = () => {
          const liveMap = mapRef.current; if (!liveMap) return;
          const z = liveMap.getZoom() || 14;
          const s = Math.max(0.8, Math.min(1.7, z / 12));
          const vs = vehicleScale(z);
          markersRef.current.forEach((rec: any) => {
            try { rec?.resize?.(s, vs, z); } catch (e) {}
          });
          landmarkCacheRef.current.forEach((rec: any) => {
            try { rec?.resize?.(); } catch (e) {}
          });
          stopsCacheRef.current.forEach((rec: any) => {
            try { rec?.resize?.(z); } catch (e) {}
          });
          const reweight = (entry: any, fallback: number) => {
            try { (entry?.poly ?? entry).setOptions({ strokeWeight: routeWeightForZoom(entry?.base ?? fallback, z) }); } catch (e) {}
          };
          transitLinesRef.current.forEach((entry: any) => reweight(entry, 2));
          planLinesRef.current.forEach((entry: any) => reweight(entry, 5));
        };
        map.addListener("zoom_changed", () => {
          refreshScales();
          // Tilt stays locked — re-apply whenever the camera moved.
          applyLockedTilt(map);
          try {
            const zoom = map.getZoom() || 14;
            setMapZoomLevel(prev => ((prev >= 19) === (zoom >= 19) ? prev : zoom));
            if (zoom < 19) { setStreetView(null); setStreetViewNotice(null); }
          } catch (e) {}
          if (zoomDebounceRef.current) clearTimeout(zoomDebounceRef.current);
          zoomDebounceRef.current = setTimeout(() => {
            if (cancelled) return;
            setStopViewportRevision(value => value + 1);
          }, 350);
          onZoomChangeRef.current?.(map.getZoom() || 14);
        });
        // Tilt stays locked: gestures snap back (threshold avoids loops).
        // Tilt rescales from the POV without reloading any data.
        map.addListener("tilt_changed", () => {
          refreshScales();
          applyLockedTilt(map);
        });
        map.addListener("heading_changed", () => {
          const heading=map.getHeading?.() || 0;
          markersRef.current.forEach((rec:any)=>{if(rec?.marker)updateVehicleMarkerIcon((window as any).google,rec);});
          setMapHeading((previous:number)=>Math.abs(previous-heading)<0.1?previous:heading);
          setStopViewportRevision(value=>value+1);
        });

        if (cancelled) return;
        mapRef.current = map;
        mapReadyRef.current = true;
        mapReadyMonotonicRef.current = performance.now();
        setMapHeading(map.getHeading?.() || 0);
        setMapReady(true);
        readyCallbackRef.current?.(true);
        console.log("[WebMap] initialized zoom=" + map.getZoom());
        onZoomChangeRef.current?.(map.getZoom() || 14);
      })
      .catch((e) => { console.error("[WebMap] init failed", e); setMapError(true); readyCallbackRef.current?.(false); });
    return () => {
      cancelled = true;
      for(const event of ['pointerdown','touchstart','wheel','keydown'])host.removeEventListener(event,onUserGesture,true);
      listeners.forEach(listener=>listener.remove?.());
      if(debounceRef.current)clearTimeout(debounceRef.current);
      if(zoomDebounceRef.current)clearTimeout(zoomDebounceRef.current);
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
    const existingPins = new Map<string, any>();
    markersRef.current.forEach((rec: any) => {
      if (rec?.vehicleId) {
        existingTransit.set(rec.vehicleId, rec);
      } else if (rec?.pinKey) {
        existingPins.set(rec.pinKey, rec);
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
      if (authoritativeTransit && transitItems.length && transitItems.length !== group.items.length) {
        // A vehicle sharing coordinates with a place must remain an individual
        // moving vehicle rather than being swallowed by a static cluster.
        transitItems.forEach((m) => transitMarkers.push(m));
        const places = group.items.filter((i) => i.type !== "bus" && i.type !== "tram");
        pinGroups.push({ ...group, items: places, count: places.length, type: places[0].type,
          pinImage: places.length === 1 ? places[0].pinImage : undefined,
          pinImageFit: places.length === 1 ? places[0].pinImageFit : undefined,
          pinInnerColor: places.length === 1 ? places[0].pinInnerColor : undefined,
          pinColor: places.length === 1 ? places[0].pinColor ?? COLORS.pinClosed : "#264348" });
        return;
      }
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
      // Fleet polls must never tear down stationary directory pins. Retain the
      // exact overlay/DOM until that place's appearance or membership changes.
      const signature = JSON.stringify(group.items);
      const existing = existingPins.get(group.key);
      existingPins.delete(group.key);
      if (existing?.pinSignature === signature && existing.map === mapRef.current) {
        markersRef.current.push(existing);
        return;
      }
      existing?.overlay?.setMap(null);
      const isGroup = group.count > 1;
      const isTaxi=group.count===1 && group.items[0].type==="taxi";
      const baseSize = isGroup
        ? (group.count < 3 ? 26 : group.count < 10 ? 30 : group.count < 30 ? 34 : 40)
        : isTaxi ? 22 : 28;
      const baseFont = group.count >= 100 ? 9 : group.count >= 10 ? 10.5 : 12;
      const sizePx = isTaxi ? Math.round(baseSize * zoomScale) : mapEntityPinSize(zoom,pinScaleZoomRef.current);
      const innerSize = Math.round(Math.max(6, 8 * zoomScale));
      const fontSize = Math.min(17, baseFont * zoomScale);
      const pinColor = group.pinColor || "#264348";
      const profileImage=!isTaxi ? group.pinImage : undefined;
      const imageFit=group.pinImageFit || "cover";

      // Container div (positioned by OverlayView)
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.cursor = "pointer";
      container.style.zIndex=String(group.items[0].selectionCompass?MAP_LAYERS.selection:MAP_LAYERS.pin);
      container.style.userSelect = "none";
      google.maps.OverlayView.preventMapHitsAndGesturesFrom(container);

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

      if (!isGroup && group.items[0].selectionCompass) {
        pin.setAttribute("data-testid", "perix-destination-compass");
        pin.style.width = "38px"; pin.style.height = "38px";
        pin.style.backgroundColor = "transparent"; pin.style.border = "0"; pin.style.boxShadow = "none";
        const image = document.createElement("img");
        const asset = require("../assets/brand/perix-compass-transparent.png");
        image.src = resolveMapAssetUri(asset);
        image.alt = group.items[0].title || "PERIX"; image.style.width = "100%"; image.style.height = "100%";
        pin.appendChild(image);
        // Compass records must participate in normal overlay cleanup too.
        const resize=(_scale:number,_vehicleScale?:number,level=mapRef.current?.getZoom?.() ?? 14)=>{
          const px=Math.max(8,Math.round(mapEntityPinSize(level,pinScaleZoomRef.current)*perspectiveMultiplier(mapRef.current,group.items[0]?.latitude,group.items[0]?.longitude)));
          pin.style.width=px+"px";pin.style.height=px+"px";
        };
        resize(zoomScale,vScale,zoom);
        markersRef.current.push({overlay:null as any,resize});
      } else if (!isTaxi && group.emblem && !group.items[0].selectionCompass) {
        // Subcategory emblem pin: slightly larger wooden emblem, a small profile
        // medallion and the place name below. Applies to businesses and public
        // services on every map; all other types keep their legacy pins.
        const emblemUri = resolveMapAssetUri(group.emblem);
        pin.dataset.emblemPin = "true";
        if (isGroup) pin.dataset.addressProfileGroup = "true";
        pin.style.backgroundColor = "#fff";
        pin.style.borderColor = pinColor;
        pin.style.overflow = "visible";
        const emblem = document.createElement("img");
        emblem.src = emblemUri; emblem.alt = group.items[0].title || ""; emblem.draggable = false;
        Object.assign(emblem.style, { objectFit: "contain", pointerEvents: "none" });
        const fallback = document.createElement("div");
        fallback.textContent = profileInitial(group.items[0].title);
        Object.assign(fallback.style, { display: "none", alignItems: "center", justifyContent: "center",
          width: "100%", height: "100%", borderRadius: "50%", backgroundColor: pinColor, color: "#fff",
          fontFamily: "Arial,sans-serif", fontWeight: "800" });
        emblem.onerror = () => { emblem.style.display = "none"; fallback.style.display = "flex"; };
        pin.appendChild(fallback);
        pin.appendChild(emblem);
        const medallion = document.createElement("div");
        const medSize = 18;
        Object.assign(medallion.style, { position: "absolute", right: "-3px", bottom: "-3px", width: medSize + "px",
          height: medSize + "px", borderRadius: "50%", overflow: "hidden", backgroundColor: pinColor,
          border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.35)", boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          fontFamily: "Arial,sans-serif", fontWeight: "800", fontSize: "9px" });
        medallion.textContent = profileInitial(group.items[0].title);
        if (profileImage) {
          const face = document.createElement("img");
          face.src = profileImage; face.alt = ""; face.draggable = false;
          Object.assign(face.style, { width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" });
          face.onerror = () => { face.style.display = "none"; };
          medallion.textContent = ""; medallion.appendChild(face);
        }
        pin.appendChild(medallion);
        const nameLabel = document.createElement("div");
        nameLabel.dataset.pinNameLabel = "true";
        nameLabel.textContent = group.items[0].title || "";
        Object.assign(nameLabel.style, { position: "absolute", left: "0", transform: "translateX(-50%)",
          maxWidth: "120px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          fontFamily: "Arial,sans-serif", fontSize: "11px", fontWeight: "600", color: "#264348",
          textAlign: "center", pointerEvents: "none",
          textShadow: "0 0 3px #fff,1px 0 0 #fff,-1px 0 0 #fff,0 1px 0 #fff,0 -1px 0 #fff" });
        container.appendChild(nameLabel);
        if (isGroup) {
          const count = document.createElement("div");
          count.dataset.addressCount = String(group.count); count.textContent = String(group.count);
          Object.assign(count.style, { position: "absolute", right: "-4px", top: "-4px", minWidth: "16px", height: "16px",
            borderRadius: "8px", border: "1px solid #fff", padding: "0 3px", boxSizing: "border-box",
            backgroundColor: group.items[0].pinColor || pinColor,
            color: "#fff", font: "700 10px Arial,sans-serif", display: "flex", alignItems: "center", justifyContent: "center" });
          pin.appendChild(count);
        }
        const paintEmblemPin = (_scale: number, _vehicleScale?: number, level = mapRef.current?.getZoom?.() ?? 14) => {
          const px = Math.max(10,Math.round(mapEmblemPinSize(level, pinScaleZoomRef.current)*perspectiveMultiplier(mapRef.current,group.items[0]?.latitude,group.items[0]?.longitude))), border = Math.min(2, px / 10);
          pin.style.width = px + "px"; pin.style.height = px + "px";
          pin.style.borderWidth = border + "px";
          const art = Math.round(px * 0.78);
          emblem.style.width = art + "px"; emblem.style.height = art + "px";
          fallback.style.fontSize = Math.round(px * 0.42) + "px";
          const med = Math.max(14, Math.min(20, Math.round(px * 0.45)));
          medallion.style.width = med + "px"; medallion.style.height = med + "px";
          medallion.style.fontSize = Math.max(8, Math.round(med * 0.5)) + "px";
          nameLabel.style.top = (px / 2 + 4) + "px";
        };
        paintEmblemPin(zoomScale, vScale, zoom);
        markersRef.current.push({ overlay: null as any, resize: paintEmblemPin });
      } else if (isGroup) {
        // Same address: keep the first list item's identity and add a count,
        // at exactly the same base size as an individual profile pin.
        pin.dataset.addressProfileGroup="true";
        const face=document.createElement("div");
        Object.assign(face.style,{width:"100%",height:"100%",borderRadius:"50%",overflow:"hidden",
          display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",backgroundColor:pinColor});
        face.textContent=profileInitial(group.items[0].title);
        if(profileImage){
          const image=document.createElement("img");image.src=profileImage;image.alt=group.items[0].title || "";
          const inset=imageFit==="contain"?"70%":"100%";
          Object.assign(image.style,{width:inset,height:inset,objectFit:imageFit});
          face.textContent="";face.style.backgroundColor="#fff";face.appendChild(image);
        }
        pin.appendChild(face);
        const count=document.createElement("div");count.dataset.addressCount=String(group.count);count.textContent=String(group.count);
        Object.assign(count.style,{position:"absolute",right:"-4px",bottom:"-4px",minWidth:"16px",height:"16px",
          borderRadius:"8px",border:"1px solid #fff",padding:"0 3px",boxSizing:"border-box",backgroundColor:group.items[0].pinColor || pinColor,
          color:"#fff",font:"700 10px Arial,sans-serif",display:"flex",alignItems:"center",justifyContent:"center"});
        pin.appendChild(count);
        const resize=(_scale:number,_vehicleScale?:number,level=mapRef.current?.getZoom?.() ?? 14)=>{
          const px=Math.max(8,Math.round(mapEntityPinSize(level,pinScaleZoomRef.current)*perspectiveMultiplier(mapRef.current,group.items[0]?.latitude,group.items[0]?.longitude)));
          pin.style.width=px+"px";pin.style.height=px+"px";pin.style.borderWidth=Math.min(2,px/10)+"px";
        };
        resize(zoomScale,vScale,zoom);
        markersRef.current.push({ overlay: null as any, resize });
      } else if (profileImage) {
        pin.style.overflow="hidden";
        const fallback=document.createElement("div");
        fallback.textContent=profileInitial(group.items[0].title);
        fallback.style.width=innerSize+"px";fallback.style.height=innerSize+"px";
        fallback.style.borderRadius="50%";fallback.style.backgroundColor=pinColor;
        fallback.style.color="#fff";fallback.style.display="flex";fallback.style.alignItems="center";fallback.style.justifyContent="center";
        fallback.style.fontFamily="Arial,sans-serif";fallback.style.fontWeight="800";fallback.style.fontSize=Math.max(8,innerSize*0.7)+"px";
        pin.appendChild(fallback);
        const avatar=document.createElement("img");
        avatar.src=profileImage;avatar.alt=group.items[0].title || "";avatar.draggable=false;
        avatar.style.position="absolute";
        avatar.style.borderRadius=imageFit==="contain"?"0":"50%";avatar.style.objectFit=imageFit;
        avatar.onerror=()=>{avatar.style.display="none";};pin.appendChild(avatar);
        const resize=(_scale:number,_vehicleScale?:number,level=mapRef.current?.getZoom?.() ?? 14)=>{
          const px0=mapEntityPinSize(level,pinScaleZoomRef.current);
          const px=Math.max(8,Math.round(px0*perspectiveMultiplier(mapRef.current,group.items[0]?.latitude,group.items[0]?.longitude))),border=Math.min(2,px/10);
          const artworkSize=Math.max(0,(px-border*2)*(imageFit==="contain"?0.7:1));
          pin.style.width=px+"px";pin.style.height=px+"px";
          pin.style.borderWidth=border+"px";
          pin.style.backgroundColor=imageFit==="contain"&&px>=10?"#fff":pinColor;
          avatar.style.width=artworkSize+"px";avatar.style.height=artworkSize+"px";
          avatar.style.left=((px-border*2-artworkSize)/2)+"px";
          avatar.style.top=((px-border*2-artworkSize)/2)+"px";
          avatar.style.visibility=px>=10?"visible":"hidden";
          fallback.style.visibility=px>=10?"visible":"hidden";
        };
        resize(zoomScale,vScale,zoom);
        markersRef.current.push({overlay:null as any,resize});
      } else if (group.pinInnerColor) {
        const inner = document.createElement("div");
        inner.style.width = innerSize + "px";
        inner.style.height = innerSize + "px";
        inner.style.borderRadius = "50%";
        inner.style.backgroundColor = group.pinInnerColor;
        pin.appendChild(inner);

        const resize = (scale: number,_vehicleScale?:number,level=mapRef.current?.getZoom?.() ?? 14) => {
          const raw = isTaxi ? Math.round(baseSize*scale) : mapEntityPinSize(level,pinScaleZoomRef.current);
          const px = isTaxi ? raw : Math.max(8,Math.round(raw*perspectiveMultiplier(mapRef.current,group.items[0]?.latitude,group.items[0]?.longitude)));
          pin.style.width = px + "px";
          pin.style.height = px + "px";
          pin.style.borderWidth = Math.min(2,px/10)+"px";
          const ins = Math.min(px*0.4,8*scale);
          inner.style.width = ins + "px";
          inner.style.height = ins + "px";
        };
        resize(zoomScale,vScale,zoom);
        markersRef.current.push({ overlay: null as any, resize });
      } else {
        const resize = (scale: number,_vehicleScale?:number,level=mapRef.current?.getZoom?.() ?? 14) => {
          const raw = isTaxi ? Math.round(baseSize*scale) : mapEntityPinSize(level,pinScaleZoomRef.current);
          const px = isTaxi ? raw : Math.max(8,Math.round(raw*perspectiveMultiplier(mapRef.current,group.items[0]?.latitude,group.items[0]?.longitude)));
          pin.style.width = px + "px";
          pin.style.height = px + "px";
          pin.style.borderWidth = Math.min(2,px/10)+"px";
        };
        resize(zoomScale,vScale,zoom);
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
        onMarkerPressRef.current?.(group.items[0].id);
      });

      const record = markersRef.current[markersRef.current.length - 1];
      if (record) Object.assign(record, { overlay, pinKey: group.key, pinSignature: signature, map: mapRef.current });
    });
    existingPins.forEach(record => record.overlay?.setMap(null));

    // Transit vehicles: NATIVE google.maps.Marker with an SVG icon. The
    // map itself pins each marker to its geographic coordinate through
    // pan/zoom - no custom DOM overlay can drift with map gestures.
    sortedTransit.forEach((rep) => {
      const existing = existingTransit.get(rep.id);
      if (existing) {
        const rec = existing;
        if (rep.visualEstimate && rep.estimated) {
          const result = installVisualPreview(rec,rep);
          rec.heading=sampleVisualPath(rec.path || [],rec.cum || [],rec.progNow)?.heading
            ?? (typeof rep.heading === 'number' ? rep.heading : 0);
          rec.label=rep.label; rec.type=rep.type; rec.scale=vScale; rec.estimated=true;
          updateVehicleMarkerIcon(google,rec);
          rec.marker.setOpacity(result === 'held' ? 0.45 : 0.72);
          markersRef.current.push(rec);
          return;
        }
        if ((authoritativeTransit || rep.visualEstimate) && rep.estimated) {
          rec.authorizedPreview = null;
          if (rec.journeyId === rep.journeyId && rec.estimateRevision === rep.estimateRevision
              && typeof rec.progNow === "number" && typeof rep.progressM === "number"
              && rep.progressM + 0.15 < rec.progNow) {
            // A delayed sample cannot rewind the same estimate revision.
            rec.animStart = null;
            markersRef.current.push(rec);
            return;
          }
          const result = applyGatewayTransitUpdate(rec, rep);
          rec.heading = typeof rep.heading === "number" ? rep.heading : 0;
          rec.label = rep.label;
          rec.type = rep.type;
          rec.scale = vScale;
          rec.estimated = true;
          if (result === "updated") {
            rec.estimateRevision = rep.estimateRevision ?? null;
            installGatewayPreview(rec, rep);
          }
          updateVehicleMarkerIcon(google, rec);
          rec.marker.setOpacity(result === "held" || rep.publicationStatus === "PENDING" ? 0.45 : 0.72);
          markersRef.current.push(rec);
          return;
        }
        // Keep the vehicle's canonical path fresh (the resolved line can
        // change once, e.g. when the geometry worker completes it).
        const pathChanged = rep.path != null && rec.path !== rep.path;
        if (rep.path && rep.path.length >= 2) {
          rec.path = rep.path;
          rec.cum = polylineCumulative(rep.path);
        } else {
          rec.path = null;
          rec.cum = null;
        }
        if (pathChanged && rec.path && rec.cum) {
          // The vehicle switched canonical line (direction change at the
          // terminus): position directly at the backend progress on the
          // NEW line - never glide across the city from the old line.
          rec.progNow =
            typeof rep.progressM === "number" && Number.isFinite(rep.progressM)
              ? rep.progressM
              : progressOfPoint(rec.path, rec.cum, rep.latitude, rep.longitude);
          rec.progFrom = rec.progNow;
          rec.progTo = null;
          rec.animStart = null;
          rec.marker.setPosition(pointAtProgress(rec.path, rec.cum, rec.progNow));
        }
        rec.heading = typeof rep.heading === "number" ? rep.heading : 0;
        rec.scale = vScale;
        rec.type = rep.type;
        rec.label = rep.label;
        rec.estimated = rep.estimated ?? false;
        rec.journeyId = rep.journeyId ?? null;
        rec.positionState = rep.positionState ?? null;
        setVehicleTarget(rec, { lat: rep.latitude, lng: rep.longitude }, Date.now(), rep.progressM ?? null);
        updateVehicleMarkerIcon(google, rec);
        rec.marker.setOpacity(rec.estimated ? 0.72 : 1);
        markersRef.current.push(rec);
        return;
      }

      // A pending new estimate has no ready model position to display. Existing
      // ready journeys may hold their last point; new ones wait for readiness.
      if (authoritativeTransit && rep.estimated && rep.publicationStatus === "PENDING") return;
      if (rep.visualEstimate && rep.publicationStatus !== "READY") return;
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: rep.latitude, lng: rep.longitude },
        zIndex: google.maps.Marker.MAX_ZINDEX + 5,
        clickable: true,
      });
      const rec: any = {
        marker,
        resize: (_zoomScaleArg: number, vScaleArg?: number) => {
          const base = vScaleArg ?? vehicleScale(mapRef.current?.getZoom?.() || 14);
          const pos = rec.marker.getPosition?.();
          const ns = base * perspectiveMultiplier(mapRef.current, pos?.lat?.(), pos?.lng?.());
          rec.scale = ns;
          updateVehicleMarkerIcon(google, rec);
        },
        vehicleId: rep.id,
        heading: typeof rep.heading === "number" ? rep.heading : 0,
        scale: vScale,
        type: rep.type,
        label: rep.label,
        estimated: rep.estimated ?? false,
        journeyId: rep.journeyId ?? null,
        estimateRevision: rep.estimateRevision ?? null,
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
        let startProg =
          typeof rep.progressM === "number" && Number.isFinite(rep.progressM)
            ? rep.progressM
            : progressOfPoint(rec.path, rec.cum, rep.latitude, rep.longitude);
        if (!Number.isFinite(startProg)) startProg = 0;
        rec.progNow = startProg;
        rec.progFrom = startProg;
        rec.progTo = null;
      }
      updateVehicleMarkerIcon(google, rec);
      marker.setOpacity(authoritativeTransit && rec.estimated && rep.publicationStatus === "PENDING" ? 0.45 : rec.estimated ? 0.72 : 1);
      if (rep.visualEstimate && rec.estimated) installVisualPreview(rec,rep);
      else if (authoritativeTransit && rec.estimated) installGatewayPreview(rec, rep);
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
    // Diagnostics for live movement (visible in DevTools console):
    const dbg = (window as any).__perixDebug || ((window as any).__perixDebug = {});
    dbg.markerSyncs = (dbg.markerSyncs || 0) + 1;
    dbg.vehicles = markersRef.current.filter((r: any) => r?.vehicleId).length;
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
        existing.poly.setPath(line.points.map((p) => ({ lat: p.latitude, lng: p.longitude })));
        existing.base = line.weight ?? 2;
        existing.poly.setOptions({
          strokeColor: line.color,
          strokeWeight: routeWeightForZoom(existing.base, mapRef.current?.getZoom?.() ?? 14),
          strokeOpacity: line.opacity ?? 0.45,
          zIndex: MAP_LAYERS.route,
        });
        return;
      }
      const poly = new google.maps.Polyline({
        path: line.points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: line.color,
        strokeWeight: routeWeightForZoom(line.weight ?? 2, mapRef.current?.getZoom?.() ?? 14),
        strokeOpacity: line.opacity ?? 0.45,
        zIndex: MAP_LAYERS.route,
      });
      if (onTransitLineClick && line.routeNumber) {
        poly.addListener("click", () => {
          onTransitLineClick(line.routeNumber as string, (line as any).patternId);
        });
      }
      poly.setMap(mapRef.current);
      transitLinesRef.current.set(key, { poly, base: line.weight ?? 2 });
    });
    transitLinesRef.current.forEach((entry, key) => {
      if (!seen.has(key)) {
        try { entry.poly.setMap(null); } catch (e) {}
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
      try { p.poly.setMap(null); } catch (e) {}
    });
    planLinesRef.current = [];
    const google = (window as any).google;
    (planLines || []).forEach((line) => {
      if (!line.points || line.points.length < 2) return;
      const poly = new google.maps.Polyline({
        path: line.points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: line.color,
        strokeWeight: routeWeightForZoom(line.weight ?? 5, mapRef.current?.getZoom?.() ?? 14),
        strokeOpacity: line.opacity ?? 0.9,
        zIndex: MAP_LAYERS.journey,
      });
      poly.setMap(mapRef.current);
      planLinesRef.current.push({ poly, base: line.weight ?? 5 });
    });
  }, [planLines, mapReady]);

  // Google's Polyline zIndex orders its vector paths, not arbitrary DOM
  // OverlayView siblings. Use a foreground SVG in that SAME pane to ensure
  // the existing route geometry actually stays above large landmark images.
  const routeForegroundRef=useRef<any>(null);
  useEffect(()=>()=>{routeForegroundRef.current?.overlay.setMap(null);routeForegroundRef.current=null;},[]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!mapReadyRef.current)return;
    const google=(window as any).google,ns='http://www.w3.org/2000/svg';
    let record=routeForegroundRef.current;
    if(record?.map!==map){record?.overlay.setMap(null);record=null;}
    if(!record){
      const container=document.createElement('div'),svg=document.createElementNS(ns,'svg');
      container.dataset.routeForeground='true';
      Object.assign(container.style,{position:'absolute',left:'0',top:'0',width:'1px',height:'1px',
        overflow:'visible',pointerEvents:'none',zIndex:String(MAP_LAYERS.route)});
      svg.setAttribute('width','1');svg.setAttribute('height','1');svg.style.overflow='visible';
      container.appendChild(svg);
      const state:any={map,container,svg,paths:[]};
      class RouteForeground extends google.maps.OverlayView {
        onAdd(){this.getPanes().overlayLayer.appendChild(container);}
        draw(){
          const projection=this.getProjection();if(!projection)return;
          container.style.display=(map.getZoom() || 14)>=LANDMARK_STREET_DETAIL_ZOOM?'block':'none';
          if(container.style.display==='none')return;
          for(const row of state.paths){
            row.path.setAttribute('d',projectedRoutePath(row.points,(point)=>
              projection.fromLatLngToDivPixel(new google.maps.LatLng(point.latitude,point.longitude))));
          }
        }
        onRemove(){container.remove();}
      }
      state.overlay=new RouteForeground();record=state;routeForegroundRef.current=record;
      record.overlay.setMap(map);
    }
    record.svg.replaceChildren();record.paths=[];
    const rows=[...(transitLines || []).map(line=>({line,journey:false})),...(planLines || []).map(line=>({line,journey:true}))];
    for(const {line,journey} of rows){
      if(line.points.length<2)continue;
      const path=document.createElementNS(ns,'path');path.dataset.routeKind=journey?'journey':'network';
      path.setAttribute('fill','none');path.setAttribute('stroke',line.color);
      path.setAttribute('stroke-width',String(line.weight ?? (journey?5:2)));
      path.setAttribute('stroke-opacity',String(line.opacity ?? (journey ? .9 : .45)));
      path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
      path.setAttribute('vector-effect','non-scaling-stroke');path.style.pointerEvents='none';
      if(!journey && onTransitLineClick && 'routeNumber' in line && line.routeNumber){
        const routeNumber=String(line.routeNumber);path.style.pointerEvents='stroke';
        path.addEventListener('click',event=>{event.stopPropagation();onTransitLineClick(routeNumber,(line as any).patternId);});
      }
      record.svg.appendChild(path);record.paths.push({path,points:line.points});
    }
    record.overlay.draw();
  },[transitLines,planLines,mapReady,onTransitLineClick]);

  // Stable illustrated stops: one fixed anchor per boarding group across
  // zoom/pan. Platform codes and names are always shown; camera heading only
  // chooses one of the supplied 360-degree icon frames.
  const transitStopsRef = useRef<any[]>([]);
  const stopsCacheRef = useRef<Map<string, any>>(new Map());
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    const zoom = mapRef.current?.getZoom?.() || 14;
    if (!transitStops || transitStops.length === 0) {
      stopsCacheRef.current.forEach((rec) => {
        try { rec.overlay.setMap(null); } catch (e) {}
      });
      stopsCacheRef.current.clear();
      transitStopsRef.current = [];
      return;
    }
    const google = (window as any).google;
    // Group the full catalogue, not the current viewport. Google projects and
    // clips existing overlays itself; pan/zoom never changes group membership.
    const visiblePins = transitStopPins(transitStops || []);
    const list = groupTransitStopIcons(visiblePins);
    // Build-time tier decides the initial paint only; zoom switches tiers
    // in place through each record's resize without rebuilding or moving it.
    const appearance = transitStopAppearance(zoom);
    const viewAngle=stopMobilityViewAngle(mapHeading);
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
        if (!overlayProjection) return;
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
    const buildPin = (s: any, lat: number, lng: number, key?: string) => {
      const container = document.createElement("div");
      container.dataset.physicalStopId = s.physical_stop_id || s.stop_id;
      container.style.zIndex=String(MAP_LAYERS.stop);
      container.dataset.platformId = s.platform_id || '';
      container.dataset.platformIds = (s.platform_ids || []).join(',');
      container.dataset.stopBucket = appearance.bucket;
      container.dataset.stopVisualSize = String(appearance.size);
      container.dataset.latitude = String(lat);
      container.dataset.longitude = String(lng);
      container.title = s.platform_codes?.length ? `${s.name} · ${s.platform_codes.join(' · ')}` : s.name;
      container.style.position = "absolute";
      // The fixed icon box is the geographic anchor. The dot tier and the
      // labels are all centered inside/under this box, so zoom-tier changes
      // or label changes can never move the pin.
      container.style.transform = "translate(-50%, -50%)";
      container.style.width = "36px";
      container.style.height = "36px";
      container.style.pointerEvents = "auto";
      container.style.cursor = "pointer";
      container.style.userSelect = "none";
      container.style.display = "block";
      container.style.boxSizing = "border-box";

      // Far zoom: small light-blue pin, exactly on the coordinate.
      const dot = document.createElement("div");
      Object.assign(dot.style, { position: "absolute", left: "50%", top: "50%",
        transform: "translate(-50%, -50%)", width: "8px", height: "8px", borderRadius: "50%",
        backgroundColor: "#59ABE3", border: "1px solid #ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
        boxSizing: "border-box" });
      container.appendChild(dot);

      // Close zoom: illustrated stop artwork (360-degree frame per heading).
      const image = document.createElement("img");
      image.src = resolveMapAssetUri(MOBILITY_VIEW_SOURCES.bus_stop[viewAngle]);
      image.alt = ""; image.draggable = false;
      Object.assign(image.style, { position: "absolute", left: "0", top: "0",
        width: "36px", height: "36px", objectFit: "contain", display: "block" });
      container.appendChild(image);

      // Platform codes and name always exist (hidden on the dot tier).
      const labels = document.createElement("div");
      Object.assign(labels.style, { position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "auto" });
      container.appendChild(labels);
      const platformCodes=Array.isArray(s.platform_codes)?s.platform_codes.filter(Boolean):[];
      if (platformCodes.length) {
        const codes=document.createElement("div");
        codes.textContent=Array.from(new Set(platformCodes)).join(" · ");
        codes.dataset.platformCodes=platformCodes.join(",");
        codes.style.fontSize="12px";codes.style.fontWeight="800";codes.style.fontFamily="Arial, sans-serif";
        codes.style.color="#264348";codes.style.backgroundColor="rgba(255,255,255,0.94)";
        codes.style.borderRadius="6px";codes.style.padding="1px 4px";codes.style.marginTop="1px";
        codes.style.whiteSpace="nowrap";codes.style.maxWidth="120px";codes.style.overflow="hidden";codes.style.textOverflow="ellipsis";
        labels.appendChild(codes);
      }
      {
        const nameEl = document.createElement("div");
        nameEl.textContent = s.name;
        nameEl.style.fontSize = "13px";
        nameEl.style.fontWeight = "700";
        nameEl.style.fontFamily = "Arial, sans-serif";
        nameEl.style.color = "#264348";
        nameEl.style.backgroundColor = "rgba(255,255,255,0.92)";
        nameEl.style.borderRadius = "6px";
        nameEl.style.padding = "1px 4px";
        nameEl.style.marginTop = "1px";
        nameEl.style.whiteSpace = "nowrap";
        labels.appendChild(nameEl);
      }

      // Tier painting is a pure visibility toggle inside the fixed anchor box,
      // scaled by POV perspective (clamped, never vanishing).
      const paintTier = (z: number) => {
        const tier = transitStopAppearance(z);
        const ps = perspectiveMultiplier(mapRef.current, lat, lng);
        const size = Math.max(1, Math.round(tier.size * ps)), icon = Math.max(0, Math.round(tier.icon * ps));
        const far = tier.dot;
        dot.style.display = far ? "block" : "none";
        image.style.display = far ? "none" : "block";
        dot.style.width=size+'px';dot.style.height=size+'px';
        image.style.width=icon+'px';image.style.height=icon+'px';
        image.style.left=(36-icon)/2+'px';image.style.top=(36-icon)/2+'px';
        labels.style.display = tier.names ? "flex" : "none";
        container.dataset.stopBucket=tier.bucket;
        container.dataset.stopVisualSize=String(tier.size);
      };
      paintTier(mapRef.current?.getZoom?.() || 14);

      container.addEventListener("click", (e) => {
        e.stopPropagation();
        onTransitStopPressRef.current?.(s as any);
      });

      const existing = key && stopsCacheRef.current.get(key);
      if (existing) {
        existing.container.replaceWith(container);
        existing.overlay.div = container;
        existing.overlay.pos = { lat, lng };
        existing.overlay.draw();
        existing.container = container;
        existing.image = image;
        existing.resize = paintTier;
        return;
      }
      const overlay = new StopOverlay(container, { lat, lng });
      overlay.setMap(mapRef.current);
      transitStopsRef.current.push(overlay);
      if (key) stopsCacheRef.current.set(key, { overlay, container, image, resize: paintTier });
      else stopsCacheRef.current.set(`anon:${lat},${lng}`, { overlay, container, image, resize: paintTier });
    };

    list.forEach((s) => {
      const center=mapRef.current.getCenter?.();
      const viewer=pinLocation || location || (center?{latitude:center.lat(),longitude:center.lng()}:null);
      const viewAngle=stopMobilityViewAngle(mapHeading,stopGeometryBearing(s,transitLines || []),stopViewerBearing(s,viewer),s.side);
      const identity=(s.platform_ids?.length?s.platform_ids.slice().sort():s.stop_ids?.length?s.stop_ids.slice().sort():[s.stop_id]).join('|');
      const key = `stop:${identity}:name:${String(s.name).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase()}`;
      seenKeys.add(key);
      const signature = JSON.stringify([s.name, s.latitude, s.longitude, s.modes, s.platform_ids, s.platform_codes]);
      if (stopsCacheRef.current.get(key)?.signature !== signature) {
        buildPin(s, s.latitude, s.longitude, key);
        stopsCacheRef.current.get(key).signature = signature;
      }
      // Changing the camera heading only selects a 360-degree artwork frame,
      // never replaces the overlay or changes its geographic coordinate.
      const rec=stopsCacheRef.current.get(key);
      if(rec?.image)rec.image.src=resolveMapAssetUri(MOBILITY_VIEW_SOURCES.bus_stop[viewAngle]);
    });

    // Remove only records removed from the supplied catalogue, not offscreen pins.
    stopsCacheRef.current.forEach((rec, key) => {
      if (!seenKeys.has(key)) {
        try { rec.overlay.setMap(null); } catch (e) {}
        stopsCacheRef.current.delete(key);
      }
    });
    transitStopsRef.current = Array.from(stopsCacheRef.current.values()).map((r) => r.overlay);
  }, [transitStops, mapReady, mapHeading, transitLines, pinLocation, location, stopViewportRevision]);

  // Individual diorama buildings: viewport-bounded, progressively revealed,
  // never represented by numbered clusters or displaced coordinates.
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    const google = (window as any).google;
    const zoom = mapRef.current?.getZoom?.() || 14;
    const inView = (landmarks || []).filter((l) =>
      Number.isFinite(l.latitude) && Number.isFinite(l.longitude));
    const visible = clusterLandmarks(inView, zoom);
    const seen = new Set<string>();
    class LandmarkOverlay extends google.maps.OverlayView {
      div: HTMLDivElement;
      pos: { lat: number; lng: number };
      constructor(div: HTMLDivElement, pos: { lat: number; lng: number }) {
        super();
        this.div = div;
        this.pos = pos;
      }
      onAdd(this: any) {
        // Pane ordering beats child z-index: buildings stay below native
        // vehicle markers and all interactive pins, not just below each other.
        this.getPanes().overlayLayer.appendChild(this.div);
      }
      draw(this: any) {
        const p = this.getProjection?.()?.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
        if (p) {
          this.div.style.left = p.x + "px";
          this.div.style.top = p.y + "px";
        }
      }
      onRemove(this: any) {
        if (this.div.parentNode) this.div.parentNode.removeChild(this.div);
      }
    }
    const labelStops=groupTransitStopIcons(transitStopPins(transitStops || []));
    let sceneKey='',scene=new Map<string,import('../lib/city/landmarks').LandmarkDepth>();
    const depthScene=()=>{
      const map=mapRef.current,center=map?.getCenter?.();
      const viewer=pinLocation || location || {latitude:center?.lat() || 52.14,longitude:center?.lng() || 11.63};
      const z=map?.getZoom?.() || 14,heading=map?.getHeading?.() || 0;
      const key=JSON.stringify([z,heading,viewer.latitude,viewer.longitude]);
      if(key!==sceneKey){sceneKey=key;scene=landmarkDepthLayout(inView,labelStops,z,viewer,heading,landmarksMuted);}
      return scene;
    };
    visible.forEach((group) => {
      const key = `landmark:${group.id}`;
      seen.add(key);
      const recalculate = (container: HTMLDivElement, images: HTMLImageElement[]) => {
        const z = mapRef.current?.getZoom?.() || 14;
        const a = landmarkAppearance(z,group.id);
        const px=a.size,depth=depthScene().get(group.id);
        container.dataset.landmarkSize=String(px);
        container.dataset.latitude=String(group.latitude);container.dataset.longitude=String(group.longitude);
        container.style.width=px+'px';container.style.height=px*.78+'px';
        container.style.opacity = '1';
        container.style.display=depth?.showArtwork===false?'none':'block';
        container.dataset.landmarkOpacity=String(depth?.opacity ?? 1);
        container.style.zIndex = String(depth?.zIndex ?? 10);
        container.style.pointerEvents = landmarksMuted ? "none" : "auto";
        const label=container.querySelector('[data-landmark-name]') as HTMLElement|null;
        if(label)label.style.display=depth?.showLabel?'block':'none';
        images.forEach((img) => {
          img.style.opacity=String(depth?.opacity ?? 1);
          img.style.width = px + "px";
          img.style.height = px * 0.78 + "px";
          img.style.filter=`drop-shadow(0 2px 3px rgba(10,20,60,.3))${depth?.blur ? ` blur(${depth.blur}px)` : ''}`;
        });
      };
      let rec = landmarkCacheRef.current.get(key);
      if (rec) {
        recalculate(rec.container, rec.images);
        rec.overlay.pos = { lat: group.latitude, lng: group.longitude };
        try { rec.overlay.draw(); } catch (e) {}
        rec.resize = () => recalculate(rec.container, rec.images);
        return;
      }
      const container = document.createElement("div");
      container.dataset.landmarkId = group.items.map((item) => item.id).join(",");
      container.title = group.items.map((item) => item.name).join(" · ");
      container.style.position = "absolute";
      container.style.transform = "translate(-50%, -100%)";
      container.style.cursor = "pointer";
      container.style.userSelect = "none";
      const images: HTMLImageElement[] = [];
      {
        const item = group.items[0];
        const img = document.createElement("img");
        img.src = resolveMapAssetUri(landmarkImageSource(item.id));
        img.alt = item.name;
        img.draggable = false;
        img.loading = "lazy";
        img.decoding = "async";
        img.setAttribute("fetchpriority","low");
        img.style.display = "block";
        img.style.objectFit = "contain";
        images.push(img); container.appendChild(img);
      }
      const label=document.createElement('div');label.dataset.landmarkName=group.items[0].id;
      label.textContent=group.items[0].name;
      Object.assign(label.style,{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',
        font:'700 13px Arial,sans-serif',color:'#264348',background:'rgba(255,255,255,.94)',
        borderRadius:'6px',padding:'2px 5px',whiteSpace:'nowrap',maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',pointerEvents:'auto'});
      container.appendChild(label);
      recalculate(container, images);
      container.addEventListener("click", (e) => {
        e.stopPropagation();
        if(landmarksMutedRef.current)return;
        const ids = landmarkTapTargets(group.items[0],inView,mapRef.current?.getZoom?.() ?? 14).map(item=>item.id);
        onMarkerPressRef.current?.(ids.length > 1 ? `landmark-group:${ids.join("|")}` : `landmark:${ids[0]}`);
      });
      const overlay = new LandmarkOverlay(container, { lat: group.latitude, lng: group.longitude });
      overlay.setMap(mapRef.current);
      rec = { overlay, container, images, resize: () => recalculate(container, images) };
      landmarkCacheRef.current.set(key, rec);
    });
    landmarkCacheRef.current.forEach((rec, key) => {
      if (!seen.has(key)) {
        try { rec.overlay.setMap(null); } catch (e) {}
        landmarkCacheRef.current.delete(key);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [landmarks, landmarksMuted, mapReady, transitStops, pinLocation, location, mapHeading]);

  // Release directory fetching after the visible building batch paints, not
  // after every offscreen image in the 10km scope. A slow image cannot block
  // the directory forever. Camera/zoom is deliberately not a dependency.
  useEffect(()=>{
    if(!mapReady && !mapError)return;
    let active=true,completed=false,frame=0;
    const cleanup:(()=>void)[]=[];
    const done=()=>{if(!active || completed)return;completed=true;clearTimeout(timer);cleanup.forEach(fn=>fn());cleanup.length=0;landmarksReadyRef.current?.();};
    const timer=setTimeout(done,750);
    frame=requestAnimationFrame(()=>{
      if(mapError){done();return;}
      const mapRect=mapDivRef.current?.getBoundingClientRect();
      const images:HTMLImageElement[]=Array.from(landmarkCacheRef.current.values()).flatMap(rec=>{
        const r=rec.container.getBoundingClientRect();
        return mapRect && rec.container.style.display!=="none" && r.right>=mapRect.left && r.left<=mapRect.right
          && r.bottom>=mapRect.top && r.top<=mapRect.bottom ? rec.images : [];
      });
      Promise.all(images.map(image=>image.complete?Promise.resolve():new Promise<void>(resolve=>{
        const finish=()=>resolve();image.addEventListener("load",finish,{once:true});image.addEventListener("error",finish,{once:true});
        cleanup.push(()=>{image.removeEventListener("load",finish);image.removeEventListener("error",finish);});
      }))).then(done);
    });
    return()=>{active=false;clearTimeout(timer);cancelAnimationFrame(frame);cleanup.forEach(fn=>fn());};
  },[landmarks,mapReady,mapError]);

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
    const initial = profileInitial(userPinName);
    const imageKey = `${userPinImage || ""}|${initial}`;
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

    container.appendChild(createUserPinElement(document,userPinImage,userPinName));

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
        if (!overlayProjection) return;
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
  }, [location, showUserLocation, mapReady, userPinImage, userPinName, pinLocation]);

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
  const lastAppliedFocusToken = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current || !focusToken || !focusRegion) return;
    if(lastAppliedFocusToken.current===focusToken)return;
    lastAppliedFocusToken.current=focusToken;
    mapRef.current.panTo({ lat: focusRegion.latitude, lng: focusRegion.longitude });
    mapRef.current.setZoom(Number.isFinite(focusZoom) ? focusZoom : 14);
  }, [focusToken, focusZoom, mapReady]);

  // Run after explicit focus so it cannot immediately undo the first group fit.
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current || !autofit) return;
    const rect=mapDivRef.current?.getBoundingClientRect();
    const target=rect ? autoCameraTarget(autofit.points,rect.width,rect.height) : null;
    const next=advanceAutoCamera(autoCameraRef.current,autofit.token,target);
    autoCameraRef.current=next.state;
    if(!next.target)return;
    mapRef.current.panTo({lat:next.target.latitude,lng:next.target.longitude});
    mapRef.current.setZoom(next.target.zoom);
  }, [autofit?.token, autofit?.points, mapReady, height]);

  if (disabled) {
    return (
      <View style={[s.wrap, { height, marginHorizontal:horizontalInset }]}>
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
    <View style={[s.wrap, { height, marginHorizontal:horizontalInset }]}>
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
      {/* Film finish above the tiles, below UI: morning-sun grade, attribution strip kept clear. */}
      <div aria-hidden className="perix-cinema-light" />
      {mapZoomLevel >= 19 && !streetView && (
        <Pressable testID="street-view-toggle" accessibilityRole="button"
          accessibilityLabel={t("map.walkHere", "Walk here")}
          onPress={openStreetView} style={s.streetViewToggle}>
          <Ionicons name="walk-outline" size={18} color="#fff" />
          <Text style={s.streetViewToggleText}>{t("map.walkHere", "Walk here")}</Text>
        </Pressable>
      )}
      {!!streetViewNotice && !streetView && <Text style={s.streetViewNotice}>{streetViewNotice}</Text>}

      <Modal visible={!!streetView} transparent={false} animationType="slide" onRequestClose={() => setStreetView(null)}>
        <View style={s.streetViewWrap}>
          <View style={s.streetViewBar}>
            <Pressable testID="street-view-close" accessibilityRole="button"
              accessibilityLabel={t("ui.close", "Close")} onPress={() => setStreetView(null)} style={s.streetViewClose}>
              <Ionicons name="close" size={22} color="#fff" />
              <Text style={s.streetViewCloseText}>{t("map.backToAerial", "Back to aerial view")}</Text>
            </Pressable>
          </View>
          <View ref={streetViewDivRef as any} style={{ flex: 1 }} />
        </View>
      </Modal>

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
  wrap: { marginHorizontal: 16, borderRadius: 12, backgroundColor: "#ffffff", overflow: "hidden", position: "relative" },
  streetViewToggle: { position: "absolute", left: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 14, height: 40 },
  streetViewToggleText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  streetViewNotice: { position: "absolute", left: 12, bottom: 56, backgroundColor: "rgba(6,68,114,0.9)", color: "#fff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12 },
  streetViewWrap: { flex: 1, backgroundColor: "#000" },
  streetViewBar: { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: "#fff" },
  streetViewClose: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 14, height: 40 },
  streetViewCloseText: { color: "#fff", fontWeight: "700", fontSize: 14 },
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

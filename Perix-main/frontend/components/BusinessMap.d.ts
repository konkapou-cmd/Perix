import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental, Job, Service } from "../lib/api";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  isOpen?: boolean;
  pinColor?: string;
  pinInnerColor?: string;
  pinImage?: string | null;
  selectionCompass?: boolean;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product" | "bus" | "tram" | "taxi";
  heading?: number | null;
  estimated?: boolean;
  visualEstimate?: boolean;
  journeyId?: string | null;
  publicationStatus?: "READY" | "PENDING" | "HIDDEN" | null;
  positionState?: string | null;
  patternId?: string | null;
  planRevision?: string | null;
  estimateRevision?: string | null;
  geometryFingerprint?: string | null;
  progressM?: number | null;
  nextTimelineIndex?: number | null;
  distanceToNextStopM?: number | null;
  nextStopEtaSeconds?: number | null;
  motionPreview?: import("../lib/api/mobility").MotionPreview | null;
  label?: string | null;
  path?: { latitude: number; longitude: number }[];
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat?: number;
  centerLng?: number;
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
  /** Optional camera zoom for an explicitly focused region. */
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
  /** Apply backend samples directly and hold pending modeled transit. */
  authoritativeTransit?: boolean;
  transitLines?: {
    points: { latitude: number; longitude: number }[];
    color: string;
    opacity?: number;
    weight?: number;
    routeNumber?: string;
  }[];
  onTransitLineClick?: (routeNumber: string, patternId?: string) => void;
  transitStops?: {
    platform_id?: string;
    platform_code?: string | null;
    physical_stop_id?: string;
    stop_ids?: string[];
    stop_id: string;
    name: string;
    latitude: number;
    longitude: number;
    modes: ("bus" | "tram")[];
    routes: { route_number: string; mode: "bus" | "tram" }[];
    platforms?: {
      platform_id: string;
      platform_code?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      name?: string;
      directions?: string[];
      modes?: ('bus' | 'tram')[];
      routes?: string[];
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
    modes: ("bus" | "tram")[];
    routes: { route_number: string; mode: "bus" | "tram" }[];
    platforms?: {
      platform_id: string;
      platform_code?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      name?: string;
      directions?: string[];
      modes?: ("bus" | "tram")[];
      routes?: string[];
    }[];
  }) => void;
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

declare const BusinessMap: React.FC<Props>;
export default BusinessMap;

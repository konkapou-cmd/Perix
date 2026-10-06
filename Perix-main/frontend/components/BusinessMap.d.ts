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
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product" | "bus" | "tram" | "taxi";
  heading?: number | null;
  estimated?: boolean;
  label?: string | null;
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
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  jobs?: Job[];
  services?: Service[];
  markers?: MapMarker[];
  extraMarkers?: MapMarker[];
  transitLines?: {
    points: { latitude: number; longitude: number }[];
    color: string;
    opacity?: number;
    weight?: number;
    routeNumber?: string;
  }[];
  onTransitLineClick?: (routeNumber: string, patternId?: string) => void;
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

declare const BusinessMap: React.FC<Props>;
export default BusinessMap;

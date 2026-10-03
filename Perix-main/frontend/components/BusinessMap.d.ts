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

declare const BusinessMap: React.FC<Props>;
export default BusinessMap;

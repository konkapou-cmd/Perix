import { EventItem } from "../lib/api";

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  location: { latitude: number; longitude: number };
  events?: EventItem[];
  showUserLocation?: boolean;
  onRegionChange?: (bounds: MapBounds) => void;
  onMarkerPress?: (eventId: string) => void;
  height?: number;
};

declare const EventsMap: React.FC<Props>;
export default EventsMap;

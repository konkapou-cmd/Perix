type Props = {
  location: { latitude: number; longitude: number; address?: string } | null;
  onLocationSelect?: (location: { latitude: number; longitude: number }) => void;
  onLocationChange?: (location: { latitude: number; longitude: number; address?: string }) => void;
};

declare const LocationPickerMap: React.FC<Props>;
export default LocationPickerMap;

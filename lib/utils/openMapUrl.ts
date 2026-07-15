import { Linking, Platform } from "react-native";

type OpenMapParams = {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  label?: string | null;
};

export function openInMaps({ latitude, longitude, address, label }: OpenMapParams): boolean {
  const query = label || address || "";

  if (latitude != null && longitude != null) {
    const url = Platform.OS === "ios"
      ? `https://maps.apple.com/?q=${encodeURIComponent(query)}&ll=${latitude},${longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || `${latitude},${longitude}`)}`;
    Linking.openURL(url);
    return true;
  }

  if (address) {
    const url = Platform.OS === "ios"
      ? `https://maps.apple.com/?q=${encodeURIComponent(address)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    Linking.openURL(url);
    return true;
  }

  return false;
}

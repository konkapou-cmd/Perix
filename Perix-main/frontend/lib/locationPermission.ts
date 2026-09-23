import { Alert, Linking, Platform } from "react-native";
import * as Location from "expo-location";

/**
 * Request foreground location permission. When denied, explain what happened
 * and offer a direct link to the device settings so the button never looks
 * "dead".
 *
 * Returns true when the permission is granted (now or after the user fixes
 * it in settings and comes back).
 */
export async function ensureLocationPermission(): Promise<boolean> {
  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status === "granted") return true;

  const title = "Location permission needed";
  const message = canAskAgain
    ? "Perix uses your location to show nearby businesses, events and rentals. Please allow location access."
    : "Location access is turned off for Perix. Enable it in your device settings to find things nearby.";

  const openSettings = () => {
    try {
      Linking.openSettings();
    } catch {}
  };

  if (Platform.OS === "web" && typeof window !== "undefined") {
    const ok = window.confirm(`${title}\n\n${message}\n\nOpen settings?`);
    if (ok) openSettings();
    return false;
  }

  await new Promise<void>((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve() },
        {
          text: "Open Settings",
          onPress: () => {
            openSettings();
            resolve();
          },
        },
      ],
      { cancelable: true }
    );
  });
  return false;
}

/**
 * Get the current position after ensuring permission.
 */
export async function getCurrentPositionWithPermission(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  const granted = await ensureLocationPermission();
  if (!granted) return null;
  try {
    const loc = await Location.getCurrentPositionAsync({});
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch (e) {
    console.warn("getCurrentPosition failed:", e);
    return null;
  }
}

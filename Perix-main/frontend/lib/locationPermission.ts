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

export interface FreshPosition {
  latitude: number;
  longitude: number;
  /** Reported accuracy radius in meters. */
  accuracy: number;
}

/**
 * Fixes with a larger accuracy radius than this are treated as
 * unreliable: they usually come from a stale WiFi/IP database (the
 * router's old address) and would pin the user in a wrong place.
 * The continuous watch delivers the precise GPS fix afterwards.
 */
export const LIVE_MIN_ACCURACY_METERS = 800;

export function isReliablePosition(accuracy: number | undefined | null): boolean {
  return typeof accuracy === "number" && accuracy <= LIVE_MIN_ACCURACY_METERS;
}

/**
 * Continuously watch the device position and invoke the callback with
 * every fix, like Google Maps' live blue dot. Returns a stop function.
 */
export function watchPrecisePosition(
  onPosition: (pos: FreshPosition) => void
): () => void {
  if (
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    navigator.geolocation
  ) {
    let watchId: number;
    try {
      watchId = navigator.geolocation.watchPosition(
        (p) =>
          onPosition({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy ?? 99999,
          }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 }
      );
    } catch {
      return () => {};
    }
    return () => {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {}
    };
  }
  let cancelled = false;
  let subscription: { remove: () => void } | null = null;
  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 5 } as any,
    (loc) => {
      if (cancelled) return;
      onPosition({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: (loc.coords as any).accuracy ?? 30,
      });
    }
  ).then((sub) => {
    if (cancelled) {
      try {
        sub.remove();
      } catch {}
    } else {
      subscription = sub;
    }
  });
  return () => {
    cancelled = true;
    if (subscription) {
      try {
        subscription.remove();
      } catch {}
    }
  };
}

/**
 * Get the current position after ensuring permission.
 *
 * Fresh fix only (maximumAge: 0, high accuracy, long timeout) so a
 * stale/cached position is never returned. One retry on failure, since
 * GPS on phones can take a while (e.g. indoors).
 */
export async function getCurrentPositionWithPermission(
  options?: { timeoutMs?: number; highAccuracy?: boolean }
): Promise<FreshPosition | null> {
  const granted = await ensureLocationPermission();
  if (!granted) return null;

  const timeout = options?.timeoutMs ?? 12000;
  const highAccuracy = options?.highAccuracy !== false;

  const oneShot = (useHighAccuracy: boolean) =>
    new Promise<FreshPosition>((resolve, reject) => {
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.geolocation
      ) {
        navigator.geolocation.getCurrentPosition(
          (p) =>
            resolve({
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy ?? 99999,
            }),
          (e) => reject(e),
          { enableHighAccuracy: useHighAccuracy, maximumAge: 0, timeout }
        );
      } else {
        Location.getCurrentPositionAsync({
          accuracy: useHighAccuracy ? Location.Accuracy.High : Location.Accuracy.Balanced,
          maximumAge: 0 as any,
          timeout,
        } as any)
          .then((loc) =>
            resolve({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              accuracy: (loc.coords as any).accuracy ?? 30,
            })
          )
          .catch(reject);
      }
    });

  // High accuracy first. If the GPS cannot deliver quickly, try a fast
  // network-based fix - but ONLY accept it when it is reasonably accurate.
  // Network fixes can come from a stale WiFi database (e.g. the router's
  // old address) and would otherwise pin the user in a wrong place; the
  // continuous watch improves the position afterwards.
  try {
    const precise = await oneShot(highAccuracy);
    return precise;
  } catch (e) {
    console.warn("getCurrentPosition failed (high accuracy):", e);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      const coarse = await oneShot(false);
      if (coarse.accuracy > LIVE_MIN_ACCURACY_METERS) return null;
      return coarse;
    } catch (e2) {
      console.warn("getCurrentPosition failed (fallback):", e2);
      return null;
    }
  }
}

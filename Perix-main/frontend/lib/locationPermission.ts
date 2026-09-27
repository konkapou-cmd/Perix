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
  /** Reported accuracy radius in meters. Coarse (>~500m) fixes are
   *  network-based or come from an "approximate location" permission and
   *  are often visibly wrong (another street/city). */
  accuracy: number;
}

/** Fixes with a larger accuracy radius are treated as unreliable. */
export const TRUSTED_ACCURACY_METERS = 500;

export function isCoarsePosition(accuracy: number | undefined | null): boolean {
  return typeof accuracy !== "number" || accuracy > TRUSTED_ACCURACY_METERS;
}

/**
 * Show a short notice when the browser only provides an approximate
 * location (e.g. Android/iOS "approximate location" permission). Kept
 * trilingual so it works without the i18n context.
 */
export function showCoarseLocationNotice() {
  const text =
    "Your browser reports only an approximate location.\n" +
    "Enable precise location (high accuracy) for the Perix site to show your exact position.\n\n" +
    "Ο browser σου δίνει μόνο κατά προσέγγιση τοποθεσία.\n" +
    "Ενεργοποίησε την ακριβή τοποθεσία (υψηλή ακρίβεια) για να δείχνει το Perix την ακριβή θέση σου.\n\n" +
    "Dein Browser meldet nur einen ungefähren Standort.\n" +
    "Aktiviere die genaue Standortbestimmung (hohe Genauigkeit), damit Perix deine exakte Position anzeigt.";
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(text);
  } else {
    Alert.alert("Location", text);
  }
}

/**
 * Continuously watch the device position and invoke the callback with
 * every fix (callers filter by accuracy). Browsers deliver progressively
 * better fixes this way (especially after user interaction, when
 * high-accuracy requests are honored), so the pin appears as soon as a
 * precise fix is available. Returns a stop function.
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
 * Uses a fresh fix only (maximumAge: 0, high accuracy, long timeout) and
 * never returns a cached/stale position. When the first fix is coarse
 * (network-based or "approximate" permission), it keeps watching for a few
 * seconds in case the GPS delivers a precise fix, and returns the most
 * accurate position seen.
 */
export async function getCurrentPositionWithPermission(): Promise<FreshPosition | null> {
  const granted = await ensureLocationPermission();
  if (!granted) return null;

  const oneShot = () =>
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
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
        );
      } else {
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          maximumAge: 0 as any,
          timeout: 30000,
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

  try {
    const first = await oneShot();
    if (!isCoarsePosition(first.accuracy)) return first;

    // Coarse first fix - watch briefly in case GPS warms up and gives a
    // precise fix.
    return await new Promise<FreshPosition | null>((resolve) => {
      if (
        Platform.OS !== "web" ||
        typeof navigator === "undefined" ||
        !navigator.geolocation
      ) {
        resolve(first);
        return;
      }
      let best: FreshPosition = first;
      let settled = false;
      let watchId: number | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (watchId !== null) {
          try {
            navigator.geolocation.clearWatch(watchId);
          } catch {}
        }
        resolve(best);
      };
      try {
        watchId = navigator.geolocation.watchPosition(
          (p) => {
            const cand: FreshPosition = {
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracy: p.coords.accuracy ?? 99999,
            };
            if (cand.accuracy < best.accuracy) best = cand;
            if (!isCoarsePosition(cand.accuracy)) finish();
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 0, timeout: 25000 }
        );
      } catch {
        finish();
      }
      setTimeout(finish, 20000);
    });
  } catch (e) {
    console.warn("getCurrentPosition failed (first attempt):", e);
    // GPS on phones can take a while (e.g. indoors). Give it one more
    // chance before falling back, so we never show an old position.
    try {
      await new Promise((r) => setTimeout(r, 2500));
      return await oneShot();
    } catch (e2) {
      console.warn("getCurrentPosition failed (retry):", e2);
      return null;
    }
  }
}

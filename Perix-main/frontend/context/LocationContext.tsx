import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentPositionWithPermission, watchPrecisePosition, FreshPosition, isReliablePosition, isGeolocationGranted } from "../lib/locationPermission";
import { useAuth } from "./AuthContext";

interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  isLiveLocation: boolean;
}

interface LocationContextType {
  /** The map area: the live device position, or a manually picked explore
   *  point. NEVER restored from storage - always fresh for this session. */
  location: LocationData | null;
  /** Latest GPS fix for the "you are here" pin (independent of the area). */
  livePosition: FreshPosition | null;
  loading: boolean;
  error: string | null;
  setManualLocation: (lat: number, lng: number, name?: string) => void;
  useLiveLocation: (timeoutMs?: number) => Promise<FreshPosition | null>;
  radiusKm: number;
  setRadiusKm: (km: number) => void;
  refreshLocation: () => void;
}

const LocationContext = createContext<LocationContextType | null>(null);

const RADIUS_STORAGE_KEY = "@perix_radius";
const LAST_LOCATION_KEY = "@perix_last_location";
const DEFAULT_RADIUS = 10; // 10km default

// Last-known area: saved so a page refresh opens the map where the user
// was (never Berlin). Only the AREA is restored - the live pin always
// comes from a fresh GPS fix.
async function loadSavedLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      raw = window.localStorage.getItem(LAST_LOCATION_KEY);
    } else {
      raw = await AsyncStorage.getItem(LAST_LOCATION_KEY);
    }
    if (!raw) return null;
    const data = JSON.parse(raw);
    const lat = parseFloat(data?.lat);
    const lng = parseFloat(data?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // Stale (older than 7 days) is not useful as a starting area
    if (data?.ts && Date.now() - data.ts > 7 * 24 * 3600 * 1000) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function saveLastLocation(lat: number, lng: number) {
  try {
    const payload = JSON.stringify({ lat, lng, ts: Date.now() });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.setItem(LAST_LOCATION_KEY, payload);
    } else {
      AsyncStorage.setItem(LAST_LOCATION_KEY, payload).catch(() => {});
    }
  } catch {}
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LocationData | null>(null);
  // Live "you are here" position: the single source of truth for the pin.
  // Updated by the continuous watch and by re-fixes on focus. Only live
  // positions are ever shown - nothing stored or remembered from before.
  const [livePosition, setLivePosition] = useState<FreshPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKmState] = useState(DEFAULT_RADIUS);
  const [refreshKey, setRefreshKey] = useState(0);
  // True once the browser/device has granted geolocation. Only then may we
  // fetch positions silently - never prompt the browser without a user
  // gesture (that's what makes the permission prompt pop up on every
  // refresh and the locate button spin forever).
  const [geoGranted, setGeoGranted] = useState<boolean | null>(null);
  const locationRef = useRef(location);
  locationRef.current = location;
  const liveRef = useRef<FreshPosition | null>(null);
  liveRef.current = livePosition;

  // Location is only requested for signed-in users - the login screen must
  // never trigger a browser location prompt.
  const { sessionToken } = useAuth();

  // On startup: restore the last-known AREA immediately (so a refresh
  // never resets the map to Berlin). A fresh fix is fetched ONLY when the
  // permission is already granted - otherwise we wait for the user to tap
  // a locate button (user gesture) before asking the browser.
  // Runs in the background: the UI never waits for the GPS.
  useEffect(() => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    const load = async () => {
      try {
        const savedRadius = await AsyncStorage.getItem(RADIUS_STORAGE_KEY);
        if (savedRadius) {
          setRadiusKmState(parseInt(savedRadius, 10));
        }
      } catch {}
      const saved = await loadSavedLocation();
      if (saved) {
        setLocation({
          latitude: saved.lat,
          longitude: saved.lng,
          isLiveLocation: false,
        });
      }
      const granted = await isGeolocationGranted();
      setGeoGranted(granted);
      if (granted) {
        const fresh = await getCurrentPositionWithPermission({ timeoutMs: 12000 });
        if (fresh && isReliablePosition(fresh.accuracy)) {
          setLocation({
            latitude: fresh.latitude,
            longitude: fresh.longitude,
            isLiveLocation: true,
          });
          liveRef.current = { latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy };
          setLivePosition({ latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy });
          saveLastLocation(fresh.latitude, fresh.longitude);
        }
      } else if (!saved) {
        // No saved area and no permission: leave the area empty; the map
        // shows its default and the locate buttons request permission.
        setError("Could not get location");
      }
      setLoading(false);
    };
    setLoading(true);
    load();
  }, [sessionToken]);

  const requestLiveLocation = async (timeoutMs?: number): Promise<FreshPosition | null> => {
    try {
      setLoading(true);
      setError(null);
      const current = await getCurrentPositionWithPermission(timeoutMs ? { timeoutMs } : undefined);
      if (current && isReliablePosition(current.accuracy)) {
        setGeoGranted(true);
        liveRef.current = { latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy };
        setLocation({
          latitude: current.latitude,
          longitude: current.longitude,
          name: undefined,
          isLiveLocation: true,
        });
        setLivePosition({ latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy });
        saveLastLocation(current.latitude, current.longitude);
        return { latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy };
      }
      // No precise fix: stay honest - the UI asks for the location /
      // shows the failure message. Never open the map at an unrelated
      // network/IP estimate.
      setError("Could not get location");
      return null;
    } catch (e) {
      console.error("Error getting live location:", e);
      setError("Could not get location");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const setManualLocation = useCallback((lat: number, lng: number, name?: string) => {
    // In-memory explore point, but remembered as the starting AREA for the
    // next session - never treated as live.
    setLocation({
      latitude: lat,
      longitude: lng,
      name: name,
      isLiveLocation: false,
    });
    saveLastLocation(lat, lng);
    setRefreshKey((prev) => prev + 1);
  }, []);

  const useLiveLocation = useCallback(async (timeoutMs?: number): Promise<FreshPosition | null> => {
    const pos = await requestLiveLocation(timeoutMs);
    setRefreshKey((prev) => prev + 1);
    return pos;
  }, []);

  const setRadiusKm = useCallback(async (km: number) => {
    setRadiusKmState(km);
    try {
      await AsyncStorage.setItem(RADIUS_STORAGE_KEY, km.toString());
    } catch {}
    setRefreshKey((prev) => prev + 1);
  }, []);

  const refreshLocation = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Debounced live updates: only move the pin/area when the position
  // actually changed (~30m) or the accuracy improved a lot. GPS noise
  // otherwise makes the pin flicker back and forth. Unreliable fixes
  // (stale WiFi/IP database, city-level accuracy) are ignored entirely -
  // a wrong position must never be shown as live.
  const applyFix = useCallback((pos: FreshPosition) => {
    if (!isReliablePosition(pos.accuracy)) return;
    const cur = liveRef.current;
    if (cur) {
      const moved = Math.hypot(pos.latitude - cur.latitude, pos.longitude - cur.longitude);
      const accuracyImproved = pos.accuracy < cur.accuracy * 0.6;
      if (moved < 0.0003 && !accuracyImproved) return;
    }
    liveRef.current = { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy };
    setLivePosition({ latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy });
    saveLastLocation(pos.latitude, pos.longitude);
    if (locationRef.current && !locationRef.current.isLiveLocation) return;
    // When the area is live, it follows the user.
    setLocation({
      latitude: pos.latitude,
      longitude: pos.longitude,
      name: undefined,
      isLiveLocation: true,
    });
  }, []);

  // Keep the pin accurate: re-fix on foreground/focus, and watch
  // continuously so the pin follows the user live (Google Maps style).
  // Only runs once the permission is granted - never prompts on its own.
  useEffect(() => {
    if (!sessionToken || geoGranted !== true) return;
    let stopWatch: (() => void) | null = null;
    const oneShot = () => {
      getCurrentPositionWithPermission({ timeoutMs: 15000 })
        .then((loc) => {
          if (loc) applyFix(loc);
        })
        .catch(() => {});
    };
    // The watch needs the permission granted first (the one-shot does it).
    oneShot();
    stopWatch = watchPrecisePosition((pos) => {
      applyFix(pos);
    });
    const interval = setInterval(oneShot, 3 * 60 * 1000);
    const onResume = () => oneShot();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible") onResume();
      };
      window.addEventListener("focus", onResume);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        clearInterval(interval);
        if (stopWatch) stopWatch();
        window.removeEventListener("focus", onResume);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") onResume();
    });
    return () => {
      clearInterval(interval);
      if (stopWatch) stopWatch();
      sub.remove();
    };
  }, [applyFix, sessionToken, geoGranted]);

  return (
    <LocationContext.Provider
      value={{
        location,
        livePosition,
        loading,
        error,
        setManualLocation,
        useLiveLocation,
        radiusKm,
        setRadiusKm,
        refreshLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocation must be used within a LocationProvider");
  }
  return context;
}

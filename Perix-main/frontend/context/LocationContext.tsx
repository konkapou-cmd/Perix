import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentPositionWithPermission, watchPrecisePosition, FreshPosition, isReliablePosition } from "../lib/locationPermission";
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
const DEFAULT_RADIUS = 10; // 10km default

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
  const locationRef = useRef(location);
  locationRef.current = location;
  const liveRef = useRef<FreshPosition | null>(null);
  liveRef.current = livePosition;

  // Location is only requested for signed-in users - the login screen must
  // never trigger a browser location prompt.
  const { sessionToken } = useAuth();

  // On startup: only a FRESH live fix. Never restore a saved location -
  // a previous session's coordinates must never be shown as live.
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
      const fresh = await getCurrentPositionWithPermission({ timeoutMs: 12000 });
      if (fresh && isReliablePosition(fresh.accuracy)) {
        setLocation({
          latitude: fresh.latitude,
          longitude: fresh.longitude,
          isLiveLocation: true,
        });
        liveRef.current = { latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy };
        setLivePosition({ latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy });
      } else {
        // No precise fix on a fresh session. Never auto-open the map at a
        // network/IP estimate (that lands on an unrelated city) - keep the
        // area empty so the app ASKS for the location via the prompt card.
        // The watch keeps trying and the locate button triggers a fresh
        // permission request with high accuracy.
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
        liveRef.current = { latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy };
        setLocation({
          latitude: current.latitude,
          longitude: current.longitude,
          name: undefined,
          isLiveLocation: true,
        });
        setLivePosition({ latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy });
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
    // In-memory explore point only - never persisted, never treated as live.
    setLocation({
      latitude: lat,
      longitude: lng,
      name: name,
      isLiveLocation: false,
    });
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
  useEffect(() => {
    if (!sessionToken) return;
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
  }, [applyFix, sessionToken]);

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

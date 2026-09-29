import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentPositionWithPermission, watchPrecisePosition, FreshPosition } from "../lib/locationPermission";

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
  useLiveLocation: () => Promise<void>;
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

  // On startup: only a FRESH live fix. Never restore a saved location -
  // a previous session's coordinates must never be shown as live.
  useEffect(() => {
    const load = async () => {
      try {
        const savedRadius = await AsyncStorage.getItem(RADIUS_STORAGE_KEY);
        if (savedRadius) {
          setRadiusKmState(parseInt(savedRadius, 10));
        }
      } catch {}
      const fresh = await getCurrentPositionWithPermission();
      if (fresh) {
        setLocation({
          latitude: fresh.latitude,
          longitude: fresh.longitude,
          isLiveLocation: true,
        });
        setLivePosition({ latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy });
      } else {
        setError("Could not get location");
      }
      setLoading(false);
    };
    load();
  }, []);

  const requestLiveLocation = async () => {
    try {
      setLoading(true);
      setError(null);
      const current = await getCurrentPositionWithPermission();
      if (!current) {
        setError("Could not get location");
        setLoading(false);
        return;
      }
      setLocation({
        latitude: current.latitude,
        longitude: current.longitude,
        name: undefined,
        isLiveLocation: true,
      });
      setLivePosition({ latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy });
    } catch (e) {
      console.error("Error getting live location:", e);
      setError("Could not get location");
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

  const useLiveLocation = useCallback(async () => {
    await requestLiveLocation();
    setRefreshKey((prev) => prev + 1);
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

  const locationRef = useRef(location);
  locationRef.current = location;

  const applyFix = useCallback((pos: FreshPosition) => {
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
    let stopWatch: (() => void) | null = null;
    const oneShot = () => {
      getCurrentPositionWithPermission()
        .then((loc) => {
          if (loc) applyFix(loc);
        })
        .catch(() => {});
    };
    // The watch needs the permission granted first (the one-shot does it).
    oneShot();
    setTimeout(() => {
      stopWatch = watchPrecisePosition((pos) => {
        applyFix(pos);
      });
    }, 400);
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
  }, [applyFix]);

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

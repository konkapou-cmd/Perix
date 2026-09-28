import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentPositionWithPermission, isCoarsePosition, watchPrecisePosition, FreshPosition } from "../lib/locationPermission";

interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  isLiveLocation: boolean;
}

interface LocationContextType {
  location: LocationData | null;
  /** Latest GPS fix for the "you are here" pin (independent of the searched area). */
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

const LOCATION_STORAGE_KEY = "@perix_location";
const RADIUS_STORAGE_KEY = "@perix_radius";
const DEFAULT_RADIUS = 10; // 10km default

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<LocationData | null>(null);
  // Live "you are here" position: the single source of truth for the pin.
  // Updated by the continuous watch and by re-fixes on focus. Junk fixes
  // with city-level accuracy are ignored so the pin never jumps away.
  const [livePosition, setLivePosition] = useState<FreshPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKmState] = useState(DEFAULT_RADIUS);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load saved location on mount
  useEffect(() => {
    const loadSavedLocation = async () => {
      try {
        const savedRadius = await AsyncStorage.getItem(RADIUS_STORAGE_KEY);
        
        if (savedRadius) {
          setRadiusKmState(parseInt(savedRadius, 10));
        }

        // Always try to get a FRESH current position on startup. Never
        // restore saved coordinates from a previous session - they point at
        // places the user visited Perix from in the past, which is wrong.
        const fresh = await getCurrentPositionWithPermission();
        if (fresh && !isCoarsePosition(fresh.accuracy)) {
          const newLocation: LocationData = {
            latitude: fresh.latitude,
            longitude: fresh.longitude,
            isLiveLocation: true,
          };
          setLocation(newLocation);
          setLivePosition({ latitude: fresh.latitude, longitude: fresh.longitude, accuracy: fresh.accuracy });
          await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation));
        } else {
          // Fresh fix failed (e.g. permission denied or GPS timeout).
          // Do NOT show an old location - stay empty and let the UI ask
          // the user to set the area / retry.
          setError("Could not get location");
          await AsyncStorage.removeItem(LOCATION_STORAGE_KEY);
        }
      } catch (e) {
        console.error("Error loading saved location:", e);
        setError("Could not get location");
      } finally {
        setLoading(false);
      }
    };
    
    loadSavedLocation();
  }, []);

  const requestLiveLocation = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fresh fix only (maximumAge: 0) - never reuse a stale/cached position.
      const current = await getCurrentPositionWithPermission();
      if (!current || isCoarsePosition(current.accuracy)) {
        setError("Could not get location");
        setLoading(false);
        return;
      }
      
      const newLocation: LocationData = {
        latitude: current.latitude,
        longitude: current.longitude,
        name: undefined,
        isLiveLocation: true,
      };
      
      setLocation(newLocation);
      setLivePosition({ latitude: current.latitude, longitude: current.longitude, accuracy: current.accuracy });
      await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation));
    } catch (e) {
      console.error("Error getting live location:", e);
      setError("Could not get location");
    } finally {
      setLoading(false);
    }
  };

  const setManualLocation = useCallback(async (lat: number, lng: number, name?: string) => {
    const newLocation: LocationData = {
      latitude: lat,
      longitude: lng,
      name: name,
      isLiveLocation: false,
    };
    
    setLocation(newLocation);
    await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation));
    // Trigger refresh for all listeners
    setRefreshKey(prev => prev + 1);
  }, []);

  const useLiveLocation = useCallback(async () => {
    await requestLiveLocation();
    // Trigger refresh for all listeners
    setRefreshKey(prev => prev + 1);
  }, []);

  const setRadiusKm = useCallback(async (km: number) => {
    setRadiusKmState(km);
    await AsyncStorage.setItem(RADIUS_STORAGE_KEY, km.toString());
    // Trigger refresh for all listeners
    setRefreshKey(prev => prev + 1);
  }, []);

  const refreshLocation = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const locationRef = useRef(location);
  locationRef.current = location;
  const liveRef = useRef(livePosition);
  liveRef.current = livePosition;

  const applyFix = useCallback((pos: FreshPosition) => {
    if (isCoarsePosition(pos.accuracy)) return;
    setLivePosition({ latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy });
    if (locationRef.current && !locationRef.current.isLiveLocation) return;
    // When the area is live, it follows the user.
    setLocation({
      latitude: pos.latitude,
      longitude: pos.longitude,
      name: undefined,
      isLiveLocation: true,
    });
    void AsyncStorage.setItem(
      LOCATION_STORAGE_KEY,
      JSON.stringify({ latitude: pos.latitude, longitude: pos.longitude, isLiveLocation: true })
    );
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

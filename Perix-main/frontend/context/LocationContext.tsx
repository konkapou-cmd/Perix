import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentPositionWithPermission } from "../lib/locationPermission";

interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  isLiveLocation: boolean;
}

interface LocationContextType {
  location: LocationData | null;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [radiusKm, setRadiusKmState] = useState(DEFAULT_RADIUS);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load saved location on mount
  useEffect(() => {
    const loadSavedLocation = async () => {
      try {
        const savedLocation = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
        const savedRadius = await AsyncStorage.getItem(RADIUS_STORAGE_KEY);
        
        if (savedRadius) {
          setRadiusKmState(parseInt(savedRadius, 10));
        }

        // Always try to get a FRESH current position on startup. A manual
        // city search persisted from a previous session must not stick -
        // otherwise the map keeps opening on an old city instead of where
        // the user actually is right now.
        const fresh = await getCurrentPositionWithPermission();
        if (fresh) {
          const newLocation: LocationData = {
            latitude: fresh.latitude,
            longitude: fresh.longitude,
            isLiveLocation: true,
          };
          setLocation(newLocation);
          await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(newLocation));
        } else if (savedLocation) {
          // Fresh fix failed (e.g. permission denied) - fall back to the
          // saved location (live or manual).
          const parsed = JSON.parse(savedLocation);
          setLocation(parsed);
        }
      } catch (e) {
        console.error("Error loading saved location:", e);
        const saved = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
        if (saved) {
          try {
            setLocation(JSON.parse(saved));
          } catch {}
        }
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
      if (!current) {
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

  // Keep the "you are here" pin accurate: re-fix the live location every few
  // minutes and whenever the app/tab returns to the foreground. Stale fixes
  // (e.g. a coarse first browser fix) otherwise stay on the map forever.
  const refreshingLiveRef = useRef(false);
  const locationRef = useRef(location);
  locationRef.current = location;

  const silentLiveRefresh = useCallback(async () => {
    if (refreshingLiveRef.current) return;
    if (locationRef.current && !locationRef.current.isLiveLocation) return;
    refreshingLiveRef.current = true;
    try {
      await requestLiveLocation();
    } finally {
      refreshingLiveRef.current = false;
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void silentLiveRefresh();
    }, 3 * 60 * 1000);
    const onResume = () => void silentLiveRefresh();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible") onResume();
      };
      window.addEventListener("focus", onResume);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        clearInterval(interval);
        window.removeEventListener("focus", onResume);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") onResume();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [silentLiveRefresh]);

  return (
    <LocationContext.Provider
      value={{
        location,
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

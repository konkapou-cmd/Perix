import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

interface MapBoundsContextType {
  mapBounds: MapBounds | null;
  isMapInitialized: boolean;
  isMapBoundsHydrated: boolean;
  setMapBounds: (bounds: MapBounds) => void;
  clearMapBounds: () => void;
  refreshKey: number;
}

const MapBoundsContext = createContext<MapBoundsContextType | null>(null);

const MAP_BOUNDS_KEY = "@perix_map_bounds";

function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      return Promise.resolve(window.localStorage.getItem(key));
    } catch {
      return Promise.resolve(null);
    }
  }
  return AsyncStorage.getItem(key);
}

function storageSet(key: string, value: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  } else {
    AsyncStorage.setItem(key, value).catch(() => {});
  }
}

export function MapBoundsProvider({ children }: { children: React.ReactNode }) {
  // One shared map area for every screen (home, locator, jobs, services,
  // rentals...). Persisted so a page refresh opens exactly where the user
  // was - Perix is location-first and must never reset to a default city.
  const [mapBounds, setMapBoundsState] = useState<MapBounds | null>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [isMapBoundsHydrated, setIsMapBoundsHydrated] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevBoundsRef = useRef<MapBounds | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await storageGet(MAP_BOUNDS_KEY);
        if (raw) {
          const b = JSON.parse(raw);
          if (
            b &&
            Number.isFinite(b.centerLat) &&
            Number.isFinite(b.centerLng) &&
            Number.isFinite(b.minLat) &&
            Number.isFinite(b.maxLat) &&
            Number.isFinite(b.minLng) &&
            Number.isFinite(b.maxLng)
          ) {
            setMapBoundsState(b);
          }
        }
      } catch {}
      setIsMapBoundsHydrated(true);
    })();
  }, []);

  const setMapBounds = useCallback((bounds: MapBounds) => {
    setMapBoundsState(bounds);
    setIsMapInitialized(true);

    const prev = prevBoundsRef.current;
    const changed = !prev
      || prev.centerLat !== bounds.centerLat
      || prev.centerLng !== bounds.centerLng
      || prev.minLat !== bounds.minLat
      || prev.maxLat !== bounds.maxLat
      || prev.minLng !== bounds.minLng
      || prev.maxLng !== bounds.maxLng;

    prevBoundsRef.current = bounds;

    if (changed) {
      setRefreshKey((prev) => prev + 1);
    }

    try {
      storageSet(MAP_BOUNDS_KEY, JSON.stringify(bounds));
    } catch {}
  }, []);

  const clearMapBounds = useCallback(() => {
    setMapBoundsState(null);
    setIsMapInitialized(false);
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <MapBoundsContext.Provider
      value={{
        mapBounds,
        isMapInitialized,
        isMapBoundsHydrated,
        setMapBounds,
        clearMapBounds,
        refreshKey,
      }}
    >
      {children}
    </MapBoundsContext.Provider>
  );
}

export function useMapBounds() {
  const context = useContext(MapBoundsContext);
  if (!context) {
    throw new Error("useMapBounds must be used within a MapBoundsProvider");
  }
  return context;
}

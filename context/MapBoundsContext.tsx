import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  setMapBounds: (bounds: MapBounds) => void;
  clearMapBounds: () => void;
  refreshKey: number;
}

const MapBoundsContext = createContext<MapBoundsContextType | null>(null);

const MAP_BOUNDS_STORAGE_KEY = "@perix_map_bounds";

export function MapBoundsProvider({ children }: { children: React.ReactNode }) {
  const [mapBounds, setMapBoundsState] = useState<MapBounds | null>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevBoundsRef = useRef<MapBounds | null>(null);

  // Load saved map bounds on mount
  useEffect(() => {
    const loadSavedBounds = async () => {
      try {
        const saved = await AsyncStorage.getItem(MAP_BOUNDS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          setMapBoundsState(parsed);
          setIsMapInitialized(true);
        }
      } catch (e) {
        console.error("Error loading saved map bounds:", e);
      }
    };
    loadSavedBounds();
  }, []);

  const setMapBounds = useCallback(async (bounds: MapBounds) => {
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
      await AsyncStorage.setItem(MAP_BOUNDS_STORAGE_KEY, JSON.stringify(bounds));
    } catch (e) {
      console.error("Error saving map bounds:", e);
    }
  }, []);

  const clearMapBounds = useCallback(async () => {
    setMapBoundsState(null);
    setIsMapInitialized(false);
    setRefreshKey((prev) => prev + 1);
    try {
      await AsyncStorage.removeItem(MAP_BOUNDS_STORAGE_KEY);
    } catch (e) {
      console.error("Error clearing map bounds:", e);
    }
  }, []);

  return (
    <MapBoundsContext.Provider
      value={{
        mapBounds,
        isMapInitialized,
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

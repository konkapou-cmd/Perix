import React, { createContext, useContext, useState, useCallback, useRef } from "react";

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

export function MapBoundsProvider({ children }: { children: React.ReactNode }) {
  // One shared, in-memory map area for every screen (home, locator, jobs,
  // services, rentals...). Never persisted: the app always starts fresh
  // from the live location - a previous session's area is never restored.
  const [mapBounds, setMapBoundsState] = useState<MapBounds | null>(null);
  const [isMapInitialized, setIsMapInitialized] = useState(false);
  const [isMapBoundsHydrated, setIsMapBoundsHydrated] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const prevBoundsRef = useRef<MapBounds | null>(null);

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

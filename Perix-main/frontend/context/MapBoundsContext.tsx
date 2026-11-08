import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { DEFAULT_MAP_BASE, MapBase, mapBaseBounds, validMapBase } from "../lib/city/mapBase";

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
  mapBase: MapBase;
  mapBaseRevision: number;
  selectMapBase: (base:MapBase) => void;
}

const MapBoundsContext = createContext<MapBoundsContextType | null>(null);

const MAP_BOUNDS_KEY = "@perix_map_bounds";
const MAP_BASE_KEY = "@perix_map_base";

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
  const [mapBase,setMapBase]=useState<MapBase>(DEFAULT_MAP_BASE);
  const [mapBaseRevision,setMapBaseRevision]=useState(0);
  const baseAction=useRef(0),boundsAction=useRef(0);

  useEffect(() => {
    let active=true;
    (async () => {
      try {
        const [raw,rawBase] = await Promise.all([storageGet(MAP_BOUNDS_KEY),storageGet(MAP_BASE_KEY)]);
        if(!active)return;
        let restoredBase:unknown=null;
        try{restoredBase=rawBase ? JSON.parse(rawBase) : null;}catch{}
        if(baseAction.current===0 && validMapBase(restoredBase)){
          setMapBase(restoredBase);setMapBaseRevision(value=>value+1);
          setMapBoundsState(mapBaseBounds(restoredBase));setIsMapInitialized(true);
        }else if(boundsAction.current===0 && baseAction.current===0 && raw){
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
      if(active)setIsMapBoundsHydrated(true);
    })();
    return()=>{active=false;};
  }, []);

  const setMapBounds = useCallback((bounds: MapBounds) => {
    boundsAction.current+=1;
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

  const selectMapBase=useCallback((base:MapBase)=>{
    if(!validMapBase(base))return;
    baseAction.current+=1;
    setMapBase(base);setMapBaseRevision(value=>value+1);
    setMapBounds(mapBaseBounds(base));
    storageSet(MAP_BASE_KEY,JSON.stringify(base));
  },[setMapBounds]);

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
        mapBase,mapBaseRevision,selectMapBase,
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

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
        
        if (savedLocation) {
          const parsed = JSON.parse(savedLocation);
          // If it was live location, refresh it
          if (parsed.isLiveLocation) {
            await requestLiveLocation();
          } else {
            setLocation(parsed);
          }
        } else {
          // Default to live location
          await requestLiveLocation();
        }
      } catch (e) {
        console.error("Error loading saved location:", e);
        // Try to get live location as fallback
        await requestLiveLocation();
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
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied");
        setLoading(false);
        return;
      }
      
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const newLocation: LocationData = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
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

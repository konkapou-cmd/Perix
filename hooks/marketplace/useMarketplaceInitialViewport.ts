import { useMemo, useRef } from "react";
import { useMapBounds } from "../../context/MapBoundsContext";
import { useLocation } from "../../context/LocationContext";
import { useAuth } from "../../context/AuthContext";

type ViewportBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type MarketplaceInitialViewport = {
  ready: boolean;
  needsLocation: boolean;
  initialLocation: { latitude: number; longitude: number } | null;
  initialBounds: ViewportBounds | null;
};

const DEFAULT_DELTA = 0.09;

function boundsAround(lat: number, lng: number): ViewportBounds {
  const halfDelta = DEFAULT_DELTA / 2;
  return {
    minLat: lat - halfDelta,
    maxLat: lat + halfDelta,
    minLng: lng - halfDelta,
    maxLng: lng + halfDelta,
  };
}

function validCoords(lat?: number | null, lng?: number | null): boolean {
  return lat != null && lng != null && isFinite(lat) && isFinite(lng);
}

export function useMarketplaceInitialViewport(): MarketplaceInitialViewport {
  const { mapBounds, isMapBoundsHydrated } = useMapBounds();
  const { location, loading: locationLoading } = useLocation();
  const { user, sessionToken } = useAuth();
  const frozenRef = useRef<MarketplaceInitialViewport | null>(null);

  return useMemo(() => {
    if (frozenRef.current) return frozenRef.current;

    const empty = { ready: false, needsLocation: false, initialLocation: null, initialBounds: null };

    if (!isMapBoundsHydrated) return empty;

    if (mapBounds) {
      const result: MarketplaceInitialViewport = {
        ready: true,
        needsLocation: false,
        initialLocation: { latitude: mapBounds.centerLat, longitude: mapBounds.centerLng },
        initialBounds: { minLat: mapBounds.minLat, maxLat: mapBounds.maxLat, minLng: mapBounds.minLng, maxLng: mapBounds.maxLng },
      };
      frozenRef.current = result;
      return result;
    }

    const userLat = (user as any)?.latitude;
    const userLng = (user as any)?.longitude;
    if (validCoords(userLat, userLng)) {
      const result: MarketplaceInitialViewport = {
        ready: true,
        needsLocation: false,
        initialLocation: { latitude: userLat!, longitude: userLng! },
        initialBounds: boundsAround(userLat!, userLng!),
      };
      frozenRef.current = result;
      return result;
    }

    if (locationLoading) return empty;

    const locLat = location?.latitude;
    const locLng = location?.longitude;
    if (validCoords(locLat, locLng)) {
      const result: MarketplaceInitialViewport = {
        ready: true,
        needsLocation: false,
        initialLocation: { latitude: locLat!, longitude: locLng! },
        initialBounds: boundsAround(locLat!, locLng!),
      };
      frozenRef.current = result;
      return result;
    }

    return { ready: true, needsLocation: true, initialLocation: null, initialBounds: null };
  }, [isMapBoundsHydrated, mapBounds, user, location, locationLoading]);
}

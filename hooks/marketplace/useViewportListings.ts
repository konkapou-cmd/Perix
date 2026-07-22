import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { getListings, Listing, ListingDiscoveryQuery } from "../../lib/api/listings";

type ViewportBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type HookArgs = {
  listingType: "product" | "home_rental";
  filters?: Partial<ListingDiscoveryQuery>;
  limit?: number;
  initialBounds?: ViewportBounds | null;
};

type HookResult = {
  listings: Listing[];
  visibleListings: Listing[];
  loading: boolean;
  visibleBounds: ViewportBounds | null;
  committedBounds: ViewportBounds | null;
  setVisibleBounds: (b: ViewportBounds) => void;
  setCommittedBounds: (b: ViewportBounds) => void;
};

function inBounds(lat: number, lng: number, b: ViewportBounds): boolean {
  return b.minLat <= lat && lat <= b.maxLat && b.minLng <= lng && lng <= b.maxLng;
}

export function useViewportListings({ listingType, filters, limit = 100, initialBounds }: HookArgs): HookResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleBounds, setVisibleBounds] = useState<ViewportBounds | null>(null);
  const [committedBounds, setCommittedBounds] = useState<ViewportBounds | null>(null);
  const requestIdRef = useRef(0);
  const filtersKey = JSON.stringify(filters);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !initialBounds) return;
    seededRef.current = true;
    setVisibleBounds(initialBounds);
    setCommittedBounds(initialBounds);
  }, [initialBounds]);

  useEffect(() => {
    if (!committedBounds) return;
    const requestId = ++requestIdRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query: ListingDiscoveryQuery = {
          listingType,
          ...committedBounds,
          limit,
          ...filters,
        };
        const data = await getListings(query);
        if (requestId !== requestIdRef.current) return;
        setListings(data);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setListings([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [committedBounds, listingType, limit, filtersKey]);

  const visibleListings = useMemo(() => {
    if (!visibleBounds) return listings;
    return listings.filter((l) => l.latitude != null && l.longitude != null && inBounds(l.latitude, l.longitude, visibleBounds));
  }, [listings, visibleBounds]);

  const commitBounds = useCallback((b: ViewportBounds) => {
    setCommittedBounds(b);
  }, []);

  return {
    listings,
    visibleListings,
    loading,
    visibleBounds,
    committedBounds,
    setVisibleBounds,
    setCommittedBounds: commitBounds,
  };
}

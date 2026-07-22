import { useState, useRef, useCallback, useEffect } from "react";
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
};

type HookResult = {
  listings: Listing[];
  loading: boolean;
  visibleBounds: ViewportBounds | null;
  committedBounds: ViewportBounds | null;
  setVisibleBounds: (b: ViewportBounds) => void;
  setCommittedBounds: (b: ViewportBounds) => void;
  fetchNow: () => void;
};

export function useViewportListings({ listingType, filters, limit = 100 }: HookArgs): HookResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleBounds, setVisibleBounds] = useState<ViewportBounds | null>(null);
  const [committedBounds, setCommittedBounds] = useState<ViewportBounds | null>(null);
  const requestIdRef = useRef(0);

  const fetchNow = useCallback(async () => {
    if (!visibleBounds) return;
    const bounds = visibleBounds;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setCommittedBounds(bounds);
    try {
      const query: ListingDiscoveryQuery = {
        listingType,
        ...bounds,
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
  }, [visibleBounds, listingType, limit, JSON.stringify(filters)]);

  useEffect(() => {
    if (!visibleBounds) return;
    const timer = setTimeout(fetchNow, 300);
    return () => clearTimeout(timer);
  }, [fetchNow, visibleBounds]);

  return {
    listings,
    loading,
    visibleBounds,
    committedBounds,
    setVisibleBounds,
    setCommittedBounds,
    fetchNow,
  };
}

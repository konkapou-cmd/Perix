import { useEffect, useMemo, useRef, useState } from "react";
import { getNearbyBusinesses, getEvents, getActivities, getJobs, getRentals, getNearbyServices } from "../lib/api";
import { getListings } from "../lib/api/listings";
import type { MapBounds } from "../context/MapBoundsContext";
import { dateBoundary, discoveryResults, projectDiscoveryResults, type DiscoveryData, type DiscoveryFilter, type DiscoverySection } from "../lib/home/discovery";

/** Focused reads only. No map, polling, feed mutations or duplicate Locator loader. */
export function useHomeDiscovery({ token, bounds, data, section, filter, favoriteBusinesses, refreshKey }: {
  token: string | null; bounds: MapBounds | null; data: DiscoveryData; section: DiscoverySection;
  filter: DiscoveryFilter; favoriteBusinesses: boolean; refreshKey: number;
}) {
  const cache = useRef(new Map<string, Partial<DiscoveryData>>());
  const [response, setResponse] = useState<{ key: string; data: Partial<DiscoveryData> } | null>(null);
  const [status, setStatus] = useState<{ key: string; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  // Query text stays local; each selected filter reads only its own entity endpoint.
  const remote = (section === "businesses" && (favoriteBusinesses || !!filter.category))
    || (["events", "activities", "jobs", "rentals", "products", "services"].includes(section) && !!(filter.category || filter.startDate || filter.endDate));
  const key = JSON.stringify([token, bounds, section, filter.category, filter.subcategory, filter.startDate, filter.endDate, refreshKey, retry]);
  useEffect(() => { cache.current.clear(); setResponse(null); }, [token, refreshKey]);
  useEffect(() => {
    if (!token || !bounds || !remote) return;
    let active = true;
    const cached = cache.current.get(key);
    if (cached) { setResponse({ key, data: cached }); return; }
    setStatus(null);
    async function search(): Promise<Partial<DiscoveryData>> {
      const b = bounds!, t = token!, category = filter.category || undefined;
      switch (section) {
        case "businesses": return { businesses: await getNearbyBusinesses(t, b.centerLat, b.centerLng, category, filter.subcategory || undefined, b) };
        case "events": return { events: await getEvents(t, undefined, undefined, b, { theme: category,
          startAfter: dateBoundary(filter.startDate), startBefore: dateBoundary(filter.endDate, true) }) };
        case "activities": return { activities: await getActivities(t, b, { category }) };
        case "jobs": return { jobs: (await getJobs(t, b, { rootCategory: category }, 0, 100)).jobs };
        case "services": return { services: (await getNearbyServices(t, b, undefined, 0, 100, category)).services };
        case "rentals": {
          const [rentals, ownerHomes] = await Promise.all([getRentals(t, b, { propertyType: category }, 0, 100),
            getListings({ listingType: "home_rental", ...b, propertyType: category, limit: 100 })]);
          return { rentals: rentals.rentals, ownerHomes };
        }
        case "products": return { products: await getListings({ listingType: "product", ...b, category, subcategory: filter.subcategory || undefined, limit: 100 }) };
        default: return {};
      }
    }
    search().then(value => {
      if (!active) return;
      if (cache.current.size >= 24) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(key, value); setResponse({ key, data: value }); setStatus({ key, error: false });
    }).catch(() => { if (active) setStatus({ key, error: true }); });
    return () => { active = false; };
  }, [key, remote]);
  const loading = !!(token && bounds && remote && response?.key !== key && status?.key !== key);
  const error = remote && status?.key === key && status.error;
  const results = useMemo(() => discoveryResults({ ...data, ...(remote && response?.key === key ? response.data : {}) }, section, filter), [data, section, filter, remote, response, key]);
  // Do not display stale feed subsets as successful search results while a focused request is pending/failed.
  const visible = loading || error ? [] : results;
  const mapData = useMemo(() => projectDiscoveryResults(visible), [visible]);
  return { results: visible, mapData, loading, error, retry: () => setRetry(value => value + 1) };
}

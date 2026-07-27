import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ViewportBounds, isEntityInsideBounds, buildBoundsKey } from "../../lib/location/viewportBounds";
import {
  Business,
  EventItem,
  ActivityItem,
  Rental,
  Service,
  getNearbyBusinesses,
  getEvents,
  getActivities,
  getRentals,
  getJobs,
  getNearbyServices,
} from "../../lib/api";
import { Listing, getListings, ListingDiscoveryQuery } from "../../lib/api/listings";

type LoadingMap = Record<string, boolean>;

type UseHomeViewportArgs = {
  sessionToken: string | null | undefined;
  initialBounds?: ViewportBounds | null;
  favoriteCategories?: string[];
  feedMode?: "all" | "following" | "nearby";
};

type UseHomeViewportResult = {
  businesses: Business[];
  events: EventItem[];
  activities: ActivityItem[];
  services: Service[];
  jobs: any[];
  rentals: Rental[];
  products: Listing[];
  homes: Listing[];
  visibleBusinesses: Business[];
  visibleEvents: EventItem[];
  visibleActivities: ActivityItem[];
  visibleServices: Service[];
  visibleJobs: any[];
  visibleRentals: Rental[];
  visibleProducts: Listing[];
  visibleHomes: Listing[];
  loadingByType: LoadingMap;
  visibleBounds: ViewportBounds | null;
  committedBounds: ViewportBounds | null;
  setVisibleBounds: (b: ViewportBounds) => void;
  setCommittedBounds: (b: ViewportBounds) => void;
};

export function useHomeViewportData({
  sessionToken,
  initialBounds,
  favoriteCategories,
  feedMode,
}: UseHomeViewportArgs): UseHomeViewportResult {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [products, setProducts] = useState<Listing[]>([]);
  const [homes, setHomes] = useState<Listing[]>([]);
  const [loadingByType, setLoadingByType] = useState<LoadingMap>({});
  const [visibleBounds, setVisibleBounds] = useState<ViewportBounds | null>(null);
  const [committedBounds, setCommittedBounds] = useState<ViewportBounds | null>(null);

  const requestIdRef = useRef(0);
  const boundsKeyRef = useRef<string>("");
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || !initialBounds) return;
    seededRef.current = true;
    setVisibleBounds(initialBounds);
    setCommittedBounds(initialBounds);
  }, [initialBounds]);

  useEffect(() => {
    if (!committedBounds || !sessionToken) return;
    const boundsKey = buildBoundsKey(committedBounds);
    const requestId = ++requestIdRef.current;
    boundsKeyRef.current = boundsKey;

    const center = {
      latitude: committedBounds.centerLat ?? (committedBounds.minLat + committedBounds.maxLat) / 2,
      longitude: committedBounds.centerLng ?? (committedBounds.minLng + committedBounds.maxLng) / 2,
    };

    const boundsQuery = {
      minLat: committedBounds.minLat,
      maxLat: committedBounds.maxLat,
      minLng: committedBounds.minLng,
      maxLng: committedBounds.maxLng,
    };

    const timer = setTimeout(() => {
      const accept = () => requestId === requestIdRef.current && boundsKey === boundsKeyRef.current;

      const load = async (type: string, promise: Promise<any>, setter: (data: any) => void) => {
        setLoadingByType((p) => ({ ...p, [type]: true }));
        try {
          const data = await promise;
          if (accept()) setter(Array.isArray(data) ? data : []);
        } catch {
          if (accept()) setter([]);
        } finally {
          if (requestId === requestIdRef.current) {
            setLoadingByType((p) => ({ ...p, [type]: false }));
          }
        }
      };

      load("businesses", getNearbyBusinesses(sessionToken, center.latitude, center.longitude, undefined, undefined, boundsQuery), setBusinesses);
      load("events", getEvents(sessionToken, undefined, undefined, boundsQuery), setEvents);
      load("activities", getActivities(sessionToken, boundsQuery), setActivities);
      load("services", getNearbyServices(sessionToken, boundsQuery, center), setServices);
      load("jobs", getJobs(sessionToken, boundsQuery, center), setJobs);
      load("rentals", getRentals(sessionToken, boundsQuery, center), setRentals);

      const productQuery: ListingDiscoveryQuery = { listingType: "product", ...boundsQuery, limit: 100 };
      const homeQuery: ListingDiscoveryQuery = { listingType: "home_rental", ...boundsQuery, limit: 100 };

      load("products", getListings(productQuery), setProducts);
      load("homes", getListings(homeQuery), setHomes);
    }, 300);

    return () => clearTimeout(timer);
  }, [committedBounds, sessionToken, favoriteCategories, feedMode]);

  const commitBounds = useCallback((b: ViewportBounds) => {
    setCommittedBounds(b);
  }, []);

  const visibleBusinesses = useMemo(() => !visibleBounds ? businesses : businesses.filter(b => isEntityInsideBounds(b.latitude, b.longitude, visibleBounds)), [businesses, visibleBounds]);
  const visibleEvents = useMemo(() => !visibleBounds ? events : events.filter(e => isEntityInsideBounds(e.latitude, e.longitude, visibleBounds)), [events, visibleBounds]);
  const visibleActivities = useMemo(() => !visibleBounds ? activities : activities.filter(a => isEntityInsideBounds(a.latitude, a.longitude, visibleBounds)), [activities, visibleBounds]);
  const visibleServices = useMemo(() => !visibleBounds ? services : services.filter(s => isEntityInsideBounds(s.latitude, s.longitude, visibleBounds)), [services, visibleBounds]);
  const visibleJobs = useMemo(() => !visibleBounds ? jobs : jobs.filter(j => isEntityInsideBounds(j.latitude, j.longitude, visibleBounds)), [jobs, visibleBounds]);
  const visibleRentals = useMemo(() => !visibleBounds ? rentals : rentals.filter(r => isEntityInsideBounds(r.latitude, r.longitude, visibleBounds)), [rentals, visibleBounds]);
  const visibleProducts = useMemo(() => !visibleBounds ? products : products.filter(p => isEntityInsideBounds(p.latitude, p.longitude, visibleBounds)), [products, visibleBounds]);
  const visibleHomes = useMemo(() => !visibleBounds ? homes : homes.filter(h => isEntityInsideBounds(h.latitude, h.longitude, visibleBounds)), [homes, visibleBounds]);

  return {
    businesses, events, activities, services, jobs, rentals, products, homes,
    visibleBusinesses, visibleEvents, visibleActivities, visibleServices, visibleJobs, visibleRentals, visibleProducts, visibleHomes,
    loadingByType,
    visibleBounds,
    committedBounds,
    setVisibleBounds,
    setCommittedBounds: commitBounds,
  };
}

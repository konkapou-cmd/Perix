import { useCallback, useEffect, useRef, useState } from "react";
import {
  getHomeFeed,
  getNearbyBusinesses,
  getJobs,
  getRentals,
  getStories,
  getEvents,
  getActivities,
  batchCheckSaved,
  Post,
  EventItem,
  Business,
  Job,
  Rental,
  ActivityItem,
  GroupedStory,
} from "../lib/api";
import type { MapBounds } from "../context/MapBoundsContext";

interface UseFeedDataParams {
  sessionToken: string | null;
  mapBounds: MapBounds | null;
  userLocation: { latitude: number; longitude: number } | null;
  user: { latitude?: number | null; longitude?: number | null } | null;
  refreshKey?: number;
}

interface UseFeedDataResult {
  posts: Post[];
  events: EventItem[];
  businesses: Business[];
  jobs: Job[];
  rentals: Rental[];
  activities: ActivityItem[];
  storyGroups: GroupedStory[];
  savedEventIds: Set<string>;
  savedActivityIds: Set<string>;
  savedBusinessIds: Set<string>;
  savedJobIds: Set<string>;
  savedPostIds: Set<string>;
  savedRentalIds: Set<string>;
  feedError: boolean;
  loading: boolean;
  backgroundLoading: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_BOUNDS: MapBounds = {
  minLat: 52.475,
  maxLat: 52.565,
  minLng: 13.36,
  maxLng: 13.45,
  centerLat: 52.52,
  centerLng: 13.405,
};

function computeBounds(
  mapBounds: MapBounds | null,
  user: { latitude?: number | null; longitude?: number | null } | null,
  userLocation: { latitude: number; longitude: number } | null
): MapBounds {
  if (mapBounds) return mapBounds;
  const lat = user?.latitude || userLocation?.latitude;
  const lng = user?.longitude || userLocation?.longitude;
  if (lat && lng) {
    const d = 0.09;
    return { minLat: lat - d / 2, maxLat: lat + d / 2, minLng: lng - d / 2, maxLng: lng + d / 2, centerLat: lat, centerLng: lng };
  }
  return DEFAULT_BOUNDS;
}

export function useFeedData({ sessionToken, mapBounds, userLocation, user, refreshKey }: UseFeedDataParams): UseFeedDataResult {
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [storyGroups, setStoryGroups] = useState<GroupedStory[]>([]);
  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(new Set());
  const [savedActivityIds, setSavedActivityIds] = useState<Set<string>>(new Set());
  const [savedBusinessIds, setSavedBusinessIds] = useState<Set<string>>(new Set());
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());
  const [savedRentalIds, setSavedRentalIds] = useState<Set<string>>(new Set());
  const [feedError, setFeedError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const isInitialRef = useRef(true);

  const paramsRef = useRef({ sessionToken, mapBounds, userLocation, user });
  paramsRef.current = { sessionToken, mapBounds, userLocation, user };

  const loadData = useCallback(async () => {
    const { sessionToken, mapBounds, userLocation, user } = paramsRef.current;
    if (!sessionToken) return;
    const bounds = computeBounds(mapBounds, user, userLocation);
    const userLat = bounds.centerLat || userLocation?.latitude || 52.52;
    const userLng = bounds.centerLng || userLocation?.longitude || 13.405;

    if (isInitialRef.current) {
      setLoading(true);
    } else {
      setBackgroundLoading(true);
    }
    setFeedError(false);

    try {
      const feedPromise = getHomeFeed(sessionToken, undefined, undefined, {
        minLat: bounds.minLat, maxLat: bounds.maxLat, minLng: bounds.minLng, maxLng: bounds.maxLng,
      });
      const eventsPromise = getEvents(sessionToken, undefined, undefined, bounds);
      const activitiesPromise = getActivities(sessionToken, bounds);
      const businessesPromise = getNearbyBusinesses(sessionToken, userLat, userLng, undefined, undefined, bounds);
      const jobsPromise = getJobs(sessionToken, bounds, { latitude: userLat, longitude: userLng });
      const rentalsPromise = getRentals(sessionToken, bounds, { latitude: userLat, longitude: userLng });
      const storiesPromise = getStories(sessionToken, { minLat: bounds.minLat, maxLat: bounds.maxLat, minLng: bounds.minLng, maxLng: bounds.maxLng });

      const results = await Promise.allSettled([
        feedPromise, eventsPromise, activitiesPromise, businessesPromise, jobsPromise, rentalsPromise, storiesPromise,
      ]);
      const [feedResult, eventsResult, activitiesResult, bizResult, jobsResult, rentalsResult, storiesResult] = results as [
        PromiseSettledResult<Awaited<typeof feedPromise>>,
        PromiseSettledResult<Awaited<typeof eventsPromise>>,
        PromiseSettledResult<Awaited<typeof activitiesPromise>>,
        PromiseSettledResult<Awaited<typeof businessesPromise>>,
        PromiseSettledResult<Awaited<typeof jobsPromise>>,
        PromiseSettledResult<Awaited<typeof rentalsPromise>>,
        PromiseSettledResult<Awaited<typeof storiesPromise>>,
      ];

      if (feedResult.status === "fulfilled") {
        const fd = feedResult.value;
        const feedPosts = fd.posts || [];
        setPosts(feedPosts);
        if (feedPosts.length > 0) {
          const pIds = feedPosts.map((p: Post) => p.post_id);
          batchCheckSaved(sessionToken, "post", pIds).then((r: { saved_ids: string[] }) => setSavedPostIds(new Set(r.saved_ids))).catch(() => {});
        }
      } else {
        console.error("Feed load failed:", feedResult.reason);
        setFeedError(true);
      }

      if (eventsResult.status === "fulfilled") {
        const evts = (eventsResult.value as any) || [];
        setEvents(Array.isArray(evts) ? evts : evts.events || []);
        const evtList = Array.isArray(evts) ? evts : evts.events || [];
        if (evtList.length > 0) {
          const evIds = evtList.map((e: EventItem) => e.event_id);
          batchCheckSaved(sessionToken, "event", evIds).then((r: { saved_ids: string[] }) => setSavedEventIds(new Set(r.saved_ids))).catch(() => {});
        }
      } else {
        console.error("Events load failed:", eventsResult.reason);
      }

      if (activitiesResult.status === "fulfilled") {
        const acts = (activitiesResult.value as any) || [];
        setActivities(Array.isArray(acts) ? acts : acts.activities || []);
        const actList = Array.isArray(acts) ? acts : acts.activities || [];
        if (actList.length > 0) {
          const actIds = actList.map((a: ActivityItem) => a.activity_id);
          batchCheckSaved(sessionToken, "activity", actIds).then((r: { saved_ids: string[] }) => setSavedActivityIds(new Set(r.saved_ids))).catch(() => {});
        }
      } else {
        console.error("Activities load failed:", activitiesResult.reason);
      }

      if (bizResult.status === "fulfilled") {
        const biz = (bizResult.value as any) || [];
        setBusinesses(Array.isArray(biz) ? biz : biz.businesses || []);
        const bizList = Array.isArray(biz) ? biz : biz.businesses || [];
        if (bizList.length > 0) {
          batchCheckSaved(sessionToken, "business", bizList.map((b: Business) => b.business_id)).then((r: { saved_ids: string[] }) => setSavedBusinessIds(new Set(r.saved_ids))).catch(() => {});
        }
      } else {
        console.error("Businesses load failed:", bizResult.reason);
      }

      if (jobsResult.status === "fulfilled") {
        const jr = jobsResult.value;
        const jobList: Job[] = Array.isArray(jr) ? jr : (jr.jobs || []);
        setJobs(jobList);
        if (jobList.length > 0) {
          batchCheckSaved(sessionToken, "job", jobList.map((j: Job) => j.job_id)).then((r: { saved_ids: string[] }) => setSavedJobIds(new Set(r.saved_ids))).catch(() => {});
        }
      } else {
        console.error("Jobs load failed:", jobsResult.reason);
      }

      if (rentalsResult.status === "fulfilled") {
        const rv = rentalsResult.value;
        const rentalList: Rental[] = Array.isArray(rv) ? rv : (rv.rentals || []);
        setRentals(rentalList);
        if (rentalList.length > 0) {
          batchCheckSaved(sessionToken, "rental", rentalList.map((r: Rental) => r.rental_id)).then((res: { saved_ids: string[] }) => setSavedRentalIds(new Set(res.saved_ids))).catch(() => {});
        }
      } else {
        console.error("Rentals load failed:", rentalsResult.reason);
      }

      if (storiesResult.status === "fulfilled") {
        const sv = storiesResult.value as any;
        setStoryGroups(Array.isArray(sv) ? sv : (sv.stories || sv || []));
      } else {
        console.error("Stories load failed:", storiesResult.reason);
      }
    } catch (err) {
      console.error("Feed data load error:", err);
      setFeedError(true);
    } finally {
      isInitialRef.current = false;
      setLoading(false);
      setBackgroundLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionToken) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [sessionToken, refreshKey]);

  return {
    posts, events, businesses, jobs, rentals, activities, storyGroups,
    savedEventIds, savedActivityIds, savedBusinessIds, savedJobIds, savedPostIds, savedRentalIds,
    feedError, loading, backgroundLoading, refresh: loadData,
  };
}
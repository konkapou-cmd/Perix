import { useMemo } from "react";
import { Post, EventItem, Business, Job, ActivityItem, Rental, Service } from "../lib/api";
import { isUpcomingEvent } from "../lib/api/events";
import { isUpcomingActivity } from "../lib/api/events";

interface SortingConfig {
  posts: "chronological" | "engagement" | "random" | "custom";
  events: "chronological" | "distance" | "engagement" | "random" | "custom";
  businesses: "chronological" | "distance" | "engagement" | "random" | "custom";
  jobs: "chronological" | "distance" | "random" | "custom";
  rentals: "chronological" | "distance" | "random" | "custom";
  services: "chronological" | "distance" | "engagement" | "random" | "custom";
}

interface UseContentSortingParams {
  posts: Post[];
  events: EventItem[];
  businesses: Business[];
  jobs: Job[];
  activities: ActivityItem[];
  rentals: Rental[];
  services: Service[];
  sorting: SortingConfig;
  userLocation: { latitude: number; longitude: number } | null;
  mapBounds: { centerLat?: number; centerLng?: number } | null;
  eventsFilter: "all" | "attending" | "mine";
  activitiesFilter: "all" | "attending" | "mine";
  mapRefreshKey: number;
}

function haversineDistance(lat1: number, lon1: number, lat2: number | undefined | null, lon2: number | undefined | null): number {
  if (lat2 == null || lon2 == null) return Infinity;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shuffle<T>(items: T[]): T[] {
  if (!items || !Array.isArray(items)) return [];
  return [...items].sort(() => Math.random() - 0.5);
}

function sortByDistance<T extends { latitude?: number | null; longitude?: number | null; business?: { latitude: number; longitude: number } | null }>(
  items: T[], userLat: number, userLng: number
): T[] {
  if (!items || !Array.isArray(items)) return [];
  return [...items].sort((a, b) => {
    const aLat = a.latitude ?? a.business?.latitude;
    const aLng = a.longitude ?? a.business?.longitude;
    const bLat = b.latitude ?? b.business?.latitude;
    const bLng = b.longitude ?? b.business?.longitude;
    return haversineDistance(userLat, userLng, aLat, aLng) - haversineDistance(userLat, userLng, bLat, bLng);
  });
}

export function useContentSorting({
  posts = [], events = [], businesses = [], jobs = [], activities = [], rentals = [], services = [],
  sorting, userLocation, mapBounds, eventsFilter, activitiesFilter, mapRefreshKey,
}: UseContentSortingParams) {
  const userLat = userLocation?.latitude ?? mapBounds?.centerLat ?? null;
  const userLng = userLocation?.longitude ?? mapBounds?.centerLng ?? null;

  const sortedEvents = useMemo(() => {
    let upcoming = events.filter(isUpcomingEvent);
    if (eventsFilter === "attending") upcoming = upcoming.filter(e => e.is_attending);
    else if (eventsFilter === "mine") upcoming = upcoming.filter(e => (e as any).is_creator);
    switch (sorting.events) {
      case "distance": return userLat != null && userLng != null ? sortByDistance(upcoming as any[], userLat, userLng) : shuffle(upcoming);
      case "chronological": return [...upcoming].sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      case "engagement": return [...upcoming].sort((a, b) => (b.attendees_count || 0) - (a.attendees_count || 0));
      default: return shuffle(upcoming);
    }
  }, [events, mapRefreshKey, sorting.events, userLocation, mapBounds, eventsFilter]);

  const sortedBusinesses = useMemo(() => {
    switch (sorting.businesses) {
      case "distance": return userLat != null && userLng != null ? sortByDistance(businesses as any[], userLat, userLng) : shuffle(businesses);
      case "chronological": return [...businesses].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      case "engagement": return [...businesses].sort((a, b) => ((b as any).followers_count || 0) - ((a as any).followers_count || 0));
      default: return shuffle(businesses);
    }
  }, [businesses, mapRefreshKey, sorting.businesses, userLocation, mapBounds]);

  const sortedJobs = useMemo(() => {
    switch (sorting.jobs) {
      case "distance": return userLat != null && userLng != null ? sortByDistance(jobs as any[], userLat, userLng) : shuffle(jobs);
      case "chronological": return [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      default: return shuffle(jobs);
    }
  }, [jobs, mapRefreshKey, sorting.jobs, userLocation, mapBounds]);

  const sortedActivities = useMemo(() => {
    let filtered = activities.filter(isUpcomingActivity);
    if (activitiesFilter === "attending") filtered = filtered.filter(a => a.my_status === "accepted" || a.my_status === "going");
    else if (activitiesFilter === "mine") filtered = filtered.filter(a => a.is_creator);
    return [...filtered].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [activities, activitiesFilter, mapRefreshKey]);

  const sortedPosts = useMemo(() => {
    switch (sorting.posts) {
      case "chronological": return [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "engagement": return [...posts].sort((a, b) => (b.likes_count + b.comments_count) - (a.likes_count + a.comments_count));
      default: return shuffle(posts);
    }
  }, [posts, sorting.posts]);

  const sortedRentals = useMemo(() => {
    switch (sorting.rentals) {
      case "distance": return userLat != null && userLng != null ? sortByDistance(rentals as any[], userLat, userLng) : shuffle(rentals);
      case "chronological": return [...rentals].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      default: return shuffle(rentals);
    }
  }, [rentals, mapRefreshKey, sorting.rentals, userLocation, mapBounds]);

  const sortedServices = useMemo(() => {
    switch (sorting.services) {
      case "distance": return userLat != null && userLng != null ? sortByDistance(services as any[], userLat, userLng) : shuffle(services);
      case "chronological": return [...services].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "engagement": return [...services].sort((a, b) => (b.capacity || 0) - (a.capacity || 0));
      default: return shuffle(services);
    }
  }, [services, mapRefreshKey, sorting.services, userLocation, mapBounds]);

  return { sortedEvents, sortedBusinesses, sortedJobs, sortedActivities, sortedPosts, sortedRentals, sortedServices };
}

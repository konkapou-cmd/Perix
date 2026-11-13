import type { Business, EventItem, ActivityItem, Job, Rental, Service, CategoryGroup } from "../api";
import type { Listing } from "../api/listings";
import { ACTIVITY_TYPES } from "../api/core";

export const DISCOVERY_SECTIONS = ["businesses", "events", "activities", "jobs", "services", "products", "rentals", "hotels"] as const;
export type DiscoverySection = typeof DISCOVERY_SECTIONS[number];
export type DiscoveryFilter = { category: string; subcategory: string; query: string; startDate: string | null; endDate: string | null };
export type DiscoveryFilters = Record<DiscoverySection, DiscoveryFilter>;
export type DiscoveryData = {
  businesses: Business[]; events: EventItem[]; activities: ActivityItem[]; jobs: Job[];
  services: Service[]; products: Listing[]; rentals: Rental[]; hotels: Business[]; ownerHomes: Listing[];
};
export type DiscoveryResult = {
  [K in keyof DiscoveryData]: { kind: K; id: string; key: string; data: DiscoveryData[K][number] }
}[keyof DiscoveryData];

export function discoverySection(value: unknown): DiscoverySection {
  return DISCOVERY_SECTIONS.includes(value as DiscoverySection) ? value as DiscoverySection : "businesses";
}
export function createDiscoveryFilters(): DiscoveryFilters {
  return Object.fromEntries(DISCOVERY_SECTIONS.map(key => [key, {
    category: "", subcategory: "", query: "", startDate: null, endDate: null,
  }])) as DiscoveryFilters;
}
export function businessChildren(categories: CategoryGroup[], root: string) {
  const category = categories.find(item => item.slug === root);
  return [...new Map([...(category?.subcategories || []), ...(category?.groups || []).flatMap(group => group.subcategories)]
    .map(child => [child.slug, child])).values()];
}
export function effectiveDateRange(section: DiscoverySection, filter: DiscoveryFilter, now = new Date()) {
  if (section !== "events" || filter.startDate || filter.endDate) return { startDate: filter.startDate, endDate: filter.endDate };
  const end = new Date(now); end.setDate(end.getDate() + 7);
  return { startDate: now.toISOString(), endDate: end.toISOString() };
}
export function dateBoundary(value: string | null, end = false) {
  if (!value) return undefined;
  return value.length === 10 ? `${value}T${end ? "23:59:59.999" : "00:00:00.000"}` : value;
}
export function discoveryResults(data: DiscoveryData, section: DiscoverySection, filter: DiscoveryFilter, now = new Date()): DiscoveryResult[] {
  const kinds: (keyof DiscoveryData)[] = section === "rentals" ? ["rentals", "ownerHomes"] : [section];
  const range = effectiveDateRange(section, filter, now), seen = new Set<string>();
  return kinds.flatMap(kind => data[kind].map(item => {
    const row = item as unknown as Record<string, any>;
    const id = row.business_id && (kind === "businesses" || kind === "hotels") ? row.business_id
      : row.listing_id || row.event_id || row.activity_id || row.job_id || row.service_id || row.rental_id;
    return { kind, id, key: `${kind === "ownerHomes" || row.source_type === "owner" ? "listing" : kind}:${id}`, data: item } as DiscoveryResult;
  })).filter(result => {
    if (!result.id || seen.has(result.key)) return false;
    seen.add(result.key);
    const row = result.data as unknown as Record<string, any>;
    if (filter.query && ![row.name, row.title, row.description, row.address, row.location].filter(Boolean).join(" ").toLocaleLowerCase().includes(filter.query.trim().toLocaleLowerCase())) return false;
    if (filter.category) {
      let category = section === "events" ? row.theme : section === "activities" ? row.category || row.activity_category || ACTIVITY_TYPES[row.theme]?.category
        : section === "services" ? row.type : section === "rentals" ? row.property_type || row.attributes?.property_type || row.subcategory
        : row.root_category || row.category;
      if (section === "rentals") category = ({ apartments: "apartment", houses: "house", rooms: "room", studios: "studio" } as Record<string, string>)[category] || category;
      if (category !== filter.category) return false;
    }
    if (filter.subcategory && row.subcategory !== filter.subcategory && !row.subcategories?.includes(filter.subcategory)) return false;
    if (section === "events" || section === "activities") {
      const date = row.start_time || row.date;
      const stamp = date ? new Date(date).getTime() : NaN;
      // A date-only activity remains discoverable throughout that day.
      const upperStamp = date?.length === 10 ? new Date(dateBoundary(date, true)!).getTime() : stamp;
      if (!Number.isFinite(stamp)) return false;
      if (range.startDate && upperStamp < new Date(dateBoundary(range.startDate)!).getTime()) return false;
      if (range.endDate && stamp > new Date(dateBoundary(range.endDate, true)!).getTime()) return false;
    }
    return true;
  });
}
export function projectDiscoveryResults(results: DiscoveryResult[]): DiscoveryData {
  const data: DiscoveryData = { businesses: [], hotels: [], events: [], activities: [], jobs: [], services: [], products: [], rentals: [], ownerHomes: [] };
  for (const result of results) (data[result.kind] as unknown[]).push(result.data);
  return data;
}

import { apiRequest, CategoryGroup } from "../api/core";
import { MARKETPLACE_CATEGORIES } from "../marketplace/marketplaceTaxonomy";
import { SERVICE_MODULES } from "../config/serviceModules";
import { FIELD_REGISTRY } from "../fieldRegistry";
import { CityBounds, getPublicServices, PublicService, PublicServiceCategory } from "./publicServices";
import { getLiveVehicles, getTransitStops } from "../api/mobility";

export type EntityKind = "business" | "event" | "activity" | "service" | "job" | "rental" | "product" | "home" | "post" | "artist" | "user";
export type DirectoryEntity = {
  id: string; type: EntityKind | "public_service" | "bus" | "tram" | "subway" | "s-bahn" | "rail" | "ferry" | "taxi" | "stop";
  title: string; description?: string | null; address?: string | null;
  latitude?: number | null; longitude?: number | null; cover_image?: string | null;
  images?: string[]; videos?: string[]; phone?: string | null; website?: string | null;
  category_ids?: string[]; facts?: Record<string, string>;
  publisher_id?: string | null; publisher_type?: "business" | "artist" | "user" | null;
  publicService?: PublicService;
};
export type GatewayQuery = { kinds: EntityKind[]; root?: string; subcategories?: string[]; themes?: string[]; property_type?: string; job_type?: string; service_type?: string; publicCategory?: string; mobilityMode?: string; publicOnly?: boolean; mobilityOnly?: boolean };
export type GatewayNode = { id: string; label: string; icon: string; hint?: string; query: GatewayQuery; children?: GatewayNode[]; action?: "login"; hidden?: boolean };

const query = (...kinds: EntityKind[]): GatewayQuery => ({ kinds });
const businessChildren = (tree: CategoryGroup[], label: (slug: string) => string): GatewayNode[] => tree.map(root => ({
  id: root.slug, label: label(root.slug), icon: "storefront-outline", query: { kinds: ["business"], root: root.slug },
  children: root.groups?.map(group => ({ id: group.slug, label: label(group.slug), icon: "grid-outline",
    query: { kinds: ["business"], root: root.slug, subcategories: group.subcategories.map(s => s.slug) },
    children: group.subcategories.map(sub => ({ id: sub.slug, label: label(sub.slug), icon: "ellipse-outline", query: { kinds: ["business"], root: root.slug, subcategories: [sub.slug] } })) })),
}));

function publicNode(node: PublicServiceCategory, language: string): GatewayNode {
  const label = language === "el" ? node.label_el : language === "en" ? node.label_en || node.label_de : node.label_de;
  return { id: node.id, label, icon: node.icon || "business-outline", hidden: node.hidden === true, query: { kinds: [], publicOnly: true, publicCategory: node.id }, children: node.children?.map(child => publicNode(child, language)) };
}

export function gatewayCategories(tree: CategoryGroup[], services: PublicServiceCategory | null, label: (slug: string) => string, language = "el"): GatewayNode[] {
  const businesses = businessChildren(tree, label);
  const properties = (kinds: EntityKind[]) => (FIELD_REGISTRY.property_type.options || []).map(key => ({ id: key, label: label(key), icon: "home-outline", query: { kinds, property_type: key } }));
  return [
    services ? publicNode(services, language) : { id: "public-services", label: "Δημόσιες Υπηρεσίες", hint: "Δημόσιες υπηρεσίες και χώροι", icon: "business-outline", query: { kinds: [], publicOnly: true, publicCategory: "public-services" } },
     // App shows event/activity pins as whole categories; their taxonomy filters
     // remain available in Locator, but are intentionally not exposed here.
     { id: "events", label: "Εκδηλώσεις", hint: "Συναυλίες, festivals, έξοδος", icon: "calendar-outline", query: query("event") },
     { id: "activities", label: "Δραστηριότητες", hint: "Περπάτημα, παρέες, αθλητισμός", icon: "walk-outline", query: query("activity") },
    { id: "businesses", label: "Επιχειρήσεις", hint: "Εστίαση, αγορές, επαγγελματίες", icon: "storefront-outline", query: query("business"), children: businesses },
    { id: "hotels", label: "Ξενοδοχεία", hint: "Ξενοδοχεία της πόλης", icon: "bed-outline", query: { kinds: ["business"], root: "local-hotels" }, children: businesses.find(n => n.id === "local-hotels")?.children },
    { id: "services", label: "Υπηρεσίες", hint: "Ραντεβού, μαθήματα, πακέτα", icon: "construct-outline", query: query("service"), children: Object.entries(SERVICE_MODULES).filter(([id]) => id !== "rental_property").map(([id, value]) => ({ id, label: value.fallbackLabel, icon: "construct-outline", query: { kinds: ["service"], service_type: id } })) },
    // Values match the existing JobModal canonical persisted employment types.
    { id: "jobs", label: "Εργασία", hint: "Πλήρης, μερική, remote", icon: "briefcase-outline", query: query("job"), children: ["Vollzeit", "Teilzeit", "Vertrag", "Praktikum", "Remote"].map(id => ({ id, label: id, icon: "briefcase-outline", query: { kinds: ["job"], job_type: id } })) },
    { id: "rentals", label: "Ενοικιάσεις", hint: "Διαμερίσματα, σπίτια, δωμάτια", icon: "key-outline", query: query("rental", "home"), children: properties(["rental", "home"]) },
    { id: "products", label: "Προϊόντα", hint: "Marketplace, καινούργια, μεταχειρισμένα", icon: "bag-outline", query: query("product"), children: MARKETPLACE_CATEGORIES.map(cat => ({ id: cat.key, label: cat.fallback, icon: cat.icon, query: { kinds: ["product"], root: cat.key }, children: cat.subcategories.map(sub => ({ id: sub.key, label: sub.fallback, icon: cat.icon, query: { kinds: ["product"], root: cat.key, subcategories: [sub.key] } })) })) },
    { id: "homes-nearby", label: "Κατοικίες κοντά μου", hint: "Αγγελίες κατοικιών", icon: "home-outline", query: query("home"), children: properties(["home"]) },
    { id: "posts", label: "Δημοσιεύσεις", hint: "Δημόσια νέα της κοινότητας", icon: "newspaper-outline", query: query("post") },
    { id: "mobility", label: "Μετακινήσεις", hint: "Τραμ, λεωφορεία, στάσεις", icon: "bus-outline", query: { kinds: [], mobilityOnly: true }, children: [["tram", "Τραμ"], ["bus", "Λεωφορεία"], ["taxi", "Ταξί"], ["stop", "Στάσεις"]].map(([id, text]) => ({ id, label: text, icon: "bus-outline", query: { kinds: [], mobilityOnly: true, mobilityMode: id } })) },
    services?.children?.find(c => c.id === "ps:sos") ? { ...publicNode(services.children.find(c => c.id === "ps:sos")!, language), id: "sos" } : { id: "sos", label: "Έκτακτη ανάγκη – SOS", icon: "warning-outline", query: { kinds: [], publicOnly: true, publicCategory: "ps:sos" } },
    { id: "login", label: "Είσοδος Μελών", hint: "Σύνδεση στο Perix Home", icon: "log-in-outline", query: { kinds: [] }, action: "login" },
  ];
}

export const ALL_QUERY: GatewayQuery = { kinds: ["business", "event", "activity", "service", "job", "rental", "product", "home", "post"] };
export const getDirectoryDetail = (kind: EntityKind, id: string) => {
  if (kind === "rental" && id.startsWith("lst_")) kind = "home";
  if (kind === "rental" && id.startsWith("svc_svc_")) id = id.slice(4);
  return apiRequest<DirectoryEntity>(`/public-directory/${kind}/${encodeURIComponent(id)}`, "GET");
};

export type DirectoryCity = { countryCode: string; cityId: string };
const HOME_CITIES: DirectoryCity[] = [{ countryCode: "DE", cityId: "de-magdeburg" }];

export async function fetchGatewayPage(filter: GatewayQuery, bounds: CityBounds, search: string, cursors: Record<string, string | null> = {}, includeMobility = true, cities: DirectoryCity[] = HOME_CITIES) {
  const root = filter === ALL_QUERY || (!filter.publicOnly && !filter.mobilityOnly && filter.kinds.length > 1 && filter.kinds.length === ALL_QUERY.kinds.length);
  const requests: Promise<{ key: string; items: DirectoryEntity[]; cursor: string | null }>[] = filter.kinds.filter(kind => !(kind in cursors) || cursors[kind] !== null).map(async kind => {
    const params = new URLSearchParams({ min_lat: String(bounds.minLat), max_lat: String(bounds.maxLat), min_lng: String(bounds.minLng), max_lng: String(bounds.maxLng), limit: "30" });
    for (const key of ["root", "property_type", "job_type", "service_type"] as const) if (filter[key]) params.set(key, filter[key]!);
    if (filter.subcategories?.length) params.set("subcategories", filter.subcategories.join(","));
    if (filter.themes?.length) params.set("themes", filter.themes.join(","));
    if (search.trim()) params.set("q", search.trim());
    if (cursors[kind]) params.set("cursor", cursors[kind]!);
    const page = await apiRequest<{ items: DirectoryEntity[]; next_cursor: string | null }>(`/public-directory/${kind}?${params}`, "GET");
    return { key: kind, items: page.items, cursor: page.next_cursor };
  });
  if ((root || filter.publicOnly)) {
    // One map, every area: fan the directory out to each city in scope.
    // Cursor keys stay namespaced per city so pagination never mixes scopes.
    for (const city of cities) {
      const key = cities.length > 1 ? `public_service:${city.cityId}` : "public_service";
      if (key in cursors && cursors[key] === null) continue;
      requests.push((async () => {
        const page = await getPublicServices({ countryCode: city.countryCode, cityId: city.cityId, categoryId: filter.publicCategory, bounds, q: search, cursor: cursors[key] || undefined });
        return { key, cursor: page.next_cursor, items: page.items.map(publicService => ({ id: publicService.service_id, type: "public_service" as const, title: publicService.name, address: publicService.address, latitude: publicService.latitude, longitude: publicService.longitude, description: publicService.description_el, publicService })) };
      })());
    }
  }
  if (includeMobility && (root || filter.mobilityOnly) && !("mobility" in cursors)) requests.push((async () => {
    const [vehicles, stops] = await Promise.all([getLiveVehicles(null), getTransitStops(null)]);
    const items: DirectoryEntity[] = [...vehicles.map(v => ({ id: `mobility:${v.vehicle_id}`, type: v.mode, title: `${v.mode} ${v.display_route_number || v.route_number || v.name}`, latitude: v.latitude, longitude: v.longitude,
      description: v.route_direction, facts: { source: v.position_source || "", updated_at: v.updated_at, assurance: v.estimated ? "Εκτιμώμενη θέση — όχι μετρημένο GPS" : (v.position_quality || "") } })),
      ...stops.map(s => ({ id: `stop:${s.stop_id}`, type: "stop" as const, title: s.name, latitude: s.latitude, longitude: s.longitude, facts: { routes: s.routes.map(r => r.route_number).join(", ") } }))];
    return { key: "mobility", cursor: null, items: items.filter(r => (!filter.mobilityMode || r.type === filter.mobilityMode) && r.latitude != null && r.longitude != null && r.latitude >= bounds.minLat && r.latitude <= bounds.maxLat && r.longitude >= bounds.minLng && r.longitude <= bounds.maxLng && (!search || r.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))) };
  })());
  const settled = await Promise.allSettled(requests);
  const items: DirectoryEntity[] = []; const next = { ...cursors }; let failures = 0;
  settled.forEach(result => { if (result.status === "fulfilled") { items.push(...result.value.items); next[result.value.key] = result.value.cursor; } else failures++; });
  if (failures === requests.length && requests.length) throw new Error("Αδυναμία φόρτωσης δημόσιων αποτελεσμάτων.");
  return { items: [...new Map(items.map(item => [`${item.type}:${item.id}`, item])).values()], cursors: next, partial: failures > 0 };
}

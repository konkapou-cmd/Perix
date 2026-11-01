import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import BusinessMap from "../BusinessMap";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, CategoryGroup } from "../../lib/api/core";
import { getLiveVehicles, getTransitStops, TransitStopMarker, LiveVehicle, searchPlaces } from "../../lib/api/mobility";
import { translateCategory } from "../../lib/categoryTranslation";
import { getPublicServiceTaxonomy, CityBounds, MAGDEBURG_BOUNDS, PublicServiceCategory, PUBLIC_SERVICE_THEME as theme } from "../../lib/city/publicServices";
import { ALL_QUERY, DirectoryEntity, gatewayCategories, GatewayNode } from "../../lib/city/gateway";
import { useCityDiscovery } from "../../hooks/city/useCityDiscovery";
import CityInlineDetails from "./CityInlineDetails";
import PerixLogo from "../brand/PerixLogo";
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from "../../lib/designTokens";
import { gatewayEntityColor, gatewayNodeColor, GATEWAY_ENTITY_COLORS } from "../../lib/city/presentation";
import { CATEGORY_COLORS } from "../../lib/categoryIcons";import { confirmedEmpty, localizeGatewayNodes } from "../../lib/city/localization";
import { CITY_ROOT_IDS } from "../../i18n/city";
import CityLanguagePicker from "./CityLanguagePicker";

const INITIAL_REGION = { latitude: 52.14, longitude: 11.635, latitudeDelta: 0.16, longitudeDelta: 0.23 };

export default function CityGatewayScreen({ initialRoot }: { initialRoot?: string }) {
  const { t, i18n } = useTranslation();
  const { t: city } = useTranslation("city");
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const { user, loading: authLoading } = useAuth();
  const { height, width } = useWindowDimensions();
  const [tree, setTree] = useState<CategoryGroup[]>([]);
  const [publicTree, setPublicTree] = useState<PublicServiceCategory | null>(null);
  const [taxonomyError, setTaxonomyError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [path, setPath] = useState<GatewayNode[]>([]);
  const [startRoot, setStartRoot] = useState(initialRoot);
  const [bounds, setBounds] = useState<CityBounds>(MAGDEBURG_BOUNDS);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DirectoryEntity | null>(null);
  const [detailBack, setDetailBack] = useState<DirectoryEntity[]>([]);
  // Live fleet, refreshed on the locator cadence. Directory results never
  // refetch for this: pins move without abrupt list/map reloads.
  const [liveVehicles, setLiveVehicles] = useState<LiveVehicle[]>([]);
  const [liveStops, setLiveStops] = useState<TransitStopMarker[]>([]);
  // Destination search (address/place/stop, not map-point bound): debounced,
  // stale-guarded, single dropdown. Selecting centers the same map.
  type PlaceSuggestion = { id: string; title: string; sub?: string | null; latitude: number; longitude: number; kind: string };
  const [destination, setDestination] = useState<PlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) { setSuggestions([]); setSuggesting(false); return; }
    let active = true;
    setSuggesting(true);
    const timer = setTimeout(() => {
      searchPlaces(null, q).then(res => {
        if (!active) return;
        const items: PlaceSuggestion[] = [
          ...(res.places || []).filter(p => p.lat != null && p.lng != null).map(p => ({ id: `place:${p.name}:${p.lat},${p.lng}`, title: p.name, sub: p.address ?? null, latitude: p.lat as number, longitude: p.lng as number, kind: "place" })),
          ...(res.stops || []).filter(p => p.lat != null && p.lng != null).map(p => ({ id: `stopplace:${p.stop_id}`, title: p.name, sub: null, latitude: p.lat as number, longitude: p.lng as number, kind: "stop" })),
          ...(res.streets || []).filter(p => p.lat != null && p.lng != null).map(p => ({ id: `street:${p.name}`, title: p.name, sub: p.address ?? null, latitude: p.lat as number, longitude: p.lng as number, kind: "street" })),
        ];
        setSuggestions(items.slice(0, 8));
        setSuggesting(false);
      }).catch(() => { if (active) { setSuggestions([]); setSuggesting(false); } });
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  useEffect(() => {
    let active = true;
    const load = () => {
      getLiveVehicles(null).then(v => { if (active) setLiveVehicles(v || []); }).catch(() => {});
    };
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    getTransitStops(null).then(s => { if (active) setLiveStops(s || []); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const categories = useMemo(() => localizeGatewayNodes(gatewayCategories(tree, publicTree, slug => translateCategory(slug, t), language), t, city), [tree, publicTree, t, city, language]);
  const rootNode = startRoot ? categories.find(c => c.id === startRoot) : undefined;
  const resolvedPath: GatewayNode[] = [];
  let current = rootNode;
  let branch = rootNode?.children || categories;
  for (const saved of path) {
    current = branch.find(node => node.id === saved.id) || saved;
    resolvedPath.push(current);
    branch = current.children || [];
  }
  const discovery = useCityDiscovery(current?.query || ALL_QUERY, bounds, search);
  const empty = !!current && confirmedEmpty(discovery);
  const rootId = current?.query.publicCategory?.startsWith("ps:sos") ? "sos" : startRoot || resolvedPath[0]?.id;
  const emptyIndex = Math.max(0, CITY_ROOT_IDS.indexOf(rootId as typeof CITY_ROOT_IDS[number]));
  const allCategories = () => { setPath([]); setStartRoot(undefined); };
  const back = () => { if (path.length) setPath(path.slice(0, -1)); else setStartRoot(undefined); };
  useEffect(() => {
    let active = true;
    setTaxonomyError(false);
    Promise.allSettled([apiRequest<{ categories: CategoryGroup[] }>("/businesses/category-tree", "GET"), getPublicServiceTaxonomy()]).then(([businesses, services]) => {
      if (!active) return;
      if (businesses.status === "fulfilled") setTree(businesses.value.categories);
      if (services.status === "fulfilled") setPublicTree(services.value);
      setTaxonomyError(businesses.status === "rejected" || services.status === "rejected");
    });
    return () => { active = false; };
  }, [retry]);
  // Keep the actual map node and initial camera stable through all filter changes.
  // Directory pins exclude live fleet/stops: vehicles refresh on their own
  // poll while stops render as zoom-aware transit pins, like the main map.
  const inBounds = useCallback((lat?: number | null, lng?: number | null) =>
    lat != null && lng != null && lat >= bounds.minLat && lat <= bounds.maxLat
      && lng >= bounds.minLng && lng <= bounds.maxLng, [bounds]);
  const placeMarkers = useMemo(() => discovery.items.filter(r => r.type !== "bus" && r.type !== "tram" && r.type !== "taxi" && r.type !== "stop")
    .filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map(r => ({ id: `${r.type}:${r.id}`, latitude: r.latitude!, longitude: r.longitude!, title: r.title,
      type: (["business", "event", "activity", "job", "rental", "product", "home", "service"].includes(r.type) ? r.type : "rental") as "service",
      pinColor: gatewayEntityColor(r) })), [discovery.items]);
  const vehicleMarkers = useMemo(() => liveVehicles
    .filter(v => v.latitude != null && v.longitude != null && inBounds(v.latitude, v.longitude) && (v.mode === "bus" || v.mode === "tram" || v.mode === "taxi"))
    .map(v => ({ id: `mobility:${v.vehicle_id}`, latitude: v.latitude!, longitude: v.longitude!, title: `${v.mode} ${v.route_number || v.name}`,
      type: v.mode as "bus" | "tram" | "taxi", pinColor: GATEWAY_ENTITY_COLORS[v.mode] ?? "#216BA2" })), [liveVehicles, inBounds]);
  const markers = useMemo(() => [...placeMarkers, ...vehicleMarkers], [placeMarkers, vehicleMarkers]);
  const transitStops = useMemo(() => liveStops
    .filter(s => s.latitude != null && s.longitude != null && inBounds(s.latitude, s.longitude))
    .map(s => {
      const routes = (s.routes || []).filter(r => r.mode === "bus" || r.mode === "tram");
      const modes = Array.from(new Set(routes.map(r => r.mode))) as ("bus" | "tram")[];
      return { stop_id: String(s.stop_id), name: s.name, latitude: s.latitude!, longitude: s.longitude!,
        modes: modes.length ? modes : (["bus"] as ("bus" | "tram")[]),
        routes: routes.map(r => ({ route_number: r.route_number, mode: r.mode as "bus" | "tram" })) };
    }), [liveStops, inBounds]);
  const onBounds = useCallback((next: CityBounds) => {
    if (![next.minLat, next.maxLat, next.minLng, next.maxLng].every(Number.isFinite)) return;
    setBounds(prev => Object.keys(prev).every(key => Math.abs(prev[key as keyof CityBounds] - next[key as keyof CityBounds]) < 0.000001) ? prev : next);
  }, []);
  const select = (entity: DirectoryEntity) => { setSelected(entity); setDetailBack([]); };
  const selectDestination = useCallback((s: PlaceSuggestion) => {
    setDestination(s);
    setSuggestions([]);
    setFocusToken(t => t + 1);
  }, []);
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const destinationInfo = useMemo(() => {
    if (!destination) return null;
    const R = 6371000;
    const toRad = (d: number) => d * Math.PI / 180;
    const a = Math.sin(toRad(destination.latitude - centerLat) / 2) ** 2
      + Math.cos(toRad(centerLat)) * Math.cos(toRad(destination.latitude)) * Math.sin(toRad(destination.longitude - centerLng) / 2) ** 2;
    const meters = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    let best: typeof transitStops[number] | null = null;
    let bestD = Infinity;
    for (const s of transitStops) {
      const dLa = (s.latitude - destination.latitude) * 111320;
      const dLo = (s.longitude - destination.longitude) * 111320 * Math.cos(toRad(destination.latitude));
      const d = Math.hypot(dLa, dLo);
      if (d < bestD) { bestD = d; best = s; }
    }
    const lines = best && bestD <= 600 ? best.routes.map(r => r.route_number) : [];
    return { meters, lines, stopName: best && bestD <= 600 ? best.name : null };
  }, [destination, centerLat, centerLng, transitStops]);
  const selectLive = useCallback((id: string) => {
    const v = liveVehicles.find(x => `mobility:${x.vehicle_id}` === id);
    if (v && v.latitude != null && v.longitude != null) {
      select({ id: `mobility:${v.vehicle_id}`, type: v.mode as DirectoryEntity["type"],
        title: `${v.mode} ${v.route_number || v.name}`, description: v.route_direction || undefined,
        latitude: v.latitude, longitude: v.longitude } as DirectoryEntity);
    }
  }, [liveVehicles]);
  const choose = (node: GatewayNode) => {
    if (node.action === "login") { if (!authLoading) router.push((user ? "/home" : "/login") as never); return; }
    setPath([...resolvedPath, node]);
  };
  const columns = width > 1100 ? 4 : width > 760 ? 3 : 2;
  const compact = height < 500;
  const headerHeight = compact ? 64 : 84;
  const mapHeight = Math.max(110, (height - headerHeight) * (compact ? 0.42 : 0.54));
  return <View style={styles.page}>
    <View style={[styles.headerRow, { height: headerHeight }]}>
      <View testID="city-centered-brand" style={styles.headerBrand}><PerixLogo size="compact" /><Text style={styles.city}>Magdeburg, {city("ui.country")}</Text></View>
      <View style={styles.headerLanguage}><CityLanguagePicker /></View>
    </View>
    <ScrollView style={styles.lower} contentContainerStyle={styles.content}>
      <View testID="city-search-bar" style={styles.searchBar}>
        <Ionicons name="search-outline" size={21} color={theme.blue} />
        <TextInput value={search} onChangeText={t => { setSearch(t); setDestination(null); }} accessibilityLabel={city("ui.search")} placeholder={city("ui.search")} placeholderTextColor={COLORS.textMuted} style={styles.input} />
        {!!search && <Pressable accessibilityRole="button" accessibilityLabel={city("ui.clear")} style={styles.clearSearch} onPress={() => { setSearch(""); setDestination(null); setSuggestions([]); }}><Ionicons name="close" size={20} color={theme.blue} /></Pressable>}
      </View>
      {suggesting && <Text style={styles.hint}>…</Text>}
      {suggestions.length > 0 && <View testID="city-suggestions" style={styles.result}>
        {suggestions.map(s => (
          <Pressable key={s.id} accessibilityRole="button" onPress={() => selectDestination(s)} style={styles.suggestion}>
            <Ionicons name={s.kind === "stop" ? "train-outline" : s.kind === "street" ? "navigate-outline" : "location-outline"} size={18} color={theme.blue} />
            <View style={styles.suggestionText}><Text style={styles.tileTitle}>{s.title}</Text>{!!s.sub && <Text style={styles.note} numberOfLines={1}>{s.sub}</Text>}</View>
          </Pressable>))}
      </View>}
      {destination && destinationInfo && <View testID="city-destination" style={styles.result}>
        <Text style={styles.tileTitle}>{destination.title}</Text>
        <Text style={styles.note}>≈ {(destinationInfo.meters / 1000).toFixed(1).replace(".", ",")} km{destinationInfo.lines.length > 0 ? ` · ${destinationInfo.lines.join(" · ")}` : ""}</Text>
        {destinationInfo.stopName ? <Text style={styles.hint}>{destinationInfo.stopName}</Text> : null}
      </View>}
      <View testID="city-map-frame" style={{ height: mapHeight, flexShrink: 0, marginTop: 12 }}>
        <BusinessMap initialRegion={INITIAL_REGION} markers={markers} height={mapHeight} showUserLocation={false}
          transitStops={transitStops}
          focusRegion={destination ? { latitude: destination.latitude, longitude: destination.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 } : undefined}
          focusToken={focusToken}
          pinLocation={destination ? { latitude: destination.latitude, longitude: destination.longitude } : null}
          onRegionChangeComplete={onBounds} onMarkerPress={id => { const entity = discovery.items.find(r => `${r.type}:${r.id}` === id); if (entity) select(entity); else selectLive(id); }}
          onTransitStopPress={s => { const entity = discovery.items.find(r => r.type === "stop" && r.id === `stop:${s.stop_id}`); if (entity) select(entity); }} />
        <View testID="city-map-border" pointerEvents="none" style={styles.mapBorder} />
      </View>
      {current && <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={city("ui.back")} style={styles.button} onPress={back}><Text style={styles.blue}>← {city("ui.back")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={city("ui.all")} style={styles.button} onPress={allCategories}><Ionicons name="grid-outline" size={19} color={theme.blue} /></Pressable>
        {resolvedPath.map((node, i) => <Pressable key={`${i}:${node.id}`} accessibilityRole="button" style={styles.button} onPress={() => setPath(resolvedPath.slice(0, i + 1))}><Text style={styles.blue}>› {node.label}</Text></Pressable>)}
        {resolvedPath.length === 0 && <Text style={styles.tileTitle}>{current.label}</Text>}
      </View>}
      {current?.query.publicCategory?.startsWith("ps:sos") && <View style={styles.result}>
        <Text style={styles.tileTitle}>{city("ui.sosHeading")}</Text>
        {[["112", city("ui.sosRescue")], ["110", city("ui.sosPolice")], ["116117", city("ui.sosMedical")]].map(([number, label]) =>
          <Pressable key={number} accessibilityRole="link" accessibilityLabel={`${city("ui.call")} ${number}: ${label}`} style={styles.button} onPress={() => { void Linking.openURL(`tel:${number}`).catch(() => {}); }}><Text style={styles.blue}>{number} — {label}</Text></Pressable>)}
        <Text style={styles.hint}>{city("ui.sosNote")}</Text>
      </View>}
      {taxonomyError && <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry(n => n + 1)}><Text>{city("ui.taxonomyError")} {city("ui.retry")}</Text></Pressable>}
      {(!current || (!discovery.loading && !empty)) && <View testID="city-category-grid" style={styles.grid}>{(current?.children || (current ? [] : categories)).map(node => <View key={node.id} style={{ width: `${100 / columns}%`, padding: 4 }}>
        <Pressable accessibilityRole="button" disabled={node.action === "login" && authLoading} accessibilityLabel={node.label} style={styles.tile} onPress={() => choose(node)}>
          <Ionicons name={node.icon as keyof typeof Ionicons.glyphMap} size={24} color={CATEGORY_COLORS[node.id] ?? gatewayNodeColor(node)} />
          <Text style={styles.tileTitle}>{node.label}</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.gold} style={styles.chevron} />
        </Pressable>
      </View>)}</View>}
      {(discovery.items.length > 0 || discovery.hasMore) && <View style={styles.row}><Text style={styles.note}>{city("ui.counts", { results: discovery.items.length, pins: markers.length })}</Text><Pressable accessibilityRole="button" style={styles.button} onPress={discovery.retry}><Text style={styles.blue}>{city("ui.refresh")}</Text></Pressable></View>}
      {discovery.loading && <ActivityIndicator color={theme.blue} accessibilityLabel={city("ui.loading")} />}
      {(discovery.error || discovery.partial) && <Pressable accessibilityRole="button" style={styles.button} onPress={discovery.retry}><Text>{city(discovery.error ? `ui.${discovery.error}` : "ui.partialError")} {city("ui.retry")}</Text></Pressable>}
      {empty && <View testID="city-empty-state" accessibilityLiveRegion="polite" style={styles.emptyState}><Ionicons name="time-outline" size={26} color={theme.blue} /><Text style={styles.emptyText}>{city(`empty.${emptyIndex}`)}</Text></View>}
      {discovery.items.map(entity => <Pressable key={`${entity.type}:${entity.id}`} accessibilityRole="button" onPress={() => select(entity)} style={[styles.result, { borderLeftWidth: 3, borderLeftColor: gatewayEntityColor(entity) }]}>
        <Text style={styles.tileTitle}>{entity.title}</Text><Text style={styles.note}>{entity.address || entity.description?.slice(0, 130) || entity.type}</Text>
        {entity.latitude == null && <Text style={styles.hint}>{city("ui.noCoordinates")}</Text>}
      </Pressable>)}
      {discovery.hasMore && <Pressable disabled={discovery.loading} accessibilityRole="button" style={styles.button} onPress={discovery.more}><Text style={styles.blue}>{city("ui.more")}</Text></Pressable>}
      {current?.query.mobilityOnly && <Text style={styles.hint}>{city("ui.mobilityNote")}</Text>}
    </ScrollView>
    <Modal visible={selected !== null} transparent animationType="none" onRequestClose={() => setSelected(null)}>
      <View style={styles.scrim}><View accessibilityViewIsModal style={[styles.drawer, { width: Math.min(width, 620) }]}>
        <View style={styles.row}>
          {detailBack.length > 0 && <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setSelected(detailBack[detailBack.length - 1]); setDetailBack(detailBack.slice(0, -1)); }}><Text style={styles.blue}>← {city("ui.back")}</Text></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={city("ui.close")} style={styles.button} onPress={() => setSelected(null)}><Text style={styles.blue}>{city("ui.close")} ✕</Text></Pressable>
        </View>
        <ScrollView>{selected && <CityInlineDetails entity={selected} bounds={bounds} onSelect={entity => { setDetailBack([...detailBack, selected]); setSelected(entity); }} />}</ScrollView>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: "#fff" }, headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, flexShrink: 0, backgroundColor: "#fff" },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  headerLanguage: { justifyContent: "center", flexShrink: 0 },
  city: { color: theme.navy, fontSize: FONT_SIZES.micro, lineHeight: 14 }, lower: { flex: 1, minHeight: 0 }, content: { padding: 16, gap: 8, maxWidth: 1280, width: "100%", alignSelf: "center" },
  mapBorder: { position: "absolute", top: 0, bottom: 0, left: 16, right: 16, borderWidth: 1, borderColor: COLORS.divider, borderRadius: BORDER_RADIUS.md },
  heading: { color: theme.navy, fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold }, note: { color: "#59616A", fontSize: FONT_SIZES.bodySmall, lineHeight: 22 }, hint: { color: "#59616A", fontSize: FONT_SIZES.small, lineHeight: 18 }, blue: { color: theme.blue },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }, button: { minHeight: 44, padding: 8, justifyContent: "center" }, suggestion: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }, suggestionText: { flex: 1, minWidth: 0, gap: 2 }, grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  tile: { minHeight: 96, padding: 16, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.background, ...SHADOWS.subtle, gap: 8 }, tileTitle: { color: theme.navy, fontWeight: FONT_WEIGHTS.semibold, fontSize: FONT_SIZES.bodySmall }, chevron: { position: "absolute", top: 18, right: 12 },
  searchBar: { height: 48, flexShrink: 0, marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.background, ...SHADOWS.subtle },
  input: { flex: 1, minWidth: 0, height: 44, paddingRight: 12, fontSize: FONT_SIZES.bodySmall, color: theme.navy }, clearSearch: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  result: { padding: 16, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.background, ...SHADOWS.subtle, gap: 6 },
  emptyState: { padding: 24, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.background, ...SHADOWS.subtle, alignItems: "center", gap: 12 }, emptyText: { color: theme.navy, fontSize: FONT_SIZES.bodySmall, lineHeight: 24, textAlign: "center" },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "flex-end", justifyContent: "flex-end" }, drawer: { maxHeight: "92%", backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 20 },
});

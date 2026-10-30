import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import BusinessMap from "../BusinessMap";
import { useAuth } from "../../context/AuthContext";
import { apiRequest, CategoryGroup } from "../../lib/api/core";
import { translateCategory } from "../../lib/categoryTranslation";
import { getPublicServiceTaxonomy, CityBounds, MAGDEBURG_BOUNDS, PublicServiceCategory, PUBLIC_SERVICE_THEME as theme } from "../../lib/city/publicServices";
import { ALL_QUERY, DirectoryEntity, gatewayCategories, GatewayNode } from "../../lib/city/gateway";
import { useCityDiscovery } from "../../hooks/city/useCityDiscovery";
import CityInlineDetails from "./CityInlineDetails";
import PerixLogo from "../brand/PerixLogo";
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";
import { gatewayEntityColor, gatewayNodeColor } from "../../lib/city/presentation";
import { confirmedEmpty, localizeGatewayNodes } from "../../lib/city/localization";
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
  const markers = useMemo(() => discovery.items.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map(r => ({ id: `${r.type}:${r.id}`, latitude: r.latitude!, longitude: r.longitude!, title: r.title,
      type: (["bus", "tram", "taxi", "business", "event", "activity", "job", "rental", "service", "product"].includes(r.type) ? r.type : r.type === "home" ? "rental" : "service") as "service",
      pinColor: gatewayEntityColor(r) })), [discovery.items]);
  const onBounds = useCallback((next: CityBounds) => {
    if (![next.minLat, next.maxLat, next.minLng, next.maxLng].every(Number.isFinite)) return;
    setBounds(prev => Object.keys(prev).every(key => Math.abs(prev[key as keyof CityBounds] - next[key as keyof CityBounds]) < 0.000001) ? prev : next);
  }, []);
  const select = (entity: DirectoryEntity) => { setSelected(entity); setDetailBack([]); };
  const choose = (node: GatewayNode) => {
    if (node.action === "login") { if (!authLoading) router.push((user ? "/home" : "/login") as never); return; }
    setPath([...resolvedPath, node]);
  };
  const columns = width > 1100 ? 4 : width > 760 ? 3 : 2;
  const compact = height < 500;
  const headerHeight = compact ? 64 : 84;
  const mapHeight = Math.max(110, (height - headerHeight) * (compact ? 0.42 : 0.54));
  return <View style={styles.page}>
    <View style={[styles.header, { height: headerHeight }]}>
      <View testID="city-centered-brand" style={styles.headerCenter}><PerixLogo size={compact ? "header" : "gateway"} /><Text style={styles.city}>Magdeburg, {city("ui.country")}</Text></View>
      <View style={[styles.headerLanguage, { marginLeft: compact ? 74 : 100 }]}><CityLanguagePicker /></View>
    </View>
    <View testID="city-search-bar" style={styles.searchBar}>
      <Ionicons name="search-outline" size={21} color={theme.blue} />
      <TextInput value={search} onChangeText={setSearch} accessibilityLabel={city("ui.search")} placeholder={city("ui.search")} placeholderTextColor={COLORS.textMuted} style={styles.input} />
      {!!search && <Pressable accessibilityRole="button" accessibilityLabel={city("ui.clear")} style={styles.clearSearch} onPress={() => setSearch("")}><Ionicons name="close" size={20} color={theme.blue} /></Pressable>}
    </View>
    <View testID="city-map-frame" style={{ height: mapHeight, flexShrink: 0, marginTop: 12 }}>
      <BusinessMap initialRegion={INITIAL_REGION} markers={markers} height={mapHeight} showUserLocation={false}
        onRegionChangeComplete={onBounds} onMarkerPress={id => { const entity = discovery.items.find(r => `${r.type}:${r.id}` === id); if (entity) select(entity); }} />
      <View testID="city-map-border" pointerEvents="none" style={styles.mapBorder} />
    </View>
    <ScrollView style={styles.lower} contentContainerStyle={styles.content}>
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
          <Ionicons name={node.icon as keyof typeof Ionicons.glyphMap} size={24} color={gatewayNodeColor(node)} />
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
  page: { flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: "#fff" }, header: { flexShrink: 0, backgroundColor: "#fff" },
  headerCenter: { position: "absolute", left: 60, right: 60, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  headerLanguage: { position: "absolute", left: "50%", top: 0, bottom: 0, justifyContent: "center" },
  city: { color: theme.navy, fontSize: FONT_SIZES.micro, lineHeight: 14 }, lower: { flex: 1, minHeight: 0 }, content: { padding: 16, gap: 8, maxWidth: 1200, width: "100%", alignSelf: "center" },
  mapBorder: { position: "absolute", top: 0, bottom: 0, left: 16, right: 16, borderWidth: 2, borderColor: COLORS.pinHotel, borderRadius: BORDER_RADIUS.md },
  heading: { color: theme.navy, fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold }, note: { color: "#59616A", fontSize: FONT_SIZES.bodySmall, lineHeight: 22 }, hint: { color: "#59616A", fontSize: FONT_SIZES.small, lineHeight: 18 }, blue: { color: theme.blue },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }, button: { minHeight: 44, padding: 8, justifyContent: "center" }, grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  tile: { minHeight: 96, padding: 16, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1.5, borderColor: COLORS.pinHotel, gap: 8 }, tileTitle: { color: theme.navy, fontWeight: FONT_WEIGHTS.semibold, fontSize: FONT_SIZES.bodySmall }, chevron: { position: "absolute", top: 18, right: 12 },
  searchBar: { height: 48, flexShrink: 0, marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12, borderWidth: 1.5, borderColor: COLORS.pinHotel, borderRadius: 16, backgroundColor: "#fff" },
  input: { flex: 1, minWidth: 0, height: 44, paddingRight: 12, fontSize: FONT_SIZES.bodySmall, color: theme.navy }, clearSearch: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  result: { padding: 16, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.pinHotel, backgroundColor: "#fff", gap: 6 },
  emptyState: { padding: 24, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.pinHotel, backgroundColor: "#fff", alignItems: "center", gap: 12 }, emptyText: { color: theme.navy, fontSize: FONT_SIZES.bodySmall, lineHeight: 24, textAlign: "center" },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "flex-end", justifyContent: "flex-end" }, drawer: { maxHeight: "92%", backgroundColor: "#fff", padding: 16, borderTopLeftRadius: 20 },
});

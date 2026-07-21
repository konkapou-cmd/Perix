import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { getListings, Listing, ListingDiscoveryQuery } from "../../lib/api/listings";
import { pushEntityRoute, entityRoutes } from "../../lib/navigation/entityRoutes";
import { getCategoryConfig, getCategoryAttributes } from "../../lib/marketplace/marketplaceTaxonomy";
import DiscoveryHeader from "../../components/discovery/DiscoveryHeader";
import DiscoverySearch from "../../components/discovery/DiscoverySearch";
import DiscoveryFilterChips, { FilterChip } from "../../components/discovery/DiscoveryFilterChips";
import DiscoveryMap, { DiscoveryMapMarker } from "../../components/discovery/DiscoveryMap";
import DiscoveryResults from "../../components/discovery/DiscoveryResults";
import DiscoveryEmptyState from "../../components/discovery/DiscoveryEmptyState";
import MarketplaceCategoryFilter from "../../components/marketplace/MarketplaceCategoryFilter";
import MarketplaceAttributeFilters from "../../components/marketplace/MarketplaceAttributeFilters";

const CONDITION_OPTIONS = [
  { key: "new", label: "Neu" },
  { key: "like_new", label: "Wie neu" },
  { key: "good", label: "Gut" },
  { key: "used", label: "Gebraucht" },
];

export default function MarketplaceItemsPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [activeConditions, setActiveConditions] = useState<string[]>([]);
  const [pickupOnly, setPickupOnly] = useState(false);
  const [shippingOnly, setShippingOnly] = useState(false);
  const [attributeFilters, setAttributeFilters] = useState<Record<string, string>>({});
  const [draftAttributeFilters, setDraftAttributeFilters] = useState<Record<string, string>>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);
  const [categoryFilterVisible, setCategoryFilterVisible] = useState(false);
  const skipRef = useRef(0);
  const attrTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      for (const t of attrTimeoutsRef.current.values()) clearTimeout(t);
    };
  }, []);

  const handleAttrChange = useCallback(
    (key: string, value: string) => {
      setDraftAttributeFilters((prev) => {
        const next = { ...prev };
        if (value) next[key] = value;
        else delete next[key];
        return next;
      });

      const existing = attrTimeoutsRef.current.get(key);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(() => {
        setAttributeFilters((prev) => {
          const next = { ...prev };
          if (value) next[key] = value;
          else delete next[key];
          return next;
        });
        attrTimeoutsRef.current.delete(key);
      }, 300);

      attrTimeoutsRef.current.set(key, timeout);
    },
    [],
  );

  const pruneFilters = useCallback((filters: Record<string, string>, validKeys: Set<string>) =>
    Object.fromEntries(
      Object.entries(filters).filter(([k]) => validKeys.has(k)),
    ),
  []);

  const fetchListings = useCallback(async (reset = false) => {
    setLoading(true);
    const query: ListingDiscoveryQuery = {
      listingType: "product",
      search: search || undefined,
      category: category || undefined,
      subcategory: subcategory || undefined,
      conditions: activeConditions.length > 0 ? activeConditions : undefined,
      pickupAvailable: pickupOnly || undefined,
      shippingAvailable: shippingOnly || undefined,
      attributeFilters: Object.keys(attributeFilters).length > 0 ? attributeFilters : undefined,
      skip: reset ? 0 : skipRef.current,
      limit: 50,
    };
    if (bounds) Object.assign(query, bounds);
    try {
      const data = await getListings(query);
      setListings(reset ? data : (prev) => [...prev, ...data]);
      if (reset) skipRef.current = data.length;
      else skipRef.current += data.length;
    } catch {}
    setLoading(false);
  }, [search, category, subcategory, activeConditions, pickupOnly, shippingOnly, attributeFilters, bounds]);

  useEffect(() => { fetchListings(true); }, [fetchListings]);

  const markers: DiscoveryMapMarker[] = useMemo(
    () =>
      listings.filter((l) => l.latitude != null && l.longitude != null).map((l) => ({
        id: l.listing_id, latitude: l.latitude!, longitude: l.longitude!,
        title: l.title, color: COLORS.success,
      })),
    [listings],
  );

  const conditionChips: FilterChip[] = useMemo(
    () => CONDITION_OPTIONS.map((c) => ({
      key: c.key,
      label: t(`listing.condition.${c.key}`, c.label),
      active: activeConditions.includes(c.key),
    })),
    [activeConditions, t],
  );

  const deliveryChips: FilterChip[] = useMemo(() => [
    { key: "pickup", label: t("marketplace.pickup", "Abholung"), active: pickupOnly },
    { key: "shipping", label: t("marketplace.shipping", "Versand"), active: shippingOnly },
  ], [pickupOnly, shippingOnly, t]);

  const handleMarkerPress = (id: string) => pushEntityRoute(router, entityRoutes.listing(id), () => {});
  const handleCardPress = (listing: Listing) => pushEntityRoute(router, entityRoutes.listing(listing.listing_id), () => {});

  const catConfig = category ? getCategoryConfig(category) : null;
  const subLabel = subcategory && catConfig ? catConfig.subcategories.find((s) => s.key === subcategory)?.fallback : "";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <DiscoveryHeader
        title={t("marketplace.title", "Marktplatz")}
        tab="items"
        onBack={() => router.back()}
        onTabChange={(tab) => tab === "homes" && router.replace("/marketplace/homes")}
        onMyListings={() => router.push("/my-listings" as any)}
      />
      <DiscoverySearch
        value={search}
        onChangeText={setSearch}
        placeholder={t("marketplace.searchItems", "Artikel durchsuchen...")}
      />
      {/* Category filter button */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterBtn, category ? styles.filterBtnActive : undefined]}
          onPress={() => setCategoryFilterVisible(true)}
        >
          <Ionicons name="options-outline" size={16} color={category ? COLORS.background : COLORS.textPrimary} />
          <Text style={[styles.filterBtnText, category ? { color: COLORS.background } : undefined]}>
            {category
              ? `Kategorie · ${catConfig ? t(catConfig.labelKey, catConfig.fallback) : category}${subLabel ? ` · ${t(catConfig?.subcategories.find((s) => s.key === subcategory)?.labelKey ?? "", subLabel)}` : ""}`
              : t("marketplace.category", "Kategorie")}
          </Text>
        </Pressable>
      </View>
      <MarketplaceCategoryFilter
        visible={categoryFilterVisible}
        category={category}
        subcategory={subcategory}
        onApply={(cat, sub) => {
          const validKeys = new Set(
            getCategoryAttributes(cat, sub || undefined)
              .filter((a) => a.filterable)
              .map((a) => a.key),
          );
          for (const t of attrTimeoutsRef.current.values()) clearTimeout(t);
          attrTimeoutsRef.current.clear();
          const pruned = pruneFilters(attributeFilters, validKeys);
          const prunedDraft = pruneFilters(draftAttributeFilters, validKeys);
          setDraftAttributeFilters(prunedDraft);
          setAttributeFilters(pruned);
          setCategory(cat);
          setSubcategory(sub);
        }}
        onClose={() => setCategoryFilterVisible(false)}
      />
      <MarketplaceAttributeFilters
        category={category}
        subcategory={subcategory}
        filters={draftAttributeFilters}
        onChange={handleAttrChange}
      />
      <DiscoveryFilterChips
        chips={conditionChips}
        onToggle={(k) => setActiveConditions((prev) => prev.includes(k) ? prev.filter((c) => c !== k) : [...prev, k])}
      />
      <DiscoveryFilterChips
        chips={deliveryChips}
        onToggle={(k) => {
          if (k === "pickup") setPickupOnly(!pickupOnly);
          if (k === "shipping") setShippingOnly(!shippingOnly);
        }}
      />
      <DiscoveryMap markers={markers} onMarkerPress={handleMarkerPress} onViewportChange={setBounds} />
      {loading && listings.length === 0 ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : listings.length === 0 ? (
        <DiscoveryEmptyState type="no-results" />
      ) : (
        <DiscoveryResults
          listings={listings}
          onPressItem={handleCardPress}
          ListHeaderComponent={
            <Text style={styles.resultCount}>
              {t("marketplace.results", "{{count}} Ergebnisse", { count: listings.length })}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  filterRow: {
    flexDirection: "row", paddingHorizontal: SPACING.std, paddingVertical: SPACING.small,
    backgroundColor: COLORS.background, gap: SPACING.small,
  },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundPage,
  },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterBtnText: { fontSize: 13, fontWeight: "600", color: COLORS.textPrimary },
  resultCount: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted, paddingVertical: SPACING.small },
});

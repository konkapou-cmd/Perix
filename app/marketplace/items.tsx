import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, FlatList, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { Listing, ListingDiscoveryQuery } from "../../lib/api/listings";
import { pushEntityRoute, entityRoutes } from "../../lib/navigation/entityRoutes";
import { getCategoryConfig, getCategoryAttributes } from "../../lib/marketplace/marketplaceTaxonomy";
import DiscoveryHeader from "../../components/discovery/DiscoveryHeader";
import DiscoverySearch from "../../components/discovery/DiscoverySearch";
import DiscoveryFilterChips, { FilterChip } from "../../components/discovery/DiscoveryFilterChips";
import DiscoveryMap, { DiscoveryMapMarker } from "../../components/discovery/DiscoveryMap";
import DiscoveryEmptyState from "../../components/discovery/DiscoveryEmptyState";
import MarketplaceCategoryFilter from "../../components/marketplace/MarketplaceCategoryFilter";
import MarketplaceAttributeFilters from "../../components/marketplace/MarketplaceAttributeFilters";
import { useViewportListings } from "../../hooks/marketplace/useViewportListings";
import { useMarketplaceInitialViewport } from "../../hooks/marketplace/useMarketplaceInitialViewport";
import { useMapBounds } from "../../context/MapBoundsContext";

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
  const [categoryFilterVisible, setCategoryFilterVisible] = useState(false);
  const attrTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const { setMapBounds } = useMapBounds();
  const viewport = useMarketplaceInitialViewport();

  const discoveryFilters = useMemo(() => ({
    search: search || undefined,
    category: category || undefined,
    subcategory: subcategory || undefined,
    conditions: activeConditions.length > 0 ? activeConditions : undefined,
    pickupAvailable: pickupOnly || undefined,
    shippingAvailable: shippingOnly || undefined,
    attributeFilters: Object.keys(attributeFilters).length > 0 ? attributeFilters : undefined,
  }), [search, category, subcategory, activeConditions, pickupOnly, shippingOnly, attributeFilters]);

  const {
    listings,
    visibleListings,
    loading,
    setVisibleBounds,
    setCommittedBounds,
  } = useViewportListings({
    listingType: "product",
    filters: discoveryFilters,
    limit: 100,
    initialBounds: viewport.initialBounds,
  });

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

  const markers: DiscoveryMapMarker[] = useMemo(
    () =>
      visibleListings.filter((l) => l.latitude != null && l.longitude != null).map((l) => ({
        id: l.listing_id, latitude: l.latitude!, longitude: l.longitude!,
        title: l.title, color: COLORS.success, type: "product",
      })),
    [visibleListings],
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

  const handleViewportChange = useCallback(
    (bnds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
      setVisibleBounds(bnds);
      setCommittedBounds(bnds);
      setMapBounds({
        minLat: bnds.minLat, maxLat: bnds.maxLat,
        minLng: bnds.minLng, maxLng: bnds.maxLng,
        centerLat: (bnds.minLat + bnds.maxLat) / 2,
        centerLng: (bnds.minLng + bnds.maxLng) / 2,
      });
    },
    [setVisibleBounds, setCommittedBounds, setMapBounds],
  );

  const renderCard = useCallback(({ item }: { item: Listing }) => {
    const img = item.cover_image_url || item.image_urls?.[0] || item.gallery_images?.[0];
    const addressLabel = item.location_visibility === "approximate"
      ? item.public_location_label || t("marketplace.approximateLocation", "Ungefahrer Standort")
      : item.address;
    return (
      <Pressable style={styles.card} onPress={() => handleCardPress(item)}>
        {img ? (
          <Image source={{ uri: img }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardPlaceholder]}>
            <Ionicons name="image-outline" size={28} color={COLORS.textDisabled} />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {item.price ? <Text style={styles.cardPrice}>{item.price}</Text> : null}
          {(item.business_name || item.seller_name) && (
            <Text style={styles.cardSeller} numberOfLines={1}>
              {item.business_name || item.seller_name}
            </Text>
          )}
          {addressLabel ? (
            <View style={styles.cardAddr}>
              <Ionicons name="location-outline" size={11} color={COLORS.textMuted} />
              <Text style={styles.cardAddrText} numberOfLines={1}>{addressLabel}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  }, [handleCardPress, t]);

  if (!viewport.ready) return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );

  if (viewport.needsLocation) return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <DiscoveryHeader
        title={t("marketplace.title", "Marktplatz")}
        tab="items"
        onBack={() => router.back()}
        onTabChange={(tab) => tab === "homes" && router.replace("/marketplace/homes")}
        onMyListings={() => router.push("/my-listings" as any)}
      />
      <DiscoveryEmptyState type="no-location" />
      <View style={styles.locationActions}>
        <Pressable
          style={styles.locationBtn}
          onPress={() => {
            import("expo-location").then((Location) => {
              Location.requestForegroundPermissionsAsync().then(({ status }) => {
                if (status === "granted") {
                  Location.getCurrentPositionAsync({}).then((loc) => {
                    const bnds = {
                      minLat: loc.coords.latitude - 0.045,
                      maxLat: loc.coords.latitude + 0.045,
                      minLng: loc.coords.longitude - 0.045,
                      maxLng: loc.coords.longitude + 0.045,
                      centerLat: loc.coords.latitude,
                      centerLng: loc.coords.longitude,
                    };
                    setMapBounds(bnds);
                    setVisibleBounds(bnds);
                    setCommittedBounds(bnds);
                  });
                }
              });
            });
          }}
        >
          <Ionicons name="navigate" size={18} color={COLORS.background} />
          <Text style={styles.locationBtnText}>{t("marketplace.useCurrentLocation", "Aktuellen Standort verwenden")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );

  const listHeader = useMemo(() => (
    <View>
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
      <DiscoveryMap markers={markers} initialLocation={viewport.initialLocation!} initialBounds={viewport.initialBounds} onMarkerPress={handleMarkerPress} onViewportChanging={setVisibleBounds} onViewportChange={handleViewportChange} />
      {visibleListings.length > 0 && (
        <Text style={styles.resultCount}>
          {t("marketplace.results", "{{count}} Ergebnisse", { count: visibleListings.length })}
        </Text>
      )}
    </View>
  ), [t, router, search, category, subcategory, catConfig, subLabel, categoryFilterVisible, markers, viewport, visibleListings.length, conditionChips, deliveryChips, draftAttributeFilters, attributeFilters, activeConditions, pickupOnly, shippingOnly, setSearch, setActiveConditions, setPickupOnly, setShippingOnly, handleAttrChange, handleMarkerPress, setVisibleBounds, handleViewportChange, pruneFilters]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <FlatList
        style={{ flex: 1 }}
        data={visibleListings}
        renderItem={renderCard}
        keyExtractor={(item) => item.listing_id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>
          ) : (
            <DiscoveryEmptyState type="no-results" />
          )
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingBottom: SPACING.section },
  columnWrapper: { gap: SPACING.small, paddingHorizontal: SPACING.std, marginBottom: SPACING.small },
  card: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden", borderWidth: 1, borderColor: COLORS.border,
  },
  cardImage: { width: "100%", aspectRatio: 16 / 9, backgroundColor: COLORS.backgroundPage },
  cardPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardInfo: { padding: SPACING.small },
  cardTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.textPrimary },
  cardPrice: { fontSize: FONT_SIZES.bodySmall, fontWeight: "700", color: COLORS.success, marginTop: 4 },
  cardSeller: { fontSize: 11, color: COLORS.primary, marginTop: 4 },
  cardAddr: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  cardAddrText: { fontSize: 11, color: COLORS.textMuted, flex: 1 },
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
  locationActions: { paddingHorizontal: SPACING.section, gap: SPACING.small },
  locationBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14, marginTop: SPACING.std,
  },
  locationBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: "700", color: COLORS.background },
});

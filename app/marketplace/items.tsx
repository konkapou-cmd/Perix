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
import { formatPrice } from "../../lib/serviceFormat";
import DiscoverySearch from "../../components/discovery/DiscoverySearch";
import DiscoveryFilterChips, { FilterChip } from "../../components/discovery/DiscoveryFilterChips";
import DiscoveryMap, { DiscoveryMapMarker } from "../../components/discovery/DiscoveryMap";
import DiscoveryEmptyState from "../../components/discovery/DiscoveryEmptyState";
import MarketplaceCategoryFilter from "../../components/marketplace/MarketplaceCategoryFilter";
import MarketplaceAttributeFilters from "../../components/marketplace/MarketplaceAttributeFilters";
import ProgressivePicker from "../../components/navigation/ProgressivePicker";
import EmptyState from "../../components/shared/EmptyState";
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
    const isCV = !item.cover_image_url && !!item.video_url;
    const sellerId = item.seller_id || item.owner_id;
    const sellerName = item.business_name || item.seller_name;
    const addressLabel = item.location_visibility === "approximate"
      ? item.public_location_label || t("marketplace.approximateLocation", "Ungefährer Standort")
      : item.address;
    const catMeta = item.category ? getCategoryConfig(item.category) : null;
    const catLabel = catMeta ? t(catMeta.labelKey, catMeta.fallback) : "";
    const condLabel = item.condition
      ? (CONDITION_OPTIONS.find((c) => c.key === item.condition)?.label ?? "")
      : "";
    const metaLine = [catLabel, condLabel].filter(Boolean).join(" · ");
    return (
      <Pressable
        key={item.listing_id}
        style={styles.card}
        onPress={() => handleCardPress(item)}
      >
        {img ? (
          <View style={styles.cardPhotoWrap}>
            <Image source={{ uri: img }} style={styles.cardImage} resizeMode="cover" />
          </View>
        ) : (
          <View style={[styles.cardPhotoWrap, styles.cardPlaceholder]}>
            <Ionicons name={isCV ? "videocam" : "pricetag"} size={26} color="#264348" />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardPrice}>{formatPrice(item.price)}</Text>
          {sellerName ? (
            <Pressable onPress={sellerId ? () => router.push(`/marketplace/user/${sellerId}` as any) : undefined}>
              <Text style={styles.cardSeller} numberOfLines={1}>{sellerName}</Text>
            </Pressable>
          ) : null}
          {addressLabel ? (
            <View style={styles.cardAddr}>
              <Ionicons name="location-outline" size={12} color="#264348" />
              <Text style={styles.cardAddrText} numberOfLines={1}>{addressLabel}</Text>
            </View>
          ) : null}
          {metaLine ? (
            <View style={styles.cardAttr}>
              <Ionicons name="pricetag-outline" size={12} color="#264348" />
              <Text style={styles.cardAttrText} numberOfLines={1}>{metaLine}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#264348" style={{ alignSelf: "center" }} />
      </Pressable>
    );
  }, [handleCardPress, router, t]);

  if (!viewport.ready) return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 80 }} />
    </SafeAreaView>
  );

  if (viewport.needsLocation) return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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
      <DiscoverySearch
        value={search}
        onChangeText={setSearch}
        placeholder={t("marketplace.searchItems", "Artikel durchsuchen...")}
      />
      <DiscoveryMap markers={markers} initialLocation={viewport.initialLocation!} initialBounds={viewport.initialBounds} onMarkerPress={handleMarkerPress} onViewportChanging={setVisibleBounds} onViewportChange={handleViewportChange} />
      <ProgressivePicker
        label={t("navigation.section", "Bereich")}
        value="items"
        options={[
          { key: "items", label: t("marketplace.items", "Artikel"), icon: "pricetag-outline", color: "#59ABE3" },
          { key: "homes", label: t("marketplace.homes", "Unterkünfte"), icon: "home-outline", color: "#59ABE3" },
        ]}
        onChange={(tab) => { if (tab === "homes") router.replace("/marketplace/homes"); }}
        primaryColor="#59ABE3"
        textColor="#264348"
        mutedColor="#264348"
        backgroundColor={COLORS.background}
        borderColor="rgba(38,67,72,0.25)"
      />
      <ProgressivePicker
        label={t("common.filter", "Filter")}
        value="all"
        displayValue={category
          ? `${catConfig ? t(catConfig.labelKey, catConfig.fallback) : category}${subLabel ? ` · ${t(catConfig?.subcategories.find((s) => s.key === subcategory)?.labelKey ?? "", subLabel)}` : ""}`
          : t("common.allCategories", "Alle Kategorien")}
        onPressOverride={() => setCategoryFilterVisible(true)}
        onChange={() => {}}
        options={[{ key: "all", label: t("common.allCategories", "Alle Kategorien") }]}
        primaryColor="#59ABE3"
        textColor="#264348"
        mutedColor="#264348"
        backgroundColor={COLORS.background}
        borderColor="rgba(38,67,72,0.25)"
      />
      <ProgressivePicker
        label={t("marketplace.condition", "Zustand")}
        value={activeConditions[0] ?? "all"}
        options={[
          { key: "all", label: t("marketplace.all", "Alle") },
          ...CONDITION_OPTIONS.map((c) => ({ key: c.key, label: c.label })),
        ]}
        onChange={(key) => setActiveConditions(key === "all" ? [] : [key])}
        primaryColor="#59ABE3"
        textColor="#264348"
        mutedColor="#264348"
        backgroundColor={COLORS.background}
        borderColor="rgba(38,67,72,0.25)"
      />
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
      <ProgressivePicker
        label={t("marketplace.delivery", "Lieferung")}
        value={pickupOnly ? "pickup" : shippingOnly ? "shipping" : "all"}
        options={[
          { key: "all", label: t("marketplace.all", "Alle") },
          { key: "pickup", label: t("marketplace.pickup", "Abholung") },
          { key: "shipping", label: t("marketplace.shipping", "Versand") },
        ]}
        onChange={(key) => {
          setPickupOnly(key === "pickup");
          setShippingOnly(key === "shipping");
        }}
        primaryColor="#59ABE3"
        textColor="#264348"
        mutedColor="#264348"
        backgroundColor={COLORS.background}
        borderColor="rgba(38,67,72,0.25)"
      />
      {visibleListings.length > 0 && (
        <Text style={styles.resultCount}>
          {t("marketplace.results", "{{count}} Ergebnisse", { count: visibleListings.length })}
        </Text>
      )}
    </View>
  ), [t, router, search, category, subcategory, catConfig, subLabel, categoryFilterVisible, markers, viewport, visibleListings.length, draftAttributeFilters, attributeFilters, activeConditions, pickupOnly, shippingOnly, setSearch, setActiveConditions, setPickupOnly, setShippingOnly, handleAttrChange, handleMarkerPress, setVisibleBounds, handleViewportChange, pruneFilters]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <FlatList
        style={{ flex: 1 }}
        data={visibleListings}
        renderItem={renderCard}
        keyExtractor={(item) => item.listing_id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          loading ? (
            <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.primary} /></View>
          ) : (
            <EmptyState
              icon="pricetag-outline"
              message={t("marketplace.noProductsNearby", "Keine Produkte in der Nähe")}
              size="large"
              muted
            />
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
  listContent: { paddingBottom: SPACING.section, paddingHorizontal: SPACING.std },
  card: {
    flexDirection: "row", alignItems: "stretch", backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.small, gap: SPACING.std,
    marginBottom: SPACING.small,
  },
  cardPhotoWrap: { width: "34%", height: 118, borderRadius: BORDER_RADIUS.md, overflow: "hidden", backgroundColor: "#EDF4FB" },
  cardImage: { width: "100%", height: "100%" },
  cardPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, justifyContent: "center", minWidth: 0 },
  cardTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: "#264348" },
  cardPrice: { fontSize: FONT_SIZES.bodySmall, fontWeight: "700", color: COLORS.success, marginTop: 4 },
  cardSeller: { fontSize: 11, color: "#59ABE3", marginTop: 4 },
  cardAddr: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  cardAddrText: { fontSize: 11, color: "#264348", flex: 1 },
  cardAttr: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  cardAttrText: { fontSize: 11, color: "#264348", flex: 1 },
  filterRow: {
    flexDirection: "row", paddingHorizontal: SPACING.std, paddingVertical: SPACING.small,
    backgroundColor: COLORS.background, gap: SPACING.small,
  },
  resultCount: { fontSize: 16, fontWeight: "600", color: "#264348", paddingHorizontal: 16, marginTop: SPACING.small, marginBottom: 8 },
  locationActions: { paddingHorizontal: SPACING.section, gap: SPACING.small },
  locationBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14, marginTop: SPACING.std,
  },
  locationBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: "700", color: COLORS.background },
});

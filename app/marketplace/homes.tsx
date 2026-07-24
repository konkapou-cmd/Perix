import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable, FlatList, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { getListings, Listing, ListingDiscoveryQuery } from "../../lib/api/listings";
import { pushEntityRoute, entityRoutes } from "../../lib/navigation/entityRoutes";
import DiscoveryHeader from "../../components/discovery/DiscoveryHeader";
import DiscoverySearch from "../../components/discovery/DiscoverySearch";
import DiscoveryFilterChips, { FilterChip } from "../../components/discovery/DiscoveryFilterChips";
import DiscoveryMap, { DiscoveryMapMarker } from "../../components/discovery/DiscoveryMap";
import DiscoveryEmptyState from "../../components/discovery/DiscoveryEmptyState";
import { useViewportListings } from "../../hooks/marketplace/useViewportListings";
import { useMarketplaceInitialViewport } from "../../hooks/marketplace/useMarketplaceInitialViewport";
import { useMapBounds } from "../../context/MapBoundsContext";

const PROPERTY_TYPES = ["apartment", "house", "studio", "room"];

export default function MarketplaceHomesPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [activePropType, setActivePropType] = useState("");
  const [furnishedOnly, setFurnishedOnly] = useState(false);
  const [minBeds, setMinBeds] = useState(0);
  const { setMapBounds } = useMapBounds();
  const viewport = useMarketplaceInitialViewport();

  const {
    listings,
    visibleListings,
    loading,
    setVisibleBounds,
    setCommittedBounds,
  } = useViewportListings({
    listingType: "home_rental",
    filters: {
      search: search || undefined,
      propertyType: activePropType || undefined,
      furnished: furnishedOnly ? true : undefined,
      minBedrooms: minBeds > 0 ? minBeds : undefined,
    },
    limit: 100,
    initialBounds: viewport.initialBounds,
  });

  const markers: DiscoveryMapMarker[] = useMemo(
    () =>
      visibleListings
        .filter((l) => l.latitude != null && l.longitude != null)
        .map((l) => ({
          id: l.listing_id,
          latitude: l.latitude!,
          longitude: l.longitude!,
          title: l.title,
          color: COLORS.rentalsAccent, type: "rental",
        })),
    [visibleListings],
  );

  const propertyChips: FilterChip[] = useMemo(
    () => [
      { key: "", label: t("marketplace.all", "Alle"), active: activePropType === "" },
      ...PROPERTY_TYPES.map((pt) => ({ key: pt, label: t(`rentals.propertyType.${pt}`, pt), active: activePropType === pt })),
    ],
    [activePropType],
  );

  const furnishedChip: FilterChip[] = useMemo(
    () => [
      { key: "furnished", label: t("services.furnished", "Möbliert"), active: furnishedOnly },
    ],
    [furnishedOnly],
  );

  const bedroomChips: FilterChip[] = useMemo(
    () =>
      [1, 2, 3, 4].map((n) => ({
        key: `beds_${n}`,
        label: t("marketplace.minBeds", "Min. {{n}} Schlafz.", { n }),
        active: minBeds === n,
      })),
    [minBeds],
  );

  const handleTabChange = (tab: "items" | "homes") => {
    if (tab === "items") router.replace("/marketplace/items");
  };

  const handleMarkerPress = (id: string) => {
    pushEntityRoute(router, entityRoutes.rental(id), () => {});
  };

  const handleCardPress = (listing: Listing) => {
    pushEntityRoute(router, entityRoutes.rental(listing.listing_id), () => {});
  };

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
            <Ionicons name="home-outline" size={28} color={COLORS.textDisabled} />
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
        tab="homes"
        onBack={() => router.back()}
        onTabChange={handleTabChange}
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
        tab="homes"
        onBack={() => router.back()}
        onTabChange={handleTabChange}
        onMyListings={() => router.push("/my-listings" as any)}
      />
      <DiscoverySearch
        value={search}
        onChangeText={setSearch}
        placeholder={t("marketplace.searchHomes", "Unterkünfte durchsuchen...")}
      />
      <DiscoveryFilterChips chips={propertyChips} onToggle={(k) => setActivePropType(k === activePropType ? "" : k)} />
      <DiscoveryFilterChips chips={furnishedChip} onToggle={() => setFurnishedOnly(!furnishedOnly)} />
      <DiscoveryFilterChips chips={bedroomChips} onToggle={(k) => setMinBeds(minBeds === parseInt(k.replace("beds_", "")) ? 0 : parseInt(k.replace("beds_", "")))} />
      <DiscoveryMap
        markers={markers}
        initialLocation={viewport.initialLocation!}
        initialBounds={viewport.initialBounds}
        onMarkerPress={handleMarkerPress}
        onViewportChanging={setVisibleBounds}
        onViewportChange={handleViewportChange}
      />
      {visibleListings.length > 0 && (
        <Text style={styles.resultCount}>
          {t("marketplace.results", "{{count}} Ergebnisse", { count: visibleListings.length })}
        </Text>
      )}
    </View>
  ), [t, router, search, propertyChips, furnishedChip, bedroomChips, markers, viewport, visibleListings.length, activePropType, furnishedOnly, minBeds, setActivePropType, setFurnishedOnly, setMinBeds, handleMarkerPress, setVisibleBounds, handleViewportChange]);

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
  resultCount: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textMuted,
    paddingVertical: SPACING.small,
  },
  locationActions: { paddingHorizontal: SPACING.section, gap: SPACING.small },
  locationBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: 14, marginTop: SPACING.std,
  },
  locationBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: "700", color: COLORS.background },
});

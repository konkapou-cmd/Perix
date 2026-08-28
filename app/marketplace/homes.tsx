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
import { formatPrice } from "../../lib/serviceFormat";

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
          color: COLORS.rentalsAccent, type: "product",
        })),
    [visibleListings],
  );

  const propertyChips: FilterChip[] = useMemo(
    () => [
      { key: "", label: t("marketplace.all", "Alle"), active: activePropType === "" },
      ...PROPERTY_TYPES.map((pt) => ({ key: pt, label: t(`rentals.types.${pt}`, pt), active: activePropType === pt })),
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
    pushEntityRoute(router, entityRoutes.listing(id), () => {});
  };

  const handleCardPress = (listing: Listing) => {
    pushEntityRoute(router, entityRoutes.listing(listing.listing_id), () => {});
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
    const isCV = !item.cover_image_url && !!item.video_url;
    const sellerId = item.seller_id || item.owner_id;
    const sellerName = item.business_name || item.seller_name;
    const addressLabel = item.location_visibility === "approximate"
      ? item.public_location_label || t("marketplace.approximateLocation", "Ungefahrer Standort")
      : item.address;
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
            <Ionicons name={isCV ? "videocam" : "home"} size={26} color="#264348" />
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
  listContent: { paddingBottom: SPACING.section, paddingHorizontal: SPACING.std },
  card: {
    flexDirection: "row", alignItems: "stretch", backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.small, gap: SPACING.std,
    marginBottom: SPACING.small,
  },
  cardPhotoWrap: { width: "31%", height: 104, borderRadius: BORDER_RADIUS.md, overflow: "hidden", backgroundColor: "#EDF4FB" },
  cardImage: { width: "100%", height: "100%" },
  cardPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, justifyContent: "center", minWidth: 0 },
  cardTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: "#264348" },
  cardPrice: { fontSize: FONT_SIZES.bodySmall, fontWeight: "700", color: COLORS.success, marginTop: 4 },
  cardSeller: { fontSize: 11, color: "#59ABE3", marginTop: 4 },
  cardAddr: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 6 },
  cardAddrText: { fontSize: 11, color: "#264348", flex: 1 },
  resultCount: {
    fontSize: FONT_SIZES.bodySmall,
    color: "#264348",
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

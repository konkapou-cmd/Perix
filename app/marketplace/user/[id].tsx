import { useCallback, useMemo, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, FlatList, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../../lib/designTokens";
import { pushEntityRoute, entityRoutes } from "../../../lib/navigation/entityRoutes";
import { getCategoryConfig } from "../../../lib/marketplace/marketplaceTaxonomy";
import { formatPrice } from "../../../lib/serviceFormat";
import { CarouselCard } from "../../../components/shared/CarouselCard";
import { HeaderBackButton } from "../../../components/shared/HeaderBackButton";
import { useViewportListings } from "../../../hooks/marketplace/useViewportListings";
import { useMarketplaceInitialViewport } from "../../../hooks/marketplace/useMarketplaceInitialViewport";
import { useMapBounds } from "../../../context/MapBoundsContext";
import DiscoveryMap, { DiscoveryMapMarker } from "../../../components/discovery/DiscoveryMap";

export default function UserMarketplaceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { setMapBounds } = useMapBounds();
  const viewport = useMarketplaceInitialViewport();

  const [tab, setTab] = useState<"items" | "homes">("items");

  const { listings, visibleListings, loading, setVisibleBounds, setCommittedBounds } = useViewportListings({
    listingType: tab === "homes" ? "home_rental" : "product",
    filters: { sellerId: id as string, sellerType: "user" } as any,
    limit: 100,
    initialBounds: viewport.initialBounds,
  });

  const markers: DiscoveryMapMarker[] = useMemo(
    () => visibleListings.filter(l => l.latitude != null && l.longitude != null).map(l => ({
      id: l.listing_id, latitude: l.latitude!, longitude: l.longitude!,
      title: l.title, color: tab === "homes" ? COLORS.rentalsAccent : COLORS.success,
      type: "product" as const,
    })),
    [visibleListings, tab],
  );

  const handleViewportChange = useCallback((bnds: any) => {
    setVisibleBounds(bnds);
    setCommittedBounds(bnds);
    setMapBounds({ minLat: bnds.minLat, maxLat: bnds.maxLat, minLng: bnds.minLng, maxLng: bnds.maxLng,
      centerLat: (bnds.minLat + bnds.maxLat) / 2, centerLng: (bnds.minLng + bnds.maxLng) / 2 });
  }, [setVisibleBounds, setCommittedBounds, setMapBounds]);

  const handleMarkerPress = useCallback((markerId: string) => {
    pushEntityRoute(router, tab === "homes" ? entityRoutes.rental(markerId) : entityRoutes.listing(markerId), () => {});
  }, [router, tab]);

  const renderCard = useCallback(({ item }: { item: any }) => {
    const img = item.cover_image_url || item.image_urls?.[0] || item.gallery_images?.[0];
    const isCV = !item.cover_image_url && !!item.video_url;
    return (
    <CarouselCard
      key={item.listing_id}
      imageUrl={img || undefined}
      videoUrl={item.video_url || undefined}
      isCoverVideo={isCV}
      muxThumbnailUrl={item.mux_thumbnail_url || undefined}
      videoStatus={item.video_status || undefined}
      title={item.title}
      subtitle={`${formatPrice(item.price) || ""}${item.business_name || item.seller_name ? `\u00b7 ${item.business_name || item.seller_name}` : ""}`}
      thirdLine={item.public_location_label || item.address || ""}
      onPress={() => pushEntityRoute(router, tab === "homes" ? entityRoutes.rental(item.listing_id) : entityRoutes.listing(item.listing_id), () => {})}
      fallbackIcon={tab === "homes" ? "home" : "pricetag"}
    />
  )}, [router, tab]);

  if (!viewport.ready) {
    return <SafeAreaView style={styles.container} edges={["top"]}><ActivityIndicator style={{ marginTop: 100 }} size="large" color={COLORS.primary} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{tab === "homes" ? t("marketplace.homes", "Homes") : t("marketplace.items", "Items")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === "items" && styles.tabActive]} onPress={() => setTab("items")}>
          <Ionicons name="pricetag-outline" size={16} color={tab === "items" ? "#fff" : COLORS.primary} />
          <Text style={[styles.tabText, tab === "items" && styles.tabTextActive]}>{t("marketplace.items", "Items")}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "homes" && styles.tabActive]} onPress={() => setTab("homes")}>
          <Ionicons name="home-outline" size={16} color={tab === "homes" ? "#fff" : COLORS.primary} />
          <Text style={[styles.tabText, tab === "homes" && styles.tabTextActive]}>{t("marketplace.homes", "Homes")}</Text>
        </Pressable>
      </View>

      {viewport.initialLocation && (
        <DiscoveryMap
          markers={markers}
          initialLocation={viewport.initialLocation!}
          initialBounds={viewport.initialBounds}
          onMarkerPress={handleMarkerPress}
          onViewportChanging={setVisibleBounds}
          onViewportChange={handleViewportChange}
        />
      )}

      <FlatList
        data={visibleListings}
        keyExtractor={(item) => item.listing_id}
        renderItem={renderCard}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} /> : (
          <View style={styles.empty}>
            <Ionicons name={tab === "homes" ? "home-outline" : "pricetag-outline"} size={40} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{tab === "homes" ? t("rentals.noRentals", "No homes") : t("marketplace.noProductsNearby", "No items")}</Text>
          </View>
        )}
        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary, flex: 1, marginLeft: SPACING.small },
  tabRow: { flexDirection: "row", padding: SPACING.small, gap: SPACING.small, backgroundColor: COLORS.background },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.primary },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: FONT_SIZES.small, fontWeight: "600", color: COLORS.primary },
  tabTextActive: { color: "#fff" },
  columnWrapper: { gap: SPACING.small, paddingHorizontal: SPACING.small },
  listContent: { paddingBottom: 40, gap: SPACING.small },
  empty: { alignItems: "center", paddingTop: 60 },
  emptyText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted, marginTop: SPACING.small },
});

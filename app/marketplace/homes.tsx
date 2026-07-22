import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES } from "../../lib/designTokens";
import { getListings, Listing, ListingDiscoveryQuery } from "../../lib/api/listings";
import { pushEntityRoute, entityRoutes } from "../../lib/navigation/entityRoutes";
import DiscoveryHeader from "../../components/discovery/DiscoveryHeader";
import DiscoverySearch from "../../components/discovery/DiscoverySearch";
import DiscoveryFilterChips, { FilterChip } from "../../components/discovery/DiscoveryFilterChips";
import DiscoveryMap, { DiscoveryMapMarker } from "../../components/discovery/DiscoveryMap";
import DiscoveryResults from "../../components/discovery/DiscoveryResults";
import DiscoveryEmptyState from "../../components/discovery/DiscoveryEmptyState";
import { useViewportListings } from "../../hooks/marketplace/useViewportListings";

const PROPERTY_TYPES = ["apartment", "house", "studio", "room"];

export default function MarketplaceHomesPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [activePropType, setActivePropType] = useState("");
  const [furnishedOnly, setFurnishedOnly] = useState(false);
  const [minBeds, setMinBeds] = useState(0);

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
    [listings],
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

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
        onMarkerPress={handleMarkerPress}
        onViewportChanging={setVisibleBounds}
        onViewportChange={setCommittedBounds}
      />
      {loading && listings.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
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
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCount: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textMuted,
    paddingVertical: SPACING.small,
  },
});

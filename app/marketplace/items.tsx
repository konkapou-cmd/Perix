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

const CATEGORIES = [
  { key: "electronics", label: "Elektronik" },
  { key: "fashion", label: "Mode" },
  { key: "home_garden", label: "Haus & Garten" },
  { key: "sports", label: "Sport" },
  { key: "books", label: "Bücher" },
  { key: "other", label: "Sonstiges" },
];

const CONDITIONS_LIST = ["new", "like_new", "good", "used"];
const DELIVERY_LIST = ["pickup", "shipping", "both"];

export default function MarketplaceItemsPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeCondition, setActiveCondition] = useState("");
  const [activeDelivery, setActiveDelivery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [bounds, setBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);
  const skipRef = useRef(0);

  const fetchListings = useCallback(async (reset = false) => {
    setLoading(true);
    const query: ListingDiscoveryQuery = {
      listingType: "product",
      search: search || undefined,
      category: activeCategory || undefined,
      condition: activeCondition || undefined,
      deliveryMethod: activeDelivery || undefined,
      skip: reset ? 0 : skipRef.current,
      limit: 50,
    };
    if (bounds) {
      Object.assign(query, bounds);
    }
    try {
      const data = await getListings(query);
      if (reset) {
        setListings(data);
        skipRef.current = data.length;
      } else {
        setListings((prev) => [...prev, ...data]);
        skipRef.current += data.length;
      }
    } catch {}
    setLoading(false);
  }, [search, activeCategory, activeCondition, activeDelivery, bounds]);

  useEffect(() => { fetchListings(true); }, [fetchListings]);

  const markers: DiscoveryMapMarker[] = useMemo(
    () =>
      listings
        .filter((l) => l.latitude != null && l.longitude != null)
        .map((l) => ({
          id: l.listing_id,
          latitude: l.latitude!,
          longitude: l.longitude!,
          title: l.title,
          color: COLORS.success,
        })),
    [listings],
  );

  const categoryChips: FilterChip[] = useMemo(
    () => [
      { key: "", label: t("marketplace.all", "Alle"), active: activeCategory === "" },
      ...CATEGORIES.map((c) => ({ key: c.key, label: c.label, active: activeCategory === c.key })),
    ],
    [activeCategory],
  );

  const conditionChips: FilterChip[] = useMemo(
    () =>
      CONDITIONS_LIST.map((c) => ({ key: c, label: t(`listing.condition.${c}`, c), active: activeCondition === c })),
    [activeCondition],
  );

  const deliveryChips: FilterChip[] = useMemo(
    () =>
      DELIVERY_LIST.map((d) => ({ key: d, label: t(`listing.delivery.${d}`, d), active: activeDelivery === d })),
    [activeDelivery],
  );

  const handleTabChange = (tab: "items" | "homes") => {
    if (tab === "homes") router.replace("/marketplace/homes");
  };

  const handleMarkerPress = (id: string) => {
    pushEntityRoute(router, entityRoutes.listing(id), () => {});
  };

  const handleCardPress = (listing: Listing) => {
    pushEntityRoute(router, entityRoutes.listing(listing.listing_id), () => {});
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <DiscoveryHeader
        title={t("marketplace.title", "Marktplatz")}
        tab="items"
        onBack={() => router.back()}
        onTabChange={handleTabChange}
        onMyListings={() => router.push("/my-listings" as any)}
      />
      <DiscoverySearch
        value={search}
        onChangeText={setSearch}
        placeholder={t("marketplace.searchItems", "Artikel durchsuchen...")}
      />
      <DiscoveryFilterChips chips={categoryChips} onToggle={(k) => setActiveCategory(k === "Alle" ? "" : k === activeCategory ? "" : k)} />
      <DiscoveryFilterChips chips={conditionChips} onToggle={(k) => setActiveCondition(k === activeCondition ? "" : k)} />
      <DiscoveryFilterChips chips={deliveryChips} onToggle={(k) => setActiveDelivery(k === activeDelivery ? "" : k)} />
      <DiscoveryMap
        markers={markers}
        onMarkerPress={handleMarkerPress}
        onViewportChange={setBounds}
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

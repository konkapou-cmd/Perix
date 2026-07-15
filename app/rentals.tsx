import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useAuth } from "../context/AuthContext";
import {
  getRentals,
  Rental,
  CategoryGroup,
  getBusinessCategories,
  toggleSaved,
  batchCheckSaved,
} from "../lib/api";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";
import BusinessMap from "../components/BusinessMap";
import { useMapBounds } from "../context/MapBoundsContext";
import EmptyState from "../components/shared/EmptyState";
import { SkeletonBox } from "../components/shared";
import { translateCategory } from "../lib/categoryTranslation";
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
} from "../lib/designTokens";

const PROPERTY_TYPES = [
  { slug: "apartment", icon: "home-outline" },
  { slug: "house", icon: "home" },
  { slug: "studio", icon: "bed-outline" },
  { slug: "room", icon: "bed" },
];

export default function RentalsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  const { mapBounds, setMapBounds } = useMapBounds();

  const [loading, setLoading] = useState(true);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  const rootCategory = "";
  const [subcategory, setSubcategory] = useState<string>("");
  const [propertyType, setPropertyType] = useState<string>("");
  const [savedRentalIds, setSavedRentalIds] = useState<Set<string>>(new Set());
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [rentalsOffset, setRentalsOffset] = useState(0);
  const [rentalsTotal, setRentalsTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const selectedRootGroup = useMemo(
    () => categories.find((c) => c.slug === rootCategory),
    [categories, rootCategory]
  );

  const translatedSubcategory = subcategory ? translateCategory(subcategory, t) : t("locator.allSubcategories");

  const filteredRentals = (rentals || []).filter((rental: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      rental.title?.toLowerCase().includes(q) ||
      rental.business_name?.toLowerCase().includes(q) ||
      rental.description?.toLowerCase().includes(q) ||
      rental.address?.toLowerCase().includes(q)
    );
  });

  const handleToggleSave = async (rentalId: string) => {
    if (!sessionToken) return;
    try {
      await toggleSaved(sessionToken, "rental", rentalId);
      setSavedRentalIds((prev) => {
        const next = new Set(prev);
        if (next.has(rentalId)) next.delete(rentalId);
        else next.add(rentalId);
        return next;
      });
    } catch (e) {
      console.warn("Save toggle failed:", e);
    }
  };

  useEffect(() => {
    loadCategories();
    if (mapBounds?.centerLat && mapBounds?.centerLng) {
      setLocation({ latitude: mapBounds.centerLat, longitude: mapBounds.centerLng });
    } else {
      requestLocation();
    }
  }, []);

  useEffect(() => {
    if (sessionToken) {
      loadRentals();
    }
  }, [sessionToken, location, rootCategory, subcategory, propertyType, mapBounds]);

  const loadCategories = async () => {
    try {
      const response = await getBusinessCategories(sessionToken || "");
      setCategories(response.categories || []);
    } catch (error) {
      console.error("Failed to load categories:", error);
      setCategories([]);
    }
  };

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      const loc = await Location.getCurrentPositionAsync({});
      const newLocation = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setLocation(newLocation);
      setMapBounds({
        minLat: newLocation.latitude - 0.5,
        maxLat: newLocation.latitude + 0.5,
        minLng: newLocation.longitude - 0.5,
        maxLng: newLocation.longitude + 0.5,
        centerLat: newLocation.latitude,
        centerLng: newLocation.longitude,
      });
    }
  };

  const loadRentals = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const centerLat = location?.latitude ?? mapBounds?.centerLat;
      const centerLng = location?.longitude ?? mapBounds?.centerLng;
      const data = await getRentals(sessionToken, mapBounds ?? undefined, {
        rootCategory: rootCategory || undefined,
        subcategory: subcategory || undefined,
        propertyType: propertyType || undefined,
        latitude: centerLat,
        longitude: centerLng,
      });
      const rentalList: Rental[] = data.rentals || [];
      const total = data.total || 0;
      setRentals(rentalList);
      setRentalsTotal(total);
      setRentalsOffset(20);
      if (sessionToken && rentalList.length > 0) {
        try {
          const ids = rentalList.map((r: Rental) => r.rental_id);
          const results = await batchCheckSaved(sessionToken, "rental", ids);
          setSavedRentalIds(new Set(results.saved_ids || []));
        } catch (e) { console.warn("batchCheckSaved failed:", e); }
      }
    } catch (error) {
      console.error("Failed to load rentals:", error);
    }
    setLoading(false);
  };

  const loadMoreRentals = async () => {
    if (!sessionToken || loadingMore || rentals.length >= rentalsTotal) return;
    setLoadingMore(true);
    try {
      const data = await getRentals(sessionToken, mapBounds ?? undefined, {
        rootCategory: rootCategory || undefined,
        subcategory: subcategory || undefined,
        propertyType: propertyType || undefined,
        latitude: location?.latitude ?? mapBounds?.centerLat,
        longitude: location?.longitude ?? mapBounds?.centerLng,
      }, rentalsOffset, 20);
      const moreRentals: Rental[] = data.rentals || [];
      setRentals(prev => [...(prev || []), ...moreRentals]);
      setRentalsOffset(prev => prev + moreRentals.length);
      setRentalsTotal(data.total || 0);
    } catch (e) {
      console.warn("loadMoreRentals failed:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  const openRentalDetail = async (rental: Rental) => {
    router.push(`/service/${rental.service_id || rental.rental_id}` as any);
  };

  const translatePropertyType = (slug: string) => {
    const map: Record<string, string> = {
      apartment: t("categories.apartments", "Apartments"),
      house: t("categories.houses", "Houses"),
      studio: t("categories.studios", "Studios"),
      room: t("categories.rooms", "Rooms"),
    };
    return map[slug] || slug;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("rentals.rentals")}</Text>
          <Text style={styles.subtitle}>{t("rentals.subtitle", "Find your next home")}</Text>
        </View>
        <Pressable onPress={() => router.push("/my-rentals")} style={styles.myBtn}>
          <Text style={styles.myBtnText}>{t("rentals.myRentals", "My Rentals")}</Text>
        </Pressable>
      </View>

      {/* Subcategory Filter */}
      <View style={styles.filters}>
        <Pressable style={styles.filterButton} onPress={() => setSubcategoryModalVisible(true)}>
          <Text style={styles.filterLabel}>{t("locator.subcategory")}: </Text>
          <Text style={styles.filterValue}>{translatedSubcategory}</Text>
          <Ionicons name="chevron-down" size={16} color="#6b7280" />
        </Pressable>
      </View>

      {/* Property Type Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Pressable
          style={[styles.chip, !propertyType && styles.chipActive]}
          onPress={() => setPropertyType("")}
        >
          <Text style={[styles.chipText, !propertyType && styles.chipTextActive]}>{t("common.all", "All")}</Text>
        </Pressable>
        {PROPERTY_TYPES.map((pt) => (
          <Pressable
            key={pt.slug}
            style={[styles.chip, propertyType === pt.slug && styles.chipActive]}
            onPress={() => setPropertyType(propertyType === pt.slug ? "" : pt.slug)}
          >
            <Ionicons name={pt.icon as any} size={14} color={propertyType === pt.slug ? "#fff" : "#374151"} />
            <Text style={[styles.chipText, propertyType === pt.slug && styles.chipTextActive]}>{translatePropertyType(pt.slug)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            placeholder={t("rentals.searchRentals", "Search rentals...")}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
            placeholderTextColor={COLORS.textDisabled}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {location ? (
          <BusinessMap
            location={location}
            showUserLocation
            markers={filteredRentals
              .filter((r: any) => r.latitude && r.longitude)
              .map((r) => ({
                id: r.rental_id,
                latitude: r.latitude!,
                longitude: r.longitude!,
                title: r.title,
                description: r.business_name || "",
                type: "rental" as const,
                pinColor: COLORS.pinRental,
              }))}
            onMarkerPress={(id) => openRentalDetail(filteredRentals.find((r) => r.rental_id === id)!)}
            onRegionChangeComplete={(bounds) => {
              setMapBounds({ ...bounds, centerLat: (bounds.minLat + bounds.maxLat) / 2, centerLng: (bounds.minLng + bounds.maxLng) / 2 });
            }}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="location" size={40} color={COLORS.primaryDark} />
            <Text style={styles.mapPlaceholderText}>{t("rentals.tapLocation", "Tap to enable location")}</Text>
            <Text style={styles.mapPlaceholderSubtext}>{t("rentals.viewNearby", "View rentals near you")}</Text>
          </View>
        )}
      </View>

      {/* Rental List */}
      <Text style={styles.sectionTitle}>{t("rentals.nearbyRentals", "Nearby Rentals")}</Text>
      {loading ? (
        <View style={{ padding: 16, backgroundColor: COLORS.backgroundPage }}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBox key={i} width="100%" height={88} borderRadius={16} style={{ marginBottom: 10 }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredRentals}
          keyExtractor={(item) => item.rental_id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.rentalCard}
              onPress={() => openRentalDetail(item)}
            >
              {item.cover_image ? (
                <Image source={{ uri: item.cover_image }} style={styles.rentalImage} />
              ) : item.gallery_images && item.gallery_images[0] ? (
                <Image source={{ uri: item.gallery_images[0] }} style={styles.rentalImage} />
              ) : (
                <View style={[styles.rentalImage, styles.rentalImagePlaceholder]}>
                  <Ionicons name="home" size={32} color="#9ca3af" />
                </View>
              )}
              <View style={styles.rentalInfo}>
                <Text style={styles.rentalTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rentalBusiness} numberOfLines={1}>{item.business_name}</Text>
                {item.address ? (
                  <View style={styles.rentalMeta}>
                    <Ionicons name="location-outline" size={14} color="#6b7280" />
                    <Text style={styles.rentalLocation} numberOfLines={1}>{item.address}</Text>
                  </View>
                ) : null}
                <View style={styles.rentalBadges}>
                  {item.property_type && (
                    <View style={styles.propertyBadge}>
                      <Text style={styles.propertyBadgeText}>{translatePropertyType(item.property_type)}</Text>
                    </View>
                  )}
                  {item.rent_price && (
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceBadgeText}>{item.rent_price}</Text>
                    </View>
                  )}
                  {item.distance_km !== undefined && item.distance_km !== null && (
                    <Text style={styles.rentalDistance}>{item.distance_km} km</Text>
                  )}
                </View>
              </View>
              <View style={styles.rentalCardActions}>
                <Pressable onPress={(e) => { e.stopPropagation(); handleToggleSave(item.rental_id); }}>
                  <Ionicons
                    name={savedRentalIds.has(item.rental_id) ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={savedRentalIds.has(item.rental_id) ? COLORS.gold : COLORS.textMuted}
                  />
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </View>
            </Pressable>
          )}
          onEndReached={loadMoreRentals}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={async () => { setIsRefreshing(true); await loadRentals(); setIsRefreshing(false); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.textPrimary} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="home-outline"
              message={searchQuery ? t("rentals.noResults", "Keine Mietangebote gefunden") : t("rentals.noRentals", "Noch keine Mietangebote verfügbar")}
              size="large"
            />
          }
          contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        />
      )}

      {/* Subcategory Modal */}
      <Modal visible={subcategoryModalVisible} animationType="slide" onRequestClose={() => setSubcategoryModalVisible(false)}>
        <SafeAreaView style={styles.categoryModalContainer}>
          <View style={styles.categoryModalHeader}>
            <Text style={styles.categoryModalTitle}>{t("locator.selectSubcategory")}</Text>
            <Pressable onPress={() => setSubcategoryModalVisible(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView>
            {rootCategory && (
              <Pressable
                style={styles.categoryModalItem}
                onPress={() => {
                  setSubcategory("");
                  setSubcategoryModalVisible(false);
                }}
              >
                <Text style={styles.categoryModalItemText}>{t("locator.allSubcategories")}</Text>
              </Pressable>
            )}
            {(selectedRootGroup?.subcategories || []).map((sub) => (
              <Pressable
                key={sub.slug}
                style={styles.categoryModalItem}
                onPress={() => {
                  setSubcategory(sub.slug);
                  setSubcategoryModalVisible(false);
                }}
              >
                <Text style={styles.categoryModalItemText}>{translateCategory(sub.slug, t)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  subtitle: {
    color: "#6b7280",
    marginTop: 2,
    fontSize: 13,
  },
  myBtn: {
    marginLeft: "auto",
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  myBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  filters: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterLabel: {
    color: "#6b7280",
    fontSize: 14,
  },
  filterValue: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  chipRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  chipActive: {
    backgroundColor: COLORS.textPrimary,
  },
  chipText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  searchContainer: {
    paddingHorizontal: SPACING.std,
    marginTop: SPACING.small,
    marginBottom: SPACING.small,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.small,
    height: 40,
    gap: SPACING.small,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  mapContainer: {
    height: 180,
    margin: 16,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#e5e7eb",
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholderText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primaryDark,
    marginTop: 8,
  },
  mapPlaceholderSubtext: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
  },
  rentalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  rentalImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  rentalImagePlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  rentalInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rentalTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  rentalBusiness: {
    fontSize: 13,
    color: COLORS.primaryDark,
    marginTop: 2,
  },
  rentalMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  rentalLocation: {
    fontSize: 12,
    color: "#6b7280",
    flex: 1,
  },
  rentalBadges: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: SPACING.tiny,
    flexWrap: "wrap",
  },
  propertyBadge: {
    backgroundColor: "#d1fae5",
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: 4,
  },
  propertyBadgeText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#065f46",
  },
  priceBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priceBadgeText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.warning || "#92400e",
  },
  rentalDistance: {
    fontSize: 12,
    color: COLORS.primaryDark,
    fontWeight: "500",
    marginTop: 2,
  },
  rentalCardActions: {
    alignItems: "center",
    gap: SPACING.small,
  },
  categoryModalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  categoryModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  categoryModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  categoryModalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  categoryModalItemText: {
    fontSize: 16,
    color: "#374151",
  },
});

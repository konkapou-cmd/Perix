import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
  getRental,
  Rental,
  CategoryGroup,
  getBusinessCategories,
  toggleSaved,
  batchCheckSaved,
} from "../lib/api";
import BusinessMap from "../components/BusinessMap";
import { useMapBounds } from "../context/MapBoundsContext";
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
  { slug: "commercial", icon: "business-outline" },
  { slug: "vacation", icon: "airplane-outline" },
];

export default function RentalsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  const { mapBounds, setMapBounds } = useMapBounds();

  const [loading, setLoading] = useState(true);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  const rootCategory = "rental-real-estate";
  const [subcategory, setSubcategory] = useState<string>("");
  const [propertyType, setPropertyType] = useState<string>("");
  const [savedRentalIds, setSavedRentalIds] = useState<Set<string>>(new Set());
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [rentalsOffset, setRentalsOffset] = useState(0);
  const [rentalsTotal, setRentalsTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedRental, setSelectedRental] = useState<Rental | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

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
    if (!sessionToken) return;
    try {
      const fullRental = await getRental(sessionToken, rental.rental_id);
      setSelectedRental(fullRental);
      setDetailModalVisible(true);
    } catch (error) {
      console.error("Failed to load rental details:", error);
    }
  };

  const translatePropertyType = (slug: string) => {
    const map: Record<string, string> = {
      apartment: t("categories.apartments", "Apartments"),
      house: t("categories.houses", "Houses"),
      studio: t("categories.studios", "Studios"),
      room: t("categories.rooms", "Rooms"),
      commercial: t("categories.commercial-spaces", "Commercial Spaces"),
      vacation: t("categories.vacation-rentals", "Vacation Rentals"),
    };
    return map[slug] || slug;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
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
                pinColor: "#10b981",
              }))}
            onMarkerPress={(id) => openRentalDetail(filteredRentals.find((r) => r.rental_id === id)!)}
            onRegionChangeComplete={(bounds) => {
              setMapBounds({ ...bounds, centerLat: (bounds.minLat + bounds.maxLat) / 2, centerLng: (bounds.minLng + bounds.maxLng) / 2 });
            }}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="location" size={40} color="#000000" />
            <Text style={styles.mapPlaceholderText}>{t("rentals.tapLocation", "Tap to enable location")}</Text>
            <Text style={styles.mapPlaceholderSubtext}>{t("rentals.viewNearby", "View rentals near you")}</Text>
          </View>
        )}
      </View>

      {/* Rental List */}
      <Text style={styles.sectionTitle}>{t("rentals.nearbyRentals", "Nearby Rentals")}</Text>
      {loading ? (
        <View style={{ backgroundColor: COLORS.backgroundPage }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ backgroundColor: COLORS.background, borderRadius: 16, padding: 12, marginHorizontal: 16, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: "#e5e7eb" }} />
                <View style={{ marginLeft: 12, gap: 6 }}>
                  <View style={{ width: 140, height: 12, backgroundColor: "#e5e7eb", borderRadius: 4 }} />
                  <View style={{ width: 100, height: 12, backgroundColor: "#e5e7eb", borderRadius: 4 }} />
                  <View style={{ width: 80, height: 12, backgroundColor: "#e5e7eb", borderRadius: 4 }} />
                </View>
              </View>
            </View>
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
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#111827" /> : null}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{searchQuery ? t("rentals.noResults", "No rentals found") : t("rentals.noRentals")}</Text>
            </View>
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
              <Ionicons name="close" size={22} color="#111827" />
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

      {/* Rental Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" onRequestClose={() => setDetailModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setDetailModalVisible(false)}>
              <Ionicons name="close" size={28} color="#111827" />
            </Pressable>
            <Text style={styles.modalTitle}>{t("rentals.rentals")}</Text>
            <View style={{ width: 28 }} />
          </View>

          {selectedRental && (
            <ScrollView style={styles.modalBody}>
              {selectedRental.cover_image ? (
                <Image source={{ uri: selectedRental.cover_image }} style={styles.detailImage} />
              ) : selectedRental.gallery_images && selectedRental.gallery_images[0] ? (
                <Image source={{ uri: selectedRental.gallery_images[0] }} style={styles.detailImage} />
              ) : (
                <View style={[styles.detailImage, styles.detailImagePlaceholder]}>
                  <Ionicons name="home" size={64} color="#9ca3af" />
                </View>
              )}

              <View style={styles.detailContent}>
                <View style={styles.detailBadges}>
                  {selectedRental.property_type && (
                    <View style={styles.propertyBadge}>
                      <Text style={styles.propertyBadgeText}>{translatePropertyType(selectedRental.property_type)}</Text>
                    </View>
                  )}
                  {selectedRental.rent_price && (
                    <View style={styles.priceBadge}>
                      <Text style={styles.priceBadgeText}>{selectedRental.rent_price}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.detailTitle}>{selectedRental.title}</Text>

                <Pressable style={styles.detailRow} onPress={() => {
                  if (selectedRental.business_id) router.push(`/business/${selectedRental.business_id}`);
                }}>
                  {selectedRental.business_logo && (
                    <Image source={{ uri: selectedRental.business_logo }} style={styles.businessLogo} />
                  )}
                  <Text style={[styles.detailBusiness, { color: "#0066cc" }]}>{selectedRental.business_name}</Text>
                  <Ionicons name="open-outline" size={14} color="#0066cc" />
                </Pressable>

                <View style={styles.detailInfoRow}>
                  {selectedRental.rent_price && (
                    <View style={styles.detailInfoCard}>
                      <Ionicons name="cash-outline" size={20} color={COLORS.warning || "#f59e0b"} />
                      <Text style={styles.detailInfoLabel}>{t("rentals.rentPrice")}</Text>
                      <Text style={styles.detailInfoValue}>{selectedRental.rent_price}</Text>
                    </View>
                  )}
                  {selectedRental.rooms_size && (
                    <View style={styles.detailInfoCard}>
                      <Ionicons name="resize-outline" size={20} color="#3b82f6" />
                      <Text style={styles.detailInfoLabel}>{t("rentals.roomsSize")}</Text>
                      <Text style={styles.detailInfoValue}>{selectedRental.rooms_size}</Text>
                    </View>
                  )}
                </View>

                {selectedRental.deposit && (
                  <View style={styles.detailRow}>
                    <Ionicons name="shield-outline" size={18} color="#6b7280" />
                    <View>
                      <Text style={styles.detailSmallLabel}>{t("rentals.deposit")}</Text>
                      <Text style={styles.detailLocation}>{selectedRental.deposit}</Text>
                    </View>
                  </View>
                )}

                {selectedRental.available_from && (
                  <View style={styles.detailRow}>
                    <Ionicons name="calendar-outline" size={18} color="#6b7280" />
                    <View>
                      <Text style={styles.detailSmallLabel}>{t("rentals.availableFrom")}</Text>
                      <Text style={styles.detailLocation}>{selectedRental.available_from}</Text>
                    </View>
                  </View>
                )}

                {selectedRental.address && (
                  <Pressable style={styles.detailRow} onPress={() => {
                    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedRental.address || "")}`;
                    try { require("react-native").Linking.openURL(url); } catch {}
                  }}>
                    <Ionicons name="location-outline" size={18} color="#6b7280" />
                    <Text style={[styles.detailLocation, { color: "#0066cc", textDecorationLine: "underline" }]}>{selectedRental.address}</Text>
                  </Pressable>
                )}

                {selectedRental.latitude && selectedRental.longitude && (
                  <View style={styles.detailMapContainer}>
                    <BusinessMap
                      location={{ latitude: selectedRental.latitude, longitude: selectedRental.longitude }}
                      markers={[{
                        id: selectedRental.rental_id,
                        latitude: selectedRental.latitude,
                        longitude: selectedRental.longitude,
                        title: selectedRental.title,
                        description: selectedRental.business_name || "",
                      }]}
                    />
                  </View>
                )}

                {selectedRental.description && (
                  <>
                    <Text style={styles.detailSectionTitle}>{t("rentals.description")}</Text>
                    <Text style={styles.detailDescription}>{selectedRental.description}</Text>
                  </>
                )}

                {selectedRental.gallery_images && selectedRental.gallery_images.length > 0 && (
                  <>
                    <Text style={styles.detailSectionTitle}>{t("rentals.gallery")}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {selectedRental.gallery_images.map((img, idx) => (
                        <Image key={idx} source={{ uri: img }} style={styles.galleryThumb} />
                      ))}
                    </ScrollView>
                  </>
                )}

                <View style={styles.detailActions}>
                  <Pressable
                    style={styles.saveButton}
                    onPress={() => handleToggleSave(selectedRental.rental_id)}
                  >
                    <Ionicons
                      name={savedRentalIds.has(selectedRental.rental_id) ? "bookmark" : "bookmark-outline"}
                      size={20}
                      color={savedRentalIds.has(selectedRental.rental_id) ? COLORS.gold : "#111827"}
                    />
                    <Text style={styles.saveButtonText}>
                      {savedRentalIds.has(selectedRental.rental_id) ? t("common.saved", "Saved") : t("common.save", "Save")}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.whatsappButton}
                    onPress={() => {
                      const text = encodeURIComponent(`Hi, I'm interested in: ${selectedRental.title}`);
                      const url = `https://wa.me/?text=${text}`;
                      try { require("react-native").Linking.openURL(url); } catch {}
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                    <Text style={styles.whatsappButtonText}>{t("common.share", "Share")}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          )}
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
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    color: "#6b7280",
    marginTop: 2,
    fontSize: 13,
  },
  myBtn: {
    marginLeft: "auto",
    backgroundColor: "#000000",
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
    color: "#111827",
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
    backgroundColor: "#111827",
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
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    height: 40,
    gap: SPACING.sm,
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
    color: "#000000",
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
    color: "#111827",
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
    color: "#111827",
  },
  rentalBusiness: {
    fontSize: 13,
    color: "#000000",
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
    gap: SPACING.xs,
    flexWrap: "wrap",
  },
  propertyBadge: {
    backgroundColor: "#d1fae5",
    paddingHorizontal: SPACING.md,
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
    paddingHorizontal: SPACING.md,
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
    color: "#000000",
    fontWeight: "500",
    marginTop: 2,
  },
  rentalCardActions: {
    alignItems: "center",
    gap: SPACING.sm,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  modalBody: {
    flex: 1,
  },
  detailImage: {
    width: "100%",
    height: 200,
  },
  detailImagePlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  detailContent: {
    padding: 16,
  },
  detailBadges: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  businessLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  detailBusiness: {
    fontSize: 16,
    color: "#000000",
    fontWeight: "500",
  },
  detailLocation: {
    fontSize: 14,
    color: "#6b7280",
  },
  detailSmallLabel: {
    fontSize: 11,
    color: "#9ca3af",
  },
  detailInfoRow: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 12,
  },
  detailInfoCard: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  detailInfoLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  detailInfoValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  detailMapContainer: {
    height: 150,
    borderRadius: 12,
    overflow: "hidden",
    marginVertical: 16,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  detailDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
  },
  galleryThumb: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 8,
  },
  detailActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#f3f4f6",
    padding: 14,
    borderRadius: 12,
    flex: 1,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  whatsappButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dcfce7",
    padding: 14,
    borderRadius: 12,
    flex: 1,
  },
  whatsappButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#166534",
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
    color: "#111827",
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
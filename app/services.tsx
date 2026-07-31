import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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
  Service,
  CategoryGroup,
  getBusinessCategories,
  toggleSaved,
  batchCheckSaved,
  getNearbyServices,
} from "../lib/api";
import BusinessMap from "../components/BusinessMap";
import { useMapBounds } from "../context/MapBoundsContext";
import { translateCategory } from "../lib/categoryTranslation";
import EmptyState from "../components/shared/EmptyState";
import { SkeletonBox } from "../components/shared";
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
} from "../lib/designTokens";
import { entityRoutes, pushEntityRoute, showInvalidEntityAlert } from "../lib/navigation/entityRoutes";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";

export default function ServicesScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  const { mapBounds, setMapBounds } = useMapBounds();

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  const [rootCategory, setRootCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [savedServiceIds, setSavedServiceIds] = useState<Set<string>>(new Set());
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedRootGroup = useMemo(
    () => categories.find((c) => c.slug === rootCategory),
    [categories, rootCategory]
  );

  const translatedRootCategory = rootCategory ? translateCategory(rootCategory, t) : t("locator.allCategories");
  const translatedSubcategory = subcategory ? translateCategory(subcategory, t) : t("locator.allSubcategories");

  const filteredServices = (services || []).filter((s: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.business_name?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.address?.toLowerCase().includes(q)
    );
  });

  const handleToggleSave = async (serviceId: string) => {
    if (!sessionToken) return;
    try {
      await toggleSaved(sessionToken, "service", serviceId);
      setSavedServiceIds((prev) => {
        const next = new Set(prev);
        if (next.has(serviceId)) next.delete(serviceId);
        else next.add(serviceId);
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
      loadServices();
    }
  }, [sessionToken, location, rootCategory, subcategory, mapBounds]);

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

  const loadServices = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const centerLat = location?.latitude ?? mapBounds?.centerLat;
      const centerLng = location?.longitude ?? mapBounds?.centerLng;
      const data = await getNearbyServices(sessionToken, mapBounds ?? undefined, {
        latitude: centerLat,
        longitude: centerLng,
      }, rootCategory || undefined, subcategory || undefined);
      const svcList: Service[] = Array.isArray(data) ? data : (data.services || []);
      setServices(svcList.filter((s: any) => s.type !== "rental_property"));
      if (sessionToken && svcList.length > 0) {
        try {
          const ids = svcList.map((s: Service) => s.service_id);
          const results = await batchCheckSaved(sessionToken, "service", ids);
          const savedSet = new Set<string>();
          for (const [id, saved] of Object.entries(results)) {
            if (saved) savedSet.add(id);
          }
          setSavedServiceIds(savedSet);
        } catch (e) { console.warn("batchCheckSaved failed:", e); }
      }
    } catch (error) {
      console.error("Failed to load services:", error);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("modules.services", "Dienstleistungen")}</Text>
          <Text style={styles.subtitle}>{t("services.nearbyServices", "Services in deiner Nähe")}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={{ backgroundColor: COLORS.backgroundPage }}>
          <SkeletonBox width="100%" height={180} borderRadius={16} style={{ marginHorizontal: 16, marginTop: 16 }} />
          <SkeletonBox width={120} height={18} style={{ marginTop: 16, marginHorizontal: 16 }} />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ backgroundColor: COLORS.background, borderRadius: 16, padding: 12, marginHorizontal: 16, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <SkeletonBox width={64} height={64} borderRadius={12} />
                <View style={{ marginLeft: 12, gap: 6 }}>
                  <SkeletonBox width={140} height={12} />
                  <SkeletonBox width={100} height={12} />
                  <SkeletonBox width={80} height={12} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filteredServices}
          keyExtractor={(item) => item.service_id}
          nestedScrollEnabled
          ListHeaderComponent={
            <>
              <View style={styles.filters}>
                <Pressable
                  style={styles.filterButton}
                  onPress={() => setCategoryModalVisible(true)}
                  data-testid="category-filter-btn"
                >
                  <Text style={styles.filterLabel}>{t("locator.category")}: </Text>
                  <Text style={styles.filterValue}>{translatedRootCategory}</Text>
                  <Ionicons name="chevron-down" size={16} color="#6b7280" />
                </Pressable>

                <Pressable
                  style={styles.filterButton}
                  onPress={() => setSubcategoryModalVisible(true)}
                  data-testid="subcategory-filter-btn"
                >
                  <Text style={styles.filterLabel}>{t("locator.subcategory")}: </Text>
                  <Text style={styles.filterValue}>{translatedSubcategory}</Text>
                  <Ionicons name="chevron-down" size={16} color="#6b7280" />
                </Pressable>
              </View>

              <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={16} color={COLORS.textMuted} />
                  <TextInput
                    placeholder={t("services.searchServices", "Dienstleistungen suchen...")}
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

              <View style={styles.mapContainer}>
                {location ? (
                  <BusinessMap
                    location={location}
                    showUserLocation
                    markers={(services || [])
                      .filter((s: any) => s.latitude && s.longitude)
                      .map((s) => ({
                        id: s.service_id,
                        latitude: s.latitude!,
                        longitude: s.longitude!,
                        title: s.name,
                        description: s.business_name || "",
                        type: "service" as const,
                        pinColor: COLORS.servicesAccent,
                      }))}
                    onMarkerPress={(id) => {
                      pushEntityRoute(router, entityRoutes.service(id), () => showInvalidEntityAlert(t));
                    }}
                    onRegionChangeComplete={(bounds) => {
                      setMapBounds({ ...bounds, centerLat: (bounds.minLat + bounds.maxLat) / 2, centerLng: (bounds.minLng + bounds.maxLng) / 2 });
                    }}
                  />
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <Ionicons name="location" size={40} color={COLORS.primaryDark} />
                    <Text style={styles.mapPlaceholderText}>{t("jobs.tapToEnableLocation")}</Text>
                    <Text style={styles.mapPlaceholderSubtext}>{t("services.viewNearbyServices", "Entdecke Services in deiner Nähe")}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.sectionTitle}>{t("services.nearbyServices", "Services in der Nähe")}</Text>
            </>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.serviceCard}
              onPress={() => pushEntityRoute(router, entityRoutes.service(item.service_id), () => showInvalidEntityAlert(t))}
              data-testid={`service-card-${item.service_id}`}
            >
              {item.cover_image_url ? (
                <Image source={{ uri: item.cover_image_url }} style={styles.serviceImage} />
              ) : item.image_urls?.[0] ? (
                <Image source={{ uri: item.image_urls[0] }} style={styles.serviceImage} />
              ) : (
                <View style={[styles.serviceImage, styles.serviceImagePlaceholder]}>
                  <Ionicons name="briefcase" size={32} color="#9ca3af" />
                </View>
              )}
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.serviceBusiness} numberOfLines={1}>
                  {item.business_name}
                </Text>
                <View style={styles.serviceMeta}>
                  <Ionicons name="location-outline" size={14} color="#6b7280" />
                  <Text style={styles.serviceLocation} numberOfLines={1}>
                    {item.address}
                  </Text>
                </View>
                <View style={styles.serviceBadges}>
                  {item.root_category && (
                    <View style={styles.serviceTypeBadge}>
                      <Text style={styles.serviceTypeBadgeText}>{translateCategory(item.root_category, t)}</Text>
                    </View>
                  )}
                  {item.type && item.type !== "rental_property" && (
                    <View style={styles.serviceSalaryBadge}>
                      <Text style={styles.serviceSalaryBadgeText}>{item.type}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.serviceCardActions}>
                <Pressable onPress={(e) => { e.stopPropagation(); handleToggleSave(item.service_id); }}>
                  <Ionicons
                    name={savedServiceIds.has(item.service_id) ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={savedServiceIds.has(item.service_id) ? COLORS.gold : COLORS.textMuted}
                  />
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </View>
            </Pressable>
          )}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={async () => { setIsRefreshing(true); await loadServices(); setIsRefreshing(false); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              message={searchQuery ? t("services.noResults", "Keine Services gefunden") : t("services.noServices", "Noch keine Services verfügbar")}
              size="large"
            />
          }
          contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        />
      )}

      <Modal visible={categoryModalVisible} animationType="slide" onRequestClose={() => setCategoryModalVisible(false)}>
        <SafeAreaView style={styles.categoryModalContainer}>
          <View style={styles.categoryModalHeader}>
            <Text style={styles.categoryModalTitle}>{t("locator.selectCategory")}</Text>
            <Pressable onPress={() => setCategoryModalVisible(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView>
            <Pressable
              style={styles.categoryModalItem}
              onPress={() => {
                setRootCategory("");
                setSubcategory("");
                setCategoryModalVisible(false);
              }}
            >
              <Text style={styles.categoryModalItemText}>{t("locator.allCategories")}</Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                key={category.slug}
                style={styles.categoryModalItem}
                onPress={() => {
                  setRootCategory(category.slug);
                  setSubcategory("");
                  setCategoryModalVisible(false);
                }}
              >
                <Text style={styles.categoryModalItemText}>{translateCategory(category.slug, t)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

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
  container: { flex: 1, backgroundColor: "#ffffff" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: COLORS.textPrimary },
  subtitle: { color: "#6b7280", marginTop: 2 },
  filters: { paddingHorizontal: 16, gap: 8 },
  filterButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  filterLabel: { color: "#6b7280", fontSize: 14 },
  filterValue: { flex: 1, color: COLORS.textPrimary, fontSize: 14, fontWeight: "500" },
  mapContainer: { height: 180, margin: 16, borderRadius: 16, overflow: "hidden", backgroundColor: "#e5e7eb" },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapPlaceholderText: { fontSize: 16, fontWeight: "600", color: COLORS.primaryDark, marginTop: 8 },
  mapPlaceholderSubtext: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary, paddingHorizontal: 16, marginBottom: 8 },
  serviceCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 12, borderRadius: 16, marginBottom: 10 },
  serviceImage: { width: 64, height: 64, borderRadius: 12 },
  serviceImagePlaceholder: { backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  serviceInfo: { flex: 1, marginLeft: 12 },
  serviceTitle: { fontSize: 15, fontWeight: "600", color: COLORS.textPrimary },
  serviceBusiness: { fontSize: 13, color: COLORS.primaryDark, marginTop: 2 },
  serviceMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  serviceLocation: { fontSize: 12, color: "#6b7280", flex: 1 },
  serviceBadges: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4, flexWrap: "wrap" },
  serviceTypeBadge: { backgroundColor: "#e0e7ff", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  serviceTypeBadgeText: { fontSize: 10, fontWeight: "600", color: COLORS.info },
  serviceSalaryBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  serviceSalaryBadgeText: { fontSize: 10, fontWeight: "600", color: COLORS.warning },
  serviceCardActions: { alignItems: "center", gap: 8 },
  categoryModalContainer: { flex: 1, backgroundColor: "#fff" },
  categoryModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  categoryModalTitle: { fontSize: 18, fontWeight: "600", color: COLORS.textPrimary },
  categoryModalItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  categoryModalItemText: { fontSize: 16, color: "#374151" },
  searchContainer: { paddingHorizontal: SPACING.std, marginTop: SPACING.small, marginBottom: SPACING.small },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.backgroundPage, borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.small, height: 40, gap: SPACING.small },
  searchInput: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary, paddingVertical: 0 },
});

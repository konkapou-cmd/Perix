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
import { CATEGORY_ICONS } from "../lib/categoryIcons";
import ProgressivePicker from "../components/navigation/ProgressivePicker";

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
      });
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
          style={styles.pageLimit}
          ListHeaderComponent={
            <>
              <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={16} color="#264348" />
                  <TextInput
                    placeholder={t("services.searchServices", "Dienstleistungen suchen...")}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={styles.searchInput}
                    placeholderTextColor="#264348"
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery("")}>
                      <Ionicons name="close-circle" size={16} color="#264348" />
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
                        pinColor: COLORS.pinService,
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
                    <Ionicons name="location" size={40} color="#264348" />
                    <Text style={styles.mapPlaceholderText}>{t("jobs.tapToEnableLocation")}</Text>
                    <Text style={styles.mapPlaceholderSubtext}>{t("services.viewNearbyServices", "Entdecke Services in deiner Nähe")}</Text>
                  </View>
                )}
              </View>

              <ProgressivePicker
                label={t("common.filter", "Filter")}
                value="all"
                displayValue={translatedRootCategory}
                onPressOverride={() => setCategoryModalVisible(true)}
                onChange={() => {}}
                options={[{ key: "all", label: t("locator.allCategories") }]}
                primaryColor="#59ABE3"
                textColor="#264348"
                mutedColor="#264348"
                backgroundColor={COLORS.background}
                borderColor="rgba(38,67,72,0.25)"
              />
              <ProgressivePicker
                label={t("common.subcategory", "Kategorie")}
                value="all"
                displayValue={translatedSubcategory}
                onPressOverride={() => setSubcategoryModalVisible(true)}
                onChange={() => {}}
                options={[{ key: "all", label: t("locator.allSubcategories") }]}
                primaryColor="#59ABE3"
                textColor="#264348"
                mutedColor="#264348"
                backgroundColor={COLORS.background}
                borderColor="rgba(38,67,72,0.25)"
              />

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
                  <Ionicons name="briefcase" size={32} color="#264348" />
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
                  <Ionicons name="location-outline" size={14} color="#264348" />
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
                    color={savedServiceIds.has(item.service_id) ? COLORS.gold : "#264348"}
                  />
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color="#264348" />
              </View>
            </Pressable>
          )}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={async () => { setIsRefreshing(true); await loadServices(); setIsRefreshing(false); }} tintColor="#264348" colors={["#264348"]} />}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              message={searchQuery ? t("services.noResults", "Keine Services gefunden") : t("services.noServices", "Noch keine Services verfügbar")}
              size="large"
              muted
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
              <Ionicons name="close" size={22} color="#264348" />
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
              <Ionicons name="grid-outline" size={20} color={rootCategory ? "#264348" : "#59ABE3"} style={styles.categoryModalIcon} />
              <Text style={styles.categoryModalItemText}>{t("locator.allCategories")}</Text>
              {!rootCategory && <Ionicons name="checkmark" size={18} color="#59ABE3" />}
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
                <Ionicons name={(CATEGORY_ICONS[category.slug] || "grid") as any} size={20} color={rootCategory === category.slug ? "#59ABE3" : "#264348"} style={styles.categoryModalIcon} />
                <Text style={styles.categoryModalItemText}>{translateCategory(category.slug, t)}</Text>
                {rootCategory === category.slug && <Ionicons name="checkmark" size={18} color="#59ABE3" />}
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
              <Ionicons name="close" size={22} color="#264348" />
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
                <Ionicons name="grid-outline" size={20} color={subcategory ? "#264348" : "#59ABE3"} style={styles.categoryModalIcon} />
                <Text style={styles.categoryModalItemText}>{t("locator.allSubcategories")}</Text>
                {!subcategory && <Ionicons name="checkmark" size={18} color="#59ABE3" />}
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
                <View style={[styles.subDot, subcategory === sub.slug && { backgroundColor: "#59ABE3" }]} />
                <Text style={styles.categoryModalItemText}>{translateCategory(sub.slug, t)}</Text>
                {subcategory === sub.slug && <Ionicons name="checkmark" size={18} color="#59ABE3" />}
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
  pageLimit: {
    ...Platform.select({
      web: { width: "100%", maxWidth: 1280, marginHorizontal: "auto" },
    }),
  },
  mapContainer: { borderRadius: 12, overflow: "hidden", backgroundColor: "#EAF3FB" },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapPlaceholderText: { fontSize: 16, fontWeight: "600", color: "#264348", marginTop: 8 },
  mapPlaceholderSubtext: { fontSize: 13, color: "#264348", marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#264348", paddingHorizontal: 16, marginBottom: 8 },
  serviceCard: { flexDirection: "row", alignItems: "stretch", backgroundColor: "#fff", padding: 12, borderRadius: 12, marginBottom: 10, gap: 12 },
  serviceImage: { width: "31%", height: 104, borderRadius: 12 },
  serviceImagePlaceholder: { backgroundColor: "#EDF4FB", alignItems: "center", justifyContent: "center" },
  serviceInfo: { flex: 1, justifyContent: "center" },
  serviceTitle: { fontSize: 15, fontWeight: "600", color: "#264348" },
  serviceBusiness: { fontSize: 13, color: "#59ABE3", marginTop: 2 },
  serviceMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  serviceLocation: { fontSize: 12, color: "#264348", flex: 1 },
  serviceBadges: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4, flexWrap: "wrap" },
  serviceTypeBadge: { backgroundColor: "rgba(38,67,72,0.1)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  serviceTypeBadgeText: { fontSize: 10, fontWeight: "600", color: "#264348" },
  serviceSalaryBadge: { backgroundColor: "#fef3c7", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  serviceSalaryBadgeText: { fontSize: 10, fontWeight: "600", color: COLORS.warning },
  serviceCardActions: { alignItems: "center", gap: 8 },
  categoryModalContainer: { flex: 1, backgroundColor: "#fff" },
  categoryModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(38,67,72,0.15)" },
  categoryModalTitle: { fontSize: 18, fontWeight: "600", color: "#264348" },
  categoryModalItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(38,67,72,0.08)" },
  categoryModalIcon: { marginRight: 12 },
  subDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#264348", marginRight: 12, marginLeft: 4 },
  categoryModalItemText: { flex: 1, fontSize: 16, color: "#264348" },
  searchContainer: { paddingHorizontal: SPACING.small, paddingTop: SPACING.small, paddingBottom: SPACING.small },
  searchBar: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.small, height: 40, gap: SPACING.small, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(38,67,72,0.2)" },
  searchInput: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: "#264348", paddingVertical: 0 },
});

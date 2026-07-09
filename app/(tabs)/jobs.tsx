import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
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

import { useAuth } from "../../context/AuthContext";
import {
  getJobs,
  Job,
  CategoryGroup,
  getBusinessCategories,
  toggleSaved,
  batchCheckSaved,
} from "../../lib/api";
import BusinessMap from "../../components/BusinessMap";
import { useMapBounds } from "../../context/MapBoundsContext";
import { translateCategory } from "../../lib/categoryTranslation";
import { SkeletonBox } from "../../components/shared";
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
} from "../../lib/designTokens";

export default function JobsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  const { mapBounds, setMapBounds } = useMapBounds();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  // Filters
  const [rootCategory, setRootCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [jobsOffset, setJobsOffset] = useState(0);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Application modal state removed — applications handled on job detail page

  const selectedRootGroup = useMemo(
    () => categories.find((c) => c.slug === rootCategory),
    [categories, rootCategory]
  );

  const translatedRootCategory = rootCategory ? translateCategory(rootCategory, t) : t("locator.allCategories");
  const translatedSubcategory = subcategory ? translateCategory(subcategory, t) : t("locator.allSubcategories");

  const filteredJobs = (jobs || []).filter((job: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      job.title?.toLowerCase().includes(q) ||
      job.business_name?.toLowerCase().includes(q) ||
      job.description?.toLowerCase().includes(q) ||
      job.location?.toLowerCase().includes(q)
    );
  });

  const handleToggleSave = async (jobId: string) => {
    if (!sessionToken) return;
    try {
      await toggleSaved(sessionToken, "job", jobId);
      setSavedJobIds((prev) => {
        const next = new Set(prev);
        if (next.has(jobId)) next.delete(jobId);
        else next.add(jobId);
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
      loadJobs();
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

  const loadJobs = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const centerLat = location?.latitude ?? mapBounds?.centerLat;
      const centerLng = location?.longitude ?? mapBounds?.centerLng;
      const data = await getJobs(sessionToken, mapBounds ?? undefined, {
        rootCategory: rootCategory || undefined,
        subcategory: subcategory || undefined,
        latitude: centerLat,
        longitude: centerLng,
      });
      const jobList: Job[] = Array.isArray(data) ? data : (data.jobs || []);
      const total = Array.isArray(data) ? data.length : (data.total || 0);
      setJobs(jobList);
      setJobsTotal(total);
      setJobsOffset(20);
      if (sessionToken && jobList.length > 0) {
        try {
          const ids = jobList.map((j: Job) => j.job_id);
          const results = await batchCheckSaved(sessionToken, "job", ids);
          const savedSet = new Set<string>();
          for (const [id, saved] of Object.entries(results)) {
            if (saved) savedSet.add(id);
          }
          setSavedJobIds(savedSet);
        } catch (e) { console.warn("batchCheckSaved failed:", e); }
      }
    } catch (error) {
      console.error("Failed to load jobs:", error);
    }
    setLoading(false);
  };

  const loadMoreJobs = async () => {
    if (!sessionToken || loadingMore || jobs.length >= jobsTotal) return;
    setLoadingMore(true);
    try {
      const data = await getJobs(sessionToken, mapBounds ?? undefined, {
        rootCategory: rootCategory || undefined,
        subcategory: subcategory || undefined,
        latitude: location?.latitude ?? mapBounds?.centerLat,
        longitude: location?.longitude ?? mapBounds?.centerLng,
      }, jobsOffset, 20);
      const moreJobs: Job[] = Array.isArray(data) ? data : (data.jobs || []);
      setJobs(prev => [...(prev || []), ...moreJobs]);
      setJobsOffset(prev => prev + moreJobs.length);
      setJobsTotal(Array.isArray(data) ? data.length : (data.total || 0));
    } catch (e) {
      console.warn("loadMoreJobs failed:", e);
    } finally {
      setLoadingMore(false);
    }
  };

  // Apply functions removed — applications handled on job detail page

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("jobs.title")}</Text>
          <Text style={styles.subtitle}>{t("jobs.subtitle")}</Text>
        </View>
        <Pressable onPress={() => router.push("/my-applications")} style={styles.myAppsBtn}>
          <Text style={styles.myAppsBtnText}>{t("jobs.myApplications")}</Text>
        </Pressable>
      </View>

      {/* Category Filters */}
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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            placeholder={t("jobs.searchJobs", "Search jobs...")}
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
            markers={(jobs || [])
              .filter((job: any) => job.latitude && job.longitude)
              .map((job) => ({
                id: job.job_id,
                latitude: job.latitude!,
                longitude: job.longitude!,
                title: job.title,
                description: job.business_name || "",
                type: "job" as const,
                pinColor: "#FFD700",
              }))}
            onMarkerPress={(id) => {
              router.push(`/job/${id}` as any);
            }}
            onRegionChangeComplete={(bounds) => {
              setMapBounds({ ...bounds, centerLat: (bounds.minLat + bounds.maxLat) / 2, centerLng: (bounds.minLng + bounds.maxLng) / 2 });
            }}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="location" size={40} color={COLORS.primaryDark} />
            <Text style={styles.mapPlaceholderText}>{t("jobs.tapToEnableLocation")}</Text>
            <Text style={styles.mapPlaceholderSubtext}>{t("jobs.viewNearbyJobs")}</Text>
          </View>
        )}
      </View>

      {/* Job List */}
      <Text style={styles.sectionTitle}>{t("jobs.nearbyJobs")}</Text>
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
          data={filteredJobs}
          keyExtractor={(item) => item.job_id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.jobCard}
              onPress={() => router.push(`/job/${item.job_id}`)}
              data-testid={`job-card-${item.job_id}`}
            >
              {item.cover_image ? (
                <Image source={{ uri: item.cover_image }} style={styles.jobImage} />
              ) : (
                <View style={[styles.jobImage, styles.jobImagePlaceholder]}>
                  <Ionicons name="briefcase" size={32} color="#9ca3af" />
                </View>
              )}
              <View style={styles.jobInfo}>
                <Text style={styles.jobTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.jobBusiness} numberOfLines={1}>
                  {item.business_name}
                </Text>
                <View style={styles.jobMeta}>
                  <Ionicons name="location-outline" size={14} color="#6b7280" />
                  <Text style={styles.jobLocation} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
                <View style={styles.jobBadges}>
                  {item.job_type && (
                    <View style={styles.jobTypeBadge}>
                      <Text style={styles.jobTypeBadgeText}>{item.job_type}</Text>
                    </View>
                  )}
                  {item.salary_range && (
                    <View style={styles.jobSalaryBadge}>
                      <Text style={styles.jobSalaryBadgeText}>{item.salary_range}</Text>
                    </View>
                  )}
                  {item.distance_km !== undefined && (
                    <Text style={styles.jobDistance}>{item.distance_km} km</Text>
                  )}
                </View>
              </View>
              <View style={styles.jobCardActions}>
                <Pressable onPress={(e) => { e.stopPropagation(); handleToggleSave(item.job_id); }}>
                  <Ionicons
                    name={savedJobIds.has(item.job_id) ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={savedJobIds.has(item.job_id) ? COLORS.gold : COLORS.textMuted}
                  />
                </Pressable>
                <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
              </View>
            </Pressable>
          )}
          onEndReached={loadMoreJobs}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.textPrimary} /> : null}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{searchQuery ? t("jobs.noResults", "No jobs found") : t("jobs.noJobs")}</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 16 }}
        />
      )}

      {/* Category Modal */}
      {/* Category Modal */}
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

      {/* Detail and apply modals removed — now navigates to /job/:id */}
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
    color: COLORS.textPrimary,
  },
  subtitle: {
    color: "#6b7280",
    marginTop: 2,
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
  jobCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  jobImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  jobImagePlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  jobInfo: {
    flex: 1,
    marginLeft: 12,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  jobBusiness: {
    fontSize: 13,
    color: COLORS.primaryDark,
    marginTop: 2,
  },
  jobMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  jobLocation: {
    fontSize: 12,
    color: "#6b7280",
    flex: 1,
  },
  jobDistance: {
    fontSize: 12,
    color: COLORS.primaryDark,
    fontWeight: "500",
    marginTop: 2,
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
    color: COLORS.textPrimary,
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
  detailTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
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
    color: COLORS.primaryDark,
    fontWeight: "500",
  },
  detailLocation: {
    fontSize: 14,
    color: "#6b7280",
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
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  detailDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
  },
  applyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.primaryDark,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  applyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  applyContent: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
  },
  messageInput: {
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 120,
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
  },
  uploadButtonText: {
    color: COLORS.primaryDark,
    fontSize: 14,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#10b981",
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
  myAppsBtn: {
    marginLeft: "auto",
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  myAppsBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
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
  jobBadges: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: SPACING.tiny,
    flexWrap: "wrap",
  },
  jobTypeBadge: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: 4,
  },
  jobTypeBadgeText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.info,
  },
  jobSalaryBadge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: 4,
  },
  jobSalaryBadgeText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.warning,
  },
  jobCardActions: {
    alignItems: "center",
    gap: SPACING.small,
  },
});

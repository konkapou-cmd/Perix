import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
import * as DocumentPicker from "expo-document-picker";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import {
  getJobs,
  getJob,
  applyToJob,
  uploadMedia,
  Job,
  CategoryGroup,
  getBusinessCategories,
} from "../lib/api";
import BusinessMap from "../components/BusinessMap";
import { translateCategory } from "../lib/categoryTranslation";

export default function JobsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { safeGoBackToProfile } = useSafeNavigation();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);

  // Filters
  const [rootCategory, setRootCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [subcategoryModalVisible, setSubcategoryModalVisible] = useState(false);

  // Job detail modal
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Application modal
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [cvFile, setCvFile] = useState<{ name: string; uri: string } | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<{ name: string; uri: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedRootGroup = useMemo(
    () => categories.find((c) => c.slug === rootCategory),
    [categories, rootCategory]
  );

  const translatedRootCategory = rootCategory ? translateCategory(rootCategory, t) : t("locator.allCategories");
  const translatedSubcategory = subcategory ? translateCategory(subcategory, t) : t("locator.allSubcategories");

  useEffect(() => {
    loadCategories();
    requestLocation();
  }, []);

  useEffect(() => {
    if (sessionToken) {
      loadJobs();
    }
  }, [sessionToken, location, rootCategory, subcategory]);

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
      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
    }
  };

  const loadJobs = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const data = await getJobs(sessionToken, {
        latitude: location?.latitude,
        longitude: location?.longitude,
        root_category: rootCategory || undefined,
        subcategory: subcategory || undefined,
      });
      setJobs(data);
    } catch (error) {
      console.error("Failed to load jobs:", error);
    }
    setLoading(false);
  };

  const openJobDetail = async (job: Job) => {
    if (!sessionToken) return;
    try {
      const fullJob = await getJob(sessionToken, job.job_id);
      setSelectedJob(fullJob);
      setDetailModalVisible(true);
    } catch (error) {
      console.error("Failed to load job details:", error);
    }
  };

  const openApplyModal = () => {
    setApplyModalVisible(true);
    setApplicationMessage("");
    setCvFile(null);
    setCoverLetterFile(null);
  };

  const pickDocument = async (type: "cv" | "coverLetter") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const file = { name: result.assets[0].name, uri: result.assets[0].uri };
        if (type === "cv") {
          setCvFile(file);
        } else {
          setCoverLetterFile(file);
        }
      }
    } catch (error) {
      console.error("Document picker error:", error);
    }
  };

  const submitApplication = async () => {
    if (!sessionToken || !selectedJob || !applicationMessage.trim()) {
      Alert.alert(t("common.error"), t("jobs.yourMessage") + " is required");
      return;
    }

    setSubmitting(true);
    try {
      let cvUrl: string | undefined;
      let coverLetterUrl: string | undefined;

      // Upload CV if selected
      if (cvFile) {
        const uploaded = await uploadMedia(sessionToken, cvFile.uri, "document", () => {});
        cvUrl = uploaded;
      }

      // Upload cover letter if selected
      if (coverLetterFile) {
        const uploaded = await uploadMedia(sessionToken, coverLetterFile.uri, "document", () => {});
        coverLetterUrl = uploaded;
      }

      await applyToJob(sessionToken, selectedJob.job_id, {
        message: applicationMessage,
        cv_url: cvUrl,
        cover_letter_url: coverLetterUrl,
      });

      Alert.alert(t("common.success"), t("jobs.applicationSuccess"));
      setApplyModalVisible(false);
      setDetailModalVisible(false);
    } catch (error: any) {
      const message = error?.message || String(error);
      if (message.includes("Already applied")) {
        Alert.alert(t("common.error"), t("jobs.alreadyApplied"));
      } else {
        Alert.alert(t("common.error"), message);
      }
    }
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBackToProfile} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View>
          <Text style={styles.title}>{t("jobs.title")}</Text>
          <Text style={styles.subtitle}>{t("jobs.subtitle")}</Text>
        </View>
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

      {/* Map */}
      <View style={styles.mapContainer}>
        {location ? (
          <BusinessMap
            location={location}
            showUserLocation
            markers={jobs
              .filter((job) => job.latitude && job.longitude)
              .map((job) => ({
                id: job.job_id,
                latitude: job.latitude!,
                longitude: job.longitude!,
                title: job.title,
                description: job.business_name || "",
              }))}
            onMarkerPress={(id) => {
              const job = jobs.find((j) => j.job_id === id);
              if (job) openJobDetail(job);
            }}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="location" size={40} color="#4c6fff" />
            <Text style={styles.mapPlaceholderText}>{t("jobs.tapToEnableLocation")}</Text>
            <Text style={styles.mapPlaceholderSubtext}>{t("jobs.viewNearbyJobs")}</Text>
          </View>
        )}
      </View>

      {/* Job List */}
      <Text style={styles.sectionTitle}>{t("jobs.nearbyJobs")}</Text>
      <ScrollView style={styles.jobList} contentContainerStyle={styles.jobListContent}>
        {loading ? (
          <ActivityIndicator color="#4c6fff" style={{ marginTop: 20 }} />
        ) : jobs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t("jobs.noJobs")}</Text>
          </View>
        ) : (
          jobs.map((job) => (
            <Pressable
              key={job.job_id}
              style={styles.jobCard}
              onPress={() => openJobDetail(job)}
              data-testid={`job-card-${job.job_id}`}
            >
              {job.cover_image ? (
                <Image source={{ uri: job.cover_image }} style={styles.jobImage} />
              ) : (
                <View style={[styles.jobImage, styles.jobImagePlaceholder]}>
                  <Ionicons name="briefcase" size={32} color="#9ca3af" />
                </View>
              )}
              <View style={styles.jobInfo}>
                <Text style={styles.jobTitle} numberOfLines={1}>
                  {job.title}
                </Text>
                <Text style={styles.jobBusiness} numberOfLines={1}>
                  {job.business_name}
                </Text>
                <View style={styles.jobMeta}>
                  <Ionicons name="location-outline" size={14} color="#6b7280" />
                  <Text style={styles.jobLocation} numberOfLines={1}>
                    {job.location}
                  </Text>
                </View>
                {job.distance_km !== undefined && (
                  <Text style={styles.jobDistance}>{job.distance_km} km</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* Category Modal */}
      {/* Category Modal */}
      <Modal visible={categoryModalVisible} animationType="slide" onRequestClose={() => setCategoryModalVisible(false)}>
        <SafeAreaView style={styles.categoryModalContainer}>
          <View style={styles.categoryModalHeader}>
            <Text style={styles.categoryModalTitle}>{t("locator.selectCategory")}</Text>
            <Pressable onPress={() => setCategoryModalVisible(false)}>
              <Ionicons name="close" size={22} color="#111827" />
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

      {/* Job Detail Modal */}
      <Modal visible={detailModalVisible} animationType="slide" onRequestClose={() => setDetailModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setDetailModalVisible(false)}>
              <Ionicons name="close" size={28} color="#111827" />
            </Pressable>
            <Text style={styles.modalTitle}>{t("jobs.title")}</Text>
            <View style={{ width: 28 }} />
          </View>

          {selectedJob && (
            <ScrollView style={styles.modalBody}>
              {selectedJob.cover_image ? (
                <Image source={{ uri: selectedJob.cover_image }} style={styles.detailImage} />
              ) : (
                <View style={[styles.detailImage, styles.detailImagePlaceholder]}>
                  <Ionicons name="briefcase" size={64} color="#9ca3af" />
                </View>
              )}

              <View style={styles.detailContent}>
                <Text style={styles.detailTitle}>{selectedJob.title}</Text>
                
                <View style={styles.detailRow}>
                  {selectedJob.business_logo && (
                    <Image source={{ uri: selectedJob.business_logo }} style={styles.businessLogo} />
                  )}
                  <Text style={styles.detailBusiness}>{selectedJob.business_name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="location-outline" size={18} color="#4c6fff" />
                  <Text style={styles.detailLocation}>{selectedJob.location}</Text>
                </View>

                {selectedJob.latitude && selectedJob.longitude && (
                  <View style={styles.detailMapContainer}>
                    <BusinessMap
                      location={{ latitude: selectedJob.latitude, longitude: selectedJob.longitude }}
                      markers={[{
                        id: selectedJob.job_id,
                        latitude: selectedJob.latitude,
                        longitude: selectedJob.longitude,
                        title: selectedJob.title,
                        description: selectedJob.business_name || "",
                      }]}
                    />
                  </View>
                )}

                <Text style={styles.detailSectionTitle}>{t("jobs.jobDescription")}</Text>
                <Text style={styles.detailDescription}>{selectedJob.description}</Text>

                <Pressable
                  style={styles.applyButton}
                  onPress={openApplyModal}
                  data-testid="apply-job-btn"
                >
                  <Ionicons name="paper-plane" size={20} color="#fff" />
                  <Text style={styles.applyButtonText}>{t("jobs.apply")}</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Apply Modal */}
      <Modal visible={applyModalVisible} animationType="slide" onRequestClose={() => setApplyModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setApplyModalVisible(false)}>
              <Ionicons name="close" size={28} color="#111827" />
            </Pressable>
            <Text style={styles.modalTitle}>{t("jobs.apply")}</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={styles.applyContent}>
            <Text style={styles.inputLabel}>{t("jobs.yourMessage")} *</Text>
            <TextInput
              style={styles.messageInput}
              placeholder={t("jobs.yourMessage")}
              value={applicationMessage}
              onChangeText={setApplicationMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <Text style={styles.inputLabel}>{t("jobs.uploadCV")}</Text>
            <Pressable style={styles.uploadButton} onPress={() => pickDocument("cv")}>
              <Ionicons name="document-attach" size={20} color="#4c6fff" />
              <Text style={styles.uploadButtonText}>
                {cvFile ? cvFile.name : t("jobs.uploadCV")}
              </Text>
            </Pressable>

            <Text style={styles.inputLabel}>{t("jobs.uploadCoverLetter")}</Text>
            <Pressable style={styles.uploadButton} onPress={() => pickDocument("coverLetter")}>
              <Ionicons name="document-attach" size={20} color="#4c6fff" />
              <Text style={styles.uploadButtonText}>
                {coverLetterFile ? coverLetterFile.name : t("jobs.uploadCoverLetter")}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={submitApplication}
              disabled={submitting}
              data-testid="submit-application-btn"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>{t("jobs.submitApplication")}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
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
    color: "#4c6fff",
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
  jobList: {
    flex: 1,
  },
  jobListContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
    color: "#111827",
  },
  jobBusiness: {
    fontSize: 13,
    color: "#4c6fff",
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
    color: "#4c6fff",
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
    color: "#4c6fff",
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
    color: "#111827",
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
    backgroundColor: "#4c6fff",
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
    backgroundColor: "#f9fafb",
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
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
  },
  uploadButtonText: {
    color: "#4c6fff",
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

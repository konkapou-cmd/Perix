import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "../../context/AuthContext";
import BusinessMap from "../../components/BusinessMap";
import ShareContent from "../../components/ShareContent";
import { getJob, applyToJob, uploadMedia, Job, toggleSaved, checkSaved } from "../../lib/api";
import { COLORS } from "../../lib/designTokens";

export default function JobDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");
  const [cvUrl, setCvUrl] = useState<string | undefined>();
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | undefined>();
  const [applying, setApplying] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  useEffect(() => {
    loadJob();
  }, [id, sessionToken]);

  const loadJob = async () => {
    if (!sessionToken || !id) return;
    try {
      const data = await getJob(sessionToken, id);
      setJob(data);
      try {
        const { is_saved } = await checkSaved(sessionToken, "job", id);
        setIsSaved(is_saved);
      } catch (error) {
        console.error("Failed to check saved status:", error);
      }
    } catch (error) {
      console.log("Failed to load job:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!sessionToken || !id || !applicationMessage.trim()) return;
    setApplying(true);
    try {
      await applyToJob(sessionToken, id, {
        message: applicationMessage.trim(),
        cv_url: cvUrl,
        cover_letter_url: coverLetterUrl,
      });
      setApplyModalVisible(false);
      setApplicationMessage("");
      setCvUrl(undefined);
      setCoverLetterUrl(undefined);
      Alert.alert(t("jobs.apply") || "Apply", t("jobs.applied") || "Application submitted!");
    } catch (error: any) {
      Alert.alert(t("common.error") || "Error", error.message || "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  const handleToggleSave = async () => {
    if (!sessionToken) {
      Alert.alert(
        t("common.loginRequired") || "Login Required",
        t("common.loginToSave") || "Please log in to save items",
        [
          { text: t("common.cancel") || "Cancel", style: "cancel" },
          { text: t("auth.login") || "Login", onPress: () => router.push("/login") },
        ]
      );
      return;
    }
    if (!job) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "job", job.job_id);
      setIsSaved(is_saved);
    } catch (error) {
      console.error("Failed to toggle save:", error);
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
    } finally {
      setSavingItem(false);
    }
  };

  const pickDocument = async (type: "cv" | "coverLetter") => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (sessionToken && asset.uri) {
          const url = await uploadMedia(sessionToken, asset.uri, "document");
          if (type === "cv") setCvUrl(url);
          else setCoverLetterUrl(url);
        }
      }
    } catch (error) {
      console.log("Document picker error:", error);
    }
  };

  const openMap = () => {
    if (job?.latitude && job?.longitude) {
      const url = `https://maps.google.com/maps?q=${job.latitude},${job.longitude}`;
      Linking.openURL(url);
    } else if (job?.location) {
      Linking.openURL(`https://maps.google.com/maps?q=${encodeURIComponent(job.location)}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <ActivityIndicator size="large" color={COLORS.textPrimary} />
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <Text style={styles.errorText}>{t("jobs.noJobs") || "Job not found"}</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.textPrimary} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 30}
      >
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={COLORS.textPrimary} />
            <Text style={styles.backText}>{t("common.back")}</Text>
          </Pressable>

          <View style={styles.heroContainer}>
            {job.cover_image ? (
              <Image source={{ uri: job.cover_image }} style={styles.heroMedia} />
            ) : (
              <View style={styles.heroPlaceholder}>
                <View style={styles.heroIconContainer}>
                  <Ionicons name="briefcase" size={32} color="#fff" />
                </View>
              </View>
            )}

            <View style={styles.badgeRow}>
              <View style={styles.typeBadge}>
                <View style={styles.badgeIconContainer}>
                  <Ionicons name="briefcase" size={14} color="#fff" />
                </View>
                <Text style={styles.badgeText}>{job.job_type || "Full-time"}</Text>
              </View>
              {job.salary_range && (
                <View style={styles.salaryBadge}>
                  <View style={styles.badgeIconContainerGold}>
                    <Ionicons name="cash" size={12} color="#fff" />
                  </View>
                  <Text style={styles.badgeText}>{job.salary_range}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>{job.title}</Text>
            {job.business_name && (
              <Pressable
                style={styles.businessRow}
                onPress={() => {
                  if (job.business_id) router.push(`/business/${job.business_id}`);
                }}
              >
                {job.business_logo ? (
                  <Image source={{ uri: job.business_logo }} style={styles.businessLogo} />
                ) : (
                  <View style={styles.businessLogoPlaceholder}>
                    <Ionicons name="business" size={16} color="#6b7280" />
                  </View>
                )}
                <Text style={styles.businessName}>{t("jobs.at") || "at"} {job.business_name}</Text>
                <Ionicons name="chevron-forward" size={16} color="#6b7280" />
              </Pressable>
            )}
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoCard}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="briefcase-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.infoLabel}>{t("jobs.jobType") || "Type"}</Text>
              <Text style={styles.infoValue}>{job.job_type || "—"}</Text>
            </View>
            <View style={styles.infoCard}>
              <View style={styles.infoIconContainerGold}>
                <Ionicons name="cash-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.infoLabel}>{t("jobs.salary") || "Salary"}</Text>
              <Text style={styles.infoValue}>{job.salary_range || "—"}</Text>
            </View>
          </View>

          {job.location && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="location" size={18} color={COLORS.textPrimary} />
                <Text style={styles.cardTitle}>{t("jobs.location") || "Location"}</Text>
              </View>
              <Pressable style={styles.locationRow} onPress={openMap}>
                <Ionicons name="navigate-circle-outline" size={18} color="#3b82f6" />
                <Text style={styles.locationText}>{job.location}</Text>
              </Pressable>
            </View>
          )}

          {job.latitude && job.longitude && (
            <View style={styles.mapContainer}>
              <BusinessMap
                location={{ latitude: job.latitude, longitude: job.longitude }}
                markers={[{
                  id: job.job_id,
                  latitude: job.latitude,
                  longitude: job.longitude,
                  title: job.title,
                  description: job.business_name || "",
                }]}
              />
              <Pressable style={styles.mapOverlay} onPress={openMap}>
                <Ionicons name="map" size={16} color="#fff" />
                <Text style={styles.mapOverlayText}>{t("events.openInMaps") || "Open in Maps"}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text" size={18} color={COLORS.textPrimary} />
              <Text style={styles.cardTitle}>{t("jobs.jobDescription") || "Description"}</Text>
            </View>
            <Text style={styles.description}>{job.description}</Text>
          </View>

          {job.requirements && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.textPrimary} />
                <Text style={styles.cardTitle}>{t("jobs.requirements") || "Requirements"}</Text>
              </View>
              {job.requirements.split("\n").filter((r: string) => r.trim()).map((req: string, i: number) => (
                <View key={i} style={styles.requirementRow}>
                  <Ionicons name="checkmark" size={14} color={COLORS.success} />
                  <Text style={styles.requirementText}>{req.trim()}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actionSection}>
            <Pressable style={styles.applyButton} onPress={() => setApplyModalVisible(true)}>
              <Ionicons name="paper-plane" size={20} color="#fff" />
              <Text style={styles.applyButtonText}>{t("jobs.apply") || "Apply"}</Text>
            </Pressable>
            <Pressable
              style={[styles.shareButton, isSaved && { backgroundColor: `${COLORS.gold}15`, borderColor: COLORS.gold }]}
              onPress={handleToggleSave}
              disabled={savingItem}
            >
              <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={20} color={isSaved ? COLORS.gold : COLORS.textPrimary} />
              <Text style={styles.shareButtonText}>{isSaved ? t("common.saved") || "Saved" : t("jobs.save") || "Save"}</Text>
            </Pressable>
            <Pressable style={styles.shareButton} onPress={() => setShowShareModal(true)}>
              <Ionicons name="share-outline" size={20} color={COLORS.textPrimary} />
              <Text style={styles.shareButtonText}>{t("common.share") || "Share"}</Text>
            </Pressable>
          </View>

          <ShareContent
            visible={showShareModal}
            onClose={() => setShowShareModal(false)}
            contentType="job"
            contentId={job.job_id}
            title={job.title}
            description={job.description}
            imageUrl={job.cover_image || undefined}
            extraData={{
              location: job.location || undefined,
              businessName: job.business_name || undefined,
              salary: job.salary_range || undefined,
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={applyModalVisible} animationType="slide" onRequestClose={() => setApplyModalVisible(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setApplyModalVisible(false)}>
              <Ionicons name="close" size={28} color={COLORS.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t("jobs.apply") || "Apply"}</Text>
            <View style={{ width: 28 }} />
          </View>
          <ScrollView style={styles.modalBody} contentContainerStyle={styles.applyContent}>
            <Text style={styles.inputLabel}>{t("jobs.yourMessage") || "Your Message"} *</Text>
            <TextInput
              style={styles.messageInput}
              placeholder={t("jobs.yourMessage") || "Your Message"}
              value={applicationMessage}
              onChangeText={setApplicationMessage}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />

            <Text style={styles.inputLabel}>{t("jobs.uploadCV") || "Upload CV"}</Text>
            <Pressable style={styles.uploadButton} onPress={() => pickDocument("cv")}>
              <Ionicons name="document-attach" size={20} color={COLORS.textPrimary} />
              <Text style={styles.uploadButtonText}>{cvUrl ? "CV uploaded" : t("jobs.uploadCV") || "Upload CV"}</Text>
            </Pressable>

            <Text style={styles.inputLabel}>{t("jobs.uploadCoverLetter") || "Cover Letter"}</Text>
            <Pressable style={styles.uploadButton} onPress={() => pickDocument("coverLetter")}>
              <Ionicons name="document-attach" size={20} color={COLORS.textPrimary} />
              <Text style={styles.uploadButtonText}>{coverLetterUrl ? "Cover letter uploaded" : t("jobs.uploadCoverLetter") || "Upload Cover Letter"}</Text>
            </Pressable>

            <Pressable
              style={[styles.submitApplyButton, (!applicationMessage.trim() || applying) && styles.disabledButton]}
              onPress={handleApply}
              disabled={!applicationMessage.trim() || applying}
            >
              {applying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={20} color="#fff" />
              )}
              <Text style={styles.submitApplyText}>{t("jobs.apply") || "Apply"}</Text>
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
    backgroundColor: COLORS.backgroundPage,
  },
  flex1: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.backgroundPage,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 16,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: COLORS.textPrimary,
    marginLeft: 4,
  },
  heroContainer: {
    marginHorizontal: 16,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroMedia: {
    width: "100%",
    height: 160,
  },
  heroPlaceholder: {
    width: "100%",
    height: 160,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  heroIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: COLORS.info,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    borderRadius: 20,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    gap: 4,
  },
  salaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fefce8",
    borderRadius: 20,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    gap: 4,
  },
  badgeIconContainer: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: COLORS.info,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeIconContainerGold: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: COLORS.warning,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  businessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  businessLogo: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  businessLogoPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  businessName: {
    fontSize: 14,
    color: "#3b82f6",
    fontWeight: "500",
    flex: 1,
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.info,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  infoIconContainerGold: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.warning,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    color: "#4b5563",
    flex: 1,
  },
  mapContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: "hidden",
    height: 200,
    position: "relative",
  },
  mapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827e6",
    paddingVertical: 10,
    gap: 6,
  },
  mapOverlayText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    color: "#4b5563",
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  requirementText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#4b5563",
  },
  actionSection: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  applyButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.textPrimary,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  applyButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 6,
  },
  shareButtonText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  applyContent: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 12,
  },
  messageInput: {
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    minHeight: 120,
    textAlignVertical: "top",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    backgroundColor: COLORS.surfaceSoft,
  },
  uploadButtonText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  submitApplyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.textPrimary,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  submitApplyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
});

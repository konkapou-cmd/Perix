import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import ShareContent from "../../components/ShareContent";
import { getJob, applyToJob, uploadMedia, Job, toggleSaved, checkSaved } from "../../lib/api";
import { ContentHero, ContentGallery, ContentMap, ContentSection } from "../../components/shared";
import { InfoCard } from "../../components/shared/InfoCard";
import { LocationCard } from "../../components/shared/LocationCard";
import EntityMapSection from "../../components/shared/EntityMapSection";
import ErrorState from "../../components/shared/ErrorState";
import { ChecklistCard } from "../../components/shared/ChecklistCard";
import { ShareSection } from "../../components/shared/ShareSection";
import { BottomCTA } from "../../components/shared/BottomCTA";
import { EntityHeader } from "../../components/shared/EntityHeader";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { normalizeId } from "../../lib/navigation/entityRoutes";

export default function JobDetailPage() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = normalizeId(rawId);
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
    if (!id) { setLoading(false); return; }
    if (!sessionToken) return;
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

  if (!id) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "bottom"]}>
        <ErrorState
          message={t("jobs.invalidJob", "Diese Jobanzeige kann nicht geöffnet werden.")}
          fullWidth
        />
        <Pressable style={styles.notFoundBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.jobsAccent} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "bottom"]}>
        <ActivityIndicator size="large" color={COLORS.jobsAccent} />
      </SafeAreaView>
    );
  }

  if (!job) {
    return (
      <SafeAreaView style={styles.centered} edges={["top", "bottom"]}>
        <ErrorState
          message={t("jobs.noJobs", "Stellenanzeige nicht gefunden")}
          fullWidth
          onRetry={() => loadJob()}
        />
        <Pressable style={styles.notFoundBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.jobsAccent} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const mediaItems = [
    ...(job.cover_image ? [{ uri: job.cover_image, type: "image" as const }] : []),
    ...(job.image_urls || []).map((uri: string) => ({ uri, type: "image" as const })),
    ...(job.gallery_images || []).map((uri: string) => ({ uri, type: "image" as const })),
    ...(job.gallery_videos || []).map((uri: string) => ({ uri, type: "video" as const })),
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
          <ContentHero
            coverImageUrl={job.cover_image}
            videoUrl={job.video_url}
            isCoverVideo={!job.cover_image && !!job.video_url}
            coverFocalPoint={job.cover_focal_point}
            imageUrls={job.image_urls || []}
            title={job.title}
            badges={job.job_type ? [{ icon: "briefcase", text: job.job_type, color: COLORS.jobsAccent }] : []}
            subtitle={job.business_name ? { text: job.business_name, icon: "business-outline" } : undefined}
            mediaItems={mediaItems}
          />

          <EntityHeader
            title={job.title}
            subtitle={job.business_name || ""}
            subtitlePrefix="bei"
            avatarUrl={job.business_logo}
            accentColor={COLORS.jobsAccent}
            onPress={job.business_id ? () => router.push(`/business/${job.business_id}`) : undefined}
          />

          <View style={styles.infoRow}>
            <InfoCard
              icon="briefcase-outline"
              label={t("jobs.jobType") || "Art"}
              value={job.job_type || "—"}
              accentColor={COLORS.jobsAccent}
            />
            <InfoCard
              icon="cash-outline"
              label={t("jobs.salary") || "Gehalt"}
              value={job.salary_range || "—"}
              accentColor={COLORS.warning}
            />
          </View>

          <EntityMapSection
            address={job.location}
            latitude={job.latitude}
            longitude={job.longitude}
            title={job.title}
            accentColor={COLORS.jobsAccent}
          />

          <ContentSection icon="document-text" title={t("jobs.jobDescription") || "Beschreibung"}>
            <Text style={styles.description}>{job.description}</Text>
          </ContentSection>

          {job.requirements && (
            <ChecklistCard
              icon="checkmark-circle-outline"
              title={t("jobs.requirements") || "Anforderungen"}
              items={job.requirements.split("\n").filter((r: string) => r.trim()).map((r: string) => r.trim())}
              accentColor={COLORS.jobsAccent}
            />
          )}

          {(job.image_urls || job.gallery_images || job.gallery_videos) && (
            <ContentGallery
              mediaItems={[
                ...(job.image_urls || []).map(uri => ({ uri, type: "image" as const })),
                ...(job.gallery_images || []).map(uri => ({ uri, type: "image" as const })),
                ...(job.gallery_videos || []).map(uri => ({ uri, type: "video" as const })),
              ]}
              title="Galerie"
            />
          )}

          {job.business_id && job.business_name && (
            <Pressable
              style={styles.businessRow}
              onPress={() => router.push(`/business/${job.business_id}`)}
            >
              {job.business_logo ? (
                <Image source={{ uri: job.business_logo }} style={styles.businessLogoSm} />
              ) : (
                <View style={styles.businessLogoPlaceholderSm}>
                  <Ionicons name="business" size={16} color={COLORS.textSecondary} />
                </View>
              )}
              <Text style={styles.businessRowText}>{t("services.viewBusiness") || "Unternehmen ansehen"}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
            </Pressable>
          )}

          <ShareSection
            accentColor={COLORS.jobsAccent}
            saved={isSaved}
            onWhatsApp={() => setShowShareModal(true)}
            onShare={() => setShowShareModal(true)}
            onSave={handleToggleSave}
          />

          <BottomCTA
            primaryLabel={t("jobs.apply") || "Jetzt bewerben"}
            primaryIcon="paper-plane"
            accentColor={COLORS.jobsAccent}
            onPrimary={() => setApplyModalVisible(true)}
            saved={isSaved}
            onSave={handleToggleSave}
            onShare={() => setShowShareModal(true)}
          />
        </ScrollView>
      </KeyboardAvoidingView>

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
  container: { flex: 1, backgroundColor: COLORS.backgroundPage, overflow: "hidden" },
  flex1: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.backgroundPage },
  content: { paddingBottom: 60 },
  errorText: { fontSize: 16, color: COLORS.textSecondary, marginBottom: 16 },
  notFoundBack: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.small },
  backText: { fontSize: FONT_SIZES.body, color: COLORS.jobsAccent, marginLeft: 4 },
  infoRow: {
    flexDirection: "row",
    gap: SPACING.compact,
    marginTop: SPACING.small,
    paddingHorizontal: SPACING.page,
  },
  description: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, lineHeight: 24 },
  businessRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.small,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.card,
    padding: SPACING.section, marginHorizontal: SPACING.page,
    ...SHADOWS.subtle,
  },
  businessLogoSm: { width: 28, height: 28, borderRadius: 14 },
  businessLogoPlaceholderSm: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.surfaceGray, alignItems: "center", justifyContent: "center",
  },
  businessRowText: { flex: 1, fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.jobsAccent },
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: FONT_SIZES.h4, fontWeight: "600", color: COLORS.textPrimary },
  modalBody: { flex: 1 },
  applyContent: { padding: SPACING.section },
  inputLabel: { fontSize: 14, fontWeight: "600", color: COLORS.textDark, marginBottom: 6, marginTop: SPACING.compact },
  messageInput: {
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.compact,
    fontSize: 16,
    color: COLORS.textPrimary,
    minHeight: 120,
    textAlignVertical: "top",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
    padding: 14,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    backgroundColor: COLORS.surfaceSoft,
  },
  uploadButtonText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: "500" },
  submitApplyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.jobsAccent,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.button,
    marginTop: SPACING.page,
    gap: SPACING.small,
  },
  submitApplyText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "600" },
  disabledButton: { opacity: 0.5 },
});

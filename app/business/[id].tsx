import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { buildMediaItems } from "../../lib/api/mediaUtils";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import {
  BusinessDetail,
  createPost,
  getBusinessDetail,
  Post,
  uploadMedia,
  uploadVideoMux,
  UploadProgress,
  MAX_VIDEO_SIZE_BYTES,
  reportBusiness,
  getFriendshipStatus,
  toggleFriend,
  toggleSaved,
  checkSaved,
  APP_URL,
} from "../../lib/api";
import { MEDIA_LIMITS } from "../../lib/constants/mediaLimits";
import { useAuth } from "../../context/AuthContext";
import { COLORS } from "../../lib/designTokens";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";

import { BusinessProfilePremium } from "../../components/profile/BusinessProfilePremium";
import ServiceBookingModal from "../../components/business/ServiceBookingModal";
import UploadProgressSheet from "../../components/UploadProgressSheet";

export default function BusinessDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user, activeIdentity } = useAuth();
  const router = useRouter();

  // Main data
  const [businessDetail, setBusinessDetail] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Check if current user is the owner
  // Always read-only UNLESS accessed from profile section (never from public links)
  const isOwner = activeIdentity?.type === 'business' && activeIdentity?.id === id;

  // Post creation state (only for owner)
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideo, setPostVideo] = useState<string | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);
  const [postMediaRatio, setPostMediaRatio] = useState<number | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // Media viewers
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerItems, setMediaViewerItems] = useState<MediaItem[]>([]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);

  // Report State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

// Friend State
const [friendStatus, setFriendStatus] = useState<"friends" | "request_sent" | "request_received" | "none">("none");
const [followLoading, setFollowLoading] = useState(false);

  // Save State
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Booking State
  const [bookingService, setBookingService] = useState<any>(null);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);

  const loadBusiness = useCallback(async () => {
    if (!sessionToken || !id) return;
    setLoading(true);
    try {
      const detail = await getBusinessDetail(sessionToken, id);
      setBusinessDetail(detail);
      
      try {
        const { is_saved } = await checkSaved(sessionToken, "business", id);
        setIsSaved(is_saved);
      } catch (e) {
        console.log("Check saved failed:", e);
      }
      
      // Track profile view analytics
      try {
        const { trackProfileView } = await import("../../lib/api");
        await trackProfileView(sessionToken, undefined, undefined, id);
      } catch (e) {
        console.log("Analytics tracking skipped");
      }
    } catch (error) {
      console.error("Failed to load business detail:", error);
      setBusinessDetail(null);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadBusiness(), loadFollowStatus()]);
    setRefreshing(false);
  };

  const loadFollowStatus = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const data = await getFriendshipStatus(sessionToken, "business", id);
      setFriendStatus(data.status);
    } catch (error) {
      console.error("Failed to load follow status:", error);
      setFriendStatus("none");
    }
  }, [sessionToken, id]);

  useEffect(() => {
    loadBusiness();
    loadFollowStatus();
  }, [loadBusiness, loadFollowStatus]);

  const handleFollowPress = async () => {
    if (!sessionToken || !id) return;
    setFollowLoading(true);
    try {
      const result = await toggleFriend(sessionToken, "business", id);
      setFriendStatus(result.is_friend ? "friends" : "none");
    } catch (error) {
      console.error("Failed to toggle friend:", error);
    } finally {
      setFollowLoading(false);
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
    if (!id) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "business", id);
      setIsSaved(is_saved);
    } catch (error) {
      console.error("Failed to toggle save:", error);
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
    } finally {
      setSavingItem(false);
    }
  };

  const handleMessagePress = () => {
    if (!id) return;
    router.push({
      pathname: "/messages/[id]",
      params: { id: id, name: businessDetail?.business.name },
    });
  };

  const handleOpenChat = () => {
    router.push({
      pathname: "/messages/[id]",
      params: { id: id, name: businessDetail?.business.name },
    });
  };

  const handleShareBusiness = () => {
    const url = `${APP_URL}/business/${id}`;
    Share.share({ message: url, url });
  };

  const handleOpenBooking = (service: any) => {
    setBookingService(service);
    setBookingModalVisible(true);
  };

  const pickPostImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: false,
    });
    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
      const asset = result.assets[0];
      setPostMediaRatio(asset.width && asset.height ? asset.width / asset.height : null);
      setPostImage(asset.uri);
      setPostVideo(null);
      setPostVideoPreview(null);
    }
  };

  const pickPostVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
      const asset = result.assets[0];
      setPostMediaRatio(asset.width && asset.height ? asset.width / asset.height : null);
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(t("common.error") || "Error", `Das Video ist zu groß. Maximal erlaubt sind ${MEDIA_LIMITS.post.maxVideoFileSizeMb} MB.`);
        return;
      }
      if (asset.duration != null && asset.duration > MEDIA_LIMITS.post.maxVideoDurationSeconds) {
        Alert.alert("Video zu lang", `Videos dürfen maximal ${MEDIA_LIMITS.post.maxVideoDurationSeconds} Sekunden lang sein.`);
        return;
      }
      const uri = asset.uri;
      setPostVideoPreview(uri);
      setPostImage(null);
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const muxResult = await uploadVideoMux(sessionToken, uri, undefined, (progress) => {
            setUploadProgress(progress);
          });
          setPostVideo(muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null));
          setTimeout(() => {
            setShowUploadProgress(false);
            setUploadProgress(null);
          }, 1000);
        } catch (error) {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
          setPostVideo(null);
        }
      }
    }
  };

  const handleCreatePost = async (eventOrText?: any) => {
    if (isPosting || !sessionToken || !businessDetail || !isOwner) return;
    const text = typeof eventOrText === 'string' ? eventOrText : postText;
    if (!text.trim() && !postImage && !postVideo && !postVideoPreview) return;

    try {
      setIsPosting(true);
      setShowUploadProgress(true);
      setUploadProgress({ phase: "preparing", progress: 0 });

      let uploadedImageUrl = undefined;
      let uploadedVideoUrl = undefined;

      if (postImage) {
        setUploadProgress({ phase: "uploading", progress: 30 });
        uploadedImageUrl = await uploadMedia(sessionToken, postImage, "image");
      }
      if (postVideo) {
        setUploadProgress({ phase: "uploading", progress: 60 });
        uploadedVideoUrl = postVideo; // Already uploaded during video pick
      }

      const businessId = businessDetail?.business?.business_id;

      setUploadProgress({ phase: "processing", progress: 90 });

      const newPost = await createPost(
        sessionToken,
        text.trim(),
        undefined,
        undefined,
        businessId,
        { type: "business", id: businessId },
        postMediaRatio,
        [],
        undefined,
        undefined,
        uploadedImageUrl,
        uploadedVideoUrl
      );

      // Add post to the feed
      await loadBusiness();

      setPostText("");
      setPostImage(null);
      setPostVideo(null);
      setPostVideoPreview(null);
      setShowUploadProgress(false);
      setUploadProgress(null);

      Alert.alert("Success", "Post created successfully!");
    } catch (error) {
      setShowUploadProgress(false);
      setUploadProgress(null);
      setPostImage(null);
      setPostVideo(null);
      setPostVideoPreview(null);
      console.error("Failed to create post:", error);
      Alert.alert("Error", "Failed to create post. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  const allMediaItems = useMemo(() => {
    if (!businessDetail) return [];
    const items = buildMediaItems(businessDetail.business);
    (businessDetail.posts || []).forEach((p: any) => {
      if (p.image_url && !items.some(i => i.uri === p.image_url)) items.push({ type: "image", uri: p.image_url });
      if (p.video_url && !items.some(i => i.uri === p.video_url)) items.push({ type: "video", uri: p.video_url });
    });
    return items;
  }, [businessDetail]);

  const openMediaViewer = (uri: string, type: "image" | "video") => {
    if (!businessDetail) return;
    const index = allMediaItems.findIndex(item => item.uri === uri);
    setMediaViewerItems(allMediaItems);
    setMediaViewerIndex(index >= 0 ? index : 0);
    setMediaViewerVisible(true);
  };

  const handleReportBusiness = async () => {
    if (!sessionToken || !id || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      await reportBusiness(sessionToken, id as string, reportReason.trim());
      setReportModalVisible(false);
      setReportReason("");
      Alert.alert(
        t("userProfile.reportSubmitted") || "Report Submitted",
        t("businessProfile.reportMessage") || "Thank you for your report. Our team will review it shortly.",
        [{ text: t("common.ok"), onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error("Failed to report business:", error);
      Alert.alert(t("common.error"), error.message || t("common.error"));
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
      </SafeAreaView>
    );
  }

  if (!businessDetail) {
    return (
      <SafeAreaView style={styles.centered}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primaryDark} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{t("businessProfile.notFound")}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            setLoading(true);
            loadBusiness();
          }}
        >
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 44 : 0}
      >
      <View style={{ flex: 1, ...Platform.select({ web: { width: "100%", maxWidth: 914, alignSelf: "center" } as any, default: {} }) }}>
        <Pressable style={styles.backButtonRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primaryDark} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>

        <BusinessProfilePremium
          business={businessDetail}
          sessionToken={sessionToken || ""}
          events={businessDetail.events || []}
          refreshing={refreshing}
          onRefresh={onRefresh}
          categoryTree={[]}
          openCategoryModal={() => {}}
          openEventModal={() => {}}
          handleDeleteEvent={() => {}}
          postText={postText}
          setPostText={setPostText}
          postImage={postImage}
          postVideo={postVideo}
          postVideoPreview={postVideoPreview}
          pickPostImage={pickPostImage}
          pickPostVideo={pickPostVideo}
          handleCreatePost={handleCreatePost}
          isPosting={isPosting}
          uploadPercent={uploadProgress?.progress || 0}
          isOwnProfile={false}
          jobs={businessDetail.jobs || []}
          rentals={businessDetail.rentals || []}
          services={businessDetail.services || []}
          openJobModal={() => {}}
          handleDeleteJob={() => {}}
          fanGalleryPosts={[]}
          handleHideFanPost={() => {}}
          openingHours={businessDetail.business.opening_hours || {}}
          openHoursModal={undefined}
          openLocationModal={() => {}}
          galleryImages={businessDetail.business.gallery_images || []}
          galleryVideos={businessDetail.business.gallery_videos || []}
          handleAddGalleryPhoto={() => {}}
          handleAddGalleryVideo={() => {}}
          openMediaViewer={openMediaViewer}
          analytics={null}
          analyticsLoading={false}
          loadAnalytics={() => {}}
          themeModalVisible={false}
          setThemeModalVisible={() => {}}
          readOnly={true}
          businessPosts={businessDetail.posts || []}
          showMessageButton={true}
          onMessagePress={handleOpenChat}
          onShare={handleShareBusiness}
          slug={id}
          friendStatus={friendStatus}
          onFollowPress={handleFollowPress}
          onSavePress={handleToggleSave}
          isSaved={isSaved}
          savingItem={savingItem}
          avatarUri={businessDetail.business.logo_image}
          openBookingModal={handleOpenBooking}
        />
      </View>

      <UploadProgressSheet visible={showUploadProgress} progress={uploadProgress} context="gallery" mode="inline" onDismiss={() => { setShowUploadProgress(false); setUploadProgress(null); }} />

      <LazyMediaViewer
        visible={mediaViewerVisible}
        media={mediaViewerItems}
        initialIndex={mediaViewerIndex}
        onClose={() => setMediaViewerVisible(false)}
      />

      {/* Report Modal */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>
                {t("businessProfile.reportBusiness") || "Report Business"}
              </Text>
              <Pressable onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            <Text style={styles.reportModalDescription}>
              {t("businessProfile.reportDescription") ||
                "Please describe why you are reporting this business. Our team will review your report."}
            </Text>
            <ScrollView style={{ maxHeight: 100 }}>
              <TextInput
                style={styles.reportTextInput}
                placeholder={t("userProfile.reportPlaceholder") || "Describe the issue..."}
                placeholderTextColor="#999"
                value={reportReason}
                onChangeText={setReportReason}
                multiline
                numberOfLines={4}
              />
            </ScrollView>
            <Pressable
              style={[
                styles.reportSubmitButton,
                !reportReason.trim() && styles.reportSubmitButtonDisabled,
              ]}
              onPress={handleReportBusiness}
              disabled={!reportReason.trim() || reportLoading}
            >
              {reportLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.reportSubmitButtonText}>
                  {t("userProfile.submitReport") || "Submit Report"}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
      <ServiceBookingModal
        visible={bookingModalVisible}
        service={bookingService}
        rootCategory={businessDetail?.business?.root_category || ""}
        sessionToken={sessionToken || ""}
        userName={user?.name || user?.email || ""}
        userEmail={user?.email || ""}
        onClose={() => setBookingModalVisible(false)}
        onSuccess={() => loadBusiness()}
      />

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  backButtonRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 8 },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { color: COLORS.primaryDark, fontWeight: "600", marginLeft: 4 },
  errorText: { color: "#ef4444", fontSize: 16, fontWeight: "600", marginTop: 16, textAlign: "center" },
  retryButton: { backgroundColor: COLORS.primaryDark, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 16 },
  retryButtonText: { color: "#fff", fontWeight: "600" },
  reportModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  reportModalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400 },
  reportModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  reportModalTitle: { fontSize: 18, fontWeight: "700", color: "#1f2937" },
  reportModalDescription: { fontSize: 14, color: "#666", marginBottom: 16, lineHeight: 20 },
  reportTextInput: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, fontSize: 15, color: "#1f2937", minHeight: 100, textAlignVertical: "top", marginBottom: 16 },
  reportSubmitButton: { backgroundColor: "#ef4444", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  reportSubmitButtonDisabled: { backgroundColor: "#fca5a5" },
  reportSubmitButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  messageComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 8,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    backgroundColor: COLORS.surfaceSoft,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: "#9ca3af" },
});

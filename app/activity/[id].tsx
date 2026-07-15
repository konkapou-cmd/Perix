import React, { useEffect, useRef, useState } from "react";
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
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useSocket, useSocketEvent } from "../../context/SocketContext";

import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { formatDate, formatTime } from "../../lib/formatDate";
import { buildMediaItems } from "../../lib/api/mediaUtils";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import { ContentHero, ContentGallery, ContentMap, ContentSection } from "../../components/shared";
import { InfoCard } from "../../components/shared/InfoCard";
import { LocationCard } from "../../components/shared/LocationCard";
import EntityMapSection from "../../components/shared/EntityMapSection";
import ErrorState from "../../components/shared/ErrorState";
import { ShareSection as ShareSectionComponent } from "../../components/shared/ShareSection";
import { EntityHeader } from "../../components/shared/EntityHeader";
import { BottomCTA } from "../../components/shared/BottomCTA";
import {
  ActivityItem,
  ChatMessage,
  getActivityDetail,
  getActivityMessages,
  rsvpActivity,
  sendActivityMessage,
  ACTIVITY_TYPES,
  isUpcomingActivity,
  toggleSaved,
  checkSaved,
} from "../../lib/api";
import ShareContent from "../../components/ShareContent";
import ChatSection from "../../components/shared/ChatSection";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ActivityDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const { connected, subscribe, unsubscribe } = useSocket();
  const router = useRouter();
  const { showLocalNotification } = useNotifications();
  const [activity, setActivity] = useState<ActivityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [myStatus, setMyStatus] = useState<string>("pending");
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const [themedAlertVisible, setThemedAlertVisible] = useState(false);
  const [themedAlertMessage, setThemedAlertMessage] = useState("");

  const showThemedAlert = (message: string) => {
    setThemedAlertMessage(message);
    setThemedAlertVisible(true);
  };

  const isCreator = activity?.is_creator ?? (activity?.creator_id === user?.user_id);

  const shareActivity = async () => {
    try {
      const activityUrl = `${BACKEND_URL?.replace('/api', '')}/share/activity/${activity?.activity_id || ""}`;
      await Share.share({
        message: `${activity?.title} - ${activity?.date} ${activity?.time}${activity?.location ? ` @ ${activity.location}` : ""}\n\n${activityUrl}`,
      });
    } catch (e) {}
  };

  useEffect(() => {
    loadActivity();
  }, [id, sessionToken]);

  useSocketEvent("channel_message", (data: any) => {
    if (data.channel === `activity:${id}` && data.message) {
      setChatMessages((prev) => {
        const exists = prev.some((m) => m.message_id === data.message.message_id);
        if (exists) return prev;
        return [...prev, data.message];
      });
    }
  });

  useEffect(() => {
    if (!id) return;
    subscribe(`activity:${id}`);
    return () => unsubscribe(`activity:${id}`);
  }, [id, subscribe, unsubscribe]);

  useEffect(() => {
    if (sessionToken && id) {
      loadChatMessages(true);
      const interval = setInterval(() => { loadChatMessages(false); }, connected ? 30000 : 15000);
      return () => clearInterval(interval);
    }
  }, [sessionToken, id, connected]);

  const loadActivity = async () => {
    if (!id || !sessionToken) return;
    setLoading(true);
    try {
      const activityData = await getActivityDetail(sessionToken, id);
      setActivity(activityData);
      setMyStatus(activityData.my_status || "pending");
      try {
        const { is_saved } = await checkSaved(sessionToken, "activity", id);
        setIsSaved(is_saved);
      } catch (_) {}
    } catch (_) {
      showThemedAlert(t("activities.activityNotFound"));
    }
    setLoading(false);
  };

  const handleToggleSave = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.loginRequired") || "Login", t("common.loginToSave") || "Please log in", [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("auth.login"), onPress: () => router.push("/login") },
      ]);
      return;
    }
    if (!activity) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "activity", activity.activity_id);
      setIsSaved(is_saved);
    } catch (_) {
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
    } finally {
      setSavingItem(false);
    }
  };

  const loadChatMessages = async (isInitial = false) => {
    if (!sessionToken || !id) return;
    if (isInitial) setLoadingChat(true);
    try {
      const messages = await getActivityMessages(sessionToken, id);
      setChatMessages(prev => {
        const existingIds = new Set(prev.map(m => m.message_id));
        const newMsgs = messages.filter(m => !existingIds.has(m.message_id));
        if (newMsgs.length === 0) return prev;
        const merged = [...prev, ...newMsgs];
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return merged;
      });
      if (isInitial) setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (_) {}
    if (isInitial) setLoadingChat(false);
  };

  const handleSendMessage = async () => {
    if (!sessionToken || !id || !chatText.trim() || sendingMessage) return;
    setSendingMessage(true);
    try {
      const newMsg = await sendActivityMessage(sessionToken, id, chatText.trim());
      setChatMessages(prev => [...prev, newMsg]);
      setChatText("");
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) { showThemedAlert(t("common.pleaseTryAgain")); }
    finally { setSendingMessage(false); }
  };

  const handleSendMedia = async (mediaUrl: string, mediaType: string) => {
    if (!sessionToken || !id || sendingMessage) return;
    setSendingMessage(true);
    try {
      const newMsg = await sendActivityMessage(sessionToken, id, "", mediaUrl);
      setChatMessages(prev => [...prev, newMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) { showThemedAlert(t("common.pleaseTryAgain")); }
    finally { setSendingMessage(false); }
  };

  const handleRsvp = async (status: "going" | "maybe" | "declined") => {
    if (!sessionToken || !id) return;
    try {
      const result = await rsvpActivity(sessionToken, id, status);
      setMyStatus(result.my_status);
    } catch (_) { showThemedAlert(t("common.pleaseTryAgain")); }
  };

  const handleSetReminder = () => {
    Alert.alert(
      t("activities.setReminder") || "Set Reminder",
      t("activities.reminderOptions") || "When?",
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: "15 min before", onPress: () => scheduleActivityReminder(15) },
        { text: "1 hour before", onPress: () => scheduleActivityReminder(60) },
        { text: "1 day before", onPress: () => scheduleActivityReminder(60 * 24) },
      ]
    );
  };

  const scheduleActivityReminder = async (minutesBefore: number) => {
    if (!activity) return;
    const reminderTime = new Date(activity.date + "T" + activity.time);
    reminderTime.setMinutes(reminderTime.getMinutes() - minutesBefore);
    if (reminderTime <= new Date()) {
      showThemedAlert(t("activities.pastTimeError") || "Already started.");
      return;
    }
    await showLocalNotification(
      t("activities.reminderTitle") || "Activity Reminder",
      t("activities.reminderBody", { title: activity.title }) || `${activity.title} in ${minutesBefore}m`,
      { type: "activity", activity_id: activity.activity_id }
    );
    showThemedAlert(t("activities.reminderSetDesc") || "Reminder set!");
  };

  const copyInvitationCode = async () => {
    if (!activity?.invitation_code) return;
    await Share.share({ message: activity.invitation_code, title: t("activities.invitationCode") || "Code" });
  };

  const shareToWhatsApp = async () => {
    if (!activity) return;
    const organizer = activity.creator?.name || "";
    const location = activity.location || "";
    let message = `${t("activities.invitationMessage", { title: activity.title, organizer, date: formatDate(activity.date), time: activity.time, location })}`;
    if (activity.is_private && activity.invitation_code) {
      message += `\n\n${t("activities.useCodeToJoin") || "Code"}: ${activity.invitation_code}`;
    }
    const activityUrl = `${BACKEND_URL?.replace('/api', '')}/share/activity/${activity.activity_id}`;
    message += `\n\n${t("activities.rsvpHere")}: ${activityUrl}`;
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) await Linking.openURL(whatsappUrl);
      else await Share.share({ message });
    } catch (_) { await Share.share({ message }); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={COLORS.activityAccent} size="large" />
      </SafeAreaView>
    );
  }

  if (!activity) {
    return (
      <SafeAreaView style={styles.centered}>
        <ErrorState
          message={t("activities.activityNotFound", "Aktivität nicht gefunden")}
          fullWidth
          onRetry={() => loadActivity()}
        />
        <Pressable style={[styles.backButton, { backgroundColor: COLORS.activityAccent }]} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const themeLabel = activity.custom_theme ||
    (activity.theme ? (ACTIVITY_TYPES as Record<string, any>)[activity.theme]?.label : null);
  const isPast = !isUpcomingActivity(activity);
  const allMediaItems = activity ? buildMediaItems(activity) : [];
  const organizer = activity.creator?.name || "";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <Modal visible={themedAlertVisible} transparent animationType="fade">
        <View style={styles.themedAlertOverlay}>
          <View style={styles.themedAlertContainer}>
            <Text style={styles.themedAlertMessage}>{themedAlertMessage}</Text>
            <Pressable style={styles.themedAlertButton} onPress={() => setThemedAlertVisible(false)}>
              <Text style={styles.themedAlertButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 30}
      >
        <ScrollView
          style={[styles.flex1, Platform.OS === "web" ? { width: "100%", maxWidth: 914, alignSelf: "center" } as any : undefined]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ContentHero
            coverImageUrl={activity.cover_image_url}
            videoUrl={activity.video_url}
            muxThumbnailUrl={(activity as any).mux_thumbnail_url}
            videoStatus={(activity as any).video_status}
            isCoverVideo={!activity.cover_image_url && !!activity.video_url}
            coverFocalPoint={activity.cover_focal_point}
            imageUrls={activity.image_urls}
            title={activity.title}
            badges={[
              isPast
                ? { icon: "flag", text: t("activities.pastActivity") || "Past Activity" }
                : { icon: "people", text: themeLabel || t("activities.activity") || "Activity" },
              ...(activity.is_private ? [{ icon: "lock-closed", text: t("activities.private") || "Private" }] : []),
            ]}
            subtitle={activity.creator ? {
              text: `${t("activities.by")} ${activity.creator.name}`,
              avatarUrl: activity.creator.profile_photo || undefined,
              onPress: () => router.push(`/user/${activity.creator?.user_id}`),
            } : undefined}
            mediaItems={allMediaItems}
            onMediaPress={(idx) => {
              setViewerMedia(allMediaItems);
              setViewerIndex(idx);
              setViewerOpen(true);
            }}
          />

          {activity.is_private && activity.is_creator && activity.invitation_code && (
            <View style={styles.invitationCodeCard}>
              <View style={styles.invitationCodeRow}>
                <Ionicons name="key" size={20} color={COLORS.textPrimary} />
                <Text style={styles.invitationCodeLabel}>{t("activities.invitationCode") || "Code"}</Text>
              </View>
              <View style={styles.invitationCodeValueRow}>
                <Text style={styles.invitationCodeValue}>{activity.invitation_code}</Text>
                <Pressable style={styles.copyButton} onPress={copyInvitationCode}>
                  <Ionicons name="copy-outline" size={18} color={COLORS.activityAccent} />
                </Pressable>
              </View>
              <Text style={styles.invitationCodeHint}>{t("activities.shareCodeHint") || "Share this code"}</Text>
            </View>
          )}

          <EntityHeader
            title={activity.title}
            subtitle={organizer || ""}
            subtitlePrefix="von"
            avatarUrl={activity.creator?.profile_photo}
            avatarIcon="people-outline"
            accentColor={COLORS.activityAccent}
            onPress={activity.creator?.user_id ? () => router.push(`/user/${activity.creator.user_id}`) : undefined}
          />

          <View style={styles.infoRow}>
            <InfoCard
              icon="calendar-outline"
              label={t("activities.date") || "Datum"}
              value={formatDate(activity.date)}
              accentColor={COLORS.activityAccent}
            />
            <InfoCard
              icon="time-outline"
              label={t("activities.time") || "Uhrzeit"}
              value={activity.time}
              accentColor={COLORS.activityAccent}
            />
          </View>

          <EntityMapSection
            address={activity.location}
            latitude={activity.latitude}
            longitude={activity.longitude}
            title={activity.title}
            accentColor={COLORS.activityAccent}
          />

          {activity.description && (
            <ContentSection icon="document-text" title={t("activities.description") || "Beschreibung"}>
              <Text style={styles.descriptionText}>{activity.description}</Text>
            </ContentSection>
          )}

          {allMediaItems.length > 0 && (
            <ContentGallery mediaItems={allMediaItems} title="Galerie" />
          )}

          {!isCreator && (
            <View style={styles.rsvpCard}>
              <Text style={styles.rsvpTitle}>{t("activities.yourResponse") || "Deine Antwort"}</Text>
              <View style={styles.rsvpRow}>
                <Pressable
                  style={[styles.rsvpBtn, myStatus === "going" && { backgroundColor: COLORS.activityAccent, borderColor: COLORS.activityAccent }]}
                  onPress={() => handleRsvp("going")}
                >
                  <Ionicons name="checkmark-circle" size={18} color={myStatus === "going" ? "#fff" : COLORS.activityAccent} />
                  <Text style={[styles.rsvpBtnText, myStatus === "going" && { color: "#fff" }]}>Going</Text>
                </Pressable>
                <Pressable
                  style={[styles.rsvpBtn, myStatus === "maybe" && { backgroundColor: "#f59e0b", borderColor: "#f59e0b" }]}
                  onPress={() => handleRsvp("maybe")}
                >
                  <Ionicons name="help-circle" size={18} color={myStatus === "maybe" ? "#fff" : "#f59e0b"} />
                  <Text style={[styles.rsvpBtnText, myStatus === "maybe" && { color: "#fff" }]}>Maybe</Text>
                </Pressable>
                <Pressable
                  style={[styles.rsvpBtn, myStatus === "declined" && { backgroundColor: "#ef4444", borderColor: "#ef4444" }]}
                  onPress={() => handleRsvp("declined")}
                >
                  <Ionicons name="close-circle" size={18} color={myStatus === "declined" ? "#fff" : "#ef4444"} />
                  <Text style={[styles.rsvpBtnText, myStatus === "declined" && { color: "#fff" }]}>Can't</Text>
                </Pressable>
              </View>
            </View>
          )}

          <ShareSectionComponent
            accentColor={COLORS.activityAccent}
            saved={isSaved}
            onWhatsApp={shareToWhatsApp}
            onShare={() => setShowShareModal(true)}
            onSave={handleToggleSave}
          />

          {!isCreator && (
            <BottomCTA
              primaryLabel="Teilnehmen"
              primaryIcon="people-outline"
              accentColor={COLORS.activityAccent}
              onPrimary={() => handleRsvp("going")}
              secondaryLabel="Erinnern"
              onSecondary={handleSetReminder}
              saved={isSaved}
              onSave={handleToggleSave}
              onShare={() => setShowShareModal(true)}
            />
          )}

          <LazyMediaViewer
            visible={viewerOpen}
            media={viewerMedia}
            initialIndex={viewerIndex}
            onClose={() => setViewerOpen(false)}
          />

          <ChatSection
            title={activity.title}
            messages={chatMessages}
            loadingChat={loadingChat}
            chatText={chatText}
            onChatTextChange={setChatText}
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            sendingMessage={sendingMessage}
            userId={user?.user_id}
            themeColor={COLORS.activityAccent}
            chatType="activity"
            chatId={activity.activity_id}
            collapsible={true}
            showLoginPrompt={!sessionToken}
            onLoginPress={() => router.push("/login")}
          />
        </ScrollView>
        <ShareContent
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          contentType="activity"
          contentId={activity?.activity_id || ""}
          title={activity?.title || ""}
          description={activity ? `${activity.title} - ${activity.date} ${activity.time}${activity.location ? ` @ ${activity.location}` : ""}` : ""}
          extraData={{
            location: activity?.location || undefined,
            date: activity ? `${activity.date} ${activity.time}` : undefined,
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage, overflow: "hidden" },
  flex1: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.backgroundPage, padding: SPACING.section },
  content: { paddingBottom: 60 },
  errorText: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary, marginTop: SPACING.compact, marginBottom: SPACING.section },
  backButton: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: BORDER_RADIUS.md },
  backButtonText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "700" },
  infoRow: {
    flexDirection: "row",
    gap: SPACING.compact,
    marginTop: SPACING.small,
    paddingHorizontal: SPACING.page,
  },
  descriptionText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, lineHeight: 20 },
  invitationCodeCard: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.card, padding: SPACING.section,
    marginHorizontal: SPACING.page, marginBottom: SPACING.std, borderWidth: 2, borderStyle: "dashed", borderColor: COLORS.activityAccent + "40",
  },
  invitationCodeRow: { flexDirection: "row", alignItems: "center", gap: SPACING.small, marginBottom: SPACING.compact },
  invitationCodeLabel: { fontSize: 14, fontWeight: "600", color: COLORS.textSecondary },
  invitationCodeValueRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.surfaceSoft, borderRadius: BORDER_RADIUS.md, padding: SPACING.compact,
  },
  invitationCodeValue: { fontSize: 24, fontWeight: "700", color: COLORS.textPrimary, letterSpacing: 4 },
  copyButton: { padding: SPACING.small },
  invitationCodeHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: SPACING.small, textAlign: "center" },
  taggedBusinessCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card, padding: SPACING.section, marginHorizontal: SPACING.page,
    marginBottom: SPACING.std, ...SHADOWS.subtle,
  },
  taggedBusinessLogo: { width: 48, height: 48, borderRadius: BORDER_RADIUS.md, marginRight: SPACING.compact },
  taggedBusinessInfo: { flex: 1 },
  taggedBusinessLabel: { fontSize: FONT_SIZES.micro, color: COLORS.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  taggedBusinessName: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary },
  rsvpCard: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.card, padding: SPACING.section,
    marginHorizontal: SPACING.page, marginTop: SPACING.small, ...SHADOWS.subtle,
  },
  rsvpTitle: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: COLORS.textPrimary, marginBottom: SPACING.std },
  rsvpRow: { flexDirection: "row", gap: SPACING.small },
  rsvpBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: SPACING.compact, borderRadius: BORDER_RADIUS.button,
    borderWidth: 1.5, borderColor: COLORS.activityAccent, backgroundColor: COLORS.background,
  },
  rsvpBtnText: { fontSize: FONT_SIZES.small, fontWeight: "700", color: COLORS.activityAccent },
  themedAlertOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: SPACING.section },
  themedAlertContainer: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.xl, padding: SPACING.page, width: "100%", maxWidth: 320, alignItems: "center" },
  themedAlertMessage: { fontSize: FONT_SIZES.body, color: COLORS.textPrimary, textAlign: "center", marginBottom: SPACING.section, lineHeight: 22 },
  themedAlertButton: { backgroundColor: COLORS.activityAccent, paddingHorizontal: SPACING.large, paddingVertical: SPACING.compact, borderRadius: BORDER_RADIUS.md, width: "100%", alignItems: "center" },
  themedAlertButtonText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "600" },
});

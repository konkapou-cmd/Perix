import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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

import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { formatDate, formatTime } from "../../lib/formatDate";
import { buildMediaItems } from "../../lib/api/mediaUtils";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import { ContentHero, ContentGallery, ContentMap } from "../../components/shared";
import { DetailFacts, DetailFact } from "../../components/shared/DetailFacts";
import ErrorState from "../../components/shared/ErrorState";
import { BottomCTA } from "../../components/shared/BottomCTA";
import { openInMaps } from "../../lib/utils/openMapUrl";
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

const PAGE_ACCENT = "#FF9F1C";

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
  const goingCount = activity?.invites?.filter((i: any) => i.status === "going" || i.status === "accepted").length ?? 0;

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
      Keyboard.dismiss();
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) { showThemedAlert(t("common.pleaseTryAgain")); }
    finally { setSendingMessage(false); }
  };

  const handleSendMedia = async (mediaUrl: string, mediaType: string) => {
    if (!sessionToken || !id || sendingMessage) return;
    setSendingMessage(true);
    try {
      const newMsg = await sendActivityMessage(sessionToken, id, "", mediaUrl, mediaType);
      setChatMessages(prev => [...prev, newMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) { showThemedAlert(t("common.pleaseTryAgain")); }
    finally { setSendingMessage(false); }
  };

  const handleRsvp = async (status: "going" | "maybe" | "declined") => {
    if (!id) return;
    if (!sessionToken) {
      router.push("/login");
      return;
    }
    try {
      const result = await rsvpActivity(sessionToken, id, status);
      setMyStatus(result.my_status);
    } catch (_) { showThemedAlert(t("common.pleaseTryAgain")); }
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
        <ActivityIndicator color={PAGE_ACCENT} size="large" />
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
        <Pressable style={[styles.backButton, { backgroundColor: PAGE_ACCENT }]} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const themeLabel = activity.custom_theme ||
    (activity.theme ? t(`activities.themes.types.${activity.theme}`, (ACTIVITY_TYPES as Record<string, any>)[activity.theme]?.label || "") as string : null);
  const isPast = !isUpcomingActivity(activity);
  const allMediaItems = activity ? buildMediaItems(activity) : [];
  const organizer = activity.creator?.name || "";
  const remaining = activity.max_attendees ? activity.max_attendees - goingCount : null;

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
            coverFocalPoint={(activity as any).cover_focal_point}
            imageUrls={activity.image_urls}
            title={activity.title}
            hideBack
            flush
            badges={[
              isPast
                ? { icon: "flag", text: t("activities.pastActivity") || "Past Activity", color: PAGE_ACCENT }
                : { icon: "people", text: themeLabel || t("activities.activity") || "Activity", color: PAGE_ACCENT },
              ...(activity.is_private ? [{ icon: "lock-closed", text: t("activities.private") || "Private", color: PAGE_ACCENT }] : []),
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

          <DetailFacts>
            <DetailFact
              icon="calendar-outline"
              label={t("activities.date") || "Datum"}
              value={formatDate(activity.date)}
              accentColor={PAGE_ACCENT}
            />
            <DetailFact
              icon="time-outline"
              label={t("activities.time") || "Uhrzeit"}
              value={activity.time}
              accentColor={PAGE_ACCENT}
            />
            {activity.location ? (
              <DetailFact
                icon="location-outline"
                label={t("activities.location") || "Ort"}
                value={activity.location}
                accentColor={PAGE_ACCENT}
                onPress={() => openInMaps({ latitude: activity.latitude ?? undefined, longitude: activity.longitude ?? undefined, address: activity.location || "" })}
              />
            ) : null}
            {activity.max_attendees ? (
              <DetailFact
                icon="people"
                label={t("activities.attendees") || "Teilnehmer"}
                value={`${goingCount}/${activity.max_attendees}`}
                accentColor={PAGE_ACCENT}
              />
            ) : (
              <DetailFact
                icon="people"
                label={t("activities.attendees") || "Teilnehmer"}
                value={String(goingCount)}
                accentColor={PAGE_ACCENT}
              />
            )}
            {themeLabel ? (
              <DetailFact
                icon="sparkles"
                label={t("activities.activityType") || "Art"}
                value={themeLabel}
                accentColor={PAGE_ACCENT}
              />
            ) : null}
            {remaining !== null && remaining <= 3 && remaining > 0 ? (
              <DetailFact
                icon="alert-circle-outline"
                label={t("activities.spots") || "Plätze"}
                value={t("activities.spotsRemaining", "Nur noch {{count}} Plätze frei!", { count: remaining })}
                accentColor={PAGE_ACCENT}
              />
            ) : null}
            {remaining !== null && remaining <= 0 ? (
              <DetailFact
                icon="close-circle-outline"
                label={t("activities.spots") || "Plätze"}
                value={t("activities.fullyBooked", "Ausgebucht!")}
                accentColor={PAGE_ACCENT}
              />
            ) : null}
            {activity.is_private && isCreator && activity.invitation_code ? (
              <DetailFact
                icon="key"
                label={t("activities.invitationCode") || "Code"}
                value={activity.invitation_code}
                accentColor={PAGE_ACCENT}
                onPress={copyInvitationCode}
              />
            ) : null}
          </DetailFacts>

          {activity.latitude != null && activity.longitude != null && (
            <ContentMap
              latitude={activity.latitude}
              longitude={activity.longitude}
              title={activity.title}
              address={activity.location ?? undefined}
              flush
            />
          )}

          {activity.description ? (
            <View style={styles.plainSection}>
              <Text style={styles.sectionTitle}>{t("activities.description") || "Beschreibung"}</Text>
              <Text style={styles.descriptionText}>{activity.description}</Text>
            </View>
          ) : null}

          {allMediaItems.length > 0 && (
            <ContentGallery mediaItems={allMediaItems} title={t("common.gallery", "Galerie")} />
          )}

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
            themeColor={PAGE_ACCENT}
            chatType="activity"
            chatId={activity.activity_id}
            collapsible={false}
            showLoginPrompt={!sessionToken}
            onLoginPress={() => router.push("/login")}
            flush
          />

          <BottomCTA
            primaryLabel={
              remaining !== null && remaining <= 0
                ? t("activities.fullyBooked", "Ausgebucht!")
                : myStatus === "going"
                  ? t("activities.attending", "Teilnehmend")
                  : t("activities.attend", "Teilnehmen")
            }
            primaryIcon={remaining !== null && remaining <= 0 ? "close-circle-outline" : "people-outline"}
            accentColor={PAGE_ACCENT}
            useGradient
            onPrimary={remaining !== null && remaining <= 0 ? () => {} : () => handleRsvp("going")}
            saved={isSaved}
            onSave={handleToggleSave}
            onShare={() => setShowShareModal(true)}
            onWhatsApp={shareToWhatsApp}
          />
        </ScrollView>
        <ShareContent
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          contentType="activity"
          contentId={activity?.activity_id || ""}
          title={activity?.title || ""}
          description={activity ? `${activity.title} - ${formatDate(activity.date)} ${activity.time}${activity.location ? ` @ ${activity.location}` : ""}` : ""}
          extraData={{
            location: activity?.location || undefined,
            date: activity ? `${formatDate(activity.date)} ${activity.time}` : undefined,
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
  plainSection: { marginTop: SPACING.section, paddingHorizontal: SPACING.std },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#264348", marginBottom: SPACING.small },
  backButton: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: BORDER_RADIUS.md },
  backButtonText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "700" },
  descriptionText: { fontSize: FONT_SIZES.bodySmall, color: "#264348", lineHeight: 22 },
  themedAlertOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: SPACING.section },
  themedAlertContainer: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.xl, padding: SPACING.page, width: "100%", maxWidth: 320, alignItems: "center" },
  themedAlertMessage: { fontSize: FONT_SIZES.body, color: "#264348", textAlign: "center", marginBottom: SPACING.section, lineHeight: 22 },
  themedAlertButton: { backgroundColor: PAGE_ACCENT, paddingHorizontal: SPACING.large, paddingVertical: SPACING.compact, borderRadius: BORDER_RADIUS.md, width: "100%", alignItems: "center" },
  themedAlertButtonText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "600" },
});

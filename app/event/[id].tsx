import React, { useCallback, useEffect, useRef, useState } from "react";
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
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useAuth } from "../../context/AuthContext";

import { useSocket, useSocketEvent } from "../../context/SocketContext";
import ShareContent from "../../components/ShareContent";
import ChatSection from "../../components/shared/ChatSection";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import { ContentHero, ContentGallery, ContentMap, ContentSection } from "../../components/shared";
import { InfoCard } from "../../components/shared/InfoCard";
import { LocationCard } from "../../components/shared/LocationCard";
import EntityMapSection from "../../components/shared/EntityMapSection";
import { ShareSection as ShareSectionComponent } from "../../components/shared/ShareSection";
import { RSVPSection } from "../../components/shared/RSVPSection";
import { EntityHeader } from "../../components/shared/EntityHeader";
import { BottomCTA } from "../../components/shared/BottomCTA";
import { buildMediaItems } from "../../lib/api/mediaUtils";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { formatEventDate, formatEventTime } from "../../lib/formatDate";
import {
  ChatMessage,
  EventItem,
  getEventPublic,
  getEventDetail,
  getEventMessages,
  sendEventMessage,
  toggleEventAttendance,
  setEventReminder,
  getEventReminders,
  deleteEventReminder,
  EventReminder,
  EVENT_THEMES,
  DEFAULT_EVENT_THEME,
  isUpcomingEvent,
  toggleSaved,
  checkSaved,
} from "../../lib/api";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EventDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const { connected, subscribe, unsubscribe } = useSocket();
  const router = useRouter();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isAttending, setIsAttending] = useState(false);
  const [attendeesCount, setAttendeesCount] = useState(0);

  const [hasReminder, setHasReminder] = useState(false);
  const [reminder, setReminder] = useState<EventReminder | null>(null);
  const [settingReminder, setSettingReminder] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const [themedAlertVisible, setThemedAlertVisible] = useState(false);
  const [themedAlertMessage, setThemedAlertMessage] = useState("");

  const showThemedAlert = (message: string) => {
    setThemedAlertMessage(message);
    setThemedAlertVisible(true);
  };

  const getTheme = () => {
    if (!event?.theme) return DEFAULT_EVENT_THEME;
    return EVENT_THEMES[event.theme] || DEFAULT_EVENT_THEME;
  };

  const theme = event ? getTheme() : DEFAULT_EVENT_THEME;
  const isPast = event ? !isUpcomingEvent(event) : false;

  useEffect(() => {
    loadEvent();
  }, [id, sessionToken]);

  useEffect(() => {
    if (sessionToken && id) {
      loadChatMessages(true);
    }
  }, [sessionToken, id]);

  useSocketEvent("channel_message", (data: any) => {
    if (data.channel === `event:${id}` && data.message) {
      setChatMessages((prev) => {
        const exists = prev.some((m) => m.message_id === data.message.message_id);
        if (exists) return prev;
        return [...prev, data.message];
      });
    }
  });

  useEffect(() => {
    if (!id) return;
    subscribe(`event:${id}`);
    return () => unsubscribe(`event:${id}`);
  }, [id, subscribe, unsubscribe]);

  useEffect(() => {
    if (!sessionToken || !id) return;
    const interval = setInterval(() => {
      loadChatMessages(false);
    }, connected ? 30000 : 15000);
    return () => clearInterval(interval);
  }, [sessionToken, id, connected]);

  const loadEvent = async () => {
    if (!id) return;
    setLoading(true);
    try {
      let eventData: EventItem;
      if (sessionToken) {
        eventData = await getEventDetail(sessionToken, id);
        setIsAttending(eventData.is_attending || false);
      } else {
        eventData = await getEventPublic(id);
      }
      setEvent(eventData);
      setAttendeesCount(eventData.attendees_count || 0);
      if (sessionToken) {
        try {
          const { is_saved } = await checkSaved(sessionToken, "event", id);
          setIsSaved(is_saved);
        } catch (_) {}
      }
    } catch (_) {
      showThemedAlert(t("events.eventNotFound"));
    }
    setLoading(false);
  };

  const handleToggleSave = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.loginRequired") || "Login Required", t("common.loginToSave") || "Please log in", [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        { text: t("auth.login") || "Login", onPress: () => router.push("/login") },
      ]);
      return;
    }
    if (!event) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "event", event.event_id);
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
      const messages = await getEventMessages(sessionToken, id);
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
      const newMsg = await sendEventMessage(sessionToken, id, chatText.trim());
      setChatMessages(prev => [...prev, newMsg]);
      setChatText("");
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) {
      showThemedAlert(t("common.pleaseTryAgain"));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendMedia = async (mediaUrl: string, mediaType: string) => {
    if (!sessionToken || !id || sendingMessage) return;
    setSendingMessage(true);
    try {
      const newMsg = await sendEventMessage(sessionToken, id, "", mediaUrl);
      setChatMessages(prev => [...prev, newMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) {
      showThemedAlert(t("common.pleaseTryAgain"));
    } finally {
      setSendingMessage(false);
    }
  };

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const handleToggleAttendance = async () => {
    if (!sessionToken || !id) {
      Alert.alert(t("events.loginRequired"), t("events.loginToAttend"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("auth.login"), onPress: () => router.push("/login") },
      ]);
      return;
    }
    if (event?.is_private && !isAttending) {
      setPasswordInput("");
      setPasswordModalVisible(true);
      return;
    }
    try {
      const result = await toggleEventAttendance(sessionToken, id);
      setIsAttending(result.is_attending);
      setAttendeesCount(result.attendees_count);
    } catch (_) {
      showThemedAlert(t("common.pleaseTryAgain"));
    }
  };

  const handlePasswordSubmit = async () => {
    setPasswordModalVisible(false);
    if (!sessionToken || !id) return;
    try {
      const result = await toggleEventAttendance(sessionToken, id, passwordInput);
      setIsAttending(result.is_attending);
      setAttendeesCount(result.attendees_count);
    } catch (_) {
      showThemedAlert(t("common.pleaseTryAgain"));
    }
  };

  const loadReminderStatus = async () => {
    if (!sessionToken || !id) return;
    try {
      const reminders = await getEventReminders(sessionToken, id);
      const pending = reminders.find(r => r.status === "pending");
      if (pending) { setHasReminder(true); setReminder(pending); }
      else { setHasReminder(false); setReminder(null); }
    } catch (_) {}
  };

  const handleToggleReminder = async () => {
    if (!sessionToken || !id) {
      showThemedAlert(t("events.loginToReminder") || "Please log in");
      return;
    }
    setSettingReminder(true);
    try {
      if (hasReminder && reminder) {
        await deleteEventReminder(sessionToken, id, reminder.reminder_id);
        setHasReminder(false);
        setReminder(null);
        Alert.alert(t("events.reminderRemoved") || "Removed", t("events.reminderRemovedDesc") || "");
      } else {
        Alert.alert(t("events.setReminder") || "Set Reminder", t("events.reminderOptions") || "When?", [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("events.15MinBefore") || "15 min", onPress: () => setReminderTime(15) },
          { text: t("events.1HourBefore") || "1 hour", onPress: () => setReminderTime(60) },
          { text: t("events.1DayBefore") || "1 day", onPress: () => setReminderTime(60 * 24) },
        ]);
      }
    } catch (error: any) {
      showThemedAlert(error.message || t("common.pleaseTryAgain"));
    } finally {
      setSettingReminder(false);
    }
  };

  const setReminderTime = async (minutesBefore: number) => {
    if (!sessionToken || !id) return;
    setSettingReminder(true);
    try {
      const result = await setEventReminder(sessionToken, id, minutesBefore);
      setHasReminder(true);
      setReminder({
        reminder_id: result.reminder_id, event_id: id, user_id: "",
        remind_at: result.remind_at, reminder_type: "push", status: "pending",
        created_at: new Date().toISOString(), minutes_before: result.minutes_before,
      });
      showThemedAlert(t("events.reminderSetDesc") || "");
    } catch (error: any) {
      showThemedAlert(error.message || t("common.pleaseTryAgain"));
    } finally {
      setSettingReminder(false);
    }
  };

  useEffect(() => {
    if (sessionToken && id && event) { loadReminderStatus(); }
  }, [sessionToken, id, event]);

  const shareToWhatsApp = async () => {
    if (!event) return;
    const eventDate = formatEventDate(event.start_time);
    const eventTime = formatEventTime(event.start_time);
    const organizer = event.artist?.name || event.business?.name || "";
    const location = event.location || "";
    const eventUrl = `${BACKEND_URL?.replace('/api', '')}/share/event/${event.event_id}`;
    const message = `${theme.emoji} ${event.title}\n\n${t("events.by")} ${organizer}\n${eventDate} ${t("common.at")} ${eventTime}\n${location}\n\n${t("events.rsvpHere")}: ${eventUrl}`;
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) await Linking.openURL(whatsappUrl);
      else await Share.share({ message });
    } catch (_) { await Share.share({ message }); }
  };

  const shareEvent = async () => {
    if (!event) return;
    const eventDate = formatEventDate(event.start_time);
    const eventTime = formatEventTime(event.start_time);
    const organizer = event.artist?.name || event.business?.name || "";
    const eventUrl = `${BACKEND_URL?.replace('/api', '')}/share/event/${event.event_id}`;
    const message = `${theme.emoji} ${event.title}\n${t("events.by")} ${organizer}\n${eventDate} ${t("common.at")} ${eventTime}\n${event.location || ""}\n\n${eventUrl}`;
    await Share.share({ message });
  };

  const allMediaItems = event ? buildMediaItems(event) : [];

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: `${theme.color}10` }]}>
        <ActivityIndicator color={theme.color} size="large" />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="calendar-outline" size={48} color={COLORS.textSecondary} />
        <Text style={styles.errorText}>{t("events.eventNotFound")}</Text>
        <Pressable style={[styles.backButton, { backgroundColor: COLORS.eventAccent }]} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const organizer = event.artist?.name || event.business?.name;
  const hasCoordinates = !!(event.business?.latitude || event.artist?.latitude);
  const eventLocation = hasCoordinates ? { latitude: event.business?.latitude || event.artist?.latitude!, longitude: event.business?.longitude || event.artist?.longitude! } : null;
  const themeInfo = getTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.backgroundPage }]} edges={["top", "bottom"]}>
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
            coverImageUrl={event.cover_image_url}
            videoUrl={event.video_url}
            muxThumbnailUrl={event.mux_thumbnail_url}
            videoStatus={event.video_status}
            isCoverVideo={!event.cover_image_url && !!event.video_url}
            coverFocalPoint={event.cover_focal_point}
            imageUrls={event.image_urls}
            title={event.title}
            badges={[
              isPast
                ? { icon: "flag", text: t("events.pastEvent") || "Past Event" }
                : { icon: "calendar", text: themeInfo.label },
              { icon: "people", text: String(attendeesCount) },
              ...(event.is_private ? [{ icon: "lock-closed" }] : []),
            ]}
            subtitle={organizer ? {
              text: `${t("events.by")} ${organizer}`,
              avatarUrl: event.business?.logo_image || undefined,
              onPress: event.business?.business_id ? () => router.push(`/business/${event.business.business_id}`) : undefined,
            } : undefined}
            mediaItems={allMediaItems}
            onMediaPress={(idx) => {
              setViewerMedia(allMediaItems);
              setViewerIndex(idx);
              setViewerOpen(true);
            }}
          />

          <EntityHeader
            title={event.title}
            subtitle={organizer || ""}
            subtitlePrefix="von"
            avatarUrl={event.business?.logo_image || undefined}
            avatarIcon="people-outline"
            accentColor={COLORS.eventAccent}
            onPress={event.business?.business_id ? () => router.push(`/business/${event.business.business_id}`) : undefined}
          />

          <View style={styles.infoRow}>
            <InfoCard
              icon="calendar-outline"
              label={t("events.date") || "Datum"}
              value={formatEventDate(event.start_time)}
              accentColor={COLORS.eventAccent}
            />
            <InfoCard
              icon="time-outline"
              label={t("events.time") || "Uhrzeit"}
              value={formatEventTime(event.start_time)}
              accentColor={COLORS.eventAccent}
            />
          </View>

          <EntityMapSection
            address={event.location}
            latitude={eventLocation?.latitude}
            longitude={eventLocation?.longitude}
            title={event.title}
            accentColor={COLORS.eventAccent}
          />

          {event.description && (
            <ContentSection icon="document-text" title={t("events.description") || "Beschreibung"}>
              <Text style={styles.description}>{event.description}</Text>
            </ContentSection>
          )}

          {event.tagged_artists && event.tagged_artists.length > 0 && (
            <ContentSection icon="mic" title={t("events.taggedArtists", "Artists")}>
              <View style={styles.taggedArtistsRow}>
                {event.tagged_artists.map((artist: any) => (
                  <Pressable
                    key={artist.artist_id}
                    style={styles.taggedArtistCard}
                    onPress={() => router.push(`/user/${artist.artist_id}` as any)}
                  >
                    {artist.profile_photo ? (
                      <Image source={{ uri: artist.profile_photo }} style={styles.taggedArtistAvatar} />
                    ) : (
                      <View style={[styles.taggedArtistAvatar, styles.taggedArtistAvatarPlaceholder]}>
                        <Ionicons name="person" size={18} color={COLORS.textSecondary} />
                      </View>
                    )}
                    <Text style={styles.taggedArtistName} numberOfLines={1}>{artist.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ContentSection>
          )}

          {allMediaItems.length > 0 && (
            <ContentGallery mediaItems={allMediaItems} title="Galerie" />
          )}

          <RSVPSection
            accentColor={COLORS.eventAccent}
            isAttending={isAttending}
            hasReminder={hasReminder}
            onAttend={isPast ? () => {} : handleToggleAttendance}
            onRemind={isPast ? undefined : handleToggleReminder}
          />

          <ShareSectionComponent
            accentColor={COLORS.eventAccent}
            saved={isSaved}
            onWhatsApp={shareToWhatsApp}
            onShare={() => setShowShareModal(true)}
            onSave={handleToggleSave}
          />

          <ShareContent
            visible={showShareModal}
            onClose={() => setShowShareModal(false)}
            contentType="event"
            contentId={event.event_id}
            title={event.title}
            description={event.description || undefined}
            imageUrl={event.cover_image_url || event.image_urls?.[0] || undefined}
            extraData={{
              location: event.location || undefined,
              date: formatEventDate(event.start_time),
              organizerName: organizer,
            }}
          />

          <LazyMediaViewer
            visible={viewerOpen}
            media={viewerMedia}
            initialIndex={viewerIndex}
            onClose={() => setViewerOpen(false)}
          />

          <ChatSection
            title={event.title}
            messages={chatMessages}
            loadingChat={loadingChat}
            chatText={chatText}
            onChatTextChange={setChatText}
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            sendingMessage={sendingMessage}
            userId={user?.user_id}
            themeColor={COLORS.eventAccent}
            collapsible={true}
            chatType="event"
            chatId={event.event_id}
            showLoginPrompt={!sessionToken}
            onLoginPress={() => router.push("/login")}
          />

          <BottomCTA
            primaryLabel={isAttending ? "Teilnehmend" : (t("events.rsvp") || "Zusagen")}
            primaryIcon="calendar-outline"
            accentColor={COLORS.eventAccent}
            onPrimary={isPast ? () => {} : handleToggleAttendance}
            secondaryLabel={hasReminder ? "Erinnert" : (t("events.remindMe") || "Erinnern")}
            onSecondary={isPast ? undefined : handleToggleReminder}
            saved={isSaved}
            onSave={handleToggleSave}
            onShare={() => setShowShareModal(true)}
          />
        </ScrollView>

        <Modal visible={passwordModalVisible} transparent animationType="fade">
          <View style={styles.passwordModalOverlay}>
            <View style={styles.passwordModalContent}>
              <Text style={styles.passwordModalTitle}>{t("business.private")}</Text>
              <Text style={styles.passwordModalHint}>{t("business.privateHint")}</Text>
              <TextInput
                style={styles.passwordModalInput}
                value={passwordInput}
                onChangeText={setPasswordInput}
                placeholder={t("business.passwordPlaceholder")}
                secureTextEntry
                autoFocus
              />
              <View style={styles.passwordModalButtons}>
                <Pressable style={styles.passwordModalCancel} onPress={() => setPasswordModalVisible(false)}>
                  <Text style={styles.passwordModalCancelText}>{t("common.cancel")}</Text>
                </Pressable>
                <Pressable style={styles.passwordModalSubmit} onPress={handlePasswordSubmit}>
                  <Text style={styles.passwordModalSubmitText}>{t("events.rsvp")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  flex1: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: SPACING.section },
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
  description: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, lineHeight: 24 },
  taggedArtistsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.gap, marginTop: SPACING.small },
  taggedArtistCard: {
    flexDirection: "row", alignItems: "center", gap: SPACING.small,
    backgroundColor: COLORS.backgroundPage, paddingHorizontal: SPACING.compact,
    paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full,
  },
  taggedArtistAvatar: { width: 32, height: 32, borderRadius: 16 },
  taggedArtistAvatarPlaceholder: { backgroundColor: COLORS.borderGray, alignItems: "center", justifyContent: "center" },
  taggedArtistName: { fontSize: FONT_SIZES.small, fontWeight: "500", color: COLORS.textPrimary },
  themedAlertOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: SPACING.section },
  themedAlertContainer: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.xl, padding: SPACING.page, width: "100%", maxWidth: 320, alignItems: "center" },
  themedAlertMessage: { fontSize: FONT_SIZES.body, color: COLORS.textPrimary, textAlign: "center", marginBottom: SPACING.section, lineHeight: 22 },
  themedAlertButton: { backgroundColor: COLORS.eventAccent, paddingHorizontal: SPACING.large, paddingVertical: SPACING.compact, borderRadius: BORDER_RADIUS.md, width: "100%", alignItems: "center" },
  themedAlertButtonText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "600" },
  passwordModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  passwordModalContent: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.xl, padding: SPACING.page, width: "85%" },
  passwordModalTitle: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 4 },
  passwordModalHint: { fontSize: FONT_SIZES.small, color: COLORS.textSecondary, marginBottom: SPACING.std },
  passwordModalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 14, paddingVertical: SPACING.compact, fontSize: FONT_SIZES.body, color: COLORS.textPrimary, marginBottom: SPACING.std },
  passwordModalButtons: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.compact },
  passwordModalCancel: { paddingVertical: SPACING.gap, paddingHorizontal: SPACING.section, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  passwordModalCancelText: { color: COLORS.textSecondary, fontWeight: "600" },
  passwordModalSubmit: { paddingVertical: SPACING.gap, paddingHorizontal: SPACING.section, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.eventAccent },
  passwordModalSubmitText: { color: "#fff", fontWeight: "600" },
});

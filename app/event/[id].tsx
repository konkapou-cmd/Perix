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
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useAuth } from "../../context/AuthContext";

import { useSocket, useSocketEvent } from "../../context/SocketContext";
import ShareContent from "../../components/ShareContent";
import BusinessMap from "../../components/BusinessMap";
import ChatSection from "../../components/shared/ChatSection";
import AdaptiveImage from "../../components/AdaptiveImage";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
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

const MAPS_API_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

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
  
  // Reminder state
  const [hasReminder, setHasReminder] = useState(false);
  const [reminder, setReminder] = useState<EventReminder | null>(null);
  const [settingReminder, setSettingReminder] = useState(false);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // Themed Alert state
  const [themedAlertVisible, setThemedAlertVisible] = useState(false);
  const [themedAlertMessage, setThemedAlertMessage] = useState("");

  // Helper to show themed alert
  const showThemedAlert = (message: string) => {
    setThemedAlertMessage(message);
    setThemedAlertVisible(true);
  };

  // Get theme info
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

  // Poll for new messages — slow when WS connected, slower when disconnected
  useEffect(() => {
    if (!sessionToken || !id || !showChat) return;
    const interval = setInterval(() => {
      loadChatMessages(false);
    }, connected ? 30000 : 15000);
    return () => clearInterval(interval);
  }, [sessionToken, id, showChat, connected]);

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
        } catch (error) {
          console.error("Failed to check saved status:", error);
        }
      }
    } catch (error) {
      console.error("Failed to load event:", error);
      showThemedAlert(t("events.eventNotFound"));
    }
    setLoading(false);
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
    if (!event) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "event", event.event_id);
      setIsSaved(is_saved);
    } catch (error) {
      console.error("Failed to toggle save:", error);
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
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
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
    } catch (error) {
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
    } catch (error) {
      showThemedAlert(t("common.pleaseTryAgain"));
    } finally {
      setSendingMessage(false);
    }
  };

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  
  const handleToggleAttendance = async () => {
    if (!sessionToken || !id) {
      Alert.alert(
        t("events.loginRequired"),
        t("events.loginToAttend"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("auth.login"), onPress: () => router.push("/login") },
        ]
      );
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
    } catch (error) {
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
    } catch (error: any) {
      showThemedAlert(t("common.pleaseTryAgain"));
    }
  };

  // Load reminder status
  const loadReminderStatus = async () => {
    if (!sessionToken || !id) return;
    try {
      const reminders = await getEventReminders(sessionToken, id);
      const pending = reminders.find(r => r.status === "pending");
      if (pending) {
        setHasReminder(true);
        setReminder(pending);
      } else {
        setHasReminder(false);
        setReminder(null);
      }
    } catch (error) {
      console.log("Failed to load reminders:", error);
    }
  };

  // Toggle reminder
  const handleToggleReminder = async () => {
    if (!sessionToken || !id) {
      showThemedAlert(t("events.loginToReminder") || "Please log in to set a reminder");
      return;
    }

    setSettingReminder(true);
    try {
      if (hasReminder && reminder) {
        // Remove reminder
        await deleteEventReminder(sessionToken, id, reminder.reminder_id);
        setHasReminder(false);
        setReminder(null);
        Alert.alert(
          t("events.reminderRemoved") || "Reminder Removed",
          t("events.reminderRemovedDesc") || "You won't be notified about this event"
        );
      } else {
        // Set reminder (1 hour before by default)
        Alert.alert(
          t("events.setReminder") || "Set Reminder",
          t("events.reminderOptions") || "When would you like to be reminded?",
          [
            { text: t("common.cancel"), style: "cancel" },
            { 
              text: t("events.15MinBefore") || "15 min before", 
              onPress: () => setReminderTime(15) 
            },
            { 
              text: t("events.1HourBefore") || "1 hour before", 
              onPress: () => setReminderTime(60) 
            },
            { 
              text: t("events.1DayBefore") || "1 day before", 
              onPress: () => setReminderTime(60 * 24) 
            },
          ]
        );
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
        reminder_id: result.reminder_id,
        event_id: id,
        user_id: "",
        remind_at: result.remind_at,
        reminder_type: "push",
        status: "pending",
        created_at: new Date().toISOString(),
        minutes_before: result.minutes_before,
      });
      showThemedAlert(t("events.reminderSetDesc") || `We'll notify you ${minutesBefore >= 60 ? `${Math.floor(minutesBefore/60)} hour(s)` : `${minutesBefore} minutes`} before the event`);
    } catch (error: any) {
      showThemedAlert(error.message || t("common.pleaseTryAgain"));
    } finally {
      setSettingReminder(false);
    }
  };

  // Load reminder when event loads
  useEffect(() => {
    if (sessionToken && id && event) {
      loadReminderStatus();
    }
  }, [sessionToken, id, event]);

  const shareToWhatsApp = async () => {
    if (!event) return;
    
    const eventDate = formatEventDate(event.start_time);
    const eventTime = formatEventTime(event.start_time);
    const organizer = event.artist?.name || event.business?.name || "";
    const location = event.location || "";
    
    // Use /share/ prefix for public deep links
    const eventUrl = `${BACKEND_URL?.replace('/api', '')}/share/event/${event.event_id}`;
    
    const message = `${theme.emoji} ${event.title}\n\n${t("events.by")} ${organizer}\n📅 ${eventDate} ${t("common.at")} ${eventTime}\n📍 ${location}\n\n${t("events.rsvpHere")}: ${eventUrl}`;
    
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({ message });
      }
    } catch (error) {
      await Share.share({ message });
    }
  };

  const shareEvent = async () => {
    if (!event) return;
    
    const eventDate = formatEventDate(event.start_time);
    const eventTime = formatEventTime(event.start_time);
    const organizer = event.artist?.name || event.business?.name || "";
    // Use /share/ prefix for public deep links
    const eventUrl = `${BACKEND_URL?.replace('/api', '')}/share/event/${event.event_id}`;
    
    const message = `${theme.emoji} ${event.title}\n${t("events.by")} ${organizer}\n${eventDate} ${t("common.at")} ${eventTime}\n${event.location || ""}\n\n${eventUrl}`;
    
    await Share.share({ message });
  };

  const openMap = () => {
    const lat = event?.business?.latitude || event?.artist?.latitude;
    const lng = event?.business?.longitude || event?.artist?.longitude;
    if (!lat || !lng) return;
    
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  const buildEventMediaItems = (evt: any): MediaItem[] => {
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    if (evt.video_url) {
      seen.add(evt.video_url);
      items.push({ type: "video", uri: evt.video_url, muxThumbnailUrl: evt.mux_thumbnail_url || undefined, videoStatus: evt.video_status });
    }
    if (evt.cover_image_url && !seen.has(evt.cover_image_url)) {
      seen.add(evt.cover_image_url);
      items.push({ type: "image", uri: evt.cover_image_url });
    }
    (evt.image_urls || []).forEach((u: string) => {
      if (!seen.has(u)) { seen.add(u); items.push({ type: "image", uri: u }); }
    });
    (evt.gallery_images || []).forEach((u: string) => {
      if (!seen.has(u)) { seen.add(u); items.push({ type: "image", uri: u }); }
    });
    (evt.gallery_videos || []).forEach((u: string) => {
      if (!seen.has(u)) { seen.add(u); items.push({ type: "video", uri: u }); }
    });
    return items;
  };

  const getMuxThumbnail = (url: string): string | null => {
    const match = url.match(/stream\.mux\.com\/([a-zA-Z0-9]+)|mux\.com\/([a-zA-Z0-9]+)/);
    if (match) {
      const playbackId = match[1] || match[2];
      return `https://image.mux.com/${playbackId}/thumbnail.jpg`;
    }
    return null;
  };


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
        <Ionicons name="calendar-outline" size={48} color="#9ca3af" />
        <Text style={styles.errorText}>{t("events.eventNotFound")}</Text>
        <Pressable style={[styles.primaryButton, { backgroundColor: theme.color }]} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const eventDate = new Date(event.start_time);
  const organizer = event.artist?.name || event.business?.name;
  const hasCoordinates = !!(event.business?.latitude || event.artist?.latitude);
  const eventLocation = hasCoordinates ? { latitude: event.business?.latitude || event.artist?.latitude!, longitude: event.business?.longitude || event.artist?.longitude! } : null;
  const themeInfo = getTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.backgroundPage }]} edges={["top", "bottom"]}>
      {/* Themed Alert Modal */}
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
          {/* Event Hero - Full Bleed Immersive */}
          <View style={styles.heroContainer}>
            {event.video_url ? (
              <AdaptiveVideo
                uri={event.video_url}
                maxHeight={470}
                borderRadius={12}
                autoPlay={true}
                initialMuted={true}
                showMuteButton={true}
                videoStatus={event.video_status}
                muxThumbnailUrl={event.mux_thumbnail_url || undefined}
                onPress={() => {
                  const items: MediaItem[] = buildEventMediaItems(event);
                  const idx = items.findIndex(i => i.uri === event.video_url);
                  setViewerMedia(items);
                  setViewerIndex(idx >= 0 ? idx : 0);
                  setViewerOpen(true);
                }}
              />
            ) : event.cover_image_url || event.image_urls?.[0] ? (
              <AdaptiveImage
                uri={event.cover_image_url || event.image_urls?.[0] || ""}
                maxHeight={470}
                borderRadius={12}
                onPress={() => {
                  const items: MediaItem[] = buildEventMediaItems(event);
                  setViewerMedia(items);
                  setViewerIndex(0);
                  setViewerOpen(true);
                }}
              />
            ) : (
              <LinearGradient
                colors={["#1a1a2e", "#16213e", "#0f3460"]}
                style={styles.heroMedia}
              >
                <View style={styles.heroFallbackIcon}>
                  <Ionicons name="calendar" size={48} color="rgba(255,255,255,0.3)" />
                </View>
              </LinearGradient>
            )}

            {/* Back Button */}
            <View style={styles.heroBackButton}>
              <Pressable style={styles.heroBackPill} onPress={() => router.back()}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
                <Text style={styles.heroBackText}>{t("common.back")}</Text>
              </Pressable>
            </View>

            {/* Gradient Overlay + Content */}
            <LinearGradient
              colors={["transparent", "transparent", "rgba(0,0,0,0.7)", "rgba(0,0,0,0.9)"]}
              locations={[0, 0.4, 0.7, 1]}
              style={styles.heroGradientOverlay}
            >
              {/* Badges */}
              <View style={styles.heroBadgeRow}>
                {isPast ? (
                  <View style={styles.heroBadge}>
                    <Ionicons name="flag" size={12} color="#fff" />
                    <Text style={styles.heroBadgeText}>{t("events.pastEvent") || "Past Event"}</Text>
                  </View>
                ) : (
                  <View style={styles.heroBadge}>
                    <Ionicons name="calendar" size={12} color="#fff" />
                    <Text style={styles.heroBadgeText}>{themeInfo.label}</Text>
                  </View>
                )}
                <View style={styles.heroBadge}>
                  <Ionicons name="people" size={12} color="#fff" />
                  <Text style={styles.heroBadgeText}>{attendeesCount}</Text>
                </View>
                {event.is_private && (
                  <View style={styles.heroBadge}>
                    <Ionicons name="lock-closed" size={12} color="#fff" />
                  </View>
                )}
              </View>

              {/* Title */}
              <Text style={styles.heroTitle}>{event.title}</Text>

              {/* Organizer */}
              {organizer && (
                <Pressable 
                  style={styles.heroOrganizerRow}
                  onPress={() => {
                    if (event.business?.business_id) {
                      router.push(`/business/${event.business.business_id}`);
                    }
                  }}
                >
                  {event.business?.logo_image ? (
                    <Image source={{ uri: event.business.logo_image }} style={styles.heroOrganizerAvatar} />
                  ) : (
                    <View style={styles.heroOrganizerAvatarPlaceholder}>
                      <Ionicons name="business" size={12} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.heroOrganizerText}>{t("events.by")} {organizer}</Text>
                </Pressable>
              )}
            </LinearGradient>
          </View>

          {/* Quick Info Cards Row */}
          <View style={styles.quickInfoRow}>
            <View style={styles.quickInfoCard}>
              <View style={styles.quickInfoIconContainer}>
                <Ionicons name="calendar" size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.quickInfoLabel}>{t("events.date")}</Text>
                <Text style={styles.quickInfoValue}>
                  {formatEventDate(event.start_time)}
                </Text>
              </View>
            </View>
            <View style={styles.quickInfoCard}>
              <View style={styles.quickInfoIconContainer}>
                <Ionicons name="time" size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.quickInfoLabel}>{t("events.time")}</Text>
                <Text style={styles.quickInfoValue}>
                  {formatEventTime(event.start_time)}
                </Text>
              </View>
            </View>
          </View>

          {/* Location Card */}
          {event.location && (
            <Pressable style={styles.locationCard} onPress={openMap}>
              <View style={styles.locationIconContainer}>
                <Ionicons name="location" size={24} color="#fff" />
              </View>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t("events.location")}</Text>
                <Text style={styles.locationValue}>
                  {event.location}
                </Text>
              </View>
              {hasCoordinates && (
                <View style={styles.mapButton}>
                  <Ionicons name="navigate" size={18} color="#fff" />
                </View>
              )}
            </Pressable>
          )}

          {/* Map Preview */}
          {hasCoordinates && eventLocation && (
            <>
              <View style={styles.mapContainer}>
                <BusinessMap
                  location={eventLocation}
                  markers={[{ id: "event", latitude: eventLocation.latitude, longitude: eventLocation.longitude, title: event.title, description: event.location || organizer || "" }]}
                  height={200}
                  onMarkerPress={() => openMap()}
                />
              </View>
              <Pressable style={[styles.mapOverlay, { backgroundColor: `${COLORS.textPrimary}e6` }]} onPress={openMap}>
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.mapOverlayText}>{t("events.openInMaps") || "Open in Maps"}</Text>
              </Pressable>
            </>
          )}

          {/* Description */}
          {event.description && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text" size={18} color={COLORS.textPrimary} />
                <Text style={styles.cardTitle}>{t("events.description")}</Text>
              </View>
              <Text style={styles.description}>{event.description}</Text>
            </View>
          )}

          {/* Tagged Artists */}
          {event.tagged_artists && event.tagged_artists.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="mic" size={18} color={COLORS.textPrimary} />
                <Text style={styles.cardTitle}>{t("events.taggedArtists", "Artists")}</Text>
              </View>
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
                        <Ionicons name="person" size={18} color="#9ca3af" />
                      </View>
                    )}
                    <Text style={styles.taggedArtistName} numberOfLines={1}>{artist.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Gallery — all media including cover */}
          {(() => {
            const allMediaItems = buildEventMediaItems(event);
            if (allMediaItems.length === 0) return null;
            return (
              <View style={styles.gallerySection}>
                <Text style={styles.sectionTitle}>{t("events.gallery") || "Gallery"}</Text>
                <View style={styles.galleryGrid}>
                  {allMediaItems.map((item, idx) => {
                    const thumbnailUrl = item.type === "video"
                      ? item.muxThumbnailUrl || getMuxThumbnail(item.uri) || item.uri
                      : item.uri;
                    return (
                      <View key={`g-${idx}`} style={styles.galleryItemWrap}>
                        <Pressable
                          style={StyleSheet.absoluteFill}
                          onPress={() => {
                            setViewerMedia(allMediaItems);
                            setViewerIndex(idx);
                            setViewerOpen(true);
                          }}
                        >
                          <AdaptiveImage
                            uri={thumbnailUrl}
                            style={styles.galleryImage}
                            resizeMode="contain"
                            borderRadius={8}
                            showFallbackIcon={false}
                          />
                          {item.type === "video" && (
                            <View style={styles.galleryPlayOverlay}>
                              <Ionicons name="play-circle" size={24} color="#fff" />
                            </View>
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })()}

          {/* RSVP Section */}
          <View style={styles.rsvpSection}>
            <Text style={styles.sectionTitle}>{t("events.yourResponse") || "Your Response"}</Text>
            {isPast && (
              <Text style={styles.pastEventNote}>{t("events.pastEventNote") || "This event has ended."}</Text>
            )}
            <View style={styles.rsvpButtons}>
              <Pressable
                style={[styles.attendButton, isPast && styles.disabledButton]}
                onPress={isPast ? undefined : handleToggleAttendance}
                disabled={isPast}
              >
                <View style={[styles.attendButtonContent, { backgroundColor: COLORS.textPrimary }]}>
                  <Ionicons 
                    name={isAttending ? "checkmark-circle" : "add-circle-outline"} 
                    size={20} 
                    color="#fff" 
                  />
                  <Text style={styles.attendButtonText}>
                    {isAttending ? t("events.attending") : t("events.rsvp")}
                  </Text>
                </View>
              </Pressable>
              
              {/* Reminder Button */}
              <Pressable
                style={[styles.reminderButton, hasReminder && styles.reminderButtonActive, isPast && styles.disabledButton]}
                onPress={isPast ? undefined : handleToggleReminder}
                disabled={settingReminder || isPast}
                data-testid="event-reminder-btn"
              >
                {settingReminder ? (
                  <ActivityIndicator size="small" color={COLORS.textPrimary} />
                ) : (
                  <>
                    <Ionicons 
                      name={hasReminder ? "notifications" : "notifications-outline"} 
                      size={22} 
                      color={COLORS.textPrimary} 
                    />
                    <Text style={[styles.reminderButtonText, hasReminder && styles.reminderButtonTextActive]}>
                      {hasReminder ? t("events.reminded") || "Reminded" : t("events.remindMe") || "Remind"}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* Share Section */}
          <View style={styles.shareSection}>
            <Text style={styles.sectionTitle}>{t("events.inviteFriends")}</Text>
            <View style={styles.shareActions}>
              <Pressable style={styles.shareAction} onPress={shareToWhatsApp}>
                <View style={styles.shareActionIconWrap}>
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                </View>
                <Text style={styles.shareActionLabel}>WhatsApp</Text>
              </Pressable>
              <Pressable style={styles.shareAction} onPress={() => setShowShareModal(true)}>
                <View style={styles.shareActionIconWrap}>
                  <Ionicons name="share-outline" size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.shareActionLabel}>{t("events.share")}</Text>
              </Pressable>
              <Pressable style={styles.shareAction} onPress={handleToggleSave} disabled={savingItem}>
                <View style={styles.shareActionIconWrap}>
                  <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={20} color={isSaved ? COLORS.gold : COLORS.primary} />
                </View>
                <Text style={styles.shareActionLabel}>{isSaved ? t("common.saved") : t("events.save", "Save")}</Text>
              </Pressable>
            </View>
          </View>

          {/* Share Modal */}
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

          {/* Chat Section */}
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
        </ScrollView>

        {/* Password Modal for Private Events */}
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
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    marginLeft: 4,
    fontWeight: "500",
  },
  // Hero Section - Full Bleed Immersive
  heroContainer: {
    width: "100%",
    maxHeight: 470,
    overflow: "hidden",
    marginBottom: 0,
  },
  heroMedia: {
    width: "100%",
    maxHeight: 470,
    resizeMode: "cover",
  },
  heroFallbackIcon: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  heroBackButton: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
  },
  heroBackPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 2,
  },
  heroBackText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: "500",
  },
  heroGradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 180,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 40,
  },
  heroBadgeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  heroBadgeText: {
    color: COLORS.background,
    fontSize: 11,
    fontWeight: "600",
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.background,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  heroOrganizerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroOrganizerAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  heroOrganizerAvatarPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroOrganizerText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.85)",
    fontWeight: "500",
  },
  // Quick Info Cards
  quickInfoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  quickInfoCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  quickInfoIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.eventAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  quickInfoLabel: {
    fontSize: 11,
    color: COLORS.textDisabled,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quickInfoValue: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
  },
  // Location Card
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  locationIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.eventAccent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
    color: COLORS.textDisabled,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  // Map
  mapContainer: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  mapImage: {
    width: "100%",
    height: 140,
  },
  mapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
  },
  mapOverlayText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: "600",
  },
  // Card
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
  },
  description: {
    fontSize: 15,
    color: "#4b5563",
    lineHeight: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 12,
  },
  rsvpSection: {
    padding: 16,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    marginBottom: 16,
  },
  pastEventNote: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 12,
    fontStyle: "italic",
  },
  disabledButton: {
    opacity: 0.5,
  },
  rsvpButtons: {
    flexDirection: "row",
    gap: 10,
  },
  attendButton: {
    flex: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  attendButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 8,
    borderRadius: 8,
  },
  attendButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  attendButtonText: {
    color: COLORS.background,
    fontSize: 15,
    fontWeight: "700",
  },
  attendCountBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  attendCountText: {
    color: COLORS.background,
    fontSize: 13,
    fontWeight: "700",
  },
  reminderButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reminderButtonActive: {
    backgroundColor: COLORS.warning,
    borderColor: COLORS.warning,
  },
  reminderButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  reminderButtonTextActive: {
    color: COLORS.background,
  },
  // Share Section
  shareSection: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  shareActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  shareAction: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  shareActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  shareActionLabel: {
    fontSize: 11,
    color: COLORS.textMuted || COLORS.textSecondary || "#6b7280",
    textAlign: "center",
  },
  // Chat Section
  chatSection: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  chatIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.eventAccent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
  },
  chatSubtitle: {
    fontSize: 13,
    color: COLORS.textDisabled,
    marginTop: 2,
  },
  chatToggle: {
    padding: 4,
  },
  chatMessages: {
    maxHeight: 400,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyChat: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
  },
  emptyChatIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyChatText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  emptyChatSubtext: {
    fontSize: 14,
    color: COLORS.textDisabled,
  },
  chatBubble: {
    maxWidth: "80%",
    marginBottom: 10,
  },
  chatBubbleMe: {
    alignSelf: "flex-end",
  },
  chatBubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    padding: 12,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  chatBubbleMeGradient: {
    padding: 12,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  chatBubbleName: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  chatBubbleText: {
    fontSize: 15,
    color: COLORS.primary,
  },
  chatBubbleTextMe: {
    fontSize: 15,
    color: COLORS.background,
  },
  chatBubbleTime: {
    fontSize: 11,
    color: COLORS.textDisabled,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  chatBubbleTimeMe: {
    fontSize: 11,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  chatInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    gap: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 100,
    color: COLORS.primary,
  },
  chatSendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: "hidden",
  },
  chatSendBtnDisabled: {
    opacity: 0.5,
  },
  chatSendBtnGradient: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  // Login Prompt
  loginPrompt: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  loginPromptIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  loginPromptText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  loginButton: {
    borderRadius: 24,
    overflow: "hidden",
    marginTop: 4,
  },
  loginButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  loginButtonText: {
    color: COLORS.background,
    fontWeight: "700",
    fontSize: 15,
  },
  // Error state
  errorText: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginTop: 12,
    marginBottom: 20,
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: "700",
  },
  // Themed Alert Styles
  themedAlertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  themedAlertContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  themedAlertMessage: {
    fontSize: 16,
    color: COLORS.primary,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  themedAlertButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  },
  themedAlertButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: "600",
  },
  gallerySection: {
    marginTop: 12,
    paddingHorizontal: 12,
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  galleryImage: {
    width: "100%",
    height: "100%",
  },
  galleryItemWrap: {
    position: "relative",
    width: "calc(33.33% - 6px)",
    aspectRatio: 1,
    overflow: "hidden",
    backgroundColor: "#1f2937",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  galleryPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  galleryRemoveBtn: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    zIndex: 5,
  },
  galleryAddBtn: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
  },
  galleryAddText: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textSecondary,
    fontWeight: "500" as const,
  },

  passwordModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  passwordModalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 24,
    width: "85%",
  },
  passwordModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 4,
  },
  passwordModalHint: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  passwordModalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.primary,
    marginBottom: 16,
  },
  passwordModalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  passwordModalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  passwordModalCancelText: {
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  passwordModalSubmit: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  passwordModalSubmitText: {
    color: COLORS.background,
    fontWeight: "600",
  },
  taggedArtistsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 8,
  },
  taggedArtistCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.backgroundPage,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
  },
  taggedArtistAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  taggedArtistAvatarPlaceholder: {
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  taggedArtistName: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textPrimary,
  },
});

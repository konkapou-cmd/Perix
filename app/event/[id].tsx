import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";
import { useSafeNavigation } from "../../hooks/useSafeNavigation";
import ShareContent from "../../components/ShareContent";
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
} from "../../lib/api";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

// Event themes with colors and emojis - matching music genres for parties
const EVENT_THEMES: Record<string, { emoji: string; label: string; color: string; gradient: string[] }> = {
  "hip-hop": { emoji: "🎤", label: "Hip Hop", color: "#f59e0b", gradient: ["#f59e0b", "#d97706"] },
  "rnb": { emoji: "💜", label: "R&B", color: "#8b5cf6", gradient: ["#8b5cf6", "#7c3aed"] },
  "dance-edm": { emoji: "🎧", label: "Dance / EDM", color: "#06b6d4", gradient: ["#06b6d4", "#0891b2"] },
  "techno": { emoji: "⚡", label: "Techno", color: "#1f2937", gradient: ["#374151", "#1f2937"] },
  "latin": { emoji: "💃", label: "Latin", color: "#ef4444", gradient: ["#ef4444", "#dc2626"] },
  "afrobeat": { emoji: "🌍", label: "Afrobeat", color: "#22c55e", gradient: ["#22c55e", "#16a34a"] },
  "dancehall": { emoji: "🌴", label: "Dancehall", color: "#eab308", gradient: ["#eab308", "#ca8a04"] },
  "house": { emoji: "🏠", label: "House", color: "#3b82f6", gradient: ["#3b82f6", "#2563eb"] },
  "funk-disco": { emoji: "🪩", label: "Funk & Disco", color: "#ec4899", gradient: ["#ec4899", "#db2777"] },
  "reggaeton": { emoji: "🔥", label: "Reggaeton", color: "#f97316", gradient: ["#f97316", "#ea580c"] },
  "throwback": { emoji: "📼", label: "Throwback", color: "#a855f7", gradient: ["#a855f7", "#9333ea"] },
  "trap": { emoji: "🔊", label: "Trap", color: "#991b1b", gradient: ["#b91c1c", "#991b1b"] },
  "amapiano": { emoji: "🇿🇦", label: "Amapiano", color: "#10b981", gradient: ["#10b981", "#059669"] },
  "multi-genre": { emoji: "🎶", label: "Multi-Genre", color: "#6366f1", gradient: ["#6366f1", "#4f46e5"] },
  "tropical": { emoji: "🌺", label: "Tropical", color: "#14b8a6", gradient: ["#14b8a6", "#0d9488"] },
  "vip-luxury": { emoji: "👑", label: "VIP Night", color: "#d4af37", gradient: ["#d4af37", "#b8860b"] },
  "festival": { emoji: "🎪", label: "Festival", color: "#f472b6", gradient: ["#f472b6", "#ec4899"] },
  "greek-music": { emoji: "🇬🇷", label: "Greek Music", color: "#0284c7", gradient: ["#0284c7", "#0369a1"] },
  "international": { emoji: "🌐", label: "International", color: "#7c3aed", gradient: ["#7c3aed", "#6d28d9"] },
};

const DEFAULT_THEME = { emoji: "🎉", label: "Event", color: "#8b5cf6", gradient: ["#8b5cf6", "#7c3aed"] };

export default function EventDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const { safeGoBack, router } = useSafeNavigation();
  const [event, setEvent] = useState<EventItem | null>(null);
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
  const chatScrollRef = useRef<ScrollView>(null);

  // Get theme info
  const getTheme = () => {
    if (!event?.theme) return DEFAULT_THEME;
    return EVENT_THEMES[event.theme] || DEFAULT_THEME;
  };

  const theme = event ? getTheme() : DEFAULT_THEME;

  useEffect(() => {
    loadEvent();
  }, [id, sessionToken]);

  useEffect(() => {
    if (sessionToken && id) {
      loadChatMessages();
    }
  }, [sessionToken, id]);

  // Poll for new messages every 5 seconds when chat is open
  useEffect(() => {
    if (!sessionToken || !id || !showChat) return;
    const interval = setInterval(() => {
      loadChatMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionToken, id, showChat]);

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
    } catch (error) {
      console.error("Failed to load event:", error);
      Alert.alert(t("common.error"), t("events.eventNotFound"));
    }
    setLoading(false);
  };

  const loadChatMessages = async () => {
    if (!sessionToken || !id) return;
    setLoadingChat(true);
    try {
      const messages = await getEventMessages(sessionToken, id);
      setChatMessages(messages);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
    setLoadingChat(false);
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
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
    } finally {
      setSendingMessage(false);
    }
  };

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
    
    try {
      const result = await toggleEventAttendance(sessionToken, id);
      setIsAttending(result.is_attending);
      setAttendeesCount(result.attendees_count);
    } catch (error) {
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
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
      Alert.alert(
        t("events.loginRequired"),
        t("events.loginToReminder") || "Please log in to set a reminder"
      );
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
      Alert.alert(t("common.error"), error.message || t("common.pleaseTryAgain"));
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
      Alert.alert(
        t("events.reminderSet") || "Reminder Set!",
        t("events.reminderSetDesc") || `We'll notify you ${minutesBefore >= 60 ? `${Math.floor(minutesBefore/60)} hour(s)` : `${minutesBefore} minutes`} before the event`
      );
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message || t("common.pleaseTryAgain"));
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
    
    const eventDate = new Date(event.start_time).toLocaleDateString();
    const eventTime = new Date(event.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
    
    const eventDate = new Date(event.start_time).toLocaleDateString();
    const eventTime = new Date(event.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
        <Pressable style={[styles.primaryButton, { backgroundColor: theme.color }]} onPress={safeGoBack}>
          <Text style={styles.primaryButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const eventDate = new Date(event.start_time);
  const organizer = event.artist?.name || event.business?.name;
  const hasCoordinates = event.business?.latitude || event.artist?.latitude;
  const themeInfo = getTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: `${themeInfo.color}08` }]} edges={["top"]}>
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
          {/* Back Button */}
          <Pressable style={styles.backButton} onPress={safeGoBack}>
            <Ionicons name="chevron-back" size={20} color={themeInfo.color} />
            <Text style={[styles.backText, { color: themeInfo.color }]}>{t("common.back")}</Text>
          </Pressable>

          {/* Event Image/Video with Gradient Overlay */}
          <View style={styles.heroContainer}>
            {event.video_url ? (
              <Video
                source={{ uri: event.video_url }}
                style={styles.heroMedia}
                resizeMode={ResizeMode.COVER}
                shouldPlay={true}
                isLooping={true}
                isMuted={false}
                useNativeControls={true}
              />
            ) : event.image_base64 ? (
              <Image source={{ uri: event.image_base64 }} style={styles.heroMedia} />
            ) : (
              <LinearGradient
                colors={themeInfo.gradient}
                style={styles.heroPlaceholder}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Text style={styles.heroEmoji}>{themeInfo.emoji}</Text>
              </LinearGradient>
            )}
            
            {/* Gradient Overlay for text readability */}
            {(event.video_url || event.image_base64) && (
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.7)"]}
                style={styles.heroOverlay}
              />
            )}

            {/* Theme Badge */}
            <View style={styles.badgeRow}>
              <LinearGradient
                colors={themeInfo.gradient}
                style={styles.themeBadge}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.badgeEmoji}>{themeInfo.emoji}</Text>
                <Text style={styles.badgeText}>{themeInfo.label}</Text>
              </LinearGradient>
              
              {/* Attendees Badge */}
              <View style={styles.attendeesBadge}>
                <Ionicons name="people" size={14} color="#fff" />
                <Text style={styles.attendeesBadgeText}>{attendeesCount}</Text>
              </View>
            </View>
          </View>

          {/* Event Title & Organizer */}
          <View style={styles.header}>
            <Text style={styles.title}>{event.title}</Text>
            {organizer && (
              <Pressable 
                style={styles.organizerRow}
                onPress={() => {
                  if (event.artist?.artist_id) {
                    router.push(`/artist/${event.artist.artist_id}`);
                  } else if (event.business?.business_id) {
                    router.push(`/business/${event.business.business_id}`);
                  }
                }}
              >
                <Text style={styles.organizerText}>{t("events.by")} </Text>
                <Text style={[styles.organizerName, { color: themeInfo.color }]}>{organizer}</Text>
                <Ionicons name="chevron-forward" size={16} color={themeInfo.color} />
              </Pressable>
            )}
          </View>

          {/* Quick Info Cards Row */}
          <View style={styles.quickInfoRow}>
            <View style={[styles.quickInfoCard, { borderLeftColor: themeInfo.color }]}>
              <Ionicons name="calendar" size={20} color={themeInfo.color} />
              <View>
                <Text style={styles.quickInfoLabel}>{t("events.date")}</Text>
                <Text style={styles.quickInfoValue}>
                  {eventDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </Text>
              </View>
            </View>
            <View style={[styles.quickInfoCard, { borderLeftColor: "#f59e0b" }]}>
              <Ionicons name="time" size={20} color="#f59e0b" />
              <View>
                <Text style={styles.quickInfoLabel}>{t("events.time")}</Text>
                <Text style={styles.quickInfoValue}>
                  {eventDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          </View>

          {/* Location Card */}
          {event.location && (
            <Pressable style={styles.locationCard} onPress={openMap}>
              <View style={styles.locationIconContainer}>
                <Ionicons name="location" size={24} color="#ef4444" />
              </View>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t("events.location")}</Text>
                <Text style={[styles.locationValue, hasCoordinates && { color: themeInfo.color }]}>
                  {event.location}
                </Text>
              </View>
              {hasCoordinates && (
                <View style={[styles.mapButton, { backgroundColor: themeInfo.color }]}>
                  <Ionicons name="navigate" size={18} color="#fff" />
                </View>
              )}
            </Pressable>
          )}

          {/* Map Preview */}
          {hasCoordinates && (
            <Pressable style={styles.mapContainer} onPress={openMap}>
              <Image 
                source={{ 
                  uri: `https://maps.googleapis.com/maps/api/staticmap?center=${event.business?.latitude || event.artist?.latitude},${event.business?.longitude || event.artist?.longitude}&zoom=15&size=600x200&maptype=roadmap&markers=color:red%7C${event.business?.latitude || event.artist?.latitude},${event.business?.longitude || event.artist?.longitude}&key=AIzaSyAMr1Se10FOuTAV7YMEpDvWaKunxRWMa-c`
                }}
                style={styles.mapImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={[`${themeInfo.color}e6`, `${themeInfo.color}cc`]}
                style={styles.mapOverlay}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.mapOverlayText}>{t("events.openInMaps") || "Open in Maps"}</Text>
              </LinearGradient>
            </Pressable>
          )}

          {/* Description */}
          {event.description && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text" size={18} color={themeInfo.color} />
                <Text style={styles.cardTitle}>{t("events.description")}</Text>
              </View>
              <Text style={styles.description}>{event.description}</Text>
            </View>
          )}

          {/* RSVP Section */}
          <View style={styles.rsvpSection}>
            <Text style={styles.sectionTitle}>{t("events.yourResponse") || "Your Response"}</Text>
            <View style={styles.rsvpButtons}>
              <Pressable 
                style={[styles.attendButton, isAttending && { backgroundColor: "#10b981" }]} 
                onPress={handleToggleAttendance}
              >
                <LinearGradient
                  colors={isAttending ? ["#10b981", "#059669"] : themeInfo.gradient}
                  style={styles.attendButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Ionicons 
                    name={isAttending ? "checkmark-circle" : "add-circle-outline"} 
                    size={24} 
                    color="#fff" 
                  />
                  <Text style={styles.attendButtonText}>
                    {isAttending ? t("events.imAttending") : t("events.iWillAttend")}
                  </Text>
                  <View style={styles.attendCountBadge}>
                    <Text style={styles.attendCountText}>{attendeesCount}</Text>
                  </View>
                </LinearGradient>
              </Pressable>
              
              {/* Reminder Button */}
              <Pressable 
                style={[styles.reminderButton, hasReminder && styles.reminderButtonActive]} 
                onPress={handleToggleReminder}
                disabled={settingReminder}
                data-testid="event-reminder-btn"
              >
                {settingReminder ? (
                  <ActivityIndicator size="small" color={hasReminder ? "#fff" : themeInfo.color} />
                ) : (
                  <>
                    <Ionicons 
                      name={hasReminder ? "notifications" : "notifications-outline"} 
                      size={22} 
                      color={hasReminder ? "#fff" : themeInfo.color} 
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
            <View style={styles.shareButtons}>
              <Pressable style={styles.whatsappButton} onPress={shareToWhatsApp}>
                <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                <Text style={styles.shareButtonText}>WhatsApp</Text>
              </Pressable>
              <Pressable 
                style={[styles.shareButton, { borderColor: themeInfo.color, backgroundColor: `${themeInfo.color}15` }]} 
                onPress={() => setShowShareModal(true)}
              >
                <Ionicons name="share-outline" size={24} color={themeInfo.color} />
                <Text style={[styles.shareButtonTextSecondary, { color: themeInfo.color }]}>
                  {t("events.share")}
                </Text>
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
            description={event.description}
            imageUrl={event.image_base64}
            extraData={{
              location: event.location,
              date: new Date(event.start_time).toLocaleDateString(),
              organizerName: organizer,
            }}
          />

          {/* Chat Section */}
          {sessionToken && (
            <View style={styles.chatSection}>
              <Pressable 
                style={styles.chatHeader}
                onPress={() => setShowChat(!showChat)}
              >
                <View style={[styles.chatIconContainer, { backgroundColor: `${themeInfo.color}15` }]}>
                  <Ionicons name="chatbubbles" size={22} color={themeInfo.color} />
                </View>
                <View style={styles.chatHeaderInfo}>
                  <Text style={styles.chatTitle}>{t("events.chat") || "Event Chat"}</Text>
                  <Text style={styles.chatSubtitle}>
                    {chatMessages.length} {t("events.messages") || "messages"}
                  </Text>
                </View>
                <View style={styles.chatToggle}>
                  <Ionicons 
                    name={showChat ? "chevron-up" : "chevron-down"} 
                    size={20} 
                    color="#6b7280" 
                  />
                </View>
              </Pressable>
              
              {showChat && (
                <>
                  <ScrollView 
                    ref={chatScrollRef}
                    style={styles.chatMessages}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={false}
                  >
                    {loadingChat ? (
                      <ActivityIndicator size="small" color={themeInfo.color} style={{ marginVertical: 20 }} />
                    ) : chatMessages.length === 0 ? (
                      <View style={styles.emptyChat}>
                        <View style={[styles.emptyChatIcon, { backgroundColor: `${themeInfo.color}15` }]}>
                          <Ionicons name="chatbubbles-outline" size={32} color={themeInfo.color} />
                        </View>
                        <Text style={styles.emptyChatText}>
                          {t("events.noChatMessages") || "No messages yet"}
                        </Text>
                        <Text style={styles.emptyChatSubtext}>
                          {t("events.startConversation") || "Be the first to say hi!"}
                        </Text>
                      </View>
                    ) : (
                      chatMessages.map((msg) => {
                        const isMe = msg.user_id === user?.user_id || msg.from_user_id === user?.user_id;
                        const senderId = msg.user_id || msg.from_user_id;
                        return (
                          <View 
                            key={msg.message_id} 
                            style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}
                          >
                            {!isMe && msg.user_name && (
                              <Pressable 
                                onPress={() => router.push(`/user/${senderId}`)}
                                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                              >
                                <Text style={[styles.chatBubbleName, { color: themeInfo.color }]}>
                                  {msg.user_name}
                                </Text>
                              </Pressable>
                            )}
                            {isMe ? (
                              <LinearGradient
                                colors={themeInfo.gradient}
                                style={styles.chatBubbleMeGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                              >
                                <Text style={styles.chatBubbleTextMe}>{msg.text}</Text>
                                <Text style={styles.chatBubbleTimeMe}>
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </Text>
                              </LinearGradient>
                            ) : (
                              <>
                                <Text style={styles.chatBubbleText}>{msg.text}</Text>
                                <Text style={styles.chatBubbleTime}>
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </Text>
                              </>
                            )}
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                  
                  <View style={styles.chatInputContainer}>
                    <TextInput
                      style={styles.chatInput}
                      placeholder={t("events.typeMessage") || "Type a message..."}
                      placeholderTextColor="#9ca3af"
                      value={chatText}
                      onChangeText={setChatText}
                      multiline
                      maxLength={500}
                    />
                    <Pressable 
                      style={[styles.chatSendBtn, (!chatText.trim() || sendingMessage) && styles.chatSendBtnDisabled]}
                      onPress={handleSendMessage}
                      disabled={!chatText.trim() || sendingMessage}
                    >
                      <LinearGradient
                        colors={themeInfo.gradient}
                        style={styles.chatSendBtnGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {sendingMessage ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="send" size={18} color="#fff" />
                        )}
                      </LinearGradient>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}
          
          {/* Login prompt for chat if not authenticated */}
          {!sessionToken && (
            <View style={styles.loginPrompt}>
              <View style={[styles.loginPromptIcon, { backgroundColor: `${themeInfo.color}15` }]}>
                <Ionicons name="chatbubbles-outline" size={28} color={themeInfo.color} />
              </View>
              <Text style={styles.loginPromptText}>
                {t("events.loginToChat") || "Log in to join the conversation"}
              </Text>
              <Pressable 
                style={styles.loginButton} 
                onPress={() => router.push("/login")}
              >
                <LinearGradient
                  colors={themeInfo.gradient}
                  style={styles.loginButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.loginButtonText}>{t("auth.login")}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </ScrollView>
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
    paddingBottom: 40,
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
  // Hero Section
  heroContainer: {
    width: "100%",
    height: 240,
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 20,
    position: "relative",
  },
  heroMedia: {
    width: "100%",
    height: "100%",
  },
  heroPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  heroEmoji: {
    fontSize: 72,
  },
  heroOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
  },
  badgeRow: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  themeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 6,
  },
  badgeEmoji: {
    fontSize: 16,
  },
  badgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  attendeesBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  attendeesBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  // Header
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  organizerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  organizerText: {
    fontSize: 16,
    color: "#6b7280",
  },
  organizerName: {
    fontSize: 16,
    fontWeight: "600",
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
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  quickInfoLabel: {
    fontSize: 11,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  quickInfoValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  // Location Card
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  locationIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 11,
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  mapButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  // Card
  card: {
    backgroundColor: "#fff",
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
    color: "#111827",
  },
  description: {
    fontSize: 15,
    color: "#4b5563",
    lineHeight: 24,
  },
  // RSVP Section
  rsvpSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  rsvpButtons: {
    flexDirection: "row",
    gap: 10,
  },
  attendButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
  },
  attendButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  attendButtonText: {
    color: "#fff",
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
    color: "#fff",
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
    borderColor: "#e5e7eb",
  },
  reminderButtonActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  reminderButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  reminderButtonTextActive: {
    color: "#fff",
  },
  // Share Section
  shareSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  shareButtons: {
    flexDirection: "row",
    gap: 12,
  },
  whatsappButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#25D366",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    gap: 8,
  },
  shareButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  shareButtonTextSecondary: {
    fontSize: 15,
    fontWeight: "600",
  },
  // Chat Section
  chatSection: {
    backgroundColor: "#fff",
    borderRadius: 20,
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
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  chatSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  chatToggle: {
    padding: 4,
  },
  chatMessages: {
    maxHeight: 320,
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
    color: "#374151",
  },
  emptyChatSubtext: {
    fontSize: 14,
    color: "#9ca3af",
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
    color: "#111827",
  },
  chatBubbleTextMe: {
    fontSize: 15,
    color: "#fff",
  },
  chatBubbleTime: {
    fontSize: 11,
    color: "#9ca3af",
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
    backgroundColor: "#f9fafb",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 100,
    color: "#111827",
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
    backgroundColor: "#fff",
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
    color: "#6b7280",
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
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  // Error state
  errorText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
    marginBottom: 20,
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

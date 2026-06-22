import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { useNotifications } from "../../context/NotificationContext";
import { useSocket, useSocketEvent } from "../../context/SocketContext";

import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { formatDate, formatTime } from "../../lib/formatDate";
import AdaptiveImage from "../../components/AdaptiveImage";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";

const { width } = Dimensions.get("window");
import {
  ActivityItem,
  ChatMessage,
  getActivityDetail,
  getActivityMessages,
  rsvpActivity,
  sendActivityMessage,
  ACTIVITY_THEMES,
  isUpcomingActivity,
  toggleSaved,
  checkSaved,
} from "../../lib/api";
import ShareContent from "../../components/ShareContent";
import BusinessMap from "../../components/BusinessMap";
import ChatSection from "../../components/shared/ChatSection";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

const MAPS_API_KEY =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

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

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  // Themed Alert state
  const [themedAlertVisible, setThemedAlertVisible] = useState(false);
  const [themedAlertMessage, setThemedAlertMessage] = useState("");

  // Helper to show themed alert
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
    } catch (e) {
      console.warn("Share failed:", e);
    }
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
      const interval = setInterval(() => {
        loadChatMessages(false);
      }, connected ? 30000 : 15000);
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
      } catch (error) {
        console.error("Failed to check saved status:", error);
      }
    } catch (error) {
      console.error("Failed to load activity:", error);
      showThemedAlert(t("activities.activityNotFound"));
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
    if (!activity) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "activity", activity.activity_id);
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
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
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
      const newMsg = await sendActivityMessage(sessionToken, id, "", mediaUrl);
      setChatMessages(prev => [...prev, newMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      showThemedAlert(t("common.pleaseTryAgain"));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleRsvp = async (status: "going" | "maybe" | "declined") => {
    if (!sessionToken || !id) return;
    
    try {
      const result = await rsvpActivity(sessionToken, id, status);
      setMyStatus(result.my_status);
    } catch (error) {
      showThemedAlert(t("common.pleaseTryAgain"));
    }
  };

  const handleSetReminder = () => {
    Alert.alert(
      t("activities.setReminder") || "Set Reminder",
      t("activities.reminderOptions") || "When would you like to be reminded?",
      [
        { text: t("common.cancel"), style: "cancel" },
        { 
          text: "15 min before", 
          onPress: () => scheduleActivityReminder(15) 
        },
        { 
          text: "1 hour before", 
          onPress: () => scheduleActivityReminder(60) 
        },
        { 
          text: "1 day before", 
          onPress: () => scheduleActivityReminder(60 * 24) 
        },
      ]
    );
  };

  const scheduleActivityReminder = async (minutesBefore: number) => {
    if (!activity) return;
    const reminderTime = new Date(activity.date + "T" + activity.time);
    reminderTime.setMinutes(reminderTime.getMinutes() - minutesBefore);
    const now = new Date();
    
    if (reminderTime <= now) {
      showThemedAlert(t("activities.pastTimeError") || "This activity has already started or passed.");
      return;
    }
    
    await showLocalNotification(
      t("activities.reminderTitle") || "Activity Reminder",
      t("activities.reminderBody", { title: activity.title }) || `${activity.title} is starting in ${minutesBefore >= 60 ? `${Math.floor(minutesBefore/60)} hour(s)` : `${minutesBefore} minutes`}!`,
      { type: "activity", activity_id: activity.activity_id }
    );
    showThemedAlert(t("activities.reminderSetDesc") || `We'll remind you ${minutesBefore >= 60 ? `in ${Math.floor(minutesBefore/60)} hour(s)` : `in ${minutesBefore} minutes`}.`);
  };

  const copyInvitationCode = async () => {
    if (!activity?.invitation_code) return;
    // Use Share API as a fallback since Clipboard might not work on all devices
    await Share.share({ 
      message: activity.invitation_code,
      title: t("activities.invitationCode") || "Invitation Code"
    });
  };

  const shareInvitationCode = async () => {
    if (!activity) return;
    
    const activityDate = new Date(activity.date);
    const organizer = activity.creator?.name || "";
    const location = activity.location || "";
    
    let message = `${activity.title}\n`;
    message += `${t("activities.by")} ${organizer}\n`;
    message += `${formatDate(activity.date)} ${t("common.at")} ${activity.time}\n`;
    if (location) message += `${location}\n`;
    
    if (activity.is_private && activity.invitation_code) {
      message += `\n${t("activities.invitationCodeLabel") || "Invitation Code"}: ${activity.invitation_code}`;
    }
    
    // Use /share/ prefix for public deep links
    const activityUrl = `${BACKEND_URL?.replace('/api', '')}/share/activity/${activity.activity_id}`;
    message += `\n\n${activityUrl}`;
    
    await Share.share({ message });
  };

  const shareToWhatsApp = async () => {
    if (!activity) return;
    
    const activityDate = new Date(activity.date);
    const organizer = activity.creator?.name || "";
    const location = activity.location || "";
    
    let message = `${t("activities.invitationMessage", { 
      title: activity.title, 
      organizer,
      date: formatDate(activity.date),
      time: activity.time,
      location 
    })}`;
    
    if (activity.is_private && activity.invitation_code) {
      message += `\n\n${t("activities.useCodeToJoin") || "Use this code to join"}: ${activity.invitation_code}`;
    }
    
    // Use /share/ prefix for public deep links
    const activityUrl = `${BACKEND_URL?.replace('/api', '')}/share/activity/${activity.activity_id}`;
    message += `\n\n${t("activities.rsvpHere")}: ${activityUrl}`;
    
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

  const openMap = () => {
    if (!activity?.latitude || !activity?.longitude) return;
    
    const url = `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
    Linking.openURL(url);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={COLORS.textPrimary} size="large" />
      </SafeAreaView>
    );
  }

  if (!activity) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="people-outline" size={48} color="#9ca3af" />
        <Text style={styles.errorText}>{t("activities.activityNotFound")}</Text>
        <Pressable style={[styles.primaryButton, { backgroundColor: COLORS.textPrimary }]} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const activityDate = new Date(activity.date);
  const attendingCount = activity.invites?.filter(i => i.status === "going").length || 0;
  const themeLabel = activity.custom_theme ||
    (activity.theme ? ACTIVITY_THEMES[activity.theme as keyof typeof ACTIVITY_THEMES]?.label : null);
  const isPast = !isUpcomingActivity(activity);

  const buildActivityMediaItems = (act: any): MediaItem[] => {
    const items: MediaItem[] = [];
    const seen = new Set<string>();
    if (act.video_url) {
      seen.add(act.video_url);
      items.push({ type: "video", uri: act.video_url });
    }
    if (act.cover_image_url && !seen.has(act.cover_image_url)) {
      seen.add(act.cover_image_url);
      items.push({ type: "image", uri: act.cover_image_url });
    }
    (act.image_urls || []).forEach((u: string) => {
      if (!seen.has(u)) { seen.add(u); items.push({ type: "image", uri: u }); }
    });
    (act.gallery_images || []).forEach((u: string) => {
      if (!seen.has(u)) { seen.add(u); items.push({ type: "image", uri: u }); }
    });
    (act.gallery_videos || []).forEach((u: string) => {
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

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
          {/* Activity Hero - Full Bleed Immersive */}
          <View style={styles.heroContainer}>
            {activity.video_url ? (
              <AdaptiveVideo
                uri={activity.video_url}
                maxHeight={470}
                borderRadius={12}
                autoPlay={true}
                initialMuted={true}
                showMuteButton={true}
                onPress={() => {
                  const items = buildActivityMediaItems(activity);
                  setViewerMedia(items);
                  setViewerIndex(0);
                  setViewerOpen(true);
                }}
              />
            ) : (activity.cover_image_url || activity.image_urls?.[0]) ? (
              <AdaptiveImage
                uri={activity.cover_image_url || activity.image_urls?.[0] || ""}
                maxHeight={470}
                borderRadius={12}
                onPress={() => {
                  const items = buildActivityMediaItems(activity);
                  setViewerIndex(items.findIndex(i => i.uri === (activity.cover_image_url || activity.image_urls?.[0])));
                  setViewerMedia(items);
                  setViewerOpen(true);
                }}
              />
            ) : (
              <LinearGradient
                colors={["#2d1b69", "#1a1a2e", "#16213e"]}
                style={styles.heroMedia}
              >
                <View style={styles.heroFallbackIcon}>
                  <Ionicons name="people" size={48} color="rgba(255,255,255,0.3)" />
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
                    <Text style={styles.heroBadgeText}>{t("activities.pastActivity") || "Past Activity"}</Text>
                  </View>
                ) : (
                  <View style={styles.heroBadge}>
                    <Ionicons name="people" size={12} color="#fff" />
                    <Text style={styles.heroBadgeText}>{themeLabel || t("activities.activity")}</Text>
                  </View>
                )}
                {activity.is_private && (
                  <View style={styles.heroBadge}>
                    <Ionicons name="lock-closed" size={12} color="#fff" />
                    <Text style={styles.heroBadgeText}>{t("activities.private") || "Private"}</Text>
                  </View>
                )}
              </View>

              {/* Title */}
              <Text style={styles.heroTitle}>{activity.title}</Text>

              {/* Organizer */}
              {activity.creator && (
                <Pressable 
                  style={styles.heroOrganizerRow}
                  onPress={() => router.push(`/user/${activity.creator?.user_id}`)}
                >
                  {activity.creator.profile_photo ? (
                    <Image source={{ uri: activity.creator.profile_photo }} style={styles.heroOrganizerAvatar} />
                  ) : (
                    <View style={styles.heroOrganizerAvatarPlaceholder}>
                      <Text style={styles.heroOrganizerAvatarText}>
                        {(activity.creator.name || "U").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.heroOrganizerText}>{t("activities.by")} {activity.creator.name}</Text>
                </Pressable>
              )}
              {activity.tagged_business && (
                <Pressable 
                  style={styles.heroOrganizerRow}
                  onPress={() => router.push(`/business/${activity.tagged_business?.business_id}`)}
                >
                  <Ionicons name="business" size={12} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.heroOrganizerText}>{t("activities.at")} {activity.tagged_business.name}</Text>
                </Pressable>
              )}
            </LinearGradient>
          </View>

          {/* Invitation Code Section - Only for creator of private activities */}
          {activity.is_private && activity.is_creator && activity.invitation_code && (
            <View style={[styles.invitationCodeCard, { borderColor: COLORS.textPrimary }]}>
              <View style={styles.invitationCodeHeader}>
                <Ionicons name="key" size={20} color={COLORS.textPrimary} />
                <Text style={styles.invitationCodeTitle}>
                  {t("activities.invitationCode") || "Invitation Code"}
                </Text>
              </View>
              <View style={styles.invitationCodeRow}>
                <Text style={[styles.invitationCode, { color: COLORS.textPrimary }]}>
                  {activity.invitation_code}
                </Text>
                <Pressable style={styles.copyButton} onPress={copyInvitationCode}>
                  <Ionicons name="copy-outline" size={18} color={COLORS.textPrimary} />
                </Pressable>
              </View>
              <Text style={styles.invitationCodeHint}>
                {t("activities.shareCodeHint") || "Share this code with friends to invite them"}
              </Text>
            </View>
          )}

          {/* Tagged Business */}
          {activity.tagged_business && (
            <Pressable 
              style={styles.taggedBusinessCard}
              onPress={() => router.push(`/business/${activity.tagged_business?.business_id}`)}
            >
              {activity.tagged_business.logo_image && (
                <Image 
                  source={{ uri: activity.tagged_business.logo_image }} 
                  style={styles.taggedBusinessLogo} 
                />
              )}
              <View style={styles.taggedBusinessInfo}>
                <Text style={styles.taggedBusinessLabel}>{t("activities.venue") || "Venue"}</Text>
                <Text style={[styles.taggedBusinessName, { color: COLORS.textPrimary }]}>
                  {activity.tagged_business.name}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </Pressable>
          )}

          {/* Activity Details */}
          <View style={styles.quickInfoRow}>
            <View style={styles.quickInfoCard}>
              <View style={styles.quickInfoIconContainer}>
                <Ionicons name="calendar" size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.quickInfoLabel}>{t("activities.date")}</Text>
                <Text style={styles.quickInfoValue}>
                  {formatDate(activity.date)}
                </Text>
              </View>
            </View>
            <View style={styles.quickInfoCard}>
              <View style={styles.quickInfoIconContainer}>
                <Ionicons name="time" size={20} color="#fff" />
              </View>
              <View>
                <Text style={styles.quickInfoLabel}>{t("activities.time")}</Text>
                <Text style={styles.quickInfoValue}>{activity.time}</Text>
              </View>
            </View>
          </View>

          {!!activity.location && (
            <Pressable style={styles.locationCard} onPress={openMap}>
              <View style={styles.locationIconContainer}>
                <Ionicons name="location" size={24} color="#fff" />
              </View>
              <View style={styles.locationInfo}>
                <Text style={styles.locationLabel}>{t("activities.location")}</Text>
                <Text style={styles.locationValue}>{activity.location}</Text>
              </View>
              {!!activity.latitude && (
                <View style={styles.mapButton}>
                  <Ionicons name="navigate" size={18} color="#fff" />
                </View>
              )}
            </Pressable>
          )}

          {/* Description */}
          {!!activity.description && (
            <View style={styles.descriptionCard}>
              <View style={styles.cardHeader}>
                <Ionicons name="document-text" size={18} color={COLORS.activityAccent} />
                <Text style={styles.cardHeaderText}>{t("activities.description") || "Description"}</Text>
              </View>
              <Text style={styles.descriptionText}>{activity.description}</Text>
            </View>
          )}

          {/* Gallery */}
          {(activity.gallery_images?.length || activity.gallery_videos?.length) && (
            <View style={styles.galleryCard}>
              <View style={styles.cardHeader}>
                <Ionicons name="images" size={18} color={COLORS.activityAccent} />
                <Text style={styles.cardHeaderText}>{t("activities.gallery") || "Gallery"}</Text>
              </View>
              <View style={styles.galleryGrid}>
                {activity.gallery_images?.map((img: string, idx: number) => (
                  <View key={`gal-${idx}`} style={styles.galleryItemWrap}>
                    <AdaptiveImage
                      uri={img}
                      ratio={1}
                      maxHeight={200}
                      borderRadius={8}
                      onPress={() => {
                        const items = buildActivityMediaItems(activity);
                        const imgIdx = items.findIndex(i => i.uri === img);
                        setViewerMedia(items);
                        setViewerIndex(imgIdx >= 0 ? imgIdx : 0);
                        setViewerOpen(true);
                      }}
                    />
                  </View>
                ))}
                {activity.gallery_videos?.map((videoUri: string, idx: number) => {
                  const thumbnailUrl = getMuxThumbnail(videoUri);
                  return (
                    <View key={`gvid-${idx}`} style={styles.galleryItemWrap}>
                      <Pressable style={styles.galleryVideoInner} onPress={() => {
                        const items = buildActivityMediaItems(activity);
                        const videoIdx = items.findIndex(i => i.uri === videoUri && i.type === "video");
                        setViewerMedia(items);
                        setViewerIndex(videoIdx >= 0 ? videoIdx : 0);
                        setViewerOpen(true);
                      }}>
                        <AdaptiveImage
                          uri={thumbnailUrl || ""}
                          ratio={1}
                          maxHeight={200}
                          borderRadius={8}
                          fallbackColor={COLORS.textPrimary}
                          showFallbackIcon={false}
                        />
                        <View style={styles.videoPlayOverlaySmall}>
                          <Ionicons name="play-circle" size={32} color="#fff" />
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* RSVP */}
          {!isCreator && (
            <View style={styles.rsvpSection}>
              <Pressable
                style={[styles.rsvpButton, myStatus === "going" && styles.rsvpActive]}
                onPress={() => handleRsvp("going")}
              >
                <Ionicons name="checkmark-circle" size={20} color={myStatus === "going" ? "#fff" : COLORS.activityAccent} />
                <Text style={[styles.rsvpButtonText, myStatus === "going" && styles.rsvpButtonTextActive]}>Going</Text>
              </Pressable>
              <Pressable
                style={[styles.rsvpButton, myStatus === "maybe" && styles.rsvpMaybeActive]}
                onPress={() => handleRsvp("maybe")}
              >
                <Ionicons name="help-circle" size={20} color={myStatus === "maybe" ? "#fff" : "#f59e0b"} />
                <Text style={[styles.rsvpButtonText, myStatus === "maybe" && { color: "#fff" }]}>Maybe</Text>
              </Pressable>
              <Pressable
                style={[styles.rsvpButton, myStatus === "declined" && styles.rsvpDeclinedActive]}
                onPress={() => handleRsvp("declined")}
              >
                <Ionicons name="close-circle" size={20} color={myStatus === "declined" ? "#fff" : "#ef4444"} />
                <Text style={[styles.rsvpButtonText, myStatus === "declined" && { color: "#fff" }]}>Can't</Text>
              </Pressable>
            </View>
          )}

          {/* Share */}
          <View style={styles.shareSection}>
            <Text style={styles.sectionTitleShare}>{t("activities.inviteFriends", "Invite Friends")}</Text>
            <View style={styles.shareActions}>
              <Pressable style={styles.shareAction} onPress={shareToWhatsApp}>
                <View style={styles.shareActionIconWrap}>
                  <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                </View>
                <Text style={styles.shareActionLabel}>WhatsApp</Text>
              </Pressable>
              <Pressable style={styles.shareAction} onPress={() => setShowShareModal(true)}>
                <View style={styles.shareActionIconWrap}>
                  <Ionicons name="share-outline" size={20} color={COLORS.activityAccent} />
                </View>
                <Text style={styles.shareActionLabel}>{t("activities.share", "Share")}</Text>
              </Pressable>
              <Pressable style={styles.shareAction} onPress={handleToggleSave} disabled={savingItem}>
                <View style={styles.shareActionIconWrap}>
                  <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={20} color={isSaved ? COLORS.gold : COLORS.activityAccent} />
                </View>
                <Text style={styles.shareActionLabel}>{isSaved ? t("common.saved", "Saved") : t("activities.save", "Save")}</Text>
              </Pressable>
            </View>
          </View>

          {/* Media Viewer */}
          <LazyMediaViewer
            visible={viewerOpen}
            media={viewerMedia}
            initialIndex={viewerIndex}
            onClose={() => setViewerOpen(false)}
          />

          {/* Chat Section - Inline */}
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
    padding: 20,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
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
  heroOrganizerAvatarText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.background,
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
    backgroundColor: COLORS.activityAccent,
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
    backgroundColor: COLORS.activityAccent,
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
  // Invitation Code Card
  invitationCodeCard: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  invitationCodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  invitationCodeTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  invitationCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    padding: 12,
  },
  invitationCode: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 4,
  },
  copyButton: {
    padding: 8,
  },
  invitationCodeHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: "center",
  },
  // Tagged Business
  taggedBusinessCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  taggedBusinessLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
  },
  taggedBusinessInfo: {
    flex: 1,
  },
  taggedBusinessLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  taggedBusinessName: {
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  detailTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textDisabled,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    color: COLORS.primary,
    fontWeight: "500",
  },
  mapContainer: {
    marginTop: 16,
    marginBottom: 0,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  mapImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
  },
  mapOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 8,
  },
  mapOverlayText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: "600",
  },
  description: {
    fontSize: 15,
    color: "#4b5563",
    lineHeight: 24,
  },
  rsvpTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 12,
  },
  rsvpButtons: {
    flexDirection: "row",
    gap: 10,
  },
  rsvpButtonContainer: {
    flex: 1,
    borderRadius: 8,
  },
  rsvpButtonActive: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    borderRadius: 8,
    pointerEvents: "box-none",
  },
  rsvpSection: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 16,
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
  rsvpButtonInactive: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    gap: 6,
  },
  rsvpButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  shareSection: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitleShare: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.activityAccent,
    marginBottom: 12,
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
    backgroundColor: COLORS.activityAccent + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  shareActionLabel: {
    fontSize: 11,
    color: COLORS.textMuted || COLORS.textSecondary || "#6b7280",
    textAlign: "center",
  },
  shareTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.primary,
    marginBottom: 12,
  },
  shareButtons: {
    flexDirection: "row",
    gap: 10,
  },
  whatsappButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    gap: 8,
  },
  shareButtonText: {
    color: COLORS.background,
    fontSize: 14,
    fontWeight: "700",
  },
  shareButtonTextSecondary: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Chat Section
  chatSection: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    overflow: "hidden",
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 8,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.primary,
    flex: 1,
  },
  chatCount: {
    fontSize: 12,
    color: COLORS.textDisabled,
  },
  chatMessages: {
    maxHeight: 400,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyChat: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
  },
  emptyChatText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  emptyChatSubtext: {
    fontSize: 13,
    color: COLORS.textDisabled,
  },
  chatBubble: {
    maxWidth: "80%",
    padding: 10,
    borderRadius: 16,
    marginBottom: 8,
  },
  chatBubbleMe: {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  chatBubbleOther: {
    backgroundColor: "#f3f4f6",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  chatBubbleName: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  chatBubbleText: {
    fontSize: 14,
    color: COLORS.primary,
  },
  chatBubbleTextMe: {
    color: COLORS.background,
  },
  chatBubbleTime: {
    fontSize: 10,
    color: COLORS.textDisabled,
    marginTop: 4,
    alignSelf: "flex-end",
  },
  chatBubbleTimeMe: {
    color: "rgba(255,255,255,0.7)",
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
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 80,
    color: COLORS.primary,
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  chatSendBtnDisabled: {
    opacity: 0.5,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginTop: 12,
    marginBottom: 20,
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: "600",
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
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  galleryItemWrap: {
    position: "relative",
    width: "31%",
    aspectRatio: 1,
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
  galleryItem: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  galleryImage: {
    width: "100%",
    height: "100%",
  },
  galleryVideoInner: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  galleryVideoItem: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  videoPlayOverlaySmall: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  loginPrompt: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginTop: 16,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  loginPromptIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  loginPromptText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: 16,
  },
  loginButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  loginButtonInner: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: "center",
  },
  loginButtonText: {
    color: COLORS.background,
    fontSize: 15,
    fontWeight: "600",
  },
  descriptionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeaderText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  galleryCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  gallerySection: {
    marginBottom: 8,
  },
  galleryTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  rsvpButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.activityAccent,
    backgroundColor: "#fff",
  },
  rsvpActive: {
    backgroundColor: COLORS.activityAccent,
    borderColor: COLORS.activityAccent,
  },
  rsvpMaybeActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  rsvpDeclinedActive: {
    backgroundColor: "#ef4444",
    borderColor: "#ef4444",
  },
  rsvpButtonTextActive: {
    color: "#fff",
  },
});

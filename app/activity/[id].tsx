import React, { useEffect, useRef, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";
import { useSafeNavigation } from "../../hooks/useSafeNavigation";
import { 
  ActivityItem, 
  ChatMessage,
  getActivityDetail, 
  getActivityMessages,
  rsvpActivity,
  sendActivityMessage,
  ACTIVITY_THEMES
} from "../../lib/api";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ActivityDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const { safeGoBack, router } = useSafeNavigation();
  const [activity, setActivity] = useState<ActivityItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [myStatus, setMyStatus] = useState<string>("pending");
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadActivity();
  }, [id, sessionToken]);

  useEffect(() => {
    if (sessionToken && id) {
      loadChatMessages();
    }
  }, [sessionToken, id]);

  const loadActivity = async () => {
    if (!id || !sessionToken) return;
    setLoading(true);
    try {
      const activityData = await getActivityDetail(sessionToken, id);
      setActivity(activityData);
      setMyStatus(activityData.my_status || "pending");
    } catch (error) {
      console.error("Failed to load activity:", error);
      Alert.alert(t("common.error"), t("activities.activityNotFound"));
    }
    setLoading(false);
  };

  const loadChatMessages = async () => {
    if (!sessionToken || !id) return;
    setLoadingChat(true);
    try {
      const messages = await getActivityMessages(sessionToken, id);
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
      const newMsg = await sendActivityMessage(sessionToken, id, chatText.trim());
      setChatMessages(prev => [...prev, newMsg]);
      setChatText("");
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
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
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
    }
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
    message += `${activityDate.toLocaleDateString()} ${t("common.at")} ${activity.time}\n`;
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
      date: activityDate.toLocaleDateString(),
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

  // Get theme color
  const getThemeColor = () => {
    if (!activity?.theme) return "#10b981"; // Default green
    const theme = ACTIVITY_THEMES[activity.theme as keyof typeof ACTIVITY_THEMES];
    return theme?.color || "#10b981";
  };

  const getThemeEmoji = () => {
    if (!activity?.theme) return "🎉";
    const theme = ACTIVITY_THEMES[activity.theme as keyof typeof ACTIVITY_THEMES];
    return theme?.emoji || "🎉";
  };

  const getThemeGradient = (): [string, string] => {
    if (!activity?.theme) return ["#10b981", "#059669"]; // Default green gradient
    const theme = ACTIVITY_THEMES[activity.theme as keyof typeof ACTIVITY_THEMES];
    return (theme?.gradient as [string, string]) || ["#10b981", "#059669"];
  };

  const themeColor = getThemeColor();
  const themeGradient = getThemeGradient();

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={themeColor} size="large" />
      </SafeAreaView>
    );
  }

  if (!activity) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="people-outline" size={48} color="#9ca3af" />
        <Text style={styles.errorText}>{t("activities.activityNotFound")}</Text>
        <Pressable style={[styles.primaryButton, { backgroundColor: themeColor }]} onPress={safeGoBack}>
          <Text style={styles.primaryButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const activityDate = new Date(activity.date);
  const attendingCount = activity.invites?.filter(i => i.status === "going").length || 0;
  const themeLabel = activity.custom_theme || 
    (activity.theme ? ACTIVITY_THEMES[activity.theme as keyof typeof ACTIVITY_THEMES]?.label : null);

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
          <Pressable style={styles.backButton} onPress={safeGoBack}>
            <Ionicons name="chevron-back" size={20} color={themeColor} />
            <Text style={[styles.backText, { color: themeColor }]}>{t("common.back")}</Text>
          </Pressable>

          {/* Activity Image */}
          {activity.image_base64 ? (
            <Image source={{ uri: activity.image_base64 }} style={styles.activityImage} />
          ) : (
            <LinearGradient
              colors={themeGradient}
              style={styles.imagePlaceholder}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.themeEmojiLarge}>{getThemeEmoji()}</Text>
            </LinearGradient>
          )}

          {/* Activity Badge */}
          <View style={styles.badgeContainer}>
            <LinearGradient
              colors={themeGradient}
              style={styles.activityBadge}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.badgeEmoji}>{getThemeEmoji()}</Text>
              <Text style={styles.badgeText}>
                {themeLabel || t("activities.activity")}
              </Text>
            </LinearGradient>
            {activity.is_private && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={12} color="#fff" />
                <Text style={styles.privateBadgeText}>{t("activities.private") || "Private"}</Text>
              </View>
            )}
          </View>

          {/* Activity Title & Organizer */}
          <View style={styles.header}>
            <Text style={styles.title}>{activity.title}</Text>
            {activity.creator && (
              <Pressable 
                style={styles.organizerRow}
                onPress={() => router.push(`/user/${activity.creator?.user_id}`)}
              >
                <Text style={styles.organizerText}>{t("activities.by")} </Text>
                <Text style={[styles.organizerName, { color: themeColor }]}>{activity.creator.name}</Text>
              </Pressable>
            )}
          </View>

          {/* Invitation Code Section - Only for creator of private activities */}
          {activity.is_private && activity.is_creator && activity.invitation_code && (
            <View style={[styles.invitationCodeCard, { borderColor: themeColor }]}>
              <View style={styles.invitationCodeHeader}>
                <Ionicons name="key" size={20} color={themeColor} />
                <Text style={styles.invitationCodeTitle}>
                  {t("activities.invitationCode") || "Invitation Code"}
                </Text>
              </View>
              <View style={styles.invitationCodeRow}>
                <Text style={[styles.invitationCode, { color: themeColor }]}>
                  {activity.invitation_code}
                </Text>
                <Pressable style={styles.copyButton} onPress={copyInvitationCode}>
                  <Ionicons name="copy-outline" size={18} color={themeColor} />
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
                <Text style={[styles.taggedBusinessName, { color: themeColor }]}>
                  {activity.tagged_business.name}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </Pressable>
          )}

          {/* Activity Details */}
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={20} color={themeColor} />
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>{t("activities.date")}</Text>
                <Text style={styles.detailValue}>
                  {activityDate.toLocaleDateString(undefined, { 
                    weekday: "long", 
                    year: "numeric", 
                    month: "long", 
                    day: "numeric" 
                  })}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={20} color="#f59e0b" />
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>{t("activities.time")}</Text>
                <Text style={styles.detailValue}>{activity.time}</Text>
              </View>
            </View>
            {activity.location && (
              <Pressable style={styles.detailRow} onPress={openMap}>
                <Ionicons name="location-outline" size={20} color="#ef4444" />
                <View style={styles.detailTextContainer}>
                  <Text style={styles.detailLabel}>{t("activities.location")}</Text>
                  <Text style={[styles.detailValue, activity.latitude ? styles.linkText : undefined]}>
                    {activity.location}
                  </Text>
                </View>
                {activity.latitude && <Ionicons name="open-outline" size={16} color={themeColor} />}
              </Pressable>
            )}
            
            {/* Map Section */}
            {activity.latitude && activity.longitude && (
              <Pressable style={styles.mapContainer} onPress={openMap}>
                <Image 
                  source={{ 
                    uri: `https://maps.googleapis.com/maps/api/staticmap?center=${activity.latitude},${activity.longitude}&zoom=15&size=600x200&maptype=roadmap&markers=color:green%7C${activity.latitude},${activity.longitude}&key=AIzaSyAMr1Se10FOuTAV7YMEpDvWaKunxRWMa-c`
                  }}
                  style={styles.mapImage}
                  resizeMode="cover"
                />
                <View style={[styles.mapOverlay, { backgroundColor: `${themeColor}e6` }]}>
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={styles.mapOverlayText}>{t("activities.openInMaps")}</Text>
                </View>
              </Pressable>
            )}

            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={20} color="#8b5cf6" />
              <View style={styles.detailTextContainer}>
                <Text style={styles.detailLabel}>{t("activities.attendees")}</Text>
                <Text style={styles.detailValue}>
                  {attendingCount} {t("activities.going")}
                  {activity.max_attendees && ` / ${activity.max_attendees} ${t("activities.maxSpots")}`}
                </Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {activity.description && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("activities.description")}</Text>
              <Text style={styles.description}>{activity.description}</Text>
            </View>
          )}

          {/* RSVP Buttons */}
          <View style={styles.rsvpSection}>
            <Text style={styles.rsvpTitle}>{t("activities.yourResponse")}</Text>
            <View style={styles.rsvpButtons}>
              <Pressable 
                style={styles.rsvpButtonContainer}
                onPress={() => handleRsvp("going")}
              >
                {myStatus === "going" ? (
                  <LinearGradient
                    colors={themeGradient}
                    style={styles.rsvpButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={[styles.rsvpButtonText, { color: "#fff" }]}>
                      {t("activities.going")}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.rsvpButtonInactive, { borderColor: themeColor, backgroundColor: `${themeColor}15` }]}>
                    <Ionicons name="checkmark-circle" size={24} color={themeColor} />
                    <Text style={[styles.rsvpButtonText, { color: themeColor }]}>
                      {t("activities.going")}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable 
                style={styles.rsvpButtonContainer}
                onPress={() => handleRsvp("maybe")}
              >
                {myStatus === "maybe" ? (
                  <LinearGradient
                    colors={["#f59e0b", "#d97706"]}
                    style={styles.rsvpButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="help-circle" size={24} color="#fff" />
                    <Text style={[styles.rsvpButtonText, { color: "#fff" }]}>
                      {t("activities.maybe")}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.rsvpButtonInactive, styles.rsvpButtonMaybe]}>
                    <Ionicons name="help-circle" size={24} color="#f59e0b" />
                    <Text style={[styles.rsvpButtonText, styles.rsvpButtonTextMaybe]}>
                      {t("activities.maybe")}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable 
                style={styles.rsvpButtonContainer}
                onPress={() => handleRsvp("declined")}
              >
                {myStatus === "declined" ? (
                  <LinearGradient
                    colors={["#ef4444", "#dc2626"]}
                    style={styles.rsvpButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Ionicons name="close-circle" size={24} color="#fff" />
                    <Text style={[styles.rsvpButtonText, { color: "#fff" }]}>
                      {t("activities.decline")}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.rsvpButtonInactive, styles.rsvpButtonDecline]}>
                    <Ionicons name="close-circle" size={24} color="#ef4444" />
                    <Text style={[styles.rsvpButtonText, styles.rsvpButtonTextDecline]}>
                      {t("activities.decline")}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          {/* Share Buttons */}
          <View style={styles.shareSection}>
            <Text style={styles.shareTitle}>{t("activities.inviteFriends")}</Text>
            <View style={styles.shareButtons}>
              <Pressable style={styles.whatsappButton} onPress={shareToWhatsApp}>
                <Ionicons name="logo-whatsapp" size={24} color="#fff" />
                <Text style={styles.shareButtonText}>WhatsApp</Text>
              </Pressable>
              <Pressable style={[styles.shareButton, { borderColor: themeColor, backgroundColor: `${themeColor}15` }]} onPress={shareInvitationCode}>
                <Ionicons name="share-outline" size={24} color={themeColor} />
                <Text style={[styles.shareButtonTextSecondary, { color: themeColor }]}>{t("activities.share")}</Text>
              </Pressable>
            </View>
          </View>

          {/* Chat Section - Inline */}
          <View style={styles.chatSection}>
            <View style={styles.chatHeader}>
              <Ionicons name="chatbubbles" size={20} color={themeColor} />
              <Text style={styles.chatTitle}>{t("activities.chat") || "Activity Chat"}</Text>
              <Text style={styles.chatCount}>
                {chatMessages.length} {t("activities.messages") || "messages"}
              </Text>
            </View>
            
            <ScrollView 
              ref={chatScrollRef}
              style={styles.chatMessages}
              nestedScrollEnabled={true}
              showsVerticalScrollIndicator={false}
            >
              {loadingChat ? (
                <ActivityIndicator size="small" color={themeColor} style={{ marginVertical: 20 }} />
              ) : chatMessages.length === 0 ? (
                <View style={styles.emptyChat}>
                  <Ionicons name="chatbubbles-outline" size={32} color="#d1d5db" />
                  <Text style={styles.emptyChatText}>
                    {t("activities.noMessages") || "No messages yet"}
                  </Text>
                  <Text style={styles.emptyChatSubtext}>
                    {t("activities.startConversation") || "Start the conversation!"}
                  </Text>
                </View>
              ) : (
                chatMessages.map((msg) => {
                  const isMe = msg.from_user_id === user?.user_id;
                  return (
                    <View 
                      key={msg.message_id} 
                      style={[
                        styles.chatBubble, 
                        isMe ? [styles.chatBubbleMe, { backgroundColor: themeColor }] : styles.chatBubbleOther
                      ]}
                    >
                      {!isMe && msg.author?.name && (
                        <Pressable 
                          onPress={() => router.push(`/user/${msg.from_user_id}`)}
                          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                        >
                          <Text style={[styles.chatBubbleName, { color: themeColor }]}>{msg.author.name}</Text>
                        </Pressable>
                      )}
                      <Text style={[styles.chatBubbleText, isMe && styles.chatBubbleTextMe]}>
                        {msg.text}
                      </Text>
                      <Text style={[styles.chatBubbleTime, isMe && styles.chatBubbleTimeMe]}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                  );
                })
              )}
            </ScrollView>
            
            <View style={styles.chatInputContainer}>
              <TextInput
                style={styles.chatInput}
                placeholder={t("activities.typeMessage") || "Type a message..."}
                placeholderTextColor="#9ca3af"
                value={chatText}
                onChangeText={setChatText}
                multiline
                maxLength={500}
              />
              <Pressable 
                style={[styles.chatSendBtn, { backgroundColor: themeColor }, (!chatText.trim() || sendingMessage) && styles.chatSendBtnDisabled]}
                onPress={handleSendMessage}
                disabled={!chatText.trim() || sendingMessage}
              >
                {sendingMessage ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0fdf4",
  },
  flex1: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
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
  },
  activityImage: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
  },
  imagePlaceholder: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  themeEmojiLarge: {
    fontSize: 64,
  },
  badgeContainer: {
    position: "absolute",
    top: 60,
    left: 24,
    flexDirection: "row",
    gap: 8,
  },
  activityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  badgeEmoji: {
    fontSize: 14,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6b7280",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  privateBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
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
  // Invitation Code Card
  invitationCodeCard: {
    backgroundColor: "#fff",
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
    color: "#374151",
  },
  invitationCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
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
    color: "#6b7280",
    marginTop: 8,
    textAlign: "center",
  },
  // Tagged Business
  taggedBusinessCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
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
    color: "#6b7280",
  },
  taggedBusinessName: {
    fontSize: 16,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
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
    color: "#9ca3af",
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  linkText: {
    color: "#10b981",
  },
  mapContainer: {
    marginBottom: 16,
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
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  description: {
    fontSize: 15,
    color: "#4b5563",
    lineHeight: 22,
  },
  rsvpSection: {
    marginBottom: 16,
  },
  rsvpTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  rsvpButtons: {
    flexDirection: "row",
    gap: 10,
  },
  rsvpButtonContainer: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  rsvpButtonGradient: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 6,
  },
  rsvpButtonInactive: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    gap: 6,
  },
  rsvpButton: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    gap: 6,
  },
  rsvpButtonMaybe: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  rsvpButtonMaybeActive: {
    backgroundColor: "#f59e0b",
  },
  rsvpButtonDecline: {
    backgroundColor: "#fee2e2",
    borderColor: "#ef4444",
  },
  rsvpButtonDeclineActive: {
    backgroundColor: "#ef4444",
  },
  rsvpButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  rsvpButtonTextMaybe: {
    color: "#f59e0b",
  },
  rsvpButtonTextDecline: {
    color: "#ef4444",
  },
  shareSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  shareTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
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
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
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
    borderRadius: 16,
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
    color: "#111827",
    flex: 1,
  },
  chatCount: {
    fontSize: 12,
    color: "#9ca3af",
  },
  chatMessages: {
    maxHeight: 300,
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
    color: "#6b7280",
  },
  emptyChatSubtext: {
    fontSize: 13,
    color: "#9ca3af",
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
    color: "#111827",
  },
  chatBubbleTextMe: {
    color: "#fff",
  },
  chatBubbleTime: {
    fontSize: 10,
    color: "#9ca3af",
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
    backgroundColor: "#f9fafb",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 80,
    color: "#111827",
  },
  chatSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chatSendBtnDisabled: {
    opacity: 0.5,
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
    marginBottom: 20,
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

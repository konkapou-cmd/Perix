import { useState, useRef, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { ChatMessage } from "../../lib/api/core";
import { uploadMedia } from "../../lib/api";
import { MEDIA_LIMITS } from "../../lib/constants/mediaLimits";
import { useAuth } from "../../context/AuthContext";
import { COLORS, BORDER_RADIUS, SHADOWS, SPACING, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";

type Props = {
  title: string;
  messages: ChatMessage[];
  loadingChat: boolean;
  chatText: string;
  onChatTextChange: (text: string) => void;
  onSendMessage: () => void;
  onSendMedia?: (mediaUrl: string, mediaType: string) => void;
  sendingMessage: boolean;
  userId?: string;
  themeColor?: string;
  collapsible?: boolean;
  showLoginPrompt?: boolean;
  onLoginPress?: () => void;
  chatType?: "activity" | "event";
  chatId?: string;
};

export default function ChatSection({
  title,
  messages,
  loadingChat,
  chatText,
  onChatTextChange,
  onSendMessage,
  onSendMedia,
  sendingMessage,
  userId,
  themeColor = COLORS.primary,
  collapsible = false,
  showLoginPrompt = false,
  onLoginPress,
  chatType,
  chatId,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken } = useAuth();
  const chatScrollRef = useRef<ScrollView>(null);
  const [showChat, setShowChat] = useState(!collapsible);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (showChat && chatScrollRef.current && messages.length > 0) {
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length, showChat]);

  const pickAndSendPhoto = useCallback(async () => {
    if (!sessionToken || !onSendMedia) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: MEDIA_LIMITS.image.pickerQuality,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      setUploadingPhoto(true);
      const url = await uploadMedia(sessionToken, result.assets[0].uri, "image");
      if (url) onSendMedia(url, "image");
    } catch (e) {
      console.warn("Photo upload failed:", e);
    } finally {
      setUploadingPhoto(false);
    }
  }, [sessionToken, onSendMedia]);

  if (showLoginPrompt) {
    return (
      <View style={styles.loginPrompt}>
        <View style={[styles.loginPromptIcon, { backgroundColor: `${themeColor}15` }]}>
          <Ionicons name="chatbubbles-outline" size={28} color={themeColor} />
        </View>
        <Text style={styles.loginPromptText}>
          {t("chat.loginToChat") || "Log in to join the conversation"}
        </Text>
        <Pressable style={styles.loginButton} onPress={onLoginPress}>
          <View style={[styles.loginButtonInner, { backgroundColor: themeColor }]}>
            <Text style={styles.loginButtonText}>{t("auth.login") || "Log In"}</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.chatSection}>
      <Pressable
        style={styles.chatHeader}
        onPress={() => collapsible && setShowChat(!showChat)}
      >
        <View style={[styles.chatIconContainer, { backgroundColor: `${themeColor}15` }]}>
          <Ionicons name="chatbubbles" size={22} color={themeColor} />
        </View>
        <View style={styles.chatHeaderInfo}>
          <Text style={styles.chatTitle}>{title}</Text>
          <Text style={styles.chatSubtitle}>
            {messages.length} {t("chat.messages") || "messages"}
          </Text>
        </View>
        {collapsible && (
          <View style={styles.chatToggle}>
            <Ionicons
              name={showChat ? "chevron-up" : "chevron-down"}
              size={20}
              color={COLORS.textMuted}
            />
          </View>
        )}
        {chatType && chatId && (
          <Pressable
            style={styles.fullChatButton}
            onPress={() => router.push(`/group-chat/${chatType}/${chatId}` as any)}
          >
            <Ionicons name="open-outline" size={18} color={themeColor} />
          </Pressable>
        )}
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
              <ActivityIndicator size="small" color={themeColor} style={{ marginVertical: 20 }} />
            ) : messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <View style={[styles.emptyChatIcon, { backgroundColor: `${themeColor}15` }]}>
                  <Ionicons name="chatbubbles-outline" size={32} color={themeColor} />
                </View>
                <Text style={styles.emptyChatText}>
                  {t("chat.noMessages") || "No messages yet"}
                </Text>
                <Text style={styles.emptyChatSubtext}>
                  {t("chat.startConversation") || "Start the conversation!"}
                </Text>
              </View>
            ) : (
              messages.map((msg) => {
                const isMe = (msg.user_id || msg.from_user_id) === userId;
                const senderId = msg.user_id || msg.from_user_id;
                const senderName = msg.sender_name || msg.user_name || msg.author?.name;
                return (
                  <View
                    key={msg.message_id}
                    style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}
                  >
                    {!isMe && senderName && (
                      <Pressable
                        onPress={() => senderId && router.push(`/user/${senderId}`)}
                        hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                      >
                        <Text style={[styles.chatBubbleName, { color: themeColor }]}>
                          {senderName}
                        </Text>
                      </Pressable>
                    )}
                    {msg.media_url && (
                      <Pressable style={styles.chatMediaContainer}>
                        <Image source={{ uri: msg.media_url }} style={styles.chatMediaImage} resizeMode="cover" />
                      </Pressable>
                    )}
                    {msg.text && (
                      isMe ? (
                        <LinearGradient
                          colors={[themeColor, COLORS.primaryDark]}
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
                      )
                    )}
                    {!msg.text && !msg.media_url && (
                      <Text style={styles.chatBubbleTime}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          <View style={styles.chatInputContainer}>
            {onSendMedia && (
              <Pressable
                style={[styles.chatPhotoBtn, uploadingPhoto && styles.chatPhotoBtnDisabled]}
                onPress={pickAndSendPhoto}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color={themeColor} />
                ) : (
                  <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
                )}
              </Pressable>
            )}
            <TextInput
              style={styles.chatInput}
              placeholder={t("chat.typeMessage") || "Type a message..."}
              placeholderTextColor={COLORS.textDisabled}
              value={chatText}
              onChangeText={onChatTextChange}
              multiline
              maxLength={500}
            />
            <Pressable
              style={[styles.chatSendBtn, (!chatText.trim() || sendingMessage) && styles.chatSendBtnDisabled]}
              onPress={onSendMessage}
              disabled={!chatText.trim() || sendingMessage}
            >
              <LinearGradient
                colors={[themeColor, COLORS.primaryDark]}
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
  );
}

const styles = StyleSheet.create({
  chatSection: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.std,
    overflow: "hidden",
    ...SHADOWS.subtle,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.std,
  },
  chatIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.compact,
  },
  chatHeaderInfo: {
    flex: 1,
  },
  chatTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  chatSubtitle: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  chatToggle: {
    padding: SPACING.small,
  },
  fullChatButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${COLORS.primary}15`,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.small,
  },
  chatMessages: {
    maxHeight: 300,
    paddingHorizontal: SPACING.std,
  },
  emptyChat: {
    alignItems: "center",
    paddingVertical: SPACING.large,
  },
  emptyChatIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.compact,
  },
  emptyChatText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textSecondary,
  },
  emptyChatSubtext: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  chatBubble: {
    marginBottom: SPACING.compact,
    maxWidth: "80%",
  },
  chatBubbleMe: {
    alignSelf: "flex-end",
  },
  chatBubbleOther: {
    alignSelf: "flex-start",
  },
  chatBubbleMeGradient: {
    borderRadius: BORDER_RADIUS.lg,
    borderBottomRightRadius: 4,
    paddingVertical: SPACING.compact,
    paddingHorizontal: SPACING.std,
  },
  chatBubbleName: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold,
    marginBottom: 4,
  },
  chatBubbleText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  chatBubbleTextMe: {
    fontSize: FONT_SIZES.body,
    color: COLORS.background,
    lineHeight: 20,
  },
  chatBubbleTime: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  chatBubbleTimeMe: {
    fontSize: FONT_SIZES.micro,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  chatInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.compact,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  chatPhotoBtn: {
    marginRight: SPACING.small,
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.md,
  },
  chatPhotoBtnDisabled: {
    opacity: 0.5,
  },
  chatInput: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    maxHeight: 80,
  },
  chatSendBtn: {
    marginLeft: SPACING.compact,
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
  },
  chatSendBtnDisabled: {
    opacity: 0.5,
  },
  chatSendBtnGradient: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loginPrompt: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.page,
    alignItems: "center",
    marginTop: SPACING.std,
    ...SHADOWS.subtle,
  },
  loginPromptIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.compact,
  },
  loginPromptText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textMuted,
    textAlign: "center",
    marginBottom: SPACING.std,
  },
  loginButton: {
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
  },
  loginButtonInner: {
    paddingVertical: SPACING.compact,
    paddingHorizontal: SPACING.page,
    alignItems: "center",
  },
  loginButtonText: {
    color: COLORS.background,
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  chatMediaContainer: {
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
    marginBottom: SPACING.tiny,
  },
  chatMediaImage: {
    width: 200,
    height: 150,
    borderRadius: BORDER_RADIUS.md,
  },
});

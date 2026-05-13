import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../../context/AuthContext";
import { useSocket, useSocketEvent } from "../../../context/SocketContext";
import {
  ChatMessage,
  getActivityMessages,
  sendActivityMessage,
  getEventMessages,
  sendEventMessage,
  getEventDetail,
  getActivityDetail,
  uploadMedia,
} from "../../../lib/api";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../../lib/designTokens";

type ChatType = "activity" | "event";

export default function GroupChatScreen() {
  const { t } = useTranslation();
  const { type, id } = useLocalSearchParams<{ type: ChatType; id: string }>();
  const router = useRouter();
  const { sessionToken, user } = useAuth();
  const { connected, subscribe, unsubscribe } = useSocket();
  const scrollViewRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");

  const chatType: ChatType = (type as ChatType) || "event";

  const loadMessages = useCallback(async (isInitial = false) => {
    if (!sessionToken || !id) return;
    try {
      let data: ChatMessage[];
      if (chatType === "activity") {
        data = await getActivityMessages(sessionToken, id);
      } else {
        data = await getEventMessages(sessionToken, id);
      }
      setMessages(prev => {
        if (isInitial) return data;
        const existingIds = new Set(prev.map(m => m.message_id));
        const newMsgs = data.filter(m => !existingIds.has(m.message_id));
        if (newMsgs.length === 0) return prev;
        const merged = [...prev, ...newMsgs];
        merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return merged;
      });
    } catch (e) {
      console.warn("loadMessages failed:", e);
    }
  }, [sessionToken, id, chatType]);

  const loadInfo = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      if (chatType === "activity") {
        const data = await getActivityDetail(sessionToken, id);
        setTitle(data.title);
        setSubtitle(data.creator?.name || t("activities.activity"));
      } else {
        const data = await getEventDetail(sessionToken, id);
        setTitle(data.title);
        setSubtitle(data.business?.name || t("events.event"));
      }
    } catch (e) {
      setTitle(chatType === "activity" ? t("activities.activity") : t("events.event"));
    }
  }, [sessionToken, id, chatType]);

  const channelName = `${chatType}:${id}`;

  useSocketEvent("channel_message", (data: any) => {
    if (data.channel === channelName && data.message) {
      setMessages((prev) => {
        const exists = prev.some((m) => m.message_id === data.message.message_id);
        if (exists) return prev;
        return [...prev, data.message];
      });
    }
  });

  useEffect(() => {
    if (!id) return;
    subscribe(channelName);
    return () => unsubscribe(channelName);
  }, [channelName, subscribe, unsubscribe]);

  useEffect(() => {
    loadInfo();
    loadMessages(true).then(() => setLoading(false));
    const interval = setInterval(() => loadMessages(false), connected ? 30000 : 15000);
    return () => clearInterval(interval);
  }, [loadMessages, loadInfo, connected]);

  const scrollToBottom = () => {
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleSend = async () => {
    if (!sessionToken || !id || !text.trim()) return;
    setSending(true);
    try {
      let newMsg: ChatMessage;
      const msgText = text.trim();
      if (chatType === "activity") {
        newMsg = await sendActivityMessage(sessionToken, id, msgText);
      } else {
        newMsg = await sendEventMessage(sessionToken, id, msgText);
      }
      setMessages((prev) => [...prev, newMsg]);
      setText("");
      scrollToBottom();
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("messages.sendFailed", "Failed to send message"));
    }
    setSending(false);
  };

  const handlePickMedia = async (mediaType: "image") => {
    if (!sessionToken || !id) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      setUploadingMedia(true);
      const mediaUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image");
      if (chatType === "activity") {
        const msg = await sendActivityMessage(sessionToken, id, "", mediaUrl);
        setMessages((prev) => [...prev, msg]);
      } else {
        const msg = await sendEventMessage(sessionToken, id, "", mediaUrl);
        setMessages((prev) => [...prev, msg]);
      }
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("messages.mediaFailed", "Failed to send media"));
    }
    setUploadingMedia(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Pressable
          style={styles.headerIcon}
          onPress={() => {
            if (chatType === "activity") router.push(`/activity/${id}`);
            else router.push(`/event/${id}`);
          }}
        >
          <Ionicons name="open-outline" size={18} color={COLORS.textPrimary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <Text style={styles.emptyText}>{t("messages.noMessages", "No messages yet")}</Text>
          )}
          {messages.map((msg) => {
            const isMe = (msg.user_id || msg.from_user_id) === user?.user_id;
            const senderId = msg.user_id || msg.from_user_id;
            const senderName = msg.sender_name || msg.user_name || msg.author?.name;

            return (
              <View
                key={msg.message_id}
                style={[styles.chatBubble, isMe ? styles.chatBubbleMe : styles.chatBubbleOther]}
              >
                {!isMe && senderName && (
                  <Pressable onPress={() => senderId && router.push(`/user/${senderId}`)}>
                    <Text style={styles.chatBubbleName}>{senderName}</Text>
                  </Pressable>
                )}
                {isMe ? (
                  <LinearGradient
                    colors={[COLORS.primaryDark || "#1a1a2e", COLORS.primary]}
                    style={styles.chatBubbleMeGradient}
                  >
                    <Text style={styles.chatBubbleTextMe}>{msg.text}</Text>
                    <Text style={styles.chatBubbleTimeMe}>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </LinearGradient>
                ) : (
                  <>
                    <Text style={styles.chatBubbleText}>{msg.text}</Text>
                    <Text style={styles.chatBubbleTime}>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </>
                )}
              </View>
            );
          })}
        </ScrollView>

        {uploadingMedia && (
          <View style={styles.uploadingBar}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.uploadingText}>{t("messages.uploading", "Uploading...")}</Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <Pressable style={styles.mediaButton} onPress={() => handlePickMedia("image")}>
            <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
          </Pressable>
          <TextInput
            placeholder={t("messages.typeMessage", "Type a message...")}
            value={text}
            onChangeText={setText}
            style={styles.input}
            multiline
            maxLength={500}
          />
          {text.trim().length > 0 ? (
            <Pressable
              style={[styles.sendButton, sending && styles.buttonDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          ) : (
            <View style={styles.sendButtonPlaceholder} />
          )}
        </View>
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.lg,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  chat: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 40,
    fontSize: FONT_SIZES.body,
  },
  chatBubble: {
    marginBottom: SPACING.lg,
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
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
  },
  chatBubbleName: {
    fontSize: FONT_SIZES.caption,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  chatBubbleText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  chatBubbleTextMe: {
    fontSize: FONT_SIZES.body,
    color: "#fff",
    lineHeight: 20,
  },
  chatBubbleTime: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  chatBubbleTimeMe: {
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  uploadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.lg,
    gap: SPACING.lg,
    backgroundColor: COLORS.background,
  },
  uploadingText: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.primary,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    maxHeight: 80,
  },
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonPlaceholder: {
    width: 44,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

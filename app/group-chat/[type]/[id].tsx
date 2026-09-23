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
import { MEDIA_LIMITS } from "../../../lib/constants/mediaLimits";
import { HeaderBackButton } from "../../../components/shared/HeaderBackButton";
import { confirmAction } from "../../../lib/confirm";
import { deleteGroupMessage } from "../../../lib/api/messages";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AdaptiveVideo from "../../../components/AdaptiveVideo";
import { Audio } from "expo-av";
import { uploadVideoToMux } from "../../../lib/api";

type ChatType = "activity" | "event";

function GroupVoiceBubble({ uri, isMe }: { uri: string; isMe: boolean }) {
  const soundRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const playSound = async () => {
    try {
      if (playing && soundRef.current) {
        await soundRef.current.stopAsync();
        setPlaying(false);
        setPosition(0);
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded) {
          setDuration(status.durationMillis / 1000);
          setPosition(status.positionMillis / 1000);
          if (status.didJustFinish) {
            setPlaying(false);
            setPosition(0);
          }
        }
      });
      await sound.playAsync();
      setPlaying(true);
    } catch (e) {
      console.warn("Voice playback failed:", e);
    }
  };

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  return (
    <Pressable style={[styles.voiceBubble, isMe && styles.voiceBubbleMine]} onPress={playSound}>
      <Ionicons name={playing ? "pause" : "play"} size={16} color={isMe ? "#fff" : "#264348"} />
      <Text style={[styles.voiceDuration, isMe && styles.voiceDurationMine]}>
        {fmtTime(duration || position)}
      </Text>
    </Pressable>
  );
}

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recordingRef = useRef<any>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);

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

  const handlePickMedia = async (mediaType: "image" | "video") => {
    if (!sessionToken || !id) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaType === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
        quality: MEDIA_LIMITS.image.pickerQuality,
      });
      if (result.canceled || !result.assets || result.assets.length === 0 || !result.assets[0].uri) return;
      setUploadingMedia(true);
      let mediaUrl: string;
      if (mediaType === "video") {
        const muxResult = await uploadVideoToMux(sessionToken, result.assets[0].uri);
        mediaUrl = muxResult.playback_url
          || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : "");
        if (!mediaUrl) throw new Error("Video upload failed");
      } else {
        mediaUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image");
      }
      if (chatType === "activity") {
        const msg = await sendActivityMessage(sessionToken, id, "", mediaUrl, mediaType);
        setMessages((prev) => [...prev, msg]);
      } else {
        const msg = await sendEventMessage(sessionToken, id, "", mediaUrl, mediaType);
        setMessages((prev) => [...prev, msg]);
      }
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("messages.mediaFailed", "Failed to send media"));
    }
    setUploadingMedia(false);
  };

  const startRecording = async () => {
    if (!sessionToken || !id) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("common.error") || "Error",
          t("messages.microphonePermissionRequired") || "Microphone access is required to send voice messages."
        );
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.log("Failed to start recording:", error);
      Alert.alert(t("common.error") || "Error", t("messages.recordingFailed") || "Failed to start recording");
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setRecordDuration(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (uri && sessionToken && id) {
        setUploadingMedia(true);
        try {
          const mediaUrl = await uploadMedia(sessionToken, uri, "audio");
          if (chatType === "activity") {
            const msg = await sendActivityMessage(sessionToken, id, "", mediaUrl, "audio");
            setMessages((prev) => [...prev, msg]);
          } else {
            const msg = await sendEventMessage(sessionToken, id, "", mediaUrl, "audio");
            setMessages((prev) => [...prev, msg]);
          }
        } catch (error) {
          Alert.alert(t("common.error", "Error"), t("messages.voiceUploadFailed", "Failed to send voice message"));
        } finally {
          setUploadingMedia(false);
        }
      }
    } catch (error) {
      console.log("Failed to stop recording:", error);
      setIsRecording(false);
      setRecordDuration(0);
    }
  };

  const handleDeleteChat = async () => {
    const ok = await confirmAction({
      title: t("messages.deleteConversationTitle") || "Delete conversation?",
      message: `${title} — ${t("messages.deleteConversationConfirm") || "All messages in this conversation will be permanently deleted."}`,
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      const stored = await AsyncStorage.getItem("hidden_group_chats");
      let list: string[] = [];
      try { list = stored ? JSON.parse(stored) : []; } catch (e) {}
      if (id && !list.includes(id)) {
        list.push(id);
        await AsyncStorage.setItem("hidden_group_chats", JSON.stringify(list));
      }
    } catch (e) {}
    router.back();
  };

  const handleDeleteMediaMessage = async (messageId: string) => {
    if (!sessionToken) return;
    const ok = await confirmAction({
      title: t("messages.deletePhotoTitle") || "Delete photo?",
      message: t("messages.deletePhotoConfirm") || "This will delete the photo from the chat.",
      confirmText: t("common.delete"),
      cancelText: t("common.cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteGroupMessage(sessionToken, messageId);
      setMessages((prev) => prev.filter((m) => m.message_id !== messageId));
    } catch (e) {
      console.warn("deleteGroupMessage failed:", e);
    }
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
        <HeaderBackButton onPress={() => router.back()} />
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
        <Pressable style={styles.headerIcon} hitSlop={8} onPress={handleDeleteChat}>
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
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
                  {!isMe && (
                    <View style={styles.senderRow}>
                      <Pressable onPress={() => senderId && router.push(`/user/${senderId}`)} style={styles.senderPressable}>
                        <View style={styles.senderAvatar}>
                          <Text style={styles.senderAvatarText}>
                            {(senderName || "?").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        {senderName && (
                          <Text style={styles.chatBubbleName}>{senderName}</Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                {msg.media_url && msg.media_type === "image" && (
                  <Pressable style={styles.chatMediaContainer} onPress={() => setPreviewUrl(msg.media_url!)}>
                    <Image source={{ uri: msg.media_url }} style={styles.chatMediaImage} resizeMode="cover" />
                    {!msg.text && (
                      <Text style={styles.chatMediaTime}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    )}
                    {isMe && (
                      <Pressable
                        style={styles.deleteMediaBtn}
                        hitSlop={8}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          handleDeleteMediaMessage(msg.message_id);
                        }}
                      >
                        <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.9)" />
                      </Pressable>
                    )}
                  </Pressable>
                )}
                {msg.media_url && msg.media_type === "video" && (
                  <View style={styles.chatMediaContainer}>
                    <AdaptiveVideo
                      uri={msg.media_url}
                      style={styles.chatMediaVideo}
                      useNativeControls
                      isLooping={false}
                    />
                    {isMe && (
                      <Pressable
                        style={styles.deleteMediaBtn}
                        hitSlop={8}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          handleDeleteMediaMessage(msg.message_id);
                        }}
                      >
                        <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.9)" />
                      </Pressable>
                    )}
                  </View>
                )}
                {msg.media_url && msg.media_type === "audio" && (
                  <View style={styles.audioRow}>
                    <GroupVoiceBubble uri={msg.media_url} isMe={isMe} />
                    {isMe && (
                      <Pressable
                        hitSlop={8}
                        onPress={() => handleDeleteMediaMessage(msg.message_id)}
                      >
                        <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      </Pressable>
                    )}
                  </View>
                )}
                {msg.text ? (
                  isMe ? (
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
                  )
                ) : null}
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

        {isRecording && (
          <View style={styles.uploadingBar}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" }} />
            <Text style={styles.uploadingText}>{recordDuration}s — {t("messages.tapToStop", "Tap mic to stop")}</Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <Pressable style={styles.mediaButton} onPress={() => handlePickMedia("image")}>
            <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
          </Pressable>
          <Pressable style={styles.mediaButton} onPress={() => handlePickMedia("video")}>
            <Ionicons name="videocam-outline" size={22} color={COLORS.textMuted} />
          </Pressable>
          <Pressable
            style={[styles.mediaButton, isRecording && styles.mediaButtonActive]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Ionicons name={isRecording ? "stop" : "mic-outline"} size={22} color={isRecording ? "#ef4444" : COLORS.textMuted} />
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

      {previewUrl && (
        <Pressable style={styles.previewOverlay} onPress={() => setPreviewUrl(null)}>
          <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    ...Platform.select({
      web: { width: "100%", maxWidth: 1280, marginHorizontal: "auto" },
    }),
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
    paddingHorizontal: SPACING.std,
    paddingTop: SPACING.small,
    paddingBottom: SPACING.compact,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerInfo: {
    flex: 1,
    marginLeft: SPACING.compact,
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
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 40,
    fontSize: FONT_SIZES.body,
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
    fontWeight: "600",
    color: COLORS.primary,
    marginLeft: 6,
  },
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  senderPressable: {
    flexDirection: "row",
    alignItems: "center",
  },
  senderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight || "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  senderAvatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.primary,
  },
  chatMediaContainer: {
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
    marginBottom: 4,
  },
  chatMediaImage: {
    width: 200,
    height: 150,
    borderRadius: BORDER_RADIUS.md,
  },
  chatMediaVideo: {
    width: 200,
    height: 150,
    borderRadius: BORDER_RADIUS.md,
  },
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  voiceBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#eef2f7",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  voiceBubbleMine: {
    backgroundColor: COLORS.primary,
  },
  voiceDuration: {
    fontSize: 13,
    fontWeight: "600",
    color: "#264348",
  },
  voiceDurationMine: {
    color: "#fff",
  },
  deleteMediaBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatMediaTime: {
    position: "absolute",
    bottom: 6,
    right: 6,
    fontSize: 10,
    color: "#fff",
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.9)",
    zIndex: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: "90%",
    height: "70%",
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
    paddingVertical: SPACING.compact,
    gap: SPACING.compact,
    backgroundColor: COLORS.background,
  },
  uploadingText: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.primary,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.compact,
    paddingHorizontal: SPACING.compact,
    paddingVertical: SPACING.small,
    paddingBottom: SPACING.small,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    minHeight: 42,
    maxHeight: 160,
  },
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaButtonActive: {
    backgroundColor: "rgba(239,68,68,0.12)",
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

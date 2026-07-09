import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { Audio } from "expo-av";
import { useAuth } from "../../../context/AuthContext";
import { useBadge } from "../../../context/BadgeContext";
import { useNotifications } from "../../../context/NotificationContext";
import { useSocket, useSocketEvent } from "../../../context/SocketContext";
import { 
  getMessagesWith, 
  sendMessage, 
  markMessagesRead, 
  editMessage, 
  deleteMessage, 
  Message,
  setTypingStatus,
  getTypingStatus,
  sendMediaMessage,
  uploadMedia,
  uploadVideoToMux,
} from "../../../lib/api";
import AdaptiveVideo from "../../../components/AdaptiveVideo";

import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
  ICON_SIZES,
} from "../../../lib/designTokens";

function TypingDots({ name, t }: { name: string; t: (key: string) => string }) {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      );
    const a1 = animate(dot1, 0);
    const a2 = animate(dot2, 200);
    const a3 = animate(dot3, 400);
    a1.start();
    a2.start();
    a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingBubble}>
      <Text style={styles.typingName}>{name}</Text>
      <View style={styles.typingDotsRow}>
        <Animated.View style={[styles.typingDot, { opacity: dot1 }]} />
        <Animated.View style={[styles.typingDot, { opacity: dot2 }]} />
        <Animated.View style={[styles.typingDot, { opacity: dot3 }]} />
      </View>
    </View>
  );
}

function DateSeparator({ dateStr }: { dateStr: string }) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  let label: string;
  if (diffDays === 0) label = "Today";
  else if (diffDays === 1) label = "Yesterday";
  else label = date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

  return (
    <View style={styles.dateSeparator}>
      <View style={styles.dateLine} />
      <Text style={styles.dateText}>{label}</Text>
      <View style={styles.dateLine} />
    </View>
  );
}

function VoiceMessageBubble({ uri, isMine }: { uri: string; isMine: boolean }) {
  const soundRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

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
    <Pressable style={[styles.voiceBubble, isMine && styles.voiceBubbleMine]} onPress={playSound}>
      <Ionicons name={playing ? "pause" : "play"} size={18} color={isMine ? "#fff" : COLORS.textPrimary} />
      <View style={styles.voiceWaveform}>
        <View style={[styles.voiceProgress, { flex: duration > 0 ? position / duration : 0 }, isMine && styles.voiceProgressMine]} />
      </View>
      <Text style={[styles.voiceDuration, isMine && styles.voiceDurationMine]}>{fmtTime(duration || position)}</Text>
    </Pressable>
  );
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const { id, name, entityType } = useLocalSearchParams<{ id: string; name?: string; entityType?: string }>();
  const convEntityType = (entityType || "user") as "user" | "business" | "artist";
  const pathname = usePathname();
  const router = useRouter();
  const { sessionToken, user } = useAuth();
  const { refreshUnreadCount } = useBadge();
  const { showLocalNotification } = useNotifications();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editText, setEditText] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMessages = useCallback(async () => {
    if (!sessionToken || !id) return;
    const data = await getMessagesWith(sessionToken, id, convEntityType);
    
    // Check for new messages from the other user
    const isOtherParticipant = (msg: Message) => {
      if (convEntityType === "business") return msg.to_business_id === id && msg.from_user_id !== user?.user_id;
      if (convEntityType === "artist") return msg.to_artist_id === id && msg.from_user_id !== user?.user_id;
      return msg.from_user_id === id;
    };
    const newMessagesFromOther = data.filter(isOtherParticipant);
    
    // If we have more messages from the other user than before, show notification
    if (lastMessageCountRef.current > 0 && 
        newMessagesFromOther.length > lastMessageCountRef.current) {
      const latestMessage = newMessagesFromOther[newMessagesFromOther.length - 1];
      if (latestMessage) {
        showLocalNotification(
          name || t("messages.newMessage"),
          latestMessage.text?.substring(0, 100) || t("messages.newMessage"),
          { type: "message", from_user_id: latestMessage.from_user_id }
        );
      }
    }
    lastMessageCountRef.current = newMessagesFromOther.length;
    
    setMessages(data);
    
    // Mark messages from this user as read
    try {
      await markMessagesRead(sessionToken, id, convEntityType);
      refreshUnreadCount();
    } catch (e) {
      console.log("[Chat] Failed to mark messages as read:", e);
    }
  }, [sessionToken, id, convEntityType, user, refreshUnreadCount, name, showLocalNotification, t]);

  // Check if other user is typing
  const checkTypingStatus = useCallback(async () => {
    if (!sessionToken || !id || convEntityType !== "user") return;
    try {
      const result = await getTypingStatus(sessionToken, id);
      setOtherUserTyping(result.is_typing);
    } catch (e) {
      // Silent fail
    }
  }, [sessionToken, id, convEntityType]);

  useEffect(() => {
    if (!sessionToken || !id) return;
    setLoading(true);
    loadMessages().finally(() => setLoading(false));
  }, [loadMessages, sessionToken, id]);

  // Use WebSocket for real-time updates, fallback to polling when disconnected
  const { connected: wsConnected } = useSocket();

  useSocketEvent("new_message", useCallback((data: any) => {
    if (data?.message) {
      const msg = data.message;
      const matchesUser = msg.from_user_id === id || msg.to_user_id === id;
      const matchesBusiness = convEntityType === "business" && msg.to_business_id === id;
      const matchesArtist = convEntityType === "artist" && msg.to_artist_id === id;
      if (matchesUser || matchesBusiness || matchesArtist) {
        loadMessages();
      }
    }
  }, [id, convEntityType, loadMessages]));

  useSocketEvent("typing_indicator", useCallback((data: any) => {
    if (data?.from_user_id === id) {
      setOtherUserTyping(data.is_typing);
    }
  }, [id]));

  useEffect(() => {
    if (!sessionToken || !id) return;
    if (!wsConnected) {
      const messageInterval = setInterval(() => {
        loadMessages();
      }, 5000);
      const typingInterval = setInterval(() => {
        checkTypingStatus();
      }, 2000);
      return () => {
        clearInterval(messageInterval);
        clearInterval(typingInterval);
      };
    }
  }, [sessionToken, id, wsConnected, loadMessages, checkTypingStatus]);

  // Handle typing indicator
  const handleTextChange = (value: string) => {
    setText(value);
    setErrorMessage("");
    
    // Send typing status (user conversations only)
    if (sessionToken && id && value.trim() && convEntityType === "user") {
      if (!isTyping) {
        setIsTyping(true);
        setTypingStatus(sessionToken, id, true).catch(e => console.warn("Typing status failed:", e));
      }
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to clear typing status after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        if (sessionToken && id) {
          setTypingStatus(sessionToken, id, false).catch(e => console.warn("Typing status failed:", e));
        }
      }, 3000);
    }
  };

  // Clean up typing status on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (sessionToken && id && convEntityType === "user") {
        setTypingStatus(sessionToken, id, false).catch(e => console.warn("Typing status cleanup failed:", e));
      }
    };
  }, [sessionToken, id, convEntityType]);

  // Handle media picker
  const handlePickMedia = async (mediaType: "image" | "video") => {
    if (!sessionToken || !id) return;
    
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t("common.error") || "Error",
          t("messages.mediaPermissionRequired") || "Media library access is required to send photos and videos."
        );
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaType === "image" 
          ? ImagePicker.MediaTypeOptions.Images 
          : ImagePicker.MediaTypeOptions.Videos,
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
        setUploadingMedia(true);
        try {
          let mediaUrl = "";

          if (mediaType === "video") {
            const muxResult = await uploadVideoToMux(sessionToken, result.assets[0].uri);

            if (muxResult.status === "ready" && muxResult.playback_url) {
              mediaUrl = muxResult.playback_url;
            } else if (muxResult.mux_playback_id) {
              mediaUrl = `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8`;
            } else if (muxResult.mux_asset_id) {
              mediaUrl = `https://stream.mux.com/${muxResult.mux_asset_id}.m3u8`;
            } else {
              throw new Error("Video upload failed. Please try again.");
            }
          } else {
            mediaUrl = await uploadMedia(sessionToken, result.assets[0].uri, mediaType);
          }

          const newMessage = await sendMediaMessage(sessionToken, id, mediaUrl, mediaType, text.trim() || undefined, convEntityType);
          setMessages([...messages, newMessage]);
          setText("");
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : t("messages.mediaUploadFailed");
          setErrorMessage(errMsg);
        } finally {
          setUploadingMedia(false);
        }
      }
    } catch (error) {
      console.log("Media picker error:", error);
    }
  };

  const handleSend = async () => {
    if (!sessionToken || !id || !text.trim()) return;
    try {
      setSending(true);
      setErrorMessage("");
      // Clear typing status
      setIsTyping(false);
      if (convEntityType === "user") {
        setTypingStatus(sessionToken, id, false).catch(e => console.warn("Typing status failed:", e));
      }
      
      let payload: Record<string, string>;
      if (convEntityType === "business") {
        payload = { to_business_id: id, entity_type: "business", text: text.trim() };
      } else if (convEntityType === "artist") {
        payload = { to_artist_id: id, entity_type: "artist", text: text.trim() };
      } else {
        payload = { to_user_id: id, text: text.trim() };
      }
      const newMessage = await sendMessage(sessionToken, payload as any);
      setMessages([...messages, newMessage]);
      setText("");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unable to send";
      setErrorMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  // Voice recording functions
  const startRecording = async () => {
    if (!sessionToken || !id) return;
    
    try {
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t("common.error") || "Error",
          t("messages.microphonePermissionRequired") || "Microphone access is required to send voice messages."
        );
        return;
      }
      
      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      
      // Create and start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start duration timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.log("Failed to start recording:", error);
      Alert.alert(
        t("common.error") || "Error",
        t("messages.recordingFailed") || "Failed to start recording"
      );
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    
    try {
      // Stop timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      
      // Stop recording
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      
      if (uri && sessionToken && id) {
        setUploadingMedia(true);
        try {
          // Upload voice recording
          const mediaUrl = await uploadMedia(sessionToken, uri, "audio");
          
          // Send voice message
          const newMessage = await sendMediaMessage(sessionToken, id, mediaUrl, "audio", undefined, convEntityType);
          setMessages([...messages, newMessage]);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : t("messages.voiceUploadFailed");
          setErrorMessage(errMsg);
        } finally {
          setUploadingMedia(false);
        }
      }
      
      setRecordingDuration(0);
    } catch (error) {
      console.log("Failed to stop recording:", error);
      setIsRecording(false);
      setRecordingDuration(0);
    }
  };

  const cancelRecording = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        // Ignore errors when canceling
      }
      recordingRef.current = null;
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
    
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
  };

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(e => console.warn("Recording cleanup failed:", e));
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleLongPress = (message: Message) => {
    // Only allow editing/deleting own messages
    if (message.from_user_id !== user?.user_id) return;
    setSelectedMessage(message);
    Alert.alert(
      t("messages.messageOptions"),
      t("messages.whatToDo"),
      [
        {
          text: t("common.edit"),
          onPress: () => {
            setEditText(message.text);
            setEditModalVisible(true);
          },
        },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => handleDeleteMessage(message.message_id),
        },
        {
          text: t("common.cancel"),
          style: "cancel",
          onPress: () => setSelectedMessage(null),
        },
      ]
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!sessionToken) return;
    try {
      await deleteMessage(sessionToken, messageId);
      setMessages((prev) => prev.filter((m) => m.message_id !== messageId));
      setSelectedMessage(null);
    } catch (error) {
      setErrorMessage(t("messages.deleteFailed"));
    }
  };

  const handleEditMessage = async () => {
    if (!sessionToken || !selectedMessage || !editText.trim()) return;
    try {
      setEditLoading(true);
      const updated = await editMessage(sessionToken, selectedMessage.message_id, editText.trim());
      setMessages((prev) =>
        prev.map((m) => (m.message_id === updated.message_id ? updated : m))
      );
      setEditModalVisible(false);
      setSelectedMessage(null);
      setEditText("");
    } catch (error) {
      setErrorMessage(t("messages.editFailed"));
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={ICON_SIZES.interactive} color={COLORS.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{name || t("messages.chat")}</Text>
        </View>
        {id !== user?.user_id && convEntityType === "user" && (
          <View style={styles.headerActions}>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push({
                pathname: "/call",
                params: { userId: id, userName: name, callType: "voice", mode: "outgoing" }
              })}
            >
              <Ionicons name="call-outline" size={20} color={COLORS.textPrimary} />
            </Pressable>
            <Pressable
              style={styles.headerIcon}
              onPress={() => router.push({
                pathname: "/call",
                params: { userId: id, userName: name, callType: "video", mode: "outgoing" }
              })}
            >
              <Ionicons name="videocam-outline" size={20} color={COLORS.textPrimary} />
            </Pressable>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView style={styles.chat} contentContainerStyle={styles.chatContent}>
          {messages.length === 0 ? (
            <Text style={styles.emptyText}>{t("messages.noMessagesYet")}</Text>
          ) : (
            messages.map((message: any, index: number) => {
              const isMine = message.from_user_id === user?.user_id;
              const hasMedia = message.media_url;
              const showDate = index === 0 || (() => {
                const prev = new Date(messages[index - 1].created_at).toDateString();
                const curr = new Date(message.created_at).toDateString();
                return prev !== curr;
              })();

              return (
                <View key={message.message_id}>
                  {showDate && <DateSeparator dateStr={message.created_at} />}
                  <Pressable
                    onLongPress={() => handleLongPress(message)}
                    style={[
                      styles.messageBubble,
                      isMine ? styles.myBubble : styles.theirBubble,
                    ]}
                  >
                    {hasMedia && message.media_type === "image" && (
                      <Image 
                        source={{ uri: message.media_url }} 
                        style={styles.messageImage}
                        resizeMode="cover"
                      />
                    )}
                    {hasMedia && message.media_type === "video" && (
                      <AdaptiveVideo
                        uri={message.media_url}
                        autoPlay
                        style={styles.messageVideo}
                        useNativeControls
                        isLooping={false}
                      />
                    )}
                    {hasMedia && message.media_type === "audio" && (
                      <VoiceMessageBubble uri={message.media_url} isMine={isMine} />
                    )}
                    {message.text && (
                      <Text style={[styles.messageText, isMine && styles.myText]}>
                        {message.text}
                      </Text>
                    )}
                    <View style={styles.messageFooter}>
                      <Text style={[styles.messageTime, isMine && styles.myTimeText]}>
                        {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                      {message.edited_at && (
                        <Text style={[styles.editedLabel, isMine && styles.myTimeText]}>
                          {t("messages.edited")}
                        </Text>
                      )}
                      {isMine && (
                        <View style={styles.readReceipt}>
                          <Ionicons 
                            name={message.read ? "checkmark-done" : "checkmark"} 
                            size={14} 
                            color={message.read ? COLORS.success : COLORS.textDisabled} 
                          />
                        </View>
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            })
          )}
          {otherUserTyping && (
            <TypingDots name={name || t("messages.user")} t={t} />
          )}
        </ScrollView>
      )}

      {/* Uploading media indicator */}
      {uploadingMedia && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.uploadingText}>{t("messages.uploadingMedia") || "Uploading/Processing..."}</Text>
        </View>
      )}

      {/* Voice Recording Bar */}
      {isRecording && (
        <View style={[styles.recordingBar, { paddingBottom: insets.bottom || 8 }]}>
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>{t("messages.recording") || "Recording"}</Text>
            <Text style={styles.recordingDuration}>{formatDuration(recordingDuration)}</Text>
          </View>
          <View style={styles.recordingActions}>
            <Pressable style={styles.cancelRecordButton} onPress={cancelRecording}>
              <Ionicons name="close" size={20} color="#ef4444" />
            </Pressable>
            <Pressable style={styles.sendRecordButton} onPress={stopRecording}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      {!isRecording && (
        <View style={[styles.inputBar, { paddingBottom: insets.bottom || 8 }]}>
          <Pressable
            style={styles.mediaButton}
            onPress={() => handlePickMedia("image")}
            disabled={uploadingMedia}
          >
            <Ionicons name="image-outline" size={ICON_SIZES.interactive} color={COLORS.textMuted} />
          </Pressable>
          <Pressable
            style={styles.mediaButton}
            onPress={() => handlePickMedia("video")}
            disabled={uploadingMedia}
          >
            <Ionicons name="videocam-outline" size={ICON_SIZES.interactive} color={COLORS.textMuted} />
          </Pressable>
          
          <TextInput
            placeholder={t("messages.typeMessage")}
            value={text}
            onChangeText={handleTextChange}
            style={styles.input}
            multiline
            placeholderTextColor={COLORS.textDisabled}
          />
          
          {text.trim().length === 0 ? (
            <Pressable
              style={styles.voiceButton}
              onPress={startRecording}
              disabled={uploadingMedia}
              data-testid="chat-voice-btn"
            >
              <Ionicons name="mic" size={ICON_SIZES.interactive} color={COLORS.textPrimary} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.sendButton, sending && styles.buttonDisabled]}
              onPress={handleSend}
              disabled={sending}
              data-testid="chat-send-btn"
            >
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {/* Edit Message Modal */}
      <Modal
        visible={editModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setEditModalVisible(false);
          setEditText("");
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editModal}>
            <Text style={styles.editModalTitle}>{t("messages.editMessage")}</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              placeholder={t("messages.typeMessage")}
              autoFocus
            />
            <View style={styles.editModalActions}>
              <Pressable
                style={styles.editCancelButton}
                onPress={() => {
                  setEditModalVisible(false);
                  setEditText("");
                }}
              >
                <Text style={styles.editCancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.editSaveButton, editLoading && styles.buttonDisabled]}
                onPress={handleEditMessage}
                disabled={editLoading || !editText.trim()}
              >
                {editLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.editSaveText}>{t("common.save")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingTop: SPACING.std,
    paddingBottom: SPACING.small,
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
    marginRight: SPACING.std,
  },
  headerTitle: {
    fontSize: FONT_SIZES.h4,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    gap: SPACING.small,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chat: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
  },
  emptyText: {
    color: COLORS.textDisabled,
    textAlign: "center",
    marginTop: 40,
    fontSize: FONT_SIZES.bodySmall,
  },
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: SPACING.small,
    gap: SPACING.small,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dateText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
  messageBubble: {
    maxWidth: "75%",
    padding: SPACING.small,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.small,
    overflow: "hidden",
  },
  myBubble: {
    backgroundColor: COLORS.primary,
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: COLORS.background,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    ...SHADOWS.subtle,
  },
  messageText: {
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodySmall,
    lineHeight: 20,
  },
  myText: {
    color: "#fff",
  },
  messageTime: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textDisabled,
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.tiny,
    gap: SPACING.small,
  },
  myTimeText: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  editedLabel: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textDisabled,
    fontStyle: "italic",
  },
  readReceipt: {
    marginLeft: SPACING.tiny,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.small,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    maxHeight: 80,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: COLORS.danger,
    textAlign: "center",
    marginBottom: SPACING.small,
    fontSize: FONT_SIZES.caption,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.section,
  },
  editModal: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.section,
    width: "100%",
    maxWidth: 400,
  },
  editModalTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
    marginBottom: SPACING.std,
    textAlign: "center",
  },
  editInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.small,
    fontSize: FONT_SIZES.bodySmall,
    minHeight: 80,
    textAlignVertical: "top",
    color: COLORS.textPrimary,
  },
  editModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.small,
    marginTop: SPACING.std,
  },
  editCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: SPACING.std,
  },
  editCancelText: {
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
  editSaveButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.sm,
  },
  editSaveText: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.tiny,
  },
  messageVideo: {
    width: 200,
    height: 150,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.tiny,
  },
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  typingBubble: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    borderBottomLeftRadius: 4,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    marginBottom: SPACING.small,
    ...SHADOWS.subtle,
  },
  typingName: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textMuted,
    marginBottom: SPACING.tiny,
  },
  typingDotsRow: {
    flexDirection: "row",
    gap: SPACING.tiny,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  voiceBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    minWidth: 140,
  },
  voiceBubbleMine: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  voiceWaveform: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  voiceProgress: {
    height: "100%",
    backgroundColor: COLORS.textMuted,
    borderRadius: 2,
  },
  voiceProgressMine: {
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  voiceDuration: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
  },
  voiceDurationMine: {
    color: "rgba(255,255,255,0.7)",
  },
  uploadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.small,
    gap: SPACING.small,
    backgroundColor: COLORS.backgroundPage,
  },
  uploadingText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textPrimary,
  },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    borderTopWidth: 1,
    borderTopColor: COLORS.errorLight,
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.danger,
  },
  recordingText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.danger,
  },
  recordingDuration: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textMuted,
    marginLeft: SPACING.small,
  },
  recordingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
  },
  cancelRecordButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sendRecordButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

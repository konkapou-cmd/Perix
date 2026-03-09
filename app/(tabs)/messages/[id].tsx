import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode, Audio } from "expo-av";
import { useAuth } from "../../../context/AuthContext";
import { useBadge } from "../../../context/BadgeContext";
import { useNotifications } from "../../../context/NotificationContext";
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
} from "../../../lib/api";
import { useSafeNavigation } from "../../../hooks/useSafeNavigation";

export default function ChatScreen() {
  const { t } = useTranslation();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const pathname = usePathname();
  const { safeGoBackToMessages, router } = useSafeNavigation();
  const { sessionToken, user } = useAuth();
  const { refreshUnreadCount } = useBadge();
  const { showLocalNotification } = useNotifications();
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
    const data = await getMessagesWith(sessionToken, id);
    
    // Check for new messages from the other user
    const newMessagesFromOther = data.filter(
      (msg: Message) => msg.from_user_id === id
    );
    
    // If we have more messages from the other user than before, show notification
    if (lastMessageCountRef.current > 0 && 
        newMessagesFromOther.length > lastMessageCountRef.current) {
      const latestMessage = data[data.length - 1];
      if (latestMessage && latestMessage.from_user_id === id) {
        // Only show notification if this screen is not focused
        showLocalNotification(
          name || t("messages.newMessage"),
          latestMessage.text?.substring(0, 100) || t("messages.newMessage"),
          { type: "message", from_user_id: id }
        );
      }
    }
    lastMessageCountRef.current = newMessagesFromOther.length;
    
    setMessages(data);
    
    // Mark messages from this user as read
    try {
      await markMessagesRead(sessionToken, id);
      refreshUnreadCount();
    } catch (e) {
      console.log("[Chat] Failed to mark messages as read:", e);
    }
  }, [sessionToken, id, refreshUnreadCount, name, showLocalNotification, t]);

  // Check if other user is typing
  const checkTypingStatus = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const result = await getTypingStatus(sessionToken, id);
      setOtherUserTyping(result.is_typing);
    } catch (e) {
      // Silent fail
    }
  }, [sessionToken, id]);

  useEffect(() => {
    if (!sessionToken || !id) return;
    setLoading(true);
    loadMessages().finally(() => setLoading(false));
  }, [loadMessages, sessionToken, id]);

  // Poll for new messages every 5 seconds and typing status every 2 seconds
  useEffect(() => {
    if (!sessionToken || !id) return;
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
  }, [sessionToken, id, loadMessages, checkTypingStatus]);

  // Handle typing indicator
  const handleTextChange = (value: string) => {
    setText(value);
    setErrorMessage("");
    
    // Send typing status
    if (sessionToken && id && value.trim()) {
      if (!isTyping) {
        setIsTyping(true);
        setTypingStatus(sessionToken, id, true).catch(() => {});
      }
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to clear typing status after 3 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        if (sessionToken && id) {
          setTypingStatus(sessionToken, id, false).catch(() => {});
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
      if (sessionToken && id) {
        setTypingStatus(sessionToken, id, false).catch(() => {});
      }
    };
  }, [sessionToken, id]);

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
      
      if (!result.canceled && result.assets?.[0]?.uri) {
        setUploadingMedia(true);
        try {
          // Upload media first
          const mediaUrl = await uploadMedia(sessionToken, result.assets[0].uri, mediaType);
          
          // Send media message
          const newMessage = await sendMediaMessage(sessionToken, id, mediaUrl, mediaType, text.trim() || undefined);
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
      setTypingStatus(sessionToken, id, false).catch(() => {});
      
      const newMessage = await sendMessage(sessionToken, {
        to_user_id: id,
        text: text.trim(),
      });
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
          const newMessage = await sendMediaMessage(sessionToken, id, mediaUrl, "audio", undefined);
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
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <View style={styles.header}>
        <Pressable onPress={safeGoBackToMessages} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{name || t("messages.chat")}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable 
            style={styles.headerIcon}
            onPress={() => router.push({
              pathname: "/call",
              params: { userId: id, userName: name, callType: "voice", mode: "outgoing" }
            })}
          >
            <Ionicons name="call-outline" size={20} color="#4c6fff" />
          </Pressable>
          <Pressable 
            style={styles.headerIcon}
            onPress={() => router.push({
              pathname: "/call",
              params: { userId: id, userName: name, callType: "video", mode: "outgoing" }
            })}
          >
            <Ionicons name="videocam-outline" size={20} color="#4c6fff" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4c6fff" />
        </View>
      ) : (
        <ScrollView style={styles.chat} contentContainerStyle={{ padding: 16 }}>
          {messages.length === 0 ? (
            <Text style={styles.emptyText}>{t("messages.noMessagesYet")}</Text>
          ) : (
            messages.map((message: any) => {
              const isMine = message.from_user_id === user?.user_id;
              const hasMedia = message.media_url;
              return (
                <Pressable
                  key={message.message_id}
                  onLongPress={() => handleLongPress(message)}
                  style={[
                    styles.messageBubble,
                    isMine ? styles.myBubble : styles.theirBubble,
                    hasMedia && styles.mediaBubble,
                  ]}
                >
                  {/* Media content */}
                  {hasMedia && message.media_type === "image" && (
                    <Image 
                      source={{ uri: message.media_url }} 
                      style={styles.messageImage}
                      resizeMode="cover"
                    />
                  )}
                  {hasMedia && message.media_type === "video" && (
                    <Video
                      source={{ uri: message.media_url }}
                      style={styles.messageVideo}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                      isLooping={false}
                    />
                  )}
                  {/* Text content */}
                  {message.text && (
                    <Text style={[styles.messageText, isMine && styles.myText]}>
                      {message.text}
                    </Text>
                  )}
                  <View style={styles.messageFooter}>
                    <Text style={[styles.messageTime, isMine && styles.myTimeText]}>
                      {new Date(message.created_at).toLocaleTimeString()}
                    </Text>
                    {message.edited_at && (
                      <Text style={[styles.editedLabel, isMine && styles.myTimeText]}>
                        {t("messages.edited")}
                      </Text>
                    )}
                    {/* Read receipt indicator for sent messages */}
                    {isMine && (
                      <View style={styles.readReceipt}>
                        <Ionicons 
                          name={message.read ? "checkmark-done" : "checkmark"} 
                          size={14} 
                          color={message.read ? "#34d399" : "#9ca3af"} 
                        />
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          )}
          {/* Typing indicator */}
          {otherUserTyping && (
            <View style={styles.typingIndicator}>
              <Text style={styles.typingText}>{name || t("messages.user")} {t("messages.isTyping") || "is typing"}...</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Uploading media indicator */}
      {uploadingMedia && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color="#4c6fff" />
          <Text style={styles.uploadingText}>{t("messages.uploadingMedia") || "Uploading..."}</Text>
        </View>
      )}

      {/* Voice Recording Bar */}
      {isRecording && (
        <View style={styles.recordingBar}>
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
        <View style={styles.inputBar}>
          {/* Media buttons */}
          <Pressable
            style={styles.mediaButton}
            onPress={() => handlePickMedia("image")}
            disabled={uploadingMedia}
          >
            <Ionicons name="image-outline" size={22} color="#6b7280" />
          </Pressable>
          <Pressable
            style={styles.mediaButton}
            onPress={() => handlePickMedia("video")}
            disabled={uploadingMedia}
          >
            <Ionicons name="videocam-outline" size={22} color="#6b7280" />
          </Pressable>
          
          <TextInput
            placeholder={t("messages.typeMessage")}
            value={text}
            onChangeText={handleTextChange}
            style={styles.input}
          />
          
          {/* Show Mic button when text is empty, Send button when text exists */}
          {text.trim().length === 0 ? (
            <Pressable
              style={styles.voiceButton}
              onPress={startRecording}
              disabled={uploadingMedia}
              data-testid="chat-voice-btn"
            >
              <Ionicons name="mic" size={22} color="#4c6fff" />
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
    backgroundColor: "#f5f6fb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
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
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 40,
  },
  messageBubble: {
    maxWidth: "75%",
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
  },
  myBubble: {
    backgroundColor: "#4c6fff",
    alignSelf: "flex-end",
  },
  theirBubble: {
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  messageText: {
    color: "#111827",
    fontSize: 14,
  },
  myText: {
    color: "#fff",
  },
  messageTime: {
    fontSize: 10,
    color: "#9ca3af",
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  myTimeText: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  editedLabel: {
    fontSize: 10,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  readReceipt: {
    marginLeft: 4,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    paddingBottom: 4,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#4c6fff",
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#ef4444",
    textAlign: "center",
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  editModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  editInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  editModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  editCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  editCancelText: {
    color: "#6b7280",
    fontWeight: "500",
  },
  editSaveButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  editSaveText: {
    color: "#fff",
    fontWeight: "600",
  },
  // Media message styles
  mediaBubble: {
    padding: 4,
    maxWidth: "75%",
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
  },
  messageVideo: {
    width: 200,
    height: 150,
    borderRadius: 12,
    marginBottom: 4,
  },
  mediaButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  hiddenButton: {
    width: 0,
    height: 0,
    opacity: 0,
    overflow: "hidden",
  },
  typingIndicator: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  typingText: {
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
  },
  uploadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 8,
    backgroundColor: "#f0f4ff",
  },
  uploadingText: {
    fontSize: 12,
    color: "#4c6fff",
  },
  // Voice recording styles
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fef2f2",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#fecaca",
  },
  recordingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
  },
  recordingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ef4444",
  },
  recordingDuration: {
    fontSize: 14,
    color: "#6b7280",
    marginLeft: 8,
  },
  recordingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cancelRecordButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center",
  },
  sendRecordButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#4c6fff",
    alignItems: "center",
    justifyContent: "center",
  },
});

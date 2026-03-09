import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../context/AuthContext";
import { useNotifications } from "../../../context/NotificationContext";
import {
  Conversation,
  ExtendedConversation,
  getConversations,
  getAllConversations,
  sendMessage,
  deleteConversation,
  getMyFriends,
  User,
} from "../../../lib/api";
import NotificationBar from "../../../components/NotificationBar";

export default function MessagesScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { showLocalNotification } = useNotifications();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allConversations, setAllConversations] = useState<ExtendedConversation[]>([]);
  const [showGroupChats, setShowGroupChats] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<User | null>(null);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const lastUnreadMapRef = useRef<Record<string, number>>({});

  const confirmDeleteConversation = (otherUserId: string, otherUserName: string) => {
    Alert.alert(
      t("messages.deleteConversation"),
      t("messages.deleteConfirm", { name: otherUserName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.delete"), style: "destructive", onPress: () => handleDeleteConversation(otherUserId) },
      ]
    );
  };

  const handleDeleteConversation = async (otherUserId: string) => {
    if (!sessionToken) return;
    try {
      await deleteConversation(sessionToken, otherUserId);
      setConversations(prev => prev.filter(c => c.other_user.user_id !== otherUserId));
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const loadConversations = useCallback(async () => {
    if (!sessionToken) return;
    const data = await getConversations(sessionToken);
    
    // Check for new unread messages and trigger notifications
    const newUnreadMap: Record<string, number> = {};
    data.forEach((conv: Conversation) => {
      newUnreadMap[conv.other_user.user_id] = conv.unread_count || 0;
      
      // If unread count increased, show notification
      const prevCount = lastUnreadMapRef.current[conv.other_user.user_id] || 0;
      if (conv.unread_count && conv.unread_count > prevCount && prevCount >= 0) {
        // last_message can be a string or Message object
        const messagePreview = typeof conv.last_message === 'string' 
          ? conv.last_message.substring(0, 100)
          : (conv.last_message as any)?.text?.substring(0, 100) || "";
        showLocalNotification(
          conv.other_user.display_name || conv.other_user.name || t("messages.newMessage"),
          messagePreview || t("messages.newMessage"),
          { type: "message", from_user_id: conv.other_user.user_id }
        );
      }
    });
    lastUnreadMapRef.current = newUnreadMap;
    
    setConversations(data);
    
    // Also load all conversations including group chats
    try {
      const allData = await getAllConversations(sessionToken);
      setAllConversations(allData);
    } catch (e) {
      console.log("Failed to load all conversations:", e);
    }
  }, [sessionToken, showLocalNotification, t]);

  const loadFriends = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const friendsData = await getMyFriends(sessionToken);
      setFriends(friendsData);
    } catch (error) {
      console.error("Failed to load friends:", error);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    setLoading(true);
    Promise.all([loadConversations(), loadFriends()]).finally(() => setLoading(false));
  }, [loadConversations, loadFriends, sessionToken]);

  // Poll for new messages every 10 seconds when on the messages list
  useEffect(() => {
    if (!sessionToken) return;
    const interval = setInterval(() => {
      loadConversations();
    }, 10000);
    return () => clearInterval(interval);
  }, [sessionToken, loadConversations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadConversations(), loadFriends()]);
    setRefreshing(false);
  };

  const handleStartConversation = async () => {
    if (!sessionToken || !selectedFriend || !message.trim()) return;
    try {
      setSending(true);
      setErrorMessage("");
      await sendMessage(sessionToken, { to_user_id: selectedFriend.user_id, text: message.trim() });
      setSelectedFriend(null);
      setMessage("");
      await loadConversations();
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unable to send message";
      setErrorMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const filteredFriends = friends.filter(friend => 
    friend.name.toLowerCase().includes(friendSearchQuery.toLowerCase()) ||
    friend.email.toLowerCase().includes(friendSearchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color="#4c6fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>{t("messages.title")}</Text>
              <Text style={styles.subtitle}>{t("messages.chatSubtitle")}</Text>
            </View>
            <View style={styles.headerButtons}>
              <Pressable 
                style={styles.groupCallButton}
                onPress={() => router.push("/start-group-call")}
                data-testid="start-group-call-btn"
              >
                <Ionicons name="people" size={16} color="#fff" />
                <Text style={styles.groupCallButtonText}>Group</Text>
              </Pressable>
              <Pressable 
                style={styles.callHistoryButton}
                onPress={() => router.push("/call-history")}
              >
                <Ionicons name="call" size={20} color="#4c6fff" />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Activity Notifications Bar */}
        <NotificationBar />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("messages.newMessage")}</Text>
          
          {/* Friend Selector */}
          <Pressable 
            style={styles.friendSelector}
            onPress={() => setShowFriendPicker(true)}
          >
            {selectedFriend ? (
              <View style={styles.selectedFriendRow}>
                <View style={styles.friendAvatarSmall}>
                  {selectedFriend.profile_photo || selectedFriend.picture ? (
                    <Image 
                      source={{ uri: selectedFriend.profile_photo || selectedFriend.picture || undefined }} 
                      style={styles.friendAvatarImage}
                    />
                  ) : (
                    <Text style={styles.friendAvatarText}>
                      {selectedFriend.name.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={styles.selectedFriendName}>{selectedFriend.name}</Text>
                <Pressable onPress={() => setSelectedFriend(null)}>
                  <Ionicons name="close-circle" size={20} color="#9ca3af" />
                </Pressable>
              </View>
            ) : (
              <View style={styles.placeholderRow}>
                <Ionicons name="person-add-outline" size={18} color="#9ca3af" />
                <Text style={styles.placeholderText}>{t("messages.selectFriend")}</Text>
                <Ionicons name="chevron-down" size={18} color="#9ca3af" />
              </View>
            )}
          </Pressable>

          <TextInput
            placeholder={t("messages.typeMessage")}
            value={message}
            onChangeText={(value) => {
              setMessage(value);
              setErrorMessage("");
            }}
            style={[styles.input, styles.messageInput]}
            multiline
          />
          <Pressable
            style={[styles.primaryButton, (sending || !selectedFriend) && styles.buttonDisabled]}
            onPress={handleStartConversation}
            disabled={sending || !selectedFriend}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{t("messages.send")}</Text>
            )}
          </Pressable>
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </View>

        {/* Tabs for DMs vs Group Chats */}
        <View style={styles.tabContainer}>
          <Pressable 
            style={[styles.tab, !showGroupChats && styles.tabActive]}
            onPress={() => setShowGroupChats(false)}
          >
            <Ionicons name="chatbubble" size={16} color={!showGroupChats ? "#4c6fff" : "#6b7280"} />
            <Text style={[styles.tabText, !showGroupChats && styles.tabTextActive]}>{t("messages.directMessages") || "Direct"}</Text>
          </Pressable>
          <Pressable 
            style={[styles.tab, showGroupChats && styles.tabActive]}
            onPress={() => setShowGroupChats(true)}
          >
            <Ionicons name="people" size={16} color={showGroupChats ? "#4c6fff" : "#6b7280"} />
            <Text style={[styles.tabText, showGroupChats && styles.tabTextActive]}>{t("messages.groupChats") || "Groups"}</Text>
          </Pressable>
        </View>

        {/* Group Chats Section */}
        {showGroupChats ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>{t("messages.groupChats") || "Group Chats"}</Text>
            </View>
            {allConversations.filter(c => c.type !== "direct").length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>{t("messages.noGroupChats") || "No group chats yet"}</Text>
                <Text style={styles.emptySubtext}>{t("messages.joinActivityEvent") || "Join an activity or event to chat with the group"}</Text>
              </View>
            ) : (
              allConversations.filter(c => c.type !== "direct").map((conv) => (
                <Pressable
                  key={`${conv.type}-${conv.conversation_id}`}
                  style={styles.chatCard}
                  onPress={() => {
                    if (conv.type === "activity") {
                      router.push(`/activity/${conv.conversation_id}`);
                    } else if (conv.type === "event") {
                      router.push(`/event/${conv.conversation_id}`);
                    }
                  }}
                >
                  <View style={[styles.avatar, conv.type === "activity" ? styles.activityAvatar : styles.eventAvatar]}>
                    {conv.image ? (
                      <Image source={{ uri: conv.image }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons 
                        name={conv.type === "activity" ? "people" : "calendar"} 
                        size={24} 
                        color="#fff" 
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.groupChatHeader}>
                      <Text style={styles.chatName}>{conv.name}</Text>
                      <View style={[styles.typeBadge, conv.type === "activity" ? styles.activityBadge : styles.eventBadge]}>
                        <Text style={styles.typeBadgeText}>
                          {conv.type === "activity" ? t("common.activity") || "Activity" : t("common.event") || "Event"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.chatMessage} numberOfLines={1}>
                      {conv.last_message || t("messages.noMessagesYet") || "No messages yet"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                </Pressable>
              ))
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.cardTitle}>{t("messages.recentChats")}</Text>
            </View>
            {conversations.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>{t("messages.noMessages")}</Text>
              </View>
            ) : (
              conversations.map((conversation) => (
                <Pressable
                  key={conversation.other_user.user_id}
                  style={styles.chatCard}
                  onPress={() =>
                    router.push({
                      pathname: "/messages/[id]",
                      params: {
                        id: conversation.other_user.user_id,
                        name: conversation.other_user.name,
                      },
                    })
                  }
                >
                  <View style={styles.avatar}>
                    {conversation.other_user.profile_photo || conversation.other_user.picture ? (
                      <Image 
                        source={{ uri: conversation.other_user.profile_photo || conversation.other_user.picture || undefined }} 
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.avatarText}>
                        {conversation.other_user.name.charAt(0)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chatName}>{conversation.other_user.name}</Text>
                    <Text style={styles.chatMessage} numberOfLines={1}>
                      {typeof conversation.last_message === 'string' 
                        ? conversation.last_message 
                        : conversation.last_message?.text || ""}
                    </Text>
                  </View>
                  {conversation.unread_count && conversation.unread_count > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{conversation.unread_count}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    style={styles.deleteButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      confirmDeleteConversation(conversation.other_user.user_id, conversation.other_user.name);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </Pressable>
              ))
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Friend Picker Modal */}
      <Modal
        visible={showFriendPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFriendPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("messages.selectFriend")}</Text>
              <Pressable onPress={() => setShowFriendPicker(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>
            
            <TextInput
              placeholder={t("messages.searchFriends")}
              value={friendSearchQuery}
              onChangeText={setFriendSearchQuery}
              style={styles.searchInput}
            />

            <ScrollView style={styles.friendList}>
              {filteredFriends.length === 0 ? (
                <View style={styles.emptyFriendsState}>
                  <Ionicons name="people-outline" size={40} color="#d1d5db" />
                  <Text style={styles.emptyFriendsText}>
                    {friends.length === 0 
                      ? t("messages.noFriendsYet")
                      : t("messages.noMatchingFriends")}
                  </Text>
                </View>
              ) : (
                filteredFriends.map((friend) => (
                  <Pressable
                    key={friend.user_id}
                    style={styles.friendItem}
                    onPress={() => {
                      setSelectedFriend(friend);
                      setShowFriendPicker(false);
                      setFriendSearchQuery("");
                    }}
                  >
                    <View style={styles.friendAvatar}>
                      {friend.profile_photo || friend.picture ? (
                        <Image 
                          source={{ uri: friend.profile_photo || friend.picture || undefined }} 
                          style={styles.friendAvatarImage}
                        />
                      ) : (
                        <Text style={styles.friendAvatarText}>
                          {friend.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{friend.name}</Text>
                      <Text style={styles.friendEmail}>{friend.email}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fb",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f6fb",
  },
  header: {
    padding: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupCallButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4c6fff",
    gap: 6,
  },
  groupCallButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  groupCallIcon: {
    marginLeft: -4,
  },
  callHistoryButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f0f4ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    color: "#6b7280",
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#111827",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  friendSelector: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#f9fafb",
  },
  selectedFriendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedFriendName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  placeholderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  placeholderText: {
    flex: 1,
    fontSize: 14,
    color: "#9ca3af",
  },
  friendAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: "#111827",
  },
  messageInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  sectionHeader: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  emptyState: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 14,
  },
  errorText: {
    color: "#ef4444",
    textAlign: "center",
    marginTop: 8,
  },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    shadowColor: "#111827",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarText: {
    fontWeight: "600",
    color: "#4c6fff",
  },
  chatName: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  chatMessage: {
    color: "#6b7280",
    fontSize: 13,
  },
  unreadBadge: {
    backgroundColor: "#4c6fff",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  deleteButton: {
    padding: 8,
    marginLeft: 4,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  searchInput: {
    margin: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    backgroundColor: "#f9fafb",
  },
  friendList: {
    paddingHorizontal: 16,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  friendAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  friendAvatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4c6fff",
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  friendEmail: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  emptyFriendsState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyFriendsText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
  },
  // Tab styles
  tabContainer: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginLeft: 20,
    marginBottom: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: "#f0f4ff",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  // Group chat styles
  activityAvatar: {
    backgroundColor: "#8b5cf6",
  },
  eventAvatar: {
    backgroundColor: "#ec4899",
  },
  groupChatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activityBadge: {
    backgroundColor: "#f3e8ff",
  },
  eventBadge: {
    backgroundColor: "#fce7f3",
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#7c3aed",
  },
  emptySubtext: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },
});

import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../context/AuthContext";
import { useNotifications } from "../../../context/NotificationContext";
import { useSocket, useSocketEvent } from "../../../context/SocketContext";
import {
  Conversation,
  ExtendedConversation,
  getConversations,
  getAllConversations,
  sendMessage,
  getMyFriends,
  User,
  getMyFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  FriendRequest,
  Message,
  markGroupRead,
} from "../../../lib/api";
import NotificationBar from "../../../components/NotificationBar";
import { SkeletonBox, Avatar } from "../../../components/shared";
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
  SHADOWS,
  ICON_SIZES,
} from "../../../lib/designTokens";

export default function MessagesScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { showLocalNotification } = useNotifications();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allConversations, setAllConversations] = useState<ExtendedConversation[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [friends, setFriends] = useState<User[]>([]);
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<User | null>(null);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const lastUnreadMapRef = useRef<Record<string, number>>({});

  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [friendRequestsExpanded, setFriendRequestsExpanded] = useState(true);
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null);

  const formatChatTime = (dateStr: string | undefined | null): string => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return t("messages.yesterday", "Yesterday");
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = conv.other_user?.name?.toLowerCase() || "";
    const msg = typeof conv.last_message === "string"
      ? conv.last_message.toLowerCase()
      : (conv.last_message as Message)?.text?.toLowerCase() || "";
    return name.includes(q) || msg.includes(q);
  });

  const filteredGroupConversations = allConversations.filter(c => {
    if (c.type === "direct") return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.last_message?.toLowerCase().includes(q);
  });

  const loadConversations = useCallback(async () => {
    if (!sessionToken) return;
    const data = await getConversations(sessionToken);
    
    // Check for new unread messages and trigger notifications
    const newUnreadMap: Record<string, number> = {};
    data.forEach((conv: Conversation) => {
      if (!conv.other_user) return;
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

  const loadFriendRequests = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await getMyFriendRequests(sessionToken);
      setIncomingRequests(data.incoming || []);
      setOutgoingRequests(data.outgoing || []);
    } catch (error) {
      console.error("Failed to load friend requests:", error);
    }
  }, [sessionToken]);

  const handleAcceptRequest = async (requestId: string) => {
    if (!sessionToken) return;
    setRequestActionLoading(requestId);
    try {
      await acceptFriendRequest(sessionToken, requestId);
      await loadFriendRequests();
    } catch (error) {
      console.error("Failed to accept request:", error);
    } finally {
      setRequestActionLoading(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!sessionToken) return;
    setRequestActionLoading(requestId);
    try {
      await declineFriendRequest(sessionToken, requestId);
      await loadFriendRequests();
    } catch (error) {
      console.error("Failed to decline request:", error);
    } finally {
      setRequestActionLoading(null);
    }
  };

  useEffect(() => {
    if (!sessionToken) return;
    setLoading(true);
    Promise.all([loadConversations(), loadFriends(), loadFriendRequests()]).finally(() => setLoading(false));
  }, [loadConversations, loadFriends, loadFriendRequests, sessionToken]);

  // Use WebSocket for real-time conversation updates, fallback to polling
  const { connected: wsConnected } = useSocket();

  useSocketEvent("conversation_update", useCallback(() => {
    loadConversations();
  }, [loadConversations]));

  useSocketEvent("new_message", useCallback(() => {
    loadConversations();
  }, [loadConversations]));

  useEffect(() => {
    if (!sessionToken) return;
    if (!wsConnected) {
      const interval = setInterval(() => {
        loadConversations();
        loadFriendRequests();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [sessionToken, wsConnected, loadConversations, loadFriendRequests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadConversations(), loadFriends(), loadFriendRequests()]);
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
      <SafeAreaView style={styles.container} edges={['top']}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={styles.skeletonRow}
          >
            <SkeletonBox width={42} height={42} borderRadius={21} />
            <View style={{ flex: 1, gap: SPACING.sm }}>
              <SkeletonBox width={140} height={12} borderRadius={4} />
              <SkeletonBox width={100} height={12} borderRadius={4} />
            </View>
          </View>
        ))}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>{t("messages.title")}</Text>
              <Text style={styles.subtitle}>{t("messages.chatSubtitle")}</Text>
            </View>
            <View style={styles.headerButtons}>
              <Pressable 
                style={styles.headerIconButton}
                onPress={() => router.push("/start-group-call")}
              >
                <Ionicons name="people" size={16} color="#fff" />
              </Pressable>
              <Pressable 
                style={styles.headerIconButtonOutline}
                onPress={() => router.push("/call-history")}
              >
                <Ionicons name="call" size={18} color={COLORS.textPrimary} />
              </Pressable>
            </View>
          </View>
        </View>

        <NotificationBar />

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={COLORS.textMuted} />
            <TextInput
              placeholder={t("messages.searchConversations", "Search conversations")}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              placeholderTextColor={COLORS.textDisabled}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Friend Requests Section */}
        {incomingRequests.length > 0 && (
          <View style={styles.card}>
            <Pressable
              style={styles.sectionHeaderRow}
              onPress={() => setFriendRequestsExpanded(!friendRequestsExpanded)}
            >
              <Text style={styles.cardTitle}>{t("messages.friendRequests", "Friend Requests")}</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{incomingRequests.length}</Text>
              </View>
              <Ionicons
                name={friendRequestsExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={COLORS.textMuted}
              />
            </Pressable>

            {friendRequestsExpanded && incomingRequests.map((request) => (
              <View key={request.request_id} style={styles.friendRequestItem}>
                <Avatar
                  uri={request.from_user?.profile_photo || request.from_user?.picture}
                  name={request.from_user?.name}
                  size="sm"
                />
                <View style={styles.friendRequestInfo}>
                  <Text style={styles.friendRequestName}>
                    {request.from_user?.name || request.from_user_id}
                  </Text>
                  <Text style={styles.friendRequestMeta}>
                    {request.entity_type === "business" ? t("common.business", "Business") :
                     request.entity_type === "artist" ? t("common.artist", "Artist") :
                     t("messages.friendRequestReceived", "Friend request")}
                  </Text>
                </View>
                <View style={styles.friendRequestActions}>
                  <Pressable
                    style={[styles.acceptButton, requestActionLoading === request.request_id && styles.buttonDisabled]}
                    onPress={() => handleAcceptRequest(request.request_id)}
                    disabled={requestActionLoading === request.request_id}
                  >
                    {requestActionLoading === request.request_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.acceptButtonText}>{t("messages.accept", "Accept")}</Text>
                    )}
                  </Pressable>
                  <Pressable
                    style={styles.declineButton}
                    onPress={() => handleDeclineRequest(request.request_id)}
                    disabled={requestActionLoading === request.request_id}
                  >
                    <Ionicons name="close" size={16} color={COLORS.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Unified Conversation List */}
        {(() => {
          const unified = [
            ...filteredConversations.map(c => ({
              id: c.other_user?.user_id || c.conversation_id || "",
              type: "direct" as const,
              name: c.other_user?.name || c.other_user?.display_name || "",
              image: c.other_user?.profile_photo || c.other_user?.picture || null,
              lastMessage: typeof c.last_message === "string" ? c.last_message : (c.last_message as any)?.text || "",
              lastMessageTime: typeof c.last_message === "object" && c.last_message ? (c.last_message as any)?.created_at || "" : "",
              unreadCount: c.unread_count || 0,
              conv: c,
            })),
            ...filteredGroupConversations.map(c => ({
              id: c.conversation_id || "",
              type: c.type as "activity" | "event",
              name: c.name || "",
              image: c.image || null,
              lastMessage: c.last_message || "",
              lastMessageTime: c.last_message_time || "",
              unreadCount: c.unread_count || 0,
              conv: c,
            })),
          ].sort((a, b) => {
            const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
            const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
            return tB - tA;
          });

          if (unified.length === 0) {
            return (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={48} color={COLORS.border} />
                <Text style={styles.emptyText}>{t("messages.noConversations") || "No conversations yet"}</Text>
              </View>
            );
          }

          return unified.map(item => (
            <Pressable
              key={`${item.type}-${item.id}`}
              style={styles.chatCard}
              onPress={() => {
                if (item.type === "direct") {
                  router.push(`/messages/${item.id}` as any);
                } else if (item.type === "activity") {
                  if (sessionToken) markGroupRead(sessionToken, item.id, "activity").catch(() => {});
                  router.push(`/group-chat/activity/${item.id}` as any);
                } else if (item.type === "event") {
                  if (sessionToken) markGroupRead(sessionToken, item.id, "event").catch(() => {});
                  router.push(`/group-chat/event/${item.id}` as any);
                }
              }}
            >
              <View style={[styles.groupAvatar, item.type === "activity" ? styles.activityAvatar : item.type === "event" ? styles.eventAvatar : styles.directAvatar]}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.avatarImage} />
                ) : (
                  <Ionicons
                    name={item.type === "activity" ? "people" : item.type === "event" ? "calendar" : "person"}
                    size={ICON_SIZES.interactive}
                    color="#fff"
                  />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.chatHeaderRow}>
                  <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
                  {item.lastMessageTime && (
                    <Text style={styles.chatTime}>{formatChatTime(item.lastMessageTime)}</Text>
                  )}
                </View>
                <View style={styles.chatMessageRow}>
                  <Text style={styles.chatMessage} numberOfLines={1}>
                    {item.lastMessage || t("messages.noMessagesYet") || "No messages yet"}
                  </Text>
                  {item.type !== "direct" && (
                    <View style={[styles.typeBadge, item.type === "activity" ? styles.activityBadge : styles.eventBadge]}>
                      <Text style={styles.typeBadgeText}>
                        {item.type === "activity" ? t("common.activity") || "Activity" : t("common.event") || "Event"}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              {item.unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{item.unreadCount}</Text>
                </View>
              )}
            </Pressable>
          ));
        })()}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* New Message FAB */}
      {(
        <Pressable
          style={styles.fab}
          onPress={() => setShowFriendPicker(true)}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color="#fff" />
        </Pressable>
      )}

      {/* Friend Picker Modal (with message input) */}
      <Modal
        visible={showFriendPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFriendPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: SPACING.xxxl + insets.bottom }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("messages.newMessage")}</Text>
              <Pressable onPress={() => { setShowFriendPicker(false); setSelectedFriend(null); setMessage(""); setErrorMessage(""); }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </Pressable>
            </View>
            
            <TextInput
              placeholder={t("messages.searchFriends")}
              value={friendSearchQuery}
              onChangeText={setFriendSearchQuery}
              style={styles.searchInputModal}
              placeholderTextColor={COLORS.textDisabled}
            />

            <ScrollView style={styles.friendList}>
              {filteredFriends.length === 0 ? (
                <View style={styles.emptyFriendsState}>
                  <Ionicons name="people-outline" size={40} color={COLORS.border} />
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
                    style={[styles.friendItem, selectedFriend?.user_id === friend.user_id && styles.friendItemSelected]}
                    onPress={() => {
                      setSelectedFriend(friend);
                      setFriendSearchQuery("");
                    }}
                  >
                    <Avatar
                      uri={friend.profile_photo || friend.picture}
                      name={friend.name}
                      size="md"
                    />
                    <View style={styles.friendInfo}>
                      <Text style={styles.friendName}>{friend.name}</Text>
                      <Text style={styles.friendEmail}>{friend.email}</Text>
                    </View>
                    {selectedFriend?.user_id === friend.user_id && (
                      <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>

            {selectedFriend && (
              <View style={styles.composeSection}>
                <TextInput
                  placeholder={t("messages.typeMessage")}
                  value={message}
                  onChangeText={(value) => {
                    setMessage(value);
                    setErrorMessage("");
                  }}
                  style={styles.composeInput}
                  multiline
                  placeholderTextColor={COLORS.textDisabled}
                />
                <Pressable
                  style={[styles.sendButton, (sending || !message.trim()) && styles.buttonDisabled]}
                  onPress={handleStartConversation}
                  disabled={sending || !message.trim()}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </Pressable>
              </View>
            )}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
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
    backgroundColor: COLORS.background,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xl,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    padding: 14,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
  },
  header: {
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.xxl,
    paddingBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.mdLg,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonOutline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: COLORS.textPrimary,
  },
  subtitle: {
    marginTop: SPACING.xs,
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.caption,
  },
  searchContainer: {
    paddingHorizontal: SPACING.xxl,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    height: 40,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  card: {
    marginHorizontal: SPACING.xl,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    ...SHADOWS.subtle,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h4,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  badge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
    marginLeft: SPACING.sm,
  },
  badgeText: {
    color: "#fff",
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  friendRequestItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: SPACING.md,
  },
  friendRequestInfo: {
    flex: 1,
  },
  friendRequestName: {
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodySmall,
  },
  friendRequestMeta: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  friendRequestActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  acceptButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
  },
  acceptButtonText: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
    fontSize: FONT_SIZES.caption,
  },
  declineButton: {
    padding: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.background,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
    padding: 14,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.subtle,
  },
  groupAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  activityAvatar: {
    backgroundColor: COLORS.activityAccent,
  },
  eventAvatar: {
    backgroundColor: COLORS.eventAccent,
  },
  directAvatar: {
    backgroundColor: COLORS.primary,
  },
  chatHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  chatName: {
    flex: 1,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
    fontSize: FONT_SIZES.bodySmall,
  },
  chatTime: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  chatMessageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  chatMessage: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.caption,
  },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  unreadText: {
    color: "#fff",
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  emptyState: {
    backgroundColor: COLORS.background,
    marginHorizontal: SPACING.xl,
    padding: SPACING.huge,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: "center",
    gap: SPACING.md,
  },
  emptyText: {
    color: COLORS.textDisabled,
    fontSize: FONT_SIZES.bodySmall,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textDisabled,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  errorText: {
    color: COLORS.danger,
    textAlign: "center",
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.caption,
  },
  typeBadge: {
    paddingHorizontal: SPACING.md,
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
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.activityAccent,
  },
  fab: {
    position: "absolute",
    right: SPACING.xxl,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    maxHeight: "85%",
    paddingBottom: SPACING.xxxl,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.xxl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: COLORS.textPrimary,
  },
  searchInputModal: {
    margin: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.bodySmall,
    backgroundColor: COLORS.backgroundPage,
    color: COLORS.textPrimary,
  },
  friendList: {
    paddingHorizontal: SPACING.xl,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.backgroundPage,
  },
  friendItemSelected: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  friendInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  friendName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
  },
  friendEmail: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  emptyFriendsState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: SPACING.md,
  },
  emptyFriendsText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textDisabled,
    textAlign: "center",
  },
  composeSection: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  composeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    maxHeight: 80,
    textAlignVertical: "top",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

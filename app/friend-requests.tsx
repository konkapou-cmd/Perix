import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../lib/designTokens";
import {
  FriendRequest,
  getReceivedFriendRequests,
  getSentFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
} from "../lib/api";

type TabType = "received" | "sent";

export default function FriendRequestsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState<TabType>("received");
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, [sessionToken]);

  const loadRequests = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const [received, sent] = await Promise.all([
        getReceivedFriendRequests(sessionToken),
        getSentFriendRequests(sessionToken),
      ]);
      setReceivedRequests(received);
      setSentRequests(sent);
    } catch (error) {
      console.error("Failed to load friend requests:", error);
    }
    setLoading(false);
  };

  const handleAccept = async (requestId: string) => {
    if (!sessionToken || processingId) return;
    setProcessingId(requestId);
    try {
      await acceptFriendRequest(sessionToken, requestId);
      setReceivedRequests(prev => prev.filter(r => r.request_id !== requestId));
      Alert.alert(
        t("friends.success") || "Success!",
        t("friends.requestAccepted") || "You are now friends!"
      );
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message || t("common.pleaseTryAgain"));
    }
    setProcessingId(null);
  };

  const handleDecline = async (requestId: string) => {
    if (!sessionToken || processingId) return;
    setProcessingId(requestId);
    try {
      await declineFriendRequest(sessionToken, requestId);
      setReceivedRequests(prev => prev.filter(r => r.request_id !== requestId));
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message || t("common.pleaseTryAgain"));
    }
    setProcessingId(null);
  };

  const handleCancel = async (requestId: string) => {
    if (!sessionToken || processingId) return;
    
    Alert.alert(
      t("friends.cancelRequest") || "Cancel Request",
      t("friends.cancelRequestConfirm") || "Are you sure you want to cancel this friend request?",
      [
        { text: t("common.no") || "No", style: "cancel" },
        {
          text: t("common.yes") || "Yes",
          style: "destructive",
          onPress: async () => {
            setProcessingId(requestId);
            try {
              await cancelFriendRequest(sessionToken, requestId);
              setSentRequests(prev => prev.filter(r => r.request_id !== requestId));
            } catch (error: any) {
              Alert.alert(t("common.error"), error.message || t("common.pleaseTryAgain"));
            }
            setProcessingId(null);
          },
        },
      ]
    );
  };

  const renderReceivedRequest = ({ item }: { item: FriendRequest }) => {
    const user = item.from_user;
    const isProcessing = processingId === item.request_id;
    
    return (
      <View style={styles.requestCard}>
        <Pressable 
          style={styles.userInfo}
          onPress={() => user?.user_id && router.push(`/user/${user.user_id}`)}
        >
          {user?.profile_photo || user?.picture ? (
            <Image 
              source={{ uri: (user?.profile_photo || user?.picture) || undefined }} 
              style={styles.avatar} 
            />
          ) : (
            <LinearGradient
              colors={["#FFD700", "#FF6B6B"]}
              style={styles.avatarPlaceholder}
            >
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0) || "?"}
              </Text>
            </LinearGradient>
          )}
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{user?.name || "Unknown"}</Text>
            <Text style={styles.timeAgo}>
              {formatTimeAgo(item.created_at)}
            </Text>
          </View>
        </Pressable>
        
        <View style={styles.actionButtons}>
          {isProcessing ? (
            <ActivityIndicator color={COLORS.primaryDark} />
          ) : (
            <>
              <Pressable
                style={styles.acceptButton}
                onPress={() => handleAccept(item.request_id)}
              >
                <LinearGradient
                  colors={[COLORS.primaryDark, "#FFD700"]}
                  style={styles.acceptButtonGradient}
                >
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.acceptButtonText}>
                    {t("friends.accept") || "Accept"}
                  </Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                style={styles.declineButton}
                onPress={() => handleDecline(item.request_id)}
              >
                <Ionicons name="close" size={20} color="#6b7280" />
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderSentRequest = ({ item }: { item: FriendRequest }) => {
    const displayName = item.to_user?.name || item.to_entity_name || "Unknown";
    const displayImage = item.to_user?.profile_photo || item.to_user?.picture || item.to_entity_image;
    
    return (
      <View style={styles.requestCard}>
        <Pressable 
          style={styles.userInfo}
          onPress={() => (item.to_user?.user_id || item.entity_id) && router.push(`/user/${item.to_user?.user_id || item.entity_id}`)}
        >
          {displayImage ? (
            <Image 
              source={{ uri: displayImage }} 
              style={styles.avatar} 
            />
          ) : (
            <LinearGradient
              colors={["#FFD700", "#FF6B6B"]}
              style={styles.avatarPlaceholder}
            >
              <Text style={styles.avatarText}>
                {displayName.charAt(0)}
              </Text>
            </LinearGradient>
          )}
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{displayName}</Text>
            <Text style={styles.statusText}>
              {t("friends.pendingRequest") || "Pending"}
            </Text>
          </View>
        </Pressable>
        
        <View style={styles.actionButtons}>
          {processingId === item.request_id ? (
            <ActivityIndicator color="#ef4444" />
          ) : (
            <Pressable
              style={styles.cancelButton}
              onPress={() => handleCancel(item.request_id)}
            >
              <Text style={styles.cancelButtonText}>
                {t("friends.cancel") || "Cancel"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return t("time.justNow") || "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const currentRequests = activeTab === "received" ? receivedRequests : sentRequests;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t("friends.friendRequests") || "Friend Requests"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "received" && styles.tabActive]}
          onPress={() => setActiveTab("received")}
        >
          <Text style={[styles.tabText, activeTab === "received" && styles.tabTextActive]}>
            {t("friends.received") || "Received"}
          </Text>
          {receivedRequests.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{receivedRequests.length}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "sent" && styles.tabActive]}
          onPress={() => setActiveTab("sent")}
        >
          <Text style={[styles.tabText, activeTab === "sent" && styles.tabTextActive]}>
            {t("friends.sent") || "Sent"}
          </Text>
          {sentRequests.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#9ca3af" }]}>
              <Text style={styles.badgeText}>{sentRequests.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primaryDark} />
        </View>
      ) : currentRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons 
              name={activeTab === "received" ? "people-outline" : "paper-plane-outline"} 
              size={48} 
              color="#9ca3af" 
            />
          </View>
          <Text style={styles.emptyTitle}>
            {activeTab === "received" 
              ? (t("friends.noReceivedRequests") || "No friend requests")
              : (t("friends.noSentRequests") || "No pending requests")}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeTab === "received"
              ? (t("friends.noReceivedRequestsDesc") || "When someone sends you a friend request, it will appear here")
              : (t("friends.noSentRequestsDesc") || "Friend requests you send will appear here")}
          </Text>
          {activeTab === "received" && (
            <Pressable 
              style={styles.findFriendsButton}
              onPress={() => router.navigate("/(tabs)/locator" as any)}
            >
              <LinearGradient
                colors={[COLORS.primaryDark, "#FFD700"]}
                style={styles.findFriendsGradient}
              >
                <Ionicons name="search" size={20} color="#fff" />
                <Text style={styles.findFriendsText}>
                  {t("friends.findFriends") || "Find Friends"}
                </Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={currentRequests}
          renderItem={activeTab === "received" ? renderReceivedRequest : renderSentRequest}
          keyExtractor={(item) => item.request_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    gap: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primaryDark,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#fff",
  },
  badge: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
  },
  userDetails: {
    marginLeft: 14,
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  timeAgo: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  statusText: {
    fontSize: 13,
    color: "#f59e0b",
    marginTop: 2,
    fontWeight: "500",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  acceptButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  acceptButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  acceptButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  declineButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#fee2e2",
  },
  cancelButtonText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    lineHeight: 22,
  },
  findFriendsButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: "hidden",
  },
  findFriendsGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 10,
  },
  findFriendsText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
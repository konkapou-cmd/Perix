import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ActivityItemType, getActivityFeed, markNotificationsRead } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useBadge } from "../context/BadgeContext";

interface NotificationBarProps {
  onExpand?: () => void;
}

const getActivityIcon = (type: string): keyof typeof Ionicons.glyphMap => {
  switch (type) {
    case "like":
      return "heart";
    case "comment":
      return "chatbubble";
    case "friend":
      return "people";
    case "friend_request":
      return "person-add";
    case "event":
      return "calendar";
    case "post":
      return "document-text";
    default:
      return "notifications";
  }
};

const getActivityColor = (type: string): string => {
  switch (type) {
    case "like":
      return "#ef4444";
    case "comment":
      return "#3b82f6";
    case "friend":
      return "#10b981";
    case "friend_request":
      return "#f59e0b";
    case "event":
      return "#8b5cf6";
    case "post":
      return "#6366f1";
    default:
      return "#6b7280";
  }
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
};

// Helper to translate notification messages based on type
const getTranslatedMessage = (activity: ActivityItemType, t: any): string => {
  switch (activity.type) {
    case "friend_request":
      return t("notifications.wantsToConnect") || "wants to connect with you";
    case "friend":
      return t("notifications.isNowFriend") || "is now your friend";
    case "like":
      return t("notifications.likedYourPost") || "liked your post";
    case "comment":
      return t("notifications.commentedOnPost") || "commented on your post";
    case "event":
      return t("notifications.invitedToEvent") || "invited you to an event";
    case "post":
      return t("notifications.newPost") || "shared a new post";
    default:
      return activity.message || "";
  }
};

export default function NotificationBar({ onExpand }: NotificationBarProps) {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { clearActivityCount } = useBadge();
  const router = useRouter();
  const [activities, setActivities] = useState<ActivityItemType[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadActivities();
    const interval = setInterval(loadActivities, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [sessionToken]);

  useEffect(() => {
    if (unreadCount > 0) {
      // Pulse animation for unread badge
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [unreadCount]);

  const loadActivities = async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    try {
      const response = await getActivityFeed(sessionToken, 5);
      setActivities(response.activities);
      setUnreadCount(response.unread_count);
    } catch (error) {
      console.log("Failed to load activity feed:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = () => {
    const toValue = expanded ? 0 : 1;
    Animated.spring(animatedHeight, {
      toValue,
      useNativeDriver: false,
      friction: 8,
    }).start();
    setExpanded(!expanded);
    onExpand?.();
  };

  const handleActivityPress = async (activity: ActivityItemType) => {
    // Mark this notification as read via API
    if (sessionToken) {
      try {
        await markNotificationsRead(sessionToken, [activity.activity_id]);
      } catch (e) {
        console.log("Failed to mark notification as read:", e);
      }
    }
    
    // Update local state - mark as read and clear badge
    setUnreadCount(prev => Math.max(0, prev - 1));
    setActivities(prev => prev.map(a => 
      a.activity_id === activity.activity_id ? { ...a, read: true } : a
    ));
    clearActivityCount();
    
    // Navigate based on activity type
    console.log("Notification clicked:", activity.type, activity.target_type, activity.target_id, activity.actor_id);
    
    if (activity.type === "like" || activity.type === "comment") {
      // For likes/comments, go to the specific post
      if (activity.target_id) {
        router.push(`/post/${activity.target_id}`);
      } else {
        router.push("/(tabs)/home");
      }
    } else if (activity.type === "friend_request" && activity.actor_id) {
      // Navigate to the person who sent the friend request
      router.push(`/user/${activity.actor_id}`);
    } else if (activity.type === "friend" && activity.actor_id) {
      // Navigate to the new friend's profile
      router.push(`/user/${activity.actor_id}`);
    } else if (activity.target_type === "user" && activity.target_id) {
      router.push(`/user/${activity.target_id}`);
    } else if (activity.target_type === "post" && activity.target_id) {
      router.push(`/post/${activity.target_id}`);
    } else if (activity.target_type === "event" && activity.target_id) {
      router.push(`/event/${activity.target_id}`);
    } else if (activity.target_type === "activity" && activity.target_id) {
      router.push("/(tabs)/activities");
    } else if (activity.actor_id) {
      // Fallback: navigate to the actor's profile
      router.push(`/user/${activity.actor_id}`);
    }
  };

  // Mark all as read when expanding the notification bar
  const handleExpand = async () => {
    toggleExpand();
    if (!expanded && unreadCount > 0) {
      // When opening, mark all as read via API
      if (sessionToken) {
        try {
          await markNotificationsRead(sessionToken, undefined, true);
        } catch (e) {
          console.log("Failed to mark all notifications as read:", e);
        }
      }
      // Update local state
      setUnreadCount(0);
      setActivities(prev => prev.map(a => ({ ...a, read: true })));
      // Clear the badge in the global context (tab bar badge)
      clearActivityCount();
    }
  };

  if (loading && sessionToken) {
    return null; // Don't show while loading if there's a token
  }

  // If no token, hide the component entirely
  if (!sessionToken) {
    return null;
  }

  // Show empty state with subtle design
  if (activities.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="notifications-outline" size={18} color="#4c6fff" />
          </View>
          <Text style={styles.emptyText}>{t("notifications.noActivity")}</Text>
        </View>
      </View>
    );
  }

  const expandedHeight = animatedHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [56, Math.min(activities.length * 70 + 70, 350)],
  });

  return (
    <Animated.View style={[styles.container, { height: expandedHeight }]}>
      {/* Compact Header Bar */}
      <Pressable style={styles.headerBar} onPress={handleExpand}>
        <View style={styles.headerLeft}>
          <View style={styles.bellContainer}>
            <Ionicons name="notifications" size={18} color="#4c6fff" />
            {unreadCount > 0 && (
              <Animated.View
                style={[styles.badge, { transform: [{ scale: pulseAnim }] }]}
              >
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </Animated.View>
            )}
          </View>
          
          {/* Show latest activity in compact mode */}
          {!expanded && activities[0] && (
            <View style={styles.compactPreview}>
              <View
                style={[
                  styles.miniIcon,
                  { backgroundColor: getActivityColor(activities[0].type) + "20" },
                ]}
              >
                <Ionicons
                  name={getActivityIcon(activities[0].type)}
                  size={12}
                  color={getActivityColor(activities[0].type)}
                />
              </View>
              <Text style={styles.compactText} numberOfLines={1}>
                <Text style={styles.actorName}>{activities[0].actor_name}</Text>
                {" "}
                {getTranslatedMessage(activities[0], t)}
              </Text>
            </View>
          )}
          
          {expanded && (
            <Text style={styles.headerTitle}>{t("notifications.recent")}</Text>
          )}
        </View>
        
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#6b7280"
        />
      </Pressable>

      {/* Expanded Activity List */}
      {expanded && (
        <ScrollView
          style={styles.activityList}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
          contentContainerStyle={{ paddingBottom: 10 }}
        >
          {activities.map((activity) => (
            <Pressable
              key={activity.activity_id}
              style={styles.activityItem}
              onPress={() => handleActivityPress(activity)}
            >
              <View style={styles.activityLeft}>
                {activity.actor_avatar ? (
                  <Image
                    source={{ uri: activity.actor_avatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {activity.actor_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View
                  style={[
                    styles.iconBadge,
                    { backgroundColor: getActivityColor(activity.type) },
                  ]}
                >
                  <Ionicons
                    name={getActivityIcon(activity.type)}
                    size={10}
                    color="#fff"
                  />
                </View>
              </View>
              
              <View style={styles.activityContent}>
                <Text style={styles.activityText} numberOfLines={2}>
                  <Text style={styles.actorNameBold}>{activity.actor_name}</Text>
                  {" "}
                  {getTranslatedMessage(activity, t)}
                </Text>
                <Text style={styles.activityTime}>
                  {formatTimeAgo(activity.created_at)}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  bellContainer: {
    position: "relative",
    marginRight: 10,
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: "#ef4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  compactPreview: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  miniIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  compactText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
  },
  actorName: {
    fontWeight: "600",
    color: "#111827",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  activityList: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  activityLeft: {
    position: "relative",
    marginRight: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4c6fff",
  },
  iconBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
  actorNameBold: {
    fontWeight: "600",
    color: "#111827",
  },
  activityTime: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 2,
  },
  emptyContainer: {
    backgroundColor: "#f0f4ff",
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  emptyContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    color: "#6b7280",
    marginLeft: 10,
    fontWeight: "500",
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
});

import React from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { UserPublic } from "../lib/api";
import Constants from "expo-constants";

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL;

interface FriendsCarouselProps {
  friends: UserPublic[];
  onAddFriend?: () => void;
  showAddButton?: boolean;
  currentUserId?: string;
  currentUserName?: string;
}

export default function FriendsCarousel({
  friends,
  onAddFriend,
  showAddButton = true,
  currentUserId,
  currentUserName,
}: FriendsCarouselProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handleShareInvite = async () => {
    // Create shareable profile link
    const profileUrl = currentUserId 
      ? `${BACKEND_URL?.replace('/api', '')}/share/user/${currentUserId}`
      : `${BACKEND_URL?.replace('/api', '')}/share/app`;
    
    const message = t("friends.inviteMessage", { name: currentUserName || "a friend" }) ||
      `Join me on Perix! ${profileUrl}`;
    
    try {
      await Share.share({ message });
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  const renderFriend = ({ item }: { item: UserPublic }) => {
    const avatarUrl = item.profile_photo || item.picture;
    const initials = item.name?.charAt(0)?.toUpperCase() || "?";

    return (
      <Pressable
        style={styles.friendItem}
        onPress={() => router.push(`/user/${item.user_id}`)}
        data-testid={`friend-${item.user_id}`}
      >
        <View style={styles.avatarContainer}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <LinearGradient
              colors={["#000000", "#FFD700"]}
              style={styles.avatarPlaceholder}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          )}
          {/* Online indicator (can be dynamic based on status) */}
          <View style={styles.onlineIndicator} />
        </View>
        <Text style={styles.friendName} numberOfLines={1}>
          {item.name?.split(" ")[0] || "Friend"}
        </Text>
      </Pressable>
    );
  };

  const renderAddButton = () => {
    if (!showAddButton) return null;
    
    return (
      <Pressable
        style={styles.friendItem}
        onPress={handleShareInvite}
        data-testid="add-friend-btn"
      >
        <View style={styles.addButtonContainer}>
          <LinearGradient
            colors={["#000000", "#FFD700"]}
            style={styles.addButton}
          >
            <Ionicons name="share-social" size={22} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.friendName}>{t("friends.invite") || "Invite"}</Text>
      </Pressable>
    );
  };

  if (friends.length === 0 && !showAddButton) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("friends.myFriends") || "Friends"}</Text>
        {friends.length > 0 && (
          <Pressable 
            style={styles.seeAllButton}
            onPress={() => router.navigate("/(tabs)/profile" as any)}
          >
            <Text style={styles.seeAllText}>{t("common.seeAll") || "See All"}</Text>
            <Ionicons name="chevron-forward" size={16} color="#000000" />
          </Pressable>
        )}
      </View>

      <FlatList
        data={friends}
        renderItem={renderFriend}
        keyExtractor={(item) => item.user_id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderAddButton}
        ListEmptyComponent={
          !showAddButton ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                {t("friends.noFriendsYet") || "No friends yet"}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  seeAllText: {
    fontSize: 14,
    color: "#000000",
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 12,
    gap: 4,
  },
  friendItem: {
    alignItems: "center",
    width: 76,
    marginHorizontal: 4,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 6,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "#e5e7eb",
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#e5e7eb",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#fff",
  },
  friendName: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
    textAlign: "center",
    maxWidth: 70,
  },
  addButtonContainer: {
    marginBottom: 6,
  },
  addButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#e0e7ff",
  },
  emptyContainer: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 14,
  },
});

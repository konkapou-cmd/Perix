import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { COLORS } from "../../lib/designTokens";
import { HeaderBackButton } from "../../components/shared/HeaderBackButton";
import { FriendProfile, getUserFriends, getMyFriendProfiles } from "../../lib/api";

export default function FriendsListScreen() {
  const { t } = useTranslation();
  const { sessionToken, user } = useAuth();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = id || "";

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = user?.user_id === userId;

  useEffect(() => {
    loadFriends();
  }, [sessionToken, userId]);

  const loadFriends = async () => {
    if (!sessionToken || !userId) return;
    setLoading(true);
    try {
      const data = isOwnProfile
        ? await getMyFriendProfiles(sessionToken)
        : await getUserFriends(sessionToken, userId);
      setFriends(data);
    } catch (err) {
      console.error("Failed to load friends:", err);
    } finally {
      setLoading(false);
    }
  };

  const navigateToProfile = (fp: FriendProfile) => {
    if (fp.entity_type === "user") {
      router.push(`/user/${fp.entity_id}`);
    } else if (fp.entity_type === "business") {
      router.push(`/business/${fp.entity_id}`);
    } else if (fp.entity_type === "artist") {
      router.push(`/artist/${fp.entity_id}`);
    }
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "business": return "business-outline";
      case "artist": return "musical-notes-outline";
      default: return "person-outline";
    }
  };

  const renderFriend = ({ item }: { item: FriendProfile }) => {
    const initials = item.name?.charAt(0)?.toUpperCase() || "?";
    return (
      <Pressable
        style={styles.friendItem}
        onPress={() => navigateToProfile(item)}
      >
        <View style={styles.avatarContainer}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.avatar} />
          ) : (
            <LinearGradient
              colors={["#000000", "#FFD700"]}
              style={styles.avatarPlaceholder}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          )}
        </View>
        <View style={styles.friendInfo}>
          <Text style={styles.friendName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.typeRow}>
            <Ionicons name={getEntityIcon(item.entity_type)} size={12} color="#6b7280" />
            <Text style={styles.typeText}>
              {item.entity_type === "business" && item.category
                ? `${item.category}`
                : item.entity_type.charAt(0).toUpperCase() + item.entity_type.slice(1)}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.title}>{t("profile.friends", "Friends")}</Text>
        <View style={{ width: 40, height: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primaryDark} />
        </View>
      ) : (
        <FlatList
          data={friends}
          renderItem={renderFriend}
          keyExtractor={(item) => `${item.entity_type}-${item.entity_id}`}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color="#d1d5db" />
              <Text style={styles.emptyText}>
                {t("friends.noFriendsYet", "No friends yet")}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 80,
    gap: 12,
  },
  listContent: {
    paddingVertical: 8,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e5e7eb",
  },
  avatarText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
  },
  friendInfo: {
    flex: 1,
    gap: 2,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  typeText: {
    fontSize: 13,
    color: "#6b7280",
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
  },
});

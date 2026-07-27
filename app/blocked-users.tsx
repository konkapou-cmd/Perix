import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "../lib/designTokens";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api/core";

type BlockedUser = {
  user_id: string;
  name: string;
  profile_photo?: string | null;
};

export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const loadBlockedUsers = async () => {
    if (!sessionToken) return;
    try {
      const data = await apiRequest<BlockedUser[]>("/users/blocked", "GET", sessionToken);
      setBlockedUsers(data || []);
    } catch (error) {
      console.error("Failed to load blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      t("settings.unblockUser") || "Unblock User",
      t("settings.unblockConfirm") || `Unblock ${user.name}? They will be able to see your content again.`,
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        {
          text: t("settings.unblock") || "Unblock",
          onPress: async () => {
            if (!sessionToken) return;
            setUnblocking(user.user_id);
            try {
              await apiRequest("/users/unblock/" + user.user_id, "POST", sessionToken);
              setBlockedUsers(prev => prev.filter(u => u.user_id !== user.user_id));
            } catch (error) {
              console.error("Failed to unblock:", error);
              Alert.alert(t("common.error") || "Error", t("settings.unblockFailed") || "Failed to unblock user");
            } finally {
              setUnblocking(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("settings.blockedUsers") || "Blocked Users"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.textPrimary} />
        </View>
      ) : blockedUsers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="ban-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>{t("settings.noBlockedUsers") || "No blocked users"}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {blockedUsers.map(user => (
            <View key={user.user_id} style={styles.userRow}>
              {user.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
              <Pressable
                style={[styles.unblockButton, unblocking === user.user_id && styles.unblockButtonDisabled]}
                onPress={() => handleUnblock(user)}
                disabled={unblocking === user.user_id}
              >
                {unblocking === user.user_id ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <Text style={styles.unblockButtonText}>{t("settings.unblock") || "Unblock"}</Text>
                )}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, color: "#9ca3af", marginTop: 12 },
  scrollView: { flex: 1 },
  content: { padding: 16 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary },
  userName: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: "500", color: COLORS.textPrimary },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  unblockButtonDisabled: { opacity: 0.5 },
  unblockButtonText: { color: "#ef4444", fontWeight: "600", fontSize: 14 },
});

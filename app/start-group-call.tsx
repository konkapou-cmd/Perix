/**
 * Start Group Call Screen
 * Select friends to start a group video/voice call
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { getMyFriends, createGroupCall, UserPublic } from "../lib/api";

export default function StartGroupCallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken, user } = useAuth();

  const [friends, setFriends] = useState<UserPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [callType, setCallType] = useState<"video" | "voice">("video");
  const [groupName, setGroupName] = useState("");
  const [starting, setStarting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!sessionToken) return;

    const loadFriends = async () => {
      try {
        const data = await getMyFriends(sessionToken);
        setFriends(data);
      } catch (e) {
        console.log("Failed to load friends:", e);
      } finally {
        setLoading(false);
      }
    };

    loadFriends();
  }, [sessionToken]);

  const toggleFriend = (userId: string) => {
    if (selectedFriends.includes(userId)) {
      setSelectedFriends(selectedFriends.filter((id) => id !== userId));
    } else {
      if (selectedFriends.length >= 15) {
        Alert.alert(
          t("call.maxParticipants") || "Maximum Reached",
          t("call.maxParticipantsDesc") || "You can add up to 15 friends (16 total including you)"
        );
        return;
      }
      setSelectedFriends([...selectedFriends, userId]);
    }
  };

  const handleStartCall = async () => {
    if (!sessionToken || selectedFriends.length === 0) return;

    setStarting(true);
    try {
      const result = await createGroupCall(
        sessionToken,
        selectedFriends,
        callType,
        groupName.trim() || undefined
      );
      
      // Navigate to group call screen
      router.push({
        pathname: "/group-call",
        params: { groupCallId: result.group_call_id, type: callType },
      });
    } catch (e: any) {
      Alert.alert(
        t("call.error") || "Error",
        e.message || t("call.failedToStart") || "Failed to start call"
      );
      setStarting(false);
    }
  };

  const filteredFriends = friends.filter((f) =>
    f.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedFriendsData = friends.filter((f) =>
    selectedFriends.includes(f.user_id)
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000000" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#000000" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("call.startGroupCall") || "Start Group Call"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Call Type Selection */}
      <View style={styles.callTypeSection}>
        <Text style={styles.sectionTitle}>{t("call.callType") || "Call Type"}</Text>
        <View style={styles.callTypeRow}>
          <Pressable
            style={[styles.callTypeBtn, callType === "video" && styles.callTypeBtnActive]}
            onPress={() => setCallType("video")}
          >
            <Ionicons
              name="videocam"
              size={24}
              color={callType === "video" ? "#fff" : "#6b7280"}
            />
            <Text
              style={[
                styles.callTypeText,
                callType === "video" && styles.callTypeTextActive,
              ]}
            >
              {t("call.videoCall") || "Video"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.callTypeBtn, callType === "voice" && styles.callTypeBtnActive]}
            onPress={() => setCallType("voice")}
          >
            <Ionicons
              name="call"
              size={24}
              color={callType === "voice" ? "#fff" : "#6b7280"}
            />
            <Text
              style={[
                styles.callTypeText,
                callType === "voice" && styles.callTypeTextActive,
              ]}
            >
              {t("call.voiceCall") || "Voice"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Group Name (Optional) */}
      <View style={styles.groupNameSection}>
        <Text style={styles.sectionTitle}>{t("call.groupName") || "Group Name"} ({t("common.optional") || "Optional"})</Text>
        <TextInput
          style={styles.groupNameInput}
          placeholder={t("call.groupNamePlaceholder") || "e.g., Friday Night Hangout"}
          placeholderTextColor="#6b7280"
          value={groupName}
          onChangeText={setGroupName}
          maxLength={50}
        />
      </View>

      {/* Selected Friends */}
      {selectedFriends.length > 0 && (
        <View style={styles.selectedSection}>
          <Text style={styles.sectionTitle}>
            {t("call.selected") || "Selected"} ({selectedFriends.length}/15)
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedRow}
          >
            {selectedFriendsData.map((friend) => (
              <Pressable
                key={friend.user_id}
                style={styles.selectedChip}
                onPress={() => toggleFriend(friend.user_id)}
              >
                {friend.profile_photo ? (
                  <Image
                    source={{ uri: friend.profile_photo }}
                    style={styles.selectedAvatar}
                  />
                ) : (
                  <View style={styles.selectedAvatarPlaceholder}>
                    <Text style={styles.selectedAvatarText}>
                      {friend.name?.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.selectedName} numberOfLines={1}>
                  {friend.name?.split(" ")[0]}
                </Text>
                <Ionicons name="close-circle" size={16} color="#ef4444" />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder={t("call.searchFriends") || "Search friends..."}
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Friends List */}
      <ScrollView style={styles.friendsList} contentContainerStyle={styles.friendsContent}>
        {filteredFriends.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#6b7280" />
            <Text style={styles.emptyText}>
              {searchQuery
                ? t("call.noMatchingFriends") || "No friends match your search"
                : t("call.noFriends") || "No friends yet. Add friends to start a group call!"}
            </Text>
          </View>
        ) : (
          filteredFriends.map((friend) => {
            const isSelected = selectedFriends.includes(friend.user_id);
            return (
              <Pressable
                key={friend.user_id}
                style={[styles.friendItem, isSelected && styles.friendItemSelected]}
                onPress={() => toggleFriend(friend.user_id)}
              >
                <View style={styles.friendAvatar}>
                  {friend.profile_photo ? (
                    <Image
                      source={{ uri: friend.profile_photo }}
                      style={styles.friendAvatarImage}
                    />
                  ) : (
                    <Text style={styles.friendAvatarText}>
                      {friend.name?.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  {friend.location && (
                    <Text style={styles.friendLocation}>{friend.location}</Text>
                  )}
                </View>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* Start Call Button */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.startButton, selectedFriends.length === 0 && styles.startButtonDisabled]}
          onPress={handleStartCall}
          disabled={selectedFriends.length === 0 || starting}
        >
          <LinearGradient
            colors={selectedFriends.length > 0 ? ["#000000", "#FFD700"] : ["#9ca3af", "#9ca3af"]}
            style={styles.startButtonGradient}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name={callType === "video" ? "videocam" : "call"}
                  size={22}
                  color="#fff"
                />
                <Text style={styles.startButtonText}>
                  {t("call.startCallWith") || "Start Call with"} {selectedFriends.length}{" "}
                  {selectedFriends.length === 1
                    ? t("call.person") || "person"
                    : t("call.people") || "people"}
                </Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
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
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  callTypeSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 12,
  },
  callTypeRow: {
    flexDirection: "row",
    gap: 12,
  },
  callTypeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    borderWidth: 2,
    borderColor: "transparent",
  },
  callTypeBtnActive: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  callTypeText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  callTypeTextActive: {
    color: "#fff",
  },
  groupNameSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  groupNameInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  selectedSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  selectedRow: {
    gap: 8,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  selectedAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  selectedAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  selectedAvatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  selectedName: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
    maxWidth: 80,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  friendsList: {
    flex: 1,
  },
  friendsContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  friendItemSelected: {
    backgroundColor: "#f3f4f6",
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginRight: 12,
  },
  friendAvatarImage: {
    width: 48,
    height: 48,
  },
  friendAvatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6b7280",
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  friendLocation: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxSelected: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  startButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  startButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});

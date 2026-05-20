/**
 * Group Call Screen
 * Supports up to 16 participants with video/voice calls
 * Features: Speaker focus, grid layout, add participants during call
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import {
  getGroupCall,
  joinGroupCall,
  leaveGroupCall,
  endGroupCall,
  addParticipantToGroupCall,
  GroupCallResponse,
  GroupCallParticipant,
  getMyFriends,
  UserPublic,
} from "../lib/api";

const { width, height } = Dimensions.get("window");

export default function GroupCallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken, user } = useAuth();
  const params = useLocalSearchParams<{ groupCallId: string; type?: string }>();
  const { groupCallId, type } = params;

  const [loading, setLoading] = useState(true);
  const [callData, setCallData] = useState<GroupCallResponse | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "speaker">("speaker");
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [friends, setFriends] = useState<UserPublic[]>([]);
  const [addingParticipant, setAddingParticipant] = useState(false);

  // Load call data
  useEffect(() => {
    if (!sessionToken || !groupCallId) return;

    const loadCall = async () => {
      try {
        const data = await getGroupCall(sessionToken, groupCallId);
        setCallData(data);
        
        // Set host as initial active speaker
        if (data.host_id) {
          setActiveSpeaker(data.host_id);
        }
      } catch (e) {
        console.log("Failed to load call:", e);
        Alert.alert(
          t("call.error") || "Error",
          t("call.callNotFound") || "Call not found or expired"
        );
        router.back();
      } finally {
        setLoading(false);
      }
    };

    loadCall();
  }, [sessionToken, groupCallId]);

  // Load friends for adding participants
  const loadFriends = async () => {
    if (!sessionToken) return;
    try {
      const data = await getMyFriends(sessionToken);
      // Filter out users already in the call
      const existingIds = callData?.participants.map(p => p.user_id) || [];
      existingIds.push(callData?.host_id || "");
      const available = data.filter(f => !existingIds.includes(f.user_id));
      setFriends(available);
    } catch (e) {
      console.log("Failed to load friends:", e);
    }
  };

  // Handle adding participant
  const handleAddParticipant = async (userId: string) => {
    if (!sessionToken || !groupCallId) return;
    
    setAddingParticipant(true);
    try {
      const result = await addParticipantToGroupCall(sessionToken, groupCallId, userId);
      Alert.alert(
        t("call.participantAdded") || "Added",
        t("call.participantAddedDesc") || "Participant has been invited"
      );
      // Refresh call data
      const data = await getGroupCall(sessionToken, groupCallId);
      setCallData(data);
      setShowAddParticipant(false);
      loadFriends();
    } catch (e: any) {
      Alert.alert(
        t("call.error") || "Error",
        e.message || t("call.failedToAddParticipant") || "Failed to add participant"
      );
    } finally {
      setAddingParticipant(false);
    }
  };

  // Handle leaving call
  const handleLeave = async () => {
    if (!sessionToken || !groupCallId) return;
    
    try {
      await leaveGroupCall(sessionToken, groupCallId);
      router.back();
    } catch (e) {
      console.log("Failed to leave call:", e);
      router.back();
    }
  };

  // Handle ending call (host only)
  const handleEndCall = async () => {
    if (!sessionToken || !groupCallId) return;
    
    Alert.alert(
      t("call.endCall") || "End Call",
      t("call.endCallConfirm") || "This will end the call for everyone. Continue?",
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        {
          text: t("call.endCall") || "End Call",
          style: "destructive",
          onPress: async () => {
            try {
              await endGroupCall(sessionToken, groupCallId);
              router.back();
            } catch (e) {
              console.log("Failed to end call:", e);
              router.back();
            }
          },
        },
      ]
    );
  };

  const isHost = callData?.host_id === user?.user_id;
  const joinedParticipants = callData?.participants.filter(p => p.status === "joined") || [];
  const allParticipants = [
    // Add host as first participant
    callData ? {
      user_id: callData.host_id,
      name: callData.host_name,
      profile_photo: undefined,
      uid: callData.host_uid,
      status: "joined" as const,
      isHost: true,
    } : null,
    ...joinedParticipants.map(p => ({ ...p, isHost: false })),
  ].filter(Boolean);

  // Grid layout calculation
  const getGridDimensions = (count: number) => {
    if (count <= 1) return { cols: 1, rows: 1 };
    if (count <= 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: 4 };
  };

  const gridDimensions = getGridDimensions(allParticipants.length);
  const cellWidth = (width - 32) / gridDimensions.cols;
  const cellHeight = viewMode === "grid" 
    ? (height - 250) / gridDimensions.rows 
    : 100;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#000000" />
          <Text style={styles.loadingText}>{t("call.connecting") || "Connecting..."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.callInfo}>
          <Text style={styles.callTitle}>
            {callData?.group_name || t("call.groupCall") || "Group Call"}
          </Text>
          <Text style={styles.callSubtitle}>
            {allParticipants.length} {t("call.participants") || "participants"}
          </Text>
        </View>
        
        <View style={styles.viewModeToggle}>
          <Pressable
            style={[styles.viewModeBtn, viewMode === "speaker" && styles.viewModeBtnActive]}
            onPress={() => setViewMode("speaker")}
          >
            <Ionicons 
              name="person" 
              size={18} 
              color={viewMode === "speaker" ? "#fff" : "#6b7280"} 
            />
          </Pressable>
          <Pressable
            style={[styles.viewModeBtn, viewMode === "grid" && styles.viewModeBtnActive]}
            onPress={() => setViewMode("grid")}
          >
            <Ionicons 
              name="grid" 
              size={18} 
              color={viewMode === "grid" ? "#fff" : "#6b7280"} 
            />
          </Pressable>
        </View>
      </View>

      {/* Main Video Area */}
      <View style={styles.videoArea}>
        {viewMode === "speaker" ? (
          // Speaker Focus View
          <>
            {/* Main Speaker */}
            <View style={styles.mainSpeaker}>
              <LinearGradient
                colors={["#1e3a8a", "#3b82f6"]}
                style={styles.videoPlaceholder}
              >
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarTextLarge}>
                    {callData?.host_name?.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.speakerName}>
                  {callData?.host_name} {isHost ? `(${t("call.you") || "You"})` : `(${t("call.host") || "Host"})`}
                </Text>
                {callData?.call_type === "voice" && (
                  <View style={styles.voiceCallIndicator}>
                    <Ionicons name="mic" size={32} color="#000000" />
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* Participant Thumbnails */}
            <ScrollView 
              horizontal 
              style={styles.thumbnailRow}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailContent}
            >
              {joinedParticipants.map((participant) => (
                <Pressable
                  key={participant.user_id}
                  style={[
                    styles.thumbnail,
                    activeSpeaker === participant.user_id && styles.thumbnailActive,
                  ]}
                  onPress={() => setActiveSpeaker(participant.user_id)}
                >
                  <View style={styles.thumbnailAvatar}>
                    {participant.profile_photo ? (
                      <Image
                        source={{ uri: participant.profile_photo }}
                        style={styles.thumbnailImage}
                      />
                    ) : (
                      <Text style={styles.thumbnailInitial}>
                        {participant.name?.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.thumbnailName} numberOfLines={1}>
                    {participant.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : (
          // Grid View
          <View style={styles.gridContainer}>
            {allParticipants.map((participant: any, index) => (
              <View
                key={participant?.user_id || index}
                style={[
                  styles.gridCell,
                  { width: cellWidth - 8, height: cellHeight - 8 },
                ]}
              >
                <LinearGradient
                  colors={participant?.isHost ? ["#1e3a8a", "#3b82f6"] : ["#374151", "#4b5563"]}
                  style={styles.gridCellContent}
                >
                  {participant?.profile_photo ? (
                    <Image
                      source={{ uri: participant.profile_photo }}
                      style={styles.gridAvatar}
                    />
                  ) : (
                    <View style={styles.gridAvatarPlaceholder}>
                      <Text style={styles.gridAvatarText}>
                        {participant?.name?.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.gridName} numberOfLines={1}>
                    {participant?.name}
                    {participant?.isHost && ` (${t("call.host") || "Host"})`}
                  </Text>
                </LinearGradient>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Call Controls */}
      <View style={styles.controls}>
        <Pressable
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={() => setIsMuted(!isMuted)}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={24}
            color={isMuted ? "#ef4444" : "#fff"}
          />
          <Text style={styles.controlLabel}>
            {isMuted ? t("call.unmute") || "Unmute" : t("call.mute") || "Mute"}
          </Text>
        </Pressable>

        {callData?.call_type === "video" && (
          <Pressable
            style={[styles.controlBtn, isVideoOff && styles.controlBtnActive]}
            onPress={() => setIsVideoOff(!isVideoOff)}
          >
            <Ionicons
              name={isVideoOff ? "videocam-off" : "videocam"}
              size={24}
              color={isVideoOff ? "#ef4444" : "#fff"}
            />
            <Text style={styles.controlLabel}>
              {isVideoOff ? t("call.cameraOn") || "Camera On" : t("call.cameraOff") || "Camera Off"}
            </Text>
          </Pressable>
        )}

        {isHost && (
          <Pressable
            style={styles.controlBtn}
            onPress={() => {
              loadFriends();
              setShowAddParticipant(true);
            }}
          >
            <Ionicons name="person-add" size={24} color="#fff" />
            <Text style={styles.controlLabel}>{t("call.addPeople") || "Add"}</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.controlBtn, styles.endCallBtn]}
          onPress={isHost ? handleEndCall : handleLeave}
        >
          <Ionicons name="call" size={24} color="#fff" />
          <Text style={styles.controlLabel}>
            {isHost ? t("call.end") || "End" : t("call.leave") || "Leave"}
          </Text>
        </Pressable>
      </View>

      {/* Add Participant Modal */}
      <Modal
        visible={showAddParticipant}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddParticipant(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("call.addParticipant") || "Add Participant"}</Text>
              <Pressable onPress={() => setShowAddParticipant(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </Pressable>
            </View>

            <Text style={styles.modalSubtitle}>
              {t("call.selectFriend") || "Select a friend to add to the call"}
            </Text>

            {friends.length === 0 ? (
              <View style={styles.emptyFriends}>
                <Text style={styles.emptyText}>
                  {t("call.noAvailableFriends") || "All your friends are already in the call"}
                </Text>
              </View>
            ) : (
              <FlatList
                data={friends}
                keyExtractor={(item) => item.user_id}
                style={styles.friendsList}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.friendItem}
                    onPress={() => handleAddParticipant(item.user_id)}
                    disabled={addingParticipant}
                  >
                    <View style={styles.friendAvatar}>
                      {item.profile_photo ? (
                        <Image
                          source={{ uri: item.profile_photo }}
                          style={styles.friendAvatarImage}
                        />
                      ) : (
                        <Text style={styles.friendAvatarText}>
                          {item.name?.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.friendName}>{item.name}</Text>
                    <Ionicons name="add-circle" size={24} color="#000000" />
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  callInfo: {},
  callTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  callSubtitle: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 2,
  },
  viewModeToggle: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 4,
  },
  viewModeBtn: {
    padding: 8,
    borderRadius: 12,
  },
  viewModeBtnActive: {
    backgroundColor: "rgba(76, 111, 255, 0.8)",
  },
  videoArea: {
    flex: 1,
    padding: 16,
  },
  mainSpeaker: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarTextLarge: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "700",
  },
  speakerName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
  },
  voiceCallIndicator: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 50,
  },
  thumbnailRow: {
    maxHeight: 110,
  },
  thumbnailContent: {
    gap: 12,
    paddingHorizontal: 4,
  },
  thumbnail: {
    alignItems: "center",
    width: 80,
  },
  thumbnailActive: {
    opacity: 1,
  },
  thumbnailAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  thumbnailImage: {
    width: 60,
    height: 60,
  },
  thumbnailInitial: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "600",
  },
  thumbnailName: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  gridContainer: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridCell: {
    borderRadius: 12,
    overflow: "hidden",
  },
  gridCellContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 8,
  },
  gridAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  gridAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  gridAvatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
  },
  gridName: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  controlBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#334155",
  },
  controlBtnActive: {
    backgroundColor: "#475569",
  },
  controlLabel: {
    color: "#fff",
    fontSize: 10,
    marginTop: 4,
  },
  endCallBtn: {
    backgroundColor: "#ef4444",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: "#6b7280",
    fontSize: 14,
    marginBottom: 16,
  },
  emptyFriends: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
    textAlign: "center",
  },
  friendsList: {
    maxHeight: 300,
  },
  friendItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginRight: 12,
  },
  friendAvatarImage: {
    width: 44,
    height: 44,
  },
  friendAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  friendName: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
  },
});

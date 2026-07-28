import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { UserPublicProfile, getUserPublicProfile, getPosts, reportUser, getFriendshipStatus, toggleFriend, sendFriendRequest, cancelFriendRequest, acceptFriendRequest, FriendshipStatus, toggleSaved, checkSaved, APP_URL, getUserActivities, ActivityItem, getUserFriends, FriendProfile } from "../../lib/api";
import { COLORS } from "../../lib/designTokens";
import { useAuth } from "../../context/AuthContext";
import { getUserSellerListings, Listing } from "../../lib/api/listings";

import { UserProfilePremium } from "../../components/profile/UserProfilePremium";

export default function UserProfileScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sessionToken } = useAuth();

  // Main data
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [userActivities, setUserActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Report State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  // Friend Status State
  const [friendStatus, setFriendStatus] = useState<FriendshipStatus>("none");
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  // Save State
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Friends List State
  const [friendProfiles, setFriendProfiles] = useState<FriendProfile[]>([]);

  const [userListings, setUserListings] = useState<Listing[]>([]);
  const listingsRequestRef = useRef(0);

  const loadProfile = useCallback(async () => {
    if (!sessionToken || !id) return;
    const listingsRequestId = ++listingsRequestRef.current;
    setUserListings([]);
    setLoading(true);
    setError(null);
    try {
      const data = await getUserPublicProfile(sessionToken, id);
      setProfile(data);
      
      setUserPosts(data.posts || []);
      
      try {
        const { is_saved } = await checkSaved(sessionToken, "user", id);
        setIsSaved(is_saved);
      } catch (e) {
        console.log("Check saved failed:", e);
      }

      try {
        const activities = await getUserActivities(sessionToken, id);
        setUserActivities(activities);
      } catch (e) {
        console.log("Failed to load user activities:", e);
      }

      try {
        const listings = await getUserSellerListings(id);
        if (listingsRequestId === listingsRequestRef.current) {
          setUserListings(listings);
        }
      } catch {
        if (listingsRequestId === listingsRequestRef.current) {
          setUserListings([]);
        }
      }

      try {
        const friendsData = await getUserFriends(sessionToken, id);
        setFriendProfiles(friendsData);
      } catch (e) {
        console.log("Failed to load user friends:", e);
      }
      
      // Track profile view analytics
      try {
        const { trackProfileView } = await import("../../lib/api");
        await trackProfileView(sessionToken, id);
      } catch (e) {
        console.log("Analytics tracking skipped");
      }
    } catch (error) {
      console.error("Failed to load user profile:", error);
      setError(t("userProfile.failedToLoad"));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, id, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadFriendStatus()]);
    setRefreshing(false);
  };

  const loadFriendStatus = useCallback(async () => {
    if (!sessionToken || !id) return;
    try {
      const data = await getFriendshipStatus(sessionToken, "user", id);
      setFriendStatus(data.status);
      setFriendRequestId(data.request_id);
    } catch (error) {
      console.error("Failed to load friend status:", error);
      setFriendStatus("none");
    }
  }, [sessionToken, id]);

  useEffect(() => {
    loadProfile();
    loadFriendStatus();
  }, [loadProfile, loadFriendStatus]);

  const handleFriendPress = async () => {
    if (!sessionToken || !id) return;
    setFriendActionLoading(true);
    try {
      if (friendStatus === "none") {
        const result = await sendFriendRequest(sessionToken, "user", id);
        setFriendStatus("request_sent");
        if (result.request_id) setFriendRequestId(result.request_id);
        Alert.alert(t("common.success") || "Success", `Friend request sent to ${profile?.user.name}`);
      } else if (friendStatus === "request_sent") {
        if (friendRequestId) {
          await cancelFriendRequest(sessionToken, friendRequestId);
        }
        setFriendStatus("none");
        setFriendRequestId(null);
      } else if (friendStatus === "friends") {
        Alert.alert(
          t("profile.removeFriend"),
          `Remove ${profile?.user.name} from friends?`,
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("profile.removeFriend"),
              style: "destructive",
              onPress: async () => {
                try {
                  await toggleFriend(sessionToken, "user", id);
                  setFriendStatus("none");
                  setFriendRequestId(null);
                } catch (error) {
                  console.error("Failed to remove friend:", error);
                }
              },
            },
          ]
        );
      } else if (friendStatus === "request_received") {
        if (friendRequestId) {
          await acceptFriendRequest(sessionToken, friendRequestId);
          setFriendStatus("friends");
          setFriendRequestId(null);
          Alert.alert(t("common.success") || "Success", `You are now friends with ${profile?.user.name}`);
        }
      }
    } catch (error) {
      console.error("Friend action failed:", error);
      Alert.alert(t("common.error") || "Error", "Failed to send friend request. Please try again.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleMessagePress = () => {
    router.push({
      pathname: "/messages/[id]",
      params: { id: id, name: profile?.user.name },
    });
  };

  const handleShareProfile = () => {
    const url = `${APP_URL}/user/${id}`;
    Share.share({ message: url, url });
  };

  const handleReportUser = async () => {
    if (!sessionToken || !id || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      await reportUser(sessionToken, id, reportReason.trim());
      setReportModalVisible(false);
      setReportReason("");
      Alert.alert(
        t("userProfile.reportSubmitted") || "Report Submitted",
        t("userProfile.reportMessage") || "Thank you for your report. Our team will review it shortly.",
        [{ text: t("common.ok"), onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error("Failed to report:", error);
      Alert.alert(t("common.error"), error.message || t("common.error"));
    } finally {
      setReportLoading(false);
    }
  };

  const handleToggleSave = async () => {
    if (!sessionToken) {
      Alert.alert(
        t("common.loginRequired") || "Login Required",
        t("common.loginToSave") || "Please log in to save items",
        [
          { text: t("common.cancel") || "Cancel", style: "cancel" },
          { text: t("auth.login") || "Login", onPress: () => router.push("/login") },
        ]
      );
      return;
    }
    if (!id) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "user", id);
      setIsSaved(is_saved);
    } catch (error) {
      console.error("Failed to toggle save:", error);
      Alert.alert(t("common.error"), t("common.pleaseTryAgain"));
    } finally {
      setSavingItem(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.centered}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primaryDark} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error || t("userProfile.userNotFound")}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            setError(null);
            setLoading(true);
            loadProfile();
          }}
        >
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 44 : 0}
      >
      <View style={{ flex: 1, ...Platform.select({ web: { width: "100%", maxWidth: 914, alignSelf: "center" } as any, default: {} }) }}>
        <Pressable style={styles.backButtonRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primaryDark} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>

        <UserProfilePremium
          user={profile.user}
          displayName={profile.user.name || ""}
          setDisplayName={() => {}}
          bio={profile.user.bio || ""}
          setBio={() => {}}
          location={profile.user.location || ""}
          setLocation={() => {}}
          savingInfo={false}
          handleSaveProfileInfo={() => {}}
          friends={friendProfiles}
          setInviteModalVisible={() => {}}
          galleryImages={profile.user.gallery_images || []}
          galleryVideos={profile.user.gallery_videos || []}
          galleryItems={profile.user.gallery_items || []}
          handleAddPhoto={() => {}}
          openCaptionEdit={() => {}}
          handleDeleteGalleryItem={() => {}}
          getCaptionForUrl={() => ""}
          sessionToken={sessionToken || ""}
          themeModalVisible={false}
          setThemeModalVisible={() => {}}
          refreshUser={onRefresh}
          handleUpdateProfileGallery={() => {}}
          handleUpdateProfilePhoto={() => {}}
          handleUpdateCoverPhoto={() => {}}
          readOnly={true}
          userPosts={userPosts}
          userActivities={userActivities}
          openActivityModal={() => {}}
          handleEditActivity={() => {}}
          handleDeleteActivity={() => {}}
          postText=""
          setPostText={() => {}}
          postImage={null}
          postVideo={null}
          postVideoPreview={null}
          pickPostImage={() => {}}
          pickPostVideo={() => {}}
          handleCreatePost={() => {}}
          isOwnProfile={false}
          refreshing={refreshing}
          friendStatus={friendStatus}
          onFriendPress={handleFriendPress}
          showMessageButton={true}
          onMessagePress={handleMessagePress}
          onShare={handleShareProfile}
          onSavePress={handleToggleSave}
          isSaved={isSaved}
          savingItem={savingItem}
          onViewFriends={() => router.push(`/friends/${id}` as any)}
          slug={id}
          avatarUri={profile.user.profile_photo || profile.user.picture || null}
          userListings={userListings}
        />
      </View>

      {/* Report Modal */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>{t("userProfile.reportUser")}</Text>
              <Pressable onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </Pressable>
            </View>
            <Text style={styles.reportModalDescription}>
              {t("userProfile.reportDescription")}
            </Text>
            <TextInput
              style={styles.reportInput}
              placeholder={t("userProfile.reportPlaceholder")}
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Pressable
              style={[
                styles.reportSubmitButton,
                !reportReason.trim() && styles.reportSubmitButtonDisabled,
              ]}
              onPress={handleReportUser}
              disabled={!reportReason.trim() || reportLoading}
            >
              {reportLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.reportSubmitButtonText}>
                  {t("userProfile.submitReport")}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  backButtonRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginVertical: 8 },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { color: COLORS.primaryDark, fontWeight: "600", marginLeft: 4 },
  errorText: { color: "#ef4444", fontSize: 16, fontWeight: "600", marginTop: 16, textAlign: "center" },
  retryButton: { backgroundColor: COLORS.primaryDark, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, marginTop: 16 },
  retryButtonText: { color: "#fff", fontWeight: "600" },
  reportModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  reportModalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400 },
  reportModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  reportModalTitle: { fontSize: 18, fontWeight: "700", color: "#1f2937" },
  reportModalDescription: { fontSize: 14, color: "#666", marginBottom: 16, lineHeight: 20 },
  reportInput: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, fontSize: 15, color: "#1f2937", minHeight: 100, textAlignVertical: "top", marginBottom: 16 },
  reportSubmitButton: { backgroundColor: "#ef4444", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  reportSubmitButtonDisabled: { backgroundColor: "#fca5a5" },
  reportSubmitButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

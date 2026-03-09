import { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import AdaptiveImage from "../../components/AdaptiveImage";
import ShareContent from "../../components/ShareContent";
import { useSafeNavigation } from "../../hooks/useSafeNavigation";
import {
  addPostComment,
  ActivityItem,
  deletePostComment,
  EventItem,
  getPostComments,
  getCommonFriends,
  getUserAttendance,
  getUserPublicProfile,
  Post,
  PostComment,
  updatePostComment,
  toggleFriend,
  togglePostLike,
  UserPublicProfile,
  pauseUser,
  unpauseUser,
  checkIfPaused,
  reportUser,
  getFriendshipStatus,
  sendFriendRequest,
  acceptFriendRequest,
  cancelFriendRequest,
  ProfileTheme,
} from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function UserProfileScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { safeGoBack, router } = useSafeNavigation();
  const { sessionToken, activeIdentity, user } = useAuth();
  const [profile, setProfile] = useState<UserPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentModal, setCommentModal] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [friendList, setFriendList] = useState<
    { user_id: string; name: string; profile_photo?: string | null }[]
  >([]);
  const [isFriend, setIsFriend] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<"friends" | "request_sent" | "request_received" | "none">("none");
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [attendance, setAttendance] = useState<{
    activities: ActivityItem[];
    events: EventItem[];
  }>({ activities: [], events: [] });
  
  // Gallery viewer state
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);

  // Get theme colors from profile (with defaults)
  const userTheme = useMemo(() => {
    const theme = profile?.user?.theme;
    return {
      backgroundColor: theme?.background_color || '#ffffff',
      primaryColor: theme?.primary_color || '#4c6fff',
      secondaryColor: theme?.secondary_color || '#f3f4f6',
      textColor: theme?.text_color || '#111827',
      cardColor: theme?.card_color || theme?.secondary_color || '#f9fafb',
      gradientStart: theme?.gradient_start || null,
      gradientEnd: theme?.gradient_end || null,
      useGradient: theme?.use_gradient || false,
      hasCustomTheme: !!theme?.background_color,
    };
  }, [profile?.user?.theme]);

  const openImageViewer = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageViewerVisible(true);
  };

  const openVideoViewer = (videoUrl: string) => {
    setSelectedVideo(videoUrl);
    setVideoViewerVisible(true);
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (!sessionToken || !id) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getUserPublicProfile(
          sessionToken,
          id,
          activeIdentity
            ? { type: activeIdentity.type, id: activeIdentity.id }
            : undefined
        );
        setProfile(data);
        
        // Load friends data separately - don't fail if this fails
        try {
          const friendsData = await getCommonFriends(sessionToken, id);
          setFriendList(friendsData.common);
          setIsFriend(friendsData.is_friend);
        } catch (e) {
          console.log("Friends data fetch failed:", e);
        }
        
        // Load friendship status (request sent, received, etc.)
        try {
          const statusData = await getFriendshipStatus(sessionToken, id);
          setFriendshipStatus(statusData.status);
          setFriendRequestId(statusData.request_id);
          setIsFriend(statusData.status === "friends");
        } catch (e) {
          console.log("Friendship status check failed:", e);
        }
        
        // Check if user is paused
        try {
          const pauseStatus = await checkIfPaused(sessionToken, id);
          setIsPaused(pauseStatus.is_paused);
        } catch (e) {
          console.log("Pause status check failed:", e);
        }
        
        // Load attendance data separately
        try {
          const attendanceData = await getUserAttendance(sessionToken, id);
          setAttendance(attendanceData);
        } catch (e) {
          console.log("Attendance fetch failed:", e);
        }
      } catch (error) {
        console.error("Failed to load user profile:", error);
        setError(t('userProfile.failedToLoad'));
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [sessionToken, id, activeIdentity]);

  const handleFriendAction = async () => {
    if (!sessionToken || !id || friendActionLoading) return;
    setFriendActionLoading(true);
    
    try {
      if (friendshipStatus === "none") {
        // Send friend request
        const result = await sendFriendRequest(sessionToken, id);
        if (result.status === "accepted") {
          // The other user had already sent us a request - now we're friends
          setFriendshipStatus("friends");
          setIsFriend(true);
          Alert.alert(
            t("friends.success") || "Success!",
            t("friends.nowFriends") || "You are now friends!"
          );
        } else {
          setFriendshipStatus("request_sent");
          setFriendRequestId(result.request_id);
          Alert.alert(
            t("friends.requestSent") || "Request Sent",
            t("friends.requestSentDesc") || "Friend request has been sent"
          );
        }
      } else if (friendshipStatus === "request_sent" && friendRequestId) {
        // Cancel friend request
        await cancelFriendRequest(sessionToken, friendRequestId);
        setFriendshipStatus("none");
        setFriendRequestId(null);
      } else if (friendshipStatus === "request_received" && friendRequestId) {
        // Accept friend request
        await acceptFriendRequest(sessionToken, friendRequestId);
        setFriendshipStatus("friends");
        setIsFriend(true);
        Alert.alert(
          t("friends.success") || "Success!",
          t("friends.nowFriends") || "You are now friends!"
        );
      } else if (friendshipStatus === "friends") {
        // Unfriend - use old toggle method
        const result = await toggleFriend(sessionToken, id);
        if (!result.is_friend) {
          setFriendshipStatus("none");
          setIsFriend(false);
        }
      }
      
      // Refresh friends data
      try {
        const friendsData = await getCommonFriends(sessionToken, id);
        setFriendList(friendsData.common);
      } catch (e) {
        console.log("Failed to refresh friends data");
      }
    } catch (error: any) {
      Alert.alert(t("common.error"), error.message || t("common.pleaseTryAgain"));
    }
    setFriendActionLoading(false);
  };

  // Get friend button text and style based on status
  const getFriendButtonConfig = () => {
    switch (friendshipStatus) {
      case "friends":
        return { 
          text: t("friends.friends") || "Friends", 
          icon: "checkmark-circle" as const,
          style: "friends" 
        };
      case "request_sent":
        return { 
          text: t("friends.requestSent") || "Request Sent", 
          icon: "time" as const,
          style: "pending" 
        };
      case "request_received":
        return { 
          text: t("friends.acceptRequest") || "Accept Request", 
          icon: "person-add" as const,
          style: "accept" 
        };
      default:
        return { 
          text: t("friends.addFriend") || "Add Friend", 
          icon: "person-add-outline" as const,
          style: "add" 
        };
    }
  };

  const friendButtonConfig = getFriendButtonConfig();

  const handleTogglePause = async () => {
    if (!sessionToken || !id) return;
    try {
      if (isPaused) {
        await unpauseUser(sessionToken, id);
        setIsPaused(false);
      } else {
        await pauseUser(sessionToken, id);
        setIsPaused(true);
      }
    } catch (error) {
      console.error("Failed to toggle pause:", error);
    }
  };

  const handleReport = async () => {
    if (!sessionToken || !id || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      await reportUser(sessionToken, id, reportReason.trim());
      setReportModalVisible(false);
      setReportReason("");
      // Navigate away since user is now hidden
      safeGoBack();
    } catch (error: any) {
      console.error("Failed to report:", error);
      alert(error.message || t("common.error"));
    } finally {
      setReportLoading(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    if (!sessionToken) return;
    const actor = activeIdentity
      ? { type: activeIdentity.type, id: activeIdentity.id }
      : undefined;
    const updated = await togglePostLike(sessionToken, post.post_id, actor);
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((item) =>
              item.post_id === updated.post_id ? updated : item
            ),
          }
        : prev
    );
  };

  const openComments = async (post: Post) => {
    if (!sessionToken) return;
    setCommentLoading(true);
    setCommentPost(post);
    setCommentModal(true);
    const data = await getPostComments(sessionToken, post.post_id);
    setComments(data);
    setCommentLoading(false);
  };

  const handleAddComment = async () => {
    if (!sessionToken || !commentPost || !commentText.trim()) return;
    const actor = activeIdentity
      ? { type: activeIdentity.type, id: activeIdentity.id }
      : undefined;
    let updated: Post;
    if (editingCommentId) {
      updated = await updatePostComment(
        sessionToken,
        commentPost.post_id,
        editingCommentId,
        commentText.trim()
      );
    } else {
      updated = await addPostComment(
        sessionToken,
        commentPost.post_id,
        commentText.trim(),
        actor
      );
    }
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((item) =>
              item.post_id === updated.post_id ? updated : item
            ),
          }
        : prev
    );
    const data = await getPostComments(sessionToken, commentPost.post_id);
    setComments(data);
    setCommentText("");
    setEditingCommentId(null);
  };

  const handleEditComment = (comment: PostComment) => {
    setEditingCommentId(comment.comment_id);
    setCommentText(comment.text);
  };

  const handleDeleteComment = async (comment: PostComment) => {
    if (!sessionToken || !commentPost) return;
    const updated = await deletePostComment(
      sessionToken,
      commentPost.post_id,
      comment.comment_id
    );
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            posts: prev.posts.map((item) =>
              item.post_id === updated.post_id ? updated : item
            ),
          }
        : prev
    );
    const data = await getPostComments(sessionToken, commentPost.post_id);
    setComments(data);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#4c6fff" />
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={styles.centered}>
        <Pressable style={styles.backButton} onPress={() => safeGoBack()}>
          <Ionicons name="chevron-back" size={20} color="#4c6fff" />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error || t('userProfile.userNotFound')}</Text>
        <Pressable style={styles.retryButton} onPress={() => {
          setError(null);
          setLoading(true);
        }}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[
      styles.container,
      userTheme.hasCustomTheme && { backgroundColor: userTheme.backgroundColor }
    ]}>
      {/* Theme Gradient Background */}
      {userTheme.useGradient && userTheme.gradientStart && userTheme.gradientEnd && (
        <LinearGradient
          colors={[userTheme.gradientStart, userTheme.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
      )}
      
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backButton} onPress={() => safeGoBack()}>
          <Ionicons name="chevron-back" size={20} color={userTheme.hasCustomTheme ? userTheme.primaryColor : "#4c6fff"} />
          <Text style={[styles.backText, userTheme.hasCustomTheme && { color: userTheme.primaryColor }]}>{t('common.back')}</Text>
        </Pressable>
        <View style={styles.coverWrapper}>
          {profile.user.cover_photo ? (
            <Image source={{ uri: profile.user.cover_photo }} style={styles.coverPhoto} />
          ) : (
            <View style={[styles.coverPlaceholder, userTheme.hasCustomTheme && { backgroundColor: userTheme.secondaryColor }]}>
              <Text style={[styles.coverPlaceholderText, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{t('userProfile.noCoverPhoto')}</Text>
            </View>
          )}
          <View style={[styles.avatarWrapper, userTheme.hasCustomTheme && { borderColor: userTheme.primaryColor }]}>
            {profile.user.profile_photo ? (
              <Image source={{ uri: profile.user.profile_photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarFallback, userTheme.hasCustomTheme && { backgroundColor: userTheme.primaryColor }]}>
                <Text style={styles.avatarText}>
                  {profile.user.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>
        <Text style={[styles.name, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{profile.user.name}</Text>
        {profile.user.bio ? <Text style={[styles.bio, userTheme.hasCustomTheme && { color: userTheme.textColor, opacity: 0.8 }]}>{profile.user.bio}</Text> : null}
        {profile.user.location ? (
          <Text style={[styles.location, userTheme.hasCustomTheme && { color: userTheme.textColor, opacity: 0.7 }]}>{profile.user.location}</Text>
        ) : null}

        <View style={[styles.card, userTheme.hasCustomTheme && { backgroundColor: userTheme.cardColor }]}>
          <Text style={[styles.cardTitle, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{t('userProfile.connections')}</Text>
          <View style={styles.actionButtonsRow}>
            {/* Premium Friend Request Button */}
            {id !== user?.user_id && (
              <Pressable 
                style={[
                  styles.premiumButton,
                  friendButtonConfig.style === "friends" && styles.friendActiveButton,
                  friendButtonConfig.style === "pending" && styles.friendPendingButton,
                  friendButtonConfig.style === "accept" && styles.friendAcceptButton,
                  friendButtonConfig.style === "add" && styles.friendRequestButton,
                ]} 
                onPress={handleFriendAction}
                disabled={friendActionLoading}
              >
                {friendActionLoading ? (
                  <ActivityIndicator size="small" color="#4c6fff" style={{ marginRight: 8 }} />
                ) : (
                  <View style={styles.premiumButtonIcon}>
                    <Ionicons 
                      name={friendButtonConfig.icon} 
                      size={18} 
                      color={
                        friendButtonConfig.style === "friends" ? "#10b981" : 
                        friendButtonConfig.style === "pending" ? "#f59e0b" :
                        friendButtonConfig.style === "accept" ? "#4c6fff" : "#4c6fff"
                      } 
                    />
                  </View>
                )}
                <Text style={[
                  styles.premiumButtonText,
                  friendButtonConfig.style === "friends" && styles.friendActiveText,
                  friendButtonConfig.style === "pending" && styles.friendPendingText,
                  friendButtonConfig.style === "accept" && styles.friendAcceptText,
                  friendButtonConfig.style === "add" && styles.friendRequestText,
                ]}>
                  {friendButtonConfig.text}
                </Text>
              </Pressable>
            )}
            {/* Premium Message Button - Only for friends (artists can be messaged without being friends) */}
            {id !== user?.user_id && (
              <Pressable 
                style={[
                  styles.premiumButton, 
                  styles.messageButtonPremium,
                  !isFriend && styles.messageButtonDisabled
                ]} 
                onPress={() => {
                  if (!isFriend) {
                    Alert.alert(
                      t('userProfile.friendsOnly') || "Friends Only",
                      t('userProfile.mustBeFriendsToMessage') || "You must be friends to send messages"
                    );
                    return;
                  }
                  router.push({
                    pathname: "/(tabs)/messages/[id]",
                    params: { id: id!, name: profile.user.name }
                  });
                }}
              >
                <View style={[styles.premiumButtonIconMessage, !isFriend && { backgroundColor: "#9ca3af" }]}>
                  <Ionicons name="chatbubble" size={18} color="#fff" />
                </View>
                <Text style={[styles.premiumButtonTextMessage, !isFriend && { color: "#9ca3af" }]}>
                  {t('userProfile.message')}
                </Text>
                {!isFriend && <Ionicons name="lock-closed" size={12} color="#9ca3af" style={{ marginLeft: 4 }} />}
              </Pressable>
            )}
          </View>
          
          {/* Call Buttons - Only enabled if friends */}
          <View style={styles.callButtonsRow}>
            <Pressable
              style={[
                styles.callButtonPremium,
                !isFriend && styles.callButtonDisabled
              ]}
              onPress={() => {
                if (!isFriend) {
                  Alert.alert(
                    t('userProfile.friendsOnly') || "Friends Only",
                    t('userProfile.mustBeFriendsToCall') || "You must be friends to make calls"
                  );
                  return;
                }
                router.push({
                  pathname: "/call",
                  params: {
                    userId: id,
                    userName: profile?.user.name,
                    userPhoto: profile?.user.profile_photo || profile?.user.picture,
                    callType: "voice",
                    mode: "outgoing",
                  },
                });
              }}
            >
              <Ionicons name="call" size={18} color={isFriend ? "#4c6fff" : "#9ca3af"} />
              <Text style={[styles.callButtonText, !isFriend && styles.callButtonTextDisabled]}>
                {t('userProfile.voiceCall')}
              </Text>
              {!isFriend && <Ionicons name="lock-closed" size={12} color="#9ca3af" style={{ marginLeft: 4 }} />}
            </Pressable>
            <Pressable
              style={[
                styles.callButtonPremium,
                !isFriend && styles.callButtonDisabled
              ]}
              onPress={() => {
                if (!isFriend) {
                  Alert.alert(
                    t('userProfile.friendsOnly') || "Friends Only",
                    t('userProfile.mustBeFriendsToCall') || "You must be friends to make video calls"
                  );
                  return;
                }
                router.push({
                  pathname: "/call",
                  params: {
                    userId: id,
                    userName: profile?.user.name,
                    userPhoto: profile?.user.profile_photo || profile?.user.picture,
                    callType: "video",
                    mode: "outgoing",
                  },
                });
              }}
            >
              <Ionicons name="videocam" size={18} color={isFriend ? "#4c6fff" : "#9ca3af"} />
              <Text style={[styles.callButtonText, !isFriend && styles.callButtonTextDisabled]}>
                {t('userProfile.videoCall')}
              </Text>
              {!isFriend && <Ionicons name="lock-closed" size={12} color="#9ca3af" style={{ marginLeft: 4 }} />}
            </Pressable>
            {/* Share Profile Button */}
            <Pressable
              style={styles.callButtonPremium}
              onPress={() => setShareModalVisible(true)}
            >
              <Ionicons name="share-social" size={18} color="#4c6fff" />
              <Text style={styles.callButtonText}>{t('common.share')}</Text>
            </Pressable>
            
            {/* Pause Button */}
            {user?.user_id !== id && (
              <Pressable
                style={[styles.callButton, isPaused && { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}
                onPress={handleTogglePause}
              >
                <Ionicons name={isPaused ? "play" : "pause"} size={18} color={isPaused ? "#ef4444" : "#f59e0b"} />
                <Text style={[styles.callButtonText, isPaused && { color: "#ef4444" }]}>
                  {isPaused ? t('userProfile.unpause') : t('userProfile.pause')}
                </Text>
              </Pressable>
            )}
            
            {/* Report Button */}
            {user?.user_id !== id && (
              <Pressable
                style={[styles.callButton, { borderColor: "#fecaca" }]}
                onPress={() => setReportModalVisible(true)}
              >
                <Ionicons name="flag" size={18} color="#ef4444" />
                <Text style={[styles.callButtonText, { color: "#ef4444" }]}>{t('userProfile.report')}</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.sectionLabel}>{t('userProfile.commonFriends')}</Text>
          {friendList.length === 0 ? (
            <Text style={styles.emptyText}>{t('userProfile.noCommonFriends')}</Text>
          ) : (
            <View style={styles.friendRow}>
              {friendList.map((friend) => (
                <View key={friend.user_id} style={styles.friendChip}>
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
                  <Text style={styles.friendName}>{friend.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {((attendance?.activities?.length ?? 0) > 0 || (attendance?.events?.length ?? 0) > 0) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('userProfile.attending')}</Text>
            {(attendance?.activities?.length ?? 0) > 0 && (
              <>
                <Text style={styles.sectionLabel}>{t('userProfile.activities')}</Text>
                {attendance.activities.slice(0, 3).map((activity) => (
                  <View key={activity.activity_id} style={styles.attendanceItem}>
                    <Ionicons name="calendar-outline" size={16} color="#4c6fff" />
                    <View style={styles.attendanceItemContent}>
                      <Text style={styles.attendanceTitle}>{activity.title}</Text>
                      <Text style={styles.attendanceMeta}>
                        {activity.date} · {activity.time}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
            {(attendance?.events?.length ?? 0) > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 12 }]}>{t('userProfile.events')}</Text>
                {attendance.events.slice(0, 3).map((event) => (
                  <View key={event.event_id} style={styles.attendanceItem}>
                    <Ionicons name="ticket-outline" size={16} color="#10b981" />
                    <View style={styles.attendanceItemContent}>
                      <Text style={styles.attendanceTitle}>{event.title}</Text>
                      <Text style={styles.attendanceMeta}>
                        {event.start_time.split("T")[0]} · {event.business?.name || event.artist?.name || "Event"}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        <View style={[styles.card, userTheme.hasCustomTheme && { backgroundColor: userTheme.cardColor }]}>
          <Text style={[styles.cardTitle, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{t('userProfile.stories')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {profile.stories.map((story) => (
              <Image key={story.story_id} source={{ uri: story.image_base64 }} style={styles.storyThumb} />
            ))}
          </ScrollView>
          {profile.stories.length === 0 ? (
            <Text style={[styles.emptyText, userTheme.hasCustomTheme && { color: userTheme.textColor, opacity: 0.5 }]}>{t('userProfile.noStories')}</Text>
          ) : null}
        </View>

        {/* Photo Gallery Section */}
        {(() => {
          const allImages = [
            ...(profile.user.gallery_images || []),
            ...profile.posts.filter(p => p.image_base64).map(p => p.image_base64!)
          ];
          return allImages.length > 0 ? (
            <View style={[styles.card, userTheme.hasCustomTheme && { backgroundColor: userTheme.cardColor }]}>
              <View style={styles.galleryHeader}>
                <View style={styles.galleryTitleRow}>
                  <Ionicons name="images" size={18} color={userTheme.hasCustomTheme ? userTheme.primaryColor : "#4c6fff"} />
                  <Text style={[styles.cardTitle, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{t('userProfile.photoGallery')}</Text>
                </View>
                <Text style={[styles.galleryCount, userTheme.hasCustomTheme && { color: userTheme.textColor, opacity: 0.7 }]}>
                  {allImages.length} {t('userProfile.photos')}
                </Text>
              </View>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {allImages.map((imageUrl, index) => (
                  <Pressable 
                    key={`img-${index}`} 
                    style={styles.galleryItem}
                    onPress={() => openImageViewer(imageUrl)}
                  >
                    <Image source={{ uri: imageUrl }} style={styles.galleryImage} />
                    <View style={styles.zoomIndicator}>
                      <Ionicons name="expand" size={16} color="#fff" />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null;
        })()}

        {/* Video Gallery Section */}
        {(() => {
          const allVideos = [
            ...(profile.user.gallery_videos || []),
            ...profile.posts.filter(p => p.video_url).map(p => p.video_url!)
          ];
          return allVideos.length > 0 ? (
            <View style={[styles.card, userTheme.hasCustomTheme && { backgroundColor: userTheme.cardColor }]}>
              <View style={styles.galleryHeader}>
                <View style={styles.galleryTitleRow}>
                  <Ionicons name="videocam" size={18} color="#ef4444" />
                  <Text style={[styles.cardTitle, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{t('userProfile.videoGallery')}</Text>
                </View>
                <Text style={[styles.galleryCount, userTheme.hasCustomTheme && { color: userTheme.textColor, opacity: 0.7 }]}>
                  {allVideos.length} {t('userProfile.videos')}
                </Text>
              </View>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {allVideos.map((videoUrl, index) => (
                  <Pressable 
                    key={`vid-${index}`} 
                    style={styles.galleryItem}
                    onPress={() => openVideoViewer(videoUrl)}
                  >
                    <AdaptiveVideo
                      uri={videoUrl}
                      style={styles.galleryVideo}
                      autoPlay={false}
                      showMuteButton={false}
                    />
                    <View style={styles.videoOverlay}>
                      <Ionicons name="play-circle" size={40} color="#fff" />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null;
        })()}

        <View style={[styles.card, userTheme.hasCustomTheme && { backgroundColor: userTheme.cardColor }]}>
          <Text style={[styles.cardTitle, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{t('userProfile.posts')}</Text>
          {profile.posts.length === 0 ? (
            <Text style={[styles.emptyText, userTheme.hasCustomTheme && { color: userTheme.textColor, opacity: 0.5 }]}>{t('userProfile.noPosts')}</Text>
          ) : (
            profile.posts.map((post) => (
              <View key={post.post_id} style={[styles.postCard, userTheme.hasCustomTheme && { backgroundColor: userTheme.secondaryColor }]}>
                <View style={styles.postHeaderRow}>
                  <View style={styles.postAvatar}>
                    {post.actor_avatar || post.author.profile_photo ? (
                      <Image
                        source={{
                          uri: (post.actor_avatar || post.author.profile_photo) as string,
                        }}
                        style={styles.postAvatarImage}
                      />
                    ) : (
                      <Text style={styles.postAvatarText}>
                        {(post.actor_name || post.author.name)
                          ?.charAt(0)
                          .toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View>
                    <Text style={[styles.postAuthorText, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>
                      {post.actor_name || post.author.name}
                    </Text>
                    <Text style={[styles.postMetaText, userTheme.hasCustomTheme && { color: userTheme.textColor, opacity: 0.6 }]}>
                      {new Date(post.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.postText, userTheme.hasCustomTheme && { color: userTheme.textColor }]}>{post.text}</Text>
                {post.image_base64 ? (
                  <AdaptiveImage
                    uri={post.image_base64}
                    style={styles.postMedia}
                    ratio={post.media_ratio || undefined}
                  />
                ) : null}
                {post.video_url ? (
                  <AdaptiveVideo
                    uri={post.video_url}
                    style={styles.postMedia}
                    ratio={post.media_ratio || undefined}
                  />
                ) : null}
                <View style={styles.postFooter}>
                  <Pressable style={styles.footerItem} onPress={() => handleToggleLike(post)}>
                    <Ionicons
                      name={post.liked_by_me ? "heart" : "heart-outline"}
                      size={16}
                      color={post.liked_by_me ? "#ef4444" : "#6b7280"}
                    />
                    <Text style={styles.footerText}>{post.likes_count} {t('userProfile.likes')}</Text>
                  </Pressable>
                  <Pressable style={styles.footerItem} onPress={() => openComments(post)}>
                    <Ionicons name="chatbubble-outline" size={16} color="#6b7280" />
                    <Text style={styles.footerText}>{post.comments_count} {t('userProfile.comments')}</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={commentModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('userProfile.comments')}</Text>
            <Pressable onPress={() => setCommentModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.commentHint}>
              {t('userProfile.postingAs')} {activeIdentity?.name || "User"}
            </Text>
            {commentLoading ? (
              <ActivityIndicator color="#4c6fff" />
            ) : (
              comments.map((comment) => (
                <View key={comment.comment_id} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
                    {comment.actor_avatar || comment.author?.profile_photo ? (
                      <Image
                        source={{
                          uri: (comment.actor_avatar || comment.author?.profile_photo) as string,
                        }}
                        style={styles.commentAvatarImage}
                      />
                    ) : (
                      <Text style={styles.commentAvatarText}>
                        {(comment.actor_name || comment.author?.name || "U")
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>
                      {comment.actor_name || comment.author?.name}
                    </Text>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    {comment.user_id === user?.user_id ? (
                      <View style={styles.commentActions}>
                        <Pressable
                          onPress={() => handleEditComment(comment)}
                          style={styles.commentActionButton}
                        >
                          <Text style={styles.commentActionText}>{t('userProfile.editComment')}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteComment(comment)}
                          style={styles.commentActionButton}
                        >
                          <Text style={styles.commentActionText}>{t('userProfile.deleteComment')}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
          <View style={styles.commentInputRow}>
            <TextInput
              placeholder={t('userProfile.addComment')}
              value={commentText}
              onChangeText={setCommentText}
              style={styles.commentInput}
            />
            <Pressable style={styles.commentButton} onPress={handleAddComment}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal 
        visible={imageViewerVisible} 
        animationType="fade"
        transparent={true}
        onRequestClose={() => setImageViewerVisible(false)}
      >
        <View style={styles.viewerOverlay}>
          <Pressable 
            style={styles.viewerCloseButton}
            onPress={() => setImageViewerVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Video Viewer Modal */}
      <Modal 
        visible={videoViewerVisible} 
        animationType="fade"
        transparent={true}
        onRequestClose={() => setVideoViewerVisible(false)}
      >
        <View style={styles.viewerOverlay}>
          <Pressable 
            style={styles.viewerCloseButton}
            onPress={() => setVideoViewerVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedVideo && (
            <View style={styles.viewerVideoContainer}>
              <AdaptiveVideo
                uri={selectedVideo}
                style={styles.viewerVideo}
                autoPlay={true}
                showMuteButton={true}
                isLooping={true}
              />
            </View>
          )}
        </View>
      </Modal>
      
      {/* Report Modal */}
      <Modal
        visible={reportModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>{t('userProfile.reportUser')}</Text>
              <Pressable onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>
            <Text style={styles.reportModalDescription}>
              {t('userProfile.reportDescription')}
            </Text>
            <TextInput
              style={styles.reportInput}
              placeholder={t('userProfile.reportPlaceholder')}
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.reportSubmitButton, !reportReason.trim() && styles.reportSubmitButtonDisabled]}
              onPress={handleReport}
              disabled={!reportReason.trim() || reportLoading}
            >
              {reportLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.reportSubmitButtonText}>{t('userProfile.submitReport')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
      
      {/* Share Profile Modal */}
      {profile && id && (
        <ShareContent
          visible={shareModalVisible}
          onClose={() => setShareModalVisible(false)}
          contentType="profile"
          contentId={id}
          title={profile.user.name}
          description={profile.user.bio || undefined}
          imageUrl={profile.user.profile_photo || undefined}
          extraData={{
            location: profile.user.location || undefined,
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fb",
  },
  content: {
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  backText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 4,
  },
  coverWrapper: {
    marginBottom: 16,
  },
  coverPhoto: {
    width: "100%",
    height: 160,
    borderRadius: 16,
  },
  coverPlaceholder: {
    width: "100%",
    height: 160,
    borderRadius: 16,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholderText: {
    color: "#6b7280",
  },
  avatarWrapper: {
    position: "absolute",
    bottom: -24,
    left: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: "#4c6fff",
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginTop: 24,
  },
  bio: {
    color: "#6b7280",
    marginTop: 6,
  },
  location: {
    color: "#4c6fff",
    marginTop: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  // Premium Button Styles
  premiumButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 10,
  },
  friendRequestButton: {
    backgroundColor: "#f0f4ff",
    borderWidth: 2,
    borderColor: "#4c6fff",
  },
  friendActiveButton: {
    backgroundColor: "#ecfdf5",
    borderWidth: 2,
    borderColor: "#10b981",
  },
  messageButtonPremium: {
    backgroundColor: "#4c6fff",
    borderWidth: 0,
  },
  premiumButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4c6fff",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  premiumButtonIconMessage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  premiumButtonText: {
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  friendRequestText: {
    color: "#4c6fff",
  },
  friendActiveText: {
    color: "#10b981",
  },
  premiumButtonTextMessage: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  callButtonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  callButtonPremium: {
    minWidth: 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 6,
  },
  callButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#4c6fff",
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "center",
    flex: 1,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  messageButton: {
    backgroundColor: "#10b981",
    marginBottom: 0,
  },
  callButton: {
    minWidth: 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#4c6fff",
    gap: 6,
  },
  sectionLabel: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 8,
  },
  friendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  friendChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  friendAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  friendAvatarImage: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  friendAvatarText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  friendName: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  storyThumb: {
    width: 80,
    height: 120,
    borderRadius: 12,
    marginRight: 10,
  },
  emptyText: {
    color: "#9ca3af",
  },
  postCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  postHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  postAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  postAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  postAvatarText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  postAuthorText: {
    fontWeight: "600",
    color: "#111827",
  },
  postMetaText: {
    color: "#9ca3af",
    fontSize: 12,
  },
  postText: {
    color: "#111827",
    fontWeight: "600",
  },
  postMedia: {
    width: "100%",
    borderRadius: 16,
    marginTop: 10,
  },
  postFooter: {
    flexDirection: "row",
    marginTop: 8,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  footerText: {
    color: "#6b7280",
    marginLeft: 6,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  modalBody: {
    padding: 20,
  },
  commentRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  commentAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentAvatarText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  commentBody: {
    flex: 1,
  },
  commentActions: {
    flexDirection: "row",
    marginTop: 6,
  },
  commentActionButton: {
    marginRight: 12,
  },
  commentActionText: {
    color: "#4c6fff",
    fontSize: 12,
    fontWeight: "600",
  },
  commentAuthor: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  commentText: {
    color: "#374151",
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  commentButton: {
    backgroundColor: "#4c6fff",
    padding: 10,
    borderRadius: 10,
  },
  attendanceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  attendanceItemContent: {
    marginLeft: 10,
    flex: 1,
  },
  attendanceTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  attendanceMeta: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  commentHint: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 12,
    fontStyle: "italic",
  },
  // Gallery Styles
  galleryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  galleryCount: {
    fontSize: 13,
    color: "#9ca3af",
  },
  galleryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  galleryScroll: {
    paddingRight: 16,
  },
  galleryItem: {
    width: 140,
    height: 180,
    borderRadius: 12,
    marginRight: 12,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
    position: "relative",
  },
  galleryImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  galleryVideo: {
    width: "100%",
    height: "100%",
  },
  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  zoomIndicator: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 12,
    padding: 6,
  },
  // Viewer Modal Styles
  viewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 8,
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  viewerVideoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.6,
    justifyContent: "center",
    alignItems: "center",
  },
  viewerVideo: {
    width: "100%",
    height: "100%",
  },
  // Report Modal Styles
  reportModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  reportModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  reportModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  reportModalDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
  },
  reportInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    fontSize: 14,
    marginBottom: 16,
  },
  reportSubmitButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  reportSubmitButtonDisabled: {
    opacity: 0.5,
  },
  reportSubmitButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  callButtonDisabled: {
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  callButtonTextDisabled: {
    color: "#9ca3af",
  },
  messageButtonDisabled: {
    backgroundColor: "#e5e7eb",
    borderColor: "#e5e7eb",
  },
  friendPendingButton: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
  },
  friendPendingText: {
    color: "#b45309",
  },
  friendAcceptButton: {
    backgroundColor: "#dbeafe",
    borderColor: "#3b82f6",
  },
  friendAcceptText: {
    color: "#1d4ed8",
  },
});
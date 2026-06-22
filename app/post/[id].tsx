import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import { getPost, togglePostLike, addPostComment, Post, PostComment, toggleSaved, checkSaved } from "../../lib/api";
import { COLORS } from "../../lib/designTokens";
import { CommentSection } from "../../components/CommentSection";
import PostContent from "../../components/PostContent";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import AdaptiveImage from "../../components/AdaptiveImage";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import { formatRelativeDate } from "../../lib/formatDate";

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user, activeIdentity } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    if (id) {
      loadPost();
    }
  }, [id]);

  const loadPost = async () => {
    if (!sessionToken || !id) return;

    try {
      const post = await getPost(sessionToken, id);
      if (post) setPost(post);
      
      if (sessionToken && id) {
        try {
          const { is_saved } = await checkSaved(sessionToken, "post", id);
          setIsSaved(is_saved);
        } catch (e) {
          console.log("Check saved failed:", e);
        }
      }
    } catch (error) {
      console.error("Failed to load post:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!sessionToken || !post) return;

    const wasLiked = post.liked_by_me;
    setPost(prev => prev ? { ...prev, liked_by_me: !wasLiked, likes_count: wasLiked ? prev.likes_count - 1 : prev.likes_count + 1 } : prev);

    try {
      const actor = activeIdentity?.type && activeIdentity.type !== 'user'
        ? { type: activeIdentity.type, id: activeIdentity.id }
        : undefined;
      await togglePostLike(sessionToken, post.post_id, actor);
    } catch (error) {
      console.error("Failed to like:", error);
      setPost(prev => prev ? { ...prev, liked_by_me: wasLiked, likes_count: wasLiked ? prev.likes_count + 1 : prev.likes_count - 1 } : prev);
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
    if (!post) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "post", post.post_id);
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
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t("post.notFound") || "Post not found"}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = post.actor_name || post.author?.name || "User";
  const displayAvatar = post.actor_avatar || post.author?.profile_photo || post.author?.picture;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content}>
          <Pressable
            style={styles.authorRow}
            onPress={() => {
              if (post.actor_type === 'business' && post.actor_id) {
                router.push(`/business/${post.actor_id}`);
              } else if (post.actor_type === 'artist' && post.actor_id) {
                router.push(`/user/${post.actor_id}`);
              } else {
                router.push(`/user/${post.user_id}`);
              }
            }}
          >
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{displayName}</Text>
              <Text style={styles.postTime}>{formatRelativeDate(post.created_at)}</Text>
            </View>
          </Pressable>

          {post.text && (
            <PostContent
              text={post.text}
              textStyle={styles.postText}
              taggedUsers={post.tagged_user_ids?.map(id => ({ id, name: id }))}
              taggedBusinesses={post.tagged_business_ids?.map(id => ({ id, name: id }))}
              taggedArtists={post.tagged_artist_ids?.map(id => ({ id, name: id }))}
            />
          )}

          {post.video_url ? (
            <View style={styles.postVideoContainer}>
              <AdaptiveVideo
                uri={post.video_url}
                style={styles.postVideo}
                showMuteButton={true}
                initialMuted={true}
                resizeMode="contain"
                coverPhoto={post.mux_thumbnail_url || undefined}
                ratio={post.media_ratio || undefined}
                maxHeight={600}
                borderRadius={8}
                videoStatus={post.video_status}
                muxThumbnailUrl={post.mux_thumbnail_url || undefined}
                onPress={() => {
                  const items: MediaItem[] = [];
                  if (post.video_url) items.push({ type: "video", uri: post.video_url, ratio: post.media_ratio || undefined, muxThumbnailUrl: post.mux_thumbnail_url || undefined, videoStatus: post.video_status });
                  if (post.image_url) items.push({ type: "image", uri: post.image_url, ratio: post.media_ratio || undefined });
                  setViewerMedia(items);
                  setViewerIndex(0);
                  setViewerOpen(true);
                }}
              />
            </View>
          ) : post.image_url ? (
            <AdaptiveImage
              uri={post.image_url}
              ratio={post.media_ratio || undefined}
              maxHeight={600}
              borderRadius={8}
              style={styles.postImage}
              onPress={() => {
                const items: MediaItem[] = [];
                if (post.image_url) items.push({ type: "image", uri: post.image_url, ratio: post.media_ratio || undefined });
                if (post.video_url) items.push({ type: "video", uri: post.video_url, ratio: post.media_ratio || undefined, muxThumbnailUrl: post.mux_thumbnail_url || undefined, videoStatus: post.video_status });
                setViewerMedia(items);
                setViewerIndex(0);
                setViewerOpen(true);
              }}
            />
          ) : null}

          <View style={styles.statsRow}>
            <Pressable style={styles.statButton} onPress={handleLike}>
              <Ionicons
                name={post.liked_by_me ? "heart" : "heart-outline"}
                size={24}
                color={post.liked_by_me ? "#ef4444" : "#6b7280"}
              />
              <Text style={styles.statText}>{post.likes_count || 0}</Text>
            </Pressable>
            <View style={styles.statButton}>
              <Ionicons name="chatbubble-outline" size={22} color="#6b7280" />
              <Text style={styles.statText}>{post.comments_count || 0}</Text>
            </View>
            <Pressable style={styles.statButton} onPress={handleToggleSave} disabled={savingItem}>
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={24}
                color={isSaved ? COLORS.gold : "#6b7280"}
              />
              <Text style={[styles.statText, isSaved && { color: COLORS.gold }]}>
                {isSaved ? (t("common.saved") || "Saved") : (t("common.save") || "Save")}
              </Text>
            </Pressable>
          </View>

          <CommentSection postId={post.post_id} onCommentAdded={() => setPost(prev => prev ? { ...prev, comments_count: (prev.comments_count || 0) + 1 } : prev)} />
        </ScrollView>
      </KeyboardAvoidingView>

      <LazyMediaViewer
        visible={viewerOpen}
        media={viewerMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    ...Platform.select({ web: { width: "100%", maxWidth: 914, alignSelf: "center" } as any, default: {} }),
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    justifyContent: "center",
    alignItems: "center",
  },
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
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  content: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  authorInfo: {
    marginLeft: 12,
  },
  authorName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  postTime: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  postText: {
    fontSize: 16,
    color: "#374151",
    lineHeight: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
postImage: {
    width: "100%",
    borderRadius: 8,
  },
  postVideoContainer: {
    width: "100%",
    maxHeight: 600,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  postVideo: {
    width: "100%",
  },
  statsRow: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    gap: 24,
  },
  statButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "500",
  },
});
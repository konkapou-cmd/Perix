import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Post, BACKEND_URL } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { Share } from "react-native";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import AdaptiveVideo from "../AdaptiveVideo";
import AdaptiveImage from "../AdaptiveImage";
import LazyMediaViewer, { MediaItem } from "../LazyMediaViewer";

interface PostCardProps {
  post: Post;
  isSaved: boolean;
  onLike: () => void;
  onComment: () => void;
  onSave: () => void;
  sessionToken: string | null;
}

export function PostCard({ post, isSaved, onLike, onComment, onSave, sessionToken }: PostCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [viewerOpen, setViewerOpen] = useState(false);

  const displayName = post.actor_name || post.author?.name || "User";
  const displayAvatar = post.actor_avatar || post.author?.profile_photo || post.author?.picture;

  const mediaItems: MediaItem[] = [];
  if (post.video_url) {
    mediaItems.push({ type: "video", uri: post.video_url, muxThumbnailUrl: post.mux_thumbnail_url || undefined, videoStatus: post.video_status });
  }
  if (post.image_url) {
    mediaItems.push({ type: "image", uri: post.image_url, ratio: post.media_ratio || undefined });
  }

  const handleAuthorPress = () => {
    if (post.actor_type === "business" && post.actor_id) {
      router.push(`/business/${post.actor_id}` as any);
    } else if (post.actor_type === "artist" && post.actor_id) {
      router.push(`/user/${post.actor_id}` as any);
    } else {
      router.push(`/user/${post.user_id}` as any);
    }
  };

  const handleShare = async () => {
    const message = `Check out ${displayName}'s post on Perix!`;
    const url = `${BACKEND_URL?.replace("/api", "")}/share/post/${post.post_id}`;
    await Share.share({ message: `${message}\n\n${url}` });
  };

  const handleLike = () => {
    if (!sessionToken) {
      Alert.alert(
        t("common.loginRequired") || "Login Required",
        t("common.loginToLike") || "Please log in to like posts",
        [
          { text: t("common.cancel") || "Cancel", style: "cancel" },
          { text: t("auth.login") || "Login", onPress: () => router.push("/login") },
        ]
      );
      return;
    }
    onLike();
  };

  const handleSave = () => {
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
    onSave();
  };

  return (
    <Pressable style={styles.postCard} onPress={() => router.push(`/post/${post.post_id}`)}>
      <View style={styles.postHeader}>
        <Pressable onPress={handleAuthorPress}>
          {displayAvatar ? (
            <View style={styles.postAvatar}>
              <AdaptiveImage uri={displayAvatar} borderRadius={18} ratio={1} style={styles.postAvatar} maxHeight={36} />
            </View>
          ) : (
            <View style={styles.postAvatarFallback}>
              <Text style={styles.postAvatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        <View style={styles.postAuthorInfo}>
          <Text style={styles.postAuthorName}>{displayName}</Text>
          <Text style={styles.postTimeText}>{new Date(post.created_at).toLocaleDateString()}</Text>
        </View>
      </View>

      {post.text && <Text style={styles.postTextContent} numberOfLines={3}>{post.text}</Text>}

      {post.video_url ? (
        <View style={styles.postMediaContainer}>
          <AdaptiveVideo
            uri={post.video_url}
            style={styles.postVideo}
      autoPlay={true}
                      showMuteButton={true}
                      initialMuted={true}
                      pauseWhenNotVisible={true}
                      resizeMode="contain"
                      ratio={post.media_ratio || undefined}
            maxHeight={470}
            borderRadius={8}
            videoStatus={post.video_status}
            muxThumbnailUrl={post.mux_thumbnail_url || undefined}
            onPress={() => setViewerOpen(true)}
          />
        </View>
      ) : post.image_url ? (
        <AdaptiveImage
          uri={post.image_url}
          ratio={post.media_ratio || undefined}
          maxHeight={470}
          borderRadius={8}
          style={styles.postImage}
          onPress={() => setViewerOpen(true)}
        />
      ) : null}

      {isSaved && (
        <View style={styles.savedBadge}>
          <Ionicons name="bookmark" size={10} color={COLORS.gold} />
        </View>
      )}

      <View style={styles.postStats}>
        <Pressable style={styles.postStatItem} onPress={handleLike}>
          <Ionicons
            name={post.liked_by_me ? "heart" : "heart-outline"}
            size={18}
            color={post.liked_by_me ? COLORS.error : COLORS.textMuted}
          />
          <Text style={[styles.postStatText, post.liked_by_me && { color: COLORS.error }]}>
            {post.likes_count || 0}
          </Text>
        </Pressable>

        <Pressable style={styles.postStatItem} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={18} color={COLORS.textMuted} />
          <Text style={styles.postStatText}>{post.comments_count || 0}</Text>
        </Pressable>

        <Pressable style={styles.postStatItem} onPress={handleShare}>
          <Ionicons name="share-outline" size={18} color={COLORS.textMuted} />
        </Pressable>

        <Pressable style={styles.postStatItem} onPress={handleSave}>
          <Ionicons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={18}
            color={isSaved ? COLORS.gold : COLORS.textMuted}
          />
        </Pressable>
      </View>

      <LazyMediaViewer
        visible={viewerOpen}
        media={mediaItems}
        initialIndex={0}
        onClose={() => setViewerOpen(false)}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  postCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  postAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  postAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
  },
  postAuthorInfo: {
    marginLeft: 10,
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  postTimeText: {
    fontSize: 12,
    color: "#6b7280",
  },
  postTextContent: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 8,
  },
  postMediaContainer: {
    marginBottom: 8,
  },
  postImage: {
    width: "100%",
    marginBottom: 8,
  },
  postVideo: {
    width: "100%",
  },
  savedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  postStats: {
    flexDirection: "row",
    gap: 16,
  },
  postStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postStatText: {
    fontSize: 13,
    color: "#6b7280",
  },
});
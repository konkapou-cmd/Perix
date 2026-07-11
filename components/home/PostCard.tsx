import React, { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, ActivityIndicator, Dimensions } from "react-native";
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
import useResponsiveLayout from "../../hooks/useResponsiveLayout";
import { formatDate } from "../../lib/formatDate";

interface PostCardProps {
  post: Post;
  isSaved: boolean;
  onLike: () => void;
  onComment: () => void;
  onSave: () => void;
  sessionToken: string | null;
  autoPlay?: boolean;
  showMuteButton?: boolean;
  muted?: boolean;
  onMuteChange?: (m: boolean) => void;
  onCardTap?: () => void;
}

export function PostCard({ post, isSaved, onLike, onComment, onSave, sessionToken, autoPlay = false, showMuteButton, muted, onMuteChange, onCardTap }: PostCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [viewerOpen, setViewerOpen] = useState(false);
  const { contentMaxWidth } = useResponsiveLayout();
  const skipCardNav = useRef(false);

  const displayName = post.actor_name || post.author?.name || "User";
  const displayAvatar = post.actor_avatar || post.author?.profile_photo || post.author?.picture;

  const mediaItems: MediaItem[] = [];
  if (post.video_url) {
    mediaItems.push({ type: "video", uri: post.video_url, ratio: post.media_ratio || undefined, muxThumbnailUrl: post.mux_thumbnail_url || undefined, videoStatus: post.video_status });
  }
  if (post.image_url) {
    mediaItems.push({ type: "image", uri: post.image_url, ratio: post.media_ratio || undefined });
  }

  const handleAuthorPress = () => {
    skipCardNav.current = true;
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
    <Pressable style={styles.postCard} onPress={() => {
      if (skipCardNav.current) { skipCardNav.current = false; return; }
      onCardTap?.();
      router.push(`/post/${post.post_id}`);
    }}>
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
          <Text style={styles.postTimeText}>{formatDate(post.created_at)}</Text>
        </View>
      </View>

      {post.text && (
        post.video_url || post.image_url ? (
          <Text style={styles.postTextContent} numberOfLines={3}>{post.text}</Text>
        ) : (
          <View style={styles.textOnlyPreview}>
            <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.borderLight} style={{ marginBottom: 8 }} />
            <Text style={styles.textOnlyContent} numberOfLines={8}>{post.text}</Text>
          </View>
        )
      )}

      {post.video_url ? (
        <View style={styles.postMediaWrapper}>
          <AdaptiveVideo
            uri={post.video_url}
            ratio={post.media_ratio || undefined}
            autoPlay={autoPlay && !viewerOpen}
            isLooping
            initialMuted={muted !== false}
            showMuteButton={showMuteButton !== false}
            onMuteChange={onMuteChange}
            resizeMode="cover"
            coverPhoto={post.mux_thumbnail_url || undefined}
            borderRadius={0}
            videoStatus={post.video_status}
            muxThumbnailUrl={post.mux_thumbnail_url || undefined}
            onPress={() => setViewerOpen(true)}
          />
        </View>
      ) : post.image_url ? (
        <View style={styles.postMediaWrapper}>
          <AdaptiveImage
            uri={post.image_url}
            maxHeight={Dimensions.get("window").height * 0.7}
            borderRadius={0}
            onPress={() => setViewerOpen(true)}
          />
        </View>
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
    marginHorizontal: 0,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
    marginBottom: SPACING.compact,
    ...Platform.select({ web: { width: "100%", maxWidth: 720, alignSelf: "center", cursor: "pointer", transition: "box-shadow 0.2s" } as any, default: {} }),
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  postAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  postAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTint,
    justifyContent: "center",
    alignItems: "center",
  },
  postAvatarText: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  postAuthorInfo: {
    marginLeft: 12,
  },
  postAuthorName: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  postTimeText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    color: COLORS.textGray,
  },
  postTextContent: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    color: COLORS.textDark,
    lineHeight: Platform.OS === "web" ? 24 : 20,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  textOnlyPreview: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: COLORS.textOnlyBg,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.borderGray,
  },
  textOnlyContent: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    color: COLORS.textDark,
    lineHeight: Platform.OS === "web" ? 24 : 20,
  },
  postMediaWrapper: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "transparent",
    marginBottom: 8,
  },
  savedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  postStats: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
  },
  postStatItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postStatText: {
    fontSize: Platform.OS === "web" ? 14 : 13,
    color: COLORS.textGray,
  },
});

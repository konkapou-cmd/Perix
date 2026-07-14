import React, { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Post, BACKEND_URL } from "../../lib/api";
import { COLORS, SPACING, BORDER_RADIUS } from "../../lib/designTokens";
import { Share } from "react-native";
import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../lib/formatDate";
import LazyMediaViewer, { MediaItem } from "../LazyMediaViewer";
import PostHeader from "./PostHeader";
import PostMedia from "./PostMedia";
import PostActions from "./PostActions";
import PostCommentsRow from "./PostCommentsRow";

export interface PostCardProps {
  post: Post;
  context: "home" | "profile";
  isSaved?: boolean;
  isActive?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  sessionToken: string | null;
  showMuteButton?: boolean;
  muted?: boolean;
  onMuteChange?: (m: boolean) => void;
  onCardTap?: () => void;
  onLike: () => void;
  onComment: () => void;
  onSave: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function PostCard({
  post,
  context,
  isSaved = false,
  isActive = false,
  canEdit = false,
  canDelete = false,
  sessionToken,
  showMuteButton = true,
  muted = true,
  onMuteChange,
  onCardTap,
  onLike,
  onComment,
  onSave,
  onShare,
  onEdit,
  onDelete,
}: PostCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [viewerOpen, setViewerOpen] = useState(false);
  const skipCardNav = useRef(false);

  const displayName = post.actor_name || post.author?.name || "User";
  const displayAvatar = post.actor_avatar || post.author?.profile_photo || post.author?.picture;

  const preventCardNav = (fn?: () => void) => {
    skipCardNav.current = true;
    fn?.();
  };

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
    skipCardNav.current = true;
    if (onShare) { onShare(); return; }
    const message = `Check out ${displayName}'s post on Perix!`;
    const url = `${BACKEND_URL?.replace("/api", "")}/share/post/${post.post_id}`;
    await Share.share({ message: `${message}\n\n${url}` });
  };

  const handleLike = () => {
    skipCardNav.current = true;
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
    skipCardNav.current = true;
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

  const handleComment = () => {
    skipCardNav.current = true;
    onComment();
  };

  const handleCardPress = () => {
    if (skipCardNav.current) { skipCardNav.current = false; return; }
    onCardTap?.();
    router.push(`/post/${post.post_id}`);
  };

  const activeVideo = isActive && !viewerOpen;

  const editSlot = (canEdit || canDelete) ? (
    <>
      {canEdit && (
        <Pressable onPress={() => preventCardNav(onEdit)}>
          <Ionicons name="create-outline" size={20} color={COLORS.primaryDark} />
        </Pressable>
      )}
      {canDelete && (
        <Pressable onPress={() => preventCardNav(onDelete)}>
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </Pressable>
      )}
    </>
  ) : undefined;

  return (
    <Pressable style={styles.card} onPress={handleCardPress}>
      <PostHeader
        actorName={displayName}
        actorAvatar={displayAvatar}
        formattedDate={formatDate(post.created_at)}
        onAuthorPress={handleAuthorPress}
        editSlot={editSlot}
      />

      {post.text && (
        post.video_url || post.image_url ? (
          <Text style={styles.caption} numberOfLines={3}>{post.text}</Text>
        ) : (
          <View style={styles.textOnlyCard}>
            <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.borderLight} style={{ marginBottom: 8 }} />
            <Text style={styles.textOnlyContent} numberOfLines={8}>{post.text}</Text>
          </View>
        )
      )}

      {post.video_url || post.image_url ? (
        <PostMedia
          post={post}
          autoPlay={activeVideo}
          muted={muted}
          showMuteButton={showMuteButton}
          onMuteChange={onMuteChange}
          onPress={() => setViewerOpen(true)}
        />
      ) : null}

      {isSaved && (
        <View style={styles.savedBadge}>
          <Ionicons name="bookmark" size={10} color={COLORS.gold} />
        </View>
      )}

      <PostActions
        liked={!!post.liked_by_me}
        likesCount={post.likes_count || 0}
        commentsCount={post.comments_count || 0}
        isSaved={isSaved}
        onLike={handleLike}
        onComment={handleComment}
        onShare={handleShare}
        onSave={handleSave}
      />

      <PostCommentsRow
        count={post.comments_count || 0}
        onPress={handleComment}
      />

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
  card: {
    marginHorizontal: 8,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
    marginBottom: SPACING.compact,
    ...Platform.select({ web: { width: "100%", maxWidth: 720, alignSelf: "center", cursor: "pointer", transition: "box-shadow 0.2s" } as any, default: {} }),
  },
  caption: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    color: COLORS.textDark,
    lineHeight: Platform.OS === "web" ? 24 : 20,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  textOnlyCard: {
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
});

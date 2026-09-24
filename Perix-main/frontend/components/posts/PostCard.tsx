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
import PostContent from "../PostContent";
import PostHeader from "./PostHeader";
import PostMedia from "./PostMedia";
import PostActions from "./PostActions";
import PostCommentsRow from "./PostCommentsRow";
import ReportModal from "../ReportModal";

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
  taggedUsers?: { id: string; name: string }[];
  taggedBusinesses?: { id: string; name: string }[];
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
  taggedUsers = [],
  taggedBusinesses = [],
}: PostCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
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

  // After reporting, the post disappears from the user's feed immediately —
  // the backend also auto-hides it once enough reports accumulate.
  if (reported) return null;

  const editSlot = (canEdit || canDelete) ? (
    <>
      {canEdit && (
        <Pressable onPress={() => preventCardNav(onEdit)}>
          <Ionicons name="create-outline" size={20} color={COLORS.primaryDark} />
        </Pressable>
      )}
      {canDelete && (
        <Pressable onPress={() => preventCardNav(onDelete)}>
          <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
        </Pressable>
      )}
    </>
  ) : undefined;

  const reportSlot = !canEdit && !canDelete ? (
    <Pressable onPress={() => preventCardNav(() => setReportOpen(true))} hitSlop={6}>
      <Ionicons name="flag-outline" size={18} color="#9ca3af" />
    </Pressable>
  ) : null;

  return (
    <Pressable style={styles.card} onPress={handleCardPress}>
      <PostHeader
        actorName={displayName}
        actorAvatar={displayAvatar}
        formattedDate={formatDate(post.created_at)}
        onAuthorPress={handleAuthorPress}
        editSlot={editSlot}
        reportSlot={reportSlot}
      />

      {post.text && (
        post.video_url || post.image_url ? (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <PostContent
              text={post.text}
              textStyle={styles.caption}
              taggedUsers={taggedUsers}
              taggedBusinesses={taggedBusinesses}
            />
          </View>
        ) : (
          <View style={styles.textOnlyCard}>
            <Ionicons name="chatbubble-ellipses" size={16} color={COLORS.borderLight} style={{ marginBottom: 8 }} />
            <PostContent
              text={post.text}
              textStyle={styles.textOnlyContent}
              taggedUsers={taggedUsers}
              taggedBusinesses={taggedBusinesses}
            />
          </View>
        )
      )}

      {post.video_url || post.image_url ? (
        <PostMedia
          post={post}
          autoPlay={activeVideo}
          muted={muted}
          showMuteButton={showMuteButton}
          onMuteChange={(next) => {
            // Mute button sits inside the whole clickable card: swallow the
            // card navigation so a mute tap never opens the post too.
            skipCardNav.current = true;
            onMuteChange?.(next);
          }}
          onPress={() => preventCardNav(() => setViewerOpen(true))}
        />
      ) : null}

      {(post.business || post.tagged_activity || post.tagged_listing) && (
        <Pressable
          style={styles.locationRow}
          onPress={() => {
            skipCardNav.current = true;
            if (post.business?.business_id) {
              router.push(`/business/${post.business.business_id}` as any);
            } else if (post.tagged_activity?.activity_id) {
              router.push(`/activity/${post.tagged_activity.activity_id}` as any);
            } else if (post.tagged_listing?.listing_id) {
              router.push(`/listing/${post.tagged_listing.listing_id}` as any);
            }
          }}
        >
          <Ionicons
            name={post.business ? "location-outline" : post.tagged_activity ? "people-outline" : "pricetag-outline"}
            size={14}
            color="#59ABE3"
          />
          <Text style={styles.locationText} numberOfLines={1}>
            {post.business
              ? `${post.business.name}${post.business.address ? ` · ${post.business.address}` : ""}`
              : post.tagged_activity
              ? `${post.tagged_activity.title}${post.tagged_activity.location ? ` · ${post.tagged_activity.location}` : ""}`
              : `${post.tagged_listing?.title}${post.tagged_listing?.address ? ` · ${post.tagged_listing.address}` : ""}`}
          </Text>
        </Pressable>
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

      <ReportModal
        visible={reportOpen}
        targetType="post"
        targetId={post.post_id}
        sessionToken={sessionToken}
        onClose={() => setReportOpen(false)}
        onSubmitted={() => setReported(true)}
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
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 6,
    marginTop: 2,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#264348",
  },
});

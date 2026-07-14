import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  TextStyle,
  ScrollView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import AdaptiveVideo from "../AdaptiveVideo";
import AdaptiveImage from "../AdaptiveImage";
import { PostCard } from "../posts/PostCard";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import { Post, togglePostLike as apiTogglePostLike, toggleSaved } from "../../lib/api";
import { PROFILE, PROFILE_COLORS } from "./ProfileDesign";
import { ThemeStyles } from "../../hooks/useThemeStyles";
import useResponsiveLayout from "../../hooks/useResponsiveLayout";

interface ProfilePostsProps {
  posts: Post[];
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  textSecondaryColor?: string;
  bgColor?: string;
  onPostPress?: (post: Post) => void;
  handleCreatePost?: () => void;
  readOnly?: boolean;
  postText?: string;
  setPostText?: (val: string) => void;
  postImage?: string | null;
  postVideo?: string | null;
  postVideoPreview?: string | null;
  pickPostImage?: () => void;
  pickPostVideo?: () => void;
  onDiscardMedia?: () => void;
  onCreatePost?: () => void;
  avatarUri?: string | null;
  onDeletePost?: (post: Post) => void;
  onEditPost?: (post: Post) => void;
  currentUserId?: string;
  onRefreshPosts?: () => void;
  themeStyles?: ThemeStyles;
  onOpenTagModal?: () => void;
  onEditTags?: (userIds: string[], businessIds: string[]) => void;
  friends?: any[];
  businesses?: any[];
  showMentionSuggestions?: boolean;
  mentionSuggestions?: { id: string; name: string; type: 'user' | 'business'; avatar?: string | null }[];
  onSelectMention?: (item: { id: string; name: string; type: 'user' | 'business' }) => void;
  pendingMentionIds?: string[];
  isOwnProfile?: boolean;
  isPosting?: boolean;
  uploadPercent?: number;
  onCreateStory?: () => void;
}

const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
};

export const ProfilePosts: React.FC<ProfilePostsProps> = ({
  posts,
  primaryColor = PROFILE_COLORS.PRIMARY,
  cardColor = PROFILE_COLORS.CARD,
  textColor = PROFILE_COLORS.TEXT,
  textSecondaryColor = PROFILE_COLORS.TEXT_SECONDARY,
  bgColor,
  onPostPress,
  onCreatePost,
  readOnly = false,
  postText = "",
  setPostText = () => {},
  postImage = null,
  postVideo = null,
  postVideoPreview = null,
  pickPostImage,
  pickPostVideo,
  onDiscardMedia,
  handleCreatePost,
  avatarUri,
  onDeletePost,
  onEditPost,
  currentUserId = "",
  themeStyles,
  onOpenTagModal,
  onEditTags,
  friends = [],
  businesses = [],
  showMentionSuggestions = false,
  mentionSuggestions = [],
  onSelectMention,
pendingMentionIds = [],
  onRefreshPosts,
  isOwnProfile = false,
  isPosting = false,
  uploadPercent = 0,
  onCreateStory,
}) => {
  const { t } = useTranslation();
  const { contentMaxWidth } = useResponsiveLayout();
  const { sessionToken, activeIdentity } = useAuth();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editText, setEditText] = useState("");
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [postsData, setPostsData] = useState<Post[]>(posts);
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPostsData(posts);
    const initialLiked = new Set<string>();
    posts.forEach(post => {
      if (post.liked_by_me) {
        initialLiked.add(post.post_id);
      }
    });
    setLikedPosts(initialLiked);
  }, [posts]);

  const matchFriend = (id: string) => friends.find((f: any) => f.user_id === id || f.entity_id === id);
  const getFriendName = (id: string) => {
    const f = matchFriend(id);
    return f?.name || f?.user_id || f?.entity_id || id;
  };
  const getFriendAvatar = (id: string) => {
    const f = matchFriend(id);
    return f?.profile_photo || f?.picture || f?.image || null;
  };
  const getBizName = (id: string) => businesses.find((b: any) => b.business_id === id)?.name || id;
  const getBizAvatar = (id: string) => businesses.find((b: any) => b.business_id === id)?.logo_image || null;
  
  const getMentionName = (id: string) => {
    const f = matchFriend(id);
    if (f) return f.name || f.user_id || f.entity_id;
    const biz = businesses.find((b: any) => b.business_id === id);
    if (biz) return biz.name;
    return id;
  };

  const processTextForDisplay = (text: string): string => {
    if (!text) return "";
    // Replace @user_id patterns with @name for display
    // Match @ followed by IDs (user_id format or business_id format)
    return text.replace(/@([a-zA-Z0-9_]+)/g, (match, idOrName) => {
      const name = getMentionName(idOrName);
      // Only replace if we found a matching name, otherwise keep original
      if (name !== idOrName) {
        return `@${name}`;
      }
      return match;
    });
  };
    
   const getInitials = (name: string | null | undefined) => {
     if (!name) return '??';
     return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2);
   };

   const isOwnPost = (post: Post) => {
     // If isOwnProfile is true (viewing own profile), show edit on all posts
     if (isOwnProfile) return true;
     // Otherwise check if current user owns this specific post
     return currentUserId && (
       post.user_id === currentUserId || 
       post.actor_id === currentUserId
     );
   };

  const handleLikePost = async (post: Post) => {
    if (!sessionToken) return;

    const wasLiked = likedPosts.has(post.post_id);
    setLikedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(post.post_id)) {
        newSet.delete(post.post_id);
      } else {
        newSet.add(post.post_id);
      }
      return newSet;
    });
    setPostsData(prev => prev.map(p =>
      p.post_id === post.post_id
        ? { ...p, likes_count: wasLiked ? p.likes_count - 1 : p.likes_count + 1, liked_by_me: !wasLiked }
        : p
    ));

    try {
      const actor = activeIdentity?.type && activeIdentity.type !== 'user'
        ? { type: activeIdentity.type, id: activeIdentity.id }
        : undefined;
      await apiTogglePostLike(sessionToken, post.post_id, actor);
    } catch (error) {
      console.error('Failed to toggle like:', error);
      setLikedPosts(prev => {
        const newSet = new Set(prev);
        if (newSet.has(post.post_id)) {
          newSet.delete(post.post_id);
        } else {
          newSet.add(post.post_id);
        }
        return newSet;
      });
      setPostsData(prev => prev.map(p =>
        p.post_id === post.post_id
          ? { ...p, likes_count: wasLiked ? p.likes_count + 1 : p.likes_count - 1, liked_by_me: wasLiked }
          : p
      ));
    }
  };

  const handleDeletePost = (post: Post) => {
    Alert.alert(
      t("profile.deletePost") || "Delete Post",
      t("profile.confirmDeletePost") || "Are you sure you want to delete this post?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => onDeletePost?.(post),
        },
      ]
    );
  };

  const handleComment = (post: Post) => {
    router.push(`/post/${post.post_id}`);
  };

  const handleSave = async (post: Post) => {
    if (!sessionToken) return;
    try {
      const { is_saved } = await toggleSaved(sessionToken, "post", post.post_id);
      setSavedPostIds(prev => {
        const next = new Set(prev);
        is_saved ? next.add(post.post_id) : next.delete(post.post_id);
        return next;
      });
    } catch (e) { console.warn("toggleSaved failed:", e); }
  };

  const handleEditPress = (post: Post) => {
    setEditingPost(post);
    setEditText(post.text || "");
    if (onEditTags) {
      onEditTags(post.tagged_user_ids || [], post.tagged_business_ids || []);
    }
  };

  const handleEditSave = () => {
    if (editingPost) {
      onEditPost?.({ ...editingPost, text: editText });
      setEditingPost(null);
      setEditText("");
      onRefreshPosts?.();
    }
  };

  return (
    <View style={styles.container}>
      {!readOnly && (
        <View style={[styles.createPost, { backgroundColor: cardColor }]}>
          <View style={styles.createPostInput}>
            <View style={styles.createPostAvatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.createPostAvatarImage} />
              ) : (
                <Ionicons name="person" size={20} color={primaryColor} />
              )}
            </View>
            <TextInput
              style={[styles.createPostTextInput, { backgroundColor: bgColor || "#f3f4f6", color: textColor }]}
              placeholder={t("profile.whatsNew", "What's on your mind?")}
              placeholderTextColor={PROFILE_COLORS.TEXT_SECONDARY}
              value={postText}
              onChangeText={setPostText}
              multiline
              textAlignVertical="top"
            />
          </View>
          {showMentionSuggestions && mentionSuggestions.length > 0 && (
            <View style={styles.mentionDropdown}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {mentionSuggestions.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.mentionItem}
                    onPress={() => onSelectMention?.(item)}
                  >
                    {item.avatar ? (
                      <Image source={{ uri: item.avatar }} style={styles.mentionAvatar} />
                    ) : (
                      <View style={[styles.mentionAvatar, styles.mentionAvatarPlaceholder]}>
                        <Text style={styles.mentionInitials}>
                          {(item.name || "").slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.mentionName} numberOfLines={1}>
                      @{item.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          {(postText.trim() || postImage || postVideoPreview) && (
            <View style={styles.createPostMediaRow}>
              {postImage && (
                <View style={styles.mediaPreviewWrapper}>
                  <Image source={{ uri: postImage }} style={styles.mediaPreview} />
                  <Pressable style={styles.removeMediaBtn} onPress={onDiscardMedia}>
                    <Ionicons name="close-circle" size={22} color="#ef4444" />
                  </Pressable>
                </View>
              )}
              {postVideoPreview && (
                <View style={styles.mediaPreviewWrapper}>
                  <Image source={{ uri: postVideoPreview }} style={styles.mediaPreview} />
                  <Pressable style={styles.removeMediaBtn} onPress={onDiscardMedia}>
                    <Ionicons name="close-circle" size={22} color="#ef4444" />
                  </Pressable>
                </View>
              )}
            </View>
          )}
          <View style={styles.createPostActions}>
            <Pressable style={styles.createPostAction} onPress={pickPostImage}>
              <Ionicons name="image" size={22} color={PROFILE_COLORS.TEXT_SECONDARY} />
            </Pressable>
            <Pressable style={styles.createPostAction} onPress={pickPostVideo}>
              <Ionicons name="videocam" size={22} color={PROFILE_COLORS.TEXT_SECONDARY} />
            </Pressable>
            {onOpenTagModal && (
              <Pressable style={styles.createPostAction} onPress={onOpenTagModal}>
                <Ionicons name="at" size={22} color={PROFILE_COLORS.TEXT_SECONDARY} />
              </Pressable>
            )}
            {onCreateStory && (
              <Pressable style={styles.createPostAction} onPress={onCreateStory}>
                <Ionicons name="play-circle-outline" size={22} color="#7c3aed" />
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            {(postText.trim() || postImage || postVideoPreview) && (
              <Pressable
                style={[styles.createPostSubmit, { backgroundColor: primaryColor }, (isPosting || uploadPercent > 0) && { opacity: 0.7 }]}
                onPress={handleCreatePost}
                disabled={isPosting || uploadPercent > 0}
              >
                {isPosting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : uploadPercent > 0 ? (
                  <Text style={styles.uploadPercentText}>{Math.round(uploadPercent)}%</Text>
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </Pressable>
            )}
          </View>
        </View>
      )}

      {posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="newspaper-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>
            {t("profile.noPosts", "No posts yet")}
          </Text>
        </View>
      ) : isWeb ? (
        <View style={styles.postGrid}>
          {postsData.map((post) => (
            <Pressable
              key={post.post_id}
              style={styles.gridCard}
              onPress={() => router.push(`/post/${post.post_id}` as any)}
            >
              {post.video_url || post.image_url ? (
                <View style={styles.gridMedia}>
                  {post.video_url ? (
                    <AdaptiveVideo
                      uri={post.video_url}
                      autoPlay
                      style={{ width: "100%" }}
                      ratio={post.media_ratio && Number.isFinite(post.media_ratio) && post.media_ratio > 0 ? post.media_ratio : 1}
                      maxHeight={1200}
                      borderRadius={0}
                      videoStatus={post.video_status}
                      muxThumbnailUrl={post.mux_thumbnail_url || undefined}
                      coverPhoto={post.mux_thumbnail_url || undefined}
                      showMuteButton
                    />
                  ) : (
                    <AdaptiveImage
                      uri={post.image_url || ""}
                      style={{ width: "100%" }}
                      ratio={post.media_ratio && Number.isFinite(post.media_ratio) && post.media_ratio > 0 ? post.media_ratio : 1}
                      maxHeight={1200}
                      borderRadius={0}
                    />
                  )}
                  <View style={styles.gridOverlay}>
                    <Ionicons name="heart" size={14} color="#fff" />
                    <Text style={styles.gridOverlayText}>{post.likes_count || 0}</Text>
                    {post.comments_count ? (
                      <>
                        <Ionicons name="chatbubble" size={12} color="#fff" style={{ marginLeft: 8 }} />
                        <Text style={styles.gridOverlayText}>{post.comments_count}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={[styles.gridMedia, styles.gridTextCard]}>
                  <Text style={styles.gridTextPreview} numberOfLines={6}>
                    {post.text || ""}
                  </Text>
                  <View style={styles.gridOverlay}>
                    <Ionicons name="heart" size={14} color="#fff" />
                    <Text style={styles.gridOverlayText}>{post.likes_count || 0}</Text>
                  </View>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 12, paddingTop: 12, paddingBottom: 24 }}>
          {postsData.map((post) => (
            <PostCard
              key={post.post_id}
              context="profile"
              post={post}
              isSaved={savedPostIds.has(post.post_id)}
              isActive={false}
              canEdit={!!isOwnPost(post)}
              canDelete={!!isOwnPost(post)}
              sessionToken={sessionToken}
              onLike={() => handleLikePost(post)}
              onComment={() => handleComment(post)}
              onSave={() => handleSave(post)}
              onEdit={() => handleEditPress(post)}
              onDelete={() => handleDeletePost(post)}
            />
          ))}
        </View>
      )}

      <Modal
        visible={!!editingPost}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPost(null)}
      >
        <View style={styles.editModalOverlay}>
          <View style={[styles.editModalContent, { backgroundColor: cardColor }]}>
            <Text style={[styles.editModalTitle, { color: textColor }]}>
              {t("profile.editPost") || "Edit Post"}
            </Text>
            <TextInput
              style={[styles.editTextInput, { backgroundColor: bgColor, color: textColor }]}
              value={editText}
              onChangeText={setEditText}
              multiline
              placeholder={t("profile.whatsNew") || "What's on your mind?"}
              placeholderTextColor={textSecondaryColor}
            />
            <View style={styles.editModalActions}>
              <Pressable
                style={[styles.editModalBtn, { backgroundColor: "#e5e7eb" }]}
                onPress={() => setEditingPost(null)}
              >
                <Text style={styles.editModalBtnText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.editModalBtn, { backgroundColor: primaryColor }]}
                onPress={handleEditSave}
              >
                <Text style={[styles.editModalBtnText, { color: "#fff" }]}>{t("common.save")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles: Record<string, any> = StyleSheet.create({
  container: {
    flex: 1,
  },
  createPost: {
    marginHorizontal: 4,
    marginBottom: 8,
    padding: 16,
    borderRadius: PROFILE.CARD_RADIUS,
    gap: 10,
  },
  createPostInput: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  createPostTextInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
  },
  createPostMediaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingLeft: 50,
  },
  mediaPreviewWrapper: {
    position: "relative",
  },
  mediaPreview: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  removeMediaBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 11,
  },
  createPostSubmit: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  uploadPercentText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  createPostAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  createPostAvatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  createPostActions: {
    flexDirection: "row",
    gap: 8,
    paddingLeft: 50,
  },
  createPostAction: {
    padding: 8,
    borderRadius: 8,
  },
  mentionDropdown: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 8,
    marginLeft: 50,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mentionItem: {
    alignItems: "center",
    marginRight: 12,
    width: 60,
  },
  mentionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: 4,
  },
  mentionAvatarPlaceholder: {
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  mentionInitials: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  mentionName: {
    fontSize: 11,
    color: "#6b7280",
    maxWidth: 60,
    textAlign: "center",
  },
  postCard: {
    borderRadius: PROFILE.CARD_RADIUS,
    overflow: "hidden",
    marginHorizontal: 4,
    marginBottom: 8,
    ...Platform.select({ web: { maxWidth: 720, alignSelf: "center", cursor: "pointer", transition: "box-shadow 0.2s" } as any, default: {} }),
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  postAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    overflow: "hidden",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  postMeta: {
    flex: 1,
  },
  postAuthor: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    fontWeight: "600",
  },
  postDate: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    color: PROFILE_COLORS.TEXT_SECONDARY,
    marginTop: 1,
  },
  postActions: {
    flexDirection: "row",
    gap: 4,
  },
  postActionBtn: {
    padding: 6,
  },
  postText: {
    fontSize: Platform.OS === "web" ? 16 : 14,
    lineHeight: Platform.OS === "web" ? 24 : 20,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  postMediaWrapper: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "transparent",
    marginBottom: 8,
  },
  postFooter: {
    flexDirection: "row",
    gap: 24,
    marginTop: 8,
    paddingTop: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: PROFILE_COLORS.BORDER,
  },
  postStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  postStatText: {
    fontSize: Platform.OS === "web" ? 14 : 13,
    color: PROFILE_COLORS.TEXT_SECONDARY,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: PROFILE_COLORS.TEXT_SECONDARY,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  editModalContent: {
    width: "100%",
    borderRadius: 16,
    padding: 20,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  editTextInput: {
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  editModalActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  editModalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  editModalBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  tagChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  tagUserChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 16,
    marginRight: 6,
  },
  tagBizChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#dcfce7",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 16,
    marginRight: 6,
  },
  tagChipText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
    marginLeft: 4,
  },
  tagAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  tagAvatarPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#6366f1",
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagAvatarText: {
    fontSize: 9,
    fontWeight: "600",
    color: PROFILE_COLORS.CARD,
  },
  postGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 24,
  },
  gridCard: {
    width: "calc(33.33% - 8px)",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.textPrimary,
    ...Platform.select({ web: { cursor: "pointer" } as any, default: {} }),
  },
  gridMedia: {
    width: "100%",
    height: "100%",
  },
  gridTextCard: {
    backgroundColor: "#1f2937",
    padding: 12,
    justifyContent: "flex-start",
  },
  gridTextPreview: {
    color: "#d1d5db",
    fontSize: 12,
    lineHeight: 16,
  },
  gridOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  gridOverlayText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

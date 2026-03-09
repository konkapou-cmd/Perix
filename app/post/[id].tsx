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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeNavigation } from "../../hooks/useSafeNavigation";
import { useAuth } from "../../context/AuthContext";
import { useTranslation } from "react-i18next";
import { Video, ResizeMode } from "expo-av";

const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL + "/api";

interface PostData {
  post_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  text?: string;
  media_url?: string;
  media_type?: string;
  likes: any[];
  comments: any[];
  created_at: string;
}

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const { safeGoBackToHome, router } = useSafeNavigation();
  const { t } = useTranslation();
  
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) {
      loadPost();
    }
  }, [id]);

  const loadPost = async () => {
    if (!sessionToken || !id) return;
    
    try {
      const response = await fetch(`${API_BASE}/posts/${id}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      
      if (response.ok) {
        const data = await response.json();
        setPost(data);
      }
    } catch (error) {
      console.log("Failed to load post:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!sessionToken || !post) return;
    
    try {
      await fetch(`${API_BASE}/posts/${post.post_id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      loadPost();
    } catch (error) {
      console.log("Failed to like:", error);
    }
  };

  const handleComment = async () => {
    if (!sessionToken || !post || !newComment.trim()) return;
    
    setSubmitting(true);
    try {
      await fetch(`${API_BASE}/posts/${post.post_id}/comment`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: newComment.trim() }),
      });
      setNewComment("");
      loadPost();
    } catch (error) {
      console.log("Failed to comment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const isLiked = post?.likes?.some(
    (like: any) => (typeof like === "string" ? like : like.actor_id) === user?.user_id
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color="#4c6fff" />
      </SafeAreaView>
    );
  }

  if (!post) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={safeGoBackToHome} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Post not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBackToHome} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.content}>
          {/* Post Author */}
          <Pressable
            style={styles.authorRow}
            onPress={() => router.push(`/user/${post.user_id}`)}
          >
            {post.user_avatar ? (
              <Image source={{ uri: post.user_avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {(post.user_name || "U").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.authorInfo}>
              <Text style={styles.authorName}>{post.user_name || "User"}</Text>
              <Text style={styles.postTime}>{formatTime(post.created_at)}</Text>
            </View>
          </Pressable>

          {/* Post Content */}
          {post.text && <Text style={styles.postText}>{post.text}</Text>}

          {/* Post Media */}
          {post.media_url && post.media_type === "image" && (
            <Image source={{ uri: post.media_url }} style={styles.postImage} />
          )}
          {post.media_url && post.media_type === "video" && (
            <Video
              source={{ uri: post.media_url }}
              style={styles.postVideo}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          )}

          {/* Like & Comment Counts */}
          <View style={styles.statsRow}>
            <Pressable style={styles.statButton} onPress={handleLike}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={24}
                color={isLiked ? "#ef4444" : "#6b7280"}
              />
              <Text style={styles.statText}>{post.likes?.length || 0}</Text>
            </Pressable>
            <View style={styles.statButton}>
              <Ionicons name="chatbubble-outline" size={22} color="#6b7280" />
              <Text style={styles.statText}>{post.comments?.length || 0}</Text>
            </View>
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>
              {t("common.comments")} ({post.comments?.length || 0})
            </Text>
            
            {post.comments?.map((comment: any, index: number) => (
              <View key={comment.comment_id || index} style={styles.commentItem}>
                <Pressable onPress={() => router.push(`/user/${comment.user_id}`)}>
                  {comment.user_avatar ? (
                    <Image source={{ uri: comment.user_avatar }} style={styles.commentAvatar} />
                  ) : (
                    <View style={styles.commentAvatarPlaceholder}>
                      <Text style={styles.commentAvatarText}>
                        {(comment.user_name || "U").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </Pressable>
                <View style={styles.commentContent}>
                  <Text style={styles.commentAuthor}>{comment.user_name || "User"}</Text>
                  <Text style={styles.commentText}>{comment.text}</Text>
                  <Text style={styles.commentTime}>
                    {comment.created_at ? formatTime(comment.created_at) : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Comment Input */}
        <View style={styles.commentInputContainer}>
          <TextInput
            style={styles.commentInput}
            placeholder={t("home.addComment")}
            placeholderTextColor="#9ca3af"
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <Pressable
            style={[styles.sendButton, !newComment.trim() && styles.sendButtonDisabled]}
            onPress={handleComment}
            disabled={!newComment.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
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
    color: "#111827",
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
    color: "#4c6fff",
  },
  authorInfo: {
    marginLeft: 12,
  },
  authorName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
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
    height: 300,
    resizeMode: "cover",
  },
  postVideo: {
    width: "100%",
    height: 300,
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
  commentsSection: {
    backgroundColor: "#fff",
    marginTop: 8,
    paddingVertical: 16,
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  commentItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  commentAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4c6fff",
  },
  commentContent: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 10,
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  commentText: {
    fontSize: 14,
    color: "#374151",
    marginTop: 2,
  },
  commentTime: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
  },
  commentInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 10,
  },
  commentInput: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4c6fff",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { getPostComments, addPostComment, toggleCommentLike } from '../lib/api/posts';
import { PostComment } from '../lib/api/core';

interface CommentSectionProps {
  postId: string;
  onCommentAdded?: () => void;
}

export const CommentSection: React.FC<CommentSectionProps> = ({ postId, onCommentAdded }) => {
  const { sessionToken, activeIdentity } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [totalComments, setTotalComments] = useState<number>(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const commentLimit = 5;

  const loadComments = async () => {
    if (loading || !sessionToken) return;
    setLoading(true);

    try {
      const data = await getPostComments(sessionToken, postId);
      setTotalComments(data.length);
      setComments(data.slice(0, commentLimit));
      setHasMore(data.length > commentLimit);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreComments = async () => {
    if (loading || !sessionToken || !hasMore) return;
    setLoading(true);

    try {
      const data = await getPostComments(sessionToken, postId);
      setComments(data);
      setHasMore(false);
    } catch (error) {
      console.error('Failed to load more comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComments = () => {
    if (!showComments && comments.length === 0) {
      loadComments();
    }
    setShowComments(!showComments);
  };

  const handleAddComment = async () => {
    if (!sessionToken || !newComment.trim()) return;

    const actor = activeIdentity?.type && activeIdentity.type !== 'user'
      ? { type: activeIdentity.type, id: activeIdentity.id }
      : undefined;

    try {
      await addPostComment(sessionToken, postId, newComment, actor);
      setNewComment('');
      setTotalComments(prev => prev + 1);
      if (showComments) {
        loadComments();
      }
      onCommentAdded?.();
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!sessionToken) return;

    setComments(prev => prev.map(c =>
      c.comment_id === commentId
        ? { ...c, liked_by_me: !c.liked_by_me, likes_count: c.liked_by_me ? c.likes_count - 1 : c.likes_count + 1 }
        : c
    ));

    try {
      await toggleCommentLike(sessionToken, postId, commentId);
    } catch (error) {
      console.error('Failed to like comment:', error);
      setComments(prev => prev.map(c =>
        c.comment_id === commentId
          ? { ...c, liked_by_me: !c.liked_by_me, likes_count: c.liked_by_me ? c.likes_count - 1 : c.likes_count + 1 }
          : c
      ));
    }
  };

  const navigateToProfile = (comment: PostComment) => {
    if (comment.actor_type === 'business' && comment.actor_id) {
      router.push(`/business/${comment.actor_id}`);
    } else if (comment.actor_type === 'artist' && comment.actor_id) {
      router.push(`/user/${comment.actor_id}`);
    } else {
      router.push(`/user/${comment.user_id}`);
    }
  };

  const [newComment, setNewComment] = useState('');
  const isSendDisabled = loading || !newComment.trim();

  const getDisplayName = (comment: PostComment) => {
    if (comment.actor_name) return comment.actor_name;
    if (comment.author?.name) return comment.author.name;
    return comment.user_id;
  };

  const getAvatar = (comment: PostComment) => {
    if (comment.actor_avatar) return comment.actor_avatar;
    if (comment.author?.profile_photo) return comment.author.profile_photo;
    if (comment.author?.picture) return comment.author.picture;
    return null;
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={toggleComments} style={styles.toggleRow}>
        <View style={styles.commentCountBadge}>
          <Ionicons name="chatbubble-outline" size={16} color="#666" />
          <Text style={styles.commentCountText}>
            {totalComments || comments.length} {totalComments === 1 ? t('comments.comment', 'Comment') : t('comments.comments', 'Comments')}
          </Text>
        </View>
        <Ionicons
          name={showComments ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#666"
        />
      </Pressable>

      {loading && comments.length === 0 && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#111827" />
        </View>
      )}

      {showComments && (
        <View style={styles.commentsList}>
          {comments.length === 0 && !loading ? (
            <Text style={styles.noCommentsText}>
              {t('comments.noComments', 'No comments yet. Be the first to comment!')}
            </Text>
          ) : (
            comments.map((comment) => {
              const avatar = getAvatar(comment);
              return (
                <View key={comment.comment_id} style={styles.commentRow}>
                  <Pressable style={styles.avatarContainer} onPress={() => navigateToProfile(comment)}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.avatarImage} />
                    ) : (
                      <Ionicons name="person-circle" size={32} color="#9ca3af" />
                    )}
                  </Pressable>
                  <View style={styles.commentContent}>
                    <View style={styles.commentHeader}>
                      <Pressable onPress={() => navigateToProfile(comment)} hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}>
                        <Text style={styles.commentAuthor}>{getDisplayName(comment)}</Text>
                      </Pressable>
                      <Text style={styles.commentDate}>
                        {new Date(comment.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.commentText}>{comment.text}</Text>
                  </View>
                  <View style={styles.commentLikeContainer}>
                    <Pressable
                      onPress={() => handleLikeComment(comment.comment_id)}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={comment.liked_by_me ? 'heart' : 'heart-outline'}
                        size={20}
                        color={comment.liked_by_me ? '#ef4444' : '#ccc'}
                      />
                    </Pressable>
                    {comment.likes_count > 0 && (
                      <Text style={styles.likesCount}>{comment.likes_count}</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {hasMore && comments.length > 0 && !loading && (
            <Pressable onPress={loadMoreComments} style={styles.loadMoreButton}>
              <Text style={styles.loadMoreText}>{t('comments.loadMore', 'Load more comments')}</Text>
            </Pressable>
          )}

          {loading && comments.length > 0 && (
            <ActivityIndicator size="small" color="#111827" style={styles.loadingMore} />
          )}

          <View style={[styles.inputRow, { paddingBottom: insets.bottom }]}>
            <TextInput
              style={styles.input}
              placeholder={t('comments.writePlaceholder', 'Write a comment...')}
              placeholderTextColor="#9ca3af"
              value={newComment}
              onChangeText={setNewComment}
              onSubmitEditing={handleAddComment}
              returnKeyType="send"
            />
            <Pressable
              onPress={handleAddComment}
              disabled={isSendDisabled}
              style={({ pressed }) => [
                styles.sendButton,
                isSendDisabled && styles.sendButtonDisabled,
                pressed && !isSendDisabled && styles.sendButtonPressed,
              ]}
            >
              <Ionicons
                name="send"
                size={18}
                color={isSendDisabled ? '#9ca3af' : '#fff'}
              />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingTop: 8,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  commentCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  commentCountText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  loadingContainer: {
    padding: 12,
    alignItems: 'center',
  },
  commentsList: {
    marginTop: 4,
  },
  noCommentsText: {
    textAlign: 'center',
    color: '#9ca3af',
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatarContainer: {
    marginRight: 10,
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentContent: {
    flex: 1,
    marginRight: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  commentAuthor: {
    fontWeight: '600',
    fontSize: 14,
    color: '#111827',
  },
  commentDate: {
    marginLeft: 8,
    fontSize: 12,
    color: '#9ca3af',
  },
  commentText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  commentLikeContainer: {
    alignItems: 'center',
  },
  likesCount: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  loadMoreButton: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    marginTop: 8,
    borderRadius: 8,
  },
  loadMoreText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingMore: {
    marginTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    fontSize: 14,
    color: '#111827',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonPressed: {
    backgroundColor: '#000000',
  },
  sendButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
});

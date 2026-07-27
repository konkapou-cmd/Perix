import { apiRequest, Post, PostComment, User } from "./core";

export const getPosts = async (
  token: string,
  businessId?: string,
  actor?: { type: string; id?: string | null },
  userId?: string,
  limit: number = 20,
  skip: number = 0
): Promise<Post[]> => {
  const params = new URLSearchParams();
  if (businessId) params.append("business_id", businessId);
  if (actor?.type) params.append("actor_type", actor.type);
  if (actor?.id) params.append("actor_id", actor.id);
  if (userId) params.append("user_id", userId);
  params.append("limit", limit.toString());
  params.append("skip", skip.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<Post[]>(`/posts${query}`, "GET", token);
};

export const getPost = async (token: string, postId: string): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}`, "GET", token);
};

export const createPost = async (
  token: string,
  text: string,
  image_base64?: string | null,
  video_base64?: string | null,
  business_id?: string | null,
  actor?: { type: string; id?: string | null },
  media_ratio?: number | null,
  tagged_user_ids?: string[],
  tagged_business_id?: string | null,
  tagged_artist_id?: string | null,
  image_url?: string | null,
  video_url?: string | null,
  youtube_link?: string | null,
  soundcloud_url?: string | null,
  mux_upload_id?: string | null,
  mux_playback_id?: string | null,
  video_status?: string | null
): Promise<Post> => {
  return apiRequest<Post>("/posts", "POST", token, {
    text,
    image_base64: image_url ? null : image_base64,
    image_url,
    video_url,
    mux_upload_id,
    mux_playback_id,
    video_status: video_status || (video_url ? "ready" : "preparing"),
    youtube_link,
    soundcloud_url,
    business_id,
    actor_type: actor?.type,
    actor_id: actor?.id,
    media_ratio,
    tagged_user_ids,
    tagged_business_ids: tagged_business_id ? [tagged_business_id] : [],
    tagged_artist_ids: tagged_artist_id ? [tagged_artist_id] : [],
  });
};

export const togglePostLike = async (
  token: string,
  postId: string,
  actor?: { type: string; id?: string | null }
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}/like`, "POST", token, { actor_type: actor?.type, actor_id: actor?.id });
};

export const updatePost = async (
  token: string,
  postId: string,
  payload: { text?: string | null; image_base64?: string | null; video_base64?: string | null; media_ratio?: number | null; youtube_link?: string | null; soundcloud_url?: string | null }
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}`, "PUT", token, payload);
};

export const deletePost = async (token: string, postId: string): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/posts/${postId}`, "DELETE", token);
};

export const addPostComment = async (
  token: string,
  postId: string,
  text: string,
  actor?: { type: string; id?: string | null }
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}/comments`, "POST", token, { text, actor_type: actor?.type, actor_id: actor?.id });
};

export const getPostComments = async (token: string, postId: string): Promise<PostComment[]> => {
  return apiRequest<PostComment[]>(`/posts/${postId}/comments`, "GET", token);
};

export const updatePostComment = async (
  token: string,
  postId: string,
  commentId: string,
  text: string
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}/comments/${commentId}`, "PUT", token, { text });
};

export const deletePostComment = async (
  token: string,
  postId: string,
  commentId: string
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}/comments/${commentId}`, "DELETE", token);
};

export const toggleCommentLike = async (
  token: string,
  postId: string,
  commentId: string
): Promise<PostComment> => {
  return apiRequest<PostComment>(`/posts/${postId}/comments/${commentId}/like`, "POST", token);
};

export const getUserByEmail = async (token: string, email: string): Promise<User> => {
  return apiRequest<User>(`/users/by-email?email=${encodeURIComponent(email)}`, "GET", token);
};

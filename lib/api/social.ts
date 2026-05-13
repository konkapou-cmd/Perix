import { apiRequest, User, UserPublic, FriendCommon, Post, FriendRequest } from "./core";
export type { FriendRequest } from "./core";

export type EntityType = "user" | "business" | "artist";

export type FriendshipStatus = "friends" | "request_sent" | "request_received" | "none";

export const getMyFriends = async (token: string): Promise<User[]> => {
  return apiRequest<User[]>("/friends/me", "GET", token);
};

export const getCommonFriends = async (token: string, userId: string): Promise<FriendCommon> => {
  return apiRequest<FriendCommon>(`/friends/common?other_user_id=${userId}`, "GET", token);
};

export const toggleFollow = async (
  token: string,
  entityType: EntityType,
  entityId: string
): Promise<{ is_following: boolean }> => {
  return apiRequest<{ is_following: boolean }>(
    `/friends/${entityType}/${entityId}/toggle`,
    "POST",
    token
  );
};

export const sendFriendRequest = async (
  token: string,
  entityType: EntityType,
  entityId: string
): Promise<FriendRequest> => {
  return apiRequest<FriendRequest>("/friend-requests/send", "POST", token, {
    entity_type: entityType,
    entity_id: entityId,
  });
};

export const acceptFriendRequest = async (token: string, requestId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/friend-requests/accept/${requestId}`, "POST", token);
};

export const declineFriendRequest = async (token: string, requestId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/friend-requests/decline/${requestId}`, "POST", token);
};

export const cancelFriendRequest = async (token: string, requestId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/friend-requests/cancel/${requestId}`, "POST", token);
};

export const getMyFriendRequests = async (token: string): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> => {
  return apiRequest<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>("/friend-requests/my", "GET", token);
};

export const getReceivedFriendRequests = async (token: string): Promise<FriendRequest[]> => {
  return apiRequest<FriendRequest[]>("/friend-requests/received", "GET", token);
};

export const getSentFriendRequests = async (token: string): Promise<FriendRequest[]> => {
  return apiRequest<FriendRequest[]>("/friend-requests/sent", "GET", token);
};

export const getPendingRequestCount = async (token: string): Promise<{ pending_count: number }> => {
  return apiRequest<{ pending_count: number }>("/friend-requests/count", "GET", token);
};

export const getFriendshipStatus = async (
  token: string,
  entityType: EntityType,
  entityId: string
): Promise<{ status: FriendshipStatus; request_id: string | null }> => {
  return apiRequest<{ status: FriendshipStatus; request_id: string | null }>(
    `/friend-requests/status/${entityType}/${entityId}`, "GET", token
  );
};

export const searchUsers = async (token: string, query: string, friendsOnly?: boolean): Promise<User[]> => {
  const flag = friendsOnly ? "&friends_only=true" : "";
  return apiRequest<User[]>(`/users/search?query=${encodeURIComponent(query)}${flag}`, "GET", token);
};

export const getTaggedPosts = async (token: string, userId: string): Promise<Post[]> => {
  return apiRequest<Post[]>(`/users/${userId}/tagged-posts`, "GET", token);
};

export const getBusinessFanPosts = async (token: string, businessId: string): Promise<Post[]> => {
  return apiRequest<Post[]>(`/profiles/businesses/${businessId}/fan-posts`, "GET", token);
};

export const getBlockedUsers = async (token: string): Promise<{ blocked_users: import("./core").BlockedUser[] }> => {
  return apiRequest("/users/blocked", "GET", token);
};

export const unblockUser = async (token: string, userId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest(`/users/unblock/${userId}`, "POST", token);
};

export const reportUser = async (token: string, userId: string, reason: string): Promise<{ success: boolean; message: string; report_id: string }> => {
  return apiRequest("/users/report", "POST", token, { user_id: userId, reason });
};

export const pauseUser = async (token: string, userId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest("/users/pause", "POST", token, { user_id: userId });
};

export const unpauseUser = async (token: string, userId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest("/users/unpause", "POST", token, { user_id: userId });
};

export const getPausedUsers = async (token: string): Promise<User[]> => {
  return apiRequest("/users/paused", "GET", token);
};

export const checkIfPaused = async (token: string, userId: string): Promise<{ is_paused: boolean }> => {
  return apiRequest(`/users/${userId}/is-paused`, "GET", token);
};

export const deleteUserAccount = async (token: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>("/users/me", "DELETE", token);
};

export const getUserPublicProfile = async (
  token: string,
  userId: string,
  actor?: { type: string; id?: string | null }
): Promise<import("./core").UserPublicProfile> => {
  const params = new URLSearchParams();
  if (actor?.type) params.append("actor_type", actor.type);
  if (actor?.id) params.append("actor_id", actor.id);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<import("./core").UserPublicProfile>(`/users/${userId}/public${query}`, "GET", token);
};

import { apiRequest, Conversation, Message, ExtendedConversation } from "./core";
export type { ExtendedConversation };

export const getConversations = async (token: string): Promise<Conversation[]> => {
  return apiRequest<Conversation[]>("/messages/conversations", "GET", token);
};

export const getAllConversations = async (token: string): Promise<ExtendedConversation[]> => {
  return apiRequest<ExtendedConversation[]>("/messages/all-conversations", "GET", token);
};

export const getMessagesWith = async (
  token: string,
  otherUserId: string,
  entityType?: "user" | "business" | "artist"
): Promise<Message[]> => {
  const params = entityType ? `?entity_type=${entityType}` : "";
  return apiRequest<Message[]>(`/messages/with/${otherUserId}${params}`, "GET", token);
};

export const sendMessage = async (
  token: string,
  payload: {
    to_user_id?: string;
    to_business_id?: string;
    to_artist_id?: string;
    entity_type?: "user" | "business" | "artist";
    to_email?: string;
    text: string;
  }
): Promise<Message> => {
  return apiRequest<Message>("/messages", "POST", token, payload);
};

export const getUnreadMessageCount = async (token: string): Promise<{ unread_count: number }> => {
  return apiRequest<{ unread_count: number }>("/messages/unread-count", "GET", token);
};

export const markMessagesRead = async (
  token: string,
  otherUserId: string,
  entityType?: "user" | "business" | "artist"
): Promise<{ marked_read: number }> => {
  const params = entityType ? `?entity_type=${entityType}` : "";
  return apiRequest<{ marked_read: number }>(`/messages/mark-read/${otherUserId}${params}`, "POST", token);
};

export const deleteConversation = async (
  token: string,
  otherUserId: string,
  entityType?: "user" | "business" | "artist"
): Promise<{ message: string; deleted_count: number }> => {
  const params = entityType ? `?entity_type=${entityType}` : "";
  return apiRequest<{ message: string; deleted_count: number }>(`/messages/conversation/${otherUserId}${params}`, "DELETE", token);
};

export const deleteMessage = async (token: string, messageId: string): Promise<{ message: string; message_id: string }> => {
  return apiRequest<{ message: string; message_id: string }>(`/messages/${messageId}`, "DELETE", token);
};

export const editMessage = async (token: string, messageId: string, text: string): Promise<Message> => {
  return apiRequest<Message>(`/messages/${messageId}`, "PUT", token, { text });
};

export const deleteCallHistory = async (token: string, callId: string): Promise<{ message: string; call_id: string }> => {
  return apiRequest<{ message: string; call_id: string }>(`/calls/history/${callId}`, "DELETE", token);
};

export const deleteAllCallHistory = async (token: string): Promise<{ message: string; deleted_count: number }> => {
  return apiRequest<{ message: string; deleted_count: number }>("/calls/history", "DELETE", token);
};

export const setTypingStatus = async (token: string, toUserId: string, isTyping: boolean): Promise<{ success: boolean }> => {
  return apiRequest("/messages/typing", "POST", token, { to_user_id: toUserId, is_typing: isTyping });
};

export const getTypingStatus = async (token: string, otherUserId: string): Promise<{ is_typing: boolean }> => {
  return apiRequest<{ is_typing: boolean }>(`/messages/typing/${otherUserId}`, "GET", token);
};

export const sendMediaMessage = async (
  token: string,
  toUserId: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "audio",
  text?: string,
  entityType?: "user" | "business" | "artist"
): Promise<Message> => {
  const payload: Record<string, string> = {
    media_url: mediaUrl,
    media_type: mediaType,
    text: text || "",
  };
  if (entityType === "business") {
    payload.to_business_id = toUserId;
    payload.entity_type = "business";
  } else if (entityType === "artist") {
    payload.to_artist_id = toUserId;
    payload.entity_type = "artist";
  } else {
    payload.to_user_id = toUserId;
    payload.entity_type = "user";
  }
  return apiRequest<Message>("/messages/media", "POST", token, payload);
};

export const getMessageReadStatus = async (
  token: string,
  messageId: string
): Promise<{ message_id: string; read: boolean; read_at: string | null }> => {
  return apiRequest(`/messages/read-status/${messageId}`, "GET", token);
};

export const markMessagesAsRead = async (token: string, otherUserId: string): Promise<{ marked_read: number }> => {
  return apiRequest(`/messages/mark-read/${otherUserId}`, "POST", token);
};

export const getUnreadCount = async (token: string): Promise<{ unread_count: number }> => {
  return apiRequest("/messages/unread-count", "GET", token);
};

export const markGroupRead = async (token: string, conversationId: string, convType: "activity" | "event"): Promise<{ marked_read: boolean }> => {
  return apiRequest(`/messages/mark-group-read/${conversationId}?conv_type=${convType}`, "POST", token);
};

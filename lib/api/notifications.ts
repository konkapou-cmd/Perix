import { apiRequest } from "./core";
export type { ActivityFeedResponse, ActivityItemType } from "./core";

export const getActivityFeed = async (token: string, limit: number = 5): Promise<import("./core").ActivityFeedResponse> => {
  return apiRequest<import("./core").ActivityFeedResponse>(`/notifications/activity-feed?limit=${limit}`, "GET", token);
};

export const markNotificationsRead = async (
  token: string,
  notificationIds?: string[],
  markAll?: boolean
): Promise<{ success: boolean; marked_count: number }> => {
  return apiRequest<{ success: boolean; marked_count: number }>(
    "/notifications/mark-read", "POST", token,
    { notification_ids: notificationIds || [], mark_all: markAll || false }
  );
};

export const registerPushToken = async (
  token: string,
  pushToken: string,
  platform: "ios" | "android" | "web"
): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>("/users/push-token", "POST", token, { push_token: pushToken, platform });
};

export const unregisterPushToken = async (token: string, pushToken: string): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>("/users/push-token", "DELETE", token, { push_token: pushToken });
};

export type NotificationPrefs = {
  messages: boolean;
  events: boolean;
  activities: boolean;
  friendRequests: boolean;
  calls: boolean;
  marketing: boolean;
  messages_quiet_hours_mode?: string;
  messages_quiet_hours_start?: string;
  messages_quiet_hours_end?: string;
};

export const getNotificationPreferences = async (token: string): Promise<NotificationPrefs> => {
  return apiRequest<NotificationPrefs>("/users/notification-preferences", "GET", token);
};

export const updateNotificationPreferences = async (token: string, prefs: NotificationPrefs): Promise<NotificationPrefs> => {
  return apiRequest<NotificationPrefs>("/users/notification-preferences", "PUT", token, prefs);
};

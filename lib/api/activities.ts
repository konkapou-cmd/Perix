import { apiRequest, ActivityItem, ChatMessage } from "./core";
import { MapBounds } from "./events";

export const getActivities = async (
  token: string,
  mapBounds?: MapBounds,
  options?: {
    date?: string;
    theme?: string;
  }
): Promise<ActivityItem[]> => {
  const params = new URLSearchParams();
  if (mapBounds) {
    params.append("min_lat", mapBounds.minLat.toString());
    params.append("max_lat", mapBounds.maxLat.toString());
    params.append("min_lng", mapBounds.minLng.toString());
    params.append("max_lng", mapBounds.maxLng.toString());
  }
  if (options?.date) params.append("date", options.date);
  if (options?.theme) params.append("theme", options.theme);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<ActivityItem[]>(`/activities${query}`, "GET", token);
};

export const getUserActivities = async (token: string, userId: string): Promise<ActivityItem[]> => {
  return apiRequest<ActivityItem[]>(`/activities?creator_id=${encodeURIComponent(userId)}`, "GET", token);
};

export const createActivity = async (
  token: string,
  payload: {
    title: string;
    description?: string | null;
    date: string;
    time: string;
    location: string;
    cover_image_url?: string | null;
    image_urls?: string[];
    latitude: number | null;
    longitude: number | null;
    max_attendees?: number | null;
    invite_emails?: string[];
    is_private?: boolean;
    password?: string | null;
    theme?: string | null;
    custom_theme?: string | null;
    tagged_business_id?: string | null;
    gallery_images?: string[];
    gallery_videos?: string[];
    video_url?: string | null;
  }
): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>("/activities", "POST", token, payload);
};

export const updateActivity = async (
  token: string,
  activityId: string,
  payload: {
    title?: string | null;
    description?: string | null;
    date?: string | null;
    time?: string | null;
    location?: string | null;
    cover_image_url?: string | null;
    image_urls?: string[] | null;
    video_url?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    max_attendees?: number | null;
    is_private?: boolean | null;
    password?: string | null;
    theme?: string | null;
    custom_theme?: string | null;
    tagged_business_id?: string | null;
    gallery_images?: string[] | null;
    gallery_videos?: string[] | null;
  }
): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>(`/activities/${activityId}`, "PUT", token, payload);
};

export const deleteActivity = async (token: string, activityId: string): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/activities/${activityId}`, "DELETE", token);
};

export const getActivityDetail = async (token: string, activityId: string): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>(`/activities/${activityId}`, "GET", token);
};

export const joinActivityByCode = async (token: string, invitationCode: string): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>("/activities/join-by-code", "POST", token, { invitation_code: invitationCode });
};

export const rsvpActivity = async (token: string, activityId: string, status: string): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>(`/activities/${activityId}/rsvp`, "POST", token, { status });
};

export const getActivityMessages = async (token: string, activityId: string): Promise<ChatMessage[]> => {
  const msgs: any[] = await apiRequest<any[]>(`/activities/${activityId}/messages`, "GET", token);
  return msgs.map(m => ({ ...m, user_id: m.from_user_id || m.user_id }));
};

export const sendActivityMessage = async (token: string, activityId: string, text: string, mediaUrl?: string): Promise<ChatMessage> => {
  const payload: any = { text };
  if (mediaUrl) payload.media_url = mediaUrl;
  const msg: any = await apiRequest<any>(`/activities/${activityId}/messages`, "POST", token, payload);
  return { ...msg, user_id: msg.from_user_id || msg.user_id };
};

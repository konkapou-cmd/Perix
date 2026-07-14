import { apiRequest, EventItem, EventTheme, EventReminder } from "./core";

export type { EventItem };

export const EVENT_THEMES: Record<string, { emoji: string; label: string; color: string; gradient: [string, string] }> = {
  "business-event": { emoji: "💼", label: "Business Event", color: "#096BFF", gradient: ["#096BFF", "#0250CC"] },
  "arts-event": { emoji: "🎨", label: "Arts Event", color: "#7C4DFF", gradient: ["#7C4DFF", "#651FFF"] },
  "hip-hop": { emoji: "🎤", label: "Hip Hop", color: "#f59e0b", gradient: ["#f59e0b", "#d97706"] },
  "rnb": { emoji: "💜", label: "R&B", color: "#FF6B6B", gradient: ["#FF6B6B", "#7c3aed"] },
  "dance-edm": { emoji: "🎧", label: "Dance / EDM", color: "#06b6d4", gradient: ["#06b6d4", "#0891b2"] },
  "techno": { emoji: "⚡", label: "Techno", color: "#1f2937", gradient: ["#374151", "#1f2937"] },
  "latin": { emoji: "💃", label: "Latin", color: "#ef4444", gradient: ["#ef4444", "#dc2626"] },
  "afrobeat": { emoji: "🌍", label: "Afrobeat", color: "#22c55e", gradient: ["#22c55e", "#16a34a"] },
  "dancehall": { emoji: "🌴", label: "Dancehall", color: "#eab308", gradient: ["#eab308", "#ca8a04"] },
  "house": { emoji: "🏠", label: "House", color: "#3b82f6", gradient: ["#3b82f6", "#2563eb"] },
  "funk-disco": { emoji: "🪩", label: "Funk & Disco", color: "#ec4899", gradient: ["#ec4899", "#db2777"] },
  "reggaeton": { emoji: "🔥", label: "Reggaeton", color: "#f97316", gradient: ["#f97316", "#ea580c"] },
  "throwback": { emoji: "📼", label: "Throwback", color: "#a855f7", gradient: ["#a855f7", "#9333ea"] },
  "trap": { emoji: "🔊", label: "Trap", color: "#991b1b", gradient: ["#b91c1c", "#991b1b"] },
  "amapiano": { emoji: "🇿🇦", label: "Amapiano", color: "#10b981", gradient: ["#10b981", "#059669"] },
  "multi-genre": { emoji: "🎶", label: "Multi-Genre", color: "#6366f1", gradient: ["#6366f1", "#4f46e5"] },
  "tropical": { emoji: "🌺", label: "Tropical", color: "#14b8a6", gradient: ["#14b8a6", "#0d9488"] },
  "vip-luxury": { emoji: "👑", label: "VIP Night", color: "#d4af37", gradient: ["#d4af37", "#b8860b"] },
  "festival": { emoji: "🎪", label: "Festival", color: "#f472b6", gradient: ["#f472b6", "#ec4899"] },
  "greek-music": { emoji: "🇬🇷", label: "Greek Music", color: "#0284c7", gradient: ["#0284c7", "#0369a1"] },
  "international": { emoji: "🌐", label: "International", color: "#7c3aed", gradient: ["#7c3aed", "#6d28d9"] },
};

export const DEFAULT_EVENT_THEME = { emoji: "🎉", label: "Event", color: "#FF6B6B", gradient: ["#FF6B6B", "#7c3aed"] as [string, string] };

export const isUpcomingEvent = (event: EventItem): boolean => {
  const endTime = event.end_time || event.start_time;
  const end = new Date(endTime);
  const now = new Date();
  return end.getTime() + 86400000 > now.getTime();
};

export const isUpcomingActivity = (activity: { date?: string | null; time?: string | null }): boolean => {
  if (!activity.date) return true;
  const dateStr = activity.time ? `${activity.date}T${activity.time}` : activity.date;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getTime() + 86400000 > now.getTime();
};

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat?: number;
  centerLng?: number;
}

export const getEvents = async (
  token: string,
  businessId?: string,
  artistId?: string,
  mapBounds?: MapBounds,
  options?: {
    startAfter?: string;
    startBefore?: string;
    theme?: string;
  }
): Promise<EventItem[]> => {
  const params = new URLSearchParams();
  if (businessId) params.append("business_id", businessId);
  if (artistId) params.append("artist_id", artistId);
  if (mapBounds) {
    params.append("min_lat", mapBounds.minLat.toString());
    params.append("max_lat", mapBounds.maxLat.toString());
    params.append("min_lng", mapBounds.minLng.toString());
    params.append("max_lng", mapBounds.maxLng.toString());
  }
  if (options?.startAfter) params.append("start_after", options.startAfter);
  if (options?.startBefore) params.append("start_before", options.startBefore);
  if (options?.theme) params.append("theme", options.theme);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<EventItem[]>(`/events${query}`, "GET", token);
};

export const getEventDetail = async (token: string, eventId: string): Promise<EventItem> => {
  return apiRequest<EventItem>(`/events/${eventId}`, "GET", token);
};

export const createEvent = async (
  token: string,
  payload: {
    business_id?: string | null;
    artist_id?: string | null;
    title: string;
    description?: string | null;
    cover_image_url?: string | null;
    image_urls?: string[];
    video_url?: string | null;
    start_time: string;
    end_time?: string | null;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    theme?: string | null;
    gallery_images?: string[];
    gallery_videos?: string[];
    is_private?: boolean;
    password?: string | null;
    tagged_artist_ids?: string[];
    cover_focal_point?: { x: number; y: number };
  }
): Promise<EventItem> => {
  return apiRequest<EventItem>("/events", "POST", token, payload);
};

export const updateEvent = async (
  token: string,
  eventId: string,
  payload: {
    title?: string | null;
    description?: string | null;
    cover_image_url?: string | null;
    image_urls?: string[] | null;
    video_url?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    theme?: string | null;
    gallery_images?: string[] | null;
    gallery_videos?: string[] | null;
    is_private?: boolean;
    password?: string | null;
    tagged_artist_ids?: string[] | null;
    cover_focal_point?: { x: number; y: number };
  }
): Promise<EventItem> => {
  return apiRequest<EventItem>(`/events/${eventId}`, "PUT", token, payload);
};

export const getEventThemes = async (): Promise<EventTheme[]> => {
  return apiRequest<EventTheme[]>("/events/themes", "GET");
};

export const deleteEvent = async (token: string, eventId: string): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/events/${eventId}`, "DELETE", token);
};

export const getEventPublic = async (eventId: string): Promise<EventItem> => {
  const { API_BASE } = await import("./core");
  const response = await fetch(`${API_BASE}/events/${eventId}/public`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to fetch event");
  }
  return response.json();
};

export const toggleEventAttendance = async (
  token: string,
  eventId: string,
  password?: string
): Promise<{ is_attending: boolean; attendees_count: number }> => {
  const body = password ? { password } : undefined;
  return apiRequest<{ is_attending: boolean; attendees_count: number }>(`/events/${eventId}/attend`, "POST", token, body);
};

export const setEventReminder = async (
  token: string,
  eventId: string,
  minutesBefore: number = 60
): Promise<{ reminder_id: string; remind_at: string; minutes_before: number; message: string }> => {
  return apiRequest(`/events/${eventId}/quick-reminder?minutes_before=${minutesBefore}`, "POST", token);
};

export const createEventReminder = async (
  token: string,
  eventId: string,
  remindAt: string,
  reminderType: string = "push"
): Promise<EventReminder> => {
  return apiRequest<EventReminder>(`/events/${eventId}/reminders`, "POST", token, {
    remind_at: remindAt,
    reminder_type: reminderType,
  });
};

export const getEventReminders = async (token: string, eventId: string): Promise<EventReminder[]> => {
  return apiRequest<EventReminder[]>(`/events/${eventId}/reminders`, "GET", token);
};

export const deleteEventReminder = async (token: string, eventId: string, reminderId: string): Promise<{ message: string }> => {
  return apiRequest(`/events/${eventId}/reminders/${reminderId}`, "DELETE", token);
};

export const getMyEventReminders = async (token: string, status?: string): Promise<EventReminder[]> => {
  const params = status ? `?status=${status}` : "";
  return apiRequest<EventReminder[]>(`/events/reminders/my-reminders${params}`, "GET", token);
};

export const getEventMessages = async (token: string, eventId: string): Promise<import("./core").ChatMessage[]> => {
  return apiRequest<import("./core").ChatMessage[]>(`/events/${eventId}/messages`, "GET", token);
};

export const sendEventMessage = async (token: string, eventId: string, text: string, mediaUrl?: string): Promise<import("./core").ChatMessage> => {
  const payload: any = { text };
  if (mediaUrl) payload.media_url = mediaUrl;
  return apiRequest<import("./core").ChatMessage>(`/events/${eventId}/messages`, "POST", token, payload);
};

export const reportEvent = async (token: string, eventId: string, reason: string): Promise<{ success: boolean; message: string; report_id: string }> => {
  return apiRequest(`/events/${eventId}/report`, "POST", token, { reason });
};

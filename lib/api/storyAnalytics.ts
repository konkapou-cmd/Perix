import { apiRequest } from "./core";

export type StorySeenPayload = {
  watch_duration?: number;
  completed?: boolean;
};

export type StorySeenResponse = {
  success: boolean;
  tracked: boolean;
  reason?: string;
};

export type StoryAnalyticsData = {
  story_id: string;
  total_views: number;
  unique_viewers: number;
  completion_rate: number;
  average_watch_time: number;
  reactions: Record<string, number>;
  top_viewers: Array<{ user_id: string; name?: string; avatar?: string }>;
  views_timeline: Array<{ date: string; count: number }>;
};

export type StoryViewerItem = {
  user_id: string;
  name?: string;
  avatar?: string;
  viewed_at?: string;
  watch_duration?: number;
  completed?: boolean;
};

export type StoryViewersData = {
  viewers: StoryViewerItem[];
  total: number;
  has_more: boolean;
};

export type ActorStoryAnalytics = {
  story_id: string;
  media_type: string;
  created_at: string;
  views: number;
  reactions: number;
  completion_rate: number;
};

export type ActorAnalyticsData = {
  total_stories: number;
  total_views: number;
  total_reactions: number;
  average_completion_rate: number;
  stories: ActorStoryAnalytics[];
};

export const markStorySeen = async (
  token: string,
  storyId: string,
  payload?: StorySeenPayload
): Promise<StorySeenResponse> => {
  return apiRequest<StorySeenResponse>(
    `/story-analytics/${storyId}/seen`,
    "POST",
    token,
    payload || {}
  );
};

export const getStoryAnalytics = async (
  token: string,
  storyId: string
): Promise<StoryAnalyticsData> => {
  return apiRequest<StoryAnalyticsData>(
    `/story-analytics/${storyId}/analytics`,
    "GET",
    token
  );
};

export const getStoryViewers = async (
  token: string,
  storyId: string,
  limit: number = 20,
  skip: number = 0
): Promise<StoryViewersData> => {
  return apiRequest<StoryViewersData>(
    `/story-analytics/${storyId}/viewers?limit=${limit}&skip=${skip}`,
    "GET",
    token
  );
};

export const getActorAnalytics = async (
  token: string,
  actorType: string,
  days?: number
): Promise<ActorAnalyticsData> => {
  const params = new URLSearchParams({ actor_type: actorType });
  if (days) params.append("days", String(days));
  return apiRequest<ActorAnalyticsData>(
    `/story-analytics/analytics?${params.toString()}`,
    "GET",
    token
  );
};

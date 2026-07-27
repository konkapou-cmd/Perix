import { apiRequest, Story, GroupedStory, StoryReactionsResponse, STORY_REACTIONS } from "./core";

export type { Story, GroupedStory, StoryReactionsResponse };
export { STORY_REACTIONS };

export type StoryCreatePayload = {
  media_url?: string;
  mux_upload_id?: string;
  media_type: "image" | "video";
  text?: string;
  actor_type?: "user" | "business" | "artist";
  actor_id?: string;
  latitude?: number;
  longitude?: number;
  duration_seconds?: number;
  video_status?: string;
};

export const getStories = async (
  token: string,
  bounds?: { minLat?: number; maxLat?: number; minLng?: number; maxLng?: number }
): Promise<GroupedStory[]> => {
  const params = new URLSearchParams();
  if (bounds?.minLat != null) params.set("min_lat", String(bounds.minLat));
  if (bounds?.maxLat != null) params.set("max_lat", String(bounds.maxLat));
  if (bounds?.minLng != null) params.set("min_lng", String(bounds.minLng));
  if (bounds?.maxLng != null) params.set("max_lng", String(bounds.maxLng));
  const qs = params.toString();
  return apiRequest<GroupedStory[]>(`/stories${qs ? `?${qs}` : ""}`, "GET", token);
};

export const createStory = async (token: string, payload: StoryCreatePayload): Promise<Story> => {
  return apiRequest<Story>("/stories", "POST", token, payload);
};

export const getStory = async (token: string, storyId: string): Promise<Story> => {
  return apiRequest<Story>(`/stories/${storyId}`, "GET", token);
};

export const viewStory = async (token: string, storyId: string): Promise<{ success: boolean } | { tracked: false; reason: string }> => {
  return apiRequest(`/stories/${storyId}/view`, "POST", token, {});
};

export const reactToStory = async (token: string, storyId: string, emoji: string): Promise<{ success: boolean; emoji: string }> => {
  return apiRequest(`/stories/${storyId}/react`, "POST", token, { emoji });
};

export const deleteStory = async (token: string, storyId: string): Promise<{ success: boolean }> => {
  return apiRequest(`/stories/${storyId}`, "DELETE", token);
};

export const getMyStories = async (token: string, actorType: string = "user"): Promise<Story[]> => {
  return apiRequest<Story[]>(`/stories/my-stories?actor_type=${actorType}`, "GET", token);
};

export const getStoryReactions = async (token: string, storyId: string): Promise<StoryReactionsResponse> => {
  return apiRequest<StoryReactionsResponse>(`/stories/${storyId}/reactions`, "GET", token);
};

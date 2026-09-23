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

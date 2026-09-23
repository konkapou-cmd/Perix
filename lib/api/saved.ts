import { apiRequest } from "./core";

export type SavedItemData = {
  title?: string;
  cover_image_url?: string | null;
  start_time?: string;
  date?: string;
  location?: string | null;
  business_id?: string;
  job_type?: string;
  salary_range?: string | null;
  text?: string;
  image_url?: string | null;
  actor_name?: string;
  actor_avatar?: string | null;
  name?: string;
  logo_image?: string | null;
  category?: string;
  address?: string;
  profile_photo?: string | null;
};

export type SavedItem = {
  saved_id: string;
  user_id: string;
  item_type: "event" | "activity" | "job" | "post" | "business" | "user";
  item_id: string;
  created_at: string;
  item_data: SavedItemData | null;
};

export type SavedListResponse = {
  items: SavedItem[];
  total: number;
};

export const toggleSaved = async (
  token: string,
  itemType: string,
  itemId: string
): Promise<{ is_saved: boolean }> => {
  return apiRequest<{ is_saved: boolean }>("/saved/toggle", "POST", token, {
    item_type: itemType,
    item_id: itemId,
  });
};

export const checkSaved = async (
  token: string,
  itemType: string,
  itemId: string
): Promise<{ is_saved: boolean }> => {
  return apiRequest<{ is_saved: boolean }>(
    `/saved/check?item_type=${itemType}&item_id=${itemId}`,
    "GET",
    token
  );
};

export const batchCheckSaved = async (
  token: string,
  itemType: string,
  itemIds: string[]
): Promise<{ saved_ids: string[] }> => {
  return apiRequest<{ saved_ids: string[] }>(
    `/saved/batch-check?item_type=${itemType}&item_ids=${itemIds.join(",")}`,
    "GET",
    token
  );
};

export const getSavedItems = async (
  token: string,
  itemType?: string,
  limit: number = 50,
  offset: number = 0
): Promise<SavedListResponse> => {
  const params = new URLSearchParams();
  if (itemType) params.append("item_type", itemType);
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());
  return apiRequest<SavedListResponse>(`/saved?${params.toString()}`, "GET", token);
};

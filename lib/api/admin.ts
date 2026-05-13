import { apiRequest, User, Post } from "./core";
export type { AdminStats, ReportedUser, UserContentCounts } from "./core";

export const checkAdminStatus = async (token: string): Promise<{ is_admin: boolean }> => {
  return apiRequest("/admin/check", "GET", token);
};

export const getAdminStats = async (token: string): Promise<import("./core").AdminStats> => {
  return apiRequest<import("./core").AdminStats>("/admin/stats", "GET", token);
};

export const getReportedUsers = async (token: string): Promise<import("./core").ReportedUser[]> => {
  return apiRequest<import("./core").ReportedUser[]>("/admin/reports", "GET", token);
};

export const getAllUsers = async (
  token: string,
  search?: string,
  hiddenOnly?: boolean
): Promise<User[]> => {
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (hiddenOnly) params.append("hidden_only", "true");
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<User[]>(`/admin/users${query}`, "GET", token);
};

export const manageUser = async (
  token: string,
  userId: string,
  action: "hide" | "unhide" | "delete"
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>("/admin/users/manage", "POST", token, { user_id: userId, action });
};

export const getUserContentCounts = async (token: string, userId: string): Promise<import("./core").UserContentCounts> => {
  return apiRequest<import("./core").UserContentCounts>(`/admin/user-content-count/${userId}`, "GET", token);
};

export const getAllPosts = async (
  token: string,
  hiddenOnly?: boolean,
  userId?: string
): Promise<Post[]> => {
  const params = new URLSearchParams();
  if (hiddenOnly) params.append("hidden_only", "true");
  if (userId) params.append("user_id", userId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<Post[]>(`/admin/posts${query}`, "GET", token);
};

export const managePost = async (
  token: string,
  postId: string,
  action: "hide" | "unhide" | "delete"
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>("/admin/posts/manage", "POST", token, { post_id: postId, action });
};

export const dismissReport = async (token: string, reportId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest(`/admin/reports/${reportId}`, "DELETE", token);
};

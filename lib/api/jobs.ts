import { apiRequest } from "./core";
import type { MyApplication } from "./core";
import { MapBounds } from "./events";
export type { Job, JobApplication, MyApplication } from "./core";

export type JobsResponse = {
  jobs: import("./core").Job[];
  total: number;
};

export const getJobs = async (
  token: string,
  mapBounds?: MapBounds,
  filters?: { rootCategory?: string; subcategory?: string; latitude?: number; longitude?: number },
  skip?: number,
  limit?: number
): Promise<JobsResponse> => {
  const searchParams = new URLSearchParams();
  if (mapBounds) {
    searchParams.append("min_lat", String(mapBounds.minLat));
    searchParams.append("max_lat", String(mapBounds.maxLat));
    searchParams.append("min_lng", String(mapBounds.minLng));
    searchParams.append("max_lng", String(mapBounds.maxLng));
  }
  if (filters?.rootCategory) searchParams.append("root_category", filters.rootCategory);
  if (filters?.subcategory) searchParams.append("subcategory", filters.subcategory);
  if (filters?.latitude != null) searchParams.append("latitude", String(filters.latitude));
  if (filters?.longitude != null) searchParams.append("longitude", String(filters.longitude));
  if (skip != null) searchParams.append("skip", String(skip));
  if (limit != null) searchParams.append("limit", String(limit));
  const query = searchParams.toString();
  return apiRequest<JobsResponse>(`/jobs${query ? `?${query}` : ""}`, "GET", token);
};

export const getJob = async (token: string, jobId: string): Promise<import("./core").Job> => {
  return apiRequest<import("./core").Job>(`/jobs/${jobId}`, "GET", token);
};

export const getMyJobs = async (token: string): Promise<import("./core").Job[]> => {
  return apiRequest<import("./core").Job[]>("/jobs/my", "GET", token);
};

export const createJob = async (
  token: string,
  job: {
    title: string;
    description: string;
    cover_image?: string;
    image_urls?: string[];
    gallery_images?: string[];
    gallery_videos?: string[];
    video_url?: string;
    root_category: string;
    subcategory: string;
    expires_at?: string;
    job_type?: string;
    requirements?: string;
    salary_range?: string;
    work_location?: string;
    status?: string;
    cover_focal_point?: { x: number; y: number };
  }
): Promise<import("./core").Job> => {
  return apiRequest<import("./core").Job>("/jobs", "POST", token, job);
};

export const updateJob = async (
  token: string,
  jobId: string,
  data: {
    title?: string;
    description?: string;
    cover_image?: string;
    image_urls?: string[];
    gallery_images?: string[];
    gallery_videos?: string[];
    video_url?: string;
    root_category?: string;
    subcategory?: string;
    expires_at?: string;
    job_type?: string;
    requirements?: string;
    salary_range?: string;
    work_location?: string;
    status?: string;
    is_active?: boolean;
    cover_focal_point?: { x: number; y: number };
  }
): Promise<import("./core").Job> => {
  return apiRequest<import("./core").Job>(`/jobs/${jobId}`, "PUT", token, data);
};

export const deleteJob = async (token: string, jobId: string): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/jobs/${jobId}`, "DELETE", token);
};

export const applyToJob = async (
  token: string,
  jobId: string,
  application: { message: string; cv_url?: string; cover_letter_url?: string }
): Promise<{ success: boolean; message: string; application_id: string }> => {
  return apiRequest<{ success: boolean; message: string; application_id: string }>(`/jobs/${jobId}/apply`, "POST", token, application);
};

export const getJobApplications = async (token: string, jobId: string): Promise<import("./core").JobApplication[]> => {
  return apiRequest<import("./core").JobApplication[]>(`/jobs/${jobId}/applications`, "GET", token);
};
export const updateApplicationStatus = async (
  token: string,
  applicationId: string,
  status: string
): Promise<void> => {
  return apiRequest<void>('/jobs/applications/' + applicationId + '/status?status=' + status, 'PUT', token);
};
export const getMyApplications = async (token: string): Promise<MyApplication[]> => {
  return apiRequest<MyApplication[]>('/jobs/applications/my', 'GET', token);
};

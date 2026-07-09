import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { apiRequest, API_BASE, UploadProgress } from "./core";
import { uploadVideoToMux, MuxVideoUploadResult } from "./mux";
import { MEDIA_LIMITS } from "../constants/mediaLimits";

export const MAX_VIDEO_SIZE_MB = MEDIA_LIMITS.video.maxFileSizeMb;
export const MAX_VIDEO_SIZE_BYTES = MEDIA_LIMITS.video.maxFileSizeBytes;
export const MAX_STORY_VIDEO_SIZE_MB = MEDIA_LIMITS.story.maxFileSizeMb;
export const MAX_STORY_VIDEO_SIZE_BYTES = MEDIA_LIMITS.story.maxFileSizeBytes;
export const UPLOAD_TIMEOUT_MS = MEDIA_LIMITS.upload.timeoutMs;

export type VideoUploadResult = {
  url: string | null;
  mux_upload_id: string | null;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_thumbnail_url: string | null;
  video_status: "ready" | "processing";
};

export const uploadMedia = async (
  token: string,
  uri: string,
  resourceType: "image" | "video" | "document" | "audio",
  onProgress?: (progress: UploadProgress) => void
): Promise<string> => {
  if (!API_BASE) throw new Error("Backend URL missing");

  if (resourceType === "video") {
    const result = await uploadVideoMux(token, uri, undefined, onProgress);
    return result.url || `mux://${result.mux_upload_id}`;
  }

  const filename = uri.split("/").pop() || `upload.${resourceType === "document" ? "pdf" : resourceType === "audio" ? "m4a" : "jpg"}`;
  const lower = filename.toLowerCase();

  let mimeType = "image/jpeg";
  if (resourceType === "document") {
    mimeType = lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".doc") || lower.endsWith(".docx") ? "application/msword" : "application/octet-stream";
  } else if (resourceType === "audio") {
    mimeType = lower.endsWith(".mp3") ? "audio/mpeg" : lower.endsWith(".wav") ? "audio/wav" : lower.endsWith(".aac") ? "audio/aac" : lower.endsWith(".ogg") ? "audio/ogg" : "audio/m4a";
  }

  try {
    onProgress?.({ phase: "preparing", progress: 5 });

    if (Platform.OS !== "web") {
      const FileSystemL = require("expo-file-system/legacy");
      const fileInfo = await FileSystemL.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) throw new Error("File does not exist at URI: " + uri);

      let localUri = uri;
      if (uri.startsWith("content://") || uri.startsWith("ph://") || uri.startsWith("assets-library://")) {
        const cacheDir = FileSystemL.cacheDirectory;
        const ext = resourceType === "audio" ? "m4a" : "jpg";
        const tempPath = `${cacheDir}temp_upload_${Date.now()}.${ext}`;
        await FileSystemL.copyAsync({ from: uri, to: tempPath });
        localUri = tempPath;
      }

      onProgress?.({ phase: "uploading", progress: 20 });
      const formData = new FormData();
      formData.append("file", { uri: localUri, name: filename, type: mimeType } as any);
      formData.append("resource_type", resourceType);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      const response = await fetch(`${API_BASE}/media/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      onProgress?.({ phase: "processing", progress: 80 });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Upload failed with status ${response.status}`);
      }
      const result = await response.json();
      onProgress?.({ phase: "complete", progress: 100 });
      return result.url;
    }

    onProgress?.({ phase: "uploading", progress: 20 });
    const response = await fetch(uri);
    const blob = await response.blob();
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("resource_type", resourceType);
    onProgress?.({ phase: "uploading", progress: 50 });
    const uploadResponse = await fetch(`${API_BASE}/media/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    onProgress?.({ phase: "processing", progress: 80 });
    if (!uploadResponse.ok) {
      const errData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errData.detail || "Upload failed");
    }
    const data = await uploadResponse.json();
    onProgress?.({ phase: "complete", progress: 100 });
    return data.url;
  } catch (error: any) {
    console.error(`[uploadMedia] Error:`, error.message);
    throw error;
  }
};

export const uploadVideoMux = async (
  token: string,
  videoUri: string,
  contentRef?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<VideoUploadResult> => {
  const muxResult: MuxVideoUploadResult = await uploadVideoToMux(
    token,
    videoUri,
    contentRef,
    (p) => {
      onProgress?.({ phase: p.phase as any, progress: p.progress });
    }
  );

  return {
    url: muxResult.playback_url,
    mux_upload_id: muxResult.mux_upload_id,
    mux_asset_id: muxResult.mux_asset_id,
    mux_playback_id: muxResult.mux_playback_id,
    mux_thumbnail_url: muxResult.thumbnail_url,
    video_status: muxResult.status,
  };
};

export const uploadImageToCloudinary = async (token: string, imageBase64: string): Promise<string> => {
  const response = await apiRequest<{ url: string; resource_type: string }>(
    "/media/upload-base64",
    "POST",
    token,
    { image_base64: imageBase64, resource_type: "image" }
  );
  return response.url;
};

export const processVideo = async (
  token: string,
  videoUri: string,
  trimStart?: number,
  trimEnd?: number,
  filterName?: string,
  textOverlays?: Array<{text: string; x: number; y: number; color: string; fontSize: number; rotation: number}>
): Promise<string> => {
  if (!API_BASE) throw new Error("Backend URL missing");

  const formData = new FormData();
  formData.append("file", { uri: videoUri, name: "video.mp4", type: "video/mp4" } as any);
  if (trimStart != null) formData.append("trim_start", String(trimStart));
  if (trimEnd != null) formData.append("trim_end", String(trimEnd));
  if (filterName) formData.append("filter_name", filterName);
  if (textOverlays?.length) {
    formData.append("text_overlays_json", JSON.stringify(textOverlays));
  }

  const response = await fetch(`${API_BASE}/media/process-video`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || err.detail || "Video processing failed");
  }

  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Video processing failed");
  return result.processed_url;
};

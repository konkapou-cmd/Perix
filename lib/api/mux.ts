import { Platform } from "react-native";
import { apiRequest, API_BASE } from "./core";
import * as FileSystem from "expo-file-system/legacy";

const FileSystemUploadType = (FileSystem as any).FileSystemUploadType ?? { BINARY_CONTENT: 0, MULTIPART: 1 };

export type MuxUploadCreateResponse = {
  upload_id: string;
  upload_url: string;
};

export type MuxUploadConfirmResponse = {
  upload_id: string;
  asset_id: string | null;
  playback_id: string | null;
  playback_url: string | null;
  thumbnail_url: string | null;
  status: string;
  duration: number | null;
};

export type MuxAssetStatus = {
  asset_id: string | null;
  playback_id: string | null;
  playback_url: string | null;
  thumbnail_url: string | null;
  status: string;
  duration: number | null;
};

export type MuxVideoUploadResult = {
  playback_url: string | null;
  thumbnail_url: string | null;
  mux_upload_id: string;
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  status: "ready" | "processing";
};

export const createMuxUpload = async (
  token: string,
  contentRef?: string
): Promise<MuxUploadCreateResponse> => {
  return apiRequest<MuxUploadCreateResponse>("/mux/upload/create", "POST", token, {
    content_ref: contentRef || "",
  });
};

export const confirmMuxUpload = async (
  token: string,
  uploadId: string
): Promise<MuxUploadConfirmResponse> => {
  return apiRequest<MuxUploadConfirmResponse>("/mux/upload/confirm", "POST", token, {
    upload_id: uploadId,
  });
};

export const getMuxAssetStatus = async (
  token: string,
  assetId: string
): Promise<MuxAssetStatus> => {
  return apiRequest<MuxAssetStatus>(`/mux/asset/${assetId}`, "GET", token);
};

const uploadToMuxDirect = async (
  uploadUrl: string,
  videoUri: string,
  onProgress?: (progress: { phase: string; progress: number }) => void
): Promise<void> => {
  onProgress?.({ phase: "preparing", progress: 10 });

  let localUri = videoUri;

  // Convert content:// and ph:// URIs to file:// URIs
  if (videoUri.startsWith("content://") || videoUri.startsWith("ph://") || videoUri.startsWith("assets-library://")) {
    const ext = videoUri.endsWith(".mp4") ? "mp4"
      : videoUri.endsWith(".mov") ? "mov"
      : videoUri.endsWith(".3gp") ? "3gp"
      : "mp4";
    const tempPath = `${FileSystem.cacheDirectory}mux_upload_${Date.now()}.${ext}`;
    await FileSystem.copyAsync({ from: videoUri, to: tempPath });
    localUri = tempPath;
  }

  // Remote URLs should never reach here (handled by uploadVideoToMux)
  if (localUri.startsWith("http://") || localUri.startsWith("https://")) {
    return;
  }

  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists) {
    throw new Error("Video file not found at: " + localUri);
  }

  const fileSize = fileInfo.size || 0;
  const mimeType = localUri.endsWith(".mov") ? "video/quicktime" : "video/mp4";
  const filename = localUri.split("/").pop() || "upload.mp4";

  onProgress?.({ phase: "uploading", progress: 15 });

  // Use FileSystem.uploadAsync for React Native compatibility
  const result = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
    uploadType: FileSystemUploadType.BINARY_CONTENT as any,
    fieldName: "file",
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Mux upload failed with status ${result.status}: ${result.body?.substring(0, 200)}`);
  }

  onProgress?.({ phase: "processing", progress: 85 });

  // Clean up temp file if we created one
  if (localUri !== videoUri) {
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {}
  }
};

export const uploadVideoToMux = async (
  token: string,
  videoUri: string,
  contentRef?: string,
  onProgress?: (progress: { phase: string; progress: number }) => void
): Promise<MuxVideoUploadResult> => {
  // If the video is already a Mux playback URL, no need to re-upload
  const muxMatch = videoUri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)\.m3u8/);
  if (muxMatch) {
    const playbackId = muxMatch[1];
    onProgress?.({ phase: "complete", progress: 100 });
    return {
      playback_url: videoUri,
      thumbnail_url: `https://image.mux.com/${playbackId}/thumbnail.jpg`,
      mux_upload_id: "",
      mux_asset_id: null,
      mux_playback_id: playbackId,
      status: "ready",
    };
  }

  if (videoUri.startsWith("http://") || videoUri.startsWith("https://")) {
    onProgress?.({ phase: "complete", progress: 100 });
    return {
      playback_url: videoUri,
      thumbnail_url: null,
      mux_upload_id: "",
      mux_asset_id: null,
      mux_playback_id: null,
      status: "ready",
    };
  }

  onProgress?.({ phase: "preparing", progress: 5 });

  const { upload_id, upload_url } = await createMuxUpload(token, contentRef);

  if (!upload_url) {
    throw new Error("Failed to create Mux upload: no upload URL received");
  }

  onProgress?.({ phase: "uploading", progress: 10 });

  await uploadToMuxDirect(upload_url, videoUri, onProgress);

  onProgress?.({ phase: "processing", progress: 85 });

  let confirmResult: MuxUploadConfirmResponse;
  try {
    confirmResult = await confirmMuxUpload(token, upload_id);
  } catch (confirmErr: any) {
    // Retry confirm once — network errors are common here
    console.warn("[Mux] Confirm failed, retrying...", confirmErr?.message);
    try {
      await new Promise((r) => setTimeout(r, 2000));
      confirmResult = await confirmMuxUpload(token, upload_id);
    } catch (retryErr: any) {
      const isPollError = retryErr?.message?.includes("Video processing failed on Mux");
      if (isPollError) throw retryErr;
      throw new Error(retryErr?.message || "Mux upload confirmation failed");
    }
  }

  if (confirmResult.status === "ready" && confirmResult.playback_url) {
    onProgress?.({ phase: "complete", progress: 100 });
    return {
      playback_url: confirmResult.playback_url,
      thumbnail_url: confirmResult.thumbnail_url,
      mux_upload_id: upload_id,
      mux_asset_id: confirmResult.asset_id,
      mux_playback_id: confirmResult.playback_id,
      status: "ready",
    };
  }

  if (confirmResult.asset_id) {
    onProgress?.({ phase: "processing", progress: 90 });
    const maxAttempts = 30;
    const pollIntervalMs = 3000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      try {
        const status = await getMuxAssetStatus(token, confirmResult.asset_id);
        onProgress?.({ phase: "processing", progress: 90 + Math.round((attempt / maxAttempts) * 10) });
        if (status.status === "ready" && status.playback_url) {
          onProgress?.({ phase: "complete", progress: 100 });
          return {
            playback_url: status.playback_url,
            thumbnail_url: status.thumbnail_url,
            mux_upload_id: upload_id,
            mux_asset_id: status.asset_id,
            mux_playback_id: status.playback_id,
            status: "ready",
          };
        }
        if (status.status === "errored") {
          throw new Error("Video processing failed on Mux");
        }
      } catch (pollErr) {
        console.warn(`Poll attempt ${attempt + 1} failed:`, pollErr);
      }
    }
  }

  onProgress?.({ phase: "processing", progress: 90 });
  return {
    playback_url: null,
    thumbnail_url: confirmResult.thumbnail_url,
    mux_upload_id: upload_id,
    mux_asset_id: confirmResult.asset_id,
    mux_playback_id: confirmResult.playback_id,
    status: "processing",
  };
};
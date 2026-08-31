import { useState, useRef, useCallback } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadMedia, uploadVideoMux, VideoUploadResult } from "../lib/api/media";
import { getMuxAssetStatus } from "../lib/api/mux";
import { validateMedia, validateGalleryCount, validateVideoCount } from "../lib/media/mediaValidation";
import { generateTemporaryId } from "../lib/media/mediaResolver";
import { MEDIA_LIMITS } from "../lib/constants/mediaLimits";

export type UploadableItem = {
  temporaryId: string;
  uri: string;
  type: "image" | "video";
  fileSize?: number;
  duration?: number;
};

export type UploadedItem = {
  temporaryId: string;
  uri: string;
  type: "image" | "video";
  url?: string;
  muxUploadId?: string;
  muxAssetId?: string;
  muxPlaybackId?: string;
  thumbnailUrl?: string;
  processingStatus?: "processing" | "ready" | "failed";
};

type UseMediaUploaderOptions = {
  sessionToken?: string;
  maxItems?: number;
  maxVideos?: number;
  onProgress?: (phase: string, progress: number) => void;
};

export function useMediaUploader(options: UseMediaUploaderOptions = {}) {
  const {
    sessionToken,
    maxItems = MEDIA_LIMITS.gallery.maxItems,
    maxVideos = MEDIA_LIMITS.gallery.maxVideos,
    onProgress,
  } = options;

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<string>("idle");
  const pendingRef = useRef<UploadedItem[]>([]);
  const pollingRef = useRef<Set<string>>(new Set());

  const pickMedia = useCallback(
    async (
      mediaType: "image" | "video" | "mixed",
      currentItemCount: number,
      currentVideoCount: number,
    ): Promise<UploadableItem[]> => {
      const limitCheck = validateGalleryCount(currentItemCount, 1, maxItems);
      if (!limitCheck.valid) {
        Alert.alert("Limit", limitCheck.error);
        return [];
      }
      if (mediaType === "video" || mediaType === "mixed") {
        const videoCheck = validateVideoCount(currentVideoCount, 1, maxVideos);
        if (!videoCheck.valid) {
          Alert.alert("Limit", videoCheck.error);
          return [];
        }
      }

      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: mediaType === "video"
            ? ImagePicker.MediaTypeOptions.Videos
            : mediaType === "image"
            ? ImagePicker.MediaTypeOptions.Images
            : ImagePicker.MediaTypeOptions.All,
          quality: MEDIA_LIMITS.image.pickerQuality,
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
          allowsMultipleSelection: true,
          selectionLimit: maxItems - currentItemCount,
          videoMaxDuration: MEDIA_LIMITS.video.maxDurationSeconds,
        });

        if (result.canceled || !result.assets?.length) return [];

        const items: UploadableItem[] = [];
        for (const asset of result.assets) {
          const itemType = asset.duration != null ? "video" : ("image" as "image" | "video");
          const validation = validateMedia({
            type: itemType,
            uri: asset.uri,
            fileSize: asset.fileSize ?? undefined,
            duration: asset.duration ?? undefined,
          } as any);
          if (!validation.valid) {
            Alert.alert("Invalid media", validation.error);
            continue;
          }
          items.push({
            temporaryId: generateTemporaryId(),
            uri: asset.uri,
            type: itemType,
            fileSize: asset.fileSize,
            duration: asset.duration ?? undefined,
          });
        }
        return items;
      } catch (e: any) {
        console.error("[useMediaUploader] pickMedia error:", e.message);
        return [];
      }
    },
    [maxItems, maxVideos],
  );

  const uploadItem = useCallback(
    async (item: UploadableItem): Promise<UploadedItem> => {
      const reportedProgress = (phase: string, progress: number) => {
        setUploadPhase(phase);
        setUploadProgress(progress);
        onProgress?.(phase, progress);
      };

      try {
        if (item.type === "video") {
          reportedProgress("preparing", 5);
          const result: VideoUploadResult = await uploadVideoMux(
            sessionToken || "",
            item.uri,
            undefined,
            (p) => reportedProgress(p.phase, p.progress),
          );

          const uploaded: UploadedItem = {
            temporaryId: item.temporaryId,
            uri: item.uri,
            type: "video",
            url: result.url || undefined,
            muxUploadId: result.mux_upload_id || undefined,
            muxAssetId: result.mux_asset_id || undefined,
            muxPlaybackId: result.mux_playback_id || undefined,
            thumbnailUrl: result.mux_thumbnail_url || undefined,
            processingStatus: "processing",
          };

          if (result.video_status === "ready") {
            uploaded.processingStatus = "ready";
            reportedProgress("complete", 100);
          } else if (result.mux_asset_id) {
            reportedProgress("processing", 80);
            pollingRef.current.add(item.temporaryId);
            pollMuxStatus(item.temporaryId, result.mux_asset_id, sessionToken || "");
          }

          return uploaded;
        }

        reportedProgress("uploading", 20);
        const url = await uploadMedia(sessionToken || "", item.uri, "image", (p) => reportedProgress(p.phase, p.progress));
        reportedProgress("complete", 100);

        return {
          temporaryId: item.temporaryId,
          uri: item.uri,
          type: "image",
          url,
          processingStatus: "ready",
        };
      } catch (e: any) {
        console.error("[useMediaUploader] Upload failed:", e.message);
        return {
          temporaryId: item.temporaryId,
          uri: item.uri,
          type: item.type,
          processingStatus: "failed",
        };
      }
    },
    [sessionToken, onProgress],
  );

  const uploadMultiple = useCallback(
    async (items: UploadableItem[]): Promise<UploadedItem[]> => {
      setUploading(true);
      setUploadProgress(0);
      const results: UploadedItem[] = [];
      for (let i = 0; i < items.length; i++) {
        const result = await uploadItem(items[i]);
        results.push(result);
        setUploadProgress(Math.round(((i + 1) / items.length) * 100));
      }
      setUploading(false);
      setUploadPhase("idle");
      return results;
    },
    [uploadItem],
  );

  const pollMuxStatus = async (tempId: string, assetId: string, token: string) => {
    let attempts = 0;
    const maxAttempts = 60;

    const poll = async () => {
      if (!pollingRef.current.has(tempId)) return;

      try {
        const status = await getMuxAssetStatus(token, assetId);
        if (status.status === "ready") {
          pendingRef.current = pendingRef.current.map((p) =>
            p.temporaryId === tempId
              ? {
                  ...p,
                  processingStatus: "ready" as const,
                  url: status.playback_url || p.url,
                  thumbnailUrl: status.thumbnail_url || p.thumbnailUrl,
                }
              : p,
          );
          pollingRef.current.delete(tempId);
          setUploadPhase("complete");
          setUploadProgress(100);
          return;
        }
        if (status.status === "errored" || status.status === "failed") {
          pendingRef.current = pendingRef.current.map((p) =>
            p.temporaryId === tempId ? { ...p, processingStatus: "failed" as const } : p,
          );
          pollingRef.current.delete(tempId);
          return;
        }
      } catch (e) {
        console.warn("[useMediaUploader] Mux poll error:", e);
      }

      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 3000);
      } else {
        pendingRef.current = pendingRef.current.map((p) =>
          p.temporaryId === tempId ? { ...p, processingStatus: "failed" as const } : p,
        );
        pollingRef.current.delete(tempId);
      }
    };

    poll();
  };

  const cancelPolling = useCallback(() => {
    pollingRef.current.clear();
  }, []);

  return {
    uploading,
    uploadProgress,
    uploadPhase,
    pickMedia,
    uploadItem,
    uploadMultiple,
    cancelPolling,
  };
}

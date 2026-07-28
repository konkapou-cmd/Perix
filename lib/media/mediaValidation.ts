import { Platform } from "react-native";
import { MEDIA_LIMITS } from "../constants/mediaLimits";

export type FileValidationResult = {
  valid: boolean;
  error?: string;
};

export function validateImage(uri: string, fileSize?: number): FileValidationResult {
  const limit = MEDIA_LIMITS.image;
  if (fileSize != null && fileSize > limit.maxFileSizeBytes) {
    return {
      valid: false,
      error: `Image exceeds ${limit.maxFileSizeMb} MB limit (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`,
    };
  }
  return { valid: true };
}

export function validateVideo(
  uri: string,
  fileSize?: number,
  durationSeconds?: number,
): FileValidationResult {
  const limit = MEDIA_LIMITS.video;
  if (fileSize != null && fileSize > limit.maxFileSizeBytes) {
    return {
      valid: false,
      error: `Video exceeds ${limit.maxFileSizeMb} MB limit (${(fileSize / (1024 * 1024)).toFixed(1)} MB)`,
    };
  }
  if (durationSeconds != null && durationSeconds > limit.maxDurationSeconds) {
    return {
      valid: false,
      error: `Video exceeds ${limit.maxDurationSeconds}s duration limit (${durationSeconds}s)`,
    };
  }
  return { valid: true };
}

export function validateGalleryCount(
  currentCount: number,
  addCount: number,
  maxItems: number = MEDIA_LIMITS.gallery.maxItems,
): FileValidationResult {
  if (currentCount + addCount > maxItems) {
    return {
      valid: false,
      error: `Cannot add ${addCount} items. Maximum ${maxItems} total (currently ${currentCount}).`,
    };
  }
  return { valid: true };
}

export function validateVideoCount(
  currentVideoCount: number,
  addVideoCount: number,
  maxVideos: number = MEDIA_LIMITS.gallery.maxVideos,
): FileValidationResult {
  if (currentVideoCount + addVideoCount > maxVideos) {
    return {
      valid: false,
      error: `Cannot add ${addVideoCount} videos. Maximum ${maxVideos} total (currently ${currentVideoCount}).`,
    };
  }
  return { valid: true };
}

export function validateMedia(asset: { type: string; uri: string; fileSize?: number; duration?: number }): FileValidationResult {
  if (asset.type === "video") {
    return validateVideo(asset.uri, asset.fileSize, asset.duration);
  }
  return validateImage(asset.uri, asset.fileSize);
}

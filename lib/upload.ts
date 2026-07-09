/**
 * Centralized Upload Utility
 * All uploads go through Cloudinary for consistent storage and fast loading.
 */
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { uploadMedia, uploadImageToCloudinary, uploadVideoMux } from "./api";
import { MEDIA_LIMITS } from "./constants/mediaLimits";

export interface UploadResult {
  url: string;
  type: "image" | "video";
  width?: number;
  height?: number;
  ratio?: number;
  mux_upload_id?: string | null;
  mux_asset_id?: string | null;
  mux_playback_id?: string | null;
  mux_thumbnail_url?: string | null;
  video_status?: "ready" | "processing";
}

export interface UploadOptions {
  mediaTypes?: ImagePicker.MediaTypeOptions;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  useCamera?: boolean;
}

const DEFAULT_IMAGE_OPTIONS: UploadOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  allowsEditing: true,
  aspect: [4, 5],
  quality: MEDIA_LIMITS.image.pickerQuality,
};

const DEFAULT_VIDEO_OPTIONS: UploadOptions = {
  mediaTypes: ImagePicker.MediaTypeOptions.Videos,
  quality: MEDIA_LIMITS.video.pickerQuality,
};

/**
 * Request media library permission
 */
export async function requestMediaPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission Required",
      "Please allow access to your photo library to upload images and videos."
    );
    return false;
  }
  return true;
}

/**
 * Request camera permission
 */
export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission Required",
      "Please allow access to your camera to take photos and videos."
    );
    return false;
  }
  return true;
}

/**
 * Pick and upload an image to Cloudinary
 * Returns the Cloudinary URL
 */
export async function pickAndUploadImage(
  sessionToken: string,
  options: UploadOptions = {},
  onProgress?: (progress: number) => void
): Promise<UploadResult | null> {
  // Request permission
  const hasPermission = options.useCamera
    ? await requestCameraPermission()
    : await requestMediaPermission();
  
  if (!hasPermission) return null;

  const pickerOptions = {
    ...DEFAULT_IMAGE_OPTIONS,
    ...options,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    base64: true, // We need base64 for upload
    exif: false, // Don't include EXIF to reduce size
  };

  try {
    const result = options.useCamera
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    const asset = result.assets[0];
    onProgress?.(10);

    // Upload to Cloudinary
    const base64Data = asset.base64
      ? `data:image/jpeg;base64,${asset.base64}`
      : null;

    if (!base64Data) {
      throw new Error("No image data");
    }

    onProgress?.(30);
    const url = await uploadImageToCloudinary(sessionToken, base64Data);
    onProgress?.(100);

    return {
      url,
      type: "image",
      width: asset.width,
      height: asset.height,
      ratio: asset.width && asset.height ? asset.width / asset.height : undefined,
    };
  } catch (error) {
    console.error("[Upload] Image upload failed:", error);
    Alert.alert("Upload Failed", "Failed to upload image. Please try again.");
    return null;
  }
}

/**
 * Pick and upload a video to Cloudinary
 * Returns the Cloudinary URL
 */
export async function pickAndUploadVideo(
  sessionToken: string,
  options: UploadOptions = {},
  onProgress?: (progress: number) => void
): Promise<UploadResult | null> {
  // Request permission
  const hasPermission = options.useCamera
    ? await requestCameraPermission()
    : await requestMediaPermission();
  
  if (!hasPermission) return null;

  const pickerOptions = {
    ...DEFAULT_VIDEO_OPTIONS,
    ...options,
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
  };

  try {
    const result = options.useCamera
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    const asset = result.assets[0];
    onProgress?.(10);

    const muxResult = await uploadVideoMux(
      sessionToken,
      asset.uri,
      undefined,
      (p) => onProgress?.(10 + (p.progress || 0) * 0.9)
    );

    onProgress?.(100);

    return {
      url: muxResult.url || "",
      type: "video",
      width: asset.width,
      height: asset.height,
      ratio: asset.width && asset.height ? asset.width / asset.height : undefined,
      mux_upload_id: muxResult.mux_upload_id,
      mux_asset_id: muxResult.mux_asset_id,
      mux_playback_id: muxResult.mux_playback_id,
      mux_thumbnail_url: muxResult.mux_thumbnail_url,
      video_status: muxResult.video_status,
    };
  } catch (error) {
    console.error("[Upload] Video upload failed:", error);
    Alert.alert("Upload Failed", "Failed to upload video. Please try again.");
    return null;
  }
}

/**
 * Pick and upload any media (image or video)
 */
export async function pickAndUploadMedia(
  sessionToken: string,
  mediaType: "image" | "video" | "all" = "all",
  options: UploadOptions = {},
  onProgress?: (progress: number) => void
): Promise<UploadResult | null> {
  if (mediaType === "image") {
    return pickAndUploadImage(sessionToken, options, onProgress);
  } else if (mediaType === "video") {
    return pickAndUploadVideo(sessionToken, options, onProgress);
  }

  // For "all", let user pick either
  const hasPermission = options.useCamera
    ? await requestCameraPermission()
    : await requestMediaPermission();
  
  if (!hasPermission) return null;

  const pickerOptions = {
    ...options,
    mediaTypes: ImagePicker.MediaTypeOptions.All,
    quality: options.quality ?? 0.5,
    base64: true,
    exif: false,
  };

  try {
    const result = options.useCamera
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    const asset = result.assets[0];
    const isVideo = asset.type === "video" || asset.uri.includes("video");
    onProgress?.(10);

    if (isVideo) {
      const muxResult = await uploadVideoMux(
        sessionToken,
        asset.uri,
        undefined,
        (p) => onProgress?.(10 + (p.progress || 0) * 0.9)
      );
      return {
        url: muxResult.url || "",
        type: "video",
        width: asset.width,
        height: asset.height,
        ratio: asset.width && asset.height ? asset.width / asset.height : undefined,
        mux_upload_id: muxResult.mux_upload_id,
        mux_asset_id: muxResult.mux_asset_id,
        mux_playback_id: muxResult.mux_playback_id,
        mux_thumbnail_url: muxResult.mux_thumbnail_url,
        video_status: muxResult.video_status,
      };
    } else {
      const base64Data = asset.base64
        ? `data:image/jpeg;base64,${asset.base64}`
        : null;
      
      if (!base64Data) {
        throw new Error("No image data");
      }

      onProgress?.(30);
      const url = await uploadImageToCloudinary(sessionToken, base64Data);
      onProgress?.(100);

      return {
        url,
        type: "image",
        width: asset.width,
        height: asset.height,
        ratio: asset.width && asset.height ? asset.width / asset.height : undefined,
      };
    }
  } catch (error) {
    console.error("[Upload] Media upload failed:", error);
    Alert.alert("Upload Failed", "Failed to upload media. Please try again.");
    return null;
  }
}

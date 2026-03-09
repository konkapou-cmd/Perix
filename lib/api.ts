import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

// Production API URL with fallback
const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "https://api.perixapp.com";

const API_BASE = `${BACKEND_URL}/api`;

// Theme customization types
export type ProfileTheme = {
  background_color?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  text_color?: string | null;
  card_color?: string | null;
  gradient_start?: string | null;
  gradient_end?: string | null;
  use_gradient?: boolean;
};

export type User = {
  user_id: string;
  email: string;
  name: string;
  display_name?: string | null;
  picture?: string | null;
  created_at: string;
  gallery_images?: string[];
  gallery_videos?: string[];
  gallery_items?: GalleryItem[];  // New: images with captions
  video_items?: GalleryItem[];    // New: videos with captions
  tags?: string[];
  profile_photo?: string | null;
  cover_photo?: string | null;
  bio?: string | null;
  location?: string | null;
  theme?: ProfileTheme | null;  // Profile theme customization
};

export type GalleryItem = {
  url: string;
  caption?: string | null;
};

export type TaggedBusinessInfo = {
  business_id: string;
  name: string;
  logo_image?: string | null;
};

export type Post = {
  post_id: string;
  user_id: string;
  business_id?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  media_ratio?: number | null;
  tagged_user_ids?: string[];
  tagged_business_id?: string | null;
  tagged_business_ids?: string[];
  tagged_business?: TaggedBusinessInfo | null;
  text: string;
  image_base64?: string | null;
  image_url?: string | null;  // New: Cloudinary URL
  video_url?: string | null;
  created_at: string;
  author: User;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
};

export type PostComment = {
  comment_id: string;
  user_id: string;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  text: string;
  created_at: string;
  author?: User | null;
};

export type Story = {
  story_id: string;
  user_id: string;
  business_id?: string | null;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  image_base64?: string | null;  // Legacy
  image_url?: string | null;     // New - Cloudinary URL
  video_url?: string | null;
  text?: string | null;
  created_at: string;
  expires_at: string;
  author?: User | null;
};

export type UserPublicProfile = {
  user: User;
  posts: Post[];
  stories: Story[];
};

export type FriendCommon = {
  common: User[];
  is_friend: boolean;
};

export type ChatMessage = {
  message_id: string;
  user_id: string;
  text: string;
  created_at: string;
  author?: User | null;
  from_user_id?: string;
  user_name?: string;
};

export type Message = {
  message_id: string;
  from_user_id: string;
  to_user_id: string;
  text: string;
  created_at: string;
  edited_at?: string | null;
};

export type Conversation = {
  other_user: User;
  last_message: Message | string | null;
  unread_count?: number;
};

export type Business = {
  business_id: string;
  owner_id: string;
  name: string;
  category: string;
  root_category: string;
  subcategory: string;
  description?: string | null;
  logo_image?: string | null;
  cover_image?: string | null;
  profile_photo?: string | null;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  social_links?: Record<string, string> | null;
  opening_hours?: Record<string, string> | null;
  gallery_images?: string[];
  gallery_videos?: string[];
  tags?: string[];
  address: string;
  latitude: number;
  longitude: number;
  created_at: string;
  enabled_modules: {
    events: boolean;
    tickets: boolean;
    jobs: boolean;
    bookings: boolean;
    rentals: boolean;
    gym: boolean;
    salon: boolean;
  };
  subscription_status: string;
  trial_expires_at?: string | null;
  plan_type?: string | null;
  subscription_expires_at?: string | null;
  favorites_count?: number;
  theme?: ProfileTheme | null;  // Profile theme customization
};

export type BusinessDetail = {
  business: Business;
  events: EventItem[];
  posts: Post[];
  stories: Story[];
  is_owner: boolean;
  is_favorited: boolean;
};

export type CategoryGroup = {
  name: string;
  slug: string;
  subcategories: {
    name: string;
    slug: string;
    modules: Record<string, boolean>;
    tools: string[];
  }[];
};

export type EventItem = {
  event_id: string;
  business?: {
    business_id: string;
    name: string;
    category: string;
    root_category: string;
    subcategory: string;
    address: string;
    latitude: number;
    longitude: number;
  } | null;
  artist?: {
    artist_id: string;
    name: string;
    town?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  title: string;
  description?: string | null;
  image_base64: string;
  video_url?: string | null;
  start_time: string;
  end_time?: string | null;
  location?: string | null;
  created_at: string;
  attendees_count?: number;
  is_attending?: boolean;
  theme?: string | null;
};

export type EventTheme = {
  slug: string;
  label: string;
};

export type Artist = {
  artist_id: string;
  owner_id: string;
  name: string;
  bio?: string | null;
  genres: string[];
  socials: Record<string, string>;
  town?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  gallery_images: string[];
  fan_gallery: string[];
  video_urls: string[];
  profile_photo?: string | null;
  cover_photo?: string | null;
  created_at: string;
  theme?: ProfileTheme | null;  // Profile theme customization
};

export type ArtistDetail = {
  artist: Artist;
  events: EventItem[];
  stories: Story[];
};

export type BookingRequest = {
  request_id: string;
  artist_id: string;
  requester_id: string;
  event_date?: string | null;
  message: string;
  contact_email?: string | null;
  status: string;
  created_at: string;
};

export type SubscriptionPlans = {
  monthly_plan_id: string;
  yearly_plan_id: string;
  trial_days: number;
  monthly_price: number;
  yearly_price: number;
  currency: string;
};

export type SubscriptionResponse = {
  subscription_id: string;
  approval_url: string;
  status: string;
};

export type ActivityInvite = {
  user_id?: string | null;
  email?: string | null;
  status: string;
};

export type TaggedBusinessInActivity = {
  business_id: string;
  name: string;
  logo_image?: string | null;
};

// Activity themes with colors, emojis, and gradients
export const ACTIVITY_THEMES = {
  birthday: { emoji: "🎂", label: "Birthday Party", color: "#ec4899", gradient: ["#ec4899", "#db2777"] },
  dinner: { emoji: "🍽️", label: "Dinner", color: "#f59e0b", gradient: ["#f59e0b", "#d97706"] },
  cinema: { emoji: "🎬", label: "Cinema Night", color: "#6366f1", gradient: ["#6366f1", "#4f46e5"] },
  party: { emoji: "🎉", label: "Party", color: "#8b5cf6", gradient: ["#8b5cf6", "#7c3aed"] },
  sports: { emoji: "🏃", label: "Sports", color: "#10b981", gradient: ["#10b981", "#059669"] },
  coffee: { emoji: "☕", label: "Coffee/Hangout", color: "#78350f", gradient: ["#92400e", "#78350f"] },
  travel: { emoji: "✈️", label: "Travel", color: "#0ea5e9", gradient: ["#0ea5e9", "#0284c7"] },
  game: { emoji: "🎮", label: "Game Night", color: "#dc2626", gradient: ["#dc2626", "#b91c1c"] },
  music: { emoji: "🎵", label: "Concert/Music", color: "#7c3aed", gradient: ["#7c3aed", "#6d28d9"] },
  outdoor: { emoji: "🏕️", label: "Outdoor Activity", color: "#059669", gradient: ["#059669", "#047857"] },
  custom: { emoji: "✨", label: "Custom", color: "#6b7280", gradient: ["#6b7280", "#4b5563"] },
};

export type ActivityItem = {
  activity_id: string;
  creator_id: string;
  title: string;
  description?: string | null;
  date: string;
  time: string;
  start_time?: string | null;
  location?: string | null;
  image_base64?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  max_attendees?: number | null;
  invites: ActivityInvite[];
  created_at: string;
  my_status: string;
  is_creator: boolean;
  creator?: {
    user_id: string;
    name: string;
    profile_photo?: string | null;
  } | null;
  // New fields
  is_private?: boolean;
  invitation_code?: string | null;  // Only visible to creator
  theme?: string | null;
  custom_theme?: string | null;
  tagged_business?: TaggedBusinessInActivity | null;
};

type AuthResponse = {
  user: User;
  session_token: string;
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
};

const apiRequest = async <T>(
  path: string,
  method: string,
  token?: string | null,
  body?: unknown
): Promise<T> => {
  if (!BACKEND_URL || !API_BASE) {
    throw new Error("Backend URL not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    let message = "Request failed";
    if (data?.detail) {
      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        message = data.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(", ");
      } else if (typeof data.detail === "object") {
        message = JSON.stringify(data.detail);
      }
    }
    throw new Error(message);
  }

  return data as T;
};

// Chunk size for chunked uploads (5MB - larger chunks for faster uploads)
const CHUNK_SIZE = 5 * 1024 * 1024;

// Threshold for using chunked uploads (10MB - use chunks for larger files)
const CHUNKED_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

// No video file size limit - streaming upload handles any size

export type UploadProgress = {
  phase: "preparing" | "uploading" | "processing" | "complete";
  progress: number; // 0-100
  chunksUploaded?: number;
  totalChunks?: number;
};

export const uploadMedia = async (
  token: string,
  uri: string,
  resourceType: "image" | "video" | "document" | "audio",
  onProgress?: (progress: UploadProgress) => void
): Promise<string> => {
  if (!API_BASE) {
    throw new Error("Backend URL missing");
  }
  
  // Extract filename from URI
  const filename =
    uri.split("/").pop() ||
    `upload.${resourceType === "video" ? "mp4" : resourceType === "document" ? "pdf" : resourceType === "audio" ? "m4a" : "jpg"}`;
  const lower = filename.toLowerCase();
  
  // Determine MIME type based on file extension
  let mimeType = "image/jpeg";
  if (resourceType === "video") {
    if (lower.endsWith(".mov")) {
      mimeType = "video/quicktime";
    } else if (lower.endsWith(".m4v")) {
      mimeType = "video/x-m4v";
    } else {
      mimeType = "video/mp4";
    }
  } else if (resourceType === "document") {
    if (lower.endsWith(".pdf")) {
      mimeType = "application/pdf";
    } else if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
      mimeType = "application/msword";
    } else {
      mimeType = "application/octet-stream";
    }
  } else if (resourceType === "audio") {
    if (lower.endsWith(".mp3")) {
      mimeType = "audio/mpeg";
    } else if (lower.endsWith(".wav")) {
      mimeType = "audio/wav";
    } else if (lower.endsWith(".aac")) {
      mimeType = "audio/aac";
    } else if (lower.endsWith(".ogg")) {
      mimeType = "audio/ogg";
    } else {
      mimeType = "audio/m4a";
    }
  }

  console.log(`[uploadMedia] Starting upload: ${resourceType}, uri: ${uri.substring(0, 50)}...`);
  console.log(`[uploadMedia] Filename: ${filename}, MIME: ${mimeType}, Platform: ${Platform.OS}`);

  try {
    onProgress?.({ phase: "preparing", progress: 5 });
    
    // For mobile platforms, use FormData with file URI directly
    if (Platform.OS !== "web") {
      // Use legacy API for expo-file-system (compatible with SDK 54+)
      const FileSystem = require('expo-file-system/legacy');
      
      // Check if file exists and get file size
      const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
      if (!fileInfo.exists) {
        throw new Error("File does not exist at URI: " + uri);
      }
      const fileSize = fileInfo.size || 0;
      console.log(`[uploadMedia] File size: ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
      
      // For videos larger than threshold, use chunked upload
      if (resourceType === "video" && fileSize > CHUNKED_UPLOAD_THRESHOLD) {
        console.log(`[uploadMedia] File exceeds ${CHUNKED_UPLOAD_THRESHOLD / (1024 * 1024)}MB threshold, using chunked upload`);
        return await uploadVideoChunked(token, uri, filename, mimeType, onProgress);
      }
      
      // Handle different URI schemes (content://, ph://)
      let localUri = uri;
      if (uri.startsWith('content://') || uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
        const cacheDir = FileSystem.cacheDirectory;
        const ext = resourceType === "video" ? "mp4" : "jpg";
        const tempPath = `${cacheDir}temp_upload_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: tempPath });
        localUri = tempPath;
        console.log(`[uploadMedia] Copied to cache: ${tempPath}`);
      }
      
      onProgress?.({ phase: "uploading", progress: 20 });
      
      // Use FormData with file object - this is the most reliable method
      const formData = new FormData();
      formData.append("file", {
        uri: localUri,
        name: filename,
        type: mimeType,
      } as any);
      formData.append("resource_type", resourceType);
      
      console.log(`[uploadMedia] Sending to /media/upload...`);
      onProgress?.({ phase: "uploading", progress: 50 });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout for larger files
      
      const response = await fetch(`${API_BASE}/media/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type - let fetch set it with boundary for FormData
        },
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      onProgress?.({ phase: "processing", progress: 80 });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error(`[uploadMedia] Upload failed:`, response.status, errData);
        throw new Error(errData.detail || `Upload failed with status ${response.status}`);
      }
      
      const result = await response.json();
      console.log(`[uploadMedia] Upload success: ${result.url?.substring(0, 50)}...`);
      
      onProgress?.({ phase: "complete", progress: 100 });
      return result.url;
    }
    
    // For web platform
    onProgress?.({ phase: "uploading", progress: 20 });
    
    const response = await fetch(uri);
    const blob = await response.blob();
    const fileSize = blob.size;
    console.log(`[uploadMedia] Web file size: ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
    
    // For videos larger than threshold on web, use chunked upload
    if (resourceType === "video" && fileSize > CHUNKED_UPLOAD_THRESHOLD) {
      console.log(`[uploadMedia] File exceeds ${CHUNKED_UPLOAD_THRESHOLD / (1024 * 1024)}MB threshold, using chunked upload`);
      return await uploadVideoChunked(token, uri, filename, mimeType, onProgress);
    }
    
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("resource_type", resourceType);
    
    onProgress?.({ phase: "uploading", progress: 50 });
    
    const uploadResponse = await fetch(`${API_BASE}/media/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
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

/**
 * Upload a video file using chunked uploads to handle large files.
 * This breaks the file into smaller chunks to avoid proxy timeouts.
 * 
 * CRITICAL FIX (Dec 2025): The previous implementation used FileSystem.readAsStringAsync
 * with position/length parameters, which DO NOT WORK on iOS (they return the entire file).
 * 
 * NEW APPROACH: Use FileSystem.uploadAsync with FormData for mobile platforms.
 * This sends the entire file using the native network stack, which:
 * 1. Streams the file efficiently without loading into JS memory
 * 2. Works on both iOS and Android
 * 3. Handles files up to 300MB+
 * 
 * For very large files (>50MB), we use the backend's chunked upload with a different strategy:
 * We split the file on device using FileSystem operations and upload sequentially.
 */
async function uploadVideoChunked(
  token: string,
  uri: string,
  filename: string,
  mimeType: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  console.log(`[uploadVideoChunked] Starting upload for ${filename}`);
  console.log(`[uploadVideoChunked] Original URI: ${uri.substring(0, 80)}...`);
  onProgress?.({ phase: "preparing", progress: 0 });

  let fileSize: number;
  let localUri: string = uri;
  let tempFileCreated = false;

  if (Platform.OS !== "web") {
    // Use legacy API for expo-file-system (SDK 54+ deprecates main module)
    const FileSystem = require('expo-file-system/legacy');
    
    try {
      // Copy to cache if needed (for content://, ph://, assets-library:// URIs)
      const needsCopy = uri.startsWith('content://') || 
                        uri.startsWith('ph://') || 
                        uri.startsWith('assets-library://') ||
                        !uri.startsWith('file://');
      
      if (needsCopy) {
        const cacheDir = FileSystem.cacheDirectory;
        const ext = filename.split('.').pop() || 'mp4';
        const tempPath = `${cacheDir}upload_temp_${Date.now()}.${ext}`;
        console.log(`[uploadVideoChunked] Copying to cache...`);
        
        await FileSystem.copyAsync({ from: uri, to: tempPath });
        localUri = tempPath;
        tempFileCreated = true;
        console.log(`[uploadVideoChunked] Copy complete: ${tempPath}`);
      }
      
      // Get file size
      const fileInfo = await FileSystem.getInfoAsync(localUri, { size: true });
      console.log(`[uploadVideoChunked] File info:`, JSON.stringify(fileInfo));
      
      if (!fileInfo.exists) {
        throw new Error("File not found after copy");
      }
      fileSize = fileInfo.size || 0;
      
      if (fileSize === 0) {
        throw new Error("File size is 0 - file may be corrupted");
      }
      
      console.log(`[uploadVideoChunked] File size: ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
      
    } catch (error: any) {
      console.error(`[uploadVideoChunked] Failed to prepare file:`, error);
      if (tempFileCreated && localUri) {
        try {
          await FileSystem.deleteAsync(localUri, { idempotent: true });
        } catch (e) {}
      }
      throw new Error(`Failed to prepare video file: ${error.message}`);
    }

    onProgress?.({ phase: "preparing", progress: 10 });

    // For files under 50MB, use direct upload with FileSystem.uploadAsync
    // This is more reliable than chunked upload for smaller files
    const DIRECT_UPLOAD_THRESHOLD = 50 * 1024 * 1024; // 50MB
    
    if (fileSize <= DIRECT_UPLOAD_THRESHOLD) {
      console.log(`[uploadVideoChunked] File under 50MB, using direct upload`);
      
      try {
        onProgress?.({ phase: "uploading", progress: 20 });
        
        // Use FileSystem.uploadAsync which streams the file natively
        const uploadResult = await FileSystem.uploadAsync(
          `${API_BASE}/media/upload`,
          localUri,
          {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            parameters: {
              resource_type: 'video',
            },
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        
        onProgress?.({ phase: "processing", progress: 80 });
        
        if (uploadResult.status !== 200) {
          const errData = JSON.parse(uploadResult.body || '{}');
          throw new Error(errData.detail || `Upload failed with status ${uploadResult.status}`);
        }
        
        const result = JSON.parse(uploadResult.body);
        console.log(`[uploadVideoChunked] Direct upload success: ${result.url?.substring(0, 60)}...`);
        
        // Cleanup temp file
        if (tempFileCreated) {
          try {
            await FileSystem.deleteAsync(localUri, { idempotent: true });
          } catch (e) {}
        }
        
        onProgress?.({ phase: "complete", progress: 100 });
        return result.url;
        
      } catch (directError: any) {
        console.error(`[uploadVideoChunked] Direct upload failed:`, directError.message);
        // Fall through to chunked upload
        console.log(`[uploadVideoChunked] Falling back to chunked upload...`);
      }
    }

    // For larger files (>50MB) or if direct upload failed, use chunked upload
    // NEW STRATEGY: Read the entire file once and split in memory
    // This works because we're only reading ONE file at a time (not multiple)
    console.log(`[uploadVideoChunked] Using chunked upload strategy`);
    
    const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(fileSize / UPLOAD_CHUNK_SIZE);
    console.log(`[uploadVideoChunked] Will upload in ${totalChunks} chunks of 5MB each`);

    // Step 1: Initialize upload session
    onProgress?.({ phase: "preparing", progress: 15 });
    
    const initForm = new FormData();
    initForm.append("filename", filename);
    initForm.append("file_size", fileSize.toString());
    initForm.append("total_chunks", totalChunks.toString());
    initForm.append("resource_type", "video");
    initForm.append("content_type", mimeType);

    console.log(`[uploadVideoChunked] Initializing upload session...`);
    const initResponse = await fetch(`${API_BASE}/uploads/init`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: initForm,
    });

    if (!initResponse.ok) {
      const errData = await initResponse.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to initialize upload");
    }

    const { upload_id } = await initResponse.json();
    console.log(`[uploadVideoChunked] Upload session initialized: ${upload_id}`);

    // Step 2: Read file as base64 (unfortunately necessary for React Native)
    // Note: This works because we're reading ONE file, not accumulating multiple
    console.log(`[uploadVideoChunked] Reading file as base64...`);
    onProgress?.({ phase: "preparing", progress: 20 });
    
    let fullBase64: string;
    try {
      fullBase64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      console.log(`[uploadVideoChunked] Read ${fullBase64.length} base64 chars`);
    } catch (readError: any) {
      console.error(`[uploadVideoChunked] Failed to read file:`, readError.message);
      await fetch(`${API_BASE}/uploads/cancel/${upload_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
      throw new Error(`Failed to read video file: ${readError.message}`);
    }

    // Step 3: Upload chunks
    onProgress?.({ phase: "uploading", progress: 25, chunksUploaded: 0, totalChunks });
    
    // Calculate base64 chunk size (base64 is ~4/3 larger than binary)
    const base64ChunkSize = Math.ceil(UPLOAD_CHUNK_SIZE * 4 / 3);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * base64ChunkSize;
      const end = Math.min(start + base64ChunkSize, fullBase64.length);
      const chunkBase64 = fullBase64.substring(start, end);
      
      console.log(`[uploadVideoChunked] === CHUNK ${i + 1}/${totalChunks} ===`);
      console.log(`[uploadVideoChunked] Base64 offset: ${start}-${end}, length: ${chunkBase64.length}`);
      
      let retries = 3;
      while (retries > 0) {
        try {
          const chunkForm = new FormData();
          chunkForm.append("upload_id", upload_id);
          chunkForm.append("chunk_index", i.toString());
          chunkForm.append("chunk_base64", chunkBase64);
          chunkForm.append("chunk_filename", `chunk_${i}`);
          
          const chunkResponse = await fetch(`${API_BASE}/uploads/chunk`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: chunkForm,
          });
          
          if (!chunkResponse.ok) {
            const errData = await chunkResponse.json().catch(() => ({}));
            throw new Error(errData.detail || `Server rejected chunk ${i + 1}`);
          }
          
          console.log(`[uploadVideoChunked] Chunk ${i + 1} uploaded successfully!`);
          
          // Update progress (chunks take 25-85% of the progress bar)
          const chunkProgress = 25 + Math.round((i + 1) / totalChunks * 60);
          onProgress?.({ 
            phase: "uploading", 
            progress: chunkProgress, 
            chunksUploaded: i + 1, 
            totalChunks 
          });
          
          break; // Success, exit retry loop
          
        } catch (chunkError: any) {
          retries--;
          console.error(`[uploadVideoChunked] Chunk ${i + 1} failed (${retries} retries left):`, chunkError.message);
          
          if (retries === 0) {
            console.log(`[uploadVideoChunked] All retries exhausted, cancelling upload...`);
            await fetch(`${API_BASE}/uploads/cancel/${upload_id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
            
            if (tempFileCreated) {
              await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
            }
            
            throw new Error(`Upload failed at chunk ${i + 1}/${totalChunks}: ${chunkError.message}`);
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Free memory
    fullBase64 = '';

    // Step 4: Complete upload
    console.log(`[uploadVideoChunked] All ${totalChunks} chunks uploaded, finalizing...`);
    onProgress?.({ phase: "processing", progress: 90 });
    
    const completeForm = new FormData();
    completeForm.append("upload_id", upload_id);
    
    const completeResponse = await fetch(`${API_BASE}/uploads/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: completeForm,
    });
    
    if (!completeResponse.ok) {
      const errData = await completeResponse.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to complete upload");
    }
    
    const { url } = await completeResponse.json();
    console.log(`[uploadVideoChunked] Upload complete! URL: ${url?.substring(0, 60)}...`);
    
    // Clean up temp file
    if (tempFileCreated) {
      try {
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        console.log(`[uploadVideoChunked] Cleaned up temp file`);
      } catch (cleanupError) {
        console.warn(`[uploadVideoChunked] Failed to clean up temp file:`, cleanupError);
      }
    }
    
    onProgress?.({ phase: "complete", progress: 100 });
    return url;
    
  } else {
    // Web platform: Use Blob slicing for chunked uploads
    console.log(`[uploadVideoChunked] Web platform - using Blob slicing`);
    
    const response = await fetch(uri);
    const blob = await response.blob();
    fileSize = blob.size;
    
    console.log(`[uploadVideoChunked] Web file size: ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
    
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    console.log(`[uploadVideoChunked] Will upload in ${totalChunks} chunks`);

    // Step 1: Initialize upload session
    onProgress?.({ phase: "preparing", progress: 5 });
    
    const initForm = new FormData();
    initForm.append("filename", filename);
    initForm.append("file_size", fileSize.toString());
    initForm.append("total_chunks", totalChunks.toString());
    initForm.append("resource_type", "video");
    initForm.append("content_type", mimeType);

    const initResponse = await fetch(`${API_BASE}/uploads/init`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: initForm,
    });

    if (!initResponse.ok) {
      const errData = await initResponse.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to initialize upload");
    }

    const { upload_id } = await initResponse.json();
    console.log(`[uploadVideoChunked] Upload session initialized: ${upload_id}`);

    // Step 2: Upload chunks using Blob.slice (memory efficient)
    onProgress?.({ phase: "uploading", progress: 10, chunksUploaded: 0, totalChunks });
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunkBlob = blob.slice(start, end, "application/octet-stream");
      
      console.log(`[uploadVideoChunked] Uploading chunk ${i + 1}/${totalChunks} (${chunkBlob.size} bytes)`);
      
      const chunkForm = new FormData();
      chunkForm.append("upload_id", upload_id);
      chunkForm.append("chunk_index", i.toString());
      chunkForm.append("chunk", chunkBlob, `chunk_${i}`);
      
      const chunkResponse = await fetch(`${API_BASE}/uploads/chunk`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: chunkForm,
      });
      
      if (!chunkResponse.ok) {
        const errData = await chunkResponse.json().catch(() => ({}));
        await fetch(`${API_BASE}/uploads/cancel/${upload_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        throw new Error(errData.detail || `Failed to upload chunk ${i + 1}`);
      }
      
      // Update progress
      const chunkProgress = 10 + Math.round((i + 1) / totalChunks * 70);
      onProgress?.({ 
        phase: "uploading", 
        progress: chunkProgress, 
        chunksUploaded: i + 1, 
        totalChunks 
      });
    }

    // Step 3: Complete upload
    console.log(`[uploadVideoChunked] All chunks uploaded, completing upload...`);
    onProgress?.({ phase: "processing", progress: 85 });
    
    const completeForm = new FormData();
    completeForm.append("upload_id", upload_id);
    
    const completeResponse = await fetch(`${API_BASE}/uploads/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: completeForm,
    });
    
    if (!completeResponse.ok) {
      const errData = await completeResponse.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to complete upload");
    }
    
    const { url } = await completeResponse.json();
    console.log(`[uploadVideoChunked] Upload complete: ${url?.substring(0, 50)}...`);
    
    onProgress?.({ phase: "complete", progress: 100 });
    return url;
  }
}

export const registerUser = async (
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> => {
  return apiRequest<AuthResponse>("/auth/register", "POST", null, {
    name,
    email,
    password,
  });
};

export const loginUser = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  return apiRequest<AuthResponse>("/auth/login", "POST", null, {
    email,
    password,
  });
};

export const exchangeGoogleSession = async (
  sessionId: string
): Promise<AuthResponse> => {
  return apiRequest<AuthResponse>("/auth/google-session", "POST", null, {
    session_id: sessionId,
  });
};

export const getMe = async (token: string): Promise<User> => {
  return apiRequest<User>("/auth/me", "GET", token);
};

export const logoutUser = async (token: string): Promise<void> => {
  await apiRequest("/auth/logout", "POST", token);
};

export const getPosts = async (
  token: string,
  businessId?: string,
  actor?: { type: string; id?: string | null },
  limit: number = 20,
  skip: number = 0
): Promise<Post[]> => {
  const params = new URLSearchParams();
  if (businessId) params.append("business_id", businessId);
  if (actor?.type) params.append("actor_type", actor.type);
  if (actor?.id) params.append("actor_id", actor.id);
  params.append("limit", limit.toString());
  params.append("skip", skip.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<Post[]>(`/posts${query}`, "GET", token);
};

export const createPost = async (
  token: string,
  text: string,
  image_base64?: string | null,
  video_base64?: string | null,
  business_id?: string | null,
  actor?: { type: string; id?: string | null },
  media_ratio?: number | null,
  tagged_user_ids?: string[],
  tagged_business_id?: string | null,
  tagged_artist_id?: string | null,
  image_url?: string | null,
  video_url?: string | null
): Promise<Post> => {
  return apiRequest<Post>("/posts", "POST", token, {
    text,
    image_base64: image_url ? null : image_base64, // Don't send base64 if URL provided
    image_url,
    video_url,
    business_id,
    actor_type: actor?.type,
    actor_id: actor?.id,
    media_ratio,
    tagged_user_ids,
    tagged_business_ids: tagged_business_id ? [tagged_business_id] : [],
    tagged_artist_ids: tagged_artist_id ? [tagged_artist_id] : [],
  });
};

// Upload base64 image to Cloudinary and get URL
export const uploadImageToCloudinary = async (
  token: string,
  imageBase64: string
): Promise<string> => {
  const response = await apiRequest<{ url: string; resource_type: string }>(
    "/media/upload-base64",
    "POST",
    token,
    { image_base64: imageBase64, resource_type: "image" }
  );
  return response.url;
};

export const togglePostLike = async (
  token: string,
  postId: string,
  actor?: { type: string; id?: string | null }
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}/like`, "POST", token, {
    actor_type: actor?.type,
    actor_id: actor?.id,
  });
};

export const updatePost = async (
  token: string,
  postId: string,
  payload: {
    text?: string | null;
    image_base64?: string | null;
    video_base64?: string | null;
    media_ratio?: number | null;
  }
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}`, "PUT", token, payload);
};

export const deletePost = async (
  token: string,
  postId: string
): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/posts/${postId}`, "DELETE", token);
};

export const addPostComment = async (
  token: string,
  postId: string,
  text: string,
  actor?: { type: string; id?: string | null }
): Promise<Post> => {
  return apiRequest<Post>(`/posts/${postId}/comments`, "POST", token, {
    text,
    actor_type: actor?.type,
    actor_id: actor?.id,
  });
};

export const getPostComments = async (
  token: string,
  postId: string
): Promise<PostComment[]> => {
  return apiRequest<PostComment[]>(`/posts/${postId}/comments`, "GET", token);
};

export const updatePostComment = async (
  token: string,
  postId: string,
  commentId: string,
  text: string
): Promise<Post> => {
  return apiRequest<Post>(
    `/posts/${postId}/comments/${commentId}`,
    "PUT",
    token,
    { text }
  );
};

export const deletePostComment = async (
  token: string,
  postId: string,
  commentId: string
): Promise<Post> => {
  return apiRequest<Post>(
    `/posts/${postId}/comments/${commentId}`,
    "DELETE",
    token
  );
};

export const getStories = async (
  token: string,
  options?: { businessId?: string; userId?: string }
): Promise<Story[]> => {
  const params = new URLSearchParams();
  if (options?.businessId) {
    params.append("business_id", options.businessId);
  }
  if (options?.userId) {
    params.append("user_id", options.userId);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<Story[]>(`/stories${query}`, "GET", token);
};

// Grouped story type for Instagram-style stories UI
export type GroupedStory = {
  user_id: string;
  author: User | null;
  actor_type: string;
  actor_name: string;
  actor_avatar: string | null;
  preview_image: string;
  story_count: number;
  stories: Story[];
  latest_created_at: string;
};

export const getGroupedStories = async (
  token: string
): Promise<GroupedStory[]> => {
  return apiRequest<GroupedStory[]>("/stories/grouped", "GET", token);
};

export const createStory = async (
  token: string,
  image_base64?: string,
  video_url?: string,
  business_id?: string | null,
  actor?: { type: string; id?: string | null },
  image_url?: string  // New: Cloudinary URL for images
): Promise<Story> => {
  return apiRequest<Story>("/stories", "POST", token, {
    image_base64: image_url ? null : image_base64, // Don't send base64 if URL provided
    image_url,
    video_url,
    business_id,
    actor_type: actor?.type,
    actor_id: actor?.id,
  });
};

// ============== STORY REACTIONS & HIGHLIGHTS ==============

export const STORY_REACTIONS = ["❤️", "😂", "😮", "😢", "👏", "🔥", "💯", "👍"] as const;
export type StoryReaction = typeof STORY_REACTIONS[number];

export interface StoryReactionsResponse {
  total_count: number;
  counts: Record<string, number>;
  my_reaction: string | null;
  recent_reactors: {
    user_id: string;
    name: string;
    profile_photo?: string;
    reaction: string;
  }[];
}

export const reactToStory = async (
  token: string,
  storyId: string,
  reaction: StoryReaction
): Promise<{ success: boolean; reaction: string }> => {
  return apiRequest(`/stories/${storyId}/react?reaction=${encodeURIComponent(reaction)}`, "POST", token);
};

export const removeStoryReaction = async (
  token: string,
  storyId: string
): Promise<{ success: boolean }> => {
  return apiRequest(`/stories/${storyId}/react`, "DELETE", token);
};

export const getStoryReactions = async (
  token: string,
  storyId: string
): Promise<StoryReactionsResponse> => {
  return apiRequest(`/stories/${storyId}/reactions`, "GET", token);
};

export interface StoryHighlight {
  highlight_id: string;
  user_id: string;
  name: string;
  story_ids: string[];
  cover_image?: string;
  created_at: string;
  updated_at: string;
  stories?: Story[];
}

export const createStoryHighlight = async (
  token: string,
  name: string,
  storyIds: string[],
  coverStoryId?: string
): Promise<{ highlight_id: string; name: string; story_count: number; cover_image?: string }> => {
  const params = new URLSearchParams();
  params.append("name", name);
  storyIds.forEach(id => params.append("story_ids", id));
  if (coverStoryId) params.append("cover_story_id", coverStoryId);
  return apiRequest(`/stories/highlights?${params.toString()}`, "POST", token);
};

export const getMyHighlights = async (
  token: string
): Promise<StoryHighlight[]> => {
  return apiRequest("/stories/highlights/my", "GET", token);
};

export const getUserHighlights = async (
  token: string,
  userId: string
): Promise<StoryHighlight[]> => {
  return apiRequest(`/stories/highlights/user/${userId}`, "GET", token);
};

export const getHighlightStories = async (
  token: string,
  highlightId: string
): Promise<StoryHighlight> => {
  return apiRequest(`/stories/highlights/${highlightId}`, "GET", token);
};

export const updateHighlight = async (
  token: string,
  highlightId: string,
  options: {
    name?: string;
    addStoryIds?: string[];
    removeStoryIds?: string[];
    coverStoryId?: string;
  }
): Promise<{ success: boolean; story_count: number }> => {
  const params = new URLSearchParams();
  if (options.name) params.append("name", options.name);
  if (options.addStoryIds) options.addStoryIds.forEach(id => params.append("add_story_ids", id));
  if (options.removeStoryIds) options.removeStoryIds.forEach(id => params.append("remove_story_ids", id));
  if (options.coverStoryId) params.append("cover_story_id", options.coverStoryId);
  return apiRequest(`/stories/highlights/${highlightId}?${params.toString()}`, "PUT", token);
};

export const deleteHighlight = async (
  token: string,
  highlightId: string
): Promise<{ success: boolean }> => {
  return apiRequest(`/stories/highlights/${highlightId}`, "DELETE", token);
};

export const getUserByEmail = async (
  token: string,
  email: string
): Promise<User> => {
  const encoded = encodeURIComponent(email);
  return apiRequest<User>(`/users/by-email?email=${encoded}`, "GET", token);
};

export const deleteStory = async (
  token: string,
  storyId: string
): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(`/stories/${storyId}`, "DELETE", token);
};

export const getConversations = async (
  token: string
): Promise<Conversation[]> => {
  return apiRequest<Conversation[]>("/messages/conversations", "GET", token);
};

// Extended conversation type for all chats (DMs + Activity/Event groups)
export interface ExtendedConversation {
  type: "direct" | "activity" | "event";
  conversation_id: string;
  name: string;
  image?: string;
  last_message: string;
  last_message_time?: string;
  other_user?: UserPublic;
  is_private?: boolean;
  theme?: string;
}

export const getAllConversations = async (
  token: string
): Promise<ExtendedConversation[]> => {
  return apiRequest<ExtendedConversation[]>("/messages/all-conversations", "GET", token);
};

export const getMessagesWith = async (
  token: string,
  otherUserId: string
): Promise<Message[]> => {
  return apiRequest<Message[]>(`/messages/with/${otherUserId}`, "GET", token);
};

export const sendMessage = async (
  token: string,
  payload: { to_user_id?: string; to_email?: string; text: string }
): Promise<Message> => {
  return apiRequest<Message>("/messages", "POST", token, payload);
};

export const getUnreadMessageCount = async (
  token: string
): Promise<{ unread_count: number }> => {
  return apiRequest<{ unread_count: number }>("/messages/unread-count", "GET", token);
};

export const markMessagesRead = async (
  token: string,
  otherUserId: string
): Promise<{ marked_read: number }> => {
  return apiRequest<{ marked_read: number }>(`/messages/mark-read/${otherUserId}`, "POST", token);
};

export const deleteConversation = async (
  token: string,
  otherUserId: string
): Promise<{ message: string; deleted_count: number }> => {
  return apiRequest<{ message: string; deleted_count: number }>(
    `/messages/conversation/${otherUserId}`,
    "DELETE",
    token
  );
};

export const deleteMessage = async (
  token: string,
  messageId: string
): Promise<{ message: string; message_id: string }> => {
  return apiRequest<{ message: string; message_id: string }>(
    `/messages/${messageId}`,
    "DELETE",
    token
  );
};

export const editMessage = async (
  token: string,
  messageId: string,
  text: string
): Promise<Message> => {
  return apiRequest<Message>(
    `/messages/${messageId}`,
    "PUT",
    token,
    { text }
  );
};

export const deleteCallHistory = async (
  token: string,
  callId: string
): Promise<{ message: string; call_id: string }> => {
  return apiRequest<{ message: string; call_id: string }>(
    `/calls/history/${callId}`,
    "DELETE",
    token
  );
};

export const deleteAllCallHistory = async (
  token: string
): Promise<{ message: string; deleted_count: number }> => {
  return apiRequest<{ message: string; deleted_count: number }>(
    "/calls/history",
    "DELETE",
    token
  );
};

export const getBusinessCategories = async (
  token: string
): Promise<{ categories: CategoryGroup[] }> => {
  const response = await apiRequest<CategoryGroup[]>(
    "/categories",
    "GET",
    token
  );
  return { categories: response };
};

export const getCategoryTree = async (
  token: string
): Promise<CategoryGroup[]> => {
  const response = await apiRequest<{ categories: CategoryGroup[] }>(
    "/businesses/category-tree",
    "GET",
    token
  );
  return response.categories;
};

export const getBusinesses = async (
  token: string,
  rootCategory?: string,
  subcategory?: string
): Promise<Business[]> => {
  const params = new URLSearchParams();
  if (rootCategory) {
    params.append("root_category", rootCategory);
  }
  if (subcategory) {
    params.append("subcategory", subcategory);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<Business[]>(`/businesses${query}`, "GET", token);
};

export const getBusinessDetail = async (
  token: string,
  businessId: string,
  actor?: { type: string; id?: string | null }
): Promise<BusinessDetail> => {
  const params = new URLSearchParams();
  if (actor?.type) params.append("actor_type", actor.type);
  if (actor?.id) params.append("actor_id", actor.id);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<BusinessDetail>(
    `/businesses/${businessId}${query}`,
    "GET",
    token
  );
};

export const updateBusinessTheme = async (
  token: string,
  businessId: string,
  theme: ProfileTheme
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    `/businesses/${businessId}/theme`,
    "PUT",
    token,
    theme
  );
};

export const getNearbyBusinesses = async (
  token: string,
  latitude: number,
  longitude: number,
  rootCategory?: string,
  subcategory?: string,
  mapBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
): Promise<Business[]> => {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    max_distance_meters: "5000",
  });
  if (rootCategory && rootCategory !== "All") {
    params.append("root_category", rootCategory);
  }
  if (subcategory && subcategory !== "All") {
    params.append("subcategory", subcategory);
  }
  if (mapBounds) {
    params.append("min_lat", mapBounds.minLat.toString());
    params.append("max_lat", mapBounds.maxLat.toString());
    params.append("min_lng", mapBounds.minLng.toString());
    params.append("max_lng", mapBounds.maxLng.toString());
  }
  return apiRequest<Business[]>(
    `/businesses/nearby?${params.toString()}`,
    "GET",
    token
  );
};

export const createBusiness = async (
  token: string,
  payload: {
    name: string;
    root_category: string;
    subcategory: string;
    description?: string | null;
    address: string;
    logo_image?: string | null;
    cover_image?: string | null;
    phone?: string | null;
    website?: string | null;
    email?: string | null;
    social_links?: Record<string, string> | null;
    opening_hours?: Record<string, string> | null;
    gallery_images?: string[];
    gallery_videos?: string[];
    tags?: string[];
    latitude: number;
    longitude: number;
  }
): Promise<Business> => {
  return apiRequest<Business>("/businesses", "POST", token, payload);
};

export const updateBusiness = async (
  token: string,
  businessId: string,
  payload: Partial<Business>
): Promise<Business> => {
  return apiRequest<Business>(`/businesses/${businessId}`, "PUT", token, payload);
};

export const toggleBusinessFavorite = async (
  token: string,
  businessId: string
): Promise<{ favorites_count: number; is_favorited: boolean }> => {
  return apiRequest<{ favorites_count: number; is_favorited: boolean }>(
    `/businesses/${businessId}/favorite`,
    "POST",
    token
  );
};

export const getMyBusinesses = async (token: string): Promise<Business[]> => {
  const business = await apiRequest<Business | null>("/businesses/my", "GET", token);
  return business ? [business] : [];
};

export const getEvents = async (
  token: string,
  businessId?: string,
  artistId?: string
): Promise<EventItem[]> => {
  const params = new URLSearchParams();
  if (businessId) params.append("business_id", businessId);
  if (artistId) params.append("artist_id", artistId);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<EventItem[]>(`/events${query}`, "GET", token);
};

export const getEventDetail = async (
  token: string,
  eventId: string
): Promise<EventItem> => {
  return apiRequest<EventItem>(`/events/${eventId}`, "GET", token);
};

export const createEvent = async (
  token: string,
  payload: {
    business_id?: string | null;
    artist_id?: string | null;
    title: string;
    description?: string | null;
    image_base64: string;
    video_url?: string | null;
    start_time: string;
    end_time?: string | null;
    location?: string | null;
    theme?: string | null;
  }
): Promise<EventItem> => {
  return apiRequest<EventItem>("/events", "POST", token, payload);
};

export const updateEvent = async (
  token: string,
  eventId: string,
  payload: {
    title?: string | null;
    description?: string | null;
    image_base64?: string | null;
    video_url?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    location?: string | null;
    theme?: string | null;
  }
): Promise<EventItem> => {
  return apiRequest<EventItem>(`/events/${eventId}`, "PUT", token, payload);
};

export const getEventThemes = async (): Promise<EventTheme[]> => {
  return apiRequest<EventTheme[]>("/events/themes", "GET");
};

export const deleteEvent = async (
  token: string,
  eventId: string
): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/events/${eventId}`, "DELETE", token);
};

export const getEventPublic = async (eventId: string): Promise<EventItem> => {
  const response = await fetch(`${API_BASE}/events/${eventId}/public`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to fetch event");
  }
  return response.json();
};

export const toggleEventAttendance = async (
  token: string,
  eventId: string
): Promise<{ is_attending: boolean; attendees_count: number }> => {
  return apiRequest<{ is_attending: boolean; attendees_count: number }>(
    `/events/${eventId}/attend`,
    "POST",
    token
  );
};

// =============================================================================
// EVENT REMINDERS
// =============================================================================

export interface EventReminder {
  reminder_id: string;
  event_id: string;
  user_id: string;
  remind_at: string;
  reminder_type: string;
  status: string;
  created_at: string;
  event_title?: string;
  minutes_before?: number;
}

// Set a quick reminder (X minutes before event)
export const setEventReminder = async (
  token: string,
  eventId: string,
  minutesBefore: number = 60
): Promise<{ reminder_id: string; remind_at: string; minutes_before: number; message: string }> => {
  return apiRequest(
    `/events/${eventId}/quick-reminder?minutes_before=${minutesBefore}`,
    "POST",
    token
  );
};

// Create custom reminder
export const createEventReminder = async (
  token: string,
  eventId: string,
  remindAt: string,
  reminderType: string = "push"
): Promise<EventReminder> => {
  return apiRequest<EventReminder>(
    `/events/${eventId}/reminders`,
    "POST",
    token,
    { remind_at: remindAt, reminder_type: reminderType }
  );
};

// Get reminders for an event
export const getEventReminders = async (
  token: string,
  eventId: string
): Promise<EventReminder[]> => {
  return apiRequest<EventReminder[]>(`/events/${eventId}/reminders`, "GET", token);
};

// Delete a reminder
export const deleteEventReminder = async (
  token: string,
  eventId: string,
  reminderId: string
): Promise<{ message: string }> => {
  return apiRequest(`/events/${eventId}/reminders/${reminderId}`, "DELETE", token);
};

// Get all user's reminders
export const getMyEventReminders = async (
  token: string,
  status?: string
): Promise<EventReminder[]> => {
  const params = status ? `?status=${status}` : "";
  return apiRequest<EventReminder[]>(`/events/reminders/my-reminders${params}`, "GET", token);
};

export const getArtists = async (token: string): Promise<Artist[]> => {
  return apiRequest<Artist[]>("/artists", "GET", token);
};

export const getMyArtist = async (
  token: string
): Promise<Artist | null> => {
  return apiRequest<Artist | null>("/artists/my", "GET", token);
};

export const createArtist = async (
  token: string,
  payload: {
    name: string;
    bio?: string | null;
    genres: string[];
    socials: Record<string, string>;
    town?: string | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    gallery_images: string[];
    fan_gallery: string[];
    video_urls: string[];
    profile_photo?: string | null;
    cover_photo?: string | null;
  }
): Promise<Artist> => {
  return apiRequest<Artist>("/artists", "POST", token, payload);
};

export const getArtistDetail = async (
  token: string,
  artistId: string
): Promise<ArtistDetail> => {
  return apiRequest<ArtistDetail>(`/artists/${artistId}`, "GET", token);
};

export const updateArtistTheme = async (
  token: string,
  artistId: string,
  theme: ProfileTheme
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    `/artists/${artistId}/theme`,
    "PUT",
    token,
    theme
  );
};

export const updateArtist = async (
  token: string,
  artistId: string,
  payload: {
    name?: string | null;
    bio?: string | null;
    genres?: string[] | null;
    socials?: Record<string, string> | null;
    town?: string | null;
    address?: string | null;
    gallery_images?: string[] | null;
    fan_gallery?: string[] | null;
    video_urls?: string[] | null;
    profile_photo?: string | null;
    cover_photo?: string | null;
  }
): Promise<Artist> => {
  return apiRequest<Artist>(`/artists/${artistId}`, "PUT", token, payload);
};

export const createBookingRequest = async (
  token: string,
  artistId: string,
  payload: {
    event_date?: string | null;
    message: string;
    contact_email?: string | null;
  }
): Promise<BookingRequest> => {
  return apiRequest<BookingRequest>(
    `/artists/${artistId}/bookings`,
    "POST",
    token,
    payload
  );
};

export const getSubscriptionPlans = async (
  token: string
): Promise<SubscriptionPlans> => {
  return apiRequest<SubscriptionPlans>("/subscriptions/plans", "GET", token);
};

export const createSubscription = async (
  token: string,
  payload: { business_id: string; plan_type: string }
): Promise<SubscriptionResponse> => {
  return apiRequest<SubscriptionResponse>(
    "/subscriptions/create",
    "POST",
    token,
    payload
  );
};

export const getSubscriptionStatus = async (
  token: string,
  subscriptionId: string
): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(
    `/subscriptions/status/${subscriptionId}`,
    "GET",
    token
  );
};

export const updateProfileGallery = async (
  token: string,
  payload: { images?: string[]; videos?: string[]; remove_images?: string[]; remove_videos?: string[] }
): Promise<User> => {
  return apiRequest<User>("/profiles/gallery", "POST", token, payload);
};

export const updateGalleryCaption = async (
  token: string,
  url: string,
  caption: string,
  itemType: "image" | "video" = "image"
): Promise<User> => {
  return apiRequest<User>("/profiles/gallery/caption", "POST", token, {
    url,
    caption,
    item_type: itemType
  });
};

export const updateProfileMedia = async (
  token: string,
  payload: { profile_photo?: string | null; cover_photo?: string | null }
): Promise<User> => {
  return apiRequest<User>("/profiles/media", "POST", token, payload);
};

export const updateProfileInfo = async (
  token: string,
  payload: { name?: string | null; bio?: string | null; location?: string | null }
): Promise<User> => {
  return apiRequest<User>("/profiles/info", "POST", token, payload);
};

export const updateProfileTheme = async (
  token: string,
  theme: ProfileTheme
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>("/profiles/theme", "PUT", token, theme);
};

export const getUserPublicProfile = async (
  token: string,
  userId: string,
  actor?: { type: string; id?: string | null }
): Promise<UserPublicProfile> => {
  const params = new URLSearchParams();
  if (actor?.type) params.append("actor_type", actor.type);
  if (actor?.id) params.append("actor_id", actor.id);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<UserPublicProfile>(
    `/users/${userId}/public${query}`,
    "GET",
    token
  );
};

export const getMyFriends = async (token: string): Promise<User[]> => {
  return apiRequest<User[]>("/friends/me", "GET", token);
};

export const getCommonFriends = async (
  token: string,
  userId: string
): Promise<FriendCommon> => {
  return apiRequest<FriendCommon>(
    `/friends/common?other_user_id=${userId}`,
    "GET",
    token
  );
};

export const toggleFriend = async (
  token: string,
  userId: string
): Promise<{ is_friend: boolean }> => {
  return apiRequest<{ is_friend: boolean }>(
    `/friends/${userId}/toggle`,
    "POST",
    token
  );
};

// Friend Requests API
export interface FriendRequest {
  request_id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  from_user?: UserPublic;
  to_user?: UserPublic;
}

export const sendFriendRequest = async (
  token: string,
  toUserId: string
): Promise<FriendRequest> => {
  return apiRequest<FriendRequest>(
    "/friend-requests/send",
    "POST",
    token,
    { to_user_id: toUserId }
  );
};

export const acceptFriendRequest = async (
  token: string,
  requestId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    `/friend-requests/accept/${requestId}`,
    "POST",
    token
  );
};

export const declineFriendRequest = async (
  token: string,
  requestId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    `/friend-requests/decline/${requestId}`,
    "POST",
    token
  );
};

export const cancelFriendRequest = async (
  token: string,
  requestId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    `/friend-requests/cancel/${requestId}`,
    "POST",
    token
  );
};

export const getReceivedFriendRequests = async (
  token: string
): Promise<FriendRequest[]> => {
  return apiRequest<FriendRequest[]>("/friend-requests/received", "GET", token);
};

export const getSentFriendRequests = async (
  token: string
): Promise<FriendRequest[]> => {
  return apiRequest<FriendRequest[]>("/friend-requests/sent", "GET", token);
};

export const getPendingRequestCount = async (
  token: string
): Promise<{ pending_count: number }> => {
  return apiRequest<{ pending_count: number }>("/friend-requests/count", "GET", token);
};

export const getFriendshipStatus = async (
  token: string,
  userId: string
): Promise<{ status: "friends" | "request_sent" | "request_received" | "none"; request_id: string | null }> => {
  return apiRequest<{ status: "friends" | "request_sent" | "request_received" | "none"; request_id: string | null }>(
    `/friend-requests/status/${userId}`,
    "GET",
    token
  );
};

export const searchUsers = async (
  token: string,
  query: string,
  friendsOnly?: boolean
): Promise<User[]> => {
  const flag = friendsOnly ? "&friends_only=true" : "";
  return apiRequest<User[]>(
    `/users/search?query=${encodeURIComponent(query)}${flag}`,
    "GET",
    token
  );
};

export const getTaggedPosts = async (
  token: string,
  userId: string
): Promise<Post[]> => {
  return apiRequest<Post[]>(`/users/${userId}/tagged-posts`, "GET", token);
};

export const getArtistFanPosts = async (
  token: string,
  artistId: string
): Promise<Post[]> => {
  return apiRequest<Post[]>(`/profiles/artists/${artistId}/fan-posts`, "GET", token);
};

export const getBusinessFanPosts = async (
  token: string,
  businessId: string
): Promise<Post[]> => {
  return apiRequest<Post[]>(`/profiles/businesses/${businessId}/fan-posts`, "GET", token);
};

export const getBusinessFanGallery = async (
  token: string,
  businessId: string
): Promise<Post[]> => {
  return apiRequest<Post[]>(`/businesses/${businessId}/fan-gallery`, "GET", token);
};

export const hideBusinessFanGalleryPost = async (
  token: string,
  businessId: string,
  postId: string
): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(
    `/businesses/${businessId}/fan-gallery/${postId}/hide`,
    "POST",
    token
  );
};

export const getArtistFanGallery = async (
  token: string,
  artistId: string
): Promise<Post[]> => {
  return apiRequest<Post[]>(`/artists/${artistId}/fan-gallery`, "GET", token);
};

export const hideArtistFanGalleryPost = async (
  token: string,
  artistId: string,
  postId: string
): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(
    `/artists/${artistId}/fan-gallery/${postId}/hide`,
    "POST",
    token
  );
};

export const getActivityMessages = async (
  token: string,
  activityId: string
): Promise<ChatMessage[]> => {
  return apiRequest<ChatMessage[]>(
    `/activities/${activityId}/messages`,
    "GET",
    token
  );
};

export const sendActivityMessage = async (
  token: string,
  activityId: string,
  text: string
): Promise<ChatMessage> => {
  return apiRequest<ChatMessage>(
    `/activities/${activityId}/messages`,
    "POST",
    token,
    { text }
  );
};

export const getEventMessages = async (
  token: string,
  eventId: string
): Promise<ChatMessage[]> => {
  return apiRequest<ChatMessage[]>(`/events/${eventId}/messages`, "GET", token);
};

export const sendEventMessage = async (
  token: string,
  eventId: string,
  text: string
): Promise<ChatMessage> => {
  return apiRequest<ChatMessage>(`/events/${eventId}/messages`, "POST", token, {
    text,
  });
};

export const getActivities = async (token: string): Promise<ActivityItem[]> => {
  return apiRequest<ActivityItem[]>("/activities", "GET", token);
};

export const createActivity = async (
  token: string,
  payload: {
    title: string;
    description?: string | null;
    date: string;
    time: string;
    location?: string | null;
    image_base64?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    max_attendees?: number | null;
    invite_emails?: string[];
    // New fields
    is_private?: boolean;
    theme?: string | null;
    custom_theme?: string | null;
    tagged_business_id?: string | null;
  }
): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>("/activities", "POST", token, payload);
};

export const updateActivity = async (
  token: string,
  activityId: string,
  payload: {
    title?: string | null;
    description?: string | null;
    date?: string | null;
    time?: string | null;
    location?: string | null;
    image_base64?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    max_attendees?: number | null;
    is_private?: boolean | null;
    theme?: string | null;
    custom_theme?: string | null;
    tagged_business_id?: string | null;
  }
): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>(`/activities/${activityId}`, "PUT", token, payload);
};

export const deleteActivity = async (
  token: string,
  activityId: string
): Promise<{ status: string }> => {
  return apiRequest<{ status: string }>(`/activities/${activityId}`, "DELETE", token);
};

export const getActivityDetail = async (
  token: string,
  activityId: string
): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>(`/activities/${activityId}`, "GET", token);
};

export const joinActivityByCode = async (
  token: string,
  invitationCode: string
): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>("/activities/join-by-code", "POST", token, {
    invitation_code: invitationCode,
  });
};

export const rsvpActivity = async (
  token: string,
  activityId: string,
  status: string
): Promise<ActivityItem> => {
  return apiRequest<ActivityItem>(
    `/activities/${activityId}/rsvp`,
    "POST",
    token,
    { status }
  );
};

export type HomeFeed = {
  posts: Post[];
  stories: Story[];
  events: EventItem[];
  businesses: Business[];
  artists: Artist[];
  activities: ActivityItem[];
};

export const getHomeFeed = async (
  token: string,
  location?: { latitude: number; longitude: number } | null,
  maxDistanceKm?: number,
  mapBounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
): Promise<HomeFeed> => {
  const params = new URLSearchParams();
  if (location) {
    params.append("latitude", location.latitude.toString());
    params.append("longitude", location.longitude.toString());
  }
  if (maxDistanceKm) {
    params.append("radius_km", maxDistanceKm.toString());
  }
  if (mapBounds) {
    params.append("min_lat", mapBounds.minLat.toString());
    params.append("max_lat", mapBounds.maxLat.toString());
    params.append("min_lng", mapBounds.minLng.toString());
    params.append("max_lng", mapBounds.maxLng.toString());
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<HomeFeed>(`/feed/home${query}`, "GET", token);
};

export type UserAttendance = {
  activities: ActivityItem[];
  events: EventItem[];
};

export const getUserAttendance = async (
  token: string,
  userId: string
): Promise<UserAttendance> => {
  return apiRequest<UserAttendance>(`/users/${userId}/attendance`, "GET", token);
};

// ============================================
// AGORA VOICE/VIDEO CALLS
// ============================================

export type CallToken = {
  token: string;
  uid: number;
  channel: string;
  app_id: string;
  expiry_time: number;
};

export type CallResponse = {
  call_id: string;
  channel: string;
  token: string;
  app_id: string;
  caller_uid: number;
  callee_uid: number;
  call_type: "voice" | "video";
  status: string;
  caller_token?: string;
  callee_token?: string;
};

export type CallRecord = {
  call_id: string;
  channel: string;
  caller_id: string;
  caller_uid: number;
  callee_id: string;
  callee_uid: number;
  call_type: "voice" | "video";
  status: string;
  created_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  caller?: User;
  other_user?: User;
  is_outgoing?: boolean;
};

export const generateCallToken = async (
  token: string,
  channel?: string,
  uid?: number,
  role?: number
): Promise<CallToken> => {
  return apiRequest<CallToken>("/calls/token", "POST", token, {
    channel,
    uid: uid || 0,
    role: role || 1,
  });
};

export const initiateCall = async (
  token: string,
  toUserId?: string,
  callType: "voice" | "video" = "video",
  toBusinessId?: string
): Promise<CallResponse> => {
  return apiRequest<CallResponse>("/calls/initiate", "POST", token, {
    to_user_id: toUserId,
    to_business_id: toBusinessId,
    call_type: callType,
  });
};

export const answerCall = async (
  token: string,
  callId: string
): Promise<CallResponse> => {
  return apiRequest<CallResponse>(`/calls/answer/${callId}`, "POST", token);
};

export const endCall = async (
  token: string,
  callId: string
): Promise<{ success: boolean; call_id: string; status: string }> => {
  return apiRequest<{ success: boolean; call_id: string; status: string }>(
    `/calls/end/${callId}`,
    "POST",
    token
  );
};

export const rejectCall = async (
  token: string,
  callId: string
): Promise<{ success: boolean; call_id: string; status: string }> => {
  return apiRequest<{ success: boolean; call_id: string; status: string }>(
    `/calls/reject/${callId}`,
    "POST",
    token
  );
};

export const getCallStatus = async (
  token: string,
  callId: string
): Promise<{
  call_id: string;
  status: string;
  call_type: string;
  caller_id: string;
  callee_id: string;
  created_at: string;
  answered_at?: string;
  ended_at?: string;
}> => {
  return apiRequest(`/calls/status/${callId}`, "GET", token);
};

export const getPendingCalls = async (
  token: string
): Promise<CallRecord[]> => {
  return apiRequest<CallRecord[]>("/calls/pending", "GET", token);
};

export const getCallHistory = async (
  token: string
): Promise<CallRecord[]> => {
  return apiRequest<CallRecord[]>("/calls/history", "GET", token);
};

// Agora App ID (public, safe to expose)
export const AGORA_APP_ID = "7793967d595046f08f88fed156f8be42";

// =============================================================================
// GROUP CALLS API
// =============================================================================

export interface GroupCallParticipant {
  user_id: string;
  name: string;
  profile_photo?: string;
  uid: number;
  token: string;
  status: "invited" | "joined" | "left";
  joined_at?: string;
}

export interface GroupCallResponse {
  group_call_id: string;
  channel: string;
  app_id: string;
  call_type: "video" | "voice";
  status: "active" | "ended" | "expired";
  host_id: string;
  host_name: string;
  host_uid: number;
  host_token: string;
  participants: GroupCallParticipant[];
  max_participants: number;
  created_at: string;
  group_name?: string;
}

export interface ParticipantTokenResponse {
  group_call_id: string;
  channel: string;
  token: string;
  uid: number;
  app_id: string;
}

// Create a group call
export const createGroupCall = async (
  token: string,
  participantIds: string[],
  callType: "video" | "voice" = "video",
  groupName?: string
): Promise<GroupCallResponse> => {
  return apiRequest<GroupCallResponse>("/calls/group/create", "POST", token, {
    participant_ids: participantIds,
    call_type: callType,
    group_name: groupName,
  });
};

// Get group call details
export const getGroupCall = async (
  token: string,
  groupCallId: string
): Promise<GroupCallResponse> => {
  return apiRequest<GroupCallResponse>(`/calls/group/${groupCallId}`, "GET", token);
};

// Join a group call
export const joinGroupCall = async (
  token: string,
  groupCallId: string
): Promise<ParticipantTokenResponse> => {
  return apiRequest<ParticipantTokenResponse>(`/calls/group/${groupCallId}/join`, "POST", token);
};

// Add participant to active group call
export const addParticipantToGroupCall = async (
  token: string,
  groupCallId: string,
  userId: string
): Promise<{ message: string; participant: GroupCallParticipant; total_participants: number }> => {
  return apiRequest(`/calls/group/${groupCallId}/add-participant`, "POST", token, {
    user_id: userId,
  });
};

// Leave a group call
export const leaveGroupCall = async (
  token: string,
  groupCallId: string
): Promise<{ message: string; reason?: string }> => {
  return apiRequest(`/calls/group/${groupCallId}/leave`, "POST", token);
};

// End a group call (host only)
export const endGroupCall = async (
  token: string,
  groupCallId: string
): Promise<{ message: string }> => {
  return apiRequest(`/calls/group/${groupCallId}/end`, "POST", token);
};

// Get user's group call history
export const getMyGroupCalls = async (
  token: string,
  status?: string,
  limit: number = 20
): Promise<GroupCallResponse[]> => {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  params.append("limit", limit.toString());
  return apiRequest<GroupCallResponse[]>(`/calls/group/my-calls?${params}`, "GET", token);
};

// Delete Profile APIs
export const deleteBusiness = async (
  token: string,
  businessId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    `/businesses/${businessId}`,
    "DELETE",
    token
  );
};

export const deleteArtist = async (
  token: string,
  artistId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    `/artists/${artistId}`,
    "DELETE",
    token
  );
};

export const deleteUserAccount = async (
  token: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(
    "/users/me",
    "DELETE",
    token
  );
};


// Jobs API
export interface Job {
  job_id: string;
  business_id: string;
  title: string;
  description: string;
  cover_image?: string;
  root_category: string;
  subcategory: string;
  location: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  created_at: string;
  expires_at: string;
  business_name?: string;
  business_logo?: string;
  distance_km?: number;
}

export interface JobApplication {
  application_id: string;
  job_id: string;
  applicant_id: string;
  applicant_name: string;
  applicant_email: string;
  message: string;
  cv_url?: string;
  cover_letter_url?: string;
  status: string;
  created_at: string;
}

export const getJobs = async (
  token: string,
  params?: {
    latitude?: number;
    longitude?: number;
    max_distance_km?: number;
    root_category?: string;
    subcategory?: string;
  }
): Promise<Job[]> => {
  const searchParams = new URLSearchParams();
  if (params?.latitude) searchParams.append("latitude", String(params.latitude));
  if (params?.longitude) searchParams.append("longitude", String(params.longitude));
  if (params?.max_distance_km) searchParams.append("max_distance_km", String(params.max_distance_km));
  if (params?.root_category) searchParams.append("root_category", params.root_category);
  if (params?.subcategory) searchParams.append("subcategory", params.subcategory);
  const query = searchParams.toString();
  return apiRequest<Job[]>(`/jobs${query ? `?${query}` : ""}`, "GET", token);
};

export const getJob = async (token: string, jobId: string): Promise<Job> => {
  return apiRequest<Job>(`/jobs/${jobId}`, "GET", token);
};

export const getMyJobs = async (token: string): Promise<Job[]> => {
  return apiRequest<Job[]>("/jobs/my", "GET", token);
};

export const createJob = async (
  token: string,
  job: {
    title: string;
    description: string;
    cover_image?: string;
    root_category: string;
    subcategory: string;
    expires_at?: string;
  }
): Promise<Job> => {
  return apiRequest<Job>("/jobs", "POST", token, job);
};

export const updateJob = async (
  token: string,
  jobId: string,
  data: { title?: string; description?: string; cover_image?: string; is_active?: boolean }
): Promise<Job> => {
  return apiRequest<Job>(`/jobs/${jobId}`, "PUT", token, data);
};

export const deleteJob = async (
  token: string,
  jobId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest<{ success: boolean; message: string }>(`/jobs/${jobId}`, "DELETE", token);
};

export const applyToJob = async (
  token: string,
  jobId: string,
  application: { message: string; cv_url?: string; cover_letter_url?: string }
): Promise<{ success: boolean; message: string; application_id: string }> => {
  return apiRequest<{ success: boolean; message: string; application_id: string }>(
    `/jobs/${jobId}/apply`,
    "POST",
    token,
    application
  );
};

export const getJobApplications = async (
  token: string,
  jobId: string
): Promise<JobApplication[]> => {
  return apiRequest<JobApplication[]>(`/jobs/${jobId}/applications`, "GET", token);
};


// Activity Feed Types
export type ActivityItemType = {
  activity_id: string;
  type: "like" | "comment" | "friend" | "friend_request" | "event" | "post";
  message: string;
  actor_id: string;
  actor_name: string;
  actor_avatar?: string | null;
  target_id?: string | null;
  target_type?: string | null;
  created_at: string;
  read: boolean;
};

export type ActivityFeedResponse = {
  activities: ActivityItemType[];
  unread_count: number;
};

export const getActivityFeed = async (
  token: string,
  limit: number = 5
): Promise<ActivityFeedResponse> => {
  return apiRequest<ActivityFeedResponse>(
    `/notifications/activity-feed?limit=${limit}`,
    "GET",
    token
  );
};

export const markNotificationsRead = async (
  token: string,
  notificationIds?: string[],
  markAll?: boolean
): Promise<{ success: boolean; marked_count: number }> => {
  return apiRequest<{ success: boolean; marked_count: number }>(
    "/notifications/mark-read",
    "POST",
    token,
    { notification_ids: notificationIds || [], mark_all: markAll || false }
  );
};

// Push token registration
export const registerPushToken = async (
  token: string,
  pushToken: string,
  platform: "ios" | "android" | "web"
): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(
    "/users/push-token",
    "POST",
    token,
    { push_token: pushToken, platform }
  );
};

export const unregisterPushToken = async (
  token: string,
  pushToken: string
): Promise<{ success: boolean }> => {
  return apiRequest<{ success: boolean }>(
    "/users/push-token",
    "DELETE",
    token,
    { push_token: pushToken }
  );
};

// ============== PAUSE USER ==============

export const pauseUser = async (
  token: string,
  userId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest("/users/pause", "POST", token, { user_id: userId });
};

export const unpauseUser = async (
  token: string,
  userId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest("/users/unpause", "POST", token, { user_id: userId });
};

export const getPausedUsers = async (
  token: string
): Promise<User[]> => {
  return apiRequest("/users/paused", "GET", token);
};

export const checkIfPaused = async (
  token: string,
  userId: string
): Promise<{ is_paused: boolean }> => {
  return apiRequest(`/users/${userId}/is-paused`, "GET", token);
};

// ============== REPORT USER ==============

export const reportUser = async (
  token: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; message: string; report_id: string }> => {
  return apiRequest("/users/report", "POST", token, { user_id: userId, reason });
};

// Report a business
export const reportBusiness = async (
  token: string,
  businessId: string,
  reason: string
): Promise<{ success: boolean; message: string; report_id: string }> => {
  return apiRequest(`/businesses/${businessId}/report`, "POST", token, { reason });
};

// Report an artist
export const reportArtist = async (
  token: string,
  artistId: string,
  reason: string
): Promise<{ success: boolean; message: string; report_id: string }> => {
  return apiRequest(`/artists/${artistId}/report`, "POST", token, { reason });
};

// ============== BLOCK/UNBLOCK USER ==============

// Get list of blocked users
export type BlockedUser = {
  user_id: string;
  name: string;
  profile_photo?: string | null;
};

export const getBlockedUsers = async (
  token: string
): Promise<{ blocked_users: BlockedUser[] }> => {
  return apiRequest("/users/blocked", "GET", token);
};

// Unblock a user
export const unblockUser = async (
  token: string,
  userId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest(`/users/unblock/${userId}`, "POST", token);
};

// ============== CHAT ENHANCEMENTS ==============

// Set typing status
export const setTypingStatus = async (
  token: string,
  toUserId: string,
  isTyping: boolean
): Promise<{ success: boolean }> => {
  return apiRequest("/messages/typing", "POST", token, { to_user_id: toUserId, is_typing: isTyping });
};

// Get typing status of another user
export const getTypingStatus = async (
  token: string,
  otherUserId: string
): Promise<{ is_typing: boolean }> => {
  return apiRequest(`/messages/typing/${otherUserId}`, "GET", token);
};

// Send media message
export const sendMediaMessage = async (
  token: string,
  toUserId: string,
  mediaUrl: string,
  mediaType: "image" | "video" | "audio",
  text?: string
): Promise<Message> => {
  return apiRequest("/messages/media", "POST", token, {
    to_user_id: toUserId,
    media_url: mediaUrl,
    media_type: mediaType,
    text: text || "",
  });
};

// Get message read status
export const getMessageReadStatus = async (
  token: string,
  messageId: string
): Promise<{ message_id: string; read: boolean; read_at: string | null }> => {
  return apiRequest(`/messages/read-status/${messageId}`, "GET", token);
};

// ============== ADMIN ==============

export interface AdminStats {
  total_users: number;
  hidden_users: number;
  active_users: number;
  total_posts: number;
  hidden_posts: number;
  pending_reports: number;
  total_businesses: number;
  total_artists: number;
}

export interface ReportedUser {
  report_id: string;
  user_id: string;
  name: string;
  email: string;
  profile_photo?: string;
  reported_at: string;
  reported_by: string;
  reporter_name: string;
  reason: string;
  is_hidden: boolean;
  report_count: number;
}

export const checkAdminStatus = async (
  token: string
): Promise<{ is_admin: boolean }> => {
  return apiRequest("/admin/check", "GET", token);
};

export const getAdminStats = async (
  token: string
): Promise<AdminStats> => {
  return apiRequest("/admin/stats", "GET", token);
};

export const getReportedUsers = async (
  token: string
): Promise<ReportedUser[]> => {
  return apiRequest("/admin/reports", "GET", token);
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
  return apiRequest(`/admin/users${query}`, "GET", token);
};

export const manageUser = async (
  token: string,
  userId: string,
  action: "hide" | "unhide" | "delete"
): Promise<{ success: boolean; message: string }> => {
  return apiRequest("/admin/users/manage", "POST", token, { user_id: userId, action });
};

export type UserContentCounts = {
  posts: number;
  stories: number;
  activities: number;
  activity_messages: number;
  events: number;
  event_messages: number;
  businesses: number;
  artists: number;
  messages: number;
  conversations: number;
  notifications: number;
  friends: number;
  friend_requests: number;
  reports_about: number;
  reports_by: number;
  calls: number;
  subscriptions: number;
  likes_on_posts: number;
  comments_on_posts: number;
  activity_invites: number;
  total: number;
};

export const getUserContentCounts = async (
  token: string,
  userId: string
): Promise<UserContentCounts> => {
  return apiRequest(`/admin/user-content-count/${userId}`, "GET", token);
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
  return apiRequest(`/admin/posts${query}`, "GET", token);
};

export const managePost = async (
  token: string,
  postId: string,
  action: "hide" | "unhide" | "delete"
): Promise<{ success: boolean; message: string }> => {
  return apiRequest("/admin/posts/manage", "POST", token, { post_id: postId, action });
};

export const dismissReport = async (
  token: string,
  reportId: string
): Promise<{ success: boolean; message: string }> => {
  return apiRequest(`/admin/reports/${reportId}`, "DELETE", token);
};


// ============== VOUCHER CODES ==============

export interface VoucherResponse {
  success: boolean;
  message: string;
  months_free: number;
  expires_at: string;
}

export interface VoucherCheckResponse {
  valid: boolean;
  months_free?: number;
  description?: string;
  message?: string;
}

export const applyVoucher = async (
  token: string,
  voucherCode: string,
  businessId: string
): Promise<VoucherResponse> => {
  return apiRequest("/subscriptions/voucher/apply", "POST", token, {
    voucher_code: voucherCode,
    business_id: businessId,
  });
};

export const checkVoucher = async (
  voucherCode: string
): Promise<VoucherCheckResponse> => {
  return apiRequest(`/subscriptions/voucher/check/${encodeURIComponent(voucherCode)}`, "GET");
};


// ============== GEOSPATIAL SEARCH ==============

export type ArtistSearchResult = {
  artist_id: string;
  name: string;
  bio?: string | null;
  genres: string[];
  town?: string | null;
  profile_photo?: string | null;
  cover_photo?: string | null;
  distance_km?: number | null;
};

export type PostSearchResult = {
  post_id: string;
  user_id: string;
  actor_type?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  text: string;
  image_base64?: string | null;
  video_url?: string | null;
  likes_count: number;
  comments_count: number;
};

export type GeospatialSearchResponse = {
  city: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  artists: ArtistSearchResult[];
  posts: PostSearchResult[];
  total_artists: number;
  total_posts: number;
};

/**
 * Search for artists and their posts within a radius of a city or coordinates.
 * @param token - Session token
 * @param city - City name to search around (will be geocoded)
 * @param latitude - Optional latitude for center point
 * @param longitude - Optional longitude for center point
 * @param radiusKm - Search radius in kilometers (default 25)
 */
export const searchNearby = async (
  token: string,
  city?: string,
  latitude?: number,
  longitude?: number,
  radiusKm: number = 25
): Promise<GeospatialSearchResponse> => {
  const params = new URLSearchParams();
  if (city) params.append("city", city);
  if (latitude !== undefined) params.append("latitude", latitude.toString());
  if (longitude !== undefined) params.append("longitude", longitude.toString());
  params.append("radius_km", radiusKm.toString());
  
  return apiRequest(`/search/nearby?${params.toString()}`, "GET", token);
};

/**
 * Search artists by city name within a radius.
 * @param token - Session token
 * @param cityName - City name to search
 * @param radiusKm - Search radius in kilometers (default 25)
 */
export const searchArtistsByCity = async (
  token: string,
  cityName: string,
  radiusKm: number = 25
): Promise<ArtistSearchResult[]> => {
  return apiRequest(
    `/search/artists/city/${encodeURIComponent(cityName)}?radius_km=${radiusKm}`,
    "GET",
    token
  );
};

// ============== CONTACTS & REFERRALS ==============

export interface MatchedContact {
  contact_name: string;
  phone_number: string;
  user_id: string;
  user_name: string;
  profile_photo?: string;
  is_friend: boolean;
}

export interface InvitableContact {
  name: string;
  phone_number: string;
}

export interface CheckContactsResponse {
  matched_users: MatchedContact[];
  invitable_contacts: InvitableContact[];
  total_checked: number;
  total_matched: number;
  total_invitable: number;
}

export const checkContacts = async (
  token: string,
  contacts: { name: string; phone_numbers: string[] }[]
): Promise<CheckContactsResponse> => {
  return apiRequest("/contacts/check", "POST", token, { contacts });
};

export const trackInvite = async (
  token: string,
  phoneNumber: string,
  inviteMethod: "sms" | "whatsapp" | "other"
): Promise<{ success: boolean; message: string; new_invite: boolean }> => {
  return apiRequest(
    `/contacts/invite-tracking?phone_number=${encodeURIComponent(phoneNumber)}&invite_method=${inviteMethod}`,
    "POST",
    token
  );
};

export const getMyInvites = async (
  token: string
): Promise<{
  invites: any[];
  stats: { total_invites: number; total_converted: number; conversion_rate: number };
}> => {
  return apiRequest("/contacts/my-invites", "GET", token);
};

export const getReferralCode = async (
  token: string
): Promise<{ referral_code: string }> => {
  return apiRequest("/contacts/referral-code", "GET", token);
};

export const applyReferralCode = async (
  token: string,
  referralCode: string
): Promise<{ success: boolean; message: string; referrer_name: string }> => {
  return apiRequest(
    `/contacts/apply-referral?referral_code=${encodeURIComponent(referralCode)}`,
    "POST",
    token
  );
};


// ==================== Analytics ====================

export interface UserAnalytics {
  total_posts: number;
  total_stories: number;
  total_likes_received: number;
  total_comments_received: number;
  total_profile_views: number;
  total_friends: number;
  total_messages_sent: number;
  total_messages_received: number;
  engagement_rate: number;
  growth_data: Record<string, number>;
}

export interface ArtistAnalytics {
  total_followers: number;
  total_profile_views: number;
  total_events: number;
  total_event_attendees: number;
  engagement_rate: number;
  growth_data: Record<string, number>;
  top_events: Array<{
    event_id: string;
    title: string;
    attendees: number;
    date: string;
  }>;
}

export interface BusinessAnalytics {
  total_followers: number;
  total_profile_views: number;
  total_events: number;
  total_event_attendees: number;
  total_activities: number;
  engagement_rate: number;
  growth_data: Record<string, number>;
  top_events: Array<{
    event_id: string;
    title: string;
    attendees: number;
    date: string;
  }>;
}

export const getUserAnalytics = async (
  token: string,
  days: number = 30
): Promise<UserAnalytics> => {
  return apiRequest(`/analytics/user?days=${days}`, "GET", token);
};

export const getArtistAnalytics = async (
  token: string,
  artistId: string,
  days: number = 30
): Promise<ArtistAnalytics> => {
  return apiRequest(`/analytics/artist/${artistId}?days=${days}`, "GET", token);
};

export const getBusinessAnalytics = async (
  token: string,
  businessId: string,
  days: number = 30
): Promise<BusinessAnalytics> => {
  return apiRequest(`/analytics/business/${businessId}?days=${days}`, "GET", token);
};

export const trackProfileView = async (
  token: string,
  viewedUserId?: string,
  viewedArtistId?: string,
  viewedBusinessId?: string
): Promise<{ tracked: boolean }> => {
  const params = new URLSearchParams();
  if (viewedUserId) params.append("viewed_user_id", viewedUserId);
  if (viewedArtistId) params.append("viewed_artist_id", viewedArtistId);
  if (viewedBusinessId) params.append("viewed_business_id", viewedBusinessId);
  
  return apiRequest(`/analytics/track-view?${params.toString()}`, "POST", token);
};

// ==================== Read Receipts ====================

export const markMessagesAsRead = async (
  token: string,
  otherUserId: string
): Promise<{ marked_read: number }> => {
  return apiRequest(`/messages/mark-read/${otherUserId}`, "POST", token);
};

export const getUnreadCount = async (
  token: string
): Promise<{ unread_count: number }> => {
  return apiRequest("/messages/unread-count", "GET", token);
};

// ==================== Stripe Subscription APIs ====================

export type SubscriptionPlan = {
  plan_id: string;
  name: string;
  price: number;
  discounted_price?: number;
  interval: string;
  features: string[];
  currency: string;
};

export type VoucherInfo = {
  valid: boolean;
  discount_type?: string;
  monthly_price?: number;
  yearly_price?: number;
  months_free?: number;
  description?: string;
  message?: string;
};

export type PromoterInfo = {
  promoter_id: string;
  promoter_code: string;
  name: string;
  email: string;
  share_percentage: number;
  total_earnings?: number;
  pending_payout?: number;
  total_referrals?: number;
};

export type CheckoutResult = {
  checkout_url: string;
  session_id: string;
  amount: number;
  currency: string;
};

export type CheckoutStatus = {
  status: string;
  payment_status: string;
  subscription_active?: boolean;
  expires_at?: string;
};

// Get available subscription plans
export const getStripeSubscriptionPlans = async (): Promise<{ plans: SubscriptionPlan[]; voucher_available: boolean }> => {
  return apiRequest("/stripe/plans", "GET");
};

// Validate voucher code
export const validateVoucher = async (code: string): Promise<VoucherInfo> => {
  return apiRequest(`/stripe/voucher/check/${encodeURIComponent(code)}`, "GET");
};

// Validate promoter code
export const validatePromoterCode = async (code: string): Promise<{ valid: boolean; promoter_name?: string; message: string }> => {
  return apiRequest(`/stripe/promoters/validate/${encodeURIComponent(code)}`, "GET");
};

// Create checkout session
export const createSubscriptionCheckout = async (
  token: string,
  businessId: string,
  planType: "monthly" | "yearly",
  originUrl: string,
  voucherCode?: string,
  promoterCode?: string
): Promise<CheckoutResult> => {
  return apiRequest("/stripe/checkout/create", "POST", token, {
    business_id: businessId,
    plan_type: planType,
    voucher_code: voucherCode,
    promoter_code: promoterCode,
    origin_url: originUrl
  });
};

// Check checkout status
export const getCheckoutStatus = async (token: string, sessionId: string): Promise<CheckoutStatus> => {
  return apiRequest(`/stripe/checkout/status/${sessionId}`, "GET", token);
};

// Register as a promoter
export const registerAsPromoter = async (
  token: string,
  data: { name: string; email: string; phone?: string; bank_details?: string }
): Promise<PromoterInfo> => {
  return apiRequest("/stripe/promoters/register", "POST", token, data);
};

// Get promoter profile
export const getPromoterProfile = async (token: string): Promise<PromoterInfo & { recent_referrals: any[] }> => {
  return apiRequest("/stripe/promoters/me", "GET", token);
};

// Apply free months voucher
export const applyFreeMonthsVoucher = async (
  token: string,
  businessId: string,
  voucherCode: string
): Promise<{ success: boolean; message: string; expires_at: string }> => {
  return apiRequest(`/stripe/voucher/apply?business_id=${businessId}&voucher_code=${encodeURIComponent(voucherCode)}`, "POST", token);
};

// ==================== Admin Promoter Management ====================

export type AdminPromoter = {
  promoter_id: string;
  user_id: string;
  promoter_code: string;
  name: string;
  email: string;
  phone?: string;
  bank_details?: string;
  share_percentage: number;
  total_earnings: number;
  pending_payout: number;
  total_referrals: number;
  created_at: string;
  status: string;
};

export type PaymentTransaction = {
  transaction_id: string;
  business_id: string;
  plan_type: string;
  amount: number;
  currency: string;
  promoter_amount: number;
  payment_status: string;
  created_at: string;
  paid_at?: string;
};

// Get all promoters (admin only)
export const getAdminPromoters = async (token: string): Promise<{ promoters: AdminPromoter[] }> => {
  return apiRequest("/stripe/admin/promoters", "GET", token);
};

// Process payout to promoter (admin only)
export const processPromoterPayout = async (
  token: string,
  promoterId: string,
  amount: number
): Promise<{ success: boolean; payout_id: string; amount: number; new_pending_balance: number }> => {
  return apiRequest(`/stripe/admin/promoters/${promoterId}/payout?amount=${amount}`, "POST", token);
};

// Get all payment transactions (admin only)
export const getAdminPaymentTransactions = async (token: string): Promise<{ transactions: PaymentTransaction[] }> => {
  return apiRequest("/stripe/admin/transactions", "GET", token);
};

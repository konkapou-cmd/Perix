// Unified media limits — single source of truth for every file-size, duration, count, and quality constant.
export const BYTES_PER_MB = 1024 * 1024;

export const MEDIA_LIMITS = {
  image: {
    maxFileSizeMb: 25,
    maxFileSizeBytes: 25 * BYTES_PER_MB,
    pickerQuality: 0.8,
  },

  video: {
    maxFileSizeMb: 300,
    maxFileSizeBytes: 300 * BYTES_PER_MB,
    maxDurationSeconds: 60,
    pickerQuality: 0.7,
  },

  coverVideo: {
    maxFileSizeMb: 150,
    maxFileSizeBytes: 150 * BYTES_PER_MB,
    maxDurationSeconds: 30,
    pickerQuality: 0.7,
  },

  story: {
    maxFileSizeMb: 300,
    maxFileSizeBytes: 300 * BYTES_PER_MB,
    maxDurationSeconds: 60,
    imageDisplayMs: 5000,
    videoFallbackMs: 15000,
    errorFallbackMs: 3000,
    captionMaxLength: 200,
  },

  cityAd: {
    maxFileSizeMb: 300,
    maxFileSizeBytes: 300 * BYTES_PER_MB,
    maxDurationSeconds: 60,
    imageDisplayMs: 5000,
    videoFallbackMs: 15000,
    errorFallbackMs: 3000,
    captionMaxLength: 200,
  },

  post: {
    maxVideoFileSizeMb: 300,
    maxVideoFileSizeBytes: 300 * BYTES_PER_MB,
    maxVideoDurationSeconds: 60,
    captionMaxLength: 500,
  },

  gallery: {
    maxItems: 20,
    maxVideos: 10,
    maxVideoDurationSeconds: 60,
    maxVideoFileSizeMb: 300,
    maxVideoFileSizeBytes: 300 * BYTES_PER_MB,
  },

  coverGallery: {
    maxItems: 20,
    maxVideos: 10,
    maxVideoDurationSeconds: 30,
    maxVideoFileSizeMb: 150,
    maxVideoFileSizeBytes: 150 * BYTES_PER_MB,
  },

  camera: {
    coverMaxDurationSeconds: 30,
    generalMaxDurationSeconds: 60,
  },

  upload: {
    timeoutMs: 10 * 60 * 1000, // 10 minutes
  },
} as const;

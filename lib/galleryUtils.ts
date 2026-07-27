/**
 * Gallery Utility Functions
 * Handles deduplication, 15 item limit, and merging post media with gallery
 */

export type MediaItem = {
  uri: string;
  type: 'image' | 'video';
  source: 'post' | 'gallery';
  id: string;
};

export type Post = {
  post_id: string;
  image_url?: string | null;
  video_url?: string | null;
};

export const MAX_GALLERY_ITEMS = 15;

/**
 * Deduplicates media items by URI
 */
export function deduplicateMedia(items: MediaItem[]): MediaItem[] {
  const seenUrls = new Set<string>();
  const deduplicated: MediaItem[] = [];

  for (const item of items) {
    if (!seenUrls.has(item.uri)) {
      seenUrls.add(item.uri);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

/**
 * Limits gallery items to MAX_GALLERY_ITEMS (15)
 * Posts are kept first, then gallery items
 */
export function limitGalleryItems(items: MediaItem[]): MediaItem[] {
  return items.slice(0, MAX_GALLERY_ITEMS);
}

/**
 * Merges post media with gallery images/videos
 * - Posts media comes first (deduplicated)
 * - Gallery items come second (deduplicated)
 * - Result is limited to MAX_GALLERY_ITEMS (15)
 */
export function mergePostMediaWithGallery(
  posts: Post[],
  images: string[],
  videos: string[]
): MediaItem[] {
  const media: MediaItem[] = [];
  const seenUrls = new Set<string>();

  // Posts media first (deduplicated)
  posts.forEach((post, postIndex) => {
    if (post.image_url && !seenUrls.has(post.image_url)) {
      seenUrls.add(post.image_url);
      media.push({
        uri: post.image_url,
        type: 'image',
        source: 'post',
        id: `post-img-${postIndex}`,
      });
    }
    if (post.video_url && !seenUrls.has(post.video_url)) {
      seenUrls.add(post.video_url);
      media.push({
        uri: post.video_url,
        type: 'video',
        source: 'post',
        id: `post-video-${postIndex}`,
      });
    }
  });

  // Gallery images (deduplicated)
  images.forEach((uri, idx) => {
    if (!seenUrls.has(uri)) {
      seenUrls.add(uri);
      media.push({
        uri,
        type: 'image',
        source: 'gallery',
        id: `gallery-img-${idx}`,
      });
    }
  });

  // Gallery videos (deduplicated)
  videos.forEach((uri, idx) => {
    if (!seenUrls.has(uri)) {
      seenUrls.add(uri);
      media.push({
        uri,
        type: 'video',
        source: 'gallery',
        id: `gallery-video-${idx}`,
      });
    }
  });

  // Apply 15 item limit
  return limitGalleryItems(media);
}

/**
 * Filters media by type (image or video)
 */
export function filterMediaByType(
  items: MediaItem[],
  type: 'image' | 'video'
): MediaItem[] {
  return items.filter((item) => item.type === type);
}

/**
 * Gets count of images in media list
 */
export function getImageCount(items: MediaItem[]): number {
  return items.filter((item) => item.type === 'image').length;
}

/**
 * Gets count of videos in media list
 */
export function getVideoCount(items: MediaItem[]): number {
  return items.filter((item) => item.type === 'video').length;
}

/**
 * Checks if a URI already exists in media list
 */
export function mediaExists(items: MediaItem[], uri: string): boolean {
  return items.some((item) => item.uri === uri);
}

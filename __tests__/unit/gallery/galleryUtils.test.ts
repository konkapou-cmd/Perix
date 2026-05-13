/**
 * Unit Tests for Gallery Utility Functions
 * Tests deduplication, 15 item limit, and merging logic
 */

import {
  deduplicateMedia,
  limitGalleryItems,
  mergePostMediaWithGallery,
  filterMediaByType,
  getImageCount,
  getVideoCount,
  mediaExists,
  MAX_GALLERY_ITEMS,
  MediaItem,
  Post,
} from '../../../lib/galleryUtils';

describe('Gallery Utilities', () => {
  describe('deduplicateMedia', () => {
    it('should remove duplicate URIs', () => {
      const items: MediaItem[] = [
        { uri: 'url1', type: 'image', source: 'post', id: '1' },
        { uri: 'url2', type: 'image', source: 'post', id: '2' },
        { uri: 'url1', type: 'image', source: 'gallery', id: '3' },
        { uri: 'url3', type: 'video', source: 'post', id: '4' },
      ];

      const result = deduplicateMedia(items);

      expect(result).toHaveLength(3);
      expect(result.map((i) => i.uri)).toEqual(['url1', 'url2', 'url3']);
    });

    it('should keep first occurrence of duplicate', () => {
      const items: MediaItem[] = [
        { uri: 'url1', type: 'image', source: 'post', id: '1' },
        { uri: 'url1', type: 'video', source: 'post', id: '2' },
        { uri: 'url1', type: 'image', source: 'gallery', id: '3' },
      ];

      const result = deduplicateMedia(items);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array for empty input', () => {
      expect(deduplicateMedia([])).toEqual([]);
    });
  });

  describe('limitGalleryItems', () => {
    it('should limit to 15 items', () => {
      const items: MediaItem[] = Array.from({ length: 20 }, (_, i) => ({
        uri: `url${i}`,
        type: 'image' as const,
        source: 'post' as const,
        id: `id${i}`,
      }));

      const result = limitGalleryItems(items);

      expect(result).toHaveLength(15);
      expect(result[14].uri).toBe('url14');
    });

    it('should return all items if less than 15', () => {
      const items: MediaItem[] = [
        { uri: 'url1', type: 'image', source: 'post', id: '1' },
        { uri: 'url2', type: 'video', source: 'post', id: '2' },
      ];

      const result = limitGalleryItems(items);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', () => {
      expect(limitGalleryItems([])).toEqual([]);
    });
  });

  describe('mergePostMediaWithGallery', () => {
    const samplePosts: Post[] = [
      { post_id: 'p1', image_url: 'post-img1.jpg', video_url: null },
      { post_id: 'p2', image_url: 'post-img2.jpg', video_url: 'post-vid1.mp4' },
      { post_id: 'p3', image_url: null, video_url: 'post-vid2.mp4' },
    ];

    const sampleImages = ['gallery-img1.jpg', 'gallery-img2.jpg', 'gallery-img3.jpg'];
    const sampleVideos = ['gallery-vid1.mp4', 'gallery-vid2.mp4'];

    it('should merge posts first, then gallery items', () => {
      const result = mergePostMediaWithGallery(samplePosts, sampleImages, sampleVideos);

      // First 5 items should be from posts (2 images + 3 videos)
      expect(result[0].uri).toBe('post-img1.jpg');
      expect(result[1].uri).toBe('post-img2.jpg');
      expect(result[2].uri).toBe('post-vid1.mp4');
      expect(result[3].uri).toBe('post-vid2.mp4');

      // Next items should be from gallery
      expect(result[4].uri).toBe('gallery-img1.jpg');
      expect(result[5].uri).toBe('gallery-img2.jpg');
    });

    it('should deduplicate URLs', () => {
      const postsWithDuplicate: Post[] = [
        { post_id: 'p1', image_url: 'shared-url.jpg', video_url: null },
        { post_id: 'p2', image_url: 'shared-url.jpg', video_url: null },
      ];
      const images = ['shared-url.jpg', 'other-img.jpg'];

      const result = mergePostMediaWithGallery(postsWithDuplicate, images, []);

      // Should only have 2 items - shared-url once, other-img once
      expect(result).toHaveLength(2);
      expect(result.filter((i) => i.uri === 'shared-url.jpg')).toHaveLength(1);
    });

    it('should limit to 15 items total', () => {
      const manyPosts: Post[] = Array.from({ length: 10 }, (_, i) => ({
        post_id: `p${i}`,
        image_url: `post-img${i}.jpg`,
        video_url: `post-vid${i}.mp4`,
      }));
      const manyImages = Array.from({ length: 10 }, (_, i) => `gallery-img${i}.jpg`);

      const result = mergePostMediaWithGallery(manyPosts, manyImages, []);

      expect(result.length).toBeLessThanOrEqual(MAX_GALLERY_ITEMS);
    });

    it('should handle empty inputs', () => {
      const result = mergePostMediaWithGallery([], [], []);
      expect(result).toEqual([]);
    });

    it('should handle only posts', () => {
      const result = mergePostMediaWithGallery(samplePosts, [], []);
      expect(result).toHaveLength(4); // 2 images + 2 videos from posts
    });

    it('should handle only gallery', () => {
      const result = mergePostMediaWithGallery([], sampleImages, sampleVideos);
      expect(result).toHaveLength(5); // 3 images + 2 videos
    });

    it('should mark source correctly', () => {
      const posts: Post[] = [{ post_id: 'p1', image_url: 'post-img.jpg', video_url: null }];
      const images = ['gallery-img.jpg'];

      const result = mergePostMediaWithGallery(posts, images, []);

      expect(result[0].source).toBe('post');
      expect(result[1].source).toBe('gallery');
    });
  });

  describe('filterMediaByType', () => {
    it('should filter images', () => {
      const items: MediaItem[] = [
        { uri: 'img1.jpg', type: 'image', source: 'post', id: '1' },
        { uri: 'vid1.mp4', type: 'video', source: 'post', id: '2' },
        { uri: 'img2.jpg', type: 'image', source: 'gallery', id: '3' },
      ];

      const result = filterMediaByType(items, 'image');

      expect(result).toHaveLength(2);
      expect(result.every((i) => i.type === 'image')).toBe(true);
    });

    it('should filter videos', () => {
      const items: MediaItem[] = [
        { uri: 'img1.jpg', type: 'image', source: 'post', id: '1' },
        { uri: 'vid1.mp4', type: 'video', source: 'post', id: '2' },
      ];

      const result = filterMediaByType(items, 'video');

      expect(result).toHaveLength(1);
      expect(result[0].uri).toBe('vid1.mp4');
    });
  });

  describe('getImageCount', () => {
    it('should return correct count of images', () => {
      const items: MediaItem[] = [
        { uri: 'img1.jpg', type: 'image', source: 'post', id: '1' },
        { uri: 'vid1.mp4', type: 'video', source: 'post', id: '2' },
        { uri: 'img2.jpg', type: 'image', source: 'gallery', id: '3' },
      ];

      expect(getImageCount(items)).toBe(2);
    });

    it('should return 0 for empty array', () => {
      expect(getImageCount([])).toBe(0);
    });
  });

  describe('getVideoCount', () => {
    it('should return correct count of videos', () => {
      const items: MediaItem[] = [
        { uri: 'img1.jpg', type: 'image', source: 'post', id: '1' },
        { uri: 'vid1.mp4', type: 'video', source: 'post', id: '2' },
        { uri: 'vid2.mp4', type: 'video', source: 'gallery', id: '3' },
      ];

      expect(getVideoCount(items)).toBe(2);
    });
  });

  describe('mediaExists', () => {
    it('should return true if URI exists', () => {
      const items: MediaItem[] = [
        { uri: 'img1.jpg', type: 'image', source: 'post', id: '1' },
      ];

      expect(mediaExists(items, 'img1.jpg')).toBe(true);
    });

    it('should return false if URI does not exist', () => {
      const items: MediaItem[] = [
        { uri: 'img1.jpg', type: 'image', source: 'post', id: '1' },
      ];

      expect(mediaExists(items, 'img2.jpg')).toBe(false);
    });
  });

  describe('MAX_GALLERY_ITEMS', () => {
    it('should be 15', () => {
      expect(MAX_GALLERY_ITEMS).toBe(15);
    });
  });
});

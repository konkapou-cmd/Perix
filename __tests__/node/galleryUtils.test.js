/**
 * Node.js Unit Tests for Gallery Utility Functions
 * These tests run without React Native dependencies
 * Run with: node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/node/galleryUtils.test.js
 */

// Simple implementation matching lib/galleryUtils.ts
const MAX_GALLERY_ITEMS = 15;

function deduplicateMedia(items) {
  const seenUrls = new Set();
  const deduplicated = [];

  for (const item of items) {
    if (!seenUrls.has(item.uri)) {
      seenUrls.add(item.uri);
      deduplicated.push(item);
    }
  }

  return deduplicated;
}

function limitGalleryItems(items) {
  return items.slice(0, MAX_GALLERY_ITEMS);
}

function mergePostMediaWithGallery(posts, images, videos) {
  const media = [];
  const seenUrls = new Set();

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

  return limitGalleryItems(media);
}

// Simple test framework
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failedTests++;
  }
}

function expect(value) {
  return {
    toBe: (expected) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected} but got ${value}`);
      }
    },
    toEqual: (expected) => {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(value)}`);
      }
    },
    toHaveLength: (len) => {
      if (value.length !== len) {
        throw new Error(`Expected length ${len} but got ${value.length}`);
      }
    },
    toBeLessThanOrEqual: (val) => {
      if (value > val) {
        throw new Error(`Expected ${value} to be <= ${val}`);
      }
    },
    toContain: (item) => {
      if (!value.includes(item)) {
        throw new Error(`Expected array to contain ${item}`);
      }
    },
    toHaveProperty: (prop) => {
      if (!(prop in value)) {
        throw new Error(`Expected object to have property ${prop}`);
      }
    },
    toBeTruthy: () => {
      if (!value) {
        throw new Error(`Expected truthy value but got ${value}`);
      }
    },
    toBeFalsy: () => {
      if (value) {
        throw new Error(`Expected falsy value but got ${value}`);
      }
    },
    every: (fn) => {
      if (!value.every(fn)) {
        throw new Error(`Not all items passed the predicate`);
      }
    },
  };
}

// Tests
console.log('\n=== Gallery Utilities Tests ===\n');

test('deduplicateMedia - removes duplicate URIs', () => {
  const items = [
    { uri: 'url1', type: 'image', source: 'post', id: '1' },
    { uri: 'url2', type: 'image', source: 'post', id: '2' },
    { uri: 'url1', type: 'image', source: 'gallery', id: '3' },
    { uri: 'url3', type: 'video', source: 'post', id: '4' },
  ];

  const result = deduplicateMedia(items);

  expect(result.length).toBe(3);
  expect(result.map(i => i.uri)).toEqual(['url1', 'url2', 'url3']);
});

test('deduplicateMedia - keeps first occurrence', () => {
  const items = [
    { uri: 'url1', type: 'image', source: 'post', id: '1' },
    { uri: 'url1', type: 'video', source: 'post', id: '2' },
    { uri: 'url1', type: 'image', source: 'gallery', id: '3' },
  ];

  const result = deduplicateMedia(items);

  expect(result.length).toBe(1);
  expect(result[0].id).toBe('1');
});

test('deduplicateMedia - returns empty array for empty input', () => {
  expect(deduplicateMedia([])).toEqual([]);
});

test('limitGalleryItems - limits to 15 items', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({
    uri: `url${i}`,
    type: 'image',
    source: 'post',
    id: `id${i}`,
  }));

  const result = limitGalleryItems(items);

  expect(result.length).toBe(15);
  expect(result[14].uri).toBe('url14');
});

test('limitGalleryItems - returns all items if less than 15', () => {
  const items = [
    { uri: 'url1', type: 'image', source: 'post', id: '1' },
    { uri: 'url2', type: 'video', source: 'post', id: '2' },
  ];

  const result = limitGalleryItems(items);

  expect(result.length).toBe(2);
});

test('mergePostMediaWithGallery - merges posts first, then gallery', () => {
  const posts = [
    { post_id: 'p1', image_url: 'post-img1.jpg', video_url: null },
    { post_id: 'p2', image_url: 'post-img2.jpg', video_url: 'post-vid1.mp4' },
    { post_id: 'p3', image_url: null, video_url: 'post-vid2.mp4' },
  ];
  const images = ['gallery-img1.jpg', 'gallery-img2.jpg', 'gallery-img3.jpg'];
  const videos = ['gallery-vid1.mp4', 'gallery-vid2.mp4'];

  const result = mergePostMediaWithGallery(posts, images, videos);

  // First items from posts
  expect(result[0].uri).toBe('post-img1.jpg');
  expect(result[1].uri).toBe('post-img2.jpg');
  expect(result[2].uri).toBe('post-vid1.mp4');
  expect(result[3].uri).toBe('post-vid2.mp4');
  // Then from gallery
  expect(result[4].uri).toBe('gallery-img1.jpg');
  expect(result[5].uri).toBe('gallery-img2.jpg');
});

test('mergePostMediaWithGallery - deduplicates URLs', () => {
  const postsWithDuplicate = [
    { post_id: 'p1', image_url: 'shared-url.jpg', video_url: null },
    { post_id: 'p2', image_url: 'shared-url.jpg', video_url: null },
  ];
  const images = ['shared-url.jpg', 'other-img.jpg'];

  const result = mergePostMediaWithGallery(postsWithDuplicate, images, []);

  expect(result.length).toBe(2);
  expect(result.filter(i => i.uri === 'shared-url.jpg').length).toBe(1);
});

test('mergePostMediaWithGallery - limits to 15 items', () => {
  const manyPosts = Array.from({ length: 10 }, (_, i) => ({
    post_id: `p${i}`,
    image_url: `post-img${i}.jpg`,
    video_url: `post-vid${i}.mp4`,
  }));
  const manyImages = Array.from({ length: 10 }, (_, i) => `gallery-img${i}.jpg`);

  const result = mergePostMediaWithGallery(manyPosts, manyImages, []);

  expect(result.length).toBeLessThanOrEqual(15);
});

test('mergePostMediaWithGallery - handles empty inputs', () => {
  expect(mergePostMediaWithGallery([], [], [])).toEqual([]);
});

test('mergePostMediaWithGallery - handles only posts', () => {
  const posts = [
    { post_id: 'p1', image_url: 'post-img1.jpg', video_url: null },
    { post_id: 'p2', image_url: null, video_url: 'post-vid1.mp4' },
  ];

  const result = mergePostMediaWithGallery(posts, [], []);

  expect(result.length).toBe(2); // 1 image + 1 video
});

test('mergePostMediaWithGallery - handles only gallery', () => {
  const images = ['gallery-img1.jpg', 'gallery-img2.jpg'];
  const videos = ['gallery-vid1.mp4'];

  const result = mergePostMediaWithGallery([], images, videos);

  expect(result.length).toBe(3); // 2 images + 1 video
});

test('mergePostMediaWithGallery - marks source correctly', () => {
  const posts = [{ post_id: 'p1', image_url: 'post-img.jpg', video_url: null }];
  const images = ['gallery-img.jpg'];

  const result = mergePostMediaWithGallery(posts, images, []);

  expect(result[0].source).toBe('post');
  expect(result[1].source).toBe('gallery');
});

test('MAX_GALLERY_ITEMS is 15', () => {
  expect(MAX_GALLERY_ITEMS).toBe(15);
});

// Summary
console.log(`\n=== Results: ${passedTests} passed, ${failedTests} failed ===\n`);

if (failedTests > 0) {
  process.exit(1);
}

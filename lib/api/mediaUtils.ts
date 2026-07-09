import type { MediaItem } from "../../components/LazyMediaViewer";

type MediaFields = {
  video_url?: string | null;
  cover_image_url?: string | null;
  image_urls?: string[];
  gallery_images?: string[];
  gallery_videos?: string[];
  mux_thumbnail_url?: string | null;
  video_status?: string | null;
};

export function buildMediaItems(fields: MediaFields): MediaItem[] {
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  if (fields.video_url) {
    seen.add(fields.video_url);
    items.push({
      type: "video",
      uri: fields.video_url,
      muxThumbnailUrl: fields.mux_thumbnail_url || undefined,
      videoStatus: fields.video_status,
    });
  }
  if (fields.cover_image_url && !seen.has(fields.cover_image_url)) {
    seen.add(fields.cover_image_url);
    items.push({ type: "image", uri: fields.cover_image_url });
  }
  (fields.image_urls || []).forEach((u: string) => {
    if (!seen.has(u)) { seen.add(u); items.push({ type: "image", uri: u }); }
  });
  (fields.gallery_images || []).forEach((u: string) => {
    if (!seen.has(u)) { seen.add(u); items.push({ type: "image", uri: u }); }
  });
  (fields.gallery_videos || []).forEach((u: string) => {
    if (!seen.has(u)) { seen.add(u); items.push({ type: "video", uri: u }); }
  });

  return items;
}

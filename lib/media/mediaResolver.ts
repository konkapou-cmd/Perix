export type MediaAsset = {
  media_id: string;
  type: "image" | "video";
  status: "processing" | "ready" | "failed";
  url?: string;
  thumbnail_url?: string;
  mux_asset_id?: string;
  mux_upload_id?: string;
  focal_point?: { x: number; y: number } | null;
  is_cover?: boolean;
  sort_order?: number;
  created_at?: string;
};

export type MinimalMedia = {
  uri?: string;
  url?: string;
  type?: "image" | "video";
  isCoverImage?: boolean;
  isCoverVideo?: boolean;
  focalPoint?: { x: number; y: number } | null;
  posterUrl?: string | null;
  processingStatus?: "processing" | "ready" | "failed";
  muxAssetId?: string | null;
  muxUploadId?: string;
  temporaryId?: string;
};

export function generateTemporaryId(): string {
  return `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getMuxThumbnail(playbackUri: string): string | null {
  const match = playbackUri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  return match ? `https://image.mux.com/${match[1]}/thumbnail.jpg` : null;
}

/** Static Mux thumbnail, sized for the display context (defaults to full size). */
export function muxThumbnailUrl(playbackId: string, width?: number): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg${width ? `?width=${width}` : ""}`;
}

/** Short animated GIF preview from Mux — a "moving" cover without a full video player. */
export function muxAnimatedGifUrl(playbackId: string, width?: number): string {
  return `https://image.mux.com/${playbackId}/animated.gif${width ? `?width=${width}` : ""}`;
}

/** Downsize Cloudinary/Mux image URLs for the requested display width. */
export function optimizeImageUrl(url: string, width?: number): string {
  if (!url || !width) return url;
  if (url.includes("image.mux.com")) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}width=${width}`;
  }
  if (url.includes("cloudinary.com")) {
    return url.replace(/w_\d+/, `w_${width}`);
  }
  return url;
}

/** Enable Mux low-latency HLS for faster playback startup. */
export function lowLatencyPlaybackUrl(url: string): string {
  if (url && url.includes("stream.mux.com") && url.includes(".m3u8") && !url.includes("reduced_latency")) {
    return `${url}${url.includes("?") ? "&" : "?"}reduced_latency=true`;
  }
  return url;
}

export function isMediaResolved(item: MinimalMedia): boolean {
  return !item.processingStatus || item.processingStatus === "ready";
}

export function unresolvedItems(items: MinimalMedia[]): MinimalMedia[] {
  return items.filter((m) => !isMediaResolved(m));
}

export function deduplicateMedia(items: MinimalMedia[]): MinimalMedia[] {
  const seen = new Set<string>();
  return items.filter((m) => {
    const key = m.uri || m.url || "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mapToMediaAsset(items: MinimalMedia[]): MediaAsset[] {
  return items.map((m, i) => ({
    media_id: m.temporaryId || generateTemporaryId(),
    type: (m.type || "image") as MediaAsset["type"],
    status: m.processingStatus || "ready",
    url: m.uri || m.url,
    thumbnail_url: m.processingStatus === "processing" ? getMuxThumbnail(m.uri || m.url || "") : (m.posterUrl || undefined),
    mux_asset_id: m.muxAssetId || undefined,
    mux_upload_id: m.muxUploadId,
    focal_point: m.focalPoint || null,
    is_cover: !!m.isCoverImage || !!m.isCoverVideo,
    sort_order: i,
    created_at: new Date().toISOString(),
  }));
}

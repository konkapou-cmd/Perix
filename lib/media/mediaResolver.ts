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

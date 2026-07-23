import { useState, useEffect, useRef } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import AdaptiveVideo from "./AdaptiveVideo";
import FocalImage from "./FocalImage";
import CoverPositionEditor from "./CoverPositionEditor";
import GalleryUploadSlot from "./GalleryUploadSlot";
import MediaThumbnail from "./ui/MediaThumbnail";
import { uploadMedia, uploadVideoMux, UploadProgress } from "../lib/api";
import { getMuxAssetStatus } from "../lib/api/mux";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";
import { MEDIA_LIMITS, normalizeDurationSeconds } from "../lib/constants/mediaLimits";

export type MediaItem = {
  uri: string;
  type: "image" | "video";
  isCoverImage?: boolean;
  isCoverVideo?: boolean;
  focalPoint?: { x: number; y: number } | null;
  posterUrl?: string | null;
  processingStatus?: "processing" | "ready" | "failed";
  muxAssetId?: string | null;
  temporaryId?: string;
};

type MediaContext = "cover" | "gallery" | "post" | "story" | "cityAd";

type Props = {
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  sessionToken?: string;
  maxItems?: number;
  label?: string;
  isCreator?: boolean;
  onCoverFocalPointChange?: (focalPoint: { x: number; y: number }) => void;
  mediaContext?: MediaContext;
};

function getCoverItem(media: MediaItem[]): MediaItem | undefined {
  const resolved = media.filter((m) => !m.processingStatus || m.processingStatus === "ready");
  return resolved.find((m) => m.isCoverImage) || resolved.find((m) => m.isCoverVideo) || resolved[0];
}

function getMuxThumbnailFromUri(uri: string): string | null {
  const match = uri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  return match ? `https://image.mux.com/${match[1]}/thumbnail.jpg` : null;
}

function setExplicitCover(
  media: MediaItem[],
  targetIndex: number,
  coverType: "image" | "video"
): MediaItem[] {
  return media.map((item, i) => {
    if (i === targetIndex) {
      if (coverType === "image") {
        return { ...item, isCoverImage: true, isCoverVideo: false };
      }
      return { ...item, isCoverVideo: true, isCoverImage: false };
    }
    if (item.isCoverImage || item.isCoverVideo) {
      return { ...item, isCoverImage: false, isCoverVideo: false };
    }
    return item;
  });
}

export default function UnifiedMediaGallery({
  media,
  onChange,
  sessionToken,
  maxItems = 20,
  label,
  isCreator = true,
  onCoverFocalPointChange,
  mediaContext = "cover",
}: Props) {
  const { t } = useTranslation();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [itemProgress, setItemProgress] = useState<Record<number, UploadProgress>>({});
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [coverEditorVisible, setCoverEditorVisible] = useState(false);

  const { width: screenWidth } = useWindowDimensions();
  const itemGap = SPACING.gap;
  const NUM_COLS = 3;
  const itemSize = (screenWidth - SPACING.page * 2 - itemGap * (NUM_COLS - 1)) / NUM_COLS;

  const galleryLimits = mediaContext === "cover"
    ? MEDIA_LIMITS.coverGallery
    : MEDIA_LIMITS.gallery;

  const maxItemsResolved = maxItems ?? galleryLimits.maxItems;

  const mediaRef = useRef(media);
  useEffect(() => { mediaRef.current = media; }, [media]);

  const commitMedia = (next: MediaItem[]) => {
    mediaRef.current = next;
    onChange(next);
  };

  const coverItem = getCoverItem(media);

  const addImages = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.error"), t("auth.signInRequired") || "Please sign in first");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: MEDIA_LIMITS.image.pickerQuality,
    });
    if (result.canceled || !result.assets) return;
    const newItems: MediaItem[] = [];
    let failCount = 0;
    for (const asset of result.assets) {
      if (!asset.uri) continue;
      const idx = media.length + newItems.length;
      try {
        setItemProgress((prev) => ({ ...prev, [idx]: { phase: "uploading", progress: 0 } }));
        setUploadingIndex(idx);
        const url = await uploadMedia(sessionToken, asset.uri, "image", (p) => {
          setItemProgress((prev) => ({ ...prev, [idx]: p }));
        });
        if (url) {
          newItems.push({ uri: url, type: "image" });
          setItemProgress((prev) => ({ ...prev, [idx]: { phase: "complete", progress: 100 } }));
        }
      } catch (e: any) {
        failCount++;
        setItemProgress((prev) => ({ ...prev, [idx]: { phase: "preparing", progress: 0 } }));
        console.error("Image upload failed:", e?.message);
      }
    }
    if (newItems.length > 0) {
      const resetItems = newItems.map(item => ({ ...item, focalPoint: item.focalPoint ?? { x: 0.5, y: 0.5 } }));
      const combined = Array.from(new Set([...media, ...resetItems]));
      onChange(combined.slice(0, maxItemsResolved));
    }
    setUploadingIndex(null);
    setItemProgress({});
    if (failCount > 0) {
      Alert.alert(
        t("upload.failedTitle") || "Upload fehlgeschlagen",
        `${failCount} ${t("upload.imagesFailed") || "Bilder konnten nicht hochgeladen werden"}. ${newItems.length} ${t("upload.imagesSucceeded") || "erfolgreich"}.`
      );
    }
  };

  const pollMuxProcessing = async (assetId: string, temporaryId: string, token: string) => {
    const maxAttempts = 24;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      const current = mediaRef.current;
      if (!current.some((item) => item.temporaryId === temporaryId)) return;
      try {
        const status = await getMuxAssetStatus(token, assetId);
        if (status.status === "ready" && status.playback_url) {
          const updated = current.map((item) =>
            item.temporaryId === temporaryId
              ? { uri: status.playback_url!, type: "video" as const, posterUrl: status.thumbnail_url || null, focalPoint: { x: 0.5, y: 0.5 }, processingStatus: "ready" as const, muxAssetId: assetId }
              : item,
          );
          commitMedia(updated);
          return;
        }
      } catch {}
    }
    const current = mediaRef.current;
    if (!current.some((item) => item.temporaryId === temporaryId)) return;
    const failed = current.map((item) =>
      item.temporaryId === temporaryId
        ? { ...item, processingStatus: "failed" as const }
        : item,
    );
    commitMedia(failed);
  };

  const addVideo = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: MEDIA_LIMITS.video.pickerQuality,
    });
    if (result.canceled || !result.assets || !result.assets[0]?.uri) return;
    const asset = result.assets[0];

    const maxDur = galleryLimits.maxVideoDurationSeconds;
    const maxSizeBytes = galleryLimits.maxVideoFileSizeBytes;
    const maxSizeMb = galleryLimits.maxVideoFileSizeMb;

    if (asset.fileSize && asset.fileSize > maxSizeBytes) {
      Alert.alert(
        t("upload.videoTooLargeTitle") || "Video zu groß",
        t("upload.videoTooLargeMsg") || `Das Video ist zu groß. Maximal erlaubt sind ${maxSizeMb} MB.`
      );
      return;
    }
    const durationSeconds = normalizeDurationSeconds(asset.duration);
    if (durationSeconds > maxDur) {
      Alert.alert(
        t("upload.videoTooLongTitle") || "Video zu lang",
        t("upload.videoTooLongMsg") || `Das Video ist zu lang. Bitte kürze es auf maximal ${maxDur} Sekunden.`
      );
      return;
    }

    const idx = media.length;
    try {
      setUploadingIndex(idx);
      setItemProgress((prev) => ({ ...prev, [idx]: { phase: "preparing", progress: 0 } }));
      const muxResult = await uploadVideoMux(sessionToken, asset.uri, undefined, (p) => {
        setItemProgress((prev) => ({ ...prev, [idx]: p }));
      });
      const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);

      if (muxResult.mux_upload_id && !videoUrl) {
        // Video is still processing
        const processingItem: MediaItem = {
          uri: muxResult.mux_upload_id,
          type: "video",
          processingStatus: "processing",
          muxAssetId: muxResult.mux_asset_id || null,
          temporaryId: muxResult.mux_upload_id,
        };
        setItemProgress((prev) => ({ ...prev, [idx]: { phase: "processing", progress: 100 } }));
        const combined = [...media, processingItem];
        onChange(combined.slice(0, maxItemsResolved));
        Alert.alert(
          t("upload.videoProcessingTitle", "Video wird verarbeitet"),
          t("upload.videoProcessingMsg", "Dein Video wird verarbeitet. Du kannst es speichern sobald es fertig ist."),
        );
        pollMuxProcessing(muxResult.mux_asset_id || "", processingItem.temporaryId!, sessionToken);
        return;
      }

      if (!videoUrl && !muxResult.mux_upload_id) throw new Error("Video upload failed - no URL returned");
      const newItems: MediaItem[] = [];
      if (videoUrl) newItems.push({
        uri: videoUrl,
        type: "video",
        posterUrl: muxResult.mux_thumbnail_url || null,
        focalPoint: { x: 0.5, y: 0.5 },
      });
      if (newItems.length > 0) {
        setItemProgress((prev) => ({ ...prev, [idx]: { phase: "complete", progress: 100 } }));
        const combined = Array.from(new Set([...media, ...newItems]));
        onChange(combined.slice(0, maxItemsResolved));
      } else {
        throw new Error("Video upload completed but no playable URL was returned");
      }
    } catch (e: any) {
      setItemProgress((prev) => ({ ...prev, [idx]: { phase: "preparing", progress: 0 } }));
      Alert.alert(
        t("upload.failedTitle") || "Upload fehlgeschlagen",
        t("upload.failedVideoMsg") || "Das Video konnte nicht hochgeladen werden. Dein altes Titelbild bleibt erhalten."
      );
    } finally {
      setUploadingIndex(null);
      setItemProgress({});
    }
  };

  const updatedCoverFocalPoint = (nextFp: { x: number; y: number }) => {
    const updated = media.map((item) =>
      (item.isCoverImage || item.isCoverVideo) ? { ...item, focalPoint: nextFp } : item
    );
    onChange(updated);
    onCoverFocalPointChange?.(nextFp);
  };

  const removeItem = (index: number) => {
    onChange(media.filter((_, i) => i !== index));
    setMenuIndex(null);
  };

  const gridItems = media.slice(1);

  const handleSetCoverImage = (realIdx: number) => {
    onChange(setExplicitCover(media, realIdx, "image"));
    setMenuIndex(null);
  };

  const handleSetCoverVideo = (realIdx: number) => {
    onChange(setExplicitCover(media, realIdx, "video"));
    setMenuIndex(null);
  };

  return (
    <View>
      {label && <Text style={s.label}>{label}</Text>}

      <Pressable style={s.heroContainer} onPress={media.length === 0 && isCreator ? addImages : undefined}>
        {coverItem ? (
          coverItem.type === "video" ? (
            <View>
              <FocalImage
                uri={coverItem.posterUrl ?? getMuxThumbnailFromUri(coverItem.uri)}
                aspectRatio={16 / 9}
                focalPoint={coverItem.focalPoint ?? { x: 0.5, y: 0.5 }}
                borderRadius={BORDER_RADIUS.lg}
                style={s.heroImage}
                showLoader={false}
              />
              <AdaptiveVideo uri={coverItem.uri} autoPlay style={StyleSheet.absoluteFill} resizeMode="cover" isLooping={false} />
            </View>
          ) : (
            <FocalImage uri={coverItem.uri} aspectRatio={16 / 9} focalPoint={coverItem.focalPoint ?? { x: 0.5, y: 0.5 }} borderRadius={BORDER_RADIUS.lg} style={s.heroImage} showLoader={false} />
          )
        ) : (
          <View style={s.heroPlaceholder}>
            <Ionicons name="image-outline" size={32} color={COLORS.textDisabled} />
            <Text style={s.heroPlaceholderText}>{t("activities.images") || "Add photos/videos"}</Text>
          </View>
        )}
        {coverItem && (
          <Pressable style={s.heroOverlay} onPress={() => setCoverEditorVisible(true)}>
            <Ionicons name="camera" size={18} color={COLORS.textLight} />
          </Pressable>
        )}
        {coverItem && coverItem.isCoverImage && (
          <View style={s.coverBadge}><Text style={s.coverBadgeText}>Cover</Text></View>
        )}
        {coverItem && coverItem.isCoverVideo && (
          <View style={[s.coverBadge, { backgroundColor: "#8b5cf6" }]}><Text style={s.coverBadgeText}>Video</Text></View>
        )}
        {coverItem && !coverItem.isCoverImage && !coverItem.isCoverVideo && (
          <View style={[s.coverBadge, { backgroundColor: COLORS.textDisabled }]}><Text style={s.coverBadgeText}>Item 1</Text></View>
        )}
        {coverItem && isCreator && (
          <Pressable style={s.removeHeroBtn} onPress={() => removeItem(0)}>
            <Ionicons name="close-circle" size={22} color={COLORS.danger} />
          </Pressable>
        )}
      </Pressable>

      {gridItems.length > 0 && (
        <View style={[s.grid, { gap: itemGap }]}>
          {gridItems.map((item, idx) => {
            const realIdx = idx + 1;
            const progress = itemProgress[realIdx];
            const isUploading = uploadingIndex === realIdx;

            if (isUploading || progress) {
              return (
                <View key={`m-${realIdx}`} style={[s.gridItem, { width: itemSize, height: itemSize }]}>
                  <GalleryUploadSlot
                    uri={item.uri}
                    type={item.type}
                    progress={progress}
                    onPress={() => {}}
                    onRemove={isCreator ? () => removeItem(realIdx) : undefined}
                    size={itemSize}
                  />
                </View>
              );
            }

            // Processing/failed media items
            if (item.processingStatus === "processing" || item.processingStatus === "failed") {
              const isFailed = item.processingStatus === "failed";
              return (
                <View key={`m-${realIdx}`} style={[s.gridItem, { width: itemSize, height: itemSize }]}>
                  <View style={[s.processingTile, isFailed && s.failedTile]}>
                    <Ionicons name={isFailed ? "alert-circle-outline" : "hourglass-outline"} size={24} color={isFailed ? COLORS.danger : COLORS.primary} />
                    <Text style={[s.processingText, isFailed && { color: COLORS.danger }]}>
                      {isFailed ? t("upload.videoFailed", "Fehlgeschlagen") : t("upload.videoProcessing", "Wird verarbeitet")}
                    </Text>
                    {isCreator && (
                      <Pressable style={s.processingRemoveBtn} onPress={() => removeItem(realIdx)}>
                        <Ionicons name="close-circle-outline" size={16} color={COLORS.textMuted} />
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }

            // Regular media items
            const showMenu = menuIndex === realIdx;
            const mediaItem = item; // Prevent variable shadowing

            return (
              <View key={`m-${realIdx}`} style={[s.gridItem, { width: itemSize, height: itemSize }]}>
                <MediaThumbnail
                  uri={mediaItem.uri}
                  type={mediaItem.type}
                  aspectRatio={1}
                  showTypeBadge
                  borderRadius={10}
                  onPress={() => {
                    if (isCreator) {
                      setMenuIndex(showMenu ? null : realIdx);
                    }
                  }}
                />
                {mediaItem.isCoverImage && (
                  <View style={s.gridCoverBadge}>
                    <Ionicons name="image" size={12} color={COLORS.textLight} />
                  </View>
                )}
                {mediaItem.isCoverVideo && (
                  <View style={[s.gridCoverBadge, { backgroundColor: "#8b5cf6" }]}>
                    <Ionicons name="videocam" size={12} color={COLORS.textLight} />
                  </View>
                )}
                {isCreator && (
                  <View style={s.gridActions}>
                    {showMenu ? (
                      <View style={s.menuContainer}>
                        {mediaItem.type === "image" && !mediaItem.processingStatus && (
                          <Pressable style={s.menuItem} onPress={() => handleSetCoverImage(realIdx)}>
                            <Ionicons name="image-outline" size={12} color={COLORS.textPrimary} />
                            <Text style={s.menuItemText}>{t("gallery.setCoverImage") || "Cover Image"}</Text>
                          </Pressable>
                        )}
                        {mediaItem.type === "video" && !mediaItem.processingStatus && (
                          <Pressable style={s.menuItem} onPress={() => handleSetCoverVideo(realIdx)}>
                            <Ionicons name="videocam-outline" size={12} color={COLORS.textPrimary} />
                            <Text style={s.menuItemText}>{t("gallery.setCoverVideo") || "Cover Video"}</Text>
                          </Pressable>
                        )}
                        <Pressable style={s.menuItem} onPress={() => removeItem(realIdx)}>
                          <Ionicons name="trash-outline" size={12} color={COLORS.danger} />
                          <Text style={[s.menuItemText, { color: COLORS.error }]}>{t("common.delete") || "Remove"}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    <Pressable
                      style={s.menuTriggerBtn}
                      onPress={() => setMenuIndex(showMenu ? null : realIdx)}
                    >
                      <Ionicons name="ellipsis-horizontal" size={14} color="#fff" />
                    </Pressable>
                  </View>
                )}
                {!isCreator && (
                  <Pressable style={s.removeGridBtn} onPress={() => removeItem(realIdx)}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {isCreator && media.length < maxItemsResolved && (
        <View style={s.addRow}>
          <Pressable style={s.addBtn} onPress={addImages} disabled={uploadingIndex !== null}>
            <Ionicons name="image-outline" size={20} color={COLORS.primary} />
            <Text style={s.addBtnText}>{t("activities.addPhoto") || "Photo"}</Text>
          </Pressable>
          <Pressable style={s.addBtn} onPress={addVideo} disabled={uploadingIndex !== null}>
            {uploadingIndex !== null ? (
              <GalleryUploadSlot
                type="video"
                progress={uploadingIndex !== null ? itemProgress[uploadingIndex] : undefined}
                onPress={() => {}}
                size={36}
              />
            ) : (
              <Ionicons name="videocam-outline" size={20} color={COLORS.primary} />
            )}
            <Text style={s.addBtnText}>{uploadingIndex !== null ? (t("upload.uploading") || "Uploading...") : "Video"}</Text>
          </Pressable>
        </View>
      )}

      {coverItem && (
        <CoverPositionEditor
          visible={coverEditorVisible}
          uri={coverItem.uri}
          initialFocalPoint={coverItem.focalPoint ?? { x: 0.5, y: 0.5 }}
          aspectRatio={16 / 9}
          onCancel={() => setCoverEditorVisible(false)}
          onSave={(nextFp) => {
            updatedCoverFocalPoint(nextFp);
            setCoverEditorVisible(false);
          }}
        />
      )}
    </View>
  );
}

const NUM_COLS = 3;

const s = StyleSheet.create({
  label: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textSecondary,
    marginBottom: SPACING.tiny,
    marginTop: SPACING.std,
  },
  heroContainer: {
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 9,
    marginTop: SPACING.small,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    borderRadius: BORDER_RADIUS.lg,
  },
  heroPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textDisabled,
    marginTop: SPACING.tiny,
  },
  heroOverlay: {
    position: "absolute",
    bottom: SPACING.small,
    right: SPACING.small,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.tiny,
    paddingVertical: 1,
    borderRadius: 4,
  },
  coverBadgeText: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textLight,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  removeHeroBtn: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: COLORS.background,
    borderRadius: 11,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: SPACING.small,
  },
  gridItem: {
    position: "relative",
    overflow: "visible",
    backgroundColor: COLORS.surfaceDark,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: "center",
    alignItems: "center",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridActions: {
    position: "absolute",
    top: 2,
    right: 2,
    zIndex: 10,
  },
  menuTriggerBtn: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  menuContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 120,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  menuItemText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
  gridCoverBadge: {
    position: "absolute",
    top: 2,
    left: 2,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  removeGridBtn: {
    padding: 4,
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 10,
  },
  addRow: {
    flexDirection: "row",
    gap: SPACING.small,
    marginTop: SPACING.small,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.small,
    paddingVertical: SPACING.compact,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    backgroundColor: COLORS.backgroundPage,
  },
  addBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
  processingTile: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.backgroundPage, borderRadius: 10,
    gap: 4, padding: SPACING.small,
  },
  failedTile: {
    backgroundColor: "#fef2f2",
  },
  processingText: {
    fontSize: 10, color: COLORS.textMuted, textAlign: "center",
  },
  processingRemoveBtn: {
    position: "absolute", top: 4, right: 4, padding: 2,
    backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 10,
  },
});

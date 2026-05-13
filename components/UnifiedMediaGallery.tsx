import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import AdaptiveVideo from "./AdaptiveVideo";
import AdaptiveImage from "./AdaptiveImage";
import GalleryUploadSlot from "./GalleryUploadSlot";
import { uploadMedia, uploadVideoMux, UploadProgress } from "../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";

export type MediaItem = {
  uri: string;
  type: "image" | "video";
};

type Props = {
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  sessionToken?: string;
  maxItems?: number;
  label?: string;
  isCreator?: boolean;
};

export default function UnifiedMediaGallery({
  media,
  onChange,
  sessionToken,
  maxItems = 20,
  label,
  isCreator = true,
}: Props) {
  const { t } = useTranslation();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [itemProgress, setItemProgress] = useState<Record<number, UploadProgress>>({});

  const coverItem = media[0];

  const addImages = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.error"), t("auth.signInRequired") || "Please sign in first");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
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
      onChange([...media, ...newItems].slice(0, maxItems));
    }
    setUploadingIndex(null);
    if (failCount > 0) {
      Alert.alert(
        t("common.error") || "Error",
        `${failCount} image(s) failed to upload. ${newItems.length} succeeded.`
      );
    }
  };

  const addVideo = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (result.canceled || !result.assets || !result.assets[0]?.uri) return;
    const idx = media.length;
    try {
      setUploadingIndex(idx);
      setItemProgress((prev) => ({ ...prev, [idx]: { phase: "preparing", progress: 0 } }));
      const muxResult = await uploadVideoMux(sessionToken, result.assets[0].uri, undefined, (p) => {
        setItemProgress((prev) => ({ ...prev, [idx]: p }));
      });
      const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
      if (!videoUrl && !muxResult.mux_upload_id) throw new Error("Video upload failed - no URL returned");
      const newItems: MediaItem[] = [];
      if (videoUrl) newItems.push({ uri: videoUrl, type: "video" });
      if (muxResult.mux_thumbnail_url && !media.some((m) => m.uri === muxResult.mux_thumbnail_url)) {
        newItems.push({ uri: muxResult.mux_thumbnail_url, type: "image" });
      }
      if (newItems.length > 0) {
        setItemProgress((prev) => ({ ...prev, [idx]: { phase: "complete", progress: 100 } }));
        onChange([...media, ...newItems].slice(0, maxItems));
      } else {
        throw new Error("Video upload completed but no playable URL was returned");
      }
    } catch (e: any) {
      setItemProgress((prev) => ({ ...prev, [idx]: { phase: "preparing", progress: 0 } }));
      Alert.alert(
        t("common.error") || "Error",
        e?.message || t("upload.failed") || "Video upload failed"
      );
    } finally {
      setUploadingIndex(null);
    }
  };

  const removeItem = (index: number) => {
    onChange(media.filter((_, i) => i !== index));
  };

  const gridItems = media.slice(1);

  return (
    <View>
      {label && <Text style={s.label}>{label}</Text>}

      <Pressable style={s.heroContainer} onPress={media.length === 0 && isCreator ? addImages : undefined}>
        {coverItem ? (
          coverItem.type === "video" ? (
            <AdaptiveVideo uri={coverItem.uri} style={s.heroImage} useNativeControls isLooping={false} />
          ) : (
            <Image source={{ uri: coverItem.uri }} style={s.heroImage} resizeMode="cover" />
          )
        ) : (
          <View style={s.heroPlaceholder}>
            <Ionicons name="image-outline" size={32} color={COLORS.textDisabled} />
            <Text style={s.heroPlaceholderText}>{t("activities.images") || "Add photos/videos"}</Text>
          </View>
        )}
        {coverItem && (
          <View style={s.heroOverlay}>
            <Ionicons name="camera" size={18} color="#fff" />
          </View>
        )}
        {coverItem && <View style={s.coverBadge}><Text style={s.coverBadgeText}>Cover</Text></View>}
        {coverItem && isCreator && (
          <Pressable style={s.removeHeroBtn} onPress={() => removeItem(0)}>
            <Ionicons name="close-circle" size={22} color={COLORS.danger} />
          </Pressable>
        )}
      </Pressable>

      {gridItems.length > 0 && (
        <View style={s.grid}>
          {gridItems.map((item, idx) => {
            const realIdx = idx + 1;
            const progress = itemProgress[realIdx];
            const isUploading = uploadingIndex === realIdx;
            return (
              <View key={`m-${realIdx}`} style={s.gridItem}>
                {isUploading || progress ? (
                  <GalleryUploadSlot
                    uri={item.uri}
                    type={item.type}
                    progress={progress}
                    onPress={() => {}}
                    onRemove={isCreator ? () => removeItem(realIdx) : undefined}
                    size={gridItemSize}
                  />
                ) : item.type === "video" ? (
                  <AdaptiveVideo uri={item.uri} style={s.gridImage} useNativeControls isLooping={false} />
                ) : (
                  <AdaptiveImage uri={item.uri} style={s.gridImage} />
                )}
                {!isUploading && !progress && isCreator && (
                  <Pressable style={s.removeGridBtn} onPress={() => removeItem(realIdx)}>
                    <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      {isCreator && media.length < maxItems && (
        <View style={s.addRow}>
          <Pressable style={s.addBtn} onPress={addImages}>
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
    </View>
  );
}

const gridItemSize = 80;

const s = StyleSheet.create({
  label: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.xl,
  },
  heroContainer: {
    position: "relative",
    width: "100%",
    height: 160,
    marginTop: SPACING.sm,
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
    marginTop: SPACING.xs,
  },
  heroOverlay: {
    position: "absolute",
    bottom: SPACING.md,
    right: SPACING.md,
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
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
    borderRadius: 4,
  },
  coverBadgeText: {
    fontSize: FONT_SIZES.micro,
    color: "#fff",
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
    gap: SPACING.sm,
    marginVertical: SPACING.sm,
  },
  gridItem: {
    position: "relative",
    width: "31%",
    aspectRatio: 1,
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: BORDER_RADIUS.md,
  },
  removeGridBtn: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: COLORS.background,
    borderRadius: 10,
  },
  addRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.mdLg,
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
});
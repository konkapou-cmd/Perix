import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";
import { UploadProgress } from "../lib/api";

type SlotState = "placeholder" | "uploading" | "completed";

type Props = {
  uri?: string | null;
  type?: "image" | "video";
  progress?: UploadProgress | null;
  onPress: () => void;
  onRemove?: () => void;
  size?: number;
};

export default function GalleryUploadSlot({
  uri,
  type = "image",
  progress,
  onPress,
  onRemove,
  size = 80,
}: Props) {
  const state: SlotState = useMemo(() => {
    if (progress?.phase === "complete") return "completed";
    if (progress) return "uploading";
    if (uri) return "completed";
    return "placeholder";
  }, [progress, uri]);

  const percent = progress?.progress ?? 0;

  if (state === "placeholder") {
    return (
      <Pressable style={[s.placeholder, { width: size, height: size }]} onPress={onPress}>
        <Ionicons name="add" size={24} color={COLORS.textDisabled} />
      </Pressable>
    );
  }

  if (state === "uploading") {
    return (
      <View style={[s.slot, { width: size, height: size }]}>
        {uri ? (
          <View style={s.thumbnailContainer}>
            <View style={s.thumbnailOverlay} />
          </View>
        ) : (
          <View style={s.emptySlot}>
            <Ionicons
              name={type === "video" ? "videocam" : "image"}
              size={20}
              color={COLORS.textDisabled}
            />
          </View>
        )}
        <View style={s.ringContainer}>
          <ActivityIndicator size="small" color={COLORS.gold} />
        </View>
        <View style={s.percentBadge}>
          <Text style={s.percentText}>{Math.round(percent)}%</Text>
        </View>
        {onRemove && (
          <Pressable style={s.removeBtn} onPress={onRemove}>
            <Ionicons name="close-circle" size={20} color={COLORS.danger} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <Pressable style={[s.slot, { width: size, height: size }]} onPress={onPress}>
      <View style={s.thumbnailContainer} />
      {type === "video" && (
        <View style={s.videoBadge}>
          <Ionicons name="play" size={10} color="#fff" />
        </View>
      )}
      {onRemove && (
        <Pressable style={s.removeBtn} onPress={onRemove}>
          <Ionicons name="close-circle" size={20} color={COLORS.danger} />
        </Pressable>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  placeholder: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  slot: {
    position: "relative",
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
  },
  emptySlot: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.md,
  },
  thumbnailContainer: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
  },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: BORDER_RADIUS.md,
  },
  videoBadge: {
    position: "absolute",
    top: SPACING.xs,
    right: SPACING.xs,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  ringContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  percentBadge: {
    position: "absolute",
    bottom: SPACING.xs,
    right: SPACING.xs,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 1,
  },
  percentText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: "#fff",
  },
  removeBtn: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    zIndex: 5,
  },
});
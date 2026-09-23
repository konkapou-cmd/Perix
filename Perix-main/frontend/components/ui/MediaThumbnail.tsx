import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { optimizeImageUrl } from "../../lib/media/mediaResolver";

type MediaThumbnailProps = {
  uri: string;
  type?: "image" | "video";
  aspectRatio?: number;
  width?: number;
  height?: number;
  onPress?: () => void;
  onRemove?: () => void;
  showTypeBadge?: boolean;
  borderRadius?: number;
};

export default function MediaThumbnail({
  uri,
  type = "image",
  aspectRatio = 1,
  width,
  height,
  onPress,
  onRemove,
  showTypeBadge = true,
  borderRadius = 10,
}: MediaThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const containerStyle = width && height
    ? { width, height }
    : { aspectRatio, width: width ?? "100%" as any };
  const src = optimizeImageUrl(uri, width || undefined);

  return (
    <Pressable style={[styles.container, containerStyle, { borderRadius }]} onPress={onPress}>
      {!hasError ? (
        <Image source={{ uri: src }} style={styles.image} resizeMode="cover" onError={() => setHasError(true)} />
      ) : (
        <View style={styles.errorFallback}>
          <Ionicons name="image-outline" size={22} color="#9ca3af" />
        </View>
      )}
      {showTypeBadge && type === "video" && (
        <View style={styles.videoBadge}>
          <Ionicons name="play" size={14} color="#ffffff" />
        </View>
      )}
      {onRemove && (
        <Pressable style={styles.removeBtn} onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle" size={22} color="#ef4444" />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  errorFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  videoBadge: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -16,
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
  },
});

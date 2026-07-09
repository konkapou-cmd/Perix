import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AdaptiveImage from "../AdaptiveImage";
import LazyMediaViewer from "../LazyMediaViewer";
import type { MediaItem } from "../LazyMediaViewer";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";

const NUM_COLS = 3;

type ContentGalleryProps = {
  mediaItems: MediaItem[];
  title?: string;
};

export default function ContentGallery({ mediaItems, title }: ContentGalleryProps) {
  const { width: screenWidth } = useWindowDimensions();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  if (mediaItems.length === 0) return null;

  const itemGap = SPACING.compact;
  const innerWidth = screenWidth - SPACING.page * 2;
  const itemWidth = (innerWidth - itemGap * (NUM_COLS - 1)) / NUM_COLS;
  const itemHeight = itemWidth * (4 / 3);

  const getThumbnailUrl = (item: MediaItem): string => {
    if (item.type === "video") {
      return item.muxThumbnailUrl || getMuxThumbnail(item.uri) || item.uri;
    }
    return item.uri;
  };

  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={[styles.grid, { gap: itemGap }]}>
        {mediaItems.map((item, idx) => (
          <View key={`g-${idx}`} style={[styles.itemWrap, { width: itemWidth, height: itemHeight }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => {
                setViewerIndex(idx);
                setViewerOpen(true);
              }}
            >
              <AdaptiveImage
                uri={getThumbnailUrl(item)}
                style={styles.image}
                resizeMode="cover"
                borderRadius={BORDER_RADIUS.lg}
                showFallbackIcon={false}
              />
              {item.type === "video" && (
                <View style={styles.playOverlay}>
                  <Ionicons name="play-circle" size={24} color="#fff" />
                </View>
              )}
            </Pressable>
          </View>
        ))}
      </View>
      <LazyMediaViewer
        visible={viewerOpen}
        media={mediaItems}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

function getMuxThumbnail(url: string): string | null {
  const match = url.match(/stream\.mux\.com\/([a-zA-Z0-9]+)|mux\.com\/([a-zA-Z0-9]+)/);
  if (match) {
    const playbackId = match[1] || match[2];
    return `https://image.mux.com/${playbackId}/thumbnail.jpg`;
  }
  return null;
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.compact,
    paddingHorizontal: SPACING.page,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: SPACING.small,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  itemWrap: {
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});

import React, { useState } from "react";
import {
  View,
  Image,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import ImageZoomModal from "../ImageZoomModal";
import AdaptiveVideo from "../AdaptiveVideo";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMNS = 3;
const GAP = 4;
const ITEM_SIZE = (SCREEN_WIDTH - 32 - GAP * (COLUMNS - 1)) / COLUMNS;

export interface GalleryItem {
  uri: string;
  type: "image" | "video";
  caption?: string;
}

interface GalleryGridProps {
  images?: string[];
  videos?: string[];
  imageItems?: GalleryItem[];
  readOnly?: boolean;
  onAddImage?: () => void;
  onAddVideo?: () => void;
  onDeleteImage?: (index: number) => void;
  onDeleteVideo?: (index: number) => void;
  onReorderImages?: (from: number, to: number) => void;
  onReorderVideos?: (from: number, to: number) => void;
  title?: string;
  showAddButtons?: boolean;
  primaryColor?: string;
  textColor?: string;
  cardColor?: string;
}

export const GalleryGrid: React.FC<GalleryGridProps> = ({
  images = [],
  videos = [],
  imageItems,
  readOnly = false,
  onAddImage,
  onAddVideo,
  onDeleteImage,
  onDeleteVideo,
  title,
  showAddButtons = true,
  primaryColor = COLORS.primaryDark,
  textColor = COLORS.textPrimary,
  cardColor = COLORS.background,
}) => {
  const { t } = useTranslation();
  const [zoomVisible, setZoomVisible] = useState(false);
  const [zoomUri, setZoomUri] = useState("");
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  const handleImagePress = (uri: string) => {
    setZoomUri(uri);
    setZoomVisible(true);
  };

  const items: GalleryItem[] = imageItems
    ? imageItems
    : [
        ...images.map((uri) => ({ uri, type: "image" as const })),
        ...videos.map((uri) => ({ uri, type: "video" as const })),
      ];

  const totalVisible = 9;
  const visibleItems = items.slice(0, totalVisible);
  const remaining = items.length - totalVisible;

  return (
    <View style={[styles.container, { backgroundColor: cardColor }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>
          {title || t("premium.galleries")}
        </Text>
        {items.length > 0 && (
          <Text style={[styles.count, { color: primaryColor }]}>
            {items.length}
          </Text>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={40} color="#d1d5db" />
          <Text style={styles.emptyText}>{t("premium.noMediaYet")}</Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {visibleItems.map((item, index) => (
            <Pressable
              key={`${item.type}-${index}`}
              style={[styles.item, { width: ITEM_SIZE, height: ITEM_SIZE }]}
              onPress={() =>
                item.type === "image" ? handleImagePress(item.uri) : null
              }
            >
              {item.type === "image" ? (
                <Image source={{ uri: item.uri }} style={styles.image} />
              ) : (
                <Pressable
                  style={styles.videoThumb}
                  onPress={() => setActiveVideo(item.uri)}
                >
                  <AdaptiveVideo
                    uri={item.uri?.includes('mux.com') ? item.uri.replace('stream.mux.com', 'image.mux.com').replace('.m3u8', '/thumbnail.jpg?time=0&width=300') : item.uri?.replace('/upload/', '/upload/so_0,vc_00,w_300/')}
                    autoPlay
                    style={styles.videoThumbVideo}
                    showMuteButton={false}
                  />
                  <View style={styles.playOverlay}>
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                </Pressable>
              )}
              {item.caption && (
                <View style={styles.captionContainer}>
                  <Text style={styles.caption} numberOfLines={1}>
                    {item.caption}
                  </Text>
                </View>
              )}
              {remaining > 0 && index === visibleItems.length - 1 && (
                <View style={styles.moreOverlay}>
                  <Text style={styles.moreText}>+{remaining}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {readOnly && items.length > 0 && (
        <Pressable style={styles.viewAllBtn}>
          <Text style={[styles.viewAllText, { color: primaryColor }]}>
            {t("premium.viewAll", { count: items.length })}
          </Text>
        </Pressable>
      )}

      <ImageZoomModal
        visible={zoomVisible}
        mediaArray={zoomUri ? [{ uri: zoomUri, type: "image" as const, id: "zoom" }] : []}
        onClose={() => setZoomVisible(false)}
      />

      {activeVideo && (
        <Pressable
          style={styles.videoOverlay}
          onPress={() => setActiveVideo(null)}
        >
          <View style={styles.videoPlayer}>
            <AdaptiveVideo
              uri={activeVideo}
              style={styles.fullVideo}
              autoPlay
              showMuteButton
              isLooping
            />
            <Pressable
              style={styles.closeVideoBtn}
              onPress={() => setActiveVideo(null)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  count: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 14,
    marginTop: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  item: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  videoThumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1f2937",
  },
  videoThumbVideo: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  captionContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
  },
  caption: {
    color: "#fff",
    fontSize: 11,
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },
  viewAllBtn: {
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 8,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  videoPlayer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.5625,
    position: "relative",
  },
  fullVideo: {
    width: "100%",
    height: "100%",
  },
  closeVideoBtn: {
    position: "absolute",
    top: 40,
    right: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    padding: 8,
  },
});

export default GalleryGrid;

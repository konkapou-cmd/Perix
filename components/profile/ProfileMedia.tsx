import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import { PROFILE, PROFILE_COLORS } from "./ProfileDesign";
import AdaptiveImage from "../AdaptiveImage";
import AdaptiveVideo from "../AdaptiveVideo";
import LazyMediaViewer, { MediaItem as MediaViewerItem } from "../LazyMediaViewer";
import { Post } from "../../lib/api";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_COLS = 3;
const GRID_GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;
const MAX_GALLERY_ITEMS = 15;

type MediaItem = { uri: string; type: "image" | "video"; source: "post" | "gallery"; id: string };

interface ProfileMediaProps {
  images?: string[];
  videos?: string[];
  posts?: Post[];
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  readOnly?: boolean;
  onDeleteItem?: (source: "post" | "gallery", type: "image" | "video", uri: string) => void;
}

export const ProfileMedia: React.FC<ProfileMediaProps> = ({
  images = [],
  videos = [],
  posts = [],
  primaryColor = PROFILE_COLORS.PRIMARY,
  cardColor = PROFILE_COLORS.CARD,
  textColor = PROFILE_COLORS.TEXT,
  readOnly = false,
  onDeleteItem,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"photos" | "videos">("photos");
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const isWeb = Platform.OS === "web";

  const allMedia = useMemo(() => {
    const media: MediaItem[] = [];
    const seenUrls = new Set<string>();

    // Posts media first (deduplicated)
    posts.forEach((post, postIndex) => {
      if (post.image_url && !seenUrls.has(post.image_url)) {
        seenUrls.add(post.image_url);
        media.push({
          uri: post.image_url,
          type: "image",
          source: "post",
          id: `post-img-${postIndex}`,
        });
      }
      if (post.video_url && !seenUrls.has(post.video_url)) {
        seenUrls.add(post.video_url);
        media.push({
          uri: post.video_url,
          type: "video",
          source: "post",
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
          type: "image",
          source: "gallery",
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
          type: "video",
          source: "gallery",
          id: `gallery-video-${idx}`,
        });
      }
    });

    return media.slice(0, MAX_GALLERY_ITEMS);
  }, [images, videos, posts]);

  const photoItems = allMedia.filter((item) => item.type === "image");
  const videoItems = allMedia.filter((item) => item.type === "video");
  const mediaItems = activeTab === "photos" ? photoItems : videoItems;

  const viewerItems: MediaViewerItem[] = useMemo(() =>
    mediaItems.map(item => ({ type: item.type, uri: item.uri })),
    [mediaItems]
  );

  const handleItemPress = (item: MediaItem, index: number) => {
    setViewerVisible(true);
    setViewerIndex(index);
  };

  const handleDelete = (item: MediaItem, index: number) => {
    onDeleteItem?.(item.source, item.type, item.uri);
  };

  const renderItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <View style={styles.gridItem}>
      <Pressable onPress={() => handleItemPress(item, index)}>
        {item.type === "image" ? (
          <AdaptiveImage uri={item.uri} style={styles.gridImage} />
        ) : (
          <View style={styles.videoThumbnail}>
            <AdaptiveVideo
              uri={item.uri.includes('mux.com') ? item.uri.replace('stream.mux.com', 'image.mux.com').replace('.m3u8', '/thumbnail.jpg?time=0&width=300') : item.uri.replace('/upload/', '/upload/so_0,vc_00,w_300/')}
              autoPlay
              style={styles.gridVideo}
              showMuteButton={false}
              useNativeControls={false}
            />
            <View style={styles.videoOverlay}>
              <Ionicons name="play-circle" size={32} color="#fff" />
            </View>
          </View>
        )}
        {item.source === "post" && (
          <View style={styles.postBadge}>
            <Ionicons name="document-text" size={10} color="#fff" />
          </View>
        )}
      </Pressable>
      {!readOnly && (
        <Pressable
          style={styles.deleteBtn}
          onPress={() => handleDelete(item, index)}
        >
          <Ionicons name="close-circle" size={22} color={PROFILE_COLORS.DANGER} />
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.tabRow, { backgroundColor: cardColor }]}>
        <Pressable
          style={[styles.subTab, activeTab === "photos" && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab("photos")}
        >
          <Ionicons
            name={activeTab === "photos" ? "images" : "images-outline"}
            size={18}
            color={activeTab === "photos" ? primaryColor : PROFILE_COLORS.TEXT_SECONDARY}
          />
          <Text style={[styles.subTabText, activeTab === "photos" && { color: primaryColor }]}>
            {t("profile.photos", "Photos")} {photoItems.length}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.subTab, activeTab === "videos" && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab("videos")}
        >
          <Ionicons
            name={activeTab === "videos" ? "videocam" : "videocam-outline"}
            size={18}
            color={activeTab === "videos" ? primaryColor : PROFILE_COLORS.TEXT_SECONDARY}
          />
          <Text style={[styles.subTabText, activeTab === "videos" && { color: primaryColor }]}>
            {t("profile.videos", "Videos")} {videoItems.length}
          </Text>
        </Pressable>
      </View>

      {mediaItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>
            {activeTab === "photos"
              ? t("profile.noPhotos", "No photos yet")
              : t("profile.noVideos", "No videos yet")}
          </Text>
        </View>
      ) : (
        <View style={styles.webGrid}>
          {mediaItems.map((item, index) => (
            <Pressable
              key={item.id}
              style={[styles.webGridItem, !isWeb && { flex: 1, maxWidth: "33%" }]}
              onPress={() => handleItemPress(item, index)}
            >
              {item.type === "image" ? (
                <AdaptiveImage uri={item.uri} style={styles.webGridMedia} ratio={1} maxHeight={1200} borderRadius={0} />
              ) : (
                <View style={styles.videoThumbnail}>
                  <AdaptiveVideo
                    uri={item.uri}
                    coverPhoto={item.uri.includes('mux.com') ? item.uri.replace('stream.mux.com', 'image.mux.com').replace('.m3u8', '/thumbnail.jpg?time=0&width=300') : item.uri.replace('/upload/', '/upload/so_0,vc_00,w_300/')}
                    style={styles.webGridMedia}
                    ratio={1}
                    maxHeight={1200}
                    autoPlay
                    initialMuted
                    isLooping
                    showMuteButton={false}
                    useNativeControls={false}
                    borderRadius={0}
                  />
                  <View style={styles.videoOverlay}>
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                </View>
              )}
              {item.source === "post" && (
                <View style={styles.postBadge}>
                  <Ionicons name="document-text" size={10} color="#fff" />
                </View>
              )}
              {!readOnly && (
                <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item, index)}>
                  <Ionicons name="close-circle" size={22} color={PROFILE_COLORS.DANGER} />
                </Pressable>
              )}
            </Pressable>
          ))}
        </View>
      )}

      <LazyMediaViewer
        visible={viewerVisible}
        media={viewerItems}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </View>
  );
};

const styles: Record<string, any> = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 8,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: PROFILE_COLORS.BORDER,
  },
  subTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  subTabText: {
    fontSize: 14,
    fontWeight: "500",
    color: PROFILE_COLORS.TEXT_SECONDARY,
  },
  gridContainer: {
    padding: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: GRID_GAP / 2,
    position: "relative",
    overflow: "hidden",
  },
  webGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 24,
  },
  webGridItem: {
    width: "calc(33.33% - 8px)" as any,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.textPrimary,
    position: "relative",
  },
  webGridMedia: {
    width: "100%",
    height: "100%",
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  videoThumbnail: {
    width: "100%",
    height: "100%",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#1f2937",
  },
  gridVideo: {
    width: "100%",
    height: "100%",
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 4,
  },
  postBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    padding: 4,
  },
  deleteBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 11,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: PROFILE_COLORS.TEXT_SECONDARY,
  },
});

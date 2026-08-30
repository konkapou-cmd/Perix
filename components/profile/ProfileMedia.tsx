import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import { PROFILE_COLORS } from "./ProfileDesign";
import EmptyState from "../shared/EmptyState";
import MediaThumbnail from "../ui/MediaThumbnail";
import LazyMediaViewer, { MediaItem as MediaViewerItem } from "../LazyMediaViewer";
import { Post } from "../../lib/api";

const NUM_COLS = 3;
const ITEM_GAP = 8;
const SECTION_PAD = 16;

function getVideoThumbnailUrl(uri: string): string {
  if (uri.includes("mux.com")) {
    return uri.replace("stream.mux.com", "image.mux.com").replace(".m3u8", "/thumbnail.jpg?time=0&width=300");
  }
  return uri.replace("/upload/", "/upload/so_0,vc_00,w_300/");
}
const MAX_GALLERY_ITEMS = 30;

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
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const { width: screenWidth } = useWindowDimensions();
  const innerWidth = screenWidth - SECTION_PAD * 2;
  const itemSize = (innerWidth - ITEM_GAP * (NUM_COLS - 1)) / NUM_COLS;

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

  const viewerItems: MediaViewerItem[] = useMemo(() =>
    allMedia.map(item => ({ type: item.type, uri: item.uri })),
    [allMedia]
  );

  const handleItemPress = (item: MediaItem, index: number) => {
    setViewerVisible(true);
    setViewerIndex(index);
  };

  const handleDelete = (item: MediaItem, index: number) => {
    onDeleteItem?.(item.source, item.type, item.uri);
  };

  return (
    <View style={styles.container}>
      {allMedia.length === 0 ? (
        <EmptyState
          icon="images-outline"
          i18nKey="profile.noMedia"
          message="Noch keine Fotos oder Videos"
          size="large"
        />
      ) : (
        <View style={styles.webGrid}>
          {allMedia.map((item, index) => (
            <Pressable
              key={item.id}
              style={[styles.webGridItem, { width: itemSize, height: itemSize }]}
              onPress={() => handleItemPress(item, index)}
            >
              <MediaThumbnail
                uri={item.type === "video" ? getVideoThumbnailUrl(item.uri) : item.uri}
                type={item.type}
                aspectRatio={1}
                showTypeBadge={false}
                borderRadius={0}
              />
              {item.type === "video" && (
                <View style={styles.videoOverlay}>
                  <View style={styles.playCircle}>
                    <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
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
  webGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ITEM_GAP,
    paddingHorizontal: SECTION_PAD,
    paddingTop: 12,
    paddingBottom: 24,
  },
  webGridItem: {
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#EDF4FB",
    position: "relative",
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
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
});

import React, { useState, useCallback } from "react";
import {
  View,
  Image,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import ImageZoomModal from "../ImageZoomModal";
import AdaptiveVideo from "../AdaptiveVideo";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COLUMNS = 3;
const GAP = 6;
const PADDING = 16;
const ITEM_SIZE =
  (SCREEN_WIDTH - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

export interface GalleryCustomizerItem {
  uri: string;
  type: "image" | "video";
  id?: string;
}

interface GalleryCustomizerProps {
  images?: string[];
  videos?: string[];
  onAddImage?: () => void;
  onAddVideo?: () => void;
  onDeleteImage?: (index: number) => void;
  onDeleteVideo?: (index: number) => void;
  onReorderImages?: (from: number, to: number) => void;
  onReorderVideos?: (from: number, to: number) => void;
  title?: string;
  primaryColor?: string;
  textColor?: string;
  cardColor?: string;
}

interface DraggableItemProps {
  item: GalleryCustomizerItem;
  index: number;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDelete: () => void;
  onPress: () => void;
  totalItems: number;
  primaryColor: string;
  isFirst: boolean;
  isLast: boolean;
}

const DraggableItem: React.FC<DraggableItemProps> = React.memo(({
  item,
  index,
  onMoveUp,
  onMoveDown,
  onDelete,
  onPress,
  totalItems,
  primaryColor,
  isFirst,
  isLast,
}) => {
  const { t: t2 } = useTranslation();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleDelete = () => {
    Alert.alert(
      t2("premium.deleteItem"),
      t2("premium.deleteConfirm"),
      [
        { text: t2("premium.cancel"), style: "cancel" },
        { text: t2("premium.delete"), style: "destructive", onPress: onDelete },
      ]
    );
  };

  return (
    <Animated.View style={[styles.itemWrapper, animatedStyle]}>
      <Pressable
        style={[styles.item, { width: ITEM_SIZE, height: ITEM_SIZE }]}
        onPress={onPress}
        onLongPress={() => {
          scale.value = withSpring(1.05);
        }}
      >
        {item.type === "image" ? (
          <Image source={{ uri: item.uri }} style={styles.itemImage} />
        ) : (
          <View style={styles.videoWrapper}>
            <AdaptiveVideo
              uri={item.uri}
              style={styles.itemImage}
              autoPlay={false}
              showMuteButton={false}
            />
            <View style={styles.playOverlay}>
              <Ionicons name="play-circle" size={28} color="#fff" />
            </View>
          </View>
        )}

        <View style={styles.itemOverlay}>
          <View style={styles.reorderControls}>
            <Pressable
              style={[
                styles.reorderBtn,
                isFirst && styles.reorderBtnDisabled,
              ]}
              onPress={() => onMoveUp(index)}
              disabled={isFirst}
            >
              <Ionicons
                name="arrow-up"
                size={14}
                color={isFirst ? "#9ca3af" : "#fff"}
              />
            </Pressable>
            <Pressable
              style={[
                styles.reorderBtn,
                isLast && styles.reorderBtnDisabled,
              ]}
              onPress={() => onMoveDown(index)}
              disabled={isLast}
            >
              <Ionicons
                name="arrow-down"
                size={14}
                color={isLast ? "#9ca3af" : "#fff"}
              />
            </Pressable>
          </View>
          <Pressable style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash" size={14} color="#fff" />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
});
DraggableItem.displayName = 'DraggableItem';

export const GalleryCustomizer: React.FC<GalleryCustomizerProps> = ({
  images = [],
  videos = [],
  onAddImage,
  onAddVideo,
  onDeleteImage,
  onDeleteVideo,
  onReorderImages,
  onReorderVideos,
  title,
  primaryColor = COLORS.primaryDark,
  textColor = COLORS.textPrimary,
  cardColor = "#ffffff",
}) => {
  const { t } = useTranslation();
  const [zoomVisible, setZoomVisible] = useState(false);
  const [zoomUri, setZoomUri] = useState("");
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  const handleImagePress = (uri: string) => {
    setZoomUri(uri);
    setZoomVisible(true);
  };

  const imageItems: GalleryCustomizerItem[] = images.map((uri, i) => ({
    uri,
    type: "image" as const,
    id: `img-${i}`,
  }));

  const videoItems: GalleryCustomizerItem[] = videos.map((uri, i) => ({
    uri,
    type: "video" as const,
    id: `vid-${i}`,
  }));

  const handleMoveImageUp = useCallback(
    (index: number) => {
      if (index > 0 && onReorderImages) {
        onReorderImages(index, index - 1);
      }
    },
    [onReorderImages]
  );

  const handleMoveImageDown = useCallback(
    (index: number) => {
      if (index < images.length - 1 && onReorderImages) {
        onReorderImages(index, index + 1);
      }
    },
    [onReorderImages, images.length]
  );

  const handleMoveVideoUp = useCallback(
    (index: number) => {
      if (index > 0 && onReorderVideos) {
        onReorderVideos(index, index - 1);
      }
    },
    [onReorderVideos]
  );

  const handleMoveVideoDown = useCallback(
    (index: number) => {
      if (index < videos.length - 1 && onReorderVideos) {
        onReorderVideos(index, index + 1);
      }
    },
    [onReorderVideos, videos.length]
  );

  return (
    <View style={[styles.container, { backgroundColor: cardColor }]}>
      <Text style={[styles.sectionTitle, { color: textColor }]}>{title || t("premium.manageGallery")}</Text>

      {imageItems.length > 0 && (
        <>
          <View style={styles.typeHeader}>
            <View style={styles.typeLabel}>
              <Ionicons name="image" size={16} color={primaryColor} />
              <Text style={[styles.typeLabelText, { color: textColor }]}>
                {t("premium.photos")} ({imageItems.length})
              </Text>
            </View>
          </View>
          <View style={styles.grid}>
            {imageItems.map((item, index) => (
              <DraggableItem
                key={item.id}
                item={item}
                index={index}
                onMoveUp={handleMoveImageUp}
                onMoveDown={handleMoveImageDown}
                onDelete={() => onDeleteImage && onDeleteImage(index)}
                onPress={() => handleImagePress(item.uri)}
                totalItems={imageItems.length}
                primaryColor={primaryColor}
                isFirst={index === 0}
                isLast={index === imageItems.length - 1}
              />
            ))}
          </View>
        </>
      )}

      {videoItems.length > 0 && (
        <>
          <View style={[styles.typeHeader, { marginTop: 16 }]}>
            <View style={styles.typeLabel}>
              <Ionicons name="videocam" size={16} color={primaryColor} />
              <Text style={[styles.typeLabelText, { color: textColor }]}>
                {t("premium.videos")} ({videoItems.length})
              </Text>
            </View>
          </View>
          <View style={styles.grid}>
            {videoItems.map((item, index) => (
              <DraggableItem
                key={item.id}
                item={item}
                index={index}
                onMoveUp={handleMoveVideoUp}
                onMoveDown={handleMoveVideoDown}
                onDelete={() => onDeleteVideo && onDeleteVideo(index)}
                onPress={() => setActiveVideo(item.uri)}
                totalItems={videoItems.length}
                primaryColor={primaryColor}
                isFirst={index === 0}
                isLast={index === videoItems.length - 1}
              />
            ))}
          </View>
        </>
      )}

      <View style={styles.addButtons}>
        <Pressable
          style={[styles.addButton, { borderColor: primaryColor }]}
          onPress={onAddImage}
        >
          <Ionicons name="camera" size={20} color={primaryColor} />
          <Text style={[styles.addButtonText, { color: primaryColor }]}>
            {t("premium.addPhoto")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.addButton, { borderColor: primaryColor }]}
          onPress={onAddVideo}
        >
          <Ionicons name="videocam" size={20} color={primaryColor} />
          <Text style={[styles.addButtonText, { color: primaryColor }]}>
            {t("premium.addVideo")}
          </Text>
        </Pressable>
      </View>

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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  typeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  typeLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  typeLabelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  itemWrapper: {
    borderRadius: 12,
    overflow: "hidden",
  },
  item: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  videoWrapper: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1f2937",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  itemOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: 6,
  },
  reorderControls: {
    gap: 4,
  },
  reorderBtn: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 4,
    padding: 4,
  },
  reorderBtnDisabled: {
    opacity: 0.3,
  },
  deleteBtn: {
    backgroundColor: "rgba(239,68,68,0.8)",
    borderRadius: 4,
    padding: 4,
  },
  addButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  addButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  addButtonText: {
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

export default GalleryCustomizer;
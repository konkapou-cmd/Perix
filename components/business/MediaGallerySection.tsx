import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AdaptiveVideo from "../AdaptiveVideo";

type Props = {
  images: string[];
  videos: string[];
  onAddImage: () => void;
  onAddVideo: () => void;
  onDeleteImage: (index: number) => void;
  onDeleteVideo: (index: number) => void;
  onViewMedia: (uri: string, type: "image" | "video", index: number) => void;
  isUploading?: boolean;
};

export default function MediaGallerySection({
  images,
  videos,
  onAddImage,
  onAddVideo,
  onDeleteImage,
  onDeleteVideo,
  onViewMedia,
  isUploading,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t("business.mediaGallery")}</Text>
      </View>

      {/* Images Section */}
      <View style={styles.gallerySection}>
        <View style={styles.gallerySectionHeader}>
          <Text style={styles.galleryLabel}>
            {t("business.images")} ({images.length})
          </Text>
          <Pressable style={styles.addButton} onPress={onAddImage}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>{t("common.add")}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {images.map((img, index) => (
            <View key={`img-${index}`} style={styles.galleryItemWrapper}>
              <Pressable onPress={() => onViewMedia(img, "image", index)}>
                <Image source={{ uri: img }} style={styles.galleryImage} />
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDeleteImage(index)}
              >
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </Pressable>
            </View>
          ))}
          {images.length === 0 && (
            <View style={styles.emptyGallery}>
              <Ionicons name="images-outline" size={32} color="#d1d5db" />
              <Text style={styles.emptyText}>{t("business.noImages")}</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Videos Section */}
      <View style={styles.gallerySection}>
        <View style={styles.gallerySectionHeader}>
          <Text style={styles.galleryLabel}>
            {t("business.videos")} ({videos.length})
          </Text>
          <Pressable
            style={[styles.addButton, isUploading && styles.addButtonDisabled]}
            onPress={onAddVideo}
            disabled={isUploading}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>{t("common.add")}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {videos.map((vid, index) => (
            <View key={`vid-${index}`} style={styles.galleryItemWrapper}>
              <Pressable onPress={() => onViewMedia(vid, "video", index)}>
                <View style={styles.videoThumbnail}>
                  <AdaptiveVideo
                    source={{ uri: vid }}
                    style={{ width: "100%", height: "100%" }}
                    useNativeControls={false}
                    autoPlay={false}
                  />
                  <View style={styles.videoOverlay}>
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                </View>
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDeleteVideo(index)}
              >
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </Pressable>
            </View>
          ))}
          {videos.length === 0 && (
            <View style={styles.emptyGallery}>
              <Ionicons name="videocam-outline" size={32} color="#d1d5db" />
              <Text style={styles.emptyText}>{t("business.noVideos")}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  gallerySection: {
    marginTop: 12,
  },
  gallerySectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  galleryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000000",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  galleryItemWrapper: {
    position: "relative",
    marginRight: 10,
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: 10,
  },
  videoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#1f2937",
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  deleteButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 11,
  },
  emptyGallery: {
    width: 200,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 12,
    color: "#9ca3af",
  },
});

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AdaptiveVideo from "../AdaptiveVideo";

type Props = {
  videos: string[];
  onViewVideo: (uri: string) => void;
  onDeleteVideo: (index: number) => void;
  onAddVideo: () => void;
};

export default function VideoGallerySection({
  videos,
  onViewVideo,
  onDeleteVideo,
  onAddVideo,
}: Props) {
  const { t } = useTranslation();

  // Filter out YouTube links
  const uploadedVideos = videos.filter(v => !v.includes('youtube') && !v.includes('youtu.be'));

  return (
    <View style={styles.card}>
      <View style={styles.galleryHeader}>
        <View style={styles.galleryTitleRow}>
          <Ionicons name="videocam" size={18} color="#ef4444" />
          <Text style={styles.cardTitle}>{t("artistProfile.uploadedVideos") || "Uploaded Videos"}</Text>
        </View>
        <Text style={styles.galleryCount}>{uploadedVideos.length} videos</Text>
      </View>
      {uploadedVideos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
          {uploadedVideos.map((video, index) => (
            <Pressable 
              key={`vid-${index}`} 
              style={styles.galleryItemWrapper}
              onPress={() => onViewVideo(video)}
            >
              <AdaptiveVideo uri={video} style={styles.galleryImage} />
              <View style={styles.videoOverlay}>
                <Ionicons name="play-circle" size={32} color="#fff" />
              </View>
              <Pressable 
                style={styles.galleryDeleteButton} 
                onPress={(e) => { e.stopPropagation(); onDeleteVideo(index); }}
              >
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>{t("businessProfile.noVideosYet") || "No videos uploaded yet"}</Text>
      )}
      <Pressable style={styles.secondaryButton} onPress={onAddVideo}>
        <Ionicons name="videocam-outline" size={16} color="#4c6fff" />
        <Text style={styles.secondaryButtonText}>{t("businessProfile.addVideo")}</Text>
      </Pressable>
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 8,
  },
  galleryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  galleryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  galleryCount: {
    fontSize: 13,
    color: "#6b7280",
  },
  galleryScroll: {
    marginBottom: 12,
  },
  galleryItemWrapper: {
    position: "relative",
    marginRight: 12,
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 12,
  },
  galleryDeleteButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  secondaryButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
});

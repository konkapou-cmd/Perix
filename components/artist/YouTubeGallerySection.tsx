import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type Props = {
  videos: string[];
  newYoutubeLink: string;
  onLinkChange: (link: string) => void;
  onAddLink: () => void;
  onDeleteLink: (index: number) => void;
};

// Helper to extract YouTube video ID
const getYoutubeVideoId = (url: string): string => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : "";
};

export default function YouTubeGallerySection({
  videos,
  newYoutubeLink,
  onLinkChange,
  onAddLink,
  onDeleteLink,
}: Props) {
  const { t } = useTranslation();

  // Filter only YouTube links
  const youtubeVideos = videos.filter(v => v.includes('youtube') || v.includes('youtu.be'));

  return (
    <View style={styles.card}>
      <View style={styles.galleryHeader}>
        <View style={styles.galleryTitleRow}>
          <Ionicons name="logo-youtube" size={18} color="#ff0000" />
          <Text style={styles.cardTitle}>{t("artistProfile.youtubeVideos") || "YouTube Videos"}</Text>
        </View>
        <Text style={styles.galleryCount}>{youtubeVideos.length} videos</Text>
      </View>
      {youtubeVideos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
          {youtubeVideos.map((link, index) => {
            const videoId = getYoutubeVideoId(link);
            return (
              <View key={`yt-${index}`} style={styles.galleryItemWrapper}>
                <Pressable onPress={() => Linking.openURL(link)}>
                  <Image 
                    source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
                    style={styles.galleryImage}
                  />
                  <View style={styles.youtubeOverlay}>
                    <Ionicons name="logo-youtube" size={32} color="#ff0000" />
                  </View>
                </Pressable>
                <Pressable 
                  style={styles.galleryDeleteButton} 
                  onPress={() => onDeleteLink(index)}
                >
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>{t("artistProfile.noYoutubeVideos") || "No YouTube videos yet"}</Text>
      )}
      <View style={styles.youtubeInputRow}>
        <TextInput
          style={styles.youtubeInput}
          placeholder={t("artist.youtubeLink")}
          value={newYoutubeLink}
          onChangeText={onLinkChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.addYoutubeButton} onPress={onAddLink}>
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
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
  youtubeOverlay: {
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
  youtubeInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  youtubeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  addYoutubeButton: {
    backgroundColor: "#ff0000",
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
});

import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AdaptiveImage from "../AdaptiveImage";
import AdaptiveVideo from "../AdaptiveVideo";
import { Post } from "../../lib/api";

type Props = {
  posts: Post[];
  onViewMedia: (uri: string, type: "image" | "video") => void;
  onHidePost: (postId: string) => void;
};

export default function ArtistFanGallerySection({ posts, onViewMedia, onHidePost }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.galleryHeader}>
        <View style={styles.galleryTitleRow}>
          <Ionicons name="people" size={18} color="#10b981" />
          <Text style={styles.cardTitle}>{t("artistProfile.fanGallery")}</Text>
        </View>
        <Text style={styles.galleryCount}>{posts.length} posts</Text>
      </View>
      {posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="camera-outline" size={32} color="#d1d5db" />
          <Text style={styles.emptyText}>{t("artistProfile.noFanGallery")}</Text>
          <Text style={styles.emptyHintText}>
            {t("artist.fanGalleryHint") || "Photos from fans who tag you will appear here"}
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
          {posts.map((post) => (
            <Pressable 
              key={post.post_id} 
              style={styles.galleryItemWrapper}
              onPress={() => {
                if (post.image_base64) onViewMedia(post.image_base64, "image");
                else if (post.video_url) onViewMedia(post.video_url, "video");
              }}
            >
              {post.image_base64 ? (
                <AdaptiveImage uri={post.image_base64} style={styles.galleryImage} />
              ) : post.video_url ? (
                <>
                  <AdaptiveVideo uri={post.video_url} style={styles.galleryImage} />
                  <View style={styles.videoOverlay}>
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                </>
              ) : null}
              <View style={styles.fanGalleryAuthorBadge}>
                {post.author.profile_photo ? (
                  <Image source={{ uri: post.author.profile_photo }} style={styles.fanGalleryAuthorImage} />
                ) : (
                  <Text style={styles.fanGalleryAuthorText}>{post.author.name?.charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <Pressable 
                style={styles.fanGalleryHideBtn} 
                onPress={(e) => { e.stopPropagation(); onHidePost(post.post_id); }}
              >
                <Ionicons name="eye-off" size={14} color="#ef4444" />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      )}
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
    marginBottom: 4,
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
  fanGalleryAuthorBadge: {
    position: "absolute",
    bottom: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  fanGalleryAuthorImage: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  fanGalleryAuthorText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#374151",
  },
  fanGalleryHideBtn: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 10,
    padding: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyText: {
    color: "#9ca3af",
    marginTop: 8,
  },
  emptyHintText: {
    color: "#d1d5db",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
});

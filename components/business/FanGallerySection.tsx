import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import { Post } from "../../lib/api";

type Props = {
  posts: Post[];
  onViewMedia: (uri: string, type: "image" | "video", index: number) => void;
  onHidePost: (postId: string) => void;
};

export default function FanGallerySection({ posts, onViewMedia, onHidePost }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.galleryHeader}>
        <View style={styles.galleryTitleRow}>
          <Ionicons name="people" size={18} color="#10b981" />
          <Text style={styles.cardTitle}>{t("business.fanGallery")}</Text>
        </View>
        <Text style={styles.galleryCount}>{posts.length} posts</Text>
      </View>
      {posts.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {posts.map((post, index) => (
            <Pressable
              key={post.post_id}
              style={styles.fanGalleryItem}
              onPress={() => {
                if (post.image_base64) {
                  onViewMedia(post.image_base64, "image", index);
                } else if (post.video_url) {
                  onViewMedia(post.video_url, "video", index);
                }
              }}
            >
              {post.image_base64 ? (
                <Image source={{ uri: post.image_base64 }} style={styles.fanGalleryImage} />
              ) : post.video_url ? (
                <View style={styles.fanGalleryVideoThumb}>
                  <Ionicons name="play-circle" size={32} color="#fff" />
                </View>
              ) : null}
              <View style={styles.fanGalleryAuthorBadge}>
                {(post.author?.profile_photo || post.author?.picture) ? (
                    <Image
                      source={{ uri: (post.author?.profile_photo || post.author?.picture) as string }}
                      style={styles.fanGalleryAuthorImage}
                    />
                  ) : (
                    <Text style={styles.fanGalleryAuthorText}>
                      {post.author?.name?.charAt(0).toUpperCase()}
                    </Text>
                  )}
              </View>
              <Pressable
                style={styles.fanGalleryHideBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  onHidePost(post.post_id);
                }}
              >
                <Ionicons name="eye-off" size={14} color="#ef4444" />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.fanGalleryEmptyState}>
          <Ionicons name="camera-outline" size={32} color="#d1d5db" />
          <Text style={styles.emptyText}>{t("business.noFanGallery")}</Text>
          <Text style={styles.emptyHintText}>
            {t("business.fanGalleryHint") || "Photos from fans who tag this business will appear here"}
          </Text>
        </View>
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
  },
  cardTitle: {
    fontWeight: "600",
    color: COLORS.textPrimary,
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
    color: "#6b7280",
    fontSize: 13,
  },
  fanGalleryItem: {
    position: "relative",
    marginRight: 12,
  },
  fanGalleryImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  fanGalleryVideoThumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
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
  fanGalleryEmptyState: {
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
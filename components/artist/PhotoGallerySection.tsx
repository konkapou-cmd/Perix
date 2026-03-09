import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AdaptiveImage from "../AdaptiveImage";

type Props = {
  images: string[];
  onViewImage: (uri: string) => void;
  onDeleteImage: (index: number) => void;
  onAddImage: () => void;
};

export default function PhotoGallerySection({
  images,
  onViewImage,
  onDeleteImage,
  onAddImage,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.galleryHeader}>
        <View style={styles.galleryTitleRow}>
          <Ionicons name="images" size={18} color="#4c6fff" />
          <Text style={styles.cardTitle}>{t("artistProfile.photos") || "Photos"}</Text>
        </View>
        <Text style={styles.galleryCount}>{images.length} {t("userProfile.photos")}</Text>
      </View>
      {images.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
          {images.map((image, index) => (
            <Pressable 
              key={`img-${index}`} 
              style={styles.galleryItemWrapper}
              onPress={() => onViewImage(image)}
            >
              <AdaptiveImage uri={image} style={styles.galleryImage} />
              <View style={styles.zoomIndicator}>
                <Ionicons name="expand" size={14} color="#fff" />
              </View>
              <Pressable 
                style={styles.galleryDeleteButton} 
                onPress={(e) => { e.stopPropagation(); onDeleteImage(index); }}
              >
                <Ionicons name="close-circle" size={24} color="#ef4444" />
              </Pressable>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>{t("businessProfile.noPhotosYet") || "No photos yet"}</Text>
      )}
      <Pressable style={styles.secondaryButton} onPress={onAddImage}>
        <Ionicons name="image-outline" size={16} color="#4c6fff" />
        <Text style={styles.secondaryButtonText}>{t("businessProfile.addPhoto")}</Text>
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
  zoomIndicator: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    padding: 4,
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

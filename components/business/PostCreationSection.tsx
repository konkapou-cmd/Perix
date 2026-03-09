import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AdaptiveImage from "../AdaptiveImage";
import AdaptiveVideo from "../AdaptiveVideo";

type Props = {
  postText: string;
  postImage: string | null;
  postVideoPreview: string | null;
  postMediaRatio: number | null;
  onTextChange: (text: string) => void;
  onPickImage: () => void;
  onPickVideo: () => void;
  onCreatePost: () => void;
  onCreateStory: () => void;
};

export default function PostCreationSection({
  postText,
  postImage,
  postVideoPreview,
  postMediaRatio,
  onTextChange,
  onPickImage,
  onPickVideo,
  onCreatePost,
  onCreateStory,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("business.contentCreation")}</Text>
      <TextInput
        placeholder={t("business.shareAnUpdate")}
        value={postText}
        onChangeText={onTextChange}
        style={styles.input}
        multiline
      />
      {postImage && (
        <AdaptiveImage
          uri={postImage}
          style={styles.postPreview}
          ratio={postMediaRatio || undefined}
        />
      )}
      {postVideoPreview && (
        <AdaptiveVideo
          uri={postVideoPreview}
          style={styles.postPreview}
          ratio={postMediaRatio || undefined}
        />
      )}
      <View style={styles.postActions}>
        <Pressable style={styles.iconButton} onPress={onPickImage}>
          <Ionicons name="image-outline" size={18} color="#4c6fff" />
          <Text style={styles.iconButtonText}>{t("common.photo")}</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onPickVideo}>
          <Ionicons name="videocam-outline" size={18} color="#4c6fff" />
          <Text style={styles.iconButtonText}>{t("common.video")}</Text>
        </Pressable>
        <Pressable style={styles.postButton} onPress={onCreatePost}>
          <Ionicons name="paper-plane" size={16} color="#fff" />
          <Text style={styles.postButtonText}>{t("common.post")}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.secondaryButton} onPress={onCreateStory}>
        <Text style={styles.secondaryButtonText}>{t("business.publishStory")}</Text>
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
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  postPreview: {
    width: "100%",
    borderRadius: 16,
    marginBottom: 12,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "nowrap",
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iconButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 6,
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    gap: 8,
    minWidth: 120,
    shadowColor: "#4c6fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  postButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
});

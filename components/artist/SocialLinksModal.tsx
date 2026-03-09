import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

// Social media platform options
const SOCIAL_PLATFORMS = [
  { key: "instagram", icon: "logo-instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "facebook", icon: "logo-facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
  { key: "twitter", icon: "logo-twitter", label: "Twitter/X", placeholder: "https://twitter.com/..." },
  { key: "youtube", icon: "logo-youtube", label: "YouTube", placeholder: "https://youtube.com/..." },
  { key: "spotify", icon: "musical-notes", label: "Spotify", placeholder: "https://spotify.com/..." },
  { key: "tiktok", icon: "logo-tiktok", label: "TikTok", placeholder: "https://tiktok.com/..." },
  { key: "website", icon: "globe-outline", label: "Website", placeholder: "https://..." },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  socials: Record<string, string>;
  onSocialsChange: (socials: Record<string, string>) => void;
  youtubeUrl: string;
  onYoutubeUrlChange: (url: string) => void;
  onSave: () => void;
};

export default function SocialLinksModal({
  visible,
  onClose,
  socials,
  onSocialsChange,
  youtubeUrl,
  onYoutubeUrlChange,
  onSave,
}: Props) {
  const { t } = useTranslation();

  const handlePlatformChange = (key: string, value: string) => {
    onSocialsChange({ ...socials, [key]: value });
    
    // Auto-detect YouTube URL for preview
    if (key === "youtube" && value.includes("youtube.com")) {
      onYoutubeUrlChange(value);
    }
  };

  // Extract YouTube video ID for preview
  const getYoutubeVideoId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    return match ? match[1] : null;
  };

  const youtubeVideoId = getYoutubeVideoId(youtubeUrl || socials.youtube || "");

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t("artist.socialLinks")}</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
        </View>
        <ScrollView style={styles.modalBody}>
          <Text style={styles.sectionDescription}>
            {t("artist.socialLinksDescription")}
          </Text>

          {SOCIAL_PLATFORMS.map((platform) => (
            <View key={platform.key} style={styles.platformRow}>
              <View style={styles.platformHeader}>
                <Ionicons name={platform.icon as any} size={20} color="#6b7280" />
                <Text style={styles.platformLabel}>{platform.label}</Text>
              </View>
              <TextInput
                style={styles.input}
                value={socials[platform.key] || ""}
                onChangeText={(text) => handlePlatformChange(platform.key, text)}
                placeholder={platform.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          ))}

          {/* YouTube Preview */}
          {youtubeVideoId && (
            <View style={styles.youtubePreview}>
              <Text style={styles.previewLabel}>{t("artist.youtubePreview")}</Text>
              <Image
                source={{
                  uri: `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`,
                }}
                style={styles.youtubeThumbnail}
              />
            </View>
          )}
        </ScrollView>
        <View style={styles.modalFooter}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>{t("common.save")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  sectionDescription: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
  },
  platformRow: {
    marginBottom: 16,
  },
  platformHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  platformLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
  },
  youtubePreview: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
  },
  youtubeThumbnail: {
    width: "100%",
    height: 180,
    borderRadius: 8,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  secondaryButtonText: {
    color: "#374151",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});

import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";
import { useTranslation } from "react-i18next";

interface SocialLinksModalProps {
  visible: boolean;
  onClose: () => void;
  socials: Record<string, string>;
  onSocialsChange: (socials: Record<string, string>) => void;
  youtubeUrl?: string;
  onYoutubeUrlChange?: (url: string) => void;
  onSave: () => void;
}

const SOCIAL_PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: "logo-instagram" },
  { key: "facebook", label: "Facebook", icon: "logo-facebook" },
  { key: "twitter", label: "Twitter", icon: "logo-twitter" },
  { key: "youtube", label: "YouTube", icon: "logo-youtube" },
  { key: "tiktok", label: "TikTok", icon: "musical-notes" },
  { key: "soundcloud", label: "SoundCloud", icon: "cloud" },
  { key: "spotify", label: "Spotify", icon: "logo-snapchat" },
  { key: "website", label: "Website", icon: "globe" },
];

export default function SocialLinksModal({
  visible,
  onClose,
  socials,
  onSocialsChange,
  onSave,
}: SocialLinksModalProps) {
  const { t } = useTranslation();
  const [localSocials, setLocalSocials] = useState<Record<string, string>>(socials);

  React.useEffect(() => {
    setLocalSocials(socials);
  }, [socials, visible]);

  const handleChange = (key: string, value: string) => {
    const updated = { ...localSocials };
    if (value.trim()) {
      updated[key] = value.trim();
    } else {
      delete updated[key];
    }
    setLocalSocials(updated);
  };

  const handleSave = () => {
    onSocialsChange(localSocials);
    onSave();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("profile.editSocialLinks", "Edit Social Links")}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {SOCIAL_PLATFORMS.map((platform) => (
              <View key={platform.key} style={styles.inputRow}>
                <View style={styles.platformLabel}>
                  <Ionicons name={platform.icon as any} size={20} color={COLORS.primaryDark} />
                  <Text style={styles.platformText}>{platform.label}</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder={`${platform.label} URL`}
                  placeholderTextColor="#9ca3af"
                  value={localSocials[platform.key] || ""}
                  onChangeText={(value) => handleChange(platform.key, value)}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>{t("common.cancel", "Cancel")}</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveText}>{t("common.save", "Save")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  content: {
    padding: 16,
  },
  inputRow: {
    marginBottom: 16,
  },
  platformLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  platformText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: COLORS.surfaceSoft,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
  },
  saveText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

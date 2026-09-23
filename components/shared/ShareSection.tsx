import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SPACING } from "../../lib/designTokens";

type ShareSectionProps = {
  title?: string;
  accentColor?: string;
  saved?: boolean;
  onWhatsApp?: () => void;
  onShare?: () => void;
  onSave?: () => void;
};

export const ShareSection = ({
  title,
  accentColor = "#59ABE3",
  saved = false,
  onWhatsApp,
  onShare,
  onSave,
}: ShareSectionProps) => {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title ?? t("share.inviteFriends", "Freunde einladen")}</Text>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={onWhatsApp}>
          <View style={[styles.iconCircle, { backgroundColor: "#22C55E15" }]}>
            <Ionicons name="logo-whatsapp" size={22} color="#22C55E" />
          </View>
          <Text style={styles.actionLabel}>WhatsApp</Text>
        </Pressable>

        <Pressable style={styles.action} onPress={onShare}>
          <View style={[styles.iconCircle, { backgroundColor: accentColor + "15" }]}>
            <Ionicons name="share-social-outline" size={22} color={accentColor} />
          </View>
          <Text style={styles.actionLabel}>{t("common.share", "Share")}</Text>
        </Pressable>

        <Pressable style={styles.action} onPress={onSave}>
          <View style={[styles.iconCircle, { backgroundColor: "#FFC40020" }]}>
            <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={22} color="#FFC400" />
          </View>
          <Text style={styles.actionLabel}>{saved ? t("common.saved", "Saved") : t("common.save", "Save")}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.section,
    paddingHorizontal: SPACING.page,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#264348",
    marginBottom: SPACING.std,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.gap * 2,
  },
  action: {
    alignItems: "center",
    gap: 6,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#264348",
  },
});

export default ShareSection;

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from "../../lib/designTokens";

type ShareSectionProps = {
  title?: string;
  accentColor?: string;
  saved?: boolean;
  onWhatsApp?: () => void;
  onShare?: () => void;
  onSave?: () => void;
};

export const ShareSection = ({
  title = "Freunde einladen",
  accentColor = COLORS.primary,
  saved = false,
  onWhatsApp,
  onShare,
  onSave,
}: ShareSectionProps) => (
  <View style={styles.card}>
    <Text style={[styles.title, { color: accentColor }]}>{title}</Text>

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
        <Text style={styles.actionLabel}>Teilen</Text>
      </Pressable>

      <Pressable style={styles.action} onPress={onSave}>
        <View style={[styles.iconCircle, { backgroundColor: COLORS.gold + "20" }]}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={22} color={COLORS.gold} />
        </View>
        <Text style={styles.actionLabel}>{saved ? "Gespeichert" : "Speichern"}</Text>
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.section,
    marginHorizontal: SPACING.page,
    alignItems: "center",
    ...SHADOWS.subtle,
  },
  title: {
    fontSize: FONT_SIZES.h3,
    fontWeight: "700",
    marginBottom: SPACING.std,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
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
    fontSize: FONT_SIZES.small,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
});

export default ShareSection;

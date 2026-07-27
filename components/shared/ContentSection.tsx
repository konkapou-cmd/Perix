import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";

type ContentSectionProps = {
  icon: string;
  title: string;
  children: React.ReactNode;
  iconColor?: string;
};

export default function ContentSection({ icon, title, children, iconColor }: ContentSectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name={icon as any} size={18} color={iconColor || COLORS.textPrimary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.section,
    marginHorizontal: SPACING.page,
    marginTop: SPACING.compact,
    ...SHADOWS.subtle,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: SPACING.small,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
});

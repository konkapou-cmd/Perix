import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from "../../lib/designTokens";

type InfoCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accentColor?: string;
};

export const InfoCard = ({ icon, label, value, accentColor = COLORS.primary }: InfoCardProps) => (
  <View style={styles.card}>
    <View style={[styles.iconBox, { backgroundColor: accentColor + "15" }]}>
      <Ionicons name={icon} size={20} color={accentColor} />
    </View>
    <Text style={styles.label}>{label.toUpperCase()}</Text>
    <Text style={styles.value} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 96,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.std,
    alignItems: "flex-start",
    ...SHADOWS.subtle,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.small,
  },
  label: {
    fontSize: FONT_SIZES.micro,
    fontWeight: "500",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: FONT_SIZES.body,
    fontWeight: "700",
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
});

export default InfoCard;

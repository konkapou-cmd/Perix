import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from "../../lib/designTokens";

type LocationCardProps = {
  label: string;
  address: string;
  accentColor?: string;
  onPress?: () => void;
};

export const LocationCard = ({
  label,
  address,
  accentColor = COLORS.primary,
  onPress,
}: LocationCardProps) => (
  <Pressable style={styles.card} onPress={onPress}>
    <View style={[styles.iconBox, { backgroundColor: accentColor + "12" }]}>
      <Ionicons name="location" size={22} color={accentColor} />
    </View>
    <View style={styles.textArea}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Text style={styles.address} numberOfLines={3}>{address}</Text>
    </View>
    <View style={[styles.navBtn, { backgroundColor: accentColor + "12" }]}>
      <Ionicons name="navigate" size={20} color={accentColor} />
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.background,
    borderRadius: 22,
    padding: SPACING.section,
    marginHorizontal: SPACING.page,
    ...SHADOWS.subtle,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  textArea: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: FONT_SIZES.micro,
    fontWeight: "500",
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  address: {
    fontSize: FONT_SIZES.body,
    fontWeight: "700",
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default LocationCard;

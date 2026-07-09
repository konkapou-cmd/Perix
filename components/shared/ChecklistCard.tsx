import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from "../../lib/designTokens";

type ChecklistCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  items: string[];
  accentColor?: string;
};

export const ChecklistCard = ({ icon, title, items, accentColor = COLORS.primary }: ChecklistCardProps) => {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name={icon} size={18} color={accentColor} style={{ marginRight: SPACING.small }} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.list}>
        {items.map((item, i) => (
          <View key={i} style={styles.row}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.detailSuccess} style={{ marginRight: SPACING.small }} />
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.section,
    marginHorizontal: SPACING.page,
    ...SHADOWS.subtle,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.compact,
  },
  title: {
    fontSize: FONT_SIZES.h3,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  list: {
    gap: SPACING.small,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  itemText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    flex: 1,
  },
});

export default ChecklistCard;

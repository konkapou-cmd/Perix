import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SPACING, ICON_SIZES } from "../../lib/designTokens";

type SectionHeaderProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  count?: number;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  style?: ViewStyle;
};

export const SectionHeader = ({
  icon,
  title,
  count,
  onSeeAll,
  seeAllLabel = "See All",
  style,
}: SectionHeaderProps) => {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        {icon && (
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={16} color={COLORS.background} />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
        {count !== undefined && count > 0 && (
          <Text style={styles.count}>{count}</Text>
        )}
      </View>
      {onSeeAll && (
        <Pressable style={styles.seeAllBtn} onPress={onSeeAll}>
          <Text style={styles.seeAllText}>{seeAllLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.background} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.lg,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: FONT_SIZES.h4,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primary,
  },
  count: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHTS.medium,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    gap: 2,
  },
  seeAllText: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.background,
  },
});

export default SectionHeader;

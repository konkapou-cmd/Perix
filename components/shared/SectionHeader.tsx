import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SPACING } from "../../lib/designTokens";

type SectionHeaderProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  count?: number;
  onSeeAll?: () => void;
  seeAllLabel?: string;
  accent?: string;
  style?: ViewStyle;
};

export const SectionHeader = ({
  icon,
  title,
  count,
  onSeeAll,
  seeAllLabel,
  accent = COLORS.primary,
  style,
}: SectionHeaderProps) => {
  const { t } = useTranslation();
  const label = seeAllLabel || t("common.seeAll", "Alle anzeigen");
  return (
    <View style={[styles.row, style]}>
      <View style={styles.left}>
        {icon && (
          <View style={[styles.iconContainer, { backgroundColor: accent }]}>
            <Ionicons name={icon} size={16} color={COLORS.background} />
          </View>
        )}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {count !== undefined && count > 0 && (
          <Text style={styles.count}>{count}</Text>
        )}
      </View>
      {onSeeAll && (
        <Pressable style={[styles.seeAllBtn, { backgroundColor: accent }]} onPress={onSeeAll}>
          <Text style={styles.seeAllText} numberOfLines={1}>{label}</Text>
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
    marginBottom: SPACING.compact,
    gap: 8,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
    flex: 1,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: FONT_SIZES.h4,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  count: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHTS.medium,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.compact,
    paddingVertical: SPACING.small,
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

import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SPACING } from "../../lib/designTokens";

type BadgeVariant = "default" | "primary" | "error" | "success" | "warning" | "gold" | "info";
type BadgeSize = "small" | "medium";

type BadgeProps = {
  text: string | number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
};

const VARIANT_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: COLORS.border, text: COLORS.textSecondary },
  primary: { bg: COLORS.primary, text: COLORS.background },
  error: { bg: COLORS.error, text: COLORS.background },
  success: { bg: COLORS.success, text: COLORS.background },
  warning: { bg: COLORS.warning, text: COLORS.background },
  gold: { bg: COLORS.gold, text: COLORS.primary },
  info: { bg: COLORS.info, text: COLORS.background },
};

export const Badge = ({
  text,
  variant = "default",
  size = "small",
  icon,
  style,
}: BadgeProps) => {
  const colors = VARIANT_COLORS[variant];
  const isSmall = size === "small";

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          paddingHorizontal: isSmall ? SPACING.small : SPACING.small,
          paddingVertical: isSmall ? 2 : SPACING.tiny,
        },
        style,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={isSmall ? 10 : 12}
          color={colors.text}
          style={styles.icon}
        />
      )}
      <Text
        style={[
          styles.text,
          {
            fontSize: isSmall ? FONT_SIZES.micro : FONT_SIZES.small,
            color: colors.text,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.xl,
    gap: 2,
  },
  text: {
    fontWeight: FONT_WEIGHTS.bold,
  },
  icon: {
    marginRight: 1,
  },
});

export default Badge;

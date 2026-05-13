import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  COLORS,
  BORDER_RADIUS,
  FONT_SIZES,
  FONT_WEIGHTS,
  SPACING,
} from "../../lib/designTokens";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type ButtonSize = "small" | "medium" | "large";

type ButtonProps = {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

const SIZE_MAP = {
  small: { py: SPACING.sm, px: SPACING.lg, font: FONT_SIZES.small, icon: 14 },
  medium: { py: SPACING.md + 2, px: SPACING.xl, font: FONT_SIZES.bodySmall, icon: 16 },
  large: { py: SPACING.lg + 2, px: SPACING.xxl, font: FONT_SIZES.h4, icon: 20 },
} as const;

const VARIANT_BG: Record<ButtonVariant, string> = {
  primary: COLORS.primary,
  secondary: COLORS.border,
  outline: "transparent",
  ghost: "transparent",
  danger: COLORS.error,
  success: COLORS.success,
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  primary: COLORS.background,
  secondary: COLORS.primary,
  outline: COLORS.primary,
  ghost: COLORS.primary,
  danger: COLORS.background,
  success: COLORS.background,
};

const VARIANT_BORDER: Record<ButtonVariant, string | undefined> = {
  primary: undefined,
  secondary: undefined,
  outline: COLORS.primary,
  ghost: undefined,
  danger: undefined,
  success: undefined,
};

export const Button = ({
  title,
  onPress,
  icon,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) => {
  const s = SIZE_MAP[size];
  const bgColor = VARIANT_BG[variant];
  const textColor = VARIANT_TEXT[variant];
  const borderColor = VARIANT_BORDER[variant];
  const iconColor = variant === "outline" || variant === "ghost" || variant === "secondary"
    ? COLORS.primary
    : COLORS.background;

  return (
    <Pressable
      style={[
        styles.button,
        {
          paddingVertical: s.py,
          paddingHorizontal: s.px,
          backgroundColor: bgColor,
          borderWidth: borderColor ? 1.5 : 0,
          borderColor: borderColor || "transparent",
          opacity: disabled || loading ? 0.6 : 1,
          width: fullWidth ? "100%" : undefined,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <>
          {icon && (
            <Ionicons
              name={icon}
              size={s.icon}
              color={iconColor}
              style={styles.icon}
            />
          )}
          <Text
            style={[
              styles.text,
              { fontSize: s.font, color: textColor },
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  text: {
    fontWeight: FONT_WEIGHTS.semibold,
  },
  icon: {
    marginRight: 2,
  },
});

export default Button;

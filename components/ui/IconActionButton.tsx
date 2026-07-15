import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";

type IconActionButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  variant?: "muted" | "primary" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  accessibilityLabel?: string;
};

const VARIANT_COLORS = {
  muted: COLORS.textMuted,
  primary: COLORS.primary,
  danger: COLORS.danger,
  gold: COLORS.gold,
} as const;

const SIZE_CONFIG = {
  sm: { container: 40, icon: 18 },
  md: { container: 44, icon: 20 },
  lg: { container: 48, icon: 22 },
} as const;

export const IconActionButton = ({
  icon,
  onPress,
  variant = "muted",
  size = "md",
  disabled = false,
  accessibilityLabel,
}: IconActionButtonProps) => {
  const color = VARIANT_COLORS[variant];
  const cfg = SIZE_CONFIG[size];

  return (
    <Pressable
      style={[styles.btn, { width: cfg.container, height: cfg.container, borderRadius: cfg.container / 2 }, disabled && styles.disabled]}
      onPress={disabled ? undefined : onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={cfg.icon} color={color} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.4,
  },
});

export default IconActionButton;

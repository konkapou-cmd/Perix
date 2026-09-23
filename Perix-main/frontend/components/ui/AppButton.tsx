import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";

type AppButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "md" | "lg";
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export default function AppButton({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;

  const bgColors: Record<string, string> = {
    primary: COLORS.primaryDark,
    secondary: COLORS.primaryLight,
    outline: "transparent",
    danger: "#ef4444",
  };

  const textColors: Record<string, string> = {
    primary: "#ffffff",
    secondary: COLORS.primaryDark,
    outline: COLORS.primaryDark,
    danger: "#ffffff",
  };

  return (
    <Pressable
      style={[
        styles.base,
        { backgroundColor: bgColors[variant] },
        variant === "outline" && styles.outline,
        size === "lg" && styles.lg,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={isDisabled ? undefined : onPress}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColors[variant]} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === "lg" ? 20 : 18} color={textColors[variant]} />}
          <Text style={[styles.text, { color: textColors[variant] }, size === "lg" && styles.textLg]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: COLORS.primaryDark,
  },
  lg: {
    minHeight: 56,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontSize: 15,
    fontWeight: "700",
  },
  textLg: {
    fontSize: 17,
  },
});

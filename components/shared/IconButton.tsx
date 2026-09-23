import React from "react";
import { Pressable, StyleSheet, ViewStyle, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, SPACING } from "../../lib/designTokens";

type IconButtonSize = "sm" | "md" | "lg";

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: IconButtonSize;
  color?: string;
  bgColor?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

const SIZE_MAP: Record<IconButtonSize, { dimension: number; iconSize: number }> = {
  sm: { dimension: 28, iconSize: 14 },
  md: { dimension: 36, iconSize: 18 },
  lg: { dimension: 44, iconSize: 22 },
};

export const IconButton = ({
  icon,
  onPress,
  size = "md",
  color = COLORS.primary,
  bgColor,
  disabled = false,
  loading = false,
  style,
}: IconButtonProps) => {
  const s = SIZE_MAP[size];

  return (
    <Pressable
      style={[
        styles.button,
        {
          width: s.dimension,
          height: s.dimension,
          borderRadius: s.dimension / 2,
          backgroundColor: bgColor || COLORS.background,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={s.iconSize} color={color} />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
});

export default IconButton;

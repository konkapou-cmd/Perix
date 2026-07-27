import React from "react";
import { View, Text, Image, StyleSheet, ViewStyle } from "react-native";
import { COLORS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SPACING } from "../../lib/designTokens";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

type AvatarProps = {
  uri?: string | null;
  name?: string;
  size?: AvatarSize;
  online?: boolean;
  borderColor?: string;
  style?: ViewStyle;
};

const SIZE_MAP: Record<AvatarSize, number> = {
  xs: 24,
  sm: 28,
  md: 36,
  lg: 44,
  xl: 100,
};

export const Avatar = ({
  uri,
  name = "",
  size = "md",
  online,
  borderColor,
  style,
}: AvatarProps) => {
  const s = SIZE_MAP[size];
  const fontSize = size === "xl" ? 36 : size === "lg" ? 18 : size === "md" ? 15 : 12;
  const borderRadius = s / 2;
  const showOnline = online && (size === "md" || size === "lg" || size === "xl");

  return (
    <View style={[{ width: s, height: s }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            {
              width: s,
              height: s,
              borderRadius,
              borderColor: borderColor || COLORS.background,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: s,
              height: s,
              borderRadius,
            },
          ]}
        >
          <Text style={[styles.fallbackText, { fontSize }]}>
            {(name || "?").charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      {showOnline && <View style={[styles.onlineDot, { right: size === "xl" ? 4 : 0 }]} />}
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    borderWidth: 2,
  },
  fallback: {
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackText: {
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.success,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
});

export default Avatar;

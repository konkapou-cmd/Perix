import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { COLORS, BORDER_RADIUS, SPACING, SHADOWS } from "../../lib/designTokens";

type Props = {
  children: React.ReactNode;
  padding?: number;
  radius?: number;
  shadow?: "none" | "card" | "cardLight" | "medium" | "strong";
  style?: ViewStyle;
};

export const AppCard = ({
  children,
  padding = SPACING.std,
  radius = BORDER_RADIUS.lg,
  shadow = "card",
  style,
}: Props) => {
  const shadowStyle =
    shadow === "none"
      ? undefined
      : shadow === "cardLight"
        ? SHADOWS.cardLight
        : shadow === "medium"
          ? SHADOWS.medium
          : shadow === "strong"
            ? SHADOWS.strong
            : SHADOWS.card;

  return (
    <View style={[s.card, { padding, borderRadius: radius }, shadowStyle, style]}>
      {children}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    overflow: "hidden",
  },
});

export default AppCard;

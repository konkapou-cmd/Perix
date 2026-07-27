import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { COLORS, BORDER_RADIUS, SPACING, SHADOWS } from "../../lib/designTokens";

type CardProps = {
  children: React.ReactNode;
  padding?: number;
  radius?: number;
  shadow?: boolean;
  style?: ViewStyle;
};

export const Card = ({
  children,
  padding = SPACING.std,
  radius = BORDER_RADIUS.card,
  shadow = true,
  style,
}: CardProps) => {
  return (
    <View
      style={[
        styles.card,
        { padding, borderRadius: radius },
        shadow && SHADOWS.subtle,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    overflow: "hidden",
  },
});

export default Card;

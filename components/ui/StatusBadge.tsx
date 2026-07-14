import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../lib/designTokens";

type StatusBadgeProps = {
  label: string;
  color?: string;
  textColor?: string;
  size?: "sm" | "md";
};

export default function StatusBadge({
  label,
  color = COLORS.primary,
  textColor = "#ffffff",
  size = "sm",
}: StatusBadgeProps) {
  return (
    <View style={[styles.container, { backgroundColor: color }, size === "md" && styles.containerMd]}>
      <Text style={[styles.text, { color: textColor }, size === "md" && styles.textMd]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  containerMd: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
  textMd: {
    fontSize: 14,
  },
});

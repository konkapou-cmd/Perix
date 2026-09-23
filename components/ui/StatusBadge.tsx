import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../lib/designTokens";

type SemanticVariant = "active" | "draft" | "fullTime" | "owner" | "private" | "soldOut" | "default";

type StatusBadgeProps = {
  label: string;
  variant?: SemanticVariant;
  color?: string;
  textColor?: string;
  size?: "sm" | "md";
};

const VARIANT_COLORS: Record<SemanticVariant, { bg: string; text: string }> = {
  active: { bg: "#10b981", text: "#ffffff" },
  draft: { bg: "#f59e0b", text: "#ffffff" },
  fullTime: { bg: "#3b82f6", text: "#ffffff" },
  owner: { bg: "#7c3aed", text: "#ffffff" },
  private: { bg: "#6b7280", text: "#ffffff" },
  soldOut: { bg: "#ef4444", text: "#ffffff" },
  default: { bg: COLORS.primary, text: "#ffffff" },
};

export default function StatusBadge({
  label,
  variant = "default",
  color,
  textColor,
  size = "sm",
}: StatusBadgeProps) {
  const vc = VARIANT_COLORS[variant];
  const bg = color ?? vc.bg;
  const fg = textColor ?? vc.text;

  return (
    <View style={[styles.container, { backgroundColor: bg }, size === "md" && styles.containerMd]}>
      <Text style={[styles.text, { color: fg }, size === "md" && styles.textMd]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  containerMd: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
  },
  textMd: {
    fontSize: 13,
  },
});

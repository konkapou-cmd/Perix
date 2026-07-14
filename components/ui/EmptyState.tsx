import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  message?: string;
  i18nKey?: string;
  muted?: boolean;
  size?: "compact" | "default" | "large";
};

const SIZE_CONFIG = {
  compact: { icon: 32, padding: 16, font: 13 },
  default: { icon: 48, padding: 40, font: 15 },
  large: { icon: 64, padding: 60, font: 17 },
};

export default function EmptyState({
  icon = "newspaper-outline",
  message,
  i18nKey,
  muted = false,
  size = "default",
}: EmptyStateProps) {
  const { t } = useTranslation();
  const text = message ?? (i18nKey ? t(i18nKey) : t("common.noItems", "Keine Einträge"));
  const cfg = SIZE_CONFIG[size];

  return (
    <View style={[styles.container, { paddingVertical: cfg.padding }]}>
      <Ionicons name={icon} size={cfg.icon} color={muted ? COLORS.borderLight ?? "#e5e7eb" : "#d1d5db"} />
      <Text style={[styles.text, { fontSize: cfg.font }, muted && styles.textMuted]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  text: {
    color: COLORS.textMuted,
    marginTop: 12,
    textAlign: "center",
  },
  textMuted: {
    color: COLORS.textDisabled ?? "#c8c2d4",
  },
});

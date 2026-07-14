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
};

export default function EmptyState({
  icon = "newspaper-outline",
  message,
  i18nKey,
  muted = false,
}: EmptyStateProps) {
  const { t } = useTranslation();
  const text = message ?? (i18nKey ? t(i18nKey) : t("common.noItems", "Keine Einträge"));

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={muted ? COLORS.borderLight ?? "#e5e7eb" : "#d1d5db"} />
      <Text style={[styles.text, muted && styles.textMuted]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 15,
    color: COLORS.textMuted,
    marginTop: 12,
    textAlign: "center",
  },
  textMuted: {
    color: COLORS.textDisabled ?? "#c8c2d4",
  },
});

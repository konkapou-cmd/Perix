import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, FONT_SIZES } from "../../lib/designTokens";

type LoadingStateProps = {
  message?: string;
  i18nKey?: string;
  fullWidth?: boolean;
  size?: "compact" | "default" | "large";
};

const SIZE_CONFIG = {
  compact: { spinner: "small" as const, font: 13, padding: 24 },
  default: { spinner: "large" as const, font: 15, padding: 40 },
  large: { spinner: "large" as const, font: 17, padding: 60 },
};

export const LoadingState = ({
  message,
  i18nKey,
  fullWidth = false,
  size = "default",
}: LoadingStateProps) => {
  const { t } = useTranslation();
  const text = message ?? (i18nKey ? t(i18nKey) : t("common.loading", "Wird geladen..."));
  const cfg = SIZE_CONFIG[size];

  return (
    <View style={[styles.container, fullWidth && styles.fullWidth, { paddingVertical: cfg.padding }]}>
      <ActivityIndicator size={cfg.spinner} color={COLORS.primary} />
      <Text style={[styles.text, { fontSize: cfg.font }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  fullWidth: {
    flex: 1,
  },
  text: {
    color: COLORS.textMuted,
    marginTop: 12,
  },
});

export default LoadingState;

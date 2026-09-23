import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SPACING } from "../../lib/designTokens";

type ErrorStateProps = {
  message?: string;
  i18nKey?: string;
  retryLabel?: string;
  onRetry?: () => void;
  fullWidth?: boolean;
};

export const ErrorState = ({
  message,
  i18nKey,
  retryLabel,
  onRetry,
  fullWidth = false,
}: ErrorStateProps) => {
  const { t } = useTranslation();
  const text = message ?? (i18nKey ? t(i18nKey) : t("common.errorState", "Etwas ist schiefgelaufen"));
  const retry = retryLabel ?? t("common.retry", "Erneut versuchen");

  return (
    <View style={[styles.container, fullWidth && styles.fullWidth]}>
      <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
      <Text style={styles.message}>{text}</Text>
      {onRetry && (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color={COLORS.textLight} />
          <Text style={styles.retryText}>{retry}</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  fullWidth: {
    flex: 1,
  },
  message: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.body,
    marginTop: 12,
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primary,
  },
  retryText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textLight,
  },
});

export default ErrorState;

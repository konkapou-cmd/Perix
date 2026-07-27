import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  message?: string;
  subMessage?: string;
  i18nKey?: string;
  i18nSubKey?: string;
  size?: "compact" | "default" | "large";
  muted?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  fullWidth?: boolean;
};

const SIZE_CONFIG = {
  compact: { icon: 32, padding: 16, font: 13 },
  default: { icon: 48, padding: 40, font: 15 },
  large: { icon: 64, padding: 60, font: 17 },
};

export const EmptyState = ({
  icon = "newspaper-outline",
  message,
  subMessage,
  i18nKey,
  i18nSubKey,
  size = "default",
  muted = false,
  actionLabel,
  onAction,
  fullWidth = false,
}: EmptyStateProps) => {
  const { t } = useTranslation();
  const text = message ?? (i18nKey ? t(i18nKey) : t("common.noItems", "Keine Einträge"));
  const sub = subMessage ?? (i18nSubKey ? t(i18nSubKey) : undefined);
  const cfg = SIZE_CONFIG[size];
  const iconColor = muted ? (COLORS.borderLight ?? "#e5e7eb") : "#d1d5db";

  return (
    <View style={[styles.container, fullWidth && styles.fullWidth, { paddingVertical: cfg.padding }]}>
      <Ionicons name={icon} size={cfg.icon} color={iconColor} />
      <Text style={[styles.text, { fontSize: cfg.font }, muted && styles.textMuted, fullWidth && styles.textFullWidth]}>
        {text}
      </Text>
      {sub && (
        <Text style={[styles.sub, muted && styles.textMuted]}>{sub}</Text>
      )}
      {actionLabel && onAction && (
        <Pressable style={styles.actionBtn} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
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
    textAlign: "center",
  },
  textFullWidth: {
    paddingHorizontal: 16,
  },
  textMuted: {
    color: COLORS.textDisabled ?? "#c8c2d4",
  },
  sub: {
    color: COLORS.textDisabled ?? "#c8c2d4",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  actionBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primary,
  },
  actionText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold,
    color: "#fff",
  },
});

export default EmptyState;

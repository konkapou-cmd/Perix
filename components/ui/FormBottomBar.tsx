import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

type FormBottomBarProps = {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  isSaving?: boolean;
  disabled?: boolean;
  accentColor?: string;
};

export default function FormBottomBar({
  onCancel,
  onSave,
  saveLabel,
  cancelLabel,
  isSaving = false,
  disabled = false,
  accentColor = COLORS.primary,
}: FormBottomBarProps) {
  const { t } = useTranslation();
  const saveText = saveLabel ?? t("common.save", "Speichern");
  const cancelText = cancelLabel ?? t("common.cancel", "Abbrechen");

  return (
    <View style={[styles.bar, { borderTopColor: "rgba(38,67,72,0.15)", backgroundColor: COLORS.background }]}>
      <Pressable
        style={[styles.btn, styles.cancelBtn, { borderColor: "rgba(38,67,72,0.25)" }]}
        onPress={onCancel}
      >
        <Text style={[styles.cancelText, { color: "#264348" }]}>{cancelText}</Text>
      </Pressable>

      <Pressable
        style={[
          styles.btn,
          styles.saveBtn,
          { backgroundColor: accentColor },
          (disabled || isSaving) && styles.saveDisabled,
        ]}
        onPress={disabled || isSaving ? undefined : onSave}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.saveText}>{saveText}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: SPACING.small,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btn: {
    flex: 1,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  cancelBtn: {
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  cancelText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  saveBtn: {
    minWidth: 80,
  },
  saveDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold,
    color: "#ffffff",
  },
});

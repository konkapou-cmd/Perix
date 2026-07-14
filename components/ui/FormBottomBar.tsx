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
};

export default function FormBottomBar({
  onCancel,
  onSave,
  saveLabel,
  cancelLabel,
  isSaving = false,
  disabled = false,
}: FormBottomBarProps) {
  const { t } = useTranslation();
  const saveText = saveLabel ?? t("common.save", "Speichern");
  const cancelText = cancelLabel ?? t("common.cancel", "Abbrechen");

  return (
    <View style={[styles.bar, { borderTopColor: COLORS.border, backgroundColor: COLORS.background }]}>
      <Pressable
        style={[styles.btn, styles.cancelBtn, { borderColor: COLORS.border }]}
        onPress={onCancel}
      >
        <Text style={[styles.cancelText, { color: COLORS.textPrimary }]}>{cancelText}</Text>
      </Pressable>

      <Pressable
        style={[
          styles.btn,
          styles.saveBtn,
          { backgroundColor: COLORS.primary },
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

import React, { useState, useMemo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type ProgressivePickerOption<T extends string = string> = {
  key: T;
  label: string;
  icon?: IconName;
  count?: number;
  disabled?: boolean;
};

type ProgressivePickerProps<T extends string = string> = {
  label: string;
  value: T;
  options: ProgressivePickerOption<T>[];
  onChange: (value: T) => void;
  primaryColor?: string;
  textColor?: string;
  mutedColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  modalTitle?: string;
  testID?: string;
  displayValue?: string;
  onPressOverride?: () => void;
};

export default function ProgressivePicker<T extends string = string>({
  label,
  value,
  options,
  onChange,
  primaryColor = COLORS.primaryDark,
  textColor = COLORS.textPrimary,
  mutedColor = COLORS.textMuted,
  backgroundColor = COLORS.background,
  borderColor = COLORS.border ?? "#e5e7eb",
  modalTitle,
  testID,
  displayValue,
  onPressOverride,
}: ProgressivePickerProps<T>) {
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);

  const selectedOption = useMemo(() => {
    const opt = options.find((o) => o.key === value);
    if (opt) return opt;
    if (options.length > 0) {
      const firstEnabled = options.find((o) => !o.disabled);
      return firstEnabled ?? options[0];
    }
    return undefined;
  }, [value, options]);

  const validValue = selectedOption?.key ?? ("" as T);

  const displayedLabel = displayValue ?? (selectedOption ? `${selectedOption.label}${selectedOption.count != null ? ` ${selectedOption.count}` : ""}` : "");

  const open = () => {
    if (onPressOverride) {
      onPressOverride();
      return;
    }
    if (options.length > 1 || (options.length === 1 && options[0].key !== value)) {
      setModalVisible(true);
    }
  };

  const close = () => setModalVisible(false);

  const handleSelect = (key: T) => {
    onChange(key);
    close();
  };

  const isWeb = Platform.OS === "web";

  return (
    <>
      <Pressable
        style={[styles.row, { backgroundColor, borderBottomColor: borderColor }]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${displayedLabel}`}
        testID={testID}
        android_ripple={{ color: mutedColor + "20" }}
      >
        <Text style={[styles.stepLabel, { color: mutedColor }]}>{label}</Text>
        <View style={styles.valueArea}>
          <Text style={[styles.valueText, { color: primaryColor }]} numberOfLines={1}>
            {displayedLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={mutedColor} />
        </View>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <View style={[styles.modalOverlay, isWeb && styles.modalOverlayWeb]}>
          <Pressable style={styles.modalBackdrop} onPress={close} />
          <View style={[styles.modalSheet, { backgroundColor }, isWeb && styles.modalSheetWeb]}>
            <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
              <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  {modalTitle ?? label}
                </Text>
                <Pressable onPress={close} style={styles.modalClose} hitSlop={12}>
                  <Ionicons name="close" size={22} color={mutedColor} />
                </Pressable>
              </View>
              <ScrollView style={styles.modalList} bounces={false}>
                {options.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.modalOption,
                      opt.disabled && styles.modalOptionDisabled,
                      opt.key === validValue && { backgroundColor: primaryColor + "10" },
                    ]}
                    onPress={() => {
                      if (!opt.disabled) handleSelect(opt.key);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: opt.key === validValue, disabled: opt.disabled }}
                  >
                    {opt.icon && (
                      <Ionicons
                        name={opt.icon}
                        size={20}
                        color={opt.key === validValue ? primaryColor : mutedColor}
                        style={styles.modalOptionIcon}
                      />
                    )}
                    <Text
                      style={[
                        styles.modalOptionText,
                        { color: opt.key === validValue ? primaryColor : textColor },
                        opt.disabled && { color: COLORS.textDisabled },
                      ]}
                      numberOfLines={1}
                    >
                      {opt.label}
                      {opt.count != null ? ` (${opt.count})` : ""}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {opt.key === validValue && (
                      <Ionicons name="checkmark" size={20} color={primaryColor} />
                    )}
                  </Pressable>
                ))}
                {options.length === 0 && (
                  <Text style={[styles.modalEmpty, { color: mutedColor }]}>{t("common.noOptions", "No options available")}</Text>
                )}
              </ScrollView>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: "500",
    minWidth: 80,
  },
  valueArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginLeft: 12,
  },
  valueText: {
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalOverlayWeb: {
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    maxHeight: "70%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
  },
  modalSheetWeb: {
    width: "90%",
    maxWidth: 480,
    maxHeight: "70%",
    borderRadius: 16,
    marginBottom: 0,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  modalClose: {
    padding: 4,
  },
  modalList: {
    flex: 1,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  modalOptionDisabled: {
    opacity: 0.4,
  },
  modalOptionIcon: {
    marginRight: 12,
  },
  modalOptionText: {
    fontSize: 15,
    fontWeight: "500",
  },
  modalEmpty: {
    textAlign: "center",
    paddingVertical: 32,
    fontSize: 14,
  },
});

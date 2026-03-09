import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

// Days of the week
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Opening hours data structure
export type DayHours = {
  enabled: boolean;
  periods: { open: string; close: string }[];
};

export const defaultDayHours = (): DayHours => ({
  enabled: true,
  periods: [{ open: "09:00", close: "18:00" }],
});

type Props = {
  visible: boolean;
  onClose: () => void;
  openingHours: Record<string, DayHours>;
  onHoursChange: (hours: Record<string, DayHours>) => void;
  onSave: () => void;
};

export default function OpeningHoursModal({
  visible,
  onClose,
  openingHours,
  onHoursChange,
  onSave,
}: Props) {
  const { t } = useTranslation();

  const toggleDay = (day: string) => {
    onHoursChange({
      ...openingHours,
      [day]: { ...openingHours[day], enabled: !openingHours[day].enabled },
    });
  };

  const addPeriod = (day: string) => {
    const current = openingHours[day];
    onHoursChange({
      ...openingHours,
      [day]: {
        ...current,
        periods: [...current.periods, { open: "09:00", close: "18:00" }],
      },
    });
  };

  const removePeriod = (day: string, index: number) => {
    const current = openingHours[day];
    if (current.periods.length <= 1) return;
    onHoursChange({
      ...openingHours,
      [day]: {
        ...current,
        periods: current.periods.filter((_, i) => i !== index),
      },
    });
  };

  const updatePeriod = (day: string, index: number, field: "open" | "close", value: string) => {
    const current = openingHours[day];
    const updatedPeriods = current.periods.map((period, i) =>
      i === index ? { ...period, [field]: value } : period
    );
    onHoursChange({
      ...openingHours,
      [day]: { ...current, periods: updatedPeriods },
    });
  };

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t("business.openingHours")}</Text>
          <Pressable onPress={onClose}>
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
        </View>
        <ScrollView style={styles.modalBody}>
          {DAYS.map((day) => (
            <View key={day} style={styles.dayRow}>
              <View style={styles.dayHeader}>
                <Pressable
                  style={styles.dayToggle}
                  onPress={() => toggleDay(day)}
                >
                  <Ionicons
                    name={openingHours[day]?.enabled ? "checkbox" : "square-outline"}
                    size={24}
                    color={openingHours[day]?.enabled ? "#4c6fff" : "#9ca3af"}
                  />
                  <Text style={styles.dayName}>{t(`business.days.${day.toLowerCase()}`)}</Text>
                </Pressable>
                {openingHours[day]?.enabled && (
                  <Pressable
                    style={styles.addPeriodButton}
                    onPress={() => addPeriod(day)}
                  >
                    <Ionicons name="add-circle-outline" size={20} color="#4c6fff" />
                  </Pressable>
                )}
              </View>
              {openingHours[day]?.enabled && (
                <View style={styles.periodsContainer}>
                  {openingHours[day].periods.map((period, index) => (
                    <View key={index} style={styles.periodRow}>
                      <TextInput
                        style={styles.timeInput}
                        value={period.open}
                        onChangeText={(value) => updatePeriod(day, index, "open", value)}
                        placeholder="09:00"
                      />
                      <Text style={styles.timeSeparator}>-</Text>
                      <TextInput
                        style={styles.timeInput}
                        value={period.close}
                        onChangeText={(value) => updatePeriod(day, index, "close", value)}
                        placeholder="18:00"
                      />
                      {openingHours[day].periods.length > 1 && (
                        <Pressable
                          style={styles.removePeriodButton}
                          onPress={() => removePeriod(day, index)}
                        >
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
        <View style={styles.modalFooter}>
          <Pressable style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={onSave}>
            <Text style={styles.primaryButtonText}>{t("common.save")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  dayRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dayName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  addPeriodButton: {
    padding: 4,
  },
  periodsContainer: {
    marginTop: 12,
    paddingLeft: 34,
  },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 80,
    textAlign: "center",
    fontSize: 14,
  },
  timeSeparator: {
    fontSize: 16,
    color: "#6b7280",
  },
  removePeriodButton: {
    padding: 4,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  secondaryButtonText: {
    color: "#374151",
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});

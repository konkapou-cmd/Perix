import React, { useState, useEffect } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CalendarList } from "react-native-calendars";
import { useTranslation } from "react-i18next";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";
import { formatDate } from "../../lib/formatDate";

export type DatePickerMode = "single" | "range";
export type DatePickerVariant = "fullscreen" | "sheet";

export interface DatePickerValue {
  startDate: string | null;
  endDate: string | null;
}

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  mode?: DatePickerMode;
  variant?: DatePickerVariant;
  value?: DatePickerValue;
  onApply: (value: DatePickerValue) => void;
  onReset?: () => void;
  title?: string;
  subtitle?: string;
  markedDates?: Record<string, any>;
  minDate?: string;
  maxDate?: string;
  pastScrollRange?: number;
  futureScrollRange?: number;
  horizontal?: boolean;
  accentColor?: string;
}

export default function DatePickerModal({
  visible,
  onClose,
  mode = "single",
  variant = "fullscreen",
  value,
  onApply,
  onReset,
  title,
  subtitle,
  markedDates: externalMarkedDates,
  minDate,
  maxDate,
  pastScrollRange = 3,
  futureScrollRange = 12,
  horizontal = false,
  accentColor = COLORS.primaryDark,
}: DatePickerModalProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<DatePickerValue>({ startDate: null, endDate: null });

  useEffect(() => {
    if (visible) {
      setPending({
        startDate: value?.startDate ?? null,
        endDate: value?.endDate ?? null,
      });
    }
  }, [visible, value?.startDate, value?.endDate]);

  const handleDayPress = (day: { dateString: string }) => {
    if (mode === "single") {
      setPending({ startDate: day.dateString, endDate: null });
    } else {
      if (!pending.startDate) {
        setPending({ startDate: day.dateString, endDate: null });
      } else if (!pending.endDate) {
        const start = pending.startDate;
        const end = day.dateString;
        setPending(end < start ? { startDate: end, endDate: start } : { startDate: start, endDate: end });
      } else {
        setPending({ startDate: day.dateString, endDate: null });
      }
    }
  };

  const buildMarkedDates = (): Record<string, any> => {
    const marks: Record<string, any> = { ...externalMarkedDates };
    if (pending.startDate) {
      marks[pending.startDate] = {
        selected: true,
        startingDay: true,
        color: accentColor,
        textColor: COLORS.background,
      };
    }
    if (pending.endDate) {
      marks[pending.endDate] = {
        selected: true,
        endingDay: true,
        color: accentColor,
        textColor: COLORS.background,
      };
    }
    return marks;
  };

  const calendarTheme = {
    backgroundColor: COLORS.background,
    calendarBackground: COLORS.background,
    todayTextColor: accentColor,
    dayTextColor: COLORS.textDark,
    textDisabledColor: COLORS.borderLight,
    monthTextColor: COLORS.textPrimary,
    textDayFontWeight: "500" as const,
    textMonthFontWeight: "700" as const,
    textDayFontSize: 14,
    arrowColor: accentColor,
    selectedDayBackgroundColor: accentColor,
    selectedDayTextColor: COLORS.background,
  };

  const handleApply = () => {
    onApply(pending);
    onClose();
  };

  const handleReset = () => {
    setPending({ startDate: null, endDate: null });
    onReset?.();
    onClose();
  };

  if (variant === "sheet") {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <View style={sheetStyles.overlay}>
          <View style={sheetStyles.container}>
            <View style={sheetStyles.header}>
              <Pressable onPress={onClose}>
                <Text style={[sheetStyles.doneText, { color: accentColor }]}>
                  {t("common.done", "Done")}
                </Text>
              </Pressable>
            </View>
            <CalendarList
              horizontal={horizontal}
              pagingEnabled={horizontal}
              showsVerticalScrollIndicator={!horizontal}
              firstDay={1}
              onDayPress={(day) => {
                handleDayPress(day);
                onApply({ startDate: day.dateString, endDate: null });
                onClose();
              }}
              markedDates={pending.startDate ? { [pending.startDate]: { selected: true, selectedColor: accentColor } } : {}}
              minDate={minDate}
              maxDate={maxDate}
              pastScrollRange={pastScrollRange}
              futureScrollRange={futureScrollRange}
              theme={calendarTheme}
            />
          </View>
        </View>
      </Modal>
    );
  }

  const displaySubtitle = (): string => {
    if (subtitle) return subtitle;
    if (mode === "single") {
      return pending.startDate ? formatDate(pending.startDate) : t("common.selectDate", "Select a date");
    }
    if (pending.startDate) {
      const start = formatDate(pending.startDate);
      const end = pending.endDate ? formatDate(pending.endDate) : "...";
      return `${start} → ${end}`;
    }
    return t("common.selectDateRange", "Select a date range");
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={fullStyles.container}>
        <View style={fullStyles.header}>
          <View style={fullStyles.headerContent}>
            <View style={[fullStyles.headerIcon, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Ionicons name="calendar" size={24} color={COLORS.background} />
            </View>
            <View>
              <Text style={fullStyles.title}>{title ?? t("common.selectDate", "Select Date")}</Text>
              <Text style={fullStyles.subtitle}>{displaySubtitle()}</Text>
            </View>
          </View>
          <Pressable style={fullStyles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={COLORS.background} />
          </Pressable>
        </View>

        <View style={fullStyles.body}>
          <CalendarList
            style={{ flex: 1 }}
            firstDay={1}
            onDayPress={handleDayPress}
            markedDates={buildMarkedDates()}
            markingType={mode === "range" ? "period" : "simple"}
            minDate={minDate}
            maxDate={maxDate}
            pastScrollRange={pastScrollRange}
            futureScrollRange={futureScrollRange}
            theme={calendarTheme}
          />
        </View>

        <View style={fullStyles.footer}>
          {onReset && (
            <Pressable style={fullStyles.actionBtn} onPress={handleReset}>
              <Text style={fullStyles.actionText}>{t("common.reset", "Reset")}</Text>
            </Pressable>
          )}
          <Pressable
            style={[fullStyles.actionBtn, fullStyles.applyBtn, { backgroundColor: accentColor }]}
            onPress={handleApply}
          >
            <Text style={[fullStyles.actionText, fullStyles.applyText]}>{t("common.apply", "Apply")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const fullStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.primaryDark, paddingHorizontal: 20, paddingVertical: 16,
  },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: Platform.OS === "web" ? 20 : 18, fontWeight: "700", color: COLORS.background },
  subtitle: { fontSize: Platform.OS === "web" ? 14 : 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  closeBtn: { padding: 4 },
  body: { flex: 1, backgroundColor: COLORS.background, marginTop: 8 },
  footer: {
    flexDirection: "row", padding: 16, gap: 12,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.borderGray,
  },
  actionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: BORDER_RADIUS.md,
    alignItems: "center", backgroundColor: COLORS.surfaceGray,
  },
  applyBtn: {},
  actionText: { fontSize: Platform.OS === "web" ? 16 : 15, fontWeight: "600", color: COLORS.textDark },
  applyText: { color: COLORS.background },
});

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  container: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: "70%",
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row", justifyContent: "flex-end",
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  doneText: { fontSize: 16, fontWeight: "600" },
});

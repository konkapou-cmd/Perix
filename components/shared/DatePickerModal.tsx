import React, { useState, useEffect } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CalendarList } from "react-native-calendars";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
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
  hideFooter?: boolean;
  children?: React.ReactNode;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
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
  hideFooter = false,
  children,
}: DatePickerModalProps) {
  const { height: screenHeight } = useWindowDimensions();
  const calendarHeight = variant === "sheet"
    ? Math.max(320, Math.min(440, screenHeight * 0.7 - 60))
    : Math.max(320, Math.min(480, screenHeight - 200));

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
    if (!pending.startDate) return marks;

    if (mode === "range") {
      const start = pending.startDate;
      const end = pending.endDate ?? pending.startDate;
      let cursor = start;
      let guard = 0;
      while (cursor <= end && guard < 400) {
        const isStart = cursor === start;
        const isEnd = cursor === end;
        marks[cursor] = {
          startingDay: isStart,
          endingDay: isEnd,
          color: accentColor,
          textColor: COLORS.background,
        };
        cursor = addDaysISO(cursor, 1);
        guard++;
      }
    } else {
      marks[pending.startDate] = {
        selected: true,
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
    dayTextColor: "#264348",
    textDayHeaderColor: "#264348",
    textDisabledColor: "rgba(38,67,72,0.25)",
    monthTextColor: "#264348",
    textDayFontWeight: "500" as const,
    textMonthFontWeight: "700" as const,
    textDayFontSize: 14,
    textDayFontFamily: "Quicksand_500Medium",
    textMonthFontFamily: "Quicksand_700Bold",
    textDayHeaderFontFamily: "Quicksand_600SemiBold",
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
              current={pending.startDate ?? todayISO()}
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
              style={[sheetStyles.calendar, { height: calendarHeight }]}
              calendarHeight={calendarHeight}
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

  const initialCalendarDate = pending.startDate?.split("T")[0] ?? todayISO();

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={fullStyles.container}>
        <LinearGradient
          colors={["#FF7A1A", "#FFC400"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.6 }}
          style={fullStyles.header}
        >
          <View style={fullStyles.headerContent}>
            <View style={fullStyles.headerIcon}>
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
        </LinearGradient>

        <View style={fullStyles.body}>
          <CalendarList
            style={[fullStyles.calendar, { height: calendarHeight }]}
            calendarHeight={calendarHeight}
            horizontal={horizontal}
            pagingEnabled={horizontal}
            showsVerticalScrollIndicator={!horizontal}
            firstDay={1}
            onDayPress={handleDayPress}
            markedDates={buildMarkedDates()}
            markingType={mode === "range" ? "period" : undefined}
            minDate={minDate}
            maxDate={maxDate}
            pastScrollRange={pastScrollRange}
            futureScrollRange={futureScrollRange}
            current={initialCalendarDate}
            theme={calendarTheme}
          />
        </View>

        {children}

        {!hideFooter && (
          <View style={fullStyles.footer}>
            {onReset && (
              <Pressable style={fullStyles.actionBtn} onPress={handleReset}>
                <Text style={fullStyles.actionText}>{t("common.reset", "Reset")}</Text>
              </Pressable>
            )}
            <Pressable
              style={[fullStyles.actionBtn, fullStyles.applyBtn]}
              onPress={handleApply}
            >
              <LinearGradient
                colors={["#FF7A1A", "#FFC400"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={fullStyles.applyGradient}
              >
                <Text style={[fullStyles.actionText, fullStyles.applyText]}>{t("common.apply", "Apply")}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const fullStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
  },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  title: { fontSize: Platform.OS === "web" ? 20 : 18, fontWeight: "700", color: COLORS.background },
  subtitle: { fontSize: Platform.OS === "web" ? 14 : 13, color: "rgba(255,255,255,0.9)", marginTop: 2 },
  closeBtn: { padding: 4 },
  body: { flex: 1, backgroundColor: COLORS.background, marginTop: 8 },
  calendar: {},
  footer: {
    flexDirection: "row", padding: 16, gap: 12,
    backgroundColor: COLORS.background,
    borderTopWidth: 1, borderTopColor: COLORS.borderGray,
  },
  actionBtn: {
    flex: 1, paddingVertical: 0, borderRadius: BORDER_RADIUS.md,
    alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surfaceGray,
    minHeight: 50,
    overflow: "hidden",
  },
  applyBtn: {},
  applyGradient: {
    flex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BORDER_RADIUS.md,
  },
  actionText: { fontSize: Platform.OS === "web" ? 16 : 15, fontWeight: "600", color: "#264348" },
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
  calendar: {},
  doneText: { fontSize: 16, fontWeight: "600" },
});

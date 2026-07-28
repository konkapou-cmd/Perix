import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform, ActivityIndicator, Alert, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CalendarList } from "react-native-calendars";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { TimeSlot } from "../../lib/api/core";
import { getSlots, deleteSlot, setAvailability } from "../../lib/api/services";
import DateTimePicker from "@react-native-community/datetimepicker";

type Props = {
  visible: boolean;
  serviceId: string;
  sessionToken: string;
  onClose: () => void;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SlotManagerModal({ visible, serviceId, sessionToken, onClose }: Props) {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayISO());

  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [weeklyStart, setWeeklyStart] = useState("09:00");
  const [weeklyEnd, setWeeklyEnd] = useState("17:00");

  const [quickStart, setQuickStart] = useState("");
  const [quickEnd, setQuickEnd] = useState("");

  const [blockStart, setBlockStart] = useState<string | null>(null);
  const [blockEnd, setBlockEnd] = useState<string | null>(null);
  const [blockMode, setBlockMode] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<string | null>(null);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSlots(serviceId);
      setSlots(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [serviceId]);

  useEffect(() => {
    if (visible) {
      loadSlots();
      setSelectedDate(todayISO());
      setBlockMode(false);
      setBlockStart(null);
      setBlockEnd(null);
      setQuickStart("");
      setQuickEnd("");
    }
  }, [visible, loadSlots]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    marks[selectedDate] = {
      selected: true,
      selectedColor: COLORS.primaryDark,
      selectedTextColor: "#fff",
      dots: marks[selectedDate]?.dots || [],
    };

    slots.forEach((slot) => {
      if (slot.is_blocked) {
        const date = slot.date;
        if (date) {
          if (!marks[date]) marks[date] = { dots: [] };
          marks[date].dots = marks[date].dots || [];
          marks[date].dots.push({ key: `b-${slot.slot_id}`, color: COLORS.danger });
        }
        return;
      }

      if (slot.is_recurring && slot.day_of_week != null) {
        const today = new Date();
        for (let i = 0; i < 90; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          if (d.getDay() === slot.day_of_week) {
            const ds = d.toISOString().split("T")[0];
            if (!marks[ds]) marks[ds] = { dots: [] };
            const dotColor = slot.is_booked ? COLORS.textMuted : COLORS.success;
            marks[ds].dots.push({ key: `r-${slot.slot_id}`, color: dotColor });
          }
        }
      } else if (slot.date) {
        if (!marks[slot.date]) marks[slot.date] = { dots: [] };
        const dotColor = slot.is_booked ? COLORS.textMuted : COLORS.success;
        marks[slot.date].dots.push({ key: `s-${slot.slot_id}`, color: dotColor });
      }
    });

    if (blockMode && blockStart && blockEnd) {
      const start = new Date(blockStart);
      const end = new Date(blockEnd);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split("T")[0];
        if (!marks[ds]) marks[ds] = { dots: [] };
        if (!marks[ds].dots.some((dot: any) => dot.color === COLORS.danger)) {
          marks[ds].dots.push({ key: "preview-block", color: COLORS.danger + "AA" });
        }
      }
    }

    Object.keys(marks).forEach((date) => {
      const dots = marks[date].dots;
      if (dots && dots.length > 1) {
        const seen = new Set<string>();
        marks[date].dots = dots.filter((d: any) => {
          const k = d.color + d.key.split("-")[0];
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        if (marks[date].dots.length > 3) {
          marks[date].dots = marks[date].dots.slice(0, 3);
        }
      }
    });

    return marks;
  }, [slots, selectedDate, blockMode, blockStart, blockEnd]);

  const dateSlots = useMemo(() => {
    const selDay = new Date(selectedDate + "T00:00:00").getDay();
    return slots.filter((s) => {
      if (s.is_blocked && s.date === selectedDate) return true;
      if (s.date === selectedDate) return true;
      if (s.is_recurring && s.day_of_week === selDay) return true;
      return false;
    });
  }, [slots, selectedDate]);

  const handleDayPress = (day: { dateString: string }) => {
    if (blockMode) {
      if (!blockStart) {
        setBlockStart(day.dateString);
      } else if (!blockEnd) {
        const end = day.dateString;
        if (end < blockStart) {
          setBlockStart(end);
          setBlockEnd(null);
        } else {
          setBlockEnd(end);
        }
      } else {
        setBlockStart(day.dateString);
        setBlockEnd(null);
      }
    } else {
      setSelectedDate(day.dateString);
      setQuickStart("");
      setQuickEnd("");
    }
  };

  const handleCreateQuickSlot = async () => {
    if (!quickStart || !quickEnd) {
      Alert.alert(t("common.error", "Error"), t("slotManager.selectTime", "Set start and end times"));
      return;
    }
    setLoading(true);
    try {
      const allSlots = (slots || []).map(s => ({
        day_of_week: s.day_of_week ?? undefined,
        date: s.date ?? undefined,
        start_time: s.start_time,
        end_time: s.end_time,
        is_recurring: s.is_recurring,
      }));
      allSlots.push({ date: selectedDate, start_time: quickStart, end_time: quickEnd, is_recurring: false, day_of_week: undefined as any });
      await setAvailability(sessionToken, serviceId, { timezone: "Europe/Berlin", slots: allSlots });
      await loadSlots();
      setQuickStart("");
      setQuickEnd("");
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message);
    }
    setLoading(false);
  };

  const handleCreateWeekly = async () => {
    if (selectedDays.length === 0) {
      Alert.alert(t("common.error", "Error"), t("slotManager.selectDays", "Select at least one day"));
      return;
    }
    if (!weeklyStart || !weeklyEnd) {
      Alert.alert(t("common.error", "Error"), t("slotManager.selectStartEnd", "Set start and end times"));
      return;
    }
    setLoading(true);
    try {
      const allSlots = (slots || []).map(s => ({
        day_of_week: s.day_of_week ?? undefined,
        date: s.date ?? undefined,
        start_time: s.start_time,
        end_time: s.end_time,
        is_recurring: s.is_recurring,
      }));
      for (const day of selectedDays) {
        allSlots.push({ day_of_week: day, start_time: weeklyStart, end_time: weeklyEnd, is_recurring: true, date: undefined as any });
      }
      await setAvailability(sessionToken, serviceId, { timezone: "Europe/Berlin", slots: allSlots });
      await loadSlots();
      setSelectedDays([]);
      Alert.alert(t("common.success", "Success"), t("slotManager.weeklySlotsCreated", "Weekly slots created"));
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message);
    }
    setLoading(false);
  };

  const handleDeleteSlot = async (slot: TimeSlot) => {
    setLoading(true);
    try {
      await deleteSlot(sessionToken, serviceId, slot.slot_id);
      await loadSlots();
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message);
    }
    setLoading(false);
  };

  const handleBlockRange = async () => {
    if (!blockStart || !blockEnd) {
      Alert.alert(t("common.error", "Error"), t("slotManager.selectDates", "Select date range"));
      return;
    }
    setLoading(true);
    try {
      const { blockSlots } = await import("../../lib/api/services");
      await blockSlots(sessionToken, serviceId, { from_date: blockStart, to_date: blockEnd });
      await loadSlots();
      setBlockMode(false);
      setBlockStart(null);
      setBlockEnd(null);
      Alert.alert(t("common.success", "Success"), t("slotManager.datesBlocked", "Dates blocked"));
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message);
    }
    setLoading(false);
  };

  const selDayName = DAYS[new Date(selectedDate + "T00:00:00").getDay()];

  const handleTimeChange = (_: any, selectedDate?: Date) => {
    if (!selectedDate || !timePickerTarget) return;
    const timeStr = selectedDate.toTimeString().slice(0, 5);
    switch (timePickerTarget) {
      case "quickStart": setQuickStart(timeStr); break;
      case "quickEnd": setQuickEnd(timeStr); break;
      case "weeklyStart": setWeeklyStart(timeStr); break;
      case "weeklyEnd": setWeeklyEnd(timeStr); break;
    }
    if (Platform.OS !== "ios") setTimePickerTarget(null);
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={s.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{t("services.manageSlots", "Manage Time Slots")}</Text>
          <Pressable
            onPress={() => { setBlockMode(!blockMode); setBlockStart(null); setBlockEnd(null); }}
            style={[s.headerBtn, blockMode && { backgroundColor: COLORS.danger + "20", borderRadius: BORDER_RADIUS.md }]}
          >
            <Ionicons name={blockMode ? "close-circle" : "lock-closed"} size={22} color={blockMode ? COLORS.danger : COLORS.textMuted} />
          </Pressable>
        </View>

        {blockMode && (
          <View style={s.blockBanner}>
            <Ionicons name="lock-closed" size={16} color="#fff" />
            <Text style={s.blockBannerText}>
              {blockStart && blockEnd
                ? `${t("slotManager.blocking", "Blocking")}: ${blockStart} - ${blockEnd}`
                : blockStart
                  ? t("slotManager.tapEndDate", "Tap the end date on calendar")
                  : t("slotManager.tapStartDate", "Tap a date to start block range")}
            </Text>
            {blockStart && blockEnd && (
              <Pressable style={s.blockApplyBtn} onPress={handleBlockRange} disabled={loading}>
                <Text style={s.blockApplyText}>{t("common.apply", "Apply")}</Text>
              </Pressable>
            )}
          </View>
        )}

        <CalendarList
          onDayPress={handleDayPress}
          markedDates={markedDates}
          markingType="multi-dot"
          pastScrollRange={1}
          futureScrollRange={6}
          firstDay={1}
          style={s.calendar}
          theme={{
            backgroundColor: COLORS.background,
            calendarBackground: COLORS.background,
            textSectionTitleColor: COLORS.textMuted,
            selectedDayBackgroundColor: COLORS.primaryDark,
            selectedDayTextColor: "#fff",
            todayTextColor: COLORS.primaryDark,
            dayTextColor: COLORS.textPrimary,
            textDisabledColor: COLORS.textDisabled,
            dotColor: COLORS.success,
            selectedDotColor: "#fff",
            arrowColor: COLORS.primaryDark,
            monthTextColor: COLORS.textPrimary,
            textDayFontWeight: FONT_WEIGHTS.medium as any,
            textMonthFontWeight: FONT_WEIGHTS.bold as any,
            textDayFontSize: FONT_SIZES.caption,
          }}
        />

        <View style={s.legendRow}>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: COLORS.success }]} />
            <Text style={s.legendText}>{t("slotManager.available", "Available")}</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: COLORS.textMuted }]} />
            <Text style={s.legendText}>{t("slotManager.booked", "Booked")}</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: COLORS.danger }]} />
            <Text style={s.legendText}>{t("slotManager.blocked", "Blocked")}</Text>
          </View>
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>{selectedDate} ({selDayName})</Text>

          {dateSlots.length === 0 && !loading && (
            <Text style={s.emptySlots}>{t("slotManager.noSlotsDate", "No slots for this date")}</Text>
          )}

          {dateSlots.map((slot) => (
            <View key={slot.slot_id} style={s.slotRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.slotInfo}>
                  {slot.is_recurring ? "Recurring" : "Specific"} {slot.start_time} - {slot.end_time}
                  {slot.is_blocked ? ` (${t("slotManager.blocked", "blocked")})` : ""}
                  {slot.is_booked ? ` (${t("slotManager.booked", "booked")})` : ""}
                </Text>
              </View>
              <Pressable onPress={() => handleDeleteSlot(slot)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
              </Pressable>
            </View>
          ))}

          <Text style={s.quickLabel}>{t("slotManager.addSlotDate", "Add slot for this date")}</Text>
          <View style={s.quickRow}>
            <Pressable style={s.timeChip} onPress={() => setTimePickerTarget("quickStart")}>
              <Text style={s.timeChipText}>{quickStart || "09:00"}</Text>
            </Pressable>
            <Text style={s.timeSep}>-</Text>
            <Pressable style={s.timeChip} onPress={() => setTimePickerTarget("quickEnd")}>
              <Text style={s.timeChipText}>{quickEnd || "10:00"}</Text>
            </Pressable>
            <Pressable style={s.quickAddBtn} onPress={handleCreateQuickSlot} disabled={loading}>
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
          {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: SPACING.small }} />}
        </View>

        <ScrollView style={s.bottomSection} contentContainerStyle={{ paddingBottom: SPACING.section }}>
          <Text style={s.sectionTitle}>{t("services.weeklyRecurring", "Weekly Recurring")}</Text>
          <View style={s.dayRow}>
            {DAYS.map((day, idx) => (
              <Pressable
                key={idx}
                style={[s.dayChip, selectedDays.includes(idx) && s.dayChipSelected]}
                onPress={() => setSelectedDays((prev) => prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx])}
              >
                <Text style={[s.dayText, selectedDays.includes(idx) && s.dayTextSelected]}>{day.slice(0, 3)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.timeRow}>
            <Pressable style={s.timeChip} onPress={() => setTimePickerTarget("weeklyStart")}>
              <Text style={s.timeChipText}>{weeklyStart}</Text>
            </Pressable>
            <Text style={s.timeSep}>-</Text>
            <Pressable style={s.timeChip} onPress={() => setTimePickerTarget("weeklyEnd")}>
              <Text style={s.timeChipText}>{weeklyEnd}</Text>
            </Pressable>
          </View>
          <Pressable style={s.createBtn} onPress={handleCreateWeekly} disabled={loading}>
            <Text style={s.createBtnText}>{t("slotManager.createSlots", "Create Weekly Slots")}</Text>
          </Pressable>
        </ScrollView>

        {timePickerTarget && (
          <View style={s.pickerOverlay}>
            <DateTimePicker
              value={toDate(
                timePickerTarget === "quickStart" ? quickStart :
                timePickerTarget === "quickEnd" ? quickEnd :
                timePickerTarget === "weeklyStart" ? weeklyStart : weeklyEnd
              )}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleTimeChange}
            />
            {Platform.OS === "ios" && (
              <Pressable style={s.pickerDoneBtn} onPress={() => setTimePickerTarget(null)}>
                <Text style={s.pickerDoneText}>{t("common.done", "Done")}</Text>
              </Pressable>
            )}
          </View>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function toDate(time: string): Date {
  const [h, m] = (time || "09:00").split(":").map(Number);
  const d = new Date();
  d.setHours(h || 9, m || 0, 0, 0);
  return d;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { padding: 6, width: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  blockBanner: { flexDirection: "row", alignItems: "center", gap: SPACING.small, paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, backgroundColor: COLORS.danger },
  blockBannerText: { flex: 1, fontSize: FONT_SIZES.small, color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  blockApplyBtn: { backgroundColor: "#fff", paddingHorizontal: SPACING.small, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full },
  blockApplyText: { fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.danger },
  calendar: { height: 320, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: SPACING.section, paddingVertical: SPACING.small, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: SPACING.tiny },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: FONT_SIZES.micro, color: COLORS.textMuted },
  panel: { paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  panelTitle: { fontSize: FONT_SIZES.caption, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary, marginBottom: SPACING.small },
  emptySlots: { fontSize: FONT_SIZES.small, color: COLORS.textMuted, fontStyle: "italic", marginBottom: SPACING.small },
  slotRow: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.small, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  slotInfo: { fontSize: FONT_SIZES.small, color: COLORS.textPrimary },
  quickLabel: { fontSize: FONT_SIZES.micro, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textMuted, marginTop: SPACING.small, marginBottom: SPACING.tiny },
  quickRow: { flexDirection: "row", alignItems: "center", gap: SPACING.small },
  quickAddBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  bottomSection: { flex: 1, paddingHorizontal: SPACING.std, paddingTop: SPACING.small },
  sectionTitle: { fontSize: FONT_SIZES.caption, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary, marginBottom: SPACING.small },
  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginBottom: SPACING.compact },
  dayChip: { paddingHorizontal: SPACING.small, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  dayChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayText: { fontSize: FONT_SIZES.micro, color: COLORS.textPrimary },
  dayTextSelected: { color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  timeRow: { flexDirection: "row", alignItems: "center", gap: SPACING.small, marginBottom: SPACING.compact },
  timeChip: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, backgroundColor: COLORS.primary + "10", flex: 1, alignItems: "center" },
  timeChipText: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.primary },
  timeSep: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted },
  createBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.small, alignItems: "center", marginTop: SPACING.tiny },
  createBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any, color: "#fff" },
  pickerOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: SPACING.section },
  pickerDoneBtn: { alignItems: "center", paddingVertical: SPACING.compact, marginHorizontal: SPACING.std, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.primary },
  pickerDoneText: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold as any, color: "#fff" },
});

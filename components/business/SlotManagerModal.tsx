import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform, ActivityIndicator, Alert, KeyboardAvoidingView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CalendarList } from "react-native-calendars";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { TimeSlot } from "../../lib/api/core";
import { getSlots, deleteSlot, setAvailability } from "../../lib/api/services";
import { toLocalISODate } from "../../lib/booking/dateRange";
import { formatDate } from "../../lib/formatDate";

type Props = {
  visible: boolean;
  serviceId: string;
  sessionToken: string;
  serviceType?: string;
  onClose: () => void;
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function todayISO(): string {
  return toLocalISODate(new Date());
}

function addDaysISO(dateISO: string, amount: number): string {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + amount);
  return toLocalISODate(d);
}

export default function SlotManagerModal(props: Props) {
  if (props.serviceType === "hotel_room") return null;
  return <SlotManagerModalContent {...props} />;
}

function SlotManagerModalContent({ visible, serviceId, sessionToken, serviceType, onClose }: Props) {
  const { t } = useTranslation();

  if (serviceType === "hotel_room") return null;

  const [mode, setMode] = useState<"availability" | "blocked">("availability");
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);

  // Availability state
  const [repeatWeekly, setRepeatWeekly] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number>(1); // day_of_week (1=Mon)
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");

  // Blocked state
  const [blockStart, setBlockStart] = useState<string | null>(null);
  const [blockEnd, setBlockEnd] = useState<string | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<"blockStart" | "blockEnd">("blockStart");
  const [showDatePicker, setShowDatePicker] = useState(false);

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
      setMode("availability");
      setSelectedDate(todayISO());
      setBlockStart(null);
      setBlockEnd(null);
    }
  }, [visible, loadSlots]);

  const recurringSlots = useMemo(
    () => slots.filter(s => s.is_recurring && !s.is_blocked),
    [slots],
  );
  const oneTimeSlots = useMemo(
    () => slots.filter(s => !s.is_recurring && !s.is_blocked),
    [slots],
  );
  const blockedSlots = useMemo(() => slots.filter(s => s.is_blocked), [slots]);

  const weekDays = useMemo(() => {
    const days: { key: string; date: string; dayOfWeek: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDaysISO(todayISO(), i);
      const d = new Date(date + "T00:00:00");
      days.push({ key: DAY_KEYS[d.getDay()], date, dayOfWeek: d.getDay() });
    }
    return days;
  }, []);

  const persistSlots = async (next: TimeSlot[]) => {
    if (loading) return;
    setLoading(true);
    try {
      const blocked = next.filter(s => s.is_blocked);
      const availability = next.filter(s => !s.is_blocked);

      const overlaps = (a: TimeSlot, b: TimeSlot) => {
        const aStart = parseTime(a.start_time) ?? 0;
        const aEnd = parseTime(a.end_time) ?? 0;
        const bStart = parseTime(b.start_time) ?? 0;
        const bEnd = parseTime(b.end_time) ?? 0;
        return aStart < bEnd && bStart < aEnd;
      };

      const isBlockedDate = (s: TimeSlot) =>
        !s.is_recurring && blocked.some(b => b.is_blocked && !b.is_recurring && b.date === s.date);

      const kept: TimeSlot[] = [];
      let skipped = 0;
      for (const av of availability) {
        if (isBlockedDate(av)) { skipped++; continue; }
        const sameTarget = kept.find(k =>
          av.is_recurring
            ? k.is_recurring && k.day_of_week === av.day_of_week
            : !k.is_recurring && k.date === av.date
        );
        if (sameTarget && overlaps(av, sameTarget)) { skipped++; continue; }
        kept.push(av);
      }

      const allSlots = [...blocked, ...kept].map(s => ({
        day_of_week: s.day_of_week ?? undefined,
        date: s.date ?? undefined,
        start_time: s.start_time,
        end_time: s.end_time,
        is_recurring: s.is_recurring,
        is_blocked: s.is_blocked,
      }));
      await setAvailability(sessionToken, serviceId, { timezone: "Europe/Berlin", slots: allSlots as any });
      await loadSlots();
      if (skipped > 0) {
        Alert.alert(t("common.info", "Info"), t("slotManager.skippedBlocked", "{{count}} slot(s) on blocked days were skipped", { count: skipped }));
      }
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message);
    }
    setLoading(false);
  };

  const parseTime = (v: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return (h >= 0 && h <= 23 && min >= 0 && min <= 59) ? h * 60 + min : null;
  };

  const handleAddRange = async () => {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    if (start === null || end === null || start >= end) return;
    if (!repeatWeekly && slots.some(s => s.is_blocked && !s.is_recurring && s.date === selectedDate)) {
      Alert.alert(t("common.info", "Info"), t("slotManager.dayBlocked", "This day is blocked — it was skipped."));
      return;
    }
    const next = [...slots];
    if (repeatWeekly) {
      next.push({ slot_id: "", day_of_week: selectedDay, start_time: startTime, end_time: endTime, is_recurring: true, date: undefined } as any);
    } else {
      next.push({ slot_id: "", date: selectedDate, start_time: startTime, end_time: endTime, is_recurring: false, day_of_week: undefined } as any);
    }
    await persistSlots(next);
  };

  const handleRemoveSlot = async (slot: TimeSlot) => {
    if (slot.slot_id) {
      if (loading) return;
      setLoading(true);
      try {
        await deleteSlot(sessionToken, serviceId, slot.slot_id);
        await loadSlots();
      } catch (err: any) {
        Alert.alert(t("common.error", "Error"), err.message);
      }
      setLoading(false);
      return;
    }
    const next = slots.filter(s => s !== slot);
    await persistSlots(next);
  };

  const handleBlockRange = async () => {
    if (loading || !blockStart || !blockEnd) return;
    setLoading(true);
    try {
      const { blockSlots } = await import("../../lib/api/services");
      await blockSlots(sessionToken, serviceId, { from_date: blockStart, to_date: blockEnd });
      await loadSlots();
      setBlockStart(null);
      setBlockEnd(null);
      Alert.alert(t("common.success", "Success"), t("slotManager.datesBlocked", "Dates blocked"));
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message);
    }
    setLoading(false);
  };

  const blockedDayCount = useMemo(() => {
    if (!blockStart || !blockEnd) return 0;
    const start = new Date(blockStart + "T00:00:00").getTime();
    const end = new Date(blockEnd + "T00:00:00").getTime();
    if (end < start) return 0;
    return Math.floor((end - start) / 86400000) + 1;
  }, [blockStart, blockEnd]);

  const dayRanges = (dayOfWeek: number) =>
    recurringSlots.filter(s => s.day_of_week === dayOfWeek).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  const dateRanges = (date: string) =>
    oneTimeSlots.filter(s => s.date === date).sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={s.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.header}>
            <Pressable onPress={onClose} hitSlop={12} style={s.headerBtn}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </Pressable>
            <Text style={s.headerTitle}>{t("services.manageSlots", "Manage Time Slots")}</Text>
            <View style={s.headerBtn} />
          </View>

          {/* Mode switcher */}
          <View style={s.segmentedRow}>
            <Pressable
              style={[s.segment, mode === "availability" && s.segmentActive]}
              onPress={() => setMode("availability")}
            >
              <Ionicons name="time-outline" size={16} color={mode === "availability" ? "#fff" : COLORS.textMuted} />
              <Text style={[s.segmentText, mode === "availability" && s.segmentTextActive]}>{t("services.availability", "Availability")}</Text>
            </Pressable>
            <Pressable
              style={[s.segment, mode === "blocked" && s.segmentBlocked]}
              onPress={() => setMode("blocked")}
            >
              <Ionicons name="ban" size={16} color={mode === "blocked" ? "#fff" : COLORS.textMuted} />
              <Text style={[s.segmentText, mode === "blocked" && s.segmentTextActive]}>{t("slotManager.blockedDays", "Blocked days")}</Text>
            </Pressable>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: SPACING.large }} keyboardShouldPersistTaps="handled">
            {mode === "availability" ? (
              <>
                {/* Weekly / one-time toggle */}
                <View style={s.chipRow}>
                  <Pressable style={[s.chip, repeatWeekly && s.chipActive]} onPress={() => setRepeatWeekly(true)}>
                    <Text style={[s.chipText, repeatWeekly && s.chipTextActive]}>{t("services.weekly", "Weekly")}</Text>
                  </Pressable>
                  <Pressable style={[s.chip, !repeatWeekly && s.chipActive]} onPress={() => setRepeatWeekly(false)}>
                    <Text style={[s.chipText, !repeatWeekly && s.chipTextActive]}>{t("services.specificDate", "Specific date")}</Text>
                  </Pressable>
                </View>

                {repeatWeekly ? (
                  <>
                    <Text style={s.sectionLabel}>{t("slotManager.weeklyRepeat", "Weekly repeat")}</Text>
                    <View style={s.dayRow}>
                      {DAY_KEYS.slice(1).concat(DAY_KEYS.slice(0, 1)).map((key, i) => {
                        const dow = (i + 1) % 7;
                        const ranges = dayRanges(dow);
                        return (
                          <Pressable
                            key={key}
                            style={[s.dayChip, selectedDay === dow && s.dayChipSelected, ranges.length > 0 && s.dayChipHasRanges]}
                            onPress={() => setSelectedDay(dow)}
                          >
                            <Text style={[s.dayText, selectedDay === dow && s.dayTextSelected]}>{t(`days.${key}`).slice(0, 3)}</Text>
                            {ranges.length > 0 && <View style={[s.dayDot, selectedDay === dow && { backgroundColor: "#fff" }]} />}
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={s.sectionLabel}>{t(`days.${DAY_KEYS[selectedDay]}`)}</Text>
                    {dayRanges(selectedDay).map((slot) => (
                      <View key={slot.slot_id || `${slot.start_time}-${slot.end_time}`} style={s.rangeChip}>
                        <Ionicons name="time-outline" size={14} color={COLORS.primary} />
                        <Text style={s.rangeText}>{slot.start_time} – {slot.end_time}</Text>
                        <Pressable onPress={() => handleRemoveSlot(slot)} hitSlop={8}>
                          <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    <Text style={s.sectionLabel}>{t("services.specificDate", "Specific date")}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.weekStrip}>
                      {weekDays.map((day) => (
                        <Pressable
                          key={day.date}
                          style={[s.weekDay, selectedDate === day.date && s.weekDaySelected]}
                          onPress={() => setSelectedDate(day.date)}
                        >
                          <Text style={[s.weekDayName, selectedDate === day.date && { color: "#fff" }]}>{t(`days.${day.key}`).slice(0, 3)}</Text>
                          <Text style={[s.weekDayNum, selectedDate === day.date && { color: "#fff" }]}>{formatDate(day.date).split(".")[0]}.{formatDate(day.date).split(".")[1]}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={s.sectionLabel}>{formatDate(selectedDate)}</Text>
                    {dateRanges(selectedDate).map((slot) => (
                      <View key={slot.slot_id || `${slot.start_time}-${slot.end_time}`} style={s.rangeChip}>
                        <Ionicons name="time-outline" size={14} color={COLORS.primary} />
                        <Text style={s.rangeText}>{slot.start_time} – {slot.end_time}</Text>
                        <Pressable onPress={() => handleRemoveSlot(slot)} hitSlop={8}>
                          <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}

                {/* Add range row */}
                <View style={s.addRow}>
                  <TextInput style={s.timeInput} value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor={COLORS.textDisabled} />
                  <Text style={s.timeSep}>–</Text>
                  <TextInput style={s.timeInput} value={endTime} onChangeText={setEndTime} placeholder="10:00" placeholderTextColor={COLORS.textDisabled} />
                  <Pressable style={s.addBtn} onPress={handleAddRange} disabled={loading}>
                    <Ionicons name="add" size={20} color="#fff" />
                  </Pressable>
                </View>
                {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: SPACING.small }} />}
              </>
            ) : (
              <>
                <Text style={s.sectionLabel}>{t("slotManager.blockedDays", "Blocked days")}</Text>
                {blockedSlots.length > 0 && (
                  <View style={s.blockedList}>
                    {blockedSlots.map((slot) => (
                      <View key={slot.slot_id} style={[s.rangeChip, { borderColor: COLORS.danger }]}>
                        <Ionicons name="ban" size={14} color={COLORS.danger} />
                        <Text style={s.rangeText}>{slot.date ? formatDate(slot.date) : ""}</Text>
                        <Pressable onPress={() => handleRemoveSlot(slot)} hitSlop={8}>
                          <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={s.sectionLabel}>{t("slotManager.selectDates", "Select date range")}</Text>
                <View style={s.blockDateRow}>
                  <Pressable style={[s.blockDateBtn, blockStart && s.blockDateBtnSet]} onPress={() => { setDatePickerTarget("blockStart"); setShowDatePicker(true); }}>
                    <Text style={s.blockDateLabel}>{t("slotManager.blockStart", "Start date")}</Text>
                    <Text style={[s.blockDateValue, blockStart && { color: COLORS.textPrimary }]}>{blockStart ? formatDate(blockStart) : "—"}</Text>
                  </Pressable>
                  <Pressable style={[s.blockDateBtn, blockEnd && s.blockDateBtnSet]} onPress={() => { setDatePickerTarget("blockEnd"); setShowDatePicker(true); }}>
                    <Text style={s.blockDateLabel}>{t("slotManager.blockEnd", "End date")}</Text>
                    <Text style={[s.blockDateValue, blockEnd && { color: COLORS.textPrimary }]}>{blockEnd ? formatDate(blockEnd) : "—"}</Text>
                  </Pressable>
                </View>

                {blockedDayCount > 0 && (
                  <Text style={s.blockPreview}>{t("slotManager.blockCount", "{{count}} days will be blocked", { count: blockedDayCount })}</Text>
                )}

                <Pressable
                  style={[s.blockBtn, (!blockStart || !blockEnd || loading) && { opacity: 0.5 }]}
                  onPress={handleBlockRange}
                  disabled={!blockStart || !blockEnd || loading}
                >
                  <Ionicons name="ban" size={18} color="#fff" />
                  <Text style={s.blockBtnText}>{t("slotManager.datesBlocked", "Block dates")}</Text>
                </Pressable>
                {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: SPACING.small }} />}
              </>
            )}
          </ScrollView>

          {/* Date picker modal for blocked range */}
          <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
            <View style={s.pickerOverlay}>
              <View style={s.pickerCard}>
                <View style={s.pickerHeader}>
                  <Text style={s.pickerTitle}>{datePickerTarget === "blockStart" ? t("slotManager.blockStart", "Start date") : t("slotManager.blockEnd", "End date")}</Text>
                  <Pressable onPress={() => setShowDatePicker(false)} hitSlop={8}>
                    <Ionicons name="close" size={22} color={COLORS.textPrimary} />
                  </Pressable>
                </View>
                <CalendarList
                  minDate={todayISO()}
                  pastScrollRange={0}
                  futureScrollRange={12}
                  onDayPress={(day: any) => {
                    if (datePickerTarget === "blockStart") setBlockStart(day.dateString);
                    else setBlockEnd(day.dateString);
                    setShowDatePicker(false);
                  }}
                  markedDates={{
                    ...(blockStart ? { [blockStart]: { selected: true, selectedColor: COLORS.danger } } : {}),
                    ...(blockEnd ? { [blockEnd]: { selected: true, selectedColor: COLORS.danger } } : {}),
                  }}
                  theme={{
                    todayTextColor: COLORS.primary,
                    selectedDayBackgroundColor: COLORS.danger,
                    arrowColor: COLORS.primary,
                  }}
                />
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
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
  headerBtn: { padding: 6, width: 40, alignItems: "center" },
  headerTitle: { fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  segmentedRow: { flexDirection: "row", gap: SPACING.small, paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundPage },
  segmentActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  segmentBlocked: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  segmentText: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textMuted },
  segmentTextActive: { color: "#fff" },
  body: { flex: 1, paddingHorizontal: SPACING.std, paddingTop: SPACING.small },
  chipRow: { flexDirection: "row", gap: SPACING.small, marginBottom: SPACING.small },
  chip: { paddingHorizontal: SPACING.std, paddingVertical: 8, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundPage },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.medium as any, color: COLORS.textSecondary },
  chipTextActive: { color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  sectionLabel: { fontSize: FONT_SIZES.caption, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary, marginTop: SPACING.small, marginBottom: SPACING.small },
  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginBottom: SPACING.small },
  dayChip: { minWidth: 46, alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundPage },
  dayChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayChipHasRanges: { borderColor: COLORS.success },
  dayText: { fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.medium as any, color: COLORS.textSecondary },
  dayTextSelected: { color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  dayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.success, marginTop: 4 },
  weekStrip: { gap: SPACING.small, paddingBottom: SPACING.small },
  weekDay: { alignItems: "center", minWidth: 54, paddingVertical: 10, paddingHorizontal: 10, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundPage },
  weekDaySelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  weekDayName: { fontSize: FONT_SIZES.micro, color: COLORS.textMuted, fontWeight: FONT_WEIGHTS.semibold as any },
  weekDayNum: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.bold as any, marginTop: 2 },
  rangeChip: { flexDirection: "row", alignItems: "center", gap: SPACING.small, paddingVertical: 10, paddingHorizontal: SPACING.small, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceSoft, marginBottom: SPACING.tiny },
  rangeText: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary, fontWeight: FONT_WEIGHTS.medium as any },
  addRow: { flexDirection: "row", alignItems: "center", gap: SPACING.small, marginTop: SPACING.small },
  timeInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 12, paddingVertical: 8, width: 88, textAlign: "center", fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundPage },
  timeSep: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  blockedList: { marginBottom: SPACING.small },
  blockDateRow: { flexDirection: "row", gap: SPACING.small, marginBottom: SPACING.small },
  blockDateBtn: { flex: 1, padding: SPACING.small, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundPage, alignItems: "center", gap: 4 },
  blockDateBtnSet: { borderColor: COLORS.danger },
  blockDateLabel: { fontSize: FONT_SIZES.micro, color: COLORS.textMuted },
  blockDateValue: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textDisabled },
  blockPreview: { fontSize: FONT_SIZES.bodySmall, color: COLORS.danger, fontWeight: FONT_WEIGHTS.semibold as any, marginBottom: SPACING.small },
  blockBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.danger, borderRadius: BORDER_RADIUS.md, paddingVertical: 14, marginTop: SPACING.small },
  blockBtnText: { color: "#fff", fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: SPACING.std },
  pickerCard: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg, padding: SPACING.std },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.small },
  pickerTitle: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
});

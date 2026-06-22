import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, Platform, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CalendarList } from "react-native-calendars";
import { useTranslation } from "react-i18next";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";
import { TimeSlot } from "../../lib/api/core";
import { getSlots, createSlot, deleteSlot } from "../../lib/api/services";
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
      await createSlot(sessionToken, {
        service_id: serviceId,
        start_time: quickStart,
        end_time: quickEnd,
        date: selectedDate,
        is_recurring: false,
      });
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
    setLoading(true);
    try {
      for (const day of selectedDays) {
        await createSlot(sessionToken, {
          service_id: serviceId,
          day_of_week: day,
          start_time: weeklyStart,
          end_time: weeklyEnd,
          is_recurring: true,
        });
      }
      await loadSlots();
      setSelectedDays([]);
      Alert.alert(t("common.success", "Success"), t("slotManager.slotsCreated", "Weekly slots created"));
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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("services.manageSlots", "Manage Time Slots")}</Text>
          <Pressable
            onPress={() => { setBlockMode(!blockMode); setBlockStart(null); setBlockEnd(null); }}
            style={[styles.headerBtn, blockMode && { backgroundColor: COLORS.danger + "20", borderRadius: 8 }]}
          >
            <Ionicons name={blockMode ? "close-circle" : "lock-closed"} size={22} color={blockMode ? COLORS.danger : COLORS.textMuted} />
          </Pressable>
        </View>

        {blockMode && (
          <View style={styles.blockBanner}>
            <Ionicons name="lock-closed" size={16} color="#fff" />
            <Text style={styles.blockBannerText}>
              {blockStart && blockEnd
                ? `${t("slotManager.blocking", "Blocking")}: ${blockStart} - ${blockEnd}`
                : blockStart
                  ? t("slotManager.tapEndDate", "Tap the end date on calendar")
                  : t("slotManager.tapStartDate", "Tap a date to start block range")}
            </Text>
            {blockStart && blockEnd && (
              <Pressable style={styles.blockApplyBtn} onPress={handleBlockRange} disabled={loading}>
                <Text style={styles.blockApplyText}>{t("common.apply", "Apply")}</Text>
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
          style={styles.calendar}
          theme={{
            backgroundColor: "#ffffff",
            calendarBackground: "#ffffff",
            textSectionTitleColor: "#6b7280",
            selectedDayBackgroundColor: COLORS.primaryDark,
            selectedDayTextColor: "#ffffff",
            todayTextColor: COLORS.primaryDark,
            dayTextColor: "#374151",
            textDisabledColor: "#d1d5db",
            dotColor: COLORS.success,
            selectedDotColor: "#ffffff",
            arrowColor: COLORS.primaryDark,
            monthTextColor: COLORS.textPrimary,
            textDayFontWeight: "500",
            textMonthFontWeight: "700",
            textDayFontSize: 14,
          }}
        />

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.legendText}>{t("slotManager.available", "Available")}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.textMuted }]} />
            <Text style={styles.legendText}>{t("slotManager.booked", "Booked")}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.danger }]} />
            <Text style={styles.legendText}>{t("slotManager.blocked", "Blocked")}</Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{selectedDate} ({selDayName})</Text>

          {dateSlots.length === 0 && !loading && (
            <Text style={styles.emptySlots}>{t("slotManager.noSlotsDate", "No slots for this date")}</Text>
          )}

          {dateSlots.map((slot) => (
            <View key={slot.slot_id} style={styles.slotRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.slotInfo}>
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

          <Text style={styles.quickLabel}>{t("slotManager.addSlotDate", "Add slot for this date")}</Text>
          <View style={styles.quickRow}>
            <Pressable style={styles.timeChip} onPress={() => setTimePickerTarget("quickStart")}>
              <Text style={styles.timeChipText}>{quickStart || "09:00"}</Text>
            </Pressable>
            <Text style={styles.timeSep}>-</Text>
            <Pressable style={styles.timeChip} onPress={() => setTimePickerTarget("quickEnd")}>
              <Text style={styles.timeChipText}>{quickEnd || "10:00"}</Text>
            </Pressable>
            <Pressable style={styles.quickAddBtn} onPress={handleCreateQuickSlot} disabled={loading}>
              <Ionicons name="add" size={20} color="#fff" />
            </Pressable>
          </View>
          {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 8 }} />}
        </View>

        <ScrollView style={styles.bottomSection} contentContainerStyle={{ paddingBottom: 20 }}>
          <Text style={styles.sectionTitle}>{t("services.weeklyRecurring", "Weekly Recurring")}</Text>
          <View style={styles.dayRow}>
            {DAYS.map((day, idx) => (
              <Pressable
                key={idx}
                style={[styles.dayChip, selectedDays.includes(idx) && styles.dayChipSelected]}
                onPress={() => setSelectedDays((prev) => prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx])}
              >
                <Text style={[styles.dayText, selectedDays.includes(idx) && styles.dayTextSelected]}>{day.slice(0, 3)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.timeRow}>
            <Pressable style={styles.timeChip} onPress={() => setTimePickerTarget("weeklyStart")}>
              <Text style={styles.timeChipText}>{weeklyStart}</Text>
            </Pressable>
            <Text style={styles.timeSep}>-</Text>
            <Pressable style={styles.timeChip} onPress={() => setTimePickerTarget("weeklyEnd")}>
              <Text style={styles.timeChipText}>{weeklyEnd}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.createBtn} onPress={handleCreateWeekly} disabled={loading}>
            <Text style={styles.createBtnText}>{t("slotManager.createSlots", "Create Weekly Slots")}</Text>
          </Pressable>
        </ScrollView>

        {timePickerTarget && (
          <View style={styles.pickerOverlay}>
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
              <Pressable style={styles.pickerDoneBtn} onPress={() => setTimePickerTarget(null)}>
                <Text style={styles.pickerDoneText}>{t("common.done", "Done")}</Text>
              </Pressable>
            )}
          </View>
        )}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerBtn: { padding: 6, width: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: COLORS.textPrimary },
  blockBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.danger },
  blockBannerText: { flex: 1, fontSize: 13, color: "#fff", fontWeight: "600" },
  blockApplyBtn: { backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  blockApplyText: { fontSize: 13, fontWeight: "700", color: COLORS.danger },
  calendar: { height: 320, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 20, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: COLORS.textMuted },
  panel: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  panelTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 6 },
  emptySlots: { fontSize: 13, color: COLORS.textMuted, fontStyle: "italic", marginBottom: 8 },
  slotRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  slotInfo: { fontSize: 13, color: COLORS.textPrimary },
  quickLabel: { fontSize: 12, fontWeight: "600", color: COLORS.textMuted, marginTop: 8, marginBottom: 4 },
  quickRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  quickAddBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  bottomSection: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 8 },
  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff" },
  dayChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dayText: { fontSize: 12, color: COLORS.textPrimary },
  dayTextSelected: { color: "#fff", fontWeight: "600" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  timeInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.textPrimary, flex: 1, textAlign: "center" },
  timeChip: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: COLORS.primary + "10", flex: 1, alignItems: "center" },
  timeChipText: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
  timeSep: { fontSize: 14, color: COLORS.textMuted },
  createBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  createBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  pickerOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: COLORS.border, paddingBottom: 20 },
  pickerDoneBtn: { alignItems: "center", paddingVertical: 12, marginHorizontal: 16, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.primary },
  pickerDoneText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

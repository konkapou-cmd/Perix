import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import DatePickerModal from "../shared/DatePickerModal";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { Service, DateBlock } from "../../lib/api/core";
import {
  updateService, getDateBlocks, createDateBlock, deleteDateBlock,
} from "../../lib/api/services";

type Props = {
  visible: boolean;
  service: Service | null;
  sessionToken: string;
  onClose: () => void;
  onSaved: () => void;
};

function addDaysStr(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}

export default function HotelAvailabilityModal({ visible, service, sessionToken, onClose, onSaved }: Props) {
  const { t } = useTranslation();

  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [inventoryCount, setInventoryCount] = useState("1");
  const [saving, setSaving] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<"available_from" | "available_until" | null>(null);

  const [dateBlocks, setDateBlocks] = useState<DateBlock[]>([]);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockedUnits, setBlockedUnits] = useState("1");
  const [blockReason, setBlockReason] = useState("");
  const [blockMode, setBlockMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !service) return;
    setAvailableFrom(service.available_from || "");
    setAvailableUntil(service.available_until || "");
    setInventoryCount(String(service.inventory_count || 1));
    setBlockStart("");
    setBlockEnd("");
    setBlockMode(false);
    setDatePickerTarget(null);
    loadBlocks();
  }, [visible, service]);

  const loadBlocks = async () => {
    if (!service || !sessionToken) return;
    setLoading(true);
    try { setDateBlocks(await getDateBlocks(sessionToken, service.service_id)); }
    catch { setDateBlocks([]); }
    setLoading(false);
  };

  const handleSaveWindow = async () => {
    if (!service || !sessionToken) return;
    const inventory = Number(inventoryCount);
    if (!Number.isInteger(inventory) || inventory < 1) {
      Alert.alert(t("common.error"), t("services.inventoryInvalid", "Room inventory must be at least 1."));
      return;
    }
    if (!availableFrom || !availableUntil || availableUntil <= availableFrom) {
      Alert.alert(t("common.error"), t("services.hotelWindowInvalid", "Select a valid bookable date window."));
      return;
    }
    setSaving(true);
    try {
      await updateService(sessionToken, service.service_id, {
        available_from: availableFrom,
        available_until: availableUntil,
        inventory_count: inventory,
        status: "published",
      } as any);
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("common.saveFailed"));
      setSaving(false);
    }
  };

  const handleCreateBlock = async () => {
    if (!service || !sessionToken || !blockStart || !blockEnd) return;
    if (blockEnd <= blockStart) { Alert.alert(t("common.error"), "End date must be after start"); return; }
    const units = Number(blockedUnits);
    const inventory = Number(inventoryCount);
    if (!Number.isInteger(units) || units < 1 || units > inventory) {
      Alert.alert(t("common.error"), t("services.blockedUnitsInvalid", "Blocked rooms must be between 1 and total inventory."));
      return;
    }
    setLoading(true);
    try {
      await createDateBlock(sessionToken, service.service_id, {
        start_date: blockStart, end_date: blockEnd,
        blocked_units: units, reason: blockReason.trim() || undefined,
      });
      setBlockStart(""); setBlockEnd(""); setBlockReason(""); setBlockMode(false);
      loadBlocks();
    } catch (e: any) { Alert.alert(t("common.error"), e.message); }
    setLoading(false);
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!service || !sessionToken) return;
    try { await deleteDateBlock(sessionToken, service.service_id, blockId); loadBlocks(); }
    catch (e: any) { Alert.alert(t("common.error"), e.message); }
  };

  const handleBlockDayPress = (day: { dateString: string }) => {
    if (!blockMode) return;
    if (!blockStart || blockEnd) { setBlockStart(day.dateString); setBlockEnd(""); return; }
    if (day.dateString <= blockStart) { setBlockStart(day.dateString); setBlockEnd(""); return; }
    setBlockEnd(day.dateString);
  };

  const marks: Record<string, any> = {};
  dateBlocks.forEach(b => {
    const sD = new Date(b.start_date + "T00:00:00");
    const eD = new Date(b.end_date + "T00:00:00");
    for (let d = new Date(sD); d < eD; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split("T")[0];
      marks[ds] = { startingDay: ds === b.start_date, endingDay: ds === addDaysStr(b.end_date, -1),
        color: COLORS.danger, textColor: "#fff" };
    }
  });
  if (blockMode && blockStart) {
    marks[blockStart] = { startingDay: true, color: COLORS.danger + "AA", textColor: "#fff" };
    if (blockEnd) {
      const sD = new Date(blockStart + "T00:00:00");
      const eD = new Date(blockEnd + "T00:00:00");
      for (let d = new Date(sD); d < eD; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split("T")[0];
        marks[ds] = { color: COLORS.danger + "AA", textColor: "#fff" };
      }
    }
  }

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></Pressable>
            <Text style={styles.headerTitle}>Bookable Window</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.std }}>
            <Text style={styles.sectionTitle}>Room Availability</Text>

            <Pressable style={styles.dateBtn} onPress={() => setDatePickerTarget("available_from")}>
              <Text style={styles.label}>Available from</Text>
              <Text style={styles.value}>{availableFrom?.split("-").reverse().join(" ") || "Tap to select"}</Text>
            </Pressable>

            <Pressable style={styles.dateBtn} onPress={() => setDatePickerTarget("available_until")}>
              <Text style={styles.label}>Available until</Text>
              <Text style={styles.value}>{availableUntil?.split("-").reverse().join(" ") || "Tap to select"}</Text>
            </Pressable>

            <View style={styles.row}>
              <Text style={styles.label}>Total rooms</Text>
              <TextInput style={styles.input} value={inventoryCount} onChangeText={setInventoryCount} keyboardType="number-pad" placeholder="1" />
            </View>

            <Pressable style={styles.saveBtn} onPress={handleSaveWindow} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Window</Text>}
            </Pressable>

            <Text style={[styles.sectionTitle, { marginTop: SPACING.section }]}>Blocked Dates</Text>

            <Calendar
              markingType="period"
              markedDates={marks}
              firstDay={1}
              onDayPress={handleBlockDayPress}
              style={styles.calendar}
              theme={{ backgroundColor: COLORS.background, calendarBackground: COLORS.background,
                selectedDayBackgroundColor: COLORS.danger, todayTextColor: COLORS.primary, arrowColor: COLORS.primary, monthTextColor: COLORS.textPrimary }}
            />

            <Pressable style={[styles.saveBtn, { backgroundColor: blockMode ? COLORS.success : COLORS.primary, marginTop: 8 }]} onPress={() => { setBlockMode(!blockMode); setBlockStart(""); setBlockEnd(""); }}>
              <Ionicons name={blockMode ? "close-circle" : "add-circle-outline"} size={18} color="#fff" />
              <Text style={styles.saveBtnText}> {blockMode ? "Cancel" : "Add Date Block"}</Text>
            </Pressable>

            {blockMode && (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={styles.label}>Start: {blockStart?.split("-").reverse().join(" ") || "tap calendar"}
                  {blockEnd ? ` → End: ${blockEnd.split("-").reverse().join(" ")}` : ""}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Blocked rooms</Text>
                    <TextInput style={styles.input} value={blockedUnits} onChangeText={setBlockedUnits} keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.label}>Reason</Text>
                    <TextInput style={styles.input} value={blockReason} onChangeText={setBlockReason} placeholder="Maintenance, etc." />
                  </View>
                </View>
                <Pressable style={[styles.saveBtn, { backgroundColor: COLORS.danger }]} onPress={handleCreateBlock} disabled={loading || !blockStart || !blockEnd}>
                  <Text style={styles.saveBtnText}>Block dates</Text>
                </Pressable>
              </View>
            )}

            {dateBlocks.map(block => (
              <View key={block.block_id} style={styles.blockRow}>
                <Ionicons name="lock-closed" size={14} color={COLORS.danger} />
                <Text style={styles.blockLabel}>{block.start_date.split("-").reverse().join(" ")} – {block.end_date.split("-").reverse().join(" ")} ({block.blocked_units}u{block.reason ? `, ${block.reason}` : ""})</Text>
                <Pressable onPress={() => handleDeleteBlock(block.block_id)}><Ionicons name="trash-outline" size={16} color={COLORS.danger} /></Pressable>
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <DatePickerModal
        visible={datePickerTarget !== null}
        onClose={() => setDatePickerTarget(null)}
        variant="sheet"
        value={{
          startDate: datePickerTarget === "available_from" ? availableFrom : availableUntil,
          endDate: null,
        }}
        onApply={(v) => {
          if (datePickerTarget === "available_from") setAvailableFrom(v.startDate ?? "");
          else setAvailableUntil(v.startDate ?? "");
          setDatePickerTarget(null);
        }}
        minDate={datePickerTarget === "available_until" && availableFrom ? addDaysStr(availableFrom, 1) : undefined}
        accentColor={COLORS.primary}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  sectionTitle: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary, marginBottom: SPACING.small },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted },
  value: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textPrimary },
  dateBtn: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 10, paddingVertical: 6, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary, minWidth: 60, textAlign: "right" },
  calendar: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, marginTop: 8 },
  saveBtn: { flexDirection: "row", backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: 12, gap: 6 },
  saveBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any, color: "#fff" },
  blockRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  blockLabel: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  pickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  pickerContainer: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.lg, borderTopRightRadius: BORDER_RADIUS.lg, padding: SPACING.std },
});

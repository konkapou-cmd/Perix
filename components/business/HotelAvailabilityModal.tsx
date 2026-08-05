import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
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

export default function HotelAvailabilityModal({ visible, service, sessionToken, onClose, onSaved }: Props) {
  const { t } = useTranslation();

  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");
  const [inventoryCount, setInventoryCount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [dateBlocks, setDateBlocks] = useState<DateBlock[]>([]);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockedUnits, setBlockedUnits] = useState("1");
  const [blockReason, setBlockReason] = useState("");
  const [blockMode, setBlockMode] = useState(false);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  useEffect(() => {
    if (!visible || !service) return;
    setAvailableFrom(service.available_from || "");
    setAvailableUntil(service.available_until || "");
    setInventoryCount(String(service.inventory_count || 1));
    setBlockStart("");
    setBlockEnd("");
    setBlockMode(false);
    loadBlocks();
  }, [visible, service]);

  const loadBlocks = async () => {
    if (!service || !sessionToken) return;
    setLoadingBlocks(true);
    try {
      const blocks = await getDateBlocks(sessionToken, service.service_id);
      setDateBlocks(blocks);
    } catch { setDateBlocks([]); }
    setLoadingBlocks(false);
  };

  const handleSaveWindow = async () => {
    if (!service || !sessionToken) return;
    setSaving(true);
    try {
      await updateService(sessionToken, service.service_id, {
        available_from: availableFrom || undefined,
        available_until: availableUntil || undefined,
        inventory_count: parseInt(inventoryCount, 10) || 1,
      } as any);
      onSaved();
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("common.saveFailed"));
    }
    setSaving(false);
  };

  const handleCreateBlock = async () => {
    if (!service || !sessionToken || !blockStart || !blockEnd) return;
    if (blockEnd <= blockStart) { Alert.alert(t("common.error"), "End date must be after start"); return; }
    setLoading(true);
    try {
      await createDateBlock(sessionToken, service.service_id, {
        start_date: blockStart,
        end_date: blockEnd,
        blocked_units: parseInt(blockedUnits, 10) || 1,
        reason: blockReason.trim() || undefined,
      });
      setBlockStart("");
      setBlockEnd("");
      setBlockReason("");
      setBlockMode(false);
      loadBlocks();
    } catch (e: any) { Alert.alert(t("common.error"), e.message); }
    setLoading(false);
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!service || !sessionToken) return;
    try {
      await deleteDateBlock(sessionToken, service.service_id, blockId);
      loadBlocks();
    } catch (e: any) { Alert.alert(t("common.error"), e.message); }
  };

  const marks: Record<string, any> = {};
  dateBlocks.forEach(b => {
    let d = b.start_date;
    while (d <= b.end_date) {
      marks[d] = { color: COLORS.danger, textColor: "#fff" };
      d = new Date(new Date(d + "T00:00:00").getTime() + 86400000).toISOString().split("T")[0];
    }
  });
  if (blockMode && blockStart && blockEnd) {
    let d = blockStart;
    while (d <= blockEnd) {
      marks[d] = { color: COLORS.danger + "AA", textColor: "#fff" };
      d = new Date(new Date(d + "T00:00:00").getTime() + 86400000).toISOString().split("T")[0];
    }
  }

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={s.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.header}>
            <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></Pressable>
            <Text style={s.headerTitle}>Bookable Window</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SPACING.std }}>
            {/* Bookable window */}
            <Text style={s.sectionTitle}>Room Availability</Text>
            <View style={s.row}>
              <Text style={s.label}>Available from</Text>
              <Text style={s.value}>{availableFrom?.split("-").reverse().join(" ") || "Not set"}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Available until</Text>
              <Text style={s.value}>{availableUntil?.split("-").reverse().join(" ") || "Not set"}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Total rooms</Text>
              <Text style={s.value}>{inventoryCount}</Text>
            </View>
            <Pressable style={s.saveBtn} onPress={handleSaveWindow} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save Window</Text>}
            </Pressable>

            {/* Date blocks */}
            <Text style={[s.sectionTitle, { marginTop: SPACING.section }]}>Blocked Dates</Text>

            <Calendar
              markingType="period"
              markedDates={marks}
              firstDay={1}
              style={s.calendar}
              theme={{
                backgroundColor: COLORS.background,
                calendarBackground: COLORS.background,
                selectedDayBackgroundColor: COLORS.danger,
                todayTextColor: COLORS.primary,
                arrowColor: COLORS.primary,
                monthTextColor: COLORS.textPrimary,
              }}
            />

            <Pressable style={[s.saveBtn, { backgroundColor: blockMode ? COLORS.success : COLORS.primary, marginTop: 8 }]} onPress={() => { setBlockMode(!blockMode); setBlockStart(""); setBlockEnd(""); }}>
              <Ionicons name={blockMode ? "close-circle" : "add-circle-outline"} size={18} color="#fff" />
              <Text style={s.saveBtnText}> {blockMode ? "Cancel Block" : "Add Date Block"}</Text>
            </Pressable>

            {blockMode && (
              <View style={{ marginTop: 12 }}>
                <Text style={s.label}>Start date: {blockStart?.split("-").reverse().join(" ") || "tap calendar"}</Text>
                <Text style={s.label}>End date: {blockEnd?.split("-").reverse().join(" ") || "tap calendar"}</Text>
                <Pressable style={[s.saveBtn, { backgroundColor: COLORS.danger, marginTop: 8 }]} onPress={handleCreateBlock} disabled={loading || !blockStart || !blockEnd}>
                  <Text style={s.saveBtnText}>Block dates</Text>
                </Pressable>
              </View>
            )}

            {/* Existing blocks */}
            {dateBlocks.map(block => (
              <View key={block.block_id} style={s.blockRow}>
                <Ionicons name="lock-closed" size={14} color={COLORS.danger} />
                <Text style={s.blockLabel}>{block.start_date.split("-").reverse().join(" ")} – {block.end_date.split("-").reverse().join(" ")} ({block.blocked_units} units)</Text>
                <Pressable onPress={() => handleDeleteBlock(block.block_id)}><Ionicons name="trash-outline" size={16} color={COLORS.danger} /></Pressable>
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  sectionTitle: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary, marginBottom: SPACING.small },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  label: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted },
  value: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textPrimary },
  calendar: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, marginTop: 8 },
  saveBtn: { flexDirection: "row", backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: 12, gap: 6 },
  saveBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any, color: "#fff" },
  blockRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  blockLabel: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
});

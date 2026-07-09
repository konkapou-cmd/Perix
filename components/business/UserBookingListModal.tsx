import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { Booking } from "../../lib/api/core";
import { getBookings, cancelBooking } from "../../lib/api/services";
import { formatPrice } from "../../lib/serviceFormat";

type Props = {
  visible: boolean;
  sessionToken: string;
  onClose: () => void;
};

const TABS = ["pending", "confirmed", "completed", "cancelled"] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.warning,
  confirmed: COLORS.success,
  cancelled: COLORS.danger,
  completed: COLORS.info,
};

export default function UserBookingListModal({ visible, sessionToken, onClose }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBookings = useCallback(async () => {
    try {
      const data = await getBookings(sessionToken, undefined, activeTab);
      setBookings(data);
    } catch { /* ignore */ }
  }, [sessionToken, activeTab]);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      loadBookings().finally(() => setLoading(false));
    }
  }, [visible, loadBookings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  }, [loadBookings]);

  const handleCancel = async (bookingId: string) => {
    Alert.alert(
      t("bookingList.cancelTitle", "Cancel booking?"),
      t("bookingList.cancelConfirm", "Are you sure?"),
      [
        { text: t("common.no", "No"), style: "cancel" },
        {
          text: t("common.yes", "Yes"),
          style: "destructive",
          onPress: async () => {
            try {
              await cancelBooking(sessionToken, bookingId);
              loadBookings();
            } catch (err: any) {
              Alert.alert(t("common.error", "Error"), err.message);
            }
          },
        },
      ]
    );
  };

  const renderBooking = (booking: Booking) => {
    const statusColor = STATUS_COLORS[booking.status] || COLORS.textMuted;
    return (
      <View key={booking.booking_id} style={s.bookingCard}>
        <View style={s.bookingHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.serviceName}>{booking.service_name || booking.service_id}</Text>
            {booking.business_name && (
              <Text style={s.businessName}>{booking.business_name}</Text>
            )}
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[s.statusText, { color: statusColor }]}>
              {t(`services.${booking.status}`, booking.status.charAt(0).toUpperCase() + booking.status.slice(1))}
            </Text>
          </View>
        </View>
        <Text style={s.bookingDetail}>{booking.date}{booking.start_time ? ` | ${booking.start_time}${booking.end_time ? ` - ${booking.end_time}` : ""}` : ""}</Text>
        {booking.guests && <Text style={s.bookingDetail}>{t("services.guests", "Guests")}: {booking.guests}</Text>}
        {booking.total_price && <Text style={s.bookingPrice}>{formatPrice(booking.total_price)}</Text>}
        {booking.notes && <Text style={s.bookingNotes}>{"\u201C"}{booking.notes}{"\u201D"}</Text>}
        {booking.pet_name && <Text style={s.bookingDetail}>{t("services.petName", "Pet name")}: {booking.pet_name} ({booking.pet_type || "?"})</Text>}
        {booking.reason_for_visit && <Text style={s.bookingDetail}>{t("services.reasonForVisit", "Reason")}: {booking.reason_for_visit}</Text>}
        {booking.pickup_location && <Text style={s.bookingDetail}>{t("services.pickupLocation", "Pickup")}: {booking.pickup_location}</Text>}

        {(booking.status === "pending" || booking.status === "confirmed") && (
          <View style={s.actionRow}>
            <Pressable style={[s.actionBtn, { backgroundColor: COLORS.danger }]} onPress={() => handleCancel(booking.booking_id)}>
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={s.actionText}>{t("services.cancelBooking", "Cancel")}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={s.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{t("services.myBookings", "My Bookings")}</Text>
          <View style={s.headerBtn} />
        </View>

        <View style={s.tabRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[s.tab, activeTab === tab && s.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                {t(`services.${tab}`, tab.charAt(0).toUpperCase() + tab.slice(1))}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: SPACING.large }} />
        ) : bookings.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.textMuted} />
            <Text style={s.emptyText}>{t("services.noBookings", "No bookings yet")}</Text>
          </View>
        ) : (
          <ScrollView
            style={s.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: SPACING.large }}
          >
            {bookings.map(renderBooking)}
          </ScrollView>
        )}
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
  headerBtn: { padding: 4, width: 40, alignItems: "center" },
  headerTitle: { fontSize: FONT_SIZES.h3, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: SPACING.compact, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: FONT_SIZES.small, color: COLORS.textMuted, fontWeight: FONT_WEIGHTS.medium as any },
  tabTextActive: { color: COLORS.primary, fontWeight: FONT_WEIGHTS.bold as any },
  body: { flex: 1, paddingHorizontal: SPACING.std, paddingVertical: SPACING.std },
  emptyState: { alignItems: "center", paddingVertical: SPACING.large, gap: SPACING.compact },
  emptyText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted },
  bookingCard: { backgroundColor: COLORS.surfaceSoft, borderRadius: BORDER_RADIUS.lg, padding: SPACING.std, marginBottom: SPACING.compact },
  bookingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: SPACING.small },
  serviceName: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  businessName: { fontSize: FONT_SIZES.small, color: COLORS.primary, marginTop: SPACING.tiny },
  statusBadge: { paddingHorizontal: SPACING.small, paddingVertical: 3, borderRadius: BORDER_RADIUS.full, marginLeft: SPACING.small },
  statusText: { fontSize: FONT_SIZES.micro, fontWeight: FONT_WEIGHTS.semibold as any },
  bookingDetail: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, marginTop: SPACING.tiny },
  bookingPrice: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.success, marginTop: SPACING.tiny },
  bookingNotes: { fontSize: FONT_SIZES.small, color: COLORS.textSecondary, fontStyle: "italic", marginTop: SPACING.tiny },
  actionRow: { flexDirection: "row", gap: SPACING.small, marginTop: SPACING.compact },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.tiny, paddingHorizontal: SPACING.small, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full },
  actionText: { fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold as any, color: "#fff" },
});

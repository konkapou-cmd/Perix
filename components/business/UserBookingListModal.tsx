import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { Booking } from "../../lib/api/core";
import { getBookings, cancelBooking } from "../../lib/api/services";
import { formatPrice } from "../../lib/serviceFormat";
import { formatDate } from "../../lib/formatDate";

type Props = {
  visible: boolean;
  sessionToken: string;
  onClose: () => void;
};

const TABS = ["pending", "confirmed", "completed", "declined", "cancelled", "expired"] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  pending: COLORS.warning,
  confirmed: COLORS.success,
  declined: COLORS.danger,
  cancelled: COLORS.danger,
  expired: COLORS.textMuted,
  completed: COLORS.info,
};

export default function UserBookingListModal({ visible, sessionToken, onClose }: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach((b) => { counts[b.status] = (counts[b.status] || 0) + 1; });
    return counts;
  }, [bookings]);

  const loadBookings = useCallback(async () => {
    try {
      const data = await getBookings(sessionToken, undefined, undefined);
      setBookings(data || []);
    } catch { /* ignore */ }
  }, [sessionToken]);

  const visibleBookings = useMemo(
    () => bookings.filter((b) => b.status === activeTab),
    [bookings, activeTab],
  );

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
            <Text style={s.serviceName} numberOfLines={1} ellipsizeMode="tail">{booking.service_name || booking.service_id}</Text>
            {booking.business_name && (
              <Text style={s.businessName} numberOfLines={1} ellipsizeMode="tail">{booking.business_name}</Text>
            )}
          </View>
          <View style={[s.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[s.statusText, { color: statusColor }]} numberOfLines={1} ellipsizeMode="tail">
              {t(`services.${booking.status}`, booking.status.charAt(0).toUpperCase() + booking.status.slice(1))}
            </Text>
          </View>
        </View>
        <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{booking.date}{booking.start_time ? ` | ${booking.start_time}${booking.end_time ? ` - ${booking.end_time}` : ""}` : ""}</Text>
        {booking.booking_mode === "date_range" && booking.end_date && (
          <>
            <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{formatDate(booking.date)} → {formatDate(booking.end_date)}</Text>
            <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{booking.nights} {t("bookingList.nights", "nights")} · {booking.room_count || 1} {t("bookingList.rooms", "room(s)")}</Text>
            <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{booking.adults || 1} {t("bookingList.adults", "adults")} · {booking.children || 0} {t("bookingList.children", "children")}</Text>
            {booking.confirmation_code && <Text style={s.bookingCode} numberOfLines={1}>{booking.confirmation_code}</Text>}
            {booking.service_name && <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{booking.service_name}</Text>}
            {booking.service_address && <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail"><Ionicons name="location" size={12} /> {booking.service_address}</Text>}
            {booking.business_name && <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail"><Ionicons name="business" size={12} /> {booking.business_name}</Text>}
            {booking.check_in_time && booking.check_out_time && (
              <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">Check-in: {booking.check_in_time} · Check-out: {booking.check_out_time}</Text>
            )}
            {booking.cancellation_policy && <Text style={s.bookingNotes}>{booking.cancellation_policy}</Text>}
          </>
        )}
        {booking.guests && !booking.booking_mode && <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{t("services.guests", "Guests")}: {booking.guests}</Text>}
        {booking.total_amount != null && booking.currency ? (
          <View>
            {booking.nightly_rate_amount != null && (
              <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{(booking.nightly_rate_amount / 100).toFixed(2)} {booking.currency} / night</Text>
            )}
            <Text style={s.bookingPrice}>{(booking.total_amount / 100).toFixed(2)} {booking.currency}</Text>
          </View>
        ) : booking.total_price ? (
          <Text style={s.bookingPrice}>{formatPrice(booking.total_price)}</Text>
        ) : null}
        {booking.notes && <Text style={s.bookingNotes}>{"\u201C"}{booking.notes}{"\u201D"}</Text>}
        {booking.pet_name && <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{t("services.petName", "Pet name")}: {booking.pet_name} ({booking.pet_type || "?"})</Text>}
        {booking.reason_for_visit && <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{t("services.reasonForVisit", "Reason")}: {booking.reason_for_visit}</Text>}
        {booking.pickup_location && <Text style={s.bookingDetail} numberOfLines={1} ellipsizeMode="tail">{t("services.pickupLocation", "Pickup")}: {booking.pickup_location}</Text>}

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
            <Ionicons name="close" size={24} color="#264348" />
          </Pressable>
          <Text style={s.headerTitle}>{t("services.myBookings", "My Bookings")}</Text>
          <View style={s.headerBtn} />
        </View>

        <View style={s.filterList}>
          {TABS.map((tab) => {
            const count = statusCounts[tab] || 0;
            const active = activeTab === tab;
            return (
              <Pressable
                key={tab}
                style={[s.filterBtn, active && s.filterBtnActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[s.filterBtnText, active && s.filterBtnTextActive]} numberOfLines={1} ellipsizeMode="tail">
                  {t(`services.${tab}`, tab.charAt(0).toUpperCase() + tab.slice(1))}
                </Text>
                <View style={[s.filterCount, active && s.filterCountActive]}>
                  <Text style={[s.filterCountText, active && s.filterCountTextActive]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color="#59ABE3" style={{ marginTop: SPACING.large }} />
        ) : visibleBookings.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#264348" />
            <Text style={s.emptyText}>{t("services.noBookings", "No bookings yet")}</Text>
          </View>
        ) : (
          <ScrollView
            style={s.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: SPACING.large }}
          >
            {visibleBookings.map(renderBooking)}
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
    borderBottomColor: "rgba(38,67,72,0.15)",
  },
  headerBtn: { padding: 4, width: 40, alignItems: "center" },
  headerTitle: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textPrimary },
  filterList: { paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, gap: SPACING.small, borderBottomWidth: 1, borderBottomColor: "rgba(38,67,72,0.15)" },
  filterBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(38,67,72,0.15)", borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.std, paddingVertical: 12 },
  filterBtnActive: { backgroundColor: "#59ABE3", borderColor: "#59ABE3" },
  filterBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.semibold as any, color: "#264348" },
  filterBtnTextActive: { color: "#fff" },
  filterCount: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(38,67,72,0.08)", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  filterCountText: { fontSize: FONT_SIZES.micro, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textMuted },
  filterCountTextActive: { color: "#fff" },
  body: { flex: 1, paddingHorizontal: SPACING.std, paddingVertical: SPACING.std },
  emptyState: { alignItems: "center", paddingVertical: SPACING.large, gap: SPACING.compact },
  emptyText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted },
  bookingCard: { backgroundColor: "#fff", borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: "rgba(38,67,72,0.15)", padding: SPACING.std, marginBottom: SPACING.compact },
  bookingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: SPACING.small },
  serviceName: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textPrimary },
  businessName: { fontSize: FONT_SIZES.small, color: "#59ABE3", marginTop: SPACING.tiny },
  statusBadge: { paddingHorizontal: SPACING.small, paddingVertical: 3, borderRadius: BORDER_RADIUS.full, marginLeft: SPACING.small, flexShrink: 1, maxWidth: "45%" },
  statusText: { fontSize: FONT_SIZES.micro, fontWeight: FONT_WEIGHTS.semibold as any, textAlign: "center" },
  bookingDetail: { fontSize: FONT_SIZES.small, color: "rgba(38,67,72,0.75)", marginTop: SPACING.tiny },
  bookingCode: { fontSize: FONT_SIZES.caption, fontWeight: FONT_WEIGHTS.bold as any, color: "#59ABE3", marginTop: SPACING.tiny },
  bookingPrice: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.success, marginTop: SPACING.tiny },
  bookingNotes: { fontSize: FONT_SIZES.small, color: "rgba(38,67,72,0.75)", fontStyle: "italic", marginTop: SPACING.tiny },
  actionRow: { flexDirection: "row", gap: SPACING.small, marginTop: SPACING.compact },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.tiny, paddingHorizontal: SPACING.small, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full },
  actionText: { fontSize: FONT_SIZES.small, fontWeight: FONT_WEIGHTS.semibold as any, color: "#fff" },
});

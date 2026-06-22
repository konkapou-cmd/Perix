import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";
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
      <View key={booking.booking_id} style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.serviceName}>{booking.service_name || booking.service_id}</Text>
            {booking.business_name && (
              <Text style={styles.businessName}>{booking.business_name}</Text>
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {t(`services.${booking.status}`, booking.status.charAt(0).toUpperCase() + booking.status.slice(1))}
            </Text>
          </View>
        </View>
        <Text style={styles.bookingDetail}>{booking.date}{booking.start_time ? ` | ${booking.start_time}${booking.end_time ? ` - ${booking.end_time}` : ""}` : ""}</Text>
        {booking.guests && <Text style={styles.bookingDetail}>{t("services.guests", "Guests")}: {booking.guests}</Text>}
        {booking.total_price && <Text style={styles.bookingPrice}>{formatPrice(booking.total_price)}</Text>}
        {booking.notes && <Text style={styles.bookingNotes}>"{booking.notes}"</Text>}
        {booking.pet_name && <Text style={styles.bookingDetail}>{t("services.petName", "Pet name")}: {booking.pet_name} ({booking.pet_type || "?"})</Text>}
        {booking.reason_for_visit && <Text style={styles.bookingDetail}>{t("services.reasonForVisit", "Reason")}: {booking.reason_for_visit}</Text>}
        {booking.pickup_location && <Text style={styles.bookingDetail}>{t("services.pickupLocation", "Pickup")}: {booking.pickup_location}</Text>}

        {(booking.status === "pending" || booking.status === "confirmed") && (
          <View style={styles.actionRow}>
            <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.danger }]} onPress={() => handleCancel(booking.booking_id)}>
              <Ionicons name="close" size={16} color="#fff" />
              <Text style={styles.actionText}>{t("services.cancelBooking", "Cancel")}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("services.myBookings", "My Bookings")}</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={styles.tabRow}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {t(`services.${tab}`, tab.charAt(0).toUpperCase() + tab.slice(1))}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : bookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{t("services.noBookings", "No bookings yet")}</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {bookings.map(renderBooking)}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerBtn: { padding: 4, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "500" },
  tabTextActive: { color: COLORS.primary, fontWeight: "700" },
  body: { flex: 1, padding: 16 },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: COLORS.textMuted },
  bookingCard: { backgroundColor: COLORS.surfaceSoft, borderRadius: BORDER_RADIUS.lg, padding: 16, marginBottom: 12 },
  bookingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  serviceName: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  businessName: { fontSize: 13, color: COLORS.primary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: BORDER_RADIUS.full, marginLeft: 8 },
  statusText: { fontSize: 12, fontWeight: "600" },
  bookingDetail: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  bookingPrice: { fontSize: 15, fontWeight: "700", color: COLORS.success, marginTop: 4 },
  bookingNotes: { fontSize: 13, color: COLORS.textSecondary, fontStyle: "italic", marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: BORDER_RADIUS.full },
  actionText: { fontSize: 13, fontWeight: "600", color: "#fff" },
});

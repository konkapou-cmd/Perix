import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Platform, ActivityIndicator, Alert, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, CATEGORY_SERVICE_TYPES, CategoryServiceType, getServiceTypeConfig, getBookingMode, BookingMode } from "../../lib/designTokens";
import { Service, TimeSlot } from "../../lib/api/core";
import { getSlots, createBooking, getAvailability } from "../../lib/api/services";
import { formatPrice, formatDuration } from "../../lib/serviceFormat";
import AdaptiveImage from "../AdaptiveImage";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";

type Props = {
  visible: boolean;
  service: Service | null;
  rootCategory: string;
  sessionToken: string;
  userName?: string;
  userEmail?: string;
  onClose: () => void;
  onSuccess?: () => void;
  onAskAbout?: (businessId: string) => void;
  cardColor?: string;
  textColor?: string;
};

export default function ServiceBookingModal({
  visible, service, rootCategory, sessionToken, userName, userEmail,
  onClose, onSuccess, onAskAbout, cardColor = "#fff", textColor = COLORS.textPrimary,
}: Props) {
  const { t } = useTranslation();
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<string, { available_spots: number; capacity: number; is_full: boolean }>>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [guests, setGuests] = useState(1);
  const [name, setName] = useState(userName || "");
  const [email, setEmail] = useState(userEmail || "");
  const [notes, setNotes] = useState("");
  const [petName, setPetName] = useState("");
  const [petType, setPetType] = useState("");
  const [reasonForVisit, setReasonForVisit] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [preferredTime, setPreferredTime] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const typeConfig = service ? getServiceTypeConfig(
    service.root_category || rootCategory || "", service.type || ""
  ) : null;
  const bookingMode: BookingMode = typeConfig ? getBookingMode(typeConfig) : "booking_slots";
  useEffect(() => {
    if (visible && service) {
      setSelectedSlot(null);
      setGuests(1);
      setName(userName || "");
      setEmail(userEmail || "");
      setNotes("");
      setPetName("");
      setPetType("");
      setReasonForVisit("");
      setPickupLocation("");
    }
  }, [visible, service]);

  useEffect(() => {
    if (!service || !selectedDate) return;
    if (bookingMode !== "booking_slots") return;
    setLoadingSlots(true);
    Promise.all([
      getSlots(service.service_id),
      getAvailability(service.service_id, selectedDate).catch(() => []),
    ])
      .then(([slotData, availData]) => {
        const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const dateObj = new Date(selectedDate + "T00:00:00");
        const dayOfWeek = dateObj.getDay();
        const matching = slotData.filter((s) => {
          if (s.is_blocked || s.is_booked) return false;
          if (s.date === selectedDate) return true;
          if (s.is_recurring && s.day_of_week === dayOfWeek) return true;
          return false;
        });
        matching.sort((a, b) => a.start_time.localeCompare(b.start_time));
        setSlots(matching);
        const availMap: Record<string, { available_spots: number; capacity: number; is_full: boolean }> = {};
        availData.forEach((a) => {
          availMap[a.slot_id] = { available_spots: a.available_spots, capacity: a.capacity, is_full: a.is_full };
        });
        setAvailabilities(availMap);
      })
      .catch(() => { setSlots([]); setAvailabilities({}); })
      .finally(() => setLoadingSlots(false));
  }, [service, selectedDate, bookingMode]);

  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const handleBook = async () => {
    if (!service || !name.trim()) {
      Alert.alert(t("common.error", "Error"), t("services.nameRequired", "Please enter your name"));
      return;
    }
    if (bookingMode === "booking_slots" && !selectedSlot) {
      Alert.alert(t("common.error", "Error"), t("services.selectTime", "Please select a time slot"));
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        service_id: service.service_id,
        date: selectedDate,
        client_name: name.trim(),
        client_email: email.trim() || undefined,
        guests,
        notes: notes.trim() || undefined,
      };
      if (selectedSlot) payload.slot_id = selectedSlot.slot_id;
      if (petName) payload.pet_name = petName;
      if (petType) payload.pet_type = petType;
      if (reasonForVisit) payload.reason_for_visit = reasonForVisit;
      if (pickupLocation) payload.pickup_location = pickupLocation;
      if (preferredTime) payload.notes = (payload.notes ? payload.notes + "\n" : "") + "Preferred time: " + preferredTime;
      await createBooking(sessionToken, payload);
      Alert.alert(t("services.bookingConfirmed", "Booking confirmed!"), t("services.bookingPending", "Booking request sent! The business will confirm shortly."));
      onSuccess?.();
      onClose();
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message || "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  const categoryTypes = rootCategory ? CATEGORY_SERVICE_TYPES[rootCategory] || [] : [];
  const currentTypeDef = categoryTypes.find((ct) => ct.type === service?.type);
  const requiresSlot = currentTypeDef?.requiresSlots ?? true;
  const showPets = rootCategory === "pets";
  const showHealthcare = rootCategory === "healthcare";
  const showAutoRental = rootCategory === "automotive" && service?.type === "auto_rental";

  const serviceMedia: MediaItem[] = React.useMemo(() => {
    if (!service) return [];
    const items: MediaItem[] = [];
    if (service.cover_image_url) {
      items.push({ uri: service.cover_image_url, type: "image" });
    } else if (service.video_url) {
      items.push({ uri: service.video_url, type: "video" });
    }
    service.image_urls?.forEach((u) => {
      if (u !== service.cover_image_url) items.push({ uri: u, type: "image" });
    });
    if (service.video_url && items.length > 0 && items[0].uri !== service.video_url) {
      items.push({ uri: service.video_url, type: "video" });
    }
    service.gallery_images?.forEach((u) => {
      if (!items.some((m) => m.uri === u)) items.push({ uri: u, type: "image" });
    });
    service.gallery_videos?.forEach((u) => {
      if (!items.some((m) => m.uri === u)) items.push({ uri: u, type: "video" });
    });
    return items;
  }, [service]);

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {bookingMode === "browse_only" ? t("services.askAbout", "Ask about this") :
             bookingMode === "booking_request" ? t("services.requestBooking", "Request Booking") :
             t("services.bookNow", "Book Now")}
          </Text>
          <View style={styles.headerBtn} />
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {service && (
            <View style={[styles.summaryCard, { backgroundColor: COLORS.surfaceSoft }]}>
              {(service.cover_image_url || service.image_urls?.[0] || service.gallery_images?.[0]) && (
                <AdaptiveImage uri={service.cover_image_url || service.image_urls?.[0] || service.gallery_images?.[0]} style={styles.summaryImage} borderRadius={BORDER_RADIUS.md} />
              )}
              <Text style={styles.summaryName}>{service.name}</Text>
              {service.duration_minutes && (
                <Text style={styles.summaryDetail}>{formatDuration(service.duration_minutes)}</Text>
              )}
              {service.price && (
                <Text style={styles.summaryPrice}>{formatPrice(service.price)}</Text>
              )}
            </View>
          )}

          {serviceMedia.length > 0 && (
            <UnifiedMediaGallery
              media={serviceMedia}
              onChange={() => {}}
              isCreator={false}
            />
          )}

          <Text style={styles.sectionTitle}>{t("services.selectDate", "Select a date")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}>
            {dates.map((d) => {
              const isSelected = d === selectedDate;
              return (
                <Pressable
                  key={d}
                  style={[styles.dateCard, isSelected && styles.dateSelected]}
                  onPress={() => { setSelectedDate(d); setSelectedSlot(null); }}
                >
                  <Text style={[styles.dateText, isSelected && styles.dateTextSelected]}>{formatDate(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {bookingMode === "booking_slots" && selectedDate && (
            <>
              <Text style={styles.sectionTitle}>{t("services.selectSlot", "Select a time slot")}</Text>
              {loadingSlots ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
              ) : slots.length === 0 ? (
                <Text style={styles.emptyText}>{t("services.noSlots", "No available slots for this date")}</Text>
              ) : (
                <View style={styles.slotRow}>
                  {slots.map((slot) => {
                    const avail = availabilities[slot.slot_id];
                    const isFull = avail?.is_full ?? false;
                    const spotsText = avail != null ? ` • ${avail.available_spots}/${avail.capacity}` : "";
                    return (
                      <Pressable
                        key={slot.slot_id}
                        style={[styles.slotCard, selectedSlot?.slot_id === slot.slot_id && styles.slotSelected, isFull && styles.slotCardFull]}
                        onPress={() => !isFull && setSelectedSlot(slot)}
                      >
                        <Text style={[styles.slotText, selectedSlot?.slot_id === slot.slot_id && styles.slotTextSelected, isFull && styles.slotTextFull]}>
                          {slot.start_time} - {slot.end_time}{spotsText}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {bookingMode === "booking_request" && selectedDate && (
            <>
              <Text style={styles.sectionTitle}>Preferred time (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Morning, 10:00–12:00"
                value={preferredTime}
                onChangeText={setPreferredTime}
              />
              <Text style={styles.sectionTitle}>Message / notes</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                multiline
                placeholder="Tell the business what you need..."
                value={notes}
                onChangeText={setNotes}
              />
            </>
          )}

          {bookingMode === "browse_only" && (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Text style={{ fontSize: 15, color: COLORS.textMuted, textAlign: "center", marginBottom: 16 }}>
                This service is available for viewing. Send a message to ask the business about it.
              </Text>
              <Pressable
                style={[styles.bookBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => { onAskAbout?.(service?.business_id || ""); onClose(); }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
                <Text style={styles.bookBtnText}>Ask about this</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionTitle}>{t("services.guests", "Guests")}</Text>
          <View style={styles.stepperRow}>
            <Pressable style={styles.stepperBtn} onPress={() => setGuests(Math.max(1, guests - 1))}>
              <Ionicons name="remove" size={20} color={COLORS.textPrimary} />
            </Pressable>
            <Text style={styles.stepperValue}>{guests}</Text>
            <Pressable style={styles.stepperBtn} onPress={() => setGuests(guests + 1)}>
              <Ionicons name="add" size={20} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>{t("services.yourName", "Your name")} *</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="John Doe" />

          <Text style={styles.sectionTitle}>{t("services.yourEmail", "Your email")}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="john@example.com" keyboardType="email-address" />

          {showPets && (
            <>
              <Text style={styles.sectionTitle}>{t("services.petName", "Pet name")}</Text>
              <TextInput style={styles.input} value={petName} onChangeText={setPetName} placeholder="Max" />
              <Text style={styles.sectionTitle}>{t("services.petType", "Pet type")}</Text>
              <TextInput style={styles.input} value={petType} onChangeText={setPetType} placeholder="Dog / Cat" />
            </>
          )}

          {showHealthcare && (
            <>
              <Text style={styles.sectionTitle}>{t("services.reasonForVisit", "Reason for visit")}</Text>
              <TextInput style={[styles.input, { height: 80 }]} value={reasonForVisit} onChangeText={setReasonForVisit} placeholder="Describe your symptoms..." multiline />
            </>
          )}

          {showAutoRental && (
            <>
              <Text style={styles.sectionTitle}>{t("services.pickupLocation", "Pickup location")}</Text>
              <TextInput style={styles.input} value={pickupLocation} onChangeText={setPickupLocation} placeholder="Address" />
            </>
          )}

          {bookingMode !== "browse_only" && (
            <>
              <Text style={styles.sectionTitle}>{t("services.notes", "Notes / Special requests")}</Text>
              <TextInput style={[styles.input, { height: 80 }]} value={notes} onChangeText={setNotes} placeholder="Any special requests..." multiline />

              <Pressable
                style={[styles.bookBtn, (!selectedDate || submitting || (bookingMode === "booking_slots" && !selectedSlot)) && { opacity: 0.5 }]}
                onPress={handleBook}
                disabled={!selectedDate || submitting || (bookingMode === "booking_slots" && !selectedSlot)}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.bookBtnText}>
                    {bookingMode === "booking_slots" ? t("services.bookNow", "Book Now") : t("services.requestBooking", "Send Request")}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerBtn: { padding: 4, width: 40 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  body: { flex: 1, padding: 16 },
  summaryCard: { padding: 16, borderRadius: BORDER_RADIUS.lg, marginBottom: 20, alignItems: "center" },
  summaryImage: { width: 120, height: 90, borderRadius: BORDER_RADIUS.md, marginBottom: 8 },
  summaryName: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  summaryDetail: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  summaryPrice: { fontSize: 16, fontWeight: "700", color: COLORS.success, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: COLORS.textPrimary, marginTop: 16, marginBottom: 8 },
  dateRow: { flexDirection: "row", marginBottom: 8 },
  dateCard: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, marginRight: 8, backgroundColor: "#fff" },
  dateSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dateText: { fontSize: 13, color: COLORS.textPrimary },
  dateTextSelected: { color: "#fff", fontWeight: "600" },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotCard: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: "#fff" },
  slotSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotCardFull: { opacity: 0.4, borderColor: COLORS.danger },
  slotText: { fontSize: 14, color: COLORS.textPrimary },
  slotTextSelected: { color: "#fff", fontWeight: "600" },
  slotTextFull: { textDecorationLine: "line-through" },
  emptyText: { fontSize: 14, color: COLORS.textMuted, textAlign: "center", marginVertical: 20 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, minWidth: 30, textAlign: "center" },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary, marginBottom: 8 },
  bookBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  bookBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

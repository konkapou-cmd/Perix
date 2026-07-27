import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Platform, ActivityIndicator, Alert, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { getServiceCtaType, requiresServiceSlots, isServiceBookable, ServiceCtaType } from "../../lib/config/serviceModules";
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

  const [allSlots, setAllSlots] = useState<TimeSlot[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const ctaType: ServiceCtaType = service ? getServiceCtaType(service.type) : "get_in_touch";
  const hasSlots = service ? requiresServiceSlots(service.type) : false;
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
      getSlots(service.service_id).then(setAllSlots).catch(() => setAllSlots([]));
    }
  }, [visible, service]);

  useEffect(() => {
    if (!service || !selectedDate) return;
    if (ctaType !== "booking") return;
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
  }, [service, selectedDate, ctaType]);

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

  const availableDates = dates.filter((dateStr) => {
    const dateObj = new Date(dateStr + "T00:00:00");
    const dayOfWeek = dateObj.getDay();
    return allSlots.some((s) => {
      if (s.is_blocked || s.is_booked) return false;
      if (s.date === dateStr) return true;
      if (s.is_recurring && s.day_of_week === dayOfWeek) return true;
      return false;
    });
  });
  const displayDates = allSlots.length > 0 ? availableDates : dates;

  const handleBook = async () => {
    if (!service || !name.trim()) {
      Alert.alert(t("common.error", "Error"), t("services.nameRequired", "Please enter your name"));
      return;
    }
    if (ctaType === "booking" && !selectedSlot) {
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

  const requiresSlot = service ? requiresServiceSlots(service.type) : false;
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
      <SafeAreaView style={s.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>
            {ctaType === "browse_only" ? t("services.askAbout", "Anfrage senden") :
             ctaType === "booking" ? t("services.requestBooking", "Buchung anfragen") :
             t("services.bookNow", "Book Now")}
          </Text>
          <View style={s.headerBtn} />
        </View>
        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: SPACING.large }} keyboardShouldPersistTaps="handled">
          {service && (
            <View style={[s.summaryCard, { backgroundColor: COLORS.surfaceSoft }]}>
              {(service.cover_image_url || service.image_urls?.[0] || service.gallery_images?.[0]) && (
                <AdaptiveImage uri={service.cover_image_url || service.image_urls?.[0] || service.gallery_images?.[0]} style={s.summaryImage} borderRadius={BORDER_RADIUS.md} />
              )}
              <Text style={s.summaryName}>{service.name}</Text>
              {service.duration_minutes && (
                <Text style={s.summaryDetail}>{formatDuration(service.duration_minutes)}</Text>
              )}
              {service.price && (
                <Text style={s.summaryPrice}>{formatPrice(service.price)}</Text>
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

          <Text style={s.sectionTitle}>{t("services.selectDate", "Select a date")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dateRow}>
            {displayDates.map((d) => {
              const isSelected = d === selectedDate;
              return (
                <Pressable
                  key={d}
                  style={[s.dateCard, isSelected && s.dateSelected]}
                  onPress={() => { setSelectedDate(d); setSelectedSlot(null); }}
                >
                  <Text style={[s.dateText, isSelected && s.dateTextSelected]}>{formatDate(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {ctaType === "booking" && selectedDate && (
            <>
              <Text style={s.sectionTitle}>{t("services.selectSlot", "Select a time slot")}</Text>
              {loadingSlots ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.section }} />
              ) : slots.length === 0 ? (
                <Text style={s.emptyText}>{t("services.noSlots", "No available slots for this date")}</Text>
              ) : (
                <View style={s.slotRow}>
                  {slots.map((slot) => {
                    const avail = availabilities[slot.slot_id];
                    const isFull = avail?.is_full ?? false;
                    const spotsText = avail != null ? ` \u2022 ${avail.available_spots}/${avail.capacity}` : "";
                    return (
                      <Pressable
                        key={slot.slot_id}
                        style={[s.slotCard, selectedSlot?.slot_id === slot.slot_id && s.slotSelected, isFull && s.slotCardFull]}
                        onPress={() => !isFull && setSelectedSlot(slot)}
                      >
                        <Text style={[s.slotText, selectedSlot?.slot_id === slot.slot_id && s.slotTextSelected, isFull && s.slotTextFull]}>
                          {slot.start_time} - {slot.end_time}{spotsText}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {ctaType !== "booking" && selectedDate && (
            <>
              <Text style={s.sectionTitle}>Preferred time (optional)</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. Morning, 10:00\u201312:00"
                value={preferredTime}
                onChangeText={setPreferredTime}
                placeholderTextColor={COLORS.textDisabled}
              />
              <Text style={s.sectionTitle}>Message / notes</Text>
              <TextInput
                style={[s.input, { height: 80 }]}
                multiline
                placeholder="Tell the business what you need..."
                value={notes}
                onChangeText={setNotes}
                placeholderTextColor={COLORS.textDisabled}
              />
            </>
          )}

          {ctaType === "browse_only" && (
            <View style={{ alignItems: "center", paddingVertical: SPACING.section }}>
              <Text style={{ fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted, textAlign: "center", marginBottom: SPACING.std }}>
                This service is available for viewing. Send a message to ask the business about it.
              </Text>
              <Pressable
                style={[s.bookBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => { onAskAbout?.(service?.business_id || ""); onClose(); }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
                <Text style={s.bookBtnText}>Ask about this</Text>
              </Pressable>
            </View>
          )}

          <Text style={s.sectionTitle}>{t("services.guests", "Guests")}</Text>
          <View style={s.stepperRow}>
            <Pressable style={s.stepperBtn} onPress={() => setGuests(Math.max(1, guests - 1))}>
              <Ionicons name="remove" size={20} color={COLORS.textPrimary} />
            </Pressable>
            <Text style={s.stepperValue}>{guests}</Text>
            <Pressable style={s.stepperBtn} onPress={() => setGuests(guests + 1)}>
              <Ionicons name="add" size={20} color={COLORS.textPrimary} />
            </Pressable>
          </View>

          <Text style={s.sectionTitle}>{t("services.yourName", "Your name")} *</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="John Doe" placeholderTextColor={COLORS.textDisabled} />

          <Text style={s.sectionTitle}>{t("services.yourEmail", "Your email")}</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="john@example.com" keyboardType="email-address" placeholderTextColor={COLORS.textDisabled} />

          {showPets && (
            <>
              <Text style={s.sectionTitle}>{t("services.petName", "Pet name")}</Text>
              <TextInput style={s.input} value={petName} onChangeText={setPetName} placeholder="Max" placeholderTextColor={COLORS.textDisabled} />
              <Text style={s.sectionTitle}>{t("services.petType", "Pet type")}</Text>
              <TextInput style={s.input} value={petType} onChangeText={setPetType} placeholder="Dog / Cat" placeholderTextColor={COLORS.textDisabled} />
            </>
          )}

          {showHealthcare && (
            <>
              <Text style={s.sectionTitle}>{t("services.reasonForVisit", "Reason for visit")}</Text>
              <TextInput style={[s.input, { height: 80 }]} value={reasonForVisit} onChangeText={setReasonForVisit} placeholder="Describe your symptoms..." multiline placeholderTextColor={COLORS.textDisabled} />
            </>
          )}

          {showAutoRental && (
            <>
              <Text style={s.sectionTitle}>{t("services.pickupLocation", "Pickup location")}</Text>
              <TextInput style={s.input} value={pickupLocation} onChangeText={setPickupLocation} placeholder="Address" placeholderTextColor={COLORS.textDisabled} />
            </>
          )}

          {ctaType !== "browse_only" && (
            <>
              <Text style={s.sectionTitle}>{t("services.notes", "Notes / Special requests")}</Text>
              <TextInput style={[s.input, { height: 80 }]} value={notes} onChangeText={setNotes} placeholder="Any special requests..." multiline placeholderTextColor={COLORS.textDisabled} />
            </>
          )}

          <View style={{ height: SPACING.large }} />
        </ScrollView>

        {ctaType !== "browse_only" && (
          <View style={s.footer}>
            <Pressable style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnText}>{t("common.cancel", "Cancel")}</Text>
            </Pressable>
            <Pressable
              style={[s.saveBtn, (!selectedDate || submitting || (ctaType === "booking" && !selectedSlot)) && { opacity: 0.5 }]}
              onPress={handleBook}
              disabled={!selectedDate || submitting || (ctaType === "booking" && !selectedSlot)}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.saveBtnText}>
                  {ctaType === "booking" ? t("services.bookNow", "Jetzt buchen") : t("services.requestBooking", "Anfrage senden")}
                </Text>
              )}
            </Pressable>
          </View>
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
  body: { flex: 1, paddingHorizontal: SPACING.std },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.small,
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelBtn: {
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textSecondary,
  },
  saveBtn: {
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  saveBtnText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  summaryCard: { padding: SPACING.std, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.section, alignItems: "center" },
  summaryImage: { width: 120, height: 90, borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.small },
  summaryName: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  summaryDetail: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, marginTop: SPACING.tiny },
  summaryPrice: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.success, marginTop: SPACING.tiny },
  sectionTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textPrimary, marginTop: SPACING.std, marginBottom: SPACING.small },
  dateRow: { flexDirection: "row", marginBottom: SPACING.small },
  dateCard: { paddingHorizontal: SPACING.small, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.small, backgroundColor: COLORS.background },
  dateSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dateText: { fontSize: FONT_SIZES.small, color: COLORS.textPrimary },
  dateTextSelected: { color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small },
  slotCard: { paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  slotSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotCardFull: { opacity: 0.4, borderColor: COLORS.danger },
  slotText: { fontSize: FONT_SIZES.caption, color: COLORS.textPrimary },
  slotTextSelected: { color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  slotTextFull: { textDecorationLine: "line-through" },
  emptyText: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, textAlign: "center", marginVertical: SPACING.section },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: SPACING.std },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary, minWidth: 30, textAlign: "center" },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.small, paddingVertical: SPACING.compact, fontSize: FONT_SIZES.body, color: COLORS.textPrimary, marginBottom: SPACING.small },
  bookBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.std, alignItems: "center", marginTop: SPACING.section },
  bookBtnText: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold as any, color: "#fff" },
});

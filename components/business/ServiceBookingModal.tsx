import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, Platform, ActivityIndicator, Alert, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { getServiceCtaType, getBookingMode, requiresServiceSlots, isServiceBookable, ServiceCtaType } from "../../lib/config/serviceModules";
import { Service, TimeSlot, StayAvailability } from "../../lib/api/core";
import { getSlots, getAvailability, createBooking, getStayAvailability, sendServiceInquiry } from "../../lib/api/services";
import { formatPrice, formatDuration } from "../../lib/serviceFormat";
import { formatDate } from "../../lib/formatDate";
import { addDays, createRequestId, isValidStayRange, toLocalISODate } from "../../lib/booking/dateRange";
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
  const router = useRouter();
  const submittingRef = useRef(false);
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

  // Date-range booking state
  const todayText = toLocalISODate(new Date());
  const [checkIn, setCheckIn] = useState(todayText);
  const [checkOut, setCheckOut] = useState(addDays(todayText, 1));
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [stayQuote, setStayQuote] = useState<StayAvailability | null>(null);
  const [loadingStayQuote, setLoadingStayQuote] = useState(false);
  const [stayQuoteError, setStayQuoteError] = useState("");
  const [requestId, setRequestId] = useState(createRequestId());
  const [datePickerTarget, setDatePickerTarget] = useState<"checkIn" | "checkOut" | null>(null);

  const ctaType: ServiceCtaType = service ? getServiceCtaType(service.type) : "get_in_touch";
  const bookingMode = service ? getBookingMode(service.type) : "none";
  const isDateRange = bookingMode === "date_range";
  const requiresSlot = bookingMode === "time_slot";

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

      if (getBookingMode(service.type) === "time_slot") {
        getSlots(service.service_id).then((data) => {
          setAllSlots(data || []);
          const available = (data || []).filter(s => !s.is_blocked && !s.is_booked);
          let firstDate = "";
          for (let i = 0; i < 14 && !firstDate; i++) {
            const d = addDays(todayText, i);
            const dow = new Date(d + "T00:00:00").getDay();
            if (available.some(s => s.date === d || (s.is_recurring && s.day_of_week === dow))) firstDate = d;
          }
          if (firstDate) setSelectedDate(prev => prev || firstDate);
        }).catch(() => setAllSlots([]));
      } else {
        setAllSlots([]);
      }

      if (isDateRange) {
        const initialCheckIn = service.available_from && service.available_from > todayText
          ? service.available_from : todayText;
        setCheckIn(initialCheckIn);
        setCheckOut(addDays(initialCheckIn, Math.max(1, service.min_nights || 1)));
        setRooms(1);
        setAdults(1);
        setChildren(0);
        setStayQuote(null);
        setRequestId(createRequestId());
      }
    }
  }, [visible, service]);

  useEffect(() => {
    if (!service || !selectedDate || bookingMode !== "time_slot") return;
    let active = true;
    setLoadingSlots(true);
    Promise.all([
      getSlots(service.service_id),
      getAvailability(service.service_id, selectedDate).catch(() => []),
    ]).then(([slotData, availabilityData]) => {
      if (!active) return;
      const dateObj = new Date(selectedDate + "T00:00:00");
      const dayOfWeek = dateObj.getDay();
      const matching = (slotData || []).filter((s) => {
        if (s.is_blocked || s.is_booked) return false;
        if (s.date === selectedDate) return true;
        if (s.is_recurring && s.day_of_week === dayOfWeek) return true;
        return false;
      }).sort((a, b) => a.start_time.localeCompare(b.start_time));
      setSlots(matching);
      const availMap: Record<string, any> = {};
      (availabilityData || []).forEach((a: any) => { availMap[a.slot_id] = a; });
      setAvailabilities(availMap);
    }).catch(() => { if (active) { setSlots([]); setAvailabilities({}); } })
    .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [service, selectedDate, bookingMode]);

  useEffect(() => {
    if (!visible || !service || !isDateRange || !isValidStayRange(checkIn, checkOut)) {
      setStayQuote(null);
      setStayQuoteError("");
      return;
    }
    let active = true;
    setStayQuoteError("");
    const timer = setTimeout(() => {
      setLoadingStayQuote(true);
      getStayAvailability(service.service_id, { checkIn, checkOut, rooms, adults, children })
        .then((quote) => { if (active) setStayQuote(quote); })
        .catch((e: any) => { if (active) { setStayQuote(null); setStayQuoteError(e?.message || "Could not check availability"); } })
        .finally(() => { if (active) setLoadingStayQuote(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [visible, service, isDateRange, checkIn, checkOut, rooms, adults, children]);

  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    dates.push(addDays(todayText, i));
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const availableDates = dates.filter((dateStr) => {    const dateObj = new Date(dateStr + "T00:00:00");
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
    if (submittingRef.current) return;
    if (!service || !name.trim()) {
      Alert.alert(t("common.error", "Error"), t("services.nameRequired", "Please enter your name"));
      return;
    }
    if (isDateRange && (!isValidStayRange(checkIn, checkOut) || !stayQuote?.available)) {
      Alert.alert(t("common.error", "Error"), t("services.selectAvailableStay", "Select an available check-in and checkout."));
      return;
    }
    if (!isDateRange && ctaType === "booking" && !selectedSlot) {
      Alert.alert(t("common.error", "Error"), t("services.selectTime", "Please select a time slot"));
      return;
    }
    setSubmitting(true);
    submittingRef.current = true;
    try {
      const isHotel = service.type === "hotel_room";

      if (isHotel) {
        const price = service.price ? `€${service.price}/night` : "";
        const payload: any = {
          service_id: service.service_id,
          date: checkIn,
          end_date: checkOut,
          client_name: name.trim(),
          client_email: email.trim() || undefined,
          guests: adults + children,
          room_count: rooms,
          adults,
          children,
          notes: notes.trim() || undefined,
          request_id: requestId,
        };
        await createBooking(sessionToken, payload);
        setRequestId(createRequestId());

        const msg = `Hello, I would like to request a booking for: ${service.name} at ${price}.\n\nCheck-in: ${checkIn ? formatDate(checkIn) : ""}\nCheck-out: ${checkOut ? formatDate(checkOut) : ""}\nRooms: ${rooms}\nAdults: ${adults}\nChildren: ${children}\n\n${notes ? `Notes: ${notes}\n\n` : ""}Please confirm availability and price.`;
        try { await sendServiceInquiry(sessionToken, service.service_id, { name: name.trim(), email: email.trim() || "", message: msg }); } catch {}

        onClose();
        Alert.alert(
          t("services.requestSent"),
          t("services.bookingPending", "Booking request sent! The business will confirm shortly."),
          [
            { text: t("common.ok", "OK"), style: "cancel" },
            { text: t("messages.title", "View Messages"), onPress: () => router.navigate("/(tabs)/messages") },
          ],
        );
        onSuccess?.();
        return;
      }

      const payload: any = {
        service_id: service.service_id,
        date: isDateRange ? checkIn : selectedDate,
        client_name: name.trim(),
        client_email: email.trim() || undefined,
        guests: isDateRange ? adults + children : guests,
        notes: notes.trim() || undefined,
        request_id: isDateRange ? requestId : undefined,
      };
      if (isDateRange) {
        payload.end_date = checkOut;
        payload.room_count = rooms;
        payload.adults = adults;
        payload.children = children;
      }
      if (selectedSlot) payload.slot_id = selectedSlot.slot_id;
      if (petName) payload.pet_name = petName;
      if (petType) payload.pet_type = petType;
      if (reasonForVisit) payload.reason_for_visit = reasonForVisit;
      if (pickupLocation) payload.pickup_location = pickupLocation;
      await createBooking(sessionToken, payload);
      setRequestId(createRequestId());
      Alert.alert(t("services.requestSent"), t("services.bookingPending", "Booking request sent! The business will confirm shortly."));
      onSuccess?.();
      onClose();
    } catch (err: any) {
      Alert.alert(t("common.error", "Error"), err.message || "Booking failed");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

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

  const bookingDisabled =
    submitting ||
    !name.trim() ||
    (requiresSlot && (!selectedDate || !selectedSlot)) ||
    (isDateRange && (!isValidStayRange(checkIn, checkOut) || !stayQuote?.available));

  const minimumCheckout = addDays(checkIn, Math.max(1, service?.min_nights || 1));
  const maxCheckoutByStay = addDays(checkIn, Math.max(service?.min_nights || 1, service?.max_nights || 30));
  const effectiveMaxCheckout = service?.available_until
    ? (maxCheckoutByStay > service.available_until ? service.available_until : maxCheckoutByStay)
    : undefined;

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
                <Text style={s.summaryDetail}>{formatDuration(service.duration_minutes, t)}</Text>
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

          {isDateRange && service && (
            <View>
              <Text style={s.sectionTitle}>{t("services.stayDates", "Stay dates")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>{t("services.checkIn", "Check-in")}</Text>
                  <Pressable style={s.input} onPress={() => setDatePickerTarget("checkIn")}>
                    <Text style={s.inputText}>{formatDate(checkIn)}</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>{t("services.checkOut", "Check-out")}</Text>
                  <Pressable style={s.input} onPress={() => setDatePickerTarget("checkOut")}>
                    <Text style={s.inputText}>{formatDate(checkOut)}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={s.stepperRow}>
                <Text style={s.stepperLabel}>{t("services.rooms", "Rooms")}</Text>
                <View style={s.stepperControls}>
                  <Pressable style={s.stepperBtn} disabled={rooms <= 1} onPress={() => setRooms(Math.max(1, rooms - 1))}><Ionicons name="remove" size={18} color={COLORS.textPrimary} /></Pressable>
                  <Text style={s.stepperValue}>{rooms}</Text>
                  <Pressable style={s.stepperBtn} disabled={rooms >= (service.inventory_count || 1)} onPress={() => setRooms(Math.min(service.inventory_count || 1, rooms + 1))}><Ionicons name="add" size={18} color={COLORS.textPrimary} /></Pressable>
                </View>
              </View>

              <View style={s.stepperRow}>
                <Text style={s.stepperLabel}>{t("services.adults", "Adults")}</Text>
                <View style={s.stepperControls}>
                  <Pressable style={s.stepperBtn} disabled={adults <= 1} onPress={() => setAdults(Math.max(1, adults - 1))}><Ionicons name="remove" size={18} color={COLORS.textPrimary} /></Pressable>
                  <Text style={s.stepperValue}>{adults}</Text>
                  <Pressable style={s.stepperBtn} disabled={adults >= Math.max(1, (service.max_adults || service.max_guests || 1) * rooms)} onPress={() => setAdults(Math.min(Math.max(1, (service.max_adults || service.max_guests || 1) * rooms), adults + 1))}><Ionicons name="add" size={18} color={COLORS.textPrimary} /></Pressable>
                </View>
              </View>

              <View style={s.stepperRow}>
                <Text style={s.stepperLabel}>{t("services.children", "Children")}</Text>
                <View style={s.stepperControls}>
                  <Pressable style={s.stepperBtn} disabled={children <= 0} onPress={() => setChildren(Math.max(0, children - 1))}><Ionicons name="remove" size={18} color={COLORS.textPrimary} /></Pressable>
                  <Text style={s.stepperValue}>{children}</Text>
                  <Pressable style={s.stepperBtn} disabled={children >= Math.max(0, (service.max_children || 0) * rooms)} onPress={() => setChildren(Math.min(Math.max(0, (service.max_children || 0) * rooms), children + 1))}><Ionicons name="add" size={18} color={COLORS.textPrimary} /></Pressable>
                </View>
              </View>

              {loadingStayQuote && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 12 }} />}
              {!loadingStayQuote && stayQuote && (
                <View style={{ marginTop: 12, padding: 12, backgroundColor: COLORS.success + "15", borderRadius: BORDER_RADIUS.md }}>
                  <Text style={s.quoteTitle}>{stayQuote.nights} {t("services.nights", "nights")}</Text>
                  <Text style={s.quoteLine}>{(stayQuote.nightly_rate_amount / 100).toFixed(2)} {stayQuote.currency} / night</Text>
                  <Text style={s.quoteTotal}>Total: {(stayQuote.total_amount / 100).toFixed(2)} {stayQuote.currency}</Text>
                  {!stayQuote.available && <Text style={{ color: COLORS.danger, marginTop: 4 }}>{t("services.stayUnavailable")}</Text>}
                </View>
              )}
              {stayQuoteError ? <Text style={s.errorText}>{stayQuoteError}</Text> : null}
            </View>
          )}

          {!isDateRange && (
          <>
          <Text style={s.sectionTitle}>{t("services.selectDate", "Select a date")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dateRow}>
            {dates.map((d) => {
              const hasAvailability = availableDates.includes(d);
              const isSelected = d === selectedDate;
              const disabled = allSlots.length > 0 && !hasAvailability;
              return (
                <Pressable
                  key={d}
                  disabled={disabled}
                  style={[s.dateCard, isSelected && s.dateSelected, disabled && s.dateCardDisabled]}
                  onPress={() => { setSelectedDate(d); setSelectedSlot(null); }}
                >
                  <Text style={[s.dateText, isSelected && s.dateTextSelected, disabled && s.dateTextDisabled]}>{formatDate(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {allSlots.length > 0 && availableDates.length === 0 && (
            <Text style={s.emptyText}>{t("services.noSlots", "No available slots")}</Text>
          )}

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
          </>)}

          {!isDateRange && (
          <>
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
          </>)}

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
              style={[s.saveBtn, bookingDisabled && { opacity: 0.5 }]}
              onPress={handleBook}
              disabled={bookingDisabled}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.saveBtnText}>
                  {service?.type === "hotel_room" ? t("services.sendRequest", "Send Request")
                   : ctaType === "booking" ? t("services.bookNow", "Jetzt buchen")
                   : t("services.requestBooking", "Anfrage senden")}
                </Text>
              )}
            </Pressable>
          </View>
        )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={datePickerTarget !== null} animationType="slide" transparent onRequestClose={() => setDatePickerTarget(null)}>
        <View style={s.datePickerOverlay}>
          <View style={s.datePickerContainer}>
            <View style={s.datePickerHeader}>
              <Text style={s.datePickerTitle}>{datePickerTarget === "checkIn" ? t("services.checkIn") : t("services.checkOut")}</Text>
              <Pressable onPress={() => setDatePickerTarget(null)}><Ionicons name="close" size={22} color={COLORS.textPrimary} /></Pressable>
            </View>
            <Calendar
              minDate={datePickerTarget === "checkOut" ? minimumCheckout : (service?.available_from && service.available_from > todayText ? service.available_from : todayText)}
              maxDate={effectiveMaxCheckout}
              markedDates={{ [checkIn]: { startingDay: true, color: COLORS.primary, textColor: "#fff" }, [checkOut]: { endingDay: true, color: COLORS.primary, textColor: "#fff" } }}
              markingType="period"
              firstDay={1}
              onDayPress={(day) => {
                if (!service) return;
                if (datePickerTarget === "checkIn") {
                  const newCheckIn = day.dateString;
                  setCheckIn(newCheckIn);
                  const minCo = addDays(newCheckIn, Math.max(1, service.min_nights || 1));
                  if (checkOut < minCo) setCheckOut(minCo);
                  const localMax = addDays(newCheckIn, Math.max(service.min_nights || 1, service.max_nights || 30));
                  const localMaxCheckout = service?.available_until ? (localMax > service.available_until ? service.available_until : localMax) : undefined;
                  if (localMaxCheckout && checkOut > localMaxCheckout) setCheckOut(localMaxCheckout);
                } else { setCheckOut(day.dateString); }
                setDatePickerTarget(null);
              }}
              theme={{ todayTextColor: COLORS.primary, arrowColor: COLORS.primary, monthTextColor: COLORS.textPrimary }}
            />
          </View>
        </View>
      </Modal>
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
  dateCardDisabled: { opacity: 0.3 },
  dateText: { fontSize: FONT_SIZES.small, color: COLORS.textPrimary },
  dateTextSelected: { color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  dateTextDisabled: { color: COLORS.textMuted },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small },
  slotCard: { paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  slotSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotCardFull: { opacity: 0.4, borderColor: COLORS.danger },
  slotText: { fontSize: FONT_SIZES.caption, color: COLORS.textPrimary },
  slotTextSelected: { color: "#fff", fontWeight: FONT_WEIGHTS.semibold as any },
  slotTextFull: { textDecorationLine: "line-through" },
  emptyText: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, textAlign: "center", marginVertical: SPACING.section },
  stepperRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.small },
  stepperBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary, minWidth: 30, textAlign: "center" },
  stepperLabel: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  stepperControls: { flexDirection: "row", alignItems: "center", gap: SPACING.small },
  fieldLabel: { fontSize: FONT_SIZES.caption, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textSecondary, marginBottom: SPACING.tiny },
  inputText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  quoteTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  quoteLine: { marginTop: SPACING.tiny, fontSize: FONT_SIZES.caption, color: COLORS.textSecondary },
  quoteTotal: { marginTop: SPACING.small, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.success },
  datePickerOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  datePickerContainer: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.lg, borderTopRightRadius: BORDER_RADIUS.lg, padding: SPACING.std },
  datePickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.small },
  datePickerTitle: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  errorText: { marginTop: SPACING.small, fontSize: FONT_SIZES.caption, color: COLORS.danger },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.small, paddingVertical: SPACING.compact, fontSize: FONT_SIZES.body, color: COLORS.textPrimary, marginBottom: SPACING.small },
  bookBtn: { backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.std, alignItems: "center", marginTop: SPACING.section },
  bookBtnText: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold as any, color: "#fff" },
});

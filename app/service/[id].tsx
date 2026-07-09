import { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useAuth } from "../../context/AuthContext";
import { getServiceDetail, getSlots, createBooking, getAvailability, sendServiceInquiry } from "../../lib/api/services";
import { toggleSaved, checkSaved } from "../../lib/api/saved";
import { Service, TimeSlot } from "../../lib/api/core";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS, CATEGORY_SERVICE_TYPES, getServiceTypeConfig, getBookingMode, BookingMode } from "../../lib/designTokens";
import { FIELD_REGISTRY, LEASE_DURATION_LABELS, DIETARY_LABELS } from "../../lib/fieldRegistry";
import { formatPrice, formatDuration } from "../../lib/serviceFormat";
import { buildMediaItems } from "../../lib/api/mediaUtils";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import ShareContent from "../../components/ShareContent";
import { ContentHero, ContentGallery, ContentMap, ContentSection } from "../../components/shared";
import { InfoCard } from "../../components/shared/InfoCard";
import { LocationCard } from "../../components/shared/LocationCard";
import { ChecklistCard } from "../../components/shared/ChecklistCard";
import { ShareSection as ShareSectionComponent } from "../../components/shared/ShareSection";
import { BottomCTA } from "../../components/shared/BottomCTA";
import { EntityHeader } from "../../components/shared/EntityHeader";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ServiceDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const router = useRouter();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<string, { available_spots: number; capacity: number; is_full: boolean }>>({});
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [bookingName, setBookingName] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [bookingGuests, setBookingGuests] = useState("1");
  const [bookingNotes, setBookingNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showInquiry, setShowInquiry] = useState(false);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [inquiryName, setInquiryName] = useState("");
  const [inquiryEmail, setInquiryEmail] = useState("");
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [submittingInquiry, setSubmittingInquiry] = useState(false);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerItems, setMediaViewerItems] = useState<MediaItem[]>([]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const [themedAlertVisible, setThemedAlertVisible] = useState(false);
  const [themedAlertMessage, setThemedAlertMessage] = useState("");

  const showThemedAlert = (message: string) => { setThemedAlertMessage(message); setThemedAlertVisible(true); };

  useEffect(() => { loadService(); }, [id]);

  const loadService = async () => {
    if (!id) return;
    try {
      const data = await getServiceDetail(id);
      setService(data);
      if (sessionToken) {
        try { const { is_saved } = await checkSaved(sessionToken, "service", id); setIsSaved(is_saved); } catch {}
      }
    } catch (e) { console.log("Failed to load service:", e); }
    finally { setLoading(false); }
  };

  const requiresSlots = useMemo(() => {
    if (!service) return true;
    const rootCat = service.root_category || "";
    const types = CATEGORY_SERVICE_TYPES[rootCat] || [];
    return types.find((ct) => ct.type === service.type)?.requiresSlots ?? true;
  }, [service]);

  const requiresBooking = useMemo(() => {
    if (!service) return true;
    const rootCat = service.root_category || "";
    const types = CATEGORY_SERVICE_TYPES[rootCat] || [];
    return types.find((ct) => ct.type === service.type)?.requiresBooking ?? true;
  }, [service]);

  const bookingMode = useMemo<BookingMode>(() => {
    if (!service) return "browse_only";
    const config = getServiceTypeConfig(service.root_category || "", service.type || "");
    return config ? getBookingMode(config) : (requiresBooking ? "booking_slots" : "browse_only");
  }, [service, requiresBooking]);

  const dates = useMemo(() => {
    const result: string[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) { const d = new Date(today); d.setDate(d.getDate() + i); result.push(d.toISOString().split("T")[0]); }
    return result;
  }, []);

  const calendarMarkedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    if (selectedDate) marks[selectedDate] = { selected: true, selectedColor: COLORS.servicesAccent, selectedTextColor: "#fff" };
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      if (ds === selectedDate) continue;
      const dow = d.getDay();
      if (slots.some((s) => s.date === ds || (s.is_recurring && s.day_of_week === dow))) {
        marks[ds] = { ...marks[ds], marked: true, dotColor: COLORS.detailSuccess };
      }
    }
    return marks;
  }, [slots, selectedDate]);

  useEffect(() => {
    if (!service || !selectedDate || !requiresSlots) return;
    Promise.all([getSlots(service.service_id), getAvailability(service.service_id, selectedDate).catch(() => [])])
      .then(([slotData, availData]) => {
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
        const availMap: Record<string, any> = {};
        availData.forEach((a: any) => { availMap[a.slot_id] = { available_spots: a.available_spots, capacity: a.capacity, is_full: a.is_full }; });
        setAvailabilities(availMap);
      }).catch(() => { setSlots([]); setAvailabilities({}); });
  }, [service, selectedDate]);

  const handleToggleSave = async () => {
    if (!sessionToken || !service) return;
    setSavingItem(true);
    try { const { is_saved } = await toggleSaved(sessionToken, "service", service.service_id); setIsSaved(is_saved); }
    catch (e) { console.error("Failed to toggle save:", e); }
    finally { setSavingItem(false); }
  };

  const handleRequestBooking = async () => {
    if (!sessionToken || !service) { Alert.alert("Error", t("services.loginRequired")); return; }
    if (!selectedDate) { Alert.alert("Error", t("services.selectDate")); return; }
    if (requiresSlots && !selectedSlot) { Alert.alert("Error", t("services.selectTime")); return; }
    setSubmitting(true);
    try {
      const payload: any = { service_id: service.service_id, date: selectedDate, client_name: bookingName.trim() || user?.name || "", client_email: bookingEmail.trim() || user?.email || "", guests: parseInt(bookingGuests, 10) || 1, notes: bookingNotes.trim() || undefined };
      if (selectedSlot) payload.slot_id = selectedSlot.slot_id;
      await createBooking(sessionToken, payload);
      Alert.alert(t("services.bookingSent"), t("services.bookingSentMsg"));
      setShowBooking(false); setSelectedSlot(null); setBookingNotes("");
    } catch (e: any) { Alert.alert("Error", e.message || t("services.bookingFailed")); }
    finally { setSubmitting(false); }
  };

  const handleSendInquiry = async () => {
    if (!sessionToken || !service) { Alert.alert("Error", t("services.loginRequired")); return; }
    if (!inquiryName.trim() || !inquiryMessage.trim()) { Alert.alert("Error", t("services.fillRequired")); return; }
    setSubmittingInquiry(true);
    try {
      await sendServiceInquiry(sessionToken, service.service_id, { name: inquiryName.trim(), email: inquiryEmail.trim() || user?.email || "", message: inquiryMessage.trim() });
      Alert.alert(t("services.inquirySent"), t("services.inquirySentMsg"));
      setShowInquiry(false); setInquiryName(""); setInquiryEmail(""); setInquiryMessage("");
    } catch (e: any) { Alert.alert("Error", e.message || t("services.inquiryFailed")); }
    finally { setSubmittingInquiry(false); }
  };

  const openMap = () => {
    if (service?.latitude != null && service?.longitude != null) {
      Linking.openURL(`https://maps.google.com/maps?q=${service.latitude},${service.longitude}`);
    } else if (service?.address) {
      Linking.openURL(`https://maps.google.com/maps?q=${encodeURIComponent(service.address)}`);
    }
  };

  const formatTime = (time: string) => { const [h, m] = time.split(":"); return `${h}:${m}`; };

  const currentCategory = service?.root_category || "";
  const isRental = currentCategory === "rentals" || currentCategory === "rental-real-estate";

  const getTypeIcon = (type: string) => {
    const types = CATEGORY_SERVICE_TYPES[currentCategory] || [];
    return types.find((ct) => ct.type === type)?.icon || "grid";
  };

  const getTypeLabel = (type: string) => {
    const types = CATEGORY_SERVICE_TYPES[currentCategory] || [];
    return types.find((ct) => ct.type === type)?.label || type.replace(/_/g, " ");
  };

  const getFieldsForType = (): string[] => {
    const types = CATEGORY_SERVICE_TYPES[currentCategory] || [];
    return types.find((ct) => ct.type === service?.type)?.fields || [];
  };

  const serviceField = (name: string): any => (service as any)?.[name];

  const hasDetailValue = (name: string): boolean => {
    const val = serviceField(name);
    if (val === null || val === undefined) return false;
    if (typeof val === "string" && val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  };

  const allMediaItems = service ? buildMediaItems(service) : [];

  const excludedFromDetailCards = ["duration_minutes", "capacity", "bedrooms", "bathrooms", "size_sqm", "property_type", "floor", "deposit", "available_from", "lease_duration", "furnished", "max_guests", "address", "facilities"];

  const getFieldIcon = (name: string) => {
    const map: Record<string, string> = { instructor: "person-outline", specialist_name: "person", difficulty_level: "options", session_type: "calendar", treatment_type: "medkit", service_category: "cut", consultation_type: "briefcase", meeting_type: "videocam", menu_category: "list", calories: "flame", spice_level: "thermometer", make: "car-sport", model: "car-sport", year: "calendar", mileage_km: "speedometer", fuel_type: "water", transmission: "settings", brand: "pricetag", stock_status: "checkmark-circle", condition: "reload", max_guests: "people", capacity: "people-outline", duration_minutes: "time-outline", bedrooms: "bed-outline", bathrooms: "water-outline", size_sqm: "resize-outline", property_type: "home-outline", floor: "layers-outline", deposit: "wallet-outline", available_from: "calendar-outline", lease_duration: "time-outline", furnished: "home-outline", dietary_tags: "leaf", allergens: "warning", facilities: "star-outline", pet_name: "paw", pet_type: "paw", pickup_location: "location", dropoff_location: "location", reason_for_visit: "document-text", insurance_info: "shield", includes: "list", sessions_count: "layers", duration_days: "calendar", duration_months: "calendar", duration_per_session: "timer", visits_included: "footsteps", valid_days: "calendar", included_services: "grid", special_requests: "star" };
    return map[name] || "information-circle";
  };

  const handleShareService = async () => {
    if (!service) return;
    const message = `${service.name} — ${formatPrice(service.price)} on Perix`;
    await Share.share({ message });
  };

  const handleWhatsAppShare = async () => {
    if (!service) return;
    const message = `${service.name} — ${formatPrice(service.price)} on Perix`;
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) await Linking.openURL(whatsappUrl);
      else await Share.share({ message });
    } catch { await Share.share({ message }); }
  };

  const getQuickInfoFields = () => getFieldsForType().filter((f) => ["duration_minutes", "capacity", "bedrooms", "bathrooms", "size_sqm", "max_guests"].includes(f) && hasDetailValue(f));

  const getFacilities = (): string[] => {
    if (!service?.facilities || !Array.isArray(service.facilities)) return [];
    return service.facilities.map((f: string) => f.charAt(0).toUpperCase() + f.slice(1).replace(/-/g, " "));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.skeletonHero} />
          <View style={styles.skeletonBlock}>
            <View style={styles.skeletonLine} />
            <View style={[styles.skeletonLine, { width: "60%" }]} />
          </View>
          <View style={styles.skeletonRow}>
            <View style={styles.skeletonCard} />
            <View style={styles.skeletonCard} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!service) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <Text style={styles.errorText}>{t("services.notFound", "Service not found")}</Text>
        <Pressable style={[styles.backButton, { backgroundColor: COLORS.servicesAccent }]} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const ctaLabel = bookingMode === "booking_slots" ? t("services.bookNow", "Jetzt buchen")
    : bookingMode === "booking_request" ? t("services.requestBooking", "Buchung anfragen")
    : t("services.askAbout", "Anfrage senden");

  const handleCta = () => {
    if (bookingMode === "browse_only") {
      setShowInquiry(true); setInquiryName(user?.name || ""); setInquiryEmail(user?.email || "");
    } else {
      setShowBooking(true); setBookingName(user?.name || ""); setBookingEmail(user?.email || "");
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: COLORS.backgroundPage }]} edges={["top", "bottom"]}>
      <Modal visible={themedAlertVisible} transparent animationType="fade">
        <View style={styles.themedAlertOverlay}><View style={styles.themedAlertContainer}>
          <Text style={styles.themedAlertMessage}>{themedAlertMessage}</Text>
          <Pressable style={styles.themedAlertButton} onPress={() => setThemedAlertVisible(false)}>
            <Text style={styles.themedAlertButtonText}>OK</Text>
          </Pressable>
        </View></View>
      </Modal>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 30}>
        <ScrollView
          style={[styles.flex1, Platform.OS === "web" ? { width: "100%", maxWidth: 914, alignSelf: "center" } as any : undefined]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ContentHero
            coverImageUrl={service.cover_image_url}
            videoUrl={service.video_url}
            muxThumbnailUrl={service.mux_thumbnail_url}
            videoStatus={service.video_status}
            isCoverVideo={!service.cover_image_url && !!service.video_url}
            coverFocalPoint={service.cover_focal_point}
            imageUrls={service.image_urls}
            title={service.name}
            badges={[
              { icon: getTypeIcon(service.type), text: getTypeLabel(service.type), color: COLORS.servicesAccent },
              ...(service.price ? [{ icon: "cash", text: formatPrice(service.price), color: COLORS.warning }] : []),
            ]}
            subtitle={service.address ? { text: service.address, icon: "location" } : undefined}
            mediaItems={allMediaItems}
            onMediaPress={(idx) => { setMediaViewerItems(allMediaItems); setMediaViewerIndex(idx); setMediaViewerVisible(true); }}
          />

          <EntityHeader
            title={service.name}
            subtitle={service.business_name || ""}
            subtitlePrefix="von"
            avatarUrl={service.business_logo || undefined}
            accentColor={COLORS.servicesAccent}
            onPress={service.business_id ? () => router.push(`/business/${service.business_id}` as any) : undefined}
          />

          <View style={styles.infoRow}>
            <InfoCard
              icon={getTypeIcon(service.type) as any}
              label={t("services.serviceCategory", "Kategorie")}
              value={getTypeLabel(service.type)}
              accentColor={COLORS.servicesAccent}
            />
            {service.price && (
              <InfoCard
                icon="cash-outline"
                label="Preis ab"
                value={formatPrice(service.price)}
                accentColor={COLORS.warning}
              />
            )}
          </View>

          {getQuickInfoFields().length > 0 && (
            <View style={styles.infoRow}>
              {getQuickInfoFields().map((fieldName) => {
                const value = serviceField(fieldName);
                const config = FIELD_REGISTRY[fieldName];
                if (!config) return null;
                let displayValue = config.displayFormat === "duration" ? formatDuration(Number(value)) : String(value);
                if (fieldName === "size_sqm") displayValue = String(value) + " m²";
                if (fieldName === "capacity" || fieldName === "max_guests") displayValue = "Bis " + value;
                return (
                  <InfoCard
                    key={fieldName}
                    icon={getFieldIcon(fieldName) as any}
                    label={t(config.labelKey, config.labelKey)}
                    value={displayValue}
                    accentColor={COLORS.servicesAccent}
                  />
                );
              })}
            </View>
          )}

          {service.address && (
            <LocationCard
              label={t("services.address", "Adresse")}
              address={service.address}
              accentColor={COLORS.servicesAccent}
              onPress={openMap}
            />
          )}

          {service.latitude != null && service.longitude != null && (
            <ContentMap latitude={service.latitude} longitude={service.longitude} title={service.name} address={service.address} interactive />
          )}

          {service.description && (
            <ContentSection icon="document-text" title={t("services.description", "Beschreibung")}>
              <Text style={styles.description}>{service.description}</Text>
            </ContentSection>
          )}

          {getFacilities().length > 0 && (
            <ChecklistCard
              icon="checkmark-circle-outline"
              title="Unsere Leistungen"
              items={getFacilities()}
              accentColor={COLORS.servicesAccent}
            />
          )}

          {allMediaItems.length > 0 && (
            <ContentGallery mediaItems={allMediaItems} title="Galerie" />
          )}

          {service.business_id && (
            <Pressable style={styles.businessRow} onPress={() => router.push(`/business/${service.business_id}` as any)}>
              <Ionicons name="business" size={20} color={COLORS.servicesAccent} />
              <Text style={styles.businessRowText}>{t("services.viewBusiness")}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
            </Pressable>
          )}

          <ShareSectionComponent
            accentColor={COLORS.servicesAccent}
            saved={isSaved}
            onWhatsApp={handleWhatsAppShare}
            onShare={() => setShowShareModal(true)}
            onSave={handleToggleSave}
          />

          <BottomCTA
            primaryLabel={ctaLabel}
            primaryIcon="calendar-outline"
            accentColor={COLORS.servicesAccent}
            onPrimary={handleCta}
            saved={isSaved}
            onSave={handleToggleSave}
            onShare={handleShareService}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <ShareContent
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        contentType="service"
        contentId={service.service_id}
        title={service.name}
        description={service.description || undefined}
        imageUrl={service.cover_image_url || service.image_urls?.[0] || undefined}
      />
      <LazyMediaViewer visible={mediaViewerVisible} media={mediaViewerItems} initialIndex={mediaViewerIndex} onClose={() => setMediaViewerVisible(false)} />

      {/* Booking Modal */}
      <Modal visible={showBooking} animationType="slide" onRequestClose={() => { setShowBooking(false); setSelectedSlot(null); setBookingNotes(""); setShowCalendarView(false); }}>
        <SafeAreaView style={styles.bookingContainer} edges={["top", "bottom"]}>
          <View style={styles.bookingHeader}>
            <Pressable onPress={() => { setShowBooking(false); setSelectedSlot(null); setBookingNotes(""); setShowCalendarView(false); }}><Ionicons name="close" size={24} color={COLORS.servicesAccent} /></Pressable>
            <Text style={styles.bookingTitle}>{t("services.requestBooking")}</Text>
            <View style={{ width: 24 }} />
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView style={styles.bookingForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.bookingServiceName}>{service.name}</Text>
            {service.price && <Text style={styles.bookingServicePrice}>{formatPrice(service.price)}</Text>}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.modalSectionTitle}>{t("services.selectDate")}</Text>
              <Pressable onPress={() => setShowCalendarView(!showCalendarView)} style={styles.calendarToggleBtn}>
                <Ionicons name={showCalendarView ? "list" : "calendar"} size={18} color={COLORS.servicesAccent} />
              </Pressable>
            </View>
            {showCalendarView ? (
              <View style={styles.calendarWrapper}>
                <Calendar
                  current={selectedDate || dates[0]}
                  onDayPress={(day: { dateString: string }) => { setSelectedDate(day.dateString); setSelectedSlot(null); setShowCalendarView(false); }}
                  markedDates={calendarMarkedDates}
                  markingType="simple"
                  firstDay={1}
                  theme={{ backgroundColor: "#fff", calendarBackground: "#fff", textSectionTitleColor: COLORS.textSecondary, selectedDayBackgroundColor: COLORS.servicesAccent, selectedDayTextColor: "#fff", todayTextColor: COLORS.servicesAccent, dayTextColor: COLORS.textDark, textDisabledColor: "#d1d5db", arrowColor: COLORS.servicesAccent, monthTextColor: COLORS.textPrimary, textDayFontWeight: "500", textMonthFontWeight: "700", textDayFontSize: 14 }}
                />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}>
                {dates.map((d) => {
                  const isSelected = selectedDate === d;
                  const dateObj = new Date(d + "T00:00:00");
                  const dayNum = dateObj.getDate();
                  const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dateObj.getDay()];
                  return (
                    <Pressable key={d} style={[styles.dateChip, isSelected && styles.dateChipSelected]} onPress={() => { setSelectedDate(d); setSelectedSlot(null); }}>
                      <Text style={[styles.dateChipDay, isSelected && styles.dateChipDaySelected]}>{dayName}</Text>
                      <Text style={[styles.dateChipNum, isSelected && styles.dateChipNumSelected]}>{dayNum}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {selectedDate && requiresSlots && slots.length > 0 && (
              <>
                <Text style={styles.modalSectionTitle}>{t("services.selectTime")}</Text>
                <View style={styles.slotsGrid}>
                  {slots.map((slot) => {
                    const avail = availabilities[slot.slot_id];
                    const isFull = avail?.is_full ?? false;
                    const spotsText = avail != null ? ` • ${avail.available_spots}/${avail.capacity}` : "";
                    return (
                      <Pressable key={slot.slot_id} style={[styles.slotChip, selectedSlot?.slot_id === slot.slot_id && styles.slotChipSelected, isFull && styles.slotChipFull]} onPress={() => !isFull && setSelectedSlot(slot)}>
                        <Text style={[styles.slotChipText, selectedSlot?.slot_id === slot.slot_id && styles.slotChipTextSelected, isFull && styles.slotChipTextFull]}>{formatTime(slot.start_time)} - {formatTime(slot.end_time)}{spotsText}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {selectedDate && !requiresSlots && (
              <>
                <Text style={styles.modalSectionTitle}>Preferred time (optional)</Text>
                <TextInput style={styles.input} placeholder="e.g. Morning, 10:00–12:00" value={bookingNotes} onChangeText={setBookingNotes} />
              </>
            )}
            <Text style={styles.modalSectionTitle}>{t("services.yourName")}</Text>
            <TextInput style={styles.input} value={bookingName} onChangeText={setBookingName} placeholder={user?.name || "Name"} />
            <Text style={styles.modalSectionTitle}>{t("services.yourEmail")}</Text>
            <TextInput style={styles.input} value={bookingEmail} onChangeText={setBookingEmail} placeholder={user?.email || "email@example.com"} keyboardType="email-address" />
            <View style={styles.guestRow}>
              <Text style={styles.modalSectionTitle}>{t("services.guests")}</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepperBtn} onPress={() => setBookingGuests(String(Math.max(1, parseInt(bookingGuests, 10) - 1)))}><Ionicons name="remove" size={18} color={COLORS.servicesAccent} /></Pressable>
                <Text style={styles.stepperValue}>{bookingGuests}</Text>
                <Pressable style={styles.stepperBtn} onPress={() => setBookingGuests(String(parseInt(bookingGuests, 10) + 1))}><Ionicons name="add" size={18} color={COLORS.servicesAccent} /></Pressable>
              </View>
            </View>
            <Text style={styles.modalSectionTitle}>{t("services.notes")}</Text>
            <TextInput style={[styles.input, styles.textArea]} value={bookingNotes} onChangeText={setBookingNotes} placeholder={t("services.notesPlaceholder")} multiline numberOfLines={3} />
            <Pressable style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleRequestBooking} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitButtonText}>{t("services.sendRequest")}</Text>}
            </Pressable>
            <View style={{ height: 20 }} />
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Inquiry Modal */}
      <Modal visible={showInquiry} animationType="slide" onRequestClose={() => { setShowInquiry(false); setInquiryName(""); setInquiryEmail(""); setInquiryMessage(""); }}>
        <SafeAreaView style={styles.bookingContainer} edges={["top", "bottom"]}>
          <View style={styles.bookingHeader}>
            <Pressable onPress={() => { setShowInquiry(false); setInquiryName(""); setInquiryEmail(""); setInquiryMessage(""); }}><Ionicons name="close" size={24} color={COLORS.servicesAccent} /></Pressable>
            <Text style={styles.bookingTitle}>{t("services.sendMessage")}</Text>
            <View style={{ width: 24 }} />
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView style={styles.bookingForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.bookingServiceName}>{service.name}</Text>
            {service.price && <Text style={styles.bookingServicePrice}>{formatPrice(service.price)}</Text>}
            <Text style={styles.modalSectionTitle}>{t("services.yourName")} *</Text>
            <TextInput style={styles.input} value={inquiryName} onChangeText={setInquiryName} placeholder={user?.name || "Name"} />
            <Text style={styles.modalSectionTitle}>{t("services.yourEmail")}</Text>
            <TextInput style={styles.input} value={inquiryEmail} onChangeText={setInquiryEmail} placeholder={user?.email || "email@example.com"} keyboardType="email-address" />
            <Text style={styles.modalSectionTitle}>{t("services.message")} *</Text>
            <TextInput style={[styles.input, styles.textArea]} value={inquiryMessage} onChangeText={setInquiryMessage} placeholder={t("services.messagePlaceholder")} multiline numberOfLines={4} />
            <Pressable style={[styles.submitButton, submittingInquiry && styles.submitButtonDisabled]} onPress={handleSendInquiry} disabled={submittingInquiry}>
              {submittingInquiry ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitButtonText}>{t("services.send")}</Text>}
            </Pressable>
            <View style={{ height: 20 }} />
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  flex1: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.backgroundPage },
  content: { paddingBottom: 60 },
  errorText: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary, marginTop: SPACING.compact, marginBottom: SPACING.section },
  backButton: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: BORDER_RADIUS.md },
  backButtonText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "700" },
  infoRow: { flexDirection: "row", gap: SPACING.compact, marginTop: SPACING.small, paddingHorizontal: SPACING.page },
  description: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, lineHeight: 24 },
  businessRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.card,
    padding: SPACING.section, marginHorizontal: SPACING.page, marginTop: SPACING.small, gap: SPACING.small, ...SHADOWS.subtle,
  },
  businessRowText: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.servicesAccent, flex: 1 },
  themedAlertOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: SPACING.section },
  themedAlertContainer: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.xl, padding: SPACING.page, width: "100%", maxWidth: 320, alignItems: "center" },
  themedAlertMessage: { fontSize: FONT_SIZES.body, color: COLORS.textPrimary, textAlign: "center", marginBottom: SPACING.section, lineHeight: 22 },
  themedAlertButton: { backgroundColor: COLORS.servicesAccent, paddingHorizontal: SPACING.large, paddingVertical: SPACING.compact, borderRadius: BORDER_RADIUS.md, width: "100%", alignItems: "center" },
  themedAlertButtonText: { color: "#fff", fontSize: FONT_SIZES.body, fontWeight: "600" },
  skeletonHero: { width: "100%", height: 220, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.borderGray, marginBottom: SPACING.compact },
  skeletonBlock: { marginBottom: SPACING.compact },
  skeletonLine: { height: 20, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.borderGray, marginBottom: SPACING.small },
  skeletonRow: { flexDirection: "row", gap: SPACING.small },
  skeletonCard: { flex: 1, height: 100, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.borderGray },
  bookingContainer: { flex: 1, backgroundColor: "#fff" },
  bookingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.std, paddingVertical: SPACING.compact, borderBottomWidth: 1, borderBottomColor: COLORS.borderGray },
  bookingTitle: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: COLORS.servicesAccent },
  bookingForm: { flex: 1, paddingHorizontal: SPACING.std },
  bookingServiceName: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: COLORS.textPrimary, marginTop: SPACING.compact },
  bookingServicePrice: { fontSize: FONT_SIZES.body, color: COLORS.textSecondary, marginBottom: SPACING.std },
  modalSectionTitle: { fontSize: FONT_SIZES.small, fontWeight: "600", color: COLORS.textDark, marginBottom: SPACING.small, marginTop: SPACING.std },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: SPACING.std, marginBottom: SPACING.small },
  calendarToggleBtn: { padding: 6, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.servicesAccent + "10" },
  calendarWrapper: { borderRadius: BORDER_RADIUS.md, overflow: "hidden", marginBottom: SPACING.std, borderWidth: 1, borderColor: COLORS.borderGray },
  dateRow: { flexGrow: 0, marginBottom: SPACING.std },
  dateChip: { width: 56, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.borderGray, alignItems: "center", marginRight: SPACING.small, backgroundColor: "#fff" },
  dateChipSelected: { backgroundColor: COLORS.servicesAccent, borderColor: COLORS.servicesAccent },
  dateChipDay: { fontSize: 11, color: COLORS.textSecondary },
  dateChipDaySelected: { color: "#fff" },
  dateChipNum: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: COLORS.textPrimary },
  dateChipNumSelected: { color: "#fff" },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginBottom: SPACING.std },
  slotChip: { paddingHorizontal: SPACING.compact, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.section, borderWidth: 1, borderColor: COLORS.borderGray, backgroundColor: "#fff" },
  slotChipSelected: { backgroundColor: COLORS.servicesAccent, borderColor: COLORS.servicesAccent },
  slotChipFull: { opacity: 0.4, borderColor: COLORS.danger },
  slotChipText: { fontSize: FONT_SIZES.small, color: COLORS.textDark },
  slotChipTextSelected: { color: "#fff" },
  slotChipTextFull: { textDecorationLine: "line-through" },
  input: { borderWidth: 1, borderColor: COLORS.borderGray, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 14, paddingVertical: SPACING.compact, fontSize: FONT_SIZES.body, color: COLORS.textPrimary, marginBottom: SPACING.compact },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  guestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: SPACING.small },
  stepper: { flexDirection: "row", alignItems: "center", gap: SPACING.compact },
  stepperBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.borderGray, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: COLORS.textPrimary, minWidth: 30, textAlign: "center" },
  submitButton: { backgroundColor: COLORS.servicesAccent, borderRadius: BORDER_RADIUS.md, paddingVertical: SPACING.std, alignItems: "center", marginTop: SPACING.std },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: FONT_SIZES.body, fontWeight: "700", color: "#fff" },
});

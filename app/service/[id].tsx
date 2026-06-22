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
import { useAuth } from "../../context/AuthContext";
import { getServiceDetail, getSlots, createBooking, getAvailability, sendServiceInquiry } from "../../lib/api/services";
import { toggleSaved, checkSaved } from "../../lib/api/saved";
import { Service, TimeSlot } from "../../lib/api/core";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, CATEGORY_SERVICE_TYPES, getServiceTypeConfig, getBookingMode, BookingMode } from "../../lib/designTokens";
import { FIELD_REGISTRY, LEASE_DURATION_LABELS, DIETARY_LABELS } from "../../lib/fieldRegistry";
import { formatPrice, formatDuration } from "../../lib/serviceFormat";
import BusinessMap from "../../components/BusinessMap";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";

export default function ServiceDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const router = useRouter();
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [businessName, setBusinessName] = useState<string>("");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);
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

  useEffect(() => {
    loadService();
  }, [id]);

  const loadService = async () => {
    if (!id) return;
    try {
      const data = await getServiceDetail(id);
      setService(data);
      if (sessionToken) {
        try {
          const { is_saved } = await checkSaved(sessionToken, "service", id);
          setIsSaved(is_saved);
        } catch {}
      }
    } catch (error) {
      console.log("Failed to load service:", error);
    } finally {
      setLoading(false);
    }
  };

  const requiresSlots = useMemo(() => {
    if (!service) return true;
    const rootCat = service.root_category || "";
    const types = CATEGORY_SERVICE_TYPES[rootCat] || [];
    const typeDef = types.find((ct) => ct.type === service.type);
    return typeDef?.requiresSlots ?? true;
  }, [service]);

  const requiresBooking = useMemo(() => {
    if (!service) return true;
    const rootCat = service.root_category || "";
    const types = CATEGORY_SERVICE_TYPES[rootCat] || [];
    const typeDef = types.find((ct) => ct.type === service.type);
    return typeDef?.requiresBooking ?? true;
  }, [service]);

  const bookingMode = useMemo<BookingMode>(() => {
    if (!service) return "browse_only";
    const config = getServiceTypeConfig(service.root_category || "", service.type || "");
    return config ? getBookingMode(config) : (requiresBooking ? "booking_slots" : "browse_only");
  }, [service, requiresBooking]);

  const dates = useMemo(() => {
    const result: string[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      result.push(d.toISOString().split("T")[0]);
    }
    return result;
  }, []);

  const calendarMarkedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    if (selectedDate) {
      marks[selectedDate] = { selected: true, selectedColor: COLORS.primary, selectedTextColor: "#fff" };
    }
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      if (ds === selectedDate) continue;
      const dow = d.getDay();
      const hasSlot = slots.some((s) => s.date === ds || (s.is_recurring && s.day_of_week === dow));
      if (hasSlot) {
        marks[ds] = { ...marks[ds], marked: true, dotColor: COLORS.success };
      }
    }
    return marks;
  }, [slots, selectedDate]);

  useEffect(() => {
    if (!service || !selectedDate) return;
    if (!requiresSlots) return;
    Promise.all([
      getSlots(service.service_id),
      getAvailability(service.service_id, selectedDate).catch(() => []),
    ]).then(([slotData, availData]) => {
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
    }).catch(() => { setSlots([]); setAvailabilities({}); });
  }, [service, selectedDate]);

  const handleToggleSave = async () => {
    if (!sessionToken || !service) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "service", service.service_id);
      setIsSaved(is_saved);
    } catch (e) {
      console.error("Failed to toggle save:", e);
    } finally {
      setSavingItem(false);
    }
  };

  const handleRequestBooking = async () => {
    if (!sessionToken || !service) {
      Alert.alert(t("common.error", "Error"), t("services.loginRequired", "Please log in to book"));
      return;
    }
    if (!selectedDate) {
      Alert.alert(t("common.error", "Error"), t("services.selectDate", "Please select a date"));
      return;
    }
    if (requiresSlots && !selectedSlot) {
      Alert.alert(t("common.error", "Error"), t("services.selectTime", "Please select a time"));
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        service_id: service.service_id,
        date: selectedDate,
        client_name: bookingName.trim() || user?.name || "",
        client_email: bookingEmail.trim() || user?.email || "",
        guests: parseInt(bookingGuests, 10) || 1,
        notes: bookingNotes.trim() || undefined,
      };
      if (selectedSlot) payload.slot_id = selectedSlot.slot_id;
      await createBooking(sessionToken, payload);
      Alert.alert(t("services.bookingSent", "Request Sent"), t("services.bookingSentMsg", "Your booking request has been sent. The business will confirm your appointment."));
      setShowBooking(false);
      setSelectedSlot(null);
      setBookingNotes("");
    } catch (e: any) {
      Alert.alert(t("common.error", "Error"), e.message || t("services.bookingFailed", "Failed to send booking request"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendInquiry = async () => {
    if (!sessionToken || !service) {
      Alert.alert(t("common.error", "Error"), t("services.loginRequired", "Please log in to send a message"));
      return;
    }
    if (!inquiryName.trim() || !inquiryMessage.trim()) {
      Alert.alert(t("common.error", "Error"), t("services.fillRequired", "Please fill in name and message"));
      return;
    }
    setSubmittingInquiry(true);
    try {
      await sendServiceInquiry(sessionToken, service.service_id, {
        name: inquiryName.trim(),
        email: inquiryEmail.trim() || user?.email || "",
        message: inquiryMessage.trim(),
      });
      Alert.alert(t("services.inquirySent", "Message Sent"), t("services.inquirySentMsg", "Your message has been sent. The business will respond shortly."));
      setShowInquiry(false);
      setInquiryName("");
      setInquiryEmail("");
      setInquiryMessage("");
    } catch (e: any) {
      Alert.alert(t("common.error", "Error"), e.message || t("services.inquiryFailed", "Failed to send message"));
    } finally {
      setSubmittingInquiry(false);
    }
  };

  const openMap = () => {
    if (service?.latitude != null && service?.longitude != null) {
      Linking.openURL(`https://maps.google.com/maps?q=${service.latitude},${service.longitude}`);
    } else if (service?.address) {
      Linking.openURL(`https://maps.google.com/maps?q=${encodeURIComponent(service.address)}`);
    }
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(":");
    return `${h}:${m}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  };

  const rootCategory = service?.root_category || "";
  const isRental = rootCategory === "rentals" || rootCategory === "rental-real-estate";

  const getTypeIcon = (type: string) => {
    const types = CATEGORY_SERVICE_TYPES[rootCategory] || [];
    const found = types.find((ct) => ct.type === type);
    if (found) return found.icon;
    return "grid";
  };

  const getTypeLabel = (type: string) => {
    const types = CATEGORY_SERVICE_TYPES[rootCategory] || [];
    const found = types.find((ct) => ct.type === type);
    if (found) return found.label;
    return type.replace(/_/g, " ");
  };

  const getFieldsForType = (): string[] => {
    const types = CATEGORY_SERVICE_TYPES[rootCategory] || [];
    const match = types.find((ct) => ct.type === service?.type);
    return match?.fields || [];
  };

  const serviceField = (name: string): any => (service as any)?.[name];

  const hasDetailValue = (name: string): boolean => {
    const val = serviceField(name);
    if (val === null || val === undefined) return false;
    if (typeof val === "string" && val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  };

  const getFieldIcon = (fieldName: string): string => {
    const icons: Record<string, string> = {
      instructor: "person-outline",
      specialist_name: "person",
      difficulty_level: "options",
      session_type: "calendar",
      treatment_type: "medkit",
      service_category: "cut",
      consultation_type: "briefcase",
      meeting_type: "videocam",
      menu_category: "list",
      calories: "flame",
      spice_level: "thermometer",
      make: "car-sport",
      model: "car-sport",
      year: "calendar",
      mileage_km: "speedometer",
      fuel_type: "water",
      transmission: "settings",
      brand: "pricetag",
      stock_status: "checkmark-circle",
      condition: "reload",
      max_guests: "people",
      capacity: "people-outline",
      duration_minutes: "time-outline",
      bedrooms: "bed-outline",
      bathrooms: "water-outline",
      size_sqm: "resize-outline",
      property_type: "home-outline",
      floor: "layers-outline",
      deposit: "wallet-outline",
      available_from: "calendar-outline",
      lease_duration: "time-outline",
      furnished: "home-outline",
      dietary_tags: "leaf",
      allergens: "warning",
      facilities: "star-outline",
      pet_name: "paw",
      pet_type: "paw",
      pickup_location: "location",
      dropoff_location: "location",
      reason_for_visit: "document-text",
      insurance_info: "shield",
      includes: "list",
      sessions_count: "layers",
      duration_days: "calendar",
      duration_months: "calendar",
      duration_per_session: "timer",
      visits_included: "footsteps",
      valid_days: "calendar",
      included_services: "grid",
      special_requests: "star",
    };
    return icons[fieldName] || "information-circle";
  };

  const excludedFromDetailCards = ["duration_minutes", "capacity", "bedrooms", "bathrooms", "size_sqm", "property_type", "floor", "deposit", "available_from", "lease_duration", "furnished", "address", "facilities"];

  const renderDetailFields = () => {
    if (!service) return null;
    const infoCards: React.ReactNode[] = [];
    const chipCards: React.ReactNode[] = [];
    const allFields = getFieldsForType();

    for (const fieldName of allFields) {
      if (!hasDetailValue(fieldName)) continue;
      if (excludedFromDetailCards.includes(fieldName)) continue;

      const config = FIELD_REGISTRY[fieldName];
      if (!config) continue;
      const value = serviceField(fieldName);
      const label = t(config.labelKey, config.labelKey);
      const icon = getFieldIcon(fieldName);

      if (config.component === "chips-multi") {
        const arr = Array.isArray(value) ? value : [];
        if (arr.length === 0) continue;
        chipCards.push(
          <View key={fieldName} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name={icon as any} size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{label}</Text>
            </View>
            <View style={styles.chipRow}>
              {arr.map((item: string) => (
                <View key={item} style={styles.facilityChip}>
                  <Text style={styles.facilityChipText}>
                    {fieldName === "dietary_tags" ? (DIETARY_LABELS[item] || item) : item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        );
        continue;
      }

      let displayValue: string | number = typeof value === "string" ? value : String(value);
      if (config.displayFormat === "duration") {
        displayValue = formatDuration(Number(value));
      } else if (fieldName === "mileage_km") {
        displayValue = Number(value).toLocaleString() + " km";
      } else if (fieldName === "spice_level") {
        displayValue = String(value) + "/5";
      } else if (fieldName === "capacity" || fieldName === "max_guests") {
        displayValue = "Up to " + value;
      } else if (fieldName === "stock_status") {
        displayValue = String(value).replace(/_/g, " ");
      }

      infoCards.push(
        <View key={fieldName} style={styles.infoCard}>
          <View style={styles.infoIconContainer}>
            <Ionicons name={icon as any} size={18} color="#fff" />
          </View>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{displayValue}</Text>
        </View>
      );
    }

    if (infoCards.length === 0 && chipCards.length === 0) return null;

    return (
      <>
        {infoCards.length > 0 && <View style={styles.infoRow}>{infoCards}</View>}
        {chipCards}
      </>
    );
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
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          <Text style={styles.backText}>{t("common.back", "Back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const coverImage = service.cover_image_url || service.image_urls?.[0];
  const galleryImages = service.gallery_images?.length > 0 ? service.gallery_images : service.image_urls?.slice(1) || [];

  const buildGalleryItems = (): MediaItem[] => {
    const items: MediaItem[] = [];
    galleryImages.forEach(u => items.push({ type: "image", uri: u }));
    (service.gallery_videos || []).forEach(u => items.push({ type: "video", uri: u }));
    return items;
  };

  const openGallery = (index: number) => {
    setMediaViewerItems(buildGalleryItems());
    setMediaViewerIndex(index);
    setMediaViewerVisible(true);
  };

  const allGalleryItems: { uri: string; isVideo: boolean }[] = [];
  galleryImages.forEach(u => allGalleryItems.push({ uri: u, isVideo: false }));
  (service.gallery_videos || []).forEach(u => allGalleryItems.push({ uri: u, isVideo: true }));

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          <Text style={styles.backText}>{t("common.back", "Back")}</Text>
        </Pressable>

        {/* Hero */}
        <View style={styles.heroContainer}>
          {coverImage ? (
            <Image source={{ uri: coverImage }} style={styles.heroMedia} resizeMode="cover" />
          ) : (
            <View style={styles.heroPlaceholder}>
              <View style={styles.heroIconContainer}>
                <Ionicons name={getTypeIcon(service.type) as any} size={32} color="#fff" />
              </View>
            </View>
          )}
          <View style={styles.badgeRow}>
            <View style={styles.typeBadge}>
              <Ionicons name={getTypeIcon(service.type) as any} size={14} color="#fff" />
              <Text style={styles.badgeText}>{getTypeLabel(service.type)}</Text>
            </View>
            {service.price && (
              <View style={styles.priceBadge}>
                <Ionicons name="cash" size={12} color="#fff" />
                <Text style={styles.badgeText}>{formatPrice(service.price)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Title + Business */}
        <View style={styles.header}>
          <Text style={styles.title}>{service.name}</Text>
          {service.description && <Text style={styles.description}>{service.description}</Text>}
          {service.business_id && (
            <Pressable style={styles.businessRow} onPress={() => router.push(`/business/${service.business_id}` as any)}>
              <View style={styles.businessLogoPlaceholder}>
                <Ionicons name="business" size={16} color="#6b7280" />
              </View>
              <Text style={styles.businessName}>{t("services.viewBusiness", "View Business")}</Text>
              <Ionicons name="chevron-forward" size={16} color="#6b7280" />
            </Pressable>
          )}
        </View>

        {/* Info Cards */}
        <View style={styles.infoRow}>
          {getFieldsForType().filter((f) => ["duration_minutes", "capacity", "bedrooms", "bathrooms", "size_sqm"].includes(f)).map((fieldName) => {
            if (!hasDetailValue(fieldName)) return null;
            const config = FIELD_REGISTRY[fieldName];
            if (!config) return null;
            const value = serviceField(fieldName);
            let displayValue: string = config.displayFormat === "duration" ? formatDuration(Number(value)) : String(value);
            if (fieldName === "size_sqm") displayValue = String(value) + " m²";
            const label = t(config.labelKey, config.labelKey);
            return (
              <View key={fieldName} style={styles.infoCard}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name={getFieldIcon(fieldName) as any} size={18} color="#fff" />
                </View>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{displayValue}</Text>
              </View>
            );
          })}
        </View>

        {renderDetailFields()}

        {/* Rental-specific cards */}
        {isRental && getFieldsForType().filter((f) => ["property_type", "floor", "max_guests", "deposit", "available_from", "lease_duration", "furnished"].includes(f)).map((fieldName) => {
          if (!hasDetailValue(fieldName)) return null;
          const config = FIELD_REGISTRY[fieldName];
          if (!config) return null;
          const value = serviceField(fieldName);
          let displayValue = String(value);
          if (fieldName === "available_from") displayValue = String(value).split("-").reverse().join(".");
          if (fieldName === "lease_duration") displayValue = LEASE_DURATION_LABELS[String(value)] || String(value).replace(/_/g, " ");
          if (fieldName === "furnished") displayValue = "✓";
          const label = t(config.labelKey, config.labelKey);
          return (
            <View key={fieldName} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name={getFieldIcon(fieldName) as any} size={18} color={COLORS.primary} />
                <Text style={styles.cardTitle}>{label}</Text>
              </View>
              <Text style={styles.cardValue}>{displayValue}</Text>
            </View>
          );
        })}

        {/* Address + Map */}
        {service.address && (
          <Pressable style={styles.card} onPress={openMap}>
            <View style={styles.cardHeader}>
              <Ionicons name="location" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("services.address", "Address")}</Text>
            </View>
            <Text style={styles.cardValue}>{service.address}</Text>
          </Pressable>
        )}
        {service.latitude != null && service.longitude != null && (
          <View style={styles.miniMapContainer}>
            <BusinessMap
              location={{ latitude: service.latitude, longitude: service.longitude }}
              markers={[{
                id: service.service_id,
                latitude: service.latitude,
                longitude: service.longitude,
                title: service.name,
                type: "business",
              }]}
            />
          </View>
        )}

        {/* Facilities */}
        {service.facilities && service.facilities.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="star-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("services.facilities", "Facilities")}</Text>
            </View>
            <View style={styles.chipRow}>
              {service.facilities.map((f) => (
                <View key={f} style={styles.facilityChip}>
                  <Text style={styles.facilityChipText}>{f.charAt(0).toUpperCase() + f.slice(1).replace(/-/g, " ")}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Gallery */}
        {allGalleryItems.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="images-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("rentals.gallery", "Gallery")}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {allGalleryItems.map((item, idx) => (
                <Pressable key={idx} onPress={() => openGallery(idx)}>
                  {item.isVideo ? (
                    <View style={[styles.galleryImage, styles.galleryVideoPlaceholder]}>
                      <Ionicons name="play-circle" size={48} color="#fff" />
                    </View>
                  ) : (
                    <Image source={{ uri: item.uri }} style={styles.galleryImage} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Sticky Bottom Bar */}
      <View style={styles.stickyBottom}>
        {bookingMode === "booking_slots" && (
          <Pressable style={styles.bookButton} onPress={() => { setShowBooking(true); setBookingName(user?.name || ""); setBookingEmail(user?.email || ""); }}>
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <Text style={styles.bookButtonText}>{t("services.bookNow", "Book Now")}</Text>
          </Pressable>
        )}
        {bookingMode === "booking_request" && (
          <Pressable style={styles.bookButton} onPress={() => { setShowBooking(true); setBookingName(user?.name || ""); setBookingEmail(user?.email || ""); }}>
            <Ionicons name="calendar-outline" size={20} color="#fff" />
            <Text style={styles.bookButtonText}>{t("services.requestBooking", "Request Booking")}</Text>
          </Pressable>
        )}
        {bookingMode === "browse_only" && (
          <Pressable style={styles.messageButton} onPress={() => { setShowInquiry(true); setInquiryName(user?.name || ""); setInquiryEmail(user?.email || ""); }}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.primary} />
            <Text style={styles.messageButtonText}>{t("services.askAbout", "Ask about this")}</Text>
          </Pressable>
        )}
        {bookingMode !== "browse_only" && (
          <Pressable style={styles.messageButton} onPress={() => { setShowInquiry(true); setInquiryName(user?.name || ""); setInquiryEmail(user?.email || ""); }}>
            <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
            <Text style={styles.messageButtonText}>{t("services.sendMessage", "Send Message")}</Text>
          </Pressable>
        )}
        <View style={styles.actionRow}>
          <Pressable style={styles.saveButton} onPress={handleToggleSave} disabled={savingItem}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={22} color={isSaved ? COLORS.gold : COLORS.primary} />
            <Text style={[styles.saveButtonText, isSaved && { color: COLORS.gold }]}>{isSaved ? t("common.saved") : t("common.save")}</Text>
          </Pressable>
          <Pressable style={styles.shareButton} onPress={async () => {
            const message = `${service.name} — ${formatPrice(service.price)} on Perix`;
            await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
          }}>
            <Ionicons name="share-outline" size={22} color={COLORS.primary} />
            <Text style={styles.shareButtonText}>{t("common.share")}</Text>
          </Pressable>
        </View>
      </View>

      <LazyMediaViewer
        visible={mediaViewerVisible}
        media={mediaViewerItems}
        initialIndex={mediaViewerIndex}
        onClose={() => setMediaViewerVisible(false)}
      />

      {/* Booking Modal */}
      <Modal visible={showBooking} animationType="slide" onRequestClose={() => { setShowBooking(false); setSelectedSlot(null); setBookingNotes(""); setShowCalendarView(false); }}>
        <SafeAreaView style={styles.bookingContainer} edges={["top", "bottom"]}>
          <View style={styles.bookingHeader}>
            <Pressable onPress={() => { setShowBooking(false); setSelectedSlot(null); setBookingNotes(""); setShowCalendarView(false); }}><Ionicons name="close" size={24} color={COLORS.primary} /></Pressable>
            <Text style={styles.bookingTitle}>{t("services.requestBooking", "Request Booking")}</Text>
            <View style={{ width: 24 }} />
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView style={styles.bookingForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.bookingServiceName}>{service.name}</Text>
            {service.price && <Text style={styles.bookingServicePrice}>{formatPrice(service.price)}</Text>}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{t("services.selectDate", "Select Date")}</Text>
              <Pressable onPress={() => setShowCalendarView(!showCalendarView)} style={styles.calendarToggleBtn}>
                <Ionicons name={showCalendarView ? "list" : "calendar"} size={18} color={COLORS.primary} />
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
                  theme={{
                    backgroundColor: "#fff",
                    calendarBackground: "#fff",
                    textSectionTitleColor: "#6b7280",
                    selectedDayBackgroundColor: COLORS.primary,
                    selectedDayTextColor: "#fff",
                    todayTextColor: COLORS.primary,
                    dayTextColor: "#374151",
                    textDisabledColor: "#d1d5db",
                    arrowColor: COLORS.primary,
                    monthTextColor: COLORS.textPrimary,
                    textDayFontWeight: "500",
                    textMonthFontWeight: "700",
                    textDayFontSize: 14,
                  }}
                />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}>
                {dates.map((d) => {
                  const isSelected = selectedDate === d;
                  const dateObj = new Date(d + "T00:00:00");
                  const dayNum = dateObj.getDate();
                  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dateObj.getDay()];
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
                <Text style={styles.sectionTitle}>{t("services.selectTime", "Select Time")}</Text>
                <View style={styles.slotsGrid}>
                  {slots.map((slot) => {
                    const avail = availabilities[slot.slot_id];
                    const isFull = avail?.is_full ?? false;
                    const spotsText = avail != null ? ` • ${avail.available_spots}/${avail.capacity}` : "";
                    return (
                      <Pressable
                        key={slot.slot_id}
                        style={[styles.slotChip, selectedSlot?.slot_id === slot.slot_id && styles.slotChipSelected, isFull && styles.slotChipFull]}
                        onPress={() => !isFull && setSelectedSlot(slot)}
                      >
                        <Text style={[styles.slotChipText, selectedSlot?.slot_id === slot.slot_id && styles.slotChipTextSelected, isFull && styles.slotChipTextFull]}>
                          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}{spotsText}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {selectedDate && !requiresSlots && (
              <>
                <Text style={styles.sectionTitle}>Preferred time (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Morning, 10:00–12:00"
                  value={bookingNotes}
                  onChangeText={setBookingNotes}
                />
              </>
            )}

            <Text style={styles.sectionTitle}>{t("services.yourName", "Your Name")}</Text>
            <TextInput style={styles.input} value={bookingName} onChangeText={setBookingName} placeholder={user?.name || "Name"} />

            <Text style={styles.sectionTitle}>{t("services.yourEmail", "Email")}</Text>
            <TextInput style={styles.input} value={bookingEmail} onChangeText={setBookingEmail} placeholder={user?.email || "email@example.com"} keyboardType="email-address" />

            <View style={styles.guestRow}>
              <Text style={styles.sectionTitle}>{t("services.guests", "Guests")}</Text>
              <View style={styles.stepper}>
                <Pressable style={styles.stepperBtn} onPress={() => setBookingGuests(String(Math.max(1, parseInt(bookingGuests, 10) - 1)))}><Ionicons name="remove" size={18} color={COLORS.primary} /></Pressable>
                <Text style={styles.stepperValue}>{bookingGuests}</Text>
                <Pressable style={styles.stepperBtn} onPress={() => setBookingGuests(String(parseInt(bookingGuests, 10) + 1))}><Ionicons name="add" size={18} color={COLORS.primary} /></Pressable>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{t("services.notes", "Notes")}</Text>
            <TextInput style={[styles.input, styles.textArea]} value={bookingNotes} onChangeText={setBookingNotes} placeholder={t("services.notesPlaceholder", "Any special requests...")} multiline numberOfLines={3} />

            <Pressable style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleRequestBooking} disabled={submitting}>
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitButtonText}>{t("services.sendRequest", "Send Request")}</Text>}
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
            <Pressable onPress={() => { setShowInquiry(false); setInquiryName(""); setInquiryEmail(""); setInquiryMessage(""); }}><Ionicons name="close" size={24} color={COLORS.primary} /></Pressable>
            <Text style={styles.bookingTitle}>{t("services.sendMessage", "Send Message")}</Text>
            <View style={{ width: 24 }} />
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView style={styles.bookingForm} keyboardShouldPersistTaps="handled">
            <Text style={styles.bookingServiceName}>{service.name}</Text>
            {service.price && <Text style={styles.bookingServicePrice}>{formatPrice(service.price)}</Text>}

            <Text style={styles.sectionTitle}>{t("services.yourName", "Your Name")} *</Text>
            <TextInput style={styles.input} value={inquiryName} onChangeText={setInquiryName} placeholder={user?.name || "Name"} />

            <Text style={styles.sectionTitle}>{t("services.yourEmail", "Email")}</Text>
            <TextInput style={styles.input} value={inquiryEmail} onChangeText={setInquiryEmail} placeholder={user?.email || "email@example.com"} keyboardType="email-address" />

            <Text style={styles.sectionTitle}>{t("services.message", "Message")} *</Text>
            <TextInput style={[styles.input, styles.textArea]} value={inquiryMessage} onChangeText={setInquiryMessage} placeholder={t("services.messagePlaceholder", "Write your message...")} multiline numberOfLines={4} />

            <Pressable style={[styles.submitButton, submittingInquiry && styles.submitButtonDisabled]} onPress={handleSendInquiry} disabled={submittingInquiry}>
              {submittingInquiry ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitButtonText}>{t("services.send", "Send")}</Text>}
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
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.backgroundPage },
  content: { padding: SPACING.lg, paddingBottom: 40 },
  backButton: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  backText: { fontSize: FONT_SIZES.body, color: COLORS.primary, marginLeft: 4 },
  errorText: { fontSize: FONT_SIZES.h3, color: COLORS.textMuted, marginBottom: SPACING.md },
  heroContainer: { borderRadius: BORDER_RADIUS.xl, overflow: "hidden", marginBottom: SPACING.lg },
  heroMedia: { width: "100%", height: 220, resizeMode: "cover" },
  heroPlaceholder: { width: "100%", height: 220, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  heroIconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: -32, paddingHorizontal: 12 },
  typeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, gap: 4 },
  priceBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#b45309", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, gap: 4 },
  badgeText: { fontSize: 12, color: "#fff", fontWeight: "600" },
  header: { marginBottom: SPACING.lg },
  title: { fontSize: FONT_SIZES.h1, fontWeight: "700", color: COLORS.primary, marginBottom: SPACING.xs },
  description: { fontSize: FONT_SIZES.body, color: "#374151", lineHeight: 22, marginTop: SPACING.xs },
  businessRow: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.xs, gap: 8 },
  businessLogoPlaceholder: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  businessName: { fontSize: FONT_SIZES.body, color: "#6b7280", flex: 1 },
  infoRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.lg, flexWrap: "wrap" },
  infoCard: { flex: 1, minWidth: "40%", backgroundColor: "#fff", borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, alignItems: "center" },
  infoIconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: SPACING.xs },
  infoLabel: { fontSize: FONT_SIZES.small, color: "#6b7280", marginBottom: 2 },
  infoValue: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
  card: { backgroundColor: "#fff", borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: SPACING.xs },
  cardTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
  cardValue: { fontSize: FONT_SIZES.body, color: "#374151" },
  miniMapContainer: { height: 150, borderRadius: BORDER_RADIUS.lg, overflow: "hidden", marginBottom: SPACING.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  facilityChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#f9fafb" },
  facilityChipText: { fontSize: 13, color: "#374151" },
  galleryImage: { width: 140, height: 100, borderRadius: BORDER_RADIUS.md, marginRight: SPACING.sm },
  galleryVideoPlaceholder: { backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" },
  stickyBottom: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.lg, borderTopWidth: 1, borderTopColor: "#e5e7eb", backgroundColor: "#fff" },
  bookButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, marginBottom: SPACING.sm, gap: 8 },
  bookButtonText: { fontSize: FONT_SIZES.h3, fontWeight: "700", color: "#fff" },
  messageButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, marginBottom: SPACING.sm, gap: 8 },
  messageButtonText: { fontSize: FONT_SIZES.h3, fontWeight: "600", color: COLORS.primary },
  actionRow: { flexDirection: "row", gap: SPACING.md },
  skeletonHero: { width: "100%", height: 220, borderRadius: BORDER_RADIUS.xl, backgroundColor: "#e5e7eb", marginBottom: SPACING.lg },
  skeletonBlock: { marginBottom: SPACING.lg },
  skeletonLine: { height: 20, borderRadius: 8, backgroundColor: "#e5e7eb", marginBottom: 8 },
  skeletonRow: { flexDirection: "row", gap: SPACING.md },
  skeletonCard: { flex: 1, height: 100, borderRadius: BORDER_RADIUS.lg, backgroundColor: "#e5e7eb" },
  saveButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border || "#e5e7eb", borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, gap: 8 },
  saveButtonText: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
  shareButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: COLORS.border || "#e5e7eb", borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md, gap: 8 },
  shareButtonText: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
  // Booking Modal
  bookingContainer: { flex: 1, backgroundColor: "#fff" },
  bookingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  bookingTitle: { fontSize: 18, fontWeight: "700", color: COLORS.primary },
  bookingForm: { flex: 1, paddingHorizontal: 16 },
  bookingServiceName: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginTop: 12 },
  bookingServicePrice: { fontSize: 16, color: COLORS.textMuted, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8, marginTop: 16 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 8 },
  calendarToggleBtn: { padding: 6, borderRadius: 8, backgroundColor: COLORS.primary + "10" },
  calendarWrapper: { borderRadius: 12, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: "#e5e7eb" },
  dateRow: { flexGrow: 0, marginBottom: 16 },
  dateChip: { width: 56, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", marginRight: 8, backgroundColor: "#fff" },
  dateChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  dateChipDay: { fontSize: 11, color: "#6b7280" },
  dateChipDaySelected: { color: "#fff" },
  dateChipNum: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  dateChipNumSelected: { color: "#fff" },
  slotsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  slotChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  slotChipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  slotChipFull: { opacity: 0.4, borderColor: COLORS.danger },
  slotChipText: { fontSize: 13, color: "#374151" },
  slotChipTextSelected: { color: "#fff" },
  slotChipTextFull: { textDecorationLine: "line-through" },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary, marginBottom: 12 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  guestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepperBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, minWidth: 30, textAlign: "center" },
  submitButton: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 16, alignItems: "center", marginTop: 16 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});

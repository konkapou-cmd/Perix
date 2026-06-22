import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { COLORS, BORDER_RADIUS, CATEGORY_SERVICE_TYPES } from "../../lib/designTokens";
import { FIELD_REGISTRY, LEASE_DURATION_LABELS } from "../../lib/fieldRegistry";
import type { Dispatch, SetStateAction } from "react";
import { useState, useEffect } from "react";
import { CalendarList } from "react-native-calendars";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";

const SERVICE_TYPES = [
  { key: "gym_class", icon: "fitness", labelKey: "services.typeGymClass" },
  { key: "gym_session", icon: "fitness", labelKey: "services.typeGymSession" },
  { key: "gym_membership", icon: "card", labelKey: "services.typeGymMembership" },
  { key: "gym_pass", icon: "ticket", labelKey: "services.typeGymPass" },
  { key: "gym_recovery", icon: "medkit", labelKey: "services.typeGymRecovery" },
  { key: "salon_appointment", icon: "calendar", labelKey: "services.typeSalonAppointment" },
  { key: "salon_package", icon: "gift", labelKey: "services.typeSalonPackage" },
  { key: "salon_course", icon: "layers", labelKey: "services.typeSalonCourse" },
  { key: "pro_consultation", icon: "briefcase", labelKey: "services.typeProConsultation" },
  { key: "pro_package", icon: "gift", labelKey: "services.typeProPackage" },
  { key: "pro_retainer", icon: "refresh", labelKey: "services.typeProRetainer" },
  { key: "edu_class", icon: "school", labelKey: "services.typeEduClass" },
  { key: "edu_lesson", icon: "book", labelKey: "services.typeEduLesson" },
  { key: "edu_workshop", icon: "people", labelKey: "services.typeEduWorkshop" },
  { key: "edu_course", icon: "layers", labelKey: "services.typeEduCourse" },
  { key: "menu_item", icon: "restaurant", labelKey: "services.typeMenuItem" },
  { key: "rental_property", icon: "home", labelKey: "services.typeRentalProperty" },

  { key: "table_reservation", icon: "table", labelKey: "services.typeTableReservation" },
  { key: "vip_package", icon: "star", labelKey: "services.typeVipPackage" },
  { key: "ent_booking", icon: "calendar", labelKey: "services.typeEntBooking" },
  { key: "ent_performance", icon: "musical-notes", labelKey: "services.typeEntPerformance" },
  { key: "retail_product", icon: "pricetag", labelKey: "services.typeRetailProduct" },
  { key: "retail_custom", icon: "create", labelKey: "services.typeRetailCustom" },
  { key: "tailoring_alteration", icon: "cut", labelKey: "services.typeTailoring" },
  { key: "custom_order", icon: "create", labelKey: "services.typeCustomOrder" },
  { key: "auto_vehicle", icon: "car", labelKey: "services.typeAutoVehicle" },
  { key: "auto_rental", icon: "calendar", labelKey: "services.typeAutoRental" },
  { key: "auto_repair", icon: "wrench", labelKey: "services.typeAutoRepair" },
  { key: "auto_wash", icon: "water", labelKey: "services.typeAutoWash" },
  { key: "health_appointment", icon: "calendar", labelKey: "services.typeHealthAppointment" },
  { key: "health_procedure", icon: "medkit", labelKey: "services.typeHealthProcedure" },
  { key: "health_test", icon: "flask", labelKey: "services.typeHealthTest" },
  { key: "pet_appointment", icon: "paw", labelKey: "services.typePetAppointment" },
  { key: "pet_product", icon: "cart", labelKey: "services.typePetProduct" },
];

// Field options are now driven by FIELD_REGISTRY in lib/fieldRegistry.ts

export type ServiceForm = {
  type: string;
  name: string;
  description: string;
  price: string;
  duration_minutes: string;
  capacity: string;
  facilities: string[];
  beds: string;
  room_size: string;
  room_number: string;
  menu_category: string;
  dietary_tags: string[];
  image_urls: string[];
  cover_image_url: string;
  gallery_images: string[];
  gallery_videos: string[];
  video_url: string;
  instructor: string;
  difficulty_level: string;
  specialist_name: string;
  service_category: string;
  consultation_type: string;
  meeting_type: string;
  bedrooms: string;
  bathrooms: string;
  size_sqm: string;
  floor: string;
  furnished: boolean;
  available_from: string;
  lease_duration: string;
  max_guests: string;
  property_type: string;
  deposit: string;
  address: string;
  latitude: string;
  longitude: string;
  make: string;
  model: string;
  year: string;
  mileage_km: string;
  fuel_type: string;
  transmission: string;
  stock_status: string;
  brand: string;
  condition: string;
  treatment_type: string;
  session_type: string;
  calories: string;
  allergens: string[];
  spice_level: string;
  duration_days: string;
  duration_months: string;
  includes: string;
  visits_included: string;
  valid_days: string;
  included_services: string[];
  sessions_count: string;
  duration_per_session: string;
  special_requests: string;
  pickup_location: string;
  dropoff_location: string;
  reason_for_visit: string;
  insurance_info: string;
  pet_name: string;
  pet_type: string;
  status: "draft" | "published" | "hidden";
  sort_order: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  form: ServiceForm;
  setForm: Dispatch<SetStateAction<ServiceForm>>;
  onSave: () => void;
  isSaving?: boolean;
  rootCategory?: string;
  sessionToken?: string;
  nearLat?: number;
  nearLng?: number;
};

const DEFAULT_FORM: ServiceForm = {
  type: "",
  name: "",
  description: "",
  price: "",
  duration_minutes: "",
  capacity: "",
  facilities: [],
  beds: "",
  room_size: "",
  room_number: "",
  menu_category: "",
  dietary_tags: [],
  image_urls: [],
  cover_image_url: "",
  gallery_images: [],
  gallery_videos: [],
  video_url: "",
  instructor: "",
  difficulty_level: "",
  specialist_name: "",
  service_category: "",
  consultation_type: "",
  meeting_type: "",
  bedrooms: "",
  bathrooms: "",
  size_sqm: "",
  floor: "",
  furnished: false,
  available_from: "",
  lease_duration: "",
  max_guests: "",
  property_type: "",
  deposit: "",
  address: "",
  latitude: "",
  longitude: "",
  make: "",
  model: "",
  year: "",
  mileage_km: "",
  fuel_type: "",
  transmission: "",
  stock_status: "",
  brand: "",
  condition: "",
  treatment_type: "",
  session_type: "",
  calories: "",
  allergens: [],
  spice_level: "",
  duration_days: "",
  duration_months: "",
  includes: "",
  visits_included: "",
  valid_days: "",
  included_services: [],
  sessions_count: "",
  duration_per_session: "",
  special_requests: "",
  pickup_location: "",
  dropoff_location: "",
  reason_for_visit: "",
  insurance_info: "",
  pet_name: "",
  pet_type: "",
  status: "published",
  sort_order: "0",
};

export { DEFAULT_FORM };

function getCategoryPlaceholders(rootCategory?: string) {
  const labels: Record<string, { name: string; desc: string }> = {
    "sports-fitness-wellness": {
      name: "e.g. Yoga Flow, HIIT Circuit, Personal Training",
      desc: "Describe the class, intensity level and what attendees should bring...",
    },
    "beauty-care": {
      name: "e.g. Haircut & Styling, Manicure, Facial Treatment",
      desc: "Describe the treatment, duration and expected results...",
    },
    "professional-services": {
      name: "e.g. Legal Consultation, Tax Filing, Business Plan",
      desc: "Describe the service, what's included and expected turnaround...",
    },
    "education-creativity": {
      name: "e.g. Piano Basics, Watercolour Workshop, Coding 101",
      desc: "Describe the class, skill level required and materials needed...",
    },
    "food-dining": {
      name: "e.g. Margherita Pizza, Chef's Tasting Menu, Signature Cocktail",
      desc: "Describe the dish, key ingredients and dietary options...",
    },
    rentals: {
      name: "e.g. Cozy Studio, 2BR Apartment, Lakeside Cabin",
      desc: "Describe the property, amenities and neighborhood...",
    },
    "rental-real-estate": {
      name: "e.g. Cozy Studio, 2BR Apartment, Lakeside Cabin",
      desc: "Describe the property, amenities and neighborhood...",
    },
    "nightlife-social": {
      name: "e.g. VIP Table, Bottle Service, Guest List Entry",
      desc: "Describe the experience, what's included and any requirements...",
    },
    "entertainment-events": {
      name: "e.g. Escape Room, Comedy Show, Live Music Night",
      desc: "Describe the experience, duration and group size...",
    },
    "shopping-retail": {
      name: "e.g. Custom Suit, Handmade Bracelet, Vintage Watch",
      desc: "Describe the product, materials, sizing and available options...",
    },
    "fashion-accessories": {
      name: "e.g. Custom Suit, Tailored Dress, Leather Bag",
      desc: "Describe the product, materials, sizing and customization options...",
    },
    automotive: {
      name: "e.g. Toyota Camry 2020, BMW 3 Series, Honda Civic",
      desc: "Describe the vehicle, features, mileage and condition...",
    },
    healthcare: {
      name: "e.g. General Checkup, Dental Cleaning, Blood Test",
      desc: "Describe the procedure, preparation needed and duration...",
    },
    pets: {
      name: "e.g. Dog Grooming, Vet Checkup, Pet Boarding",
      desc: "Describe the service, duration and any requirements for your pet...",
    },
  };
  if (rootCategory && labels[rootCategory]) {
    return labels[rootCategory];
  }
  return { name: "e.g. Service Name", desc: "Describe the service..." };
}

function formToMedia(form: ServiceForm): MediaItem[] {
  const items: MediaItem[] = [];
  if (form.cover_image_url) {
    items.push({ uri: form.cover_image_url, type: "image" });
  } else if (form.video_url) {
    items.push({ uri: form.video_url, type: "video" });
  }
  form.image_urls.forEach((u) => {
    if (u !== form.cover_image_url) items.push({ uri: u, type: "image" });
  });
  if (form.video_url && items.length > 0 && items[0].uri !== form.video_url) {
    items.push({ uri: form.video_url, type: "video" });
  }
  form.gallery_images.forEach((u) => {
    if (!items.some((m) => m.uri === u)) items.push({ uri: u, type: "image" });
  });
  form.gallery_videos.forEach((u) => {
    if (!items.some((m) => m.uri === u)) items.push({ uri: u, type: "video" });
  });
  return items;
}

function mediaToForm(media: MediaItem[], base: ServiceForm): ServiceForm {
  const coverIsVideo = media.length > 0 && media[0].type === "video";
  const images = media.filter((m) => m.type === "image").map((m) => m.uri);
  const videos = media.filter((m) => m.type === "video").map((m) => m.uri);
  if (coverIsVideo) {
    return {
      ...base,
      cover_image_url: "",
      image_urls: images,
      video_url: videos[0] || "",
      gallery_images: images.slice(1),
      gallery_videos: videos.slice(1),
    };
  }
  return {
    ...base,
    cover_image_url: images[0] || "",
    image_urls: images,
    video_url: videos[0] || "",
    gallery_images: images.slice(1),
    gallery_videos: videos.slice(1),
  };
}

export default function ServiceModal({
  visible, onClose, form, setForm, onSave, isSaving, rootCategory, sessionToken, nearLat, nearLng,
}: Props) {
  const { t } = useTranslation();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [coverPhotoError, setCoverPhotoError] = useState<string | null>(null);

  const typesForCategory = rootCategory ? CATEGORY_SERVICE_TYPES[rootCategory] || [] : [];
  const allowedTypeKeys = typesForCategory.map((ct) => ct.type);
  const filteredTypes = SERVICE_TYPES.filter((st) => allowedTypeKeys.includes(st.key));

  useEffect(() => {
    if (visible && !form.type && filteredTypes.length > 0) {
      setForm((prev) => ({ ...prev, type: filteredTypes[0].key }));
    }
  }, [visible]);

  const selectedType = typesForCategory.find((ct) => ct.type === form.type);
  const selectedFields = selectedType?.fields || [];

  const isRental = rootCategory === "rentals" || rootCategory === "rental-real-estate";

  const isEditing = form.name !== "";
  const modalTitle = selectedType
    ? `${isEditing ? "Edit" : "Add"} ${selectedType.publicTabLabel || selectedType.label || "Service"}`
    : t("services.createService", "Add Service");

  const handleSaveWithValidation = () => {
    const hasCoverPhoto = !!form.cover_image_url ||
      (form.image_urls && form.image_urls.length > 0);
    if (form.status === "published" && !hasCoverPhoto) {
      setCoverPhotoError("A cover photo is required before this service can be published.");
      return;
    }
    setCoverPhotoError(null);
    onSave();
  };

  const updateField = <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayItem = (key: string, item: string) => {
    setForm((prev) => {
      const arr = (prev as any)[key] || [];
      const next = arr.includes(item) ? arr.filter((i: string) => i !== item) : [...arr, item];
      return { ...prev, [key]: next };
    });
  };

  const fieldValue = (name: string): any => (form as any)[name];

  const hasField = (name: string) => selectedFields.includes(name);

  const getPriceLabel = () => {
    if (isRental) return t("rentals.rentPrice", "Rent Price");
    return t("services.price", "Price");
  };

  const getPricePlaceholder = () => {
    if (isRental) return "€800/month";
    return "€15 / hr";
  };

  const renderFieldInput = (fieldName: string) => {
    const config = FIELD_REGISTRY[fieldName];
    if (!config) return null;

    const label = t(config.labelKey, config.labelKey);
    const value = fieldValue(fieldName);

    switch (config.component) {
      case "text":
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              placeholder={t(config.placeholderKey || "", "")}
              value={typeof value === "string" ? value : ""}
              onChangeText={(v) => updateField(fieldName as any, v as any)}
            />
          </View>
        );

      case "textarea":
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder={t(config.placeholderKey || "", "")}
              value={typeof value === "string" ? value : ""}
              onChangeText={(v) => updateField(fieldName as any, v as any)}
              multiline
              textAlignVertical="top"
            />
          </View>
        );

      case "number":
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              style={styles.input}
              placeholder={t(config.placeholderKey || "", "")}
              value={typeof value === "string" ? value : String(value || "")}
              onChangeText={(v) => updateField(fieldName as any, v as any)}
              keyboardType="numeric"
            />
          </View>
        );

      case "chips": {
        const options = config.options || [];
        const currentVal = value as string;
        if (fieldName === "lease_duration") {
          return (
            <View key={fieldName}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.chipWideRow}>
                {options.map((opt) => (
                  <Pressable
                    key={opt}
                    style={[styles.chip, currentVal === opt && styles.chipSelected]}
                    onPress={() => updateField(fieldName as any, (currentVal === opt ? "" : opt) as any)}
                  >
                    <Text style={[styles.chipText, currentVal === opt && styles.chipTextSelected]}>
                      {LEASE_DURATION_LABELS[opt] || opt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.pickerRow}>
              {options.map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.chip, currentVal === opt && styles.chipSelected]}
                  onPress={() => updateField(fieldName as any, (currentVal === opt ? "" : opt) as any)}
                >
                  <Text style={[styles.chipText, currentVal === opt && styles.chipTextSelected]}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, " ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      }

      case "chips-multi": {
        const options = config.options || [];
        const currentVals: string[] = Array.isArray(value) ? value : [];
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.chipWideRow}>
              {options.map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.chip, currentVals.includes(opt) && styles.chipSelected]}
                  onPress={() => toggleArrayItem(fieldName, opt)}
                >
                  <Text style={[styles.chipText, currentVals.includes(opt) && styles.chipTextSelected]}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1).replace(/_/g, " ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      }

      case "toggle": {
        const boolVal = typeof value === "boolean" ? value : false;
        return (
          <Pressable
            key={fieldName}
            style={[styles.toggleBtn, boolVal && styles.toggleBtnActive]}
            onPress={() => updateField(fieldName as any, !boolVal as any)}
          >
            <Ionicons
              name={boolVal ? "checkmark-circle" : "ellipse-outline"}
              size={20}
              color={boolVal ? COLORS.primary : COLORS.textMuted}
            />
            <Text style={[styles.toggleLabel, boolVal && { color: COLORS.primary }]}>{label}</Text>
          </Pressable>
        );
      }

      case "date":
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{label}</Text>
            <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
              <Text style={[styles.dateText, !(value as string) && styles.dateTextPlaceholder]}>
                {(value as string) ? (value as string).split("-").reverse().join(".") : t("services.selectDate", "DD.MM.YYYY")}
              </Text>
            </Pressable>
          </View>
        );

      case "location":
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{label}</Text>
            <PlacesAutocompleteInput
              value={(value as string) || ""}
              onChangeText={(text) => updateField(fieldName as any, text as any)}
              onSelectPlace={(address, lat, lng) => {
                updateField(fieldName as any, address as any);
                updateField("latitude" as any, String(lat) as any);
                updateField("longitude" as any, String(lng) as any);
              }}
              placeholder={t(config.placeholderKey || "services.addressPlaceholder", "Search address...")}
              nearLat={nearLat}
              nearLng={nearLng}
            />
          </View>
        );

      default:
        return null;
    }
  };

  const media = formToMedia(form);
  const handleMediaChange = (newMedia: MediaItem[]) => {
    setForm((prev) => mediaToForm(newMedia, prev));
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.modalContainer}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} style={styles.headerButton}>
              <Ionicons name="close" size={28} color={COLORS.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{modalTitle}</Text>
            <Pressable onPress={handleSaveWithValidation} disabled={isSaving} style={styles.headerButton}>
              {isSaving ? (
                <ActivityIndicator size="small" color={COLORS.primaryDark} />
              ) : (
                <Ionicons name="checkmark" size={28} color={COLORS.primaryDark} />
              )}
            </Pressable>
          </View>
          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.label}>{t("services.serviceType", "Type")} *</Text>
            <View style={styles.pickerRow}>
              {filteredTypes.map((tpe) => (
                <Pressable
                  key={tpe.key}
                  style={[styles.chip, form.type === tpe.key && styles.chipSelected]}
                  onPress={() => updateField("type", tpe.key)}
                >
                  <Ionicons name={tpe.icon as any} size={16} color={form.type === tpe.key ? "#fff" : "#374151"} />
                  <Text style={[styles.chipText, form.type === tpe.key && styles.chipTextSelected]}>
                    {t(tpe.labelKey, tpe.key)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <UnifiedMediaGallery
              media={media}
              onChange={handleMediaChange}
              sessionToken={sessionToken}
              label={t("services.images", "Photos & Videos")}
            />

            <Text style={styles.label}>{t("services.serviceName", "Name")} *</Text>
            <TextInput
              style={styles.input}
              placeholder={getCategoryPlaceholders(rootCategory).name}
              value={form.name}
              onChangeText={(v) => updateField("name", v)}
            />

            <Text style={styles.label}>{t("services.serviceDescription", "Description")}</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder={getCategoryPlaceholders(rootCategory).desc}
              value={form.description}
              onChangeText={(v) => updateField("description", v)}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>{getPriceLabel()}</Text>
            <TextInput
              style={styles.input}
              placeholder={getPricePlaceholder()}
              value={form.price}
              onChangeText={(v) => updateField("price", v)}
              keyboardType="numeric"
            />

            {selectedFields.filter((f) => f !== "address" && f !== "deposit" && f !== "price").map(renderFieldInput)}

            {hasField("address") && renderFieldInput("address")}
            {hasField("deposit") && renderFieldInput("deposit")}

            {/* Status selector */}
            {form.type && (
              <>
                <Text style={styles.label}>Status</Text>
                <View style={styles.chipRow}>
                  {(["draft", "published", "hidden"] as const).map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.chip, form.status === s && styles.chipSelected]}
                      onPress={() => updateField("status", s)}
                    >
                      <Text style={[styles.chipText, form.status === s && styles.chipTextSelected]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {coverPhotoError && (
                  <Text style={{ color: COLORS.danger, fontSize: 13, marginTop: 4 }}>{coverPhotoError}</Text>
                )}
              </>
            )}

            {/* Date picker modal */}
            <Modal visible={showDatePicker} animationType="slide" transparent>
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <Pressable onPress={() => setShowDatePicker(false)}>
                      <Text style={styles.datePickerDone}>{t("common.done", "Done")}</Text>
                    </Pressable>
                  </View>
                  <CalendarList
                    horizontal
                    pagingEnabled
                    showsVerticalScrollIndicator={false}
                    onDayPress={(day) => {
                      updateField("available_from", day.dateString);
                      setShowDatePicker(false);
                    }}
                    markedDates={form.available_from ? { [form.available_from]: { selected: true, selectedColor: COLORS.primary } } : {}}
                    theme={{
                      todayTextColor: COLORS.primary,
                      selectedDayBackgroundColor: COLORS.primary,
                      arrowColor: COLORS.primary,
                    }}
                  />
                </View>
              </View>
            </Modal>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  headerButton: { padding: 4 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  modalBody: { flex: 1, padding: 16 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.textPrimary },
  dateText: { fontSize: 16, color: COLORS.textPrimary },
  dateTextPlaceholder: { color: "#9ca3af" },
  datePickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  datePickerContainer: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" },
  datePickerHeader: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  datePickerDone: { fontSize: 16, fontWeight: "600", color: COLORS.primary },
  row: { flexDirection: "row", gap: 12 },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chipWideRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff" },
  chipSelected: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark },
  chipText: { fontSize: 14, color: "#374151" },
  chipTextSelected: { color: "#fff" },
  imagePicker: { marginTop: 4 },
  coverImage: { width: "100%", height: 180, borderRadius: 10 },
  imagePlaceholder: { width: "100%", height: 120, borderRadius: 10, borderWidth: 1, borderColor: "#e5e7eb", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { fontSize: 13, color: "#999", marginTop: 4 },
  galleryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  galleryItem: { width: 70, height: 70, position: "relative" },
  galleryImage: { width: 70, height: 70, borderRadius: 6 },
  galleryRemove: { position: "absolute", top: -6, right: -6 },
  galleryAdd: { width: 70, height: 70, borderRadius: 6, borderWidth: 1, borderColor: "#e5e7eb", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, marginTop: 8 },
  toggleBtnActive: {},
  toggleLabel: { fontSize: 15, color: COLORS.textPrimary },
});

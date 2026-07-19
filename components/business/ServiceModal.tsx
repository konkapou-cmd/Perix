import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { FIELD_REGISTRY, LEASE_DURATION_LABELS } from "../../lib/fieldRegistry";
import { getServiceFields, getRequiredServiceFields, getServiceCtaType, getServiceModuleIcon, getServiceModuleLabel, isServiceBookable, requiresServiceSlots, SERVICE_MODULES, type ServiceModuleConfig } from "../../lib/config/serviceModules";
import { getDefaultModule, getAllowedModules, getCategoryQuestions } from "../../lib/config/serviceCategoryMatrix";
import type { Dispatch, SetStateAction } from "react";
import { useState, useEffect, useRef } from "react";
import { CalendarList } from "react-native-calendars";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";
import FormScreen from "../ui/FormScreen";
import FormBottomBar from "../ui/FormBottomBar";

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
  availability_slots: { day_of_week?: number; date?: string; start_time: string; end_time: string; is_recurring: boolean }[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  form: ServiceForm;
  setForm: Dispatch<SetStateAction<ServiceForm>>;
  onSave: () => void;
  isSaving?: boolean;
  rootCategory?: string;
  subcategory?: string;
  sessionToken?: string;
  nearLat?: number;
  nearLng?: number;
  businessAddress?: string;
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
  status: "draft",
  sort_order: "0",
  availability_slots: [],
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
  const seen = new Set<string>();
  if (form.cover_image_url) {
    seen.add(form.cover_image_url);
    items.push({ uri: form.cover_image_url, type: "image", isCoverImage: true, focalPoint: (form as any).cover_focal_point ?? { x: 0.5, y: 0.5 } });
  } else if (form.video_url) {
    seen.add(form.video_url);
    items.push({ uri: form.video_url, type: "video", isCoverVideo: true, focalPoint: (form as any).cover_focal_point ?? { x: 0.5, y: 0.5 } });
  }
  form.image_urls.forEach((u) => {
    if (!seen.has(u)) { seen.add(u); items.push({ uri: u, type: "image" }); }
  });
  if (form.video_url && !seen.has(form.video_url)) {
    seen.add(form.video_url);
    items.push({ uri: form.video_url, type: "video" });
  }
  form.gallery_images.forEach((u) => {
    if (!seen.has(u)) { seen.add(u); items.push({ uri: u, type: "image" }); }
  });
  form.gallery_videos.forEach((u) => {
    if (!seen.has(u)) { seen.add(u); items.push({ uri: u, type: "video" }); }
  });
  return items;
}

function mediaToForm(media: MediaItem[], base: ServiceForm): ServiceForm {
  const coverImageItem = media.find((m) => m.isCoverImage && m.type === "image");
  const coverVideoItem = media.find((m) => m.isCoverVideo && m.type === "video");
  const coverItem = coverImageItem || coverVideoItem;
  const images = media.filter((m) => m.type === "image").map((m) => m.uri);
  const videos = media.filter((m) => m.type === "video").map((m) => m.uri);
  return {
    ...base,
    cover_image_url: coverImageItem?.uri || (coverVideoItem ? "" : images[0]) || "",
    image_urls: images,
    video_url: coverVideoItem?.uri || videos[0] || "",
    gallery_images: coverImageItem
      ? images.filter((u) => u !== coverImageItem.uri)
      : images.slice(1),
    gallery_videos: coverVideoItem
      ? videos.filter((u) => u !== coverVideoItem.uri)
      : videos.slice(1),
    cover_focal_point: coverItem?.focalPoint ?? { x: 0.5, y: 0.5 },
  } as any;
}

export default function ServiceModal({
  visible, onClose, form, setForm, onSave, isSaving, rootCategory, subcategory, sessionToken, nearLat, nearLng, businessAddress,
}: Props) {
  const { t } = useTranslation();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSlotDatePicker, setShowSlotDatePicker] = useState(false);
  const [slotDraft, setSlotDraft] = useState({ is_recurring: true, day_of_week: 1, start_time: "09:00", end_time: "10:00", date: "" as string | undefined });
  const [showSlotEditor, setShowSlotEditor] = useState(false);
  const [coverPhotoError, setCoverPhotoError] = useState<string | null>(null);

  const allowedModules = rootCategory ? getAllowedModules(rootCategory) : [];
  const filteredModules = allowedModules
    .map((key: string) => SERVICE_MODULES[key])
    .filter((m): m is ServiceModuleConfig => !!m);

  useEffect(() => {
    if (visible && !form.type && filteredModules.length > 0) {
      const defaultType = getDefaultModule(rootCategory || "");
      setForm((prev) => ({ ...prev, type: defaultType || filteredModules[0].key }));
    }
  }, [visible]);

  useEffect(() => {
    if (visible && !form.name && !form.address && businessAddress) {
      setForm((prev) => ({ ...prev, address: businessAddress }));
    }
  }, [visible]);

  const selectedFields = getServiceFields(form.type);
  const isEditing = form.name !== "";
  const isRental = rootCategory === "rentals" || rootCategory === "rental-real-estate";

  const moduleLabel = (key: string) => getServiceModuleLabel(key, (k: string, fb?: string) => t(k, fb ?? key));

  const modalTitle = filteredModules.find((m: ServiceModuleConfig) => m.key === form.type)
    ? `${isEditing ? t("common.edit", "Bearbeiten") : t("services.add", "Hinzufügen")} ${moduleLabel(form.type)}`
    : t("services.createService", "Dienst erstellen");

  const handleSaveWithValidation = () => {
    if (!form.type) {
      Alert.alert(t("common.error"), t("services.selectType", "Please select a service type"));
      return;
    }
    const hasCoverPhoto = !!form.cover_image_url ||
      (form.image_urls && form.image_urls.length > 0);
    if (form.status === "published" && !hasCoverPhoto) {
      setCoverPhotoError(t("services.coverRequired", "Bitte füge ein Titelbild hinzu, bevor du den Dienst veröffentlichst."));
      return;
    }
    // Availability validation for publishing bookable services
    if (form.status === "published" && isServiceBookable(form.type)) {
      if (requiresServiceSlots(form.type)) {
        if (!form.availability_slots || form.availability_slots.length === 0) {
          Alert.alert(t("common.error", "Fehler"), t("services.availabilityTimesRequired", "Bitte füge mindestens eine verfügbare Zeit hinzu, bevor du den Dienst veröffentlichst."));
          return;
        }
      } else {
        if (!form.available_from) {
          Alert.alert(t("common.error", "Fehler"), t("services.availabilityDateRequired", "Bitte wähle ein Verfügbarkeitsdatum, bevor du den Dienst veröffentlichst."));
          return;
        }
      }
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

  const requiredModuleFields = getRequiredServiceFields(form.type);
  const categoryQuestions = getCategoryQuestions(rootCategory || "", subcategory);
  const fieldImportance = new Map<string, number>();
  categoryQuestions.forEach((q) => {
    fieldImportance.set(q.field, q.importance === "required" ? 0 : q.importance === "recommended" ? 1 : 2);
  });

  const isFieldRequired = (field: string) =>
    requiredModuleFields.includes(field) ||
    categoryQuestions.some((q) => q.field === field && q.importance === "required");

  const sortedFields = selectedFields
    .filter((f) => f !== "address" && f !== "deposit" && f !== "price")
    .map((field, index) => ({ field, index }))
    .sort((a, b) => {
      const importanceDiff = (fieldImportance.get(a.field) ?? 2) - (fieldImportance.get(b.field) ?? 2);
      return importanceDiff !== 0 ? importanceDiff : a.index - b.index;
    })
    .map((item) => item.field);

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
    const required = isFieldRequired(fieldName);
    const labelWithAsterisk = required ? `${label} *` : label;
    const value = fieldValue(fieldName);

    switch (config.component) {
      case "text":
        return (
          <View key={fieldName}>
            <Text style={styles.label}>{labelWithAsterisk}</Text>
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
            <Text style={styles.label}>{labelWithAsterisk}</Text>
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
            <Text style={styles.label}>{labelWithAsterisk}</Text>
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
              <Text style={styles.label}>{labelWithAsterisk}</Text>
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
            <Text style={styles.label}>{labelWithAsterisk}</Text>
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
            <Text style={styles.label}>{labelWithAsterisk}</Text>
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
            <Text style={styles.label}>{labelWithAsterisk}</Text>
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
            <Text style={styles.label}>{labelWithAsterisk}</Text>
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
              confirmed={!!form.address}
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
    <FormScreen title={modalTitle} onClose={onClose} visible={visible}>
      <Text style={styles.label}>
        {t("services.serviceType", "Type")}
        <Text style={styles.required}>*</Text>
      </Text>
      <View style={styles.pickerRow}>
              {filteredModules.map((mod) => (
                <Pressable
                  key={mod.key}
                  style={[styles.chip, form.type === mod.key && styles.chipSelected]}
                  onPress={() => updateField("type", mod.key)}
                >
                  <Ionicons name={mod.icon} size={16} color={form.type === mod.key ? "#fff" : COLORS.textSecondary} />
                  <Text style={[styles.chipText, form.type === mod.key && styles.chipTextSelected]}>
                    {moduleLabel(mod.key)}
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

            <Text style={styles.label}>
              {t("services.serviceName", "Name")}
              <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder={getCategoryPlaceholders(rootCategory).name}
              placeholderTextColor={COLORS.textDisabled}
              value={form.name}
              onChangeText={(v) => updateField("name", v)}
            />

            <Text style={styles.label}>{t("services.serviceDescription", "Description")}</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder={getCategoryPlaceholders(rootCategory).desc}
              placeholderTextColor={COLORS.textDisabled}
              value={form.description}
              onChangeText={(v) => updateField("description", v)}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>{getPriceLabel()}</Text>
            <TextInput
              style={styles.input}
              placeholder={getPricePlaceholder()}
              placeholderTextColor={COLORS.textDisabled}
              value={form.price}
              onChangeText={(v) => updateField("price", v)}
              keyboardType="numeric"
            />

            {sortedFields.map(renderFieldInput)}

            {hasField("address") && renderFieldInput("address")}
            {hasField("deposit") && renderFieldInput("deposit")}

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

            {/* Slot date picker modal */}
            <Modal
              visible={showSlotDatePicker}
              animationType="slide"
              transparent
              onRequestClose={() => setShowSlotDatePicker(false)}
            >
              <View style={styles.datePickerOverlay}>
                <View style={styles.datePickerContainer}>
                  <View style={styles.datePickerHeader}>
                    <Pressable onPress={() => setShowSlotDatePicker(false)}>
                      <Text style={styles.datePickerDone}>
                        {t("common.done", "Fertig")}
                      </Text>
                    </Pressable>
                  </View>
                  <CalendarList
                    horizontal
                    pagingEnabled
                    minDate={new Date().toISOString().slice(0, 10)}
                    onDayPress={(day: any) => {
                      setSlotDraft((previous) => ({
                        ...previous,
                        is_recurring: false,
                        date: day.dateString,
                      }));
                      setShowSlotDatePicker(false);
                    }}
                    markedDates={
                      slotDraft.date
                        ? { [slotDraft.date]: { selected: true, selectedColor: COLORS.primary } }
                        : {}
                    }
                    theme={{
                      todayTextColor: COLORS.primary,
                      selectedDayBackgroundColor: COLORS.primary,
                      arrowColor: COLORS.primary,
                    }}
                  />
                </View>
              </View>
            </Modal>

      {/* Availability Section for bookable services */}
      {isServiceBookable(form.type) && (
        <View style={styles.availabilitySection}>
          <Text style={styles.sectionTitle}>
            {t("services.availability", "Verfügbarkeit")}
            {form.status === "published" && <Text style={styles.required}> *</Text>}
          </Text>

          {requiresServiceSlots(form.type) ? (
            <View>
              {(form.availability_slots || []).map((slot, idx) => (
                <View key={idx} style={styles.slotRow}>
                  <Text style={styles.slotLabel}>
                    {slot.is_recurring ? ["So","Mo","Di","Mi","Do","Fr","Sa"][slot.day_of_week ?? 0] : (slot.date || "")}
                  </Text>
                  <Text style={styles.slotTime}>{slot.start_time} – {slot.end_time}</Text>
                  <Pressable onPress={() => {
                    const slots = [...(form.availability_slots || [])];
                    slots.splice(idx, 1);
                    setForm(prev => ({ ...prev, availability_slots: slots }));
                  }} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                  </Pressable>
                </View>
              ))}

              {showSlotEditor ? (
                <View style={styles.slotEditor}>
                  <View style={styles.chipRow}>
                    <Pressable style={[styles.chip, slotDraft.is_recurring && styles.chipActive]} onPress={() => setSlotDraft(prev => ({ ...prev, is_recurring: true }))}>
                      <Text style={[styles.chipText, slotDraft.is_recurring && styles.chipTextActive]}>{t("services.weekly", "Wöchentlich")}</Text>
                    </Pressable>
                    <Pressable style={[styles.chip, !slotDraft.is_recurring && styles.chipActive]} onPress={() => setSlotDraft(prev => ({ ...prev, is_recurring: false }))}>
                      <Text style={[styles.chipText, !slotDraft.is_recurring && styles.chipTextActive]}>{t("services.specificDate", "Bestimmtes Datum")}</Text>
                    </Pressable>
                  </View>

                  {slotDraft.is_recurring ? (
                    <View style={styles.chipRow}>
                      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((label, i) => (
                        <Pressable key={i} style={[styles.chip, slotDraft.day_of_week === (i + 1) % 7 && styles.chipActive]} onPress={() => setSlotDraft(prev => ({ ...prev, day_of_week: (i + 1) % 7 }))}>
                          <Text style={[styles.chipText, slotDraft.day_of_week === (i + 1) % 7 && styles.chipTextActive]}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Pressable style={styles.selector} onPress={() => setShowSlotDatePicker(true)}>
                      <Text style={slotDraft.date ? styles.selectorTextSelected : styles.selectorText}>
                        {slotDraft.date || t("services.selectDate", "Datum wählen")}
                      </Text>
                      <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
                    </Pressable>
                  )}

                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>{t("services.startTime", "Start")}</Text>
                      <TextInput style={styles.input} value={slotDraft.start_time} onChangeText={(v) => setSlotDraft(prev => ({ ...prev, start_time: v }))} placeholder="09:00" placeholderTextColor={COLORS.textDisabled} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>{t("services.endTime", "Ende")}</Text>
                      <TextInput style={styles.input} value={slotDraft.end_time} onChangeText={(v) => setSlotDraft(prev => ({ ...prev, end_time: v }))} placeholder="10:00" placeholderTextColor={COLORS.textDisabled} />
                    </View>
                  </View>

                  <View style={styles.addSlotRow}>
                    <Pressable style={[styles.addSlotBtn, { borderColor: COLORS.success }]} onPress={() => {
                      const parseTime = (v: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!m) return null; const h = Number(m[1]), min = Number(m[2]); return (h >= 0 && h <= 23 && min >= 0 && min <= 59) ? h * 60 + min : null; };
                      const start = parseTime(slotDraft.start_time);
                      const end = parseTime(slotDraft.end_time);
                      if (start === null || end === null || start >= end) return;
                      const hasTarget = slotDraft.is_recurring ? slotDraft.day_of_week !== undefined : !!slotDraft.date;
                      if (!hasTarget) return;
                      const slots = [...(form.availability_slots || []), { ...slotDraft }];
                      setForm(prev => ({ ...prev, availability_slots: slots }));
                      setShowSlotEditor(false);
                      setSlotDraft({ is_recurring: true, day_of_week: 1, start_time: "09:00", end_time: "10:00", date: undefined });
                    }}>
                      <Ionicons name="checkmark" size={18} color={COLORS.success} />
                      <Text style={[styles.addSlotText, { color: COLORS.success }]}>{t("common.add", "Hinzufügen")}</Text>
                    </Pressable>
                    <Pressable style={[styles.addSlotBtn, { borderColor: COLORS.textMuted }]} onPress={() => { setShowSlotEditor(false); setSlotDraft({ is_recurring: true, day_of_week: 1, start_time: "09:00", end_time: "10:00", date: undefined }); }}>
                      <Text style={[styles.addSlotText, { color: COLORS.textMuted }]}>{t("common.cancel", "Abbrechen")}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.addSlotRow}>
                  <Pressable style={[styles.addSlotBtn, { borderColor: COLORS.primary }]} onPress={() => setShowSlotEditor(true)}>
                    <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                    <Text style={[styles.addSlotText, { color: COLORS.primary }]}>{t("services.addTimeSlot", "Zeitfenster hinzufügen")}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ) : (
            <View>
              <Text style={styles.label}>{t("services.availableFrom", "Verfügbar ab")}</Text>
              <Pressable style={styles.selector} onPress={() => setShowDatePicker(true)}>
                <Text style={form.available_from ? styles.selectorTextSelected : styles.selectorText}>
                  {form.available_from || t("services.selectDate", "Datum wählen")}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>
          )}

          {form.status === "published" && (
            <Text style={styles.availabilityHint}>
              {requiresServiceSlots(form.type)
                ? t("services.availabilityHintSlots", "Füge mindestens ein Zeitfenster hinzu, um den Dienst zu veröffentlichen.")
                : t("services.availabilityHintDate", "Wähle ein Datum aus, um den Dienst zu veröffentlichen.")}
            </Text>
          )}
        </View>
      )}

      <FormBottomBar
        onCancel={onClose}
        onSave={handleSaveWithValidation}
        saveLabel={isEditing ? t("common.save", "Speichern") : t("common.create", "Erstellen")}
        isSaving={isSaving}
        disabled={
          !form.type || !form.name.trim() ||
          (form.status === "published" && isServiceBookable(form.type) &&
            (requiresServiceSlots(form.type)
              ? !(form.availability_slots?.length) || !form.availability_slots!.every(s => {
                  const p = (v: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!m) return null; const h = Number(m[1]), min = Number(m[2]); return (h >= 0 && h <= 23 && min >= 0 && min <= 59) ? h * 60 + min : null; };
                  const a = p(s.start_time), b = p(s.end_time);
                  return a !== null && b !== null && a < b && (s.is_recurring ? s.day_of_week !== undefined : !!s.date);
                })
              : !form.available_from))
        }
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.std, paddingTop: SPACING.small, paddingBottom: SPACING.small, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerButton: { padding: SPACING.tiny },
  modalTitle: { fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.bold as any, color: COLORS.textPrimary },
  modalBody: { flex: 1, padding: SPACING.std },
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
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  label: { fontSize: FONT_SIZES.caption, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.textSecondary, marginBottom: SPACING.tiny, marginTop: SPACING.std },
  required: { color: COLORS.danger, fontWeight: FONT_WEIGHTS.bold as any },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.small, paddingVertical: SPACING.compact, fontSize: FONT_SIZES.body, color: COLORS.textPrimary, backgroundColor: COLORS.backgroundPage },
  dateText: { fontSize: FONT_SIZES.body, color: COLORS.textPrimary },
  dateTextPlaceholder: { color: COLORS.textDisabled },
  datePickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  datePickerContainer: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, maxHeight: "70%" },
  datePickerHeader: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: SPACING.std, paddingVertical: SPACING.compact, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  datePickerDone: { fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold as any, color: COLORS.primary },
  row: { flexDirection: "row", gap: SPACING.compact },
  pickerRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginBottom: SPACING.tiny },
  chipWideRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACING.tiny, paddingHorizontal: SPACING.compact, paddingVertical: SPACING.small, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  chipSelected: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark },
  chipText: { fontSize: FONT_SIZES.caption, color: COLORS.textSecondary },
  chipTextSelected: { color: "#fff" },
  imagePicker: { marginTop: SPACING.tiny },
  coverImage: { width: "100%", height: 180, borderRadius: BORDER_RADIUS.md },
  imagePlaceholder: { width: "100%", height: 120, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { fontSize: FONT_SIZES.small, color: COLORS.textDisabled, marginTop: SPACING.tiny },
  galleryRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginTop: SPACING.tiny },
  galleryItem: { width: 70, height: 70, position: "relative" },
  galleryImage: { width: 70, height: 70, borderRadius: BORDER_RADIUS.sm },
  galleryRemove: { position: "absolute", top: -6, right: -6 },
  galleryAdd: { width: 70, height: 70, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.small, paddingVertical: SPACING.compact, marginTop: SPACING.small },
  toggleBtnActive: {},
  toggleLabel: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  availabilitySection: { paddingHorizontal: SPACING.std, paddingBottom: SPACING.small, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.small },
  sectionTitle: { fontSize: FONT_SIZES.body, fontWeight: "700", color: COLORS.textPrimary, marginBottom: SPACING.small },
  slotRow: { flexDirection: "row", alignItems: "center", gap: SPACING.small, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  slotLabel: { fontSize: FONT_SIZES.caption, color: COLORS.textPrimary, width: 40 },
  slotTime: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, flex: 1 },
  addSlotRow: { marginTop: SPACING.small },
  addSlotBtn: { flexDirection: "row", alignItems: "center", gap: SPACING.small, paddingVertical: SPACING.small, paddingHorizontal: SPACING.small, borderWidth: 1, borderRadius: BORDER_RADIUS.md },
  addSlotText: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600" },
  selector: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.backgroundPage, padding: SPACING.std, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  selectorText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textDisabled },
  selectorTextSelected: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  availabilityHint: { fontSize: FONT_SIZES.caption, color: COLORS.danger, marginTop: SPACING.small },
  slotEditor: { paddingVertical: SPACING.small },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginBottom: 4 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipTextActive: { color: "#fff" },
});

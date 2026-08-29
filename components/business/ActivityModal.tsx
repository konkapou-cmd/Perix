import { useState, useEffect, useRef } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import DateTimePicker from "@react-native-community/datetimepicker";
import DatePickerModal from "../shared/DatePickerModal";
import { ActivityItem, ACTIVITY_TYPES, ACTIVITY_CATEGORIES, ACTIVITY_SUBCATEGORIES } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";
import FormScreen from "../ui/FormScreen";
import FormBottomBar from "../ui/FormBottomBar";

type ActivityForm = {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  cover_image_url?: string;
  image_urls: string[];
  video_url?: string;
  max_attendees: number;
  is_private: boolean;
  theme: string;
  password: string;
  gallery_images: string[];
  gallery_videos: string[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  activityForm: ActivityForm;
  onFormChange: (form: ActivityForm) => void;
  activityEditing: ActivityItem | null;
  activityDate: Date;
  activityTime: Date;
  showActivityDatePicker: boolean;
  showActivityTimePicker: boolean;
  onShowDatePicker: (show: boolean) => void;
  onShowTimePicker: (show: boolean) => void;
  onDateChange: (event: any, date?: Date) => void;
  onTimeChange: (event: any, time?: Date) => void;
  onSave: () => void;
  sessionToken?: string;
  nearLat?: number;
  nearLng?: number;
  businessAddress?: string;
  isSaving?: boolean;
};

function formToMedia(form: ActivityForm): MediaItem[] {
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
    if (!seen.has(u)) {
      seen.add(u);
      items.push({ uri: u, type: "image" });
    }
  });
  if (form.video_url && !seen.has(form.video_url)) {
    seen.add(form.video_url);
    items.push({ uri: form.video_url, type: "video" });
  }
  form.gallery_images.forEach((u) => {
    if (!seen.has(u)) {
      seen.add(u);
      items.push({ uri: u, type: "image" });
    }
  });
  form.gallery_videos.forEach((u) => {
    if (!seen.has(u)) {
      seen.add(u);
      items.push({ uri: u, type: "video" });
    }
  });
  return items;
}

function mediaToForm(media: MediaItem[], base: ActivityForm): ActivityForm {
  const coverImageItem = media.find((m) => m.isCoverImage && m.type === "image");
  const coverVideoItem = media.find((m) => m.isCoverVideo && m.type === "video");
  const coverItem = coverImageItem || coverVideoItem;
  const images = media.filter((m) => m.type === "image").map((m) => m.uri);
  const videos = media.filter((m) => m.type === "video").map((m) => m.uri);
  return {
    ...base,
    cover_image_url: coverImageItem?.uri || (coverVideoItem ? "" : images[0]) || "",
    image_urls: images,
    video_url: coverVideoItem?.uri || videos[0] || undefined,
    gallery_images: coverImageItem
      ? images.filter((u) => u !== coverImageItem.uri)
      : images.slice(1),
    gallery_videos: coverVideoItem
      ? videos.filter((u) => u !== coverVideoItem.uri)
      : videos.slice(1),
    cover_focal_point: coverItem?.focalPoint ?? { x: 0.5, y: 0.5 },
  } as any;
}

export default function ActivityModal({
  visible,
  onClose,
  activityForm,
  onFormChange,
  activityEditing,
  activityDate,
  activityTime,
  showActivityDatePicker,
  showActivityTimePicker,
  onShowDatePicker,
  onShowTimePicker,
  onDateChange,
  onTimeChange,
  onSave,
  sessionToken,
  nearLat,
  nearLng,
  businessAddress,
  isSaving = false,
}: Props) {
  const { t } = useTranslation();
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (activityEditing) {
      onFormChange({
        title: activityEditing.title,
        description: activityEditing.description || "",
        date: activityEditing.date,
        time: activityEditing.time,
        location: activityEditing.location || "",
        latitude: activityEditing.latitude ?? null,
        longitude: activityEditing.longitude ?? null,
        cover_image_url: (activityEditing as any).cover_image_url || undefined,
        image_urls: (activityEditing as any).image_urls || [],
        video_url: (activityEditing as any).video_url ?? undefined,
        max_attendees: activityEditing.max_attendees || 10,
        is_private: activityEditing.is_private || false,
        theme: activityEditing.theme || "",
        password: (activityEditing as any).password || "",
        gallery_images: (activityEditing as any).gallery_images || [],
        gallery_videos: (activityEditing as any).gallery_videos || [],
      });
    } else {
      onFormChange({ title: "", description: "", date: "", time: "", location: businessAddress || "", latitude: null, longitude: null, cover_image_url: undefined, image_urls: [], video_url: undefined, max_attendees: 10, is_private: false, theme: "", password: "", gallery_images: [], gallery_videos: [] });
    }
  }, [activityEditing]);

  useEffect(() => {
    if (visible && !activityEditing && !activityForm.location && businessAddress) {
      onFormChange({ ...activityForm, location: businessAddress });
    }
  }, [visible]);

  const [showCalendar, setShowCalendar] = useState(false);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return t("activities.selectDate", "Select date");
    const clean = dateStr.split("T")[0];
    const [y, m, d] = clean.split("-");
    return `${d}.${m}.${y}`;
  };
  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const formatTime = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const media = formToMedia(activityForm);
  const formRef = useRef(activityForm);
  formRef.current = activityForm;
  const handleMediaChange = (newMedia: MediaItem[]) => {
    onFormChange(mediaToForm(newMedia, formRef.current));
  };

  return (
    <FormScreen title={activityEditing ? t("activities.editActivity") : t("activities.createActivity")} onClose={onClose} visible={visible} titleColor="#FF9F1C">
      <UnifiedMediaGallery
            media={media}
            onChange={handleMediaChange}
            sessionToken={sessionToken}
            label={t("activities.media") || "Media"}
            accentColor="#FF9F1C"
            lightBackground
          />

          <Text style={s.label}><Text style={s.required}>* </Text>{t("activities.activityTitle")}</Text>
          <TextInput
            style={s.input}
            value={activityForm.title}
            onChangeText={(text) => onFormChange({ ...activityForm, title: text })}
            placeholder={t("activities.activityTitlePlaceholder") || "Activity title"}
            placeholderTextColor="rgba(38,67,72,0.45)"
          />

          <Text style={s.label}>{t("activities.description")}</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={activityForm.description}
            onChangeText={(text) => onFormChange({ ...activityForm, description: text })}
            placeholder={t("activities.descriptionPlaceholder") || "Describe your activity..."}
            placeholderTextColor="rgba(38,67,72,0.45)"
            multiline
          />

          <View style={s.row}>
            <View style={s.halfWidth}>
              <Text style={s.label}><Text style={s.required}>* </Text>{t("activities.date")}</Text>
              <Pressable style={s.selector} onPress={() => setShowCalendar(true)}>
                <Text style={s.selectorTextSelected}>
                  {activityForm.date ? formatDateShort(activityForm.date) : t("activities.selectDate", "Select date")}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#264348" />
              </Pressable>
            </View>
            <View style={s.halfWidth}>
              <Text style={s.label}><Text style={s.required}>* </Text>{t("activities.time")}</Text>
              <Pressable style={s.selector} onPress={() => onShowTimePicker(true)}>
                <Text style={s.selectorTextSelected}>{formatTime(activityTime)}</Text>
                <Ionicons name="time-outline" size={18} color="#264348" />
              </Pressable>
            </View>
          </View>

          <DatePickerModal
            visible={showCalendar}
            onClose={() => setShowCalendar(false)}
            variant="sheet"
            value={{ startDate: activityForm.date, endDate: null }}
            onApply={(v) => {
              const dateStr = v.startDate ?? "";
              onFormChange({ ...activityForm, date: dateStr });
              onDateChange(null, new Date(dateStr + "T00:00:00"));
            }}
            accentColor="#FF9F1C"
          />

          {showActivityTimePicker && (
            <View>
              {Platform.OS === "ios" && (
                <Pressable style={s.pickerDoneBtn} onPress={() => onShowTimePicker(false)}>
                  <Text style={s.pickerDoneText}>{t("common.done") || "Done"}</Text>
                </Pressable>
              )}
              <DateTimePicker value={activityTime} mode="time" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onTimeChange} />
            </View>
          )}

          <Text style={s.label}>{t("activities.location")}</Text>
          <PlacesAutocompleteInput
            value={activityForm.location}
            onChangeText={(text) => onFormChange({ ...activityForm, location: text })}
            onSelectPlace={(address, lat, lng) => onFormChange({ ...activityForm, location: address, latitude: lat, longitude: lng })}
            placeholder={t("activities.locationPlaceholder") || "Location or address"}
            style={s.input}
            nearLat={nearLat}
            nearLng={nearLng}
            confirmed={!!activityForm.location}
          />

          <Text style={s.label}>{t("activities.maxAttendees")}</Text>
          <TextInput
            style={s.input}
            value={activityForm.max_attendees ? String(activityForm.max_attendees) : ""}
            onChangeText={(text) => onFormChange({ ...activityForm, max_attendees: text ? Number(text) : 10 })}
            placeholder={t("activities.maxAttendeesPlaceholder") || "No limit"}
            placeholderTextColor="rgba(38,67,72,0.45)"
            keyboardType="numeric"
          />

          <Text style={s.label}>{t("activities.theme") || "Activity Type"}</Text>

          {Object.entries(ACTIVITY_CATEGORIES).map(([catKey, cat]) => {
            const isExpanded = expandedCategory === catKey;
            const categoryTypes = Object.entries(ACTIVITY_TYPES).filter(([_, t]) => t.category === catKey);
            return (
              <View key={catKey} style={s.categorySection}>
                <Pressable
                  style={s.categoryHeader}
                  onPress={() => setExpandedCategory(isExpanded ? null : catKey)}
                >
                  <Text style={s.categoryEmoji}>{cat.emoji}</Text>
                  <Text style={s.categoryLabel}>{cat.label}</Text>
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textSecondary} />
                </Pressable>

                {isExpanded && (
                  <View style={s.categoryBody}>
                    {Object.entries(ACTIVITY_SUBCATEGORIES)
                      .filter(([_, sub]) => sub.category === catKey)
                      .map(([subKey, sub]) => {
                        const subTypes = categoryTypes.filter(([_, t]) => t.subcategory === subKey);
                        return (
                          <View key={subKey} style={s.subcategorySection}>
                            <Text style={s.subcategoryLabel}>{sub.label}</Text>
                            <View style={s.themeChipsRow}>
                              {subTypes.map(([typeKey, type]) => (
                                <Pressable
                                  key={typeKey}
                                  style={[
                                    s.themeChip,
                                    activityForm.theme === typeKey && { backgroundColor: type.color, borderColor: type.color },
                                  ]}
                                  onPress={() => onFormChange({ ...activityForm, theme: activityForm.theme === typeKey ? "" : typeKey })}
                                >
                                  <Text style={s.themeChipEmoji}>{type.emoji}</Text>
                                  <Text style={[s.themeChipText, activityForm.theme === typeKey && s.themeChipTextActive]}>
                                    {type.shortLabel || type.label}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        );
                      })}
                  </View>
                )}
              </View>
            );
          })}

      <FormBottomBar
        onCancel={onClose}
        onSave={onSave}
        isSaving={isSaving}
        disabled={!activityForm.title.trim()}
        saveLabel={activityEditing ? t("common.save", "Speichern") : t("common.create", "Erstellen")}
        accentColor="#FF9F1C"
      />
    </FormScreen>
  );
}

const s = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: {
    width: 40,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: "#264348",
  },
  body: {
    flex: 1,
    paddingHorizontal: SPACING.std,
  },
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
    borderColor: "rgba(38,67,72,0.2)",
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#264348",
  },
  saveBtn: {
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#FF9F1C",
  },
  saveBtnText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  label: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#264348",
    marginBottom: SPACING.tiny,
    marginTop: SPACING.std,
  },
  required: {
    color: COLORS.danger,
  },
  labelNoMargin: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#264348",
    marginBottom: 0,
    marginTop: 0,
  },
  labelHint: {
    fontSize: FONT_SIZES.micro,
    color: "rgba(38,67,72,0.45)",
    marginTop: -2,
    marginBottom: SPACING.small,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.2)",
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.compact,
    fontSize: FONT_SIZES.bodySmall,
    color: "#264348",
    backgroundColor: "transparent",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    gap: SPACING.small,
  },
  halfWidth: {
    flex: 1,
  },
  selector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.2)",
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.compact,
    backgroundColor: "transparent",
  },
  selectorTextSelected: {
    fontSize: FONT_SIZES.bodySmall,
    color: "#264348",
  },
  themeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.small,
    paddingVertical: SPACING.tiny,
  },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.2)",
    backgroundColor: "transparent",
  },
  themeChipEmoji: {
    fontSize: FONT_SIZES.small,
  },
  themeChipText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: "#264348",
  },
  themeChipTextActive: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  categorySection: {
    marginBottom: SPACING.small,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
    paddingVertical: SPACING.compact,
    paddingHorizontal: SPACING.small,
    backgroundColor: "transparent",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.2)",
  },
  categoryEmoji: {
    fontSize: FONT_SIZES.bodySmall,
  },
  categoryLabel: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#264348",
  },
  categoryBody: {
    paddingTop: SPACING.small,
    paddingLeft: SPACING.small,
  },
  subcategorySection: {
    marginBottom: SPACING.small,
  },
  subcategoryLabel: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: "#264348",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.tiny,
  },
  privateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.small,
  },
  privateLabelContainer: {
    flex: 1,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: "#FF9F1C",
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  toggleKnobActive: {
    alignSelf: "flex-end",
  },
  pickerDoneBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    marginTop: SPACING.small,
  },
  pickerDoneText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#FF9F1C",
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  calendarContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: "70%",
    paddingBottom: 20,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  calendarDoneText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#FF9F1C",
  },
  calendar: {
    height: 320,
  },
});

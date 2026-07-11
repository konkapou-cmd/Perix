import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { CalendarList } from "react-native-calendars";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ActivityItem, ACTIVITY_TYPES, ACTIVITY_CATEGORIES, ACTIVITY_SUBCATEGORIES } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";

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
  max_attendees?: number | null;
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
        max_attendees: activityEditing.max_attendees,
        is_private: activityEditing.is_private || false,
        theme: activityEditing.theme || "",
        password: (activityEditing as any).password || "",
        gallery_images: (activityEditing as any).gallery_images || [],
        gallery_videos: (activityEditing as any).gallery_videos || [],
      });
    } else {
      onFormChange({ title: "", description: "", date: "", time: "", location: "", latitude: null, longitude: null, cover_image_url: undefined, image_urls: [], video_url: undefined, max_attendees: undefined, is_private: false, theme: "", password: "", gallery_images: [], gallery_videos: [] });
    }
  }, [activityEditing]);

  const [showCalendar, setShowCalendar] = useState(false);

  const pad = (n: number) => n.toString().padStart(2, "0");
  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return t("activities.selectDate", "Select date");
    const [y, m, d] = dateStr.split("-");
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
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={s.modalContainer} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>
            {activityEditing ? t("activities.editActivity") : t("activities.createActivity")}
          </Text>
          <View style={s.headerBtn} />
        </View>

        <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
          <UnifiedMediaGallery
            media={media}
            onChange={handleMediaChange}
            sessionToken={sessionToken}
            label={t("activities.media") || "Media"}
          />

          <Text style={s.label}><Text style={s.required}>* </Text>{t("activities.activityTitle")}</Text>
          <TextInput
            style={s.input}
            value={activityForm.title}
            onChangeText={(text) => onFormChange({ ...activityForm, title: text })}
            placeholder={t("activities.activityTitlePlaceholder") || "Activity title"}
            placeholderTextColor={COLORS.textDisabled}
          />

          <Text style={s.label}>{t("activities.description")}</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={activityForm.description}
            onChangeText={(text) => onFormChange({ ...activityForm, description: text })}
            placeholder={t("activities.descriptionPlaceholder") || "Describe your activity..."}
            placeholderTextColor={COLORS.textDisabled}
            multiline
          />

          <View style={s.row}>
            <View style={s.halfWidth}>
              <Text style={s.label}><Text style={s.required}>* </Text>{t("activities.date")}</Text>
              <Pressable style={s.selector} onPress={() => setShowCalendar(true)}>
                <Text style={s.selectorTextSelected}>
                  {activityForm.date ? formatDateShort(activityForm.date) : t("activities.selectDate", "Select date")}
                </Text>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>
            <View style={s.halfWidth}>
              <Text style={s.label}><Text style={s.required}>* </Text>{t("activities.time")}</Text>
              <Pressable style={s.selector} onPress={() => onShowTimePicker(true)}>
                <Text style={s.selectorTextSelected}>{formatTime(activityTime)}</Text>
                <Ionicons name="time-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>
          </View>

          <Modal visible={showCalendar} animationType="slide" transparent>
            <View style={s.calendarOverlay}>
              <View style={s.calendarContainer}>
                <View style={s.calendarHeader}>
                  <Pressable onPress={() => setShowCalendar(false)}>
                    <Text style={s.calendarDoneText}>{t("common.done", "Done")}</Text>
                  </Pressable>
                </View>
                <CalendarList
                  onDayPress={(day) => {
                    const dateStr = day.dateString;
                    onFormChange({ ...activityForm, date: dateStr });
                    onDateChange(null, new Date(dateStr + "T00:00:00"));
                    setShowCalendar(false);
                  }}
                  markedDates={activityForm.date ? { [activityForm.date]: { selected: true, selectedColor: COLORS.primary } } : {}}
                  firstDay={1}
                  style={s.calendar}
                  theme={{
                    todayTextColor: COLORS.primary,
                    selectedDayBackgroundColor: COLORS.primary,
                    selectedDayTextColor: "#fff",
                    dayTextColor: COLORS.textPrimary,
                    textDisabledColor: COLORS.textDisabled,
                    arrowColor: COLORS.primary,
                    monthTextColor: COLORS.textPrimary,
                  }}
                />
              </View>
            </View>
          </Modal>

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
          />

          <Text style={s.label}>{t("activities.maxAttendees")}</Text>
          <TextInput
            style={s.input}
            value={activityForm.max_attendees ? String(activityForm.max_attendees) : ""}
            onChangeText={(text) => onFormChange({ ...activityForm, max_attendees: text ? Number(text) : undefined })}
            placeholder={t("activities.maxAttendeesPlaceholder") || "No limit"}
            placeholderTextColor={COLORS.textDisabled}
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

          <View style={{ height: 140 }} />
        </ScrollView>

        <View style={s.footer}>
          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelBtnText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable style={s.saveBtn} onPress={onSave}>
            <Text style={s.saveBtnText}>
              {activityEditing ? t("common.save") : t("common.create")}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
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
    color: COLORS.textPrimary,
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
  label: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textSecondary,
    marginBottom: SPACING.tiny,
    marginTop: SPACING.std,
  },
  required: {
    color: COLORS.danger,
  },
  labelNoMargin: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textSecondary,
    marginBottom: 0,
    marginTop: 0,
  },
  labelHint: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textDisabled,
    marginTop: -2,
    marginBottom: SPACING.small,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.compact,
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundPage,
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
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.compact,
    backgroundColor: COLORS.backgroundPage,
  },
  selectorTextSelected: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundPage,
  },
  themeChipEmoji: {
    fontSize: FONT_SIZES.small,
  },
  themeChipText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryEmoji: {
    fontSize: FONT_SIZES.body,
  },
  categoryLabel: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
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
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.primary,
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
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.primary,
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
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.primary,
  },
  calendar: {
    height: 320,
  },
});

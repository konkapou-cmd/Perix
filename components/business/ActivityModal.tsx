import { useState, useEffect } from "react";
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
import DateTimePicker from "@react-native-community/datetimepicker";
import { ActivityItem, ACTIVITY_THEMES } from "../../lib/api";
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

function mediaToForm(media: MediaItem[], base: ActivityForm): ActivityForm {
  const coverIsVideo = media.length > 0 && media[0].type === "video";
  if (coverIsVideo) {
    const videos = media.filter((m) => m.type === "video").map((m) => m.uri);
    const images = media.filter((m) => m.type === "image").map((m) => m.uri);
    return {
      ...base,
      cover_image_url: undefined,
      image_urls: images,
      video_url: videos[0] || undefined,
      gallery_images: images,
      gallery_videos: videos.slice(1),
    };
  }
  const images = media.filter((m) => m.type === "image").map((m) => m.uri);
  const videos = media.filter((m) => m.type === "video").map((m) => m.uri);
  return {
    ...base,
    cover_image_url: images[0] || undefined,
    image_urls: images,
    video_url: videos[0] || undefined,
    gallery_images: images.slice(1),
    gallery_videos: videos.slice(1),
  };
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
    }
  }, [activityEditing]);

  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const formatTime = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const media = formToMedia(activityForm);
  const handleMediaChange = (newMedia: MediaItem[]) => {
    onFormChange(mediaToForm(newMedia, activityForm));
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={s.modalContainer} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
              <Pressable style={s.selector} onPress={() => onShowDatePicker(true)}>
                <Text style={s.selectorTextSelected}>{formatDate(activityDate)}</Text>
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

          {showActivityDatePicker && (
            <View>
              {Platform.OS === "ios" && (
                <Pressable style={s.pickerDoneBtn} onPress={() => onShowDatePicker(false)}>
                  <Text style={s.pickerDoneText}>{t("common.done") || "Done"}</Text>
                </Pressable>
              )}
              <DateTimePicker value={activityDate} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onDateChange} />
            </View>
          )}
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

          <View style={s.privateRow}>
            <View style={s.privateLabelContainer}>
              <Text style={s.labelNoMargin}>{t("activities.private")}</Text>
              <Text style={s.labelHint}>{t("business.privateHint")}</Text>
            </View>
            <Pressable
              style={[s.toggle, activityForm.is_private && s.toggleActive]}
              onPress={() => onFormChange({ ...activityForm, is_private: !activityForm.is_private, password: activityForm.is_private ? "" : activityForm.password })}
            >
              <View style={[s.toggleKnob, activityForm.is_private && s.toggleKnobActive]} />
            </Pressable>
          </View>

          {activityForm.is_private && (
            <>
              <Text style={s.label}>{t("business.password")}</Text>
              <TextInput
                style={s.input}
                value={activityForm.password}
                onChangeText={(text) => onFormChange({ ...activityForm, password: text })}
                placeholder={t("business.passwordPlaceholder")}
                placeholderTextColor={COLORS.textDisabled}
                secureTextEntry
              />
            </>
          )}

          <Text style={s.label}>{t("activities.theme")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeChipsRow}>
            {Object.entries(ACTIVITY_THEMES).map(([key, theme]: [string, any]) => (
              <Pressable
                key={key}
                style={[s.themeChip, activityForm.theme === key && { backgroundColor: theme.color, borderColor: theme.color }]}
                onPress={() => onFormChange({ ...activityForm, theme: activityForm.theme === key ? "" : key })}
              >
                <Text style={s.themeChipEmoji}>{theme.emoji}</Text>
                <Text style={[s.themeChipText, activityForm.theme === key && s.themeChipTextActive]}>{theme.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ height: SPACING.huge }} />
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
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
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
    paddingHorizontal: SPACING.xl,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  cancelBtn: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
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
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
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
    marginBottom: SPACING.xs,
    marginTop: SPACING.xl,
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
    marginBottom: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.mdLg,
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
    gap: SPACING.md,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.mdLg,
    backgroundColor: COLORS.backgroundPage,
  },
  selectorTextSelected: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
  },
  themeChipsRow: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
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
  privateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
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
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginTop: SPACING.sm,
  },
  pickerDoneText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.primary,
  },
});

import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { EventItem, EVENT_THEMES, DEFAULT_EVENT_THEME } from "../../lib/api/events";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";

type EventForm = {
  title: string;
  description: string;
  start_time: string;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  cover_image_url?: string;
  image_urls: string[];
  video_url?: string;
  theme: string;
  gallery_images: string[];
  gallery_videos: string[];
  is_private: boolean;
  password: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  eventForm: EventForm;
  onFormChange: (form: EventForm) => void;
  eventEditing: EventItem | null;
  eventThemes: { slug: string; label: string; color?: string; emoji?: string; gradient?: [string, string] }[];
  eventDate: Date;
  eventTime: Date;
  showEventDatePicker: boolean;
  showEventTimePicker: boolean;
  showThemePicker: boolean;
  onShowDatePicker: (show: boolean) => void;
  onShowTimePicker: (show: boolean) => void;
  onShowThemePicker: (show: boolean) => void;
  onDateChange: (event: any, date?: Date) => void;
  onTimeChange: (event: any, time?: Date) => void;
  onSave: () => void;
  sessionToken?: string;
  nearLat?: number;
  nearLng?: number;
};

const themesMap = EVENT_THEMES;

function formToMedia(form: EventForm): MediaItem[] {
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

function mediaToForm(media: MediaItem[], base: EventForm): EventForm {
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

export default function EventModal({
  visible,
  onClose,
  eventForm,
  onFormChange,
  eventEditing,
  eventThemes,
  eventDate,
  eventTime,
  showEventDatePicker,
  showEventTimePicker,
  showThemePicker,
  onShowDatePicker,
  onShowTimePicker,
  onShowThemePicker,
  onDateChange,
  onTimeChange,
  onSave,
  sessionToken,
  nearLat,
  nearLng,
}: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (eventEditing) {
      onFormChange({
        title: eventEditing.title,
        description: eventEditing.description || "",
        start_time: eventEditing.start_time || "",
        location: eventEditing.location || "",
        latitude: eventEditing.latitude ?? null,
        longitude: eventEditing.longitude ?? null,
        cover_image_url: (eventEditing as any).cover_image_url || undefined,
        image_urls: (eventEditing as any).image_urls || [],
        video_url: (eventEditing as any).video_url ?? undefined,
        theme: eventEditing.theme || "",
        gallery_images: (eventEditing as any).gallery_images || [],
        gallery_videos: (eventEditing as any).gallery_videos || [],
        is_private: (eventEditing as any).is_private || false,
        password: (eventEditing as any).password || "",
      });
    }
  }, [eventEditing]);

  const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const formatTime = (date: Date) =>
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const media = formToMedia(eventForm);
  const handleMediaChange = (newMedia: MediaItem[]) => {
    onFormChange(mediaToForm(newMedia, eventForm));
  };

  const themeList = eventThemes.length > 0 ? eventThemes : Object.entries(themesMap).map(([slug, t]) => ({ slug, label: t.label, color: t.color, emoji: t.emoji, gradient: t.gradient }));

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={s.modalContainer} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.header}>
          <Pressable onPress={onClose} hitSlop={12} style={s.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>
            {eventEditing ? t("events.editEvent") : t("events.createEvent")}
          </Text>
          <View style={s.headerBtn} />
        </View>

        <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
          <UnifiedMediaGallery
            media={media}
            onChange={handleMediaChange}
            sessionToken={sessionToken}
            label={t("events.media") || "Media"}
          />

          <Text style={s.label}><Text style={s.required}>* </Text>{t("events.eventTitle") || "Event Title"}</Text>
          <TextInput
            style={s.input}
            value={eventForm.title}
            onChangeText={(text) => onFormChange({ ...eventForm, title: text })}
            placeholder={t("events.eventTitlePlaceholder") || "Event title"}
            placeholderTextColor={COLORS.textDisabled}
          />

          <Text style={s.label}>{t("events.description") || "Description"}</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={eventForm.description}
            onChangeText={(text) => onFormChange({ ...eventForm, description: text })}
            placeholder={t("events.descriptionPlaceholder") || "Describe your event..."}
            placeholderTextColor={COLORS.textDisabled}
            multiline
          />

          <View style={s.row}>
            <View style={s.halfWidth}>
              <Text style={s.label}><Text style={s.required}>* </Text>{t("events.date") || "Date"}</Text>
              <Pressable style={s.selector} onPress={() => onShowDatePicker(true)}>
                <Text style={s.selectorTextSelected}>{formatDate(eventDate)}</Text>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>
            <View style={s.halfWidth}>
              <Text style={s.label}><Text style={s.required}>* </Text>{t("events.time") || "Time"}</Text>
              <Pressable style={s.selector} onPress={() => onShowTimePicker(true)}>
                <Text style={s.selectorTextSelected}>{formatTime(eventTime)}</Text>
                <Ionicons name="time-outline" size={18} color={COLORS.textMuted} />
              </Pressable>
            </View>
          </View>

          {showEventDatePicker && (
            <View>
              {Platform.OS === "ios" && (
                <Pressable style={s.pickerDoneBtn} onPress={() => onShowDatePicker(false)}>
                  <Text style={s.pickerDoneText}>{t("common.done") || "Done"}</Text>
                </Pressable>
              )}
              <DateTimePicker value={eventDate} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onDateChange} />
            </View>
          )}
          {showEventTimePicker && (
            <View>
              {Platform.OS === "ios" && (
                <Pressable style={s.pickerDoneBtn} onPress={() => onShowTimePicker(false)}>
                  <Text style={s.pickerDoneText}>{t("common.done") || "Done"}</Text>
                </Pressable>
              )}
              <DateTimePicker value={eventTime} mode="time" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={onTimeChange} />
            </View>
          )}

          <Text style={s.label}>{t("events.location") || "Location"}</Text>
          <PlacesAutocompleteInput
            value={eventForm.location}
            onChangeText={(text) => onFormChange({ ...eventForm, location: text })}
            onSelectPlace={(address, lat, lng) => onFormChange({ ...eventForm, location: address, latitude: lat, longitude: lng })}
            placeholder={t("events.locationPlaceholder") || "Location or address"}
            style={s.input}
            nearLat={nearLat}
            nearLng={nearLng}
          />

          <Text style={s.label}>{t("events.theme") || "Theme"}</Text>
          <Pressable style={s.selector} onPress={() => onShowThemePicker(!showThemePicker)}>
            <View style={s.themeChipPreview}>
              {eventForm.theme ? (
                <>
                  <Text style={s.themeChipEmoji}>{themeList.find(th => th.slug === eventForm.theme)?.emoji || DEFAULT_EVENT_THEME.emoji}</Text>
                  <Text style={s.themeChipText}>{themeList.find(th => th.slug === eventForm.theme)?.label || DEFAULT_EVENT_THEME.label}</Text>
                </>
              ) : (
                <Text style={s.selectorText}>{t("events.selectTheme") || "Select theme"}</Text>
              )}
            </View>
            <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
          </Pressable>

          {showThemePicker && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.themeChipsRow}>
              {themeList.map((theme) => (
                <Pressable
                  key={theme.slug}
                  style={[s.themeChip, eventForm.theme === theme.slug && { backgroundColor: theme.color || COLORS.primary, borderColor: theme.color || COLORS.primary }]}
                  onPress={() => {
                    onFormChange({ ...eventForm, theme: eventForm.theme === theme.slug ? "" : theme.slug });
                    onShowThemePicker(false);
                  }}
                >
                  <Text style={s.themeChipEmoji}>{theme.emoji || "🎉"}</Text>
                  <Text style={[s.themeChipText, eventForm.theme === theme.slug && s.themeChipTextActive]}>{theme.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={s.privateRow}>
            <View style={s.privateLabelContainer}>
              <Text style={s.labelNoMargin}>{t("events.private") || "Private"}</Text>
              <Text style={s.labelHint}>{t("business.privateHint") || "Password required to join"}</Text>
            </View>
            <Pressable
              style={[s.toggle, eventForm.is_private && s.toggleActive]}
              onPress={() => onFormChange({ ...eventForm, is_private: !eventForm.is_private, password: eventForm.is_private ? "" : eventForm.password })}
            >
              <View style={[s.toggleKnob, eventForm.is_private && s.toggleKnobActive]} />
            </Pressable>
          </View>

          {eventForm.is_private && (
            <>
              <Text style={s.label}>{t("business.password") || "Password"}</Text>
              <TextInput
                style={s.input}
                value={eventForm.password}
                onChangeText={(text) => onFormChange({ ...eventForm, password: text })}
                placeholder={t("business.passwordPlaceholder") || "Password"}
                placeholderTextColor={COLORS.textDisabled}
                secureTextEntry
              />
            </>
          )}

          <View style={{ height: SPACING.huge }} />
        </ScrollView>

        <View style={s.footer}>
          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelBtnText}>{t("common.cancel") || "Cancel"}</Text>
          </Pressable>
          <Pressable style={s.saveBtn} onPress={onSave}>
            <Text style={s.saveBtnText}>
              {eventEditing ? t("common.save") || "Save" : t("common.create") || "Create"}
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
  selectorText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textDisabled,
  },
  selectorTextSelected: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
  },
  themeChipPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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

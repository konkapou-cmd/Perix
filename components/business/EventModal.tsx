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
  tagged_artist_ids: string[];
};

type ArtistSuggestion = {
  artist_id: string;
  name: string;
  profile_photo?: string | null;
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
  availableArtists?: ArtistSuggestion[];
};

const themesMap = EVENT_THEMES;

function formToMedia(form: EventForm): MediaItem[] {
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

function mediaToForm(media: MediaItem[], base: EventForm): EventForm {
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
  availableArtists,
}: Props) {
  const { t } = useTranslation();
  const [artistQuery, setArtistQuery] = useState("");
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);

  const taggedArtists = (availableArtists || []).filter(a =>
    (eventForm.tagged_artist_ids || []).includes(a.artist_id)
  );

  const filteredArtistSuggestions = artistQuery.trim()
    ? (availableArtists || []).filter(a =>
        a.name.toLowerCase().includes(artistQuery.toLowerCase()) &&
        !(eventForm.tagged_artist_ids || []).includes(a.artist_id)
      ).slice(0, 10)
    : [];

  const handleSelectArtist = (artist: ArtistSuggestion) => {
    const ids = [...(eventForm.tagged_artist_ids || []), artist.artist_id];
    onFormChange({ ...eventForm, tagged_artist_ids: ids });
    setArtistQuery("");
    setShowArtistSuggestions(false);
  };

  const handleRemoveArtist = (artistId: string) => {
    onFormChange({
      ...eventForm,
      tagged_artist_ids: (eventForm.tagged_artist_ids || []).filter(id => id !== artistId)
    });
  };

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
        tagged_artist_ids: eventEditing.tagged_artist_ids || [],
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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

          {/* Artist Tagging */}
          <View style={s.artistSection}>
            <Text style={s.label}>{t("events.tagArtists", "Tag Artists")}</Text>
            {taggedArtists.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.taggedArtistsRow}>
                {taggedArtists.map((artist) => (
                  <Pressable key={artist.artist_id} style={s.taggedArtistChip} onPress={() => handleRemoveArtist(artist.artist_id)}>
                    {artist.profile_photo ? (
                      <Image source={{ uri: artist.profile_photo }} style={s.taggedArtistAvatar} />
                    ) : (
                      <View style={[s.taggedArtistAvatar, s.taggedArtistAvatarPlaceholder]}>
                        <Ionicons name="person" size={14} color={COLORS.textMuted} />
                      </View>
                    )}
                    <Text style={s.taggedArtistName} numberOfLines={1}>{artist.name}</Text>
                    <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <View style={s.artistInputRow}>
              <Ionicons name="search" size={16} color={COLORS.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={artistQuery}
                onChangeText={(text) => { setArtistQuery(text); setShowArtistSuggestions(!!text.trim()); }}
                placeholder={t("events.searchArtists", "Search artists...")}
                placeholderTextColor={COLORS.textDisabled}
                onFocus={() => artistQuery.trim() && setShowArtistSuggestions(true)}
              />
              {artistQuery ? (
                <Pressable onPress={() => { setArtistQuery(""); setShowArtistSuggestions(false); }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {showArtistSuggestions && filteredArtistSuggestions.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.artistSuggestionsRow}>
                {filteredArtistSuggestions.map((artist) => (
                  <Pressable key={artist.artist_id} style={s.artistSuggestionChip} onPress={() => handleSelectArtist(artist)}>
                    {artist.profile_photo ? (
                      <Image source={{ uri: artist.profile_photo }} style={s.artistSuggestionAvatar} />
                    ) : (
                      <View style={[s.artistSuggestionAvatar, s.artistSuggestionAvatarPlaceholder]}>
                        <Ionicons name="person" size={14} color={COLORS.textMuted} />
                      </View>
                    )}
                    <Text style={s.artistSuggestionName} numberOfLines={1}>{artist.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

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

          <View style={{ height: 140 }} />
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
  // Artist tagging
  artistSection: {
    marginBottom: SPACING.small,
  },
  taggedArtistsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
  },
  taggedArtistChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary + "15",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
  },
  taggedArtistAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  taggedArtistAvatarPlaceholder: {
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  taggedArtistName: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textPrimary,
    maxWidth: 100,
  },
  artistInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.small,
    paddingVertical: Platform.OS === "web" ? 8 : 6,
    backgroundColor: COLORS.background,
  },
  artistSuggestionsRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
  },
  artistSuggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.backgroundPage,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  artistSuggestionAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  artistSuggestionAvatarPlaceholder: {
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  artistSuggestionName: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textPrimary,
    maxWidth: 100,
  },
});

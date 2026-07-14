import { useState, useEffect, useRef } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { CalendarList } from "react-native-calendars";
import UnifiedMediaGallery, { MediaItem } from "../UnifiedMediaGallery";
import PlacesAutocompleteInput from "../PlacesAutocompleteInput";
import FormScreen from "../ui/FormScreen";
import FormBottomBar from "../ui/FormBottomBar";

type JobForm = {
  title: string;
  description: string;
  cover_image: string;
  image_urls: string[];
  gallery_images: string[];
  gallery_videos: string[];
  video_url: string;
  job_type: string;
  requirements: string;
  salary_range: string;
  work_location: string;
  expires_at: string;
  status: "draft" | "published";
};

type Props = {
  visible: boolean;
  onClose: () => void;
  jobForm: JobForm;
  onFormChange: (form: JobForm) => void;
  onSave: () => void;
  isSaving?: boolean;
  editingId?: string | null;
  sessionToken?: string;
  nearLat?: number;
  nearLng?: number;
  businessAddress?: string;
};

function formToMedia(form: JobForm): MediaItem[] {
  const items: MediaItem[] = [];
  const seen = new Set<string>();
  if (form.cover_image) {
    seen.add(form.cover_image);
    items.push({ uri: form.cover_image, type: "image", isCoverImage: true, focalPoint: (form as any).cover_focal_point ?? { x: 0.5, y: 0.5 } });
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

function mediaToForm(media: MediaItem[], base: JobForm): JobForm {
  const coverImageItem = media.find((m) => m.isCoverImage && m.type === "image");
  const coverVideoItem = media.find((m) => m.isCoverVideo && m.type === "video");
  const coverItem = coverImageItem || coverVideoItem;
  const images = media.filter((m) => m.type === "image").map((m) => m.uri);
  const videos = media.filter((m) => m.type === "video").map((m) => m.uri);
  return {
    ...base,
    cover_image: coverImageItem?.uri || (coverVideoItem ? "" : images[0]) || "",
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

const JOB_TYPES = [
  { key: "Vollzeit", label: "Vollzeit" },
  { key: "Teilzeit", label: "Teilzeit" },
  { key: "Vertrag", label: "Vertrag" },
  { key: "Praktikum", label: "Praktikum" },
  { key: "Remote", label: "Remote" },
];

const STATUS_LABELS: Record<string, string> = { draft: "Entwurf", published: "Veröffentlicht" };

export default function JobModal({
  visible,
  onClose,
  jobForm,
  onFormChange,
  onSave,
  isSaving,
  editingId,
  sessionToken,
  nearLat,
  nearLng,
  businessAddress,
}: Props) {
  const { t } = useTranslation();
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isEditing = !!editingId;
  const modalTitle = isEditing ? t("jobs.editJob", "Job bearbeiten") : t("jobs.createJob", "Stellenanzeige erstellen");

  useEffect(() => {
    if (visible && !isEditing && !jobForm.work_location && businessAddress) {
      onFormChange({ ...jobForm, work_location: businessAddress });
    }
  }, [visible]);

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return t("jobs.selectExpiry", "Select expiry date");
    const clean = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const [y, m, d] = clean.split("-");
    return `${d}.${m}.${y}`;
  };

  const handleFormChange = (key: keyof JobForm, value: any) => {
    onFormChange({ ...jobForm, [key]: value });
  };

  const media = formToMedia(jobForm);
  const formRef = useRef(jobForm);
  formRef.current = jobForm;
  const handleMediaChange = (newMedia: MediaItem[]) => {
    onFormChange(mediaToForm(newMedia, formRef.current));
  };

  return (
    <>
    <FormScreen title={modalTitle} onClose={onClose}>
      <UnifiedMediaGallery
              media={media}
              onChange={handleMediaChange}
              sessionToken={sessionToken}
              label={t("jobs.coverImage") || "Cover Image"}
            />

            <Text style={s.label}><Text style={s.required}>* </Text>{t("jobs.jobTitle") || "Job Title"}</Text>
            <TextInput
              style={s.input}
              value={jobForm.title}
              onChangeText={(v) => handleFormChange("title", v)}
              placeholder={t("jobs.jobTitlePlaceholder") || "e.g. Senior Software Engineer"}
              placeholderTextColor={COLORS.textDisabled}
            />

            <Text style={s.label}><Text style={s.required}>* </Text>{t("jobs.jobDescription") || "Description"}</Text>
            <TextInput
              style={[s.input, s.textArea]}
              value={jobForm.description}
              onChangeText={(v) => handleFormChange("description", v)}
              placeholder={t("jobs.descriptionPlaceholder") || "Describe the role, responsibilities, and ideal candidate..."}
              placeholderTextColor={COLORS.textDisabled}
              multiline
            />

            <Text style={s.label}>{t("jobs.jobType") || "Art"}</Text>
            <View style={s.chipRow}>
              {JOB_TYPES.map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={[s.chip, jobForm.job_type === key && s.chipSelected]}
                  onPress={() => handleFormChange("job_type", jobForm.job_type === key ? "" : key)}
                >
                  <Text style={[s.chipText, jobForm.job_type === key && s.chipTextSelected]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.label}>{t("jobs.requirements") || "Anforderungen"}</Text>
            <TextInput
              style={[s.input, s.textArea]}
              value={jobForm.requirements}
              onChangeText={(v) => handleFormChange("requirements", v)}
              placeholder={t("jobs.requirementsPlaceholder") || "Welche Qualifikationen werden benötigt?"}
              placeholderTextColor={COLORS.textDisabled}
              multiline
            />

            <Text style={s.label}>{t("jobs.salaryRange") || "Gehalt"}</Text>
            <TextInput
              style={s.input}
              value={jobForm.salary_range}
              onChangeText={(v) => handleFormChange("salary_range", v)}
              placeholder={t("jobs.salaryPlaceholder") || "z.B. 3.000 €"}
              placeholderTextColor={COLORS.textDisabled}
            />

            <Text style={s.label}>{t("jobs.workLocation") || "Arbeitsort"}</Text>
            <PlacesAutocompleteInput
              value={jobForm.work_location}
              onChangeText={(text) => handleFormChange("work_location", text)}
              onSelectPlace={(address) => handleFormChange("work_location", address)}
              placeholder={businessAddress || t("jobs.locationPlaceholder") || "z.B. Berlin, Deutschland oder Remote"}
              style={s.input}
              nearLat={nearLat}
              nearLng={nearLng}
              confirmed={!!jobForm.work_location}
            />

            <Text style={s.label}>{t("jobs.expiresAt") || "Läuft ab am"}</Text>
            <Pressable style={s.selector} onPress={() => setShowDatePicker(true)}>
              <Text style={jobForm.expires_at ? s.selectorTextSelected : s.selectorText}>
                {jobForm.expires_at ? formatDateShort(jobForm.expires_at) : t("jobs.selectExpiry") || "Ablaufdatum wählen"}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
            </Pressable>

            <Text style={s.label}>{t("common.status") || "Status"}</Text>
            <View style={s.chipRow}>
              {(Object.entries(STATUS_LABELS) as [string, string][]).map(([key, label]) => (
                <Pressable
                  key={key}
                  style={[s.chip, jobForm.status === key && s.chipSelected]}
                  onPress={() => handleFormChange("status", jobForm.status === key ? "draft" : key as "draft" | "published")}
                >
                  <Text style={[s.chipText, jobForm.status === key && s.chipTextSelected]}>{label}</Text>
                </Pressable>
              ))}
            </View>

      <FormBottomBar
        onCancel={onClose}
        onSave={onSave}
        isSaving={isSaving}
        disabled={!jobForm.title.trim() || !jobForm.description.trim()}
        saveLabel={isEditing ? t("common.save", "Speichern") : t("jobs.create", "Job erstellen")}
      />
    </FormScreen>

      {/* Date picker modal */}
      <Modal visible={showDatePicker} animationType="slide" transparent>
        <View style={s.calendarOverlay}>
          <View style={s.calendarContainer}>
            <View style={s.calendarHeader}>
              <Pressable onPress={() => setShowDatePicker(false)}>
                <Text style={s.calendarDoneText}>{t("common.done", "Done")}</Text>
              </Pressable>
            </View>
            <CalendarList
              horizontal
              pagingEnabled
              showsVerticalScrollIndicator={false}
              onDayPress={(day) => {
                handleFormChange("expires_at", day.dateString);
                setShowDatePicker(false);
              }}
              markedDates={jobForm.expires_at ? { [jobForm.expires_at]: { selected: true, selectedColor: COLORS.primary } } : {}}
              theme={{
                todayTextColor: COLORS.primary,
                selectedDayBackgroundColor: COLORS.primary,
                arrowColor: COLORS.primary,
              }}
            />
          </View>
        </View>
      </Modal>
    </>
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
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
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
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.small,
  },
  chip: {
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipSelected: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  chipText: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textSecondary,
  },
  chipTextSelected: {
    color: "#fff",
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  calendarContainer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: "70%",
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  calendarDoneText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.primary,
  },
});

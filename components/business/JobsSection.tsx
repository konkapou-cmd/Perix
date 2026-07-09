import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Job } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { formatDate } from "../../lib/formatDate";
import { EmptyState } from "../shared";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";

type Props = {
  jobs: Job[];
  readOnly?: boolean;
  onAddJob?: () => void;
  onEditJob?: (job: Job) => void;
  onDeleteJob?: (jobId: string) => void;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  secondaryColor?: string;
};

export default function JobsSection({
  jobs,
  readOnly = false,
  onAddJob,
  onEditJob,
  onDeleteJob,
  primaryColor = COLORS.primary,
  cardColor = "#fff",
  textColor = COLORS.textPrimary,
  secondaryColor = COLORS.textSecondary,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={s.container}>
      <View style={s.sectionHeader}>
        <Text style={[s.cardTitle, { color: textColor }]}>{t("jobs.myJobs")}</Text>
        {!readOnly && onAddJob && (
          <Pressable style={[s.addButton, { backgroundColor: primaryColor }]} onPress={onAddJob}>
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={s.addButtonText}>{t("jobs.createJob")}</Text>
          </Pressable>
        )}
      </View>

      {jobs.length === 0 ? (
        <EmptyState icon="briefcase" message={t("jobs.noJobs")} subMessage={readOnly ? undefined : t("jobs.addFirstJob")} />
      ) : (
        <View style={s.grid}>
          {jobs.map((job) => {
            const imageUrl = job.cover_image || job.image_urls?.[0] || job.gallery_images?.[0];
            const hasVideo = !!job.video_url;

            return (
              <View key={job.job_id} style={[s.card, { backgroundColor: cardColor }]}>
                <Pressable
                  style={s.cardContent}
                  onPress={() => router.push(`/job/${job.job_id}`)}
                >
                  <View style={s.imageContainer}>
                    {job.cover_image ? (
                      <FocalImage uri={job.cover_image} focalPoint={job.cover_focal_point} style={s.image} showLoader={false} />
                    ) : hasVideo ? (
                      <AdaptiveVideo uri={job.video_url || ""} autoPlay style={s.image} isLooping initialMuted />
                    ) : imageUrl ? (
                      <FocalImage uri={imageUrl} focalPoint={job.cover_focal_point} style={s.image} showLoader={false} />
                    ) : (
                      <View style={[s.imagePlaceholder, { backgroundColor: `${primaryColor}30` }]}>
                        <Ionicons name="briefcase" size={36} color={primaryColor} />
                      </View>
                    )}
                    {job.job_type && (
                      <View style={[s.typeBadge, { backgroundColor: primaryColor }]}>
                        <Text style={s.typeBadgeLabel}>{job.job_type}</Text>
                      </View>
                    )}
                    {job.is_active ? (
                      <View style={s.activeBadge}>
                        <Ionicons name="checkmark-circle" size={10} color="#fff" />
                        <Text style={s.activeText}>{t("jobs.active", "Active")}</Text>
                      </View>
                    ) : (
                      <View style={s.inactiveBadge}>
                        <Text style={s.inactiveText}>{t("jobs.inactive", "Inactive")}</Text>
                      </View>
                    )}
                  </View>
                  <View style={s.info}>
                    <Text style={[s.title, { color: textColor }]} numberOfLines={1}>
                      {job.title}
                    </Text>
                    {job.salary_range && (
                      <View style={s.metaRow}>
                        <Ionicons name="cash-outline" size={12} color={secondaryColor} />
                        <Text style={[s.metaText, { color: secondaryColor }]}>
                          {job.salary_range}
                        </Text>
                      </View>
                    )}
                    {job.work_location && (
                      <View style={s.metaRow}>
                        <Ionicons name="location-outline" size={12} color={secondaryColor} />
                        <Text style={[s.metaText, { color: secondaryColor }]} numberOfLines={1}>
                          {job.work_location}
                        </Text>
                      </View>
                    )}
                    {job.expires_at ? (
                      <View style={[s.statusBadge, { backgroundColor: `${primaryColor}20` }]}>
                        <Text style={[s.statusText, { color: primaryColor }]}>
                          {t("jobs.expiresAt")}: {formatDate(job.expires_at)}
                        </Text>
                      </View>
                    ) : (
                      <View style={[s.statusBadge, { backgroundColor: `${COLORS.success}20` }]}>
                        <Text style={[s.statusText, { color: COLORS.success }]}>
                          {t("jobs.noExpiry", "No expiry")}
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
                {!readOnly && onDeleteJob && (
                  <View style={s.actions}>
                    {onEditJob && (
                      <Pressable style={s.actionBtn} onPress={() => onEditJob(job)}>
                        <Ionicons name="create-outline" size={18} color={primaryColor} />
                      </Pressable>
                    )}
                    <Pressable style={s.actionBtn} onPress={() => onDeleteJob(job.job_id)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingTop: SPACING.small,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.small,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.small,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
    fontSize: FONT_SIZES.bodySmall,
  },
  grid: {
    gap: SPACING.small,
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    ...SHADOWS.subtle,
  },
  cardContent: {
    flex: 1,
  },
  imageContainer: {
    position: "relative",
    height: 140,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadge: {
    position: "absolute",
    top: SPACING.small,
    left: SPACING.small,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
  },
  typeBadgeLabel: {
    color: "#fff",
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  activeBadge: {
    position: "absolute",
    bottom: SPACING.small,
    left: SPACING.small,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#10b981",
  },
  activeText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  inactiveBadge: {
    position: "absolute",
    bottom: SPACING.small,
    left: SPACING.small,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  inactiveText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  info: {
    padding: SPACING.small,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: SPACING.tiny,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.tiny,
    marginBottom: 2,
  },
  metaText: {
    fontSize: FONT_SIZES.small,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.tiny,
  },
  statusText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.small,
    gap: SPACING.small,
    paddingBottom: SPACING.small,
  },
  actionBtn: {
    padding: SPACING.tiny,
  },
});

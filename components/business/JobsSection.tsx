import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Job } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { entityRoutes, pushEntityRoute, showInvalidEntityAlert } from "../../lib/navigation/entityRoutes";
import { jobTypeIcon } from "../../lib/categoryTranslation";
import { formatDate } from "../../lib/formatDate";
import { EmptyState } from "../shared";
import StatusBadge from "../ui/StatusBadge";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";
import { SectionHeader } from "../shared/SectionHeader";

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
  onViewApplications?: () => void;
  applicationsCount?: number;
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
  onViewApplications,
  applicationsCount = 0,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={s.container}>
      <SectionHeader
        icon="briefcase"
        title={t("jobs.myJobs", "Meine Stellenanzeigen")}
        accent={primaryColor}
        onSeeAll={!readOnly && onAddJob ? onAddJob : undefined}
        seeAllLabel={t("jobs.createJob", "Job erstellen")}
        style={{ paddingHorizontal: SPACING.std }}
      />

      {onViewApplications && (
        <Pressable style={s.applicationsBtn} onPress={onViewApplications}>
          <Ionicons name="mail-open-outline" size={16} color="#264348" />
          <Text style={s.applicationsText}>
            {t("jobs.receivedApplications", "Eingegangene Bewerbungen")}
            {applicationsCount > 0 ? ` (${applicationsCount})` : ""}
          </Text>
          <Ionicons name="chevron-forward" size={16} color="#264348" />
        </Pressable>
      )}

      {jobs.length === 0 ? (
        <EmptyState icon="briefcase" message={t("jobs.noJobs")} subMessage={readOnly ? undefined : t("jobs.addFirstJob")} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel}>
          {jobs.map((job) => {
            const imageUrl = job.cover_image || job.image_urls?.[0] || job.gallery_images?.[0];
            const hasVideo = !!job.video_url;

            return (
              <View key={job.job_id} style={[s.card, { backgroundColor: cardColor }]}>
                <Pressable
                  style={s.cardContent}
                  onPress={() => pushEntityRoute(router, entityRoutes.job(job.job_id), () => showInvalidEntityAlert(t as any))}
                >
                  <View style={s.cardMedia}>
                    {job.cover_image ? (
                      <FocalImage uri={job.cover_image} aspectRatio={16 / 9} focalPoint={job.cover_focal_point} borderRadius={0} showLoader={false} style={StyleSheet.absoluteFill as any} />
                    ) : hasVideo ? (
                      <AdaptiveVideo uri={job.video_url || ""} autoPlay style={{ width: "100%", height: "100%" }} isLooping initialMuted />
                    ) : imageUrl ? (
                      <FocalImage uri={imageUrl} aspectRatio={16 / 9} focalPoint={job.cover_focal_point} borderRadius={0} showLoader={false} style={StyleSheet.absoluteFill as any} />
                    ) : (
                      <View style={[s.imagePlaceholder, { backgroundColor: `${primaryColor}30` }]}>
                        <Ionicons name={jobTypeIcon(job.job_type) as any} size={36} color={primaryColor} />
                      </View>
                    )}
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.75)"]}
                      locations={[0.45, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={s.badgesWrap}>
                      {job.job_type && (
                        <StatusBadge label={job.job_type} color={primaryColor} size="sm" />
                      )}
                      {job.is_active ? (
                        <StatusBadge label={t("jobs.active", "Aktiv")} variant="active" size="sm" />
                      ) : (
                        <StatusBadge label={t("jobs.inactive", "Inactive")} variant="draft" size="sm" />
                      )}
                    </View>
                  </View>
                  <View style={s.info}>
                    <Text style={s.title} numberOfLines={1}>
                      {job.title}
                    </Text>
                    {job.salary_range && (
                      <View style={s.metaRow}>
                        <Ionicons name="cash-outline" size={12} color="rgba(255,255,255,0.85)" />
                        <Text style={s.metaText}>
                          {job.salary_range}
                        </Text>
                      </View>
                    )}
                    {job.work_location && (
                      <View style={s.metaRow}>
                        <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.85)" />
                        <Text style={s.metaText} numberOfLines={1}>
                          {job.work_location}
                        </Text>
                      </View>
                    )}
                    {job.expires_at ? (
                      <View style={s.metaRow}>
                        <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.85)" />
                        <Text style={s.metaText}>
                          {t("jobs.expiresAt")}: {formatDate(job.expires_at)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
                {!readOnly && onDeleteJob && (
                  <View style={s.actions}>
                    {onEditJob && (
                      <Pressable style={s.actionBtn} onPress={() => onEditJob(job)}>
                        <Ionicons name="create-outline" size={16} color="#fff" />
                      </Pressable>
                    )}
                    <Pressable style={s.actionBtn} onPress={() => onDeleteJob(job.job_id)}>
                       <Ionicons name="trash-outline" size={16} color="#fff" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
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
  carousel: {
    gap: SPACING.small,
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.small,
  },
  applicationsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: SPACING.std,
    marginBottom: SPACING.small,
    alignSelf: "flex-start",
  },
  applicationsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#264348",
  },
  card: {
    width: 200,
    height: 240,
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
    ...SHADOWS.subtle,
  },
  cardContent: {
    flex: 1,
  },
  cardMedia: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  badgesWrap: {
    position: "absolute",
    top: SPACING.small,
    left: SPACING.small,
    gap: 4,
    alignItems: "flex-start",
    zIndex: 5,
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
    flexShrink: 1,
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
    color: "rgba(255,255,255,0.85)",
    flexShrink: 1,
  },
  actions: {
    position: "absolute",
    top: SPACING.small,
    right: SPACING.small,
    flexDirection: "row",
    gap: SPACING.small,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});

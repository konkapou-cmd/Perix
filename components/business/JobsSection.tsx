import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Job } from "../../lib/api";
import { COLORS, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";
import { formatDate } from "../../lib/formatDate";

type Props = {
  jobs: Job[];
  readOnly?: boolean;
  onAddJob?: () => void;
  onEditJob?: (job: Job) => void;
  onDeleteJob?: (jobId: string) => void;
};

export default function JobsSection({ jobs, readOnly = false, onAddJob, onEditJob, onDeleteJob }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("jobs.myJobs")}</Text>
      {jobs.length === 0 ? (
        <Text style={styles.emptyText}>{t("jobs.noMyJobs")}</Text>
      ) : (
        jobs.map((job) => (
          <View key={job.job_id} style={styles.eventRow}>
            {job.cover_image ? (
              <Image source={{ uri: job.cover_image }} style={styles.jobCoverThumb} />
            ) : (
              <View style={[styles.jobCoverThumb, styles.jobCoverPlaceholder]}>
                <Ionicons name="briefcase" size={16} color="#9ca3af" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.eventTitle}>{job.title}</Text>
              <Text style={styles.eventMeta}>
                {job.expires_at ? `${t("jobs.expiresAt")}: ${formatDate(job.expires_at)}` : ""}
              </Text>
            </View>
            {!readOnly && onDeleteJob && (
              <View style={{ flexDirection: "row", gap: 4 }}>
                {onEditJob && (
                  <Pressable style={styles.iconButton} onPress={() => onEditJob(job)}>
                    <Ionicons name="create-outline" size={18} color={COLORS.textPrimary} />
                  </Pressable>
                )}
                <Pressable style={styles.iconButton} onPress={() => onDeleteJob(job.job_id)}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles: Record<string, any> = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
  },
  eventMeta: {
    fontSize: FONT_SIZES.small,
    color: "#9ca3af",
    marginTop: 2,
  },
  iconButton: {
    padding: 8,
  },
  jobCoverThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  jobCoverPlaceholder: {
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Job } from "../../lib/api";

type Props = {
  jobs: Job[];
  readOnly?: boolean;
  onAddJob?: () => void;
  onDeleteJob?: (jobId: string) => void;
};

export default function JobsSection({ jobs, readOnly = false, onAddJob, onDeleteJob }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t("jobs.myJobs")}</Text>
        {!readOnly && onAddJob && (
          <Pressable style={styles.addButton} onPress={onAddJob} data-testid="add-job-btn">
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>{t("jobs.postJob")}</Text>
          </Pressable>
        )}
      </View>
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
                {job.expires_at ? `${t("jobs.expiresAt")}: ${job.expires_at.split("T")[0]}` : ""}
              </Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => onDeleteJob?.(job.job_id)}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#000000",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  eventMeta: {
    color: "#9ca3af",
    fontSize: 12,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
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

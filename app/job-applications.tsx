import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { getReceivedJobApplications, updateApplicationStatus } from "../lib/api/jobs";
import { JobApplication } from "../lib/api/core";
import { formatDate } from "../lib/formatDate";
import { SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";
import EmptyState from "../components/shared/EmptyState";

type Application = JobApplication & { job_title?: string };

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Offen", color: "#f59e0b" },
  reviewed: { label: "Geprüft", color: "#59ABE3" },
  accepted: { label: "Angenommen", color: "#22c55e" },
  rejected: { label: "Abgelehnt", color: "#ef4444" },
};

export default function JobApplicationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await getReceivedJobApplications(sessionToken);
      setApplications(data || []);
    } catch (e) {
      console.warn("Failed to load received applications:", e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatus = async (applicationId: string, status: "accepted" | "rejected") => {
    if (!sessionToken) return;
    try {
      await updateApplicationStatus(sessionToken, applicationId, status);
      setApplications((prev) =>
        prev.map((a) => (a.application_id === applicationId ? { ...a, status } : a))
      );
    } catch (e) {
      console.warn("Failed to update application status:", e);
    }
  };

  const openDoc = (url?: string) => {
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color="#264348" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("jobs.receivedApplications", "Eingegangene Bewerbungen")}</Text>
        <View style={styles.closeBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#59ABE3" />
        </View>
      ) : applications.length === 0 ? (
        <EmptyState icon="mail-open-outline" message={t("jobs.noApplications", "Noch keine Bewerbungen eingegangen")} size="large" muted />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {applications.map((app) => {
            const meta = STATUS_META[app.status] || STATUS_META.pending;
            return (
              <View key={app.application_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.applicantWrap}>
                    <Pressable onPress={() => router.push(`/user/${app.applicant_id}` as any)}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(app.applicant_name || "?").charAt(0).toUpperCase()}</Text>
                      </View>
                    </Pressable>
                    <View style={styles.applicantInfo}>
                      <Pressable onPress={() => router.push(`/user/${app.applicant_id}` as any)}>
                        <Text style={styles.applicantName}>{app.applicant_name}</Text>
                      </Pressable>
                      {app.job_title ? <Text style={styles.jobTitle} numberOfLines={1}>{app.job_title}</Text> : null}
                      <Text style={styles.date}>{app.created_at ? formatDate(app.created_at.slice(0, 10)) : ""}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: meta.color + "20" }]}>
                    <Text style={[styles.statusText, { color: meta.color }]}>{t(`jobs.${app.status}`, meta.label)}</Text>
                  </View>
                </View>

                {app.message ? <Text style={styles.message}>{app.message}</Text> : null}

                <View style={styles.docRow}>
                  {app.cv_url ? (
                    <Pressable style={styles.docBtn} onPress={() => openDoc(app.cv_url)}>
                      <Ionicons name="document-text-outline" size={16} color="#264348" />
                      <Text style={styles.docText}>{t("jobs.cvAttached", "Lebenslauf ansehen")}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.docMissing}>{t("jobs.noCv", "Kein Lebenslauf hochgeladen")}</Text>
                  )}
                  {app.cover_letter_url ? (
                    <Pressable style={styles.docBtn} onPress={() => openDoc(app.cover_letter_url)}>
                      <Ionicons name="mail-outline" size={16} color="#264348" />
                      <Text style={styles.docText}>{t("jobs.coverLetterAttached", "Anschreiben ansehen")}</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.actionBtn, { borderColor: "rgba(38,67,72,0.25)" }]}
                    onPress={() => handleStatus(app.application_id, "rejected")}
                  >
                    <Ionicons name="close" size={18} color="#ef4444" />
                    <Text style={[styles.actionText, { color: "#ef4444" }]}>{t("jobs.reject", "Ablehnen")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, { backgroundColor: "#22c55e", borderColor: "#22c55e" }]}
                    onPress={() => handleStatus(app.application_id, "accepted")}
                  >
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={[styles.actionText, { color: "#fff" }]}>{t("jobs.accept", "Annehmen")}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(38,67,72,0.15)",
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: FONT_SIZES.h4, fontWeight: FONT_WEIGHTS.semibold as any, color: "#264348" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  body: { padding: SPACING.std, paddingBottom: 40, gap: SPACING.small },
  card: {
    backgroundColor: "#fff",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.15)",
    padding: SPACING.std,
    gap: SPACING.small,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  applicantWrap: { flexDirection: "row", alignItems: "center", gap: SPACING.small, flex: 1 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(89,171,227,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#59ABE3" },
  applicantInfo: { flex: 1 },
  applicantName: { fontSize: 15, fontWeight: "600", color: "#59ABE3" },
  jobTitle: { fontSize: 12, color: "#59ABE3", marginTop: 1 },
  date: { fontSize: 11, color: "rgba(38,67,72,0.65)", marginTop: 1 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: BORDER_RADIUS.full },
  statusText: { fontSize: 12, fontWeight: "700" },
  message: { fontSize: 14, color: "#264348", lineHeight: 20 },
  docRow: { flexDirection: "row", gap: SPACING.small },
  docBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "rgba(89,171,227,0.12)",
  },
  docText: { fontSize: 13, fontWeight: "600", color: "#264348" },
  docMissing: { fontSize: 12, color: "rgba(38,67,72,0.65)", fontStyle: "italic" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: SPACING.small },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
  },
  actionText: { fontSize: 13, fontWeight: "600" },
});

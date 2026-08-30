import React from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { JobApplication } from "../../lib/api/core";
import { formatDate } from "../../lib/formatDate";
import EmptyState from "../shared/EmptyState";

type Application = JobApplication & { job_title?: string };

type Props = {
  visible: boolean;
  applications: Application[];
  loading: boolean;
  onClose: () => void;
  onStatusChange: (applicationId: string, status: "accepted" | "rejected") => void;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Offen", color: "#f59e0b" },
  reviewed: { label: "Geprüft", color: "#59ABE3" },
  accepted: { label: "Angenommen", color: "#22c55e" },
  rejected: { label: "Abgelehnt", color: "#ef4444" },
};

export default function JobsApplicationsModal({ visible, applications, loading, onClose, onStatusChange }: Props) {
  const { t } = useTranslation();

  const openDoc = (url?: string) => {
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#264348" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("jobs.receivedApplications", "Eingegangene Bewerbungen")}</Text>
          <View style={styles.closeBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <Text style={styles.muted}>…</Text>
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
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{(app.applicant_name || "?").charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={styles.applicantInfo}>
                        <Text style={styles.applicantName}>{app.applicant_name}</Text>
                        {app.job_title ? <Text style={styles.jobTitle} numberOfLines={1}>{app.job_title}</Text> : null}
                        <Text style={styles.date}>{formatDate(app.created_at.split("T")[0])}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusChip, { backgroundColor: meta.color + "20" }]}>
                      <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>

                  {app.message ? <Text style={styles.message}>{app.message}</Text> : null}

                  <View style={styles.docRow}>
                    {app.cv_url ? (
                      <Pressable style={styles.docBtn} onPress={() => openDoc(app.cv_url)}>
                        <Ionicons name="document-text-outline" size={16} color="#264348" />
                        <Text style={styles.docText}>{t("jobs.cv", "Lebenslauf")}</Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.docMissing}>{t("jobs.noCv", "Kein Lebenslauf hochgeladen")}</Text>
                    )}
                    {app.cover_letter_url ? (
                      <Pressable style={styles.docBtn} onPress={() => openDoc(app.cover_letter_url)}>
                        <Ionicons name="mail-outline" size={16} color="#264348" />
                        <Text style={styles.docText}>{t("jobs.coverLetter", "Anschreiben")}</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.actions}>
                    <Pressable
                      style={[styles.actionBtn, { borderColor: "rgba(38,67,72,0.25)" }]}
                      onPress={() => onStatusChange(app.application_id, "rejected")}
                    >
                      <Ionicons name="close" size={18} color="#ef4444" />
                      <Text style={[styles.actionText, { color: "#ef4444" }]}>{t("jobs.reject", "Ablehnen")}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#22c55e", borderColor: "#22c55e" }]}
                      onPress={() => onStatusChange(app.application_id, "accepted")}
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
    </Modal>
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
  muted: { color: "#264348" },
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
  applicantName: { fontSize: 15, fontWeight: "600", color: "#264348" },
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

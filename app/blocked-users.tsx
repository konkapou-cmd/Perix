import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "../lib/designTokens";
import { useAuth } from "../context/AuthContext";
import { getBlockedUsers, unblockUser } from "../lib/api/social";
import { apiRequest } from "../lib/api/core";

type BlockedUser = {
  user_id: string;
  name: string;
  profile_photo?: string | null;
};

const formatFullDate = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};

export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [busyReport, setBusyReport] = useState<string | null>(null);

  useEffect(() => {
    loadBlockedUsers();
    loadAdminState();
  }, []);

  const loadAdminState = async () => {
    if (!sessionToken) return;
    try {
      const res = await apiRequest<{ is_admin: boolean }>("/admin/check", "GET", sessionToken);
      setIsAdmin(!!res?.is_admin);
      if (res?.is_admin) await loadReports();
    } catch {}
  };

  const loadReports = async () => {
    if (!sessionToken) return;
    try {
      const data = await apiRequest<any[]>("/admin/reports/content", "GET", sessionToken);
      setReports(Array.isArray(data) ? data : []);
    } catch {}
  };

  const resolveReport = async (report: any, action: "dismiss" | "restore" | "hide" | "purge") => {
    if (!sessionToken || busyReport) return;
    setBusyReport(report.report_id);
    try {
      await apiRequest("/admin/reports/resolve", "POST", sessionToken, {
        report_id: report.report_id,
        action,
      });
      await loadReports();
    } catch {}
    setBusyReport(null);
  };

  const blockReportedUser = async (report: any, blocked: boolean) => {
    if (!sessionToken || busyReport) return;
    setBusyReport(report.report_id);
    try {
      await apiRequest("/admin/users/block", "POST", sessionToken, {
        user_id: report.target_id,
        blocked,
      });
      await loadReports();
    } catch {}
    setBusyReport(null);
  };

  const purgeOrphans = async () => {
    if (!sessionToken) return;
    setBusyReport("__orphans__");
    try {
      await apiRequest("/admin/purge-orphans", "POST", sessionToken, {});
      await loadReports();
    } catch {}
    setBusyReport(null);
  };

  const openReportTarget = (report: any) => {
    const id = report?.target_id;
    if (!id) return;
    const routeMap: Record<string, string> = {
      post: "/post/",
      event: "/event/",
      activity: "/activity/",
      business: "/business/",
      artist: "/artist/",
      job: "/job/",
      service: "/service/",
      listing: "/listing/",
      user: "/user/",
    };
    const base = routeMap[report.target_type];
    if (base) router.push(`${base}${id}` as any);
  };

  const loadBlockedUsers = async () => {
    if (!sessionToken) return;
    try {
      const data = await getBlockedUsers(sessionToken);
      setBlockedUsers(data?.blocked_users || []);
    } catch (error) {
      console.error("Failed to load blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = (user: BlockedUser) => {
    Alert.alert(
      t("settings.unblockUser") || "Unblock User",
      t("settings.unblockConfirm") || `Unblock ${user.name}? They will be able to see your content again.`,
      [
        { text: t("common.cancel") || "Cancel", style: "cancel" },
        {
          text: t("settings.unblock") || "Unblock",
          onPress: async () => {
            if (!sessionToken) return;
            setUnblocking(user.user_id);
            try {
              await unblockUser(sessionToken, user.user_id);
              setBlockedUsers(prev => prev.filter(u => u.user_id !== user.user_id));
            } catch (error) {
              console.error("Failed to unblock:", error);
              Alert.alert(t("common.error") || "Error", t("settings.unblockFailed") || "Failed to unblock user");
            } finally {
              setUnblocking(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("settings.blockedUsers") || "Blocked Users"}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.textPrimary} />
        </View>
      ) : blockedUsers.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="ban-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>{t("settings.noBlockedUsers") || "No blocked users"}</Text>
          <Text style={styles.policyText}>
            {t("settings.blockPolicy", "Blocked accounts cannot see your content, message you or interact with you. Reports are reviewed by our team and content with multiple reports is hidden automatically.")}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {blockedUsers.map(user => (
            <View key={user.user_id} style={styles.userRow}>
              {user.profile_photo ? (
                <Image source={{ uri: user.profile_photo }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
              <Pressable
                style={[styles.unblockButton, unblocking === user.user_id && styles.unblockButtonDisabled]}
                onPress={() => handleUnblock(user)}
                disabled={unblocking === user.user_id}
              >
                {unblocking === user.user_id ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <Text style={styles.unblockButtonText}>{t("settings.unblock") || "Unblock"}</Text>
                )}
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {isAdmin && (
        <View style={styles.adminSection}>
          <View style={styles.adminHeaderRow}>
            <Text style={styles.adminTitle}>{t("admin.reports", "Reports")}</Text>
            <Pressable style={styles.orphanBtn} onPress={purgeOrphans} disabled={busyReport === "__orphans__"}>
              {busyReport === "__orphans__" ? (
                <ActivityIndicator size="small" color="#b45309" />
              ) : (
                <Text style={styles.orphanBtnText}>{t("admin.cleanOrphans", "Clean orphans")}</Text>
              )}
            </Pressable>
          </View>
          <View style={styles.rulesBox}>
            <Text style={styles.rulesTitle}>{t("admin.moderationRules", "Moderation & reporting rules")}</Text>
            <Text style={styles.rulesVersion}>{t("admin.moderationVersion", "Version 1.0 · Last updated 23/09/2026")}</Text>
            <Text style={styles.rulesText}>{t("admin.moderationRulesText")}</Text>
          </View>
          <ScrollView style={styles.adminScroll} contentContainerStyle={styles.adminScrollContent}>
            {reports.length === 0 ? (
              <Text style={styles.emptyText}>{t("admin.noReports", "No reports")}</Text>
            ) : (
              reports.map((r) => (
                <Pressable key={r.report_id} style={styles.reportCard} onPress={() => openReportTarget(r)}>
                  <View style={styles.reportHeader}>
                    <Text style={styles.reportType}>{String(r.target_type || "").toUpperCase()}</Text>
                    <Text style={[styles.reportStatus, r.is_hidden ? styles.reportHidden : styles.reportVisible]}>
                      {r.is_hidden ? t("admin.hidden", "Hidden") : t("admin.visible", "Visible")}
                    </Text>
                    {r.reported_is_deleted && (
                      <Text style={styles.reportBadgeDeleted}>{t("admin.deletedAccount", "Deleted account")}</Text>
                    )}
                    {r.reported_is_blocked && (
                      <Text style={styles.reportBadgeBlocked}>{t("admin.blocked", "Blocked")}</Text>
                    )}
                    {r.status === "resolved" && (
                      <Text style={styles.reportResolved}>
                        {t("admin.resolved", "Resolved")}: {r.resolution || "-"}
                      </Text>
                    )}
                    <Ionicons name="open-outline" size={14} color="#9ca3af" style={{ marginLeft: "auto" }} />
                  </View>
                  {r.reported_email ? (
                    <Text style={styles.reportEmail}>{r.reported_email}</Text>
                  ) : null}
                  {r.preview ? <Text style={styles.reportPreview} numberOfLines={2}>{r.preview}</Text> : null}
                  <Text style={styles.reportReason}>{t("admin.reason", "Reason")}: {r.reason || "-"}</Text>
                  {r.reported_at ? (
                    <Text style={styles.reportDate}>{formatFullDate(r.reported_at)}</Text>
                  ) : null}
                  <View style={styles.reportActions}>
                    <Pressable style={styles.reportBtnRestore} disabled={busyReport === r.report_id} onPress={(e) => { (e as any).stopPropagation?.(); resolveReport(r, "restore"); }}>
                      <Text style={styles.reportBtnTextGreen}>{t("admin.restore", "Restore")}</Text>
                    </Pressable>
                    <Pressable style={styles.reportBtnDelete} disabled={busyReport === r.report_id} onPress={(e) => { (e as any).stopPropagation?.(); resolveReport(r, "hide"); }}>
                      <Text style={styles.reportBtnTextRed}>{t("admin.hide", "Hide")}</Text>
                    </Pressable>
                    <Pressable style={styles.reportBtnPurge} disabled={busyReport === r.report_id} onPress={(e) => { (e as any).stopPropagation?.(); resolveReport(r, "purge"); }}>
                      <Text style={styles.reportBtnTextDark}>{t("admin.purge", "Purge")}</Text>
                    </Pressable>
                    <Pressable style={styles.reportBtnDismiss} disabled={busyReport === r.report_id} onPress={(e) => { (e as any).stopPropagation?.(); resolveReport(r, "dismiss"); }}>
                      <Text style={styles.reportBtnTextGray}>{t("admin.dismiss", "Dismiss")}</Text>
                    </Pressable>
                  </View>
                  {r.target_type === "user" && (
                    <View style={styles.reportActions}>
                      <Pressable style={styles.reportBtnBlock} disabled={busyReport === r.report_id} onPress={(e) => { (e as any).stopPropagation?.(); blockReportedUser(r, !r.reported_is_blocked); }}>
                        <Text style={styles.reportBtnTextRed}>
                          {r.reported_is_blocked ? t("admin.unblockEmail", "Unblock email") : t("admin.blockEmail", "Block email")}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  policyText: { fontSize: 13, color: "rgba(38,67,72,0.6)", textAlign: "center", marginTop: 12, paddingHorizontal: 24, lineHeight: 19 },
  adminSection: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, marginTop: 6 },
  adminHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 6 },
  adminTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },
  orphanBtn: { backgroundColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  orphanBtnText: { fontSize: 12, fontWeight: "700", color: "#b45309" },
  adminScroll: { maxHeight: 340 },
  rulesBox: { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#f8fafc", borderRadius: 10, borderWidth: 1, borderColor: "rgba(38,67,72,0.12)", padding: 10 },
  rulesTitle: { fontSize: 12.5, fontWeight: "800", color: "#264348", marginBottom: 4 },
  rulesVersion: { fontSize: 10.5, fontWeight: "600", color: "#8a9aa3", marginBottom: 6 },
  rulesText: { fontSize: 11.5, color: "#4b5a60", lineHeight: 16 },
  adminScrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  reportCard: { backgroundColor: "#fff", borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "rgba(38,67,72,0.1)" },
  reportHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  reportType: { fontSize: 11, fontWeight: "800", color: "#59ABE3", letterSpacing: 0.5 },
  reportStatus: { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  reportResolved: { fontSize: 10, fontWeight: "700", color: "#7c3aed", paddingHorizontal: 6 },
  reportHidden: { backgroundColor: "#fee2e2", color: "#b91c1c" },
  reportVisible: { backgroundColor: "#d1fae5", color: "#065f46" },
  reportBadgeDeleted: { fontSize: 10, fontWeight: "700", color: "#b91c1c", backgroundColor: "#fee2e2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  reportBadgeBlocked: { fontSize: 10, fontWeight: "700", color: "#7f1d1d", backgroundColor: "#fecaca", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  reportEmail: { fontSize: 11.5, color: "#374151", marginTop: 4, fontWeight: "600" },
  reportPreview: { fontSize: 12.5, color: "#1f2937", marginTop: 6, lineHeight: 17 },
  reportReason: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  reportDate: { fontSize: 10.5, color: "#9ca3af", marginTop: 3 },
  reportActions: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  reportBtnRestore: { backgroundColor: "#d1fae5", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  reportBtnDelete: { backgroundColor: "#fee2e2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  reportBtnPurge: { backgroundColor: "#1f2937", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  reportBtnBlock: { backgroundColor: "#fecaca", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: "#fca5a5" },
  reportBtnDismiss: { backgroundColor: "#eef2f4", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  reportBtnTextGreen: { fontSize: 12, fontWeight: "700", color: "#065f46" },
  reportBtnTextRed: { fontSize: 12, fontWeight: "700", color: "#b91c1c" },
  reportBtnTextDark: { fontSize: 12, fontWeight: "700", color: "#f9fafb" },
  reportBtnTextGray: { fontSize: 12, fontWeight: "700", color: "#264348" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, color: "#9ca3af", marginTop: 12 },
  scrollView: { flex: 1 },
  content: { padding: 16 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary },
  userName: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: "500", color: COLORS.textPrimary },
  unblockButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  unblockButtonDisabled: { opacity: 0.5 },
  unblockButtonText: { color: "#ef4444", fontWeight: "600", fontSize: 14 },
});

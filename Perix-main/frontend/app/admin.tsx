import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api/core";
import { COLORS } from "../lib/designTokens";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";

type ContentReport = {
  report_id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  reported_at: string;
  status: string;
  source?: string;
  preview?: string | null;
  is_hidden?: boolean | null;
};

type HiddenPost = {
  post_id: string;
  text: string;
  author_name?: string;
  author_email?: string;
  image_url?: string;
  is_hidden: boolean;
  hidden_reason?: string;
  created_at: string;
};

type HiddenUser = {
  user_id: string;
  name: string;
  email: string;
  profile_photo?: string;
  is_hidden: boolean;
};

export default function AdminPanelScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"reports" | "moderation">("reports");
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [hiddenPosts, setHiddenPosts] = useState<HiddenPost[]>([]);
  const [hiddenUsers, setHiddenUsers] = useState<HiddenUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await apiRequest<ContentReport[]>("/admin/reports/content", "GET", sessionToken);
      setReports(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("admin reports failed", e);
    }
  }, [sessionToken]);

  const loadModeration = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [posts, users] = await Promise.all([
        apiRequest<HiddenPost[]>("/admin/posts?hidden_only=true", "GET", sessionToken),
        apiRequest<HiddenUser[]>("/admin/users?hidden_only=true", "GET", sessionToken),
      ]);
      setHiddenPosts(Array.isArray(posts) ? posts : []);
      setHiddenUsers(Array.isArray(users) ? users : []);
    } catch (e) {
      console.error("admin moderation failed", e);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await apiRequest<{ is_admin: boolean }>("/admin/check", "GET", sessionToken);
        setIsAdmin(!!res?.is_admin);
        if (res?.is_admin) {
          await Promise.all([loadReports(), loadModeration()]);
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionToken, loadReports, loadModeration]);

  const resolveReport = async (report: ContentReport, action: "dismiss" | "restore" | "delete") => {
    if (!sessionToken || busyId) return;
    setBusyId(report.report_id);
    try {
      await apiRequest("/admin/reports/resolve", "POST", sessionToken, {
        report_id: report.report_id,
        action,
      });
      await Promise.all([loadReports(), loadModeration()]);
    } catch (e) {
      console.error("resolve failed", e);
    } finally {
      setBusyId(null);
    }
  };

  const managePost = async (postId: string, action: "unhide" | "delete") => {
    if (!sessionToken || busyId) return;
    setBusyId(postId);
    try {
      await apiRequest("/admin/posts/manage", "POST", sessionToken, { post_id: postId, action });
      await loadModeration();
    } catch (e) {
      console.error("post manage failed", e);
    } finally {
      setBusyId(null);
    }
  };

  const manageUser = async (userId: string, action: "unhide" | "delete") => {
    if (!sessionToken || busyId) return;
    setBusyId(userId);
    try {
      await apiRequest("/admin/users/manage", "POST", sessionToken, { user_id: userId, action });
      await loadModeration();
    } catch (e) {
      console.error("user manage failed", e);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primaryDark} /></View>
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t("admin.title", "Admin")}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color="#9ca3af" />
          <Text style={styles.noAccess}>{t("admin.noAccess", "Admin access required")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{t("admin.title", "Admin Panel")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.policyBanner}>
        <Ionicons name="shield-checkmark-outline" size={16} color="#065f46" />
        <Text style={styles.policyText}>
          {t("admin.policy", "Reported content remains available for human review until resolved. We review reports in good faith and may delete or restore content at our discretion, consistent with how we provide our services generally.")}
        </Text>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === "reports" && styles.tabActive]} onPress={() => setTab("reports")}>
          <Text style={[styles.tabText, tab === "reports" && styles.tabTextActive]}>{t("admin.reports", "Reports")}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "moderation" && styles.tabActive]} onPress={() => setTab("moderation")}>
          <Text style={[styles.tabText, tab === "moderation" && styles.tabTextActive]}>{t("admin.moderation", "Moderation")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === "reports" ? (
          reports.length === 0 ? (
            <Text style={styles.empty}>{t("admin.noReports", "No reports")}</Text>
          ) : (
            reports.map((r) => (
              <View key={r.report_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.targetType}>{r.target_type.toUpperCase()}</Text>
                  <Text style={[styles.badge, r.is_hidden ? styles.badgeHidden : styles.badgeVisible]}>
                    {r.is_hidden ? t("admin.hidden", "Hidden") : t("admin.visible", "Visible")}
                  </Text>
                  <Text style={styles.date}>{new Date(r.reported_at).toLocaleDateString()}</Text>
                </View>
                {r.preview ? <Text style={styles.preview} numberOfLines={2}>{r.preview}</Text> : null}
                <Text style={styles.reason}>{t("admin.reason", "Reason")}: {r.reason || "-"}</Text>
                <View style={styles.actionsRow}>
                  <Pressable style={[styles.actionBtn, styles.restoreBtn]} disabled={busyId === r.report_id} onPress={() => resolveReport(r, "restore")}>
                    <Ionicons name="checkmark-circle-outline" size={14} color="#065f46" />
                    <Text style={styles.restoreText}>{t("admin.restore", "Restore")}</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.deleteBtn]} disabled={busyId === r.report_id} onPress={() => resolveReport(r, "delete")}>
                    <Ionicons name="trash-outline" size={14} color="#b91c1c" />
                    <Text style={styles.deleteText}>{t("admin.delete", "Delete")}</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, styles.dismissBtn]} disabled={busyId === r.report_id} onPress={() => resolveReport(r, "dismiss")}>
                    <Ionicons name="checkmark-outline" size={14} color="#264348" />
                    <Text style={styles.dismissText}>{t("admin.dismiss", "Dismiss")}</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t("admin.hiddenPosts", "Hidden posts")}</Text>
            {hiddenPosts.length === 0 ? (
              <Text style={styles.empty}>{t("admin.noHiddenContent", "No hidden content")}</Text>
            ) : (
              hiddenPosts.map((p) => (
                <View key={p.post_id} style={styles.card}>
                  <Text style={styles.preview} numberOfLines={2}>{p.text || t("admin.noText", "(no text)")}</Text>
                  <Text style={styles.meta}>
                    {p.author_name || "?"} · {p.hidden_reason || "-"} · {new Date(p.created_at).toLocaleDateString()}
                  </Text>
                  <View style={styles.actionsRow}>
                    <Pressable style={[styles.actionBtn, styles.restoreBtn]} disabled={busyId === p.post_id} onPress={() => managePost(p.post_id, "unhide")}>
                      <Ionicons name="checkmark-circle-outline" size={14} color="#065f46" />
                      <Text style={styles.restoreText}>{t("admin.restore", "Restore")}</Text>
                    </Pressable>
                    <Pressable style={[styles.actionBtn, styles.deleteBtn]} disabled={busyId === p.post_id} onPress={() => managePost(p.post_id, "delete")}>
                      <Ionicons name="trash-outline" size={14} color="#b91c1c" />
                      <Text style={styles.deleteText}>{t("admin.delete", "Delete")}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>{t("admin.hiddenUsers", "Hidden users")}</Text>
            {hiddenUsers.length === 0 ? (
              <Text style={styles.empty}>{t("admin.noHiddenUsers", "No hidden users")}</Text>
            ) : (
              hiddenUsers.map((u) => (
                <View key={u.user_id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    {u.profile_photo ? (
                      <Image source={{ uri: u.profile_photo }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}><Ionicons name="person" size={16} color="#59ABE3" /></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.meta}>{u.email}</Text>
                    </View>
                  </View>
                  <View style={styles.actionsRow}>
                    <Pressable style={[styles.actionBtn, styles.restoreBtn]} disabled={busyId === u.user_id} onPress={() => manageUser(u.user_id, "unhide")}>
                      <Ionicons name="checkmark-circle-outline" size={14} color="#065f46" />
                      <Text style={styles.restoreText}>{t("admin.restore", "Restore")}</Text>
                    </Pressable>
                    <Pressable style={[styles.actionBtn, styles.deleteBtn]} disabled={busyId === u.user_id} onPress={() => manageUser(u.user_id, "delete")}>
                      <Ionicons name="trash-outline" size={14} color="#b91c1c" />
                      <Text style={styles.deleteText}>{t("admin.deleteAccount", "Delete account")}</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  noAccess: { fontSize: 15, fontWeight: "600", color: "#6b7280", marginTop: 8 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, marginLeft: 8, fontSize: 17, fontWeight: "700", color: COLORS.textPrimary },
  policyBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#ecfdf5", padding: 12, marginHorizontal: 12, marginTop: 10, borderRadius: 10,
  },
  policyText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#065f46" },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 12, marginTop: 10 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: "#eef2f4" },
  tabActive: { backgroundColor: "#264348" },
  tabText: { fontSize: 13, fontWeight: "700", color: "#264348" },
  tabTextActive: { color: "#fff" },
  scroll: { padding: 12, paddingBottom: 40 },
  empty: { textAlign: "center", color: "#9ca3af", marginTop: 24, fontSize: 14 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#264348", marginTop: 16, marginBottom: 6 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: "rgba(38,67,72,0.1)",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  targetType: { fontSize: 11, fontWeight: "800", color: "#59ABE3", letterSpacing: 0.5 },
  badge: { fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeHidden: { backgroundColor: "#fee2e2", color: "#b91c1c" },
  badgeVisible: { backgroundColor: "#d1fae5", color: "#065f46" },
  date: { marginLeft: "auto", fontSize: 11, color: "#9ca3af" },
  preview: { fontSize: 13, color: "#1f2937", marginTop: 6, lineHeight: 18 },
  reason: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  meta: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  userName: { fontSize: 14, fontWeight: "700", color: "#1f2937" },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#eef4f8", alignItems: "center", justifyContent: "center" },
  actionsRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  restoreBtn: { backgroundColor: "#d1fae5" },
  restoreText: { fontSize: 12, fontWeight: "700", color: "#065f46" },
  deleteBtn: { backgroundColor: "#fee2e2" },
  deleteText: { fontSize: 12, fontWeight: "700", color: "#b91c1c" },
  dismissBtn: { backgroundColor: "#eef2f4" },
  dismissText: { fontSize: 12, fontWeight: "700", color: "#264348" },
});

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "expo-router";
import { COLORS } from "../lib/designTokens";
import { Ionicons } from "@expo/vector-icons";
import { getMyApplications, MyApplication } from "../lib/api";
import EmptyState from "../components/shared/EmptyState";
import LoadingState from "../components/shared/LoadingState";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";

export default function MyApplicationsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadApplications = async () => {
    if (!sessionToken) return;
    try {
      const data = await getMyApplications(sessionToken);
      setApplications(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!sessionToken) return;
    getMyApplications(sessionToken)
      .then(setApplications)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionToken]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return { bg: "#d1fae5", text: "#065f46" };
      case "rejected": return { bg: "#fee2e2", text: "#991b1b" };
      case "reviewed": return { bg: "#fef3c7", text: "#92400e" };
      default: return { bg: "#e0e7ff", text: "#3730a3" };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState size="large" fullWidth />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.title}>{t("jobs.myApplications") || "My Applications"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={async () => { setIsRefreshing(true); await loadApplications(); setIsRefreshing(false); }} tintColor={COLORS.primary} colors={[COLORS.primary]} />}>
        {applications.length === 0 ? (
          <EmptyState
            icon="briefcase-outline"
            message={t("applications.noApplications", "Keine Bewerbungen")}
            subMessage={t("applications.applyHint", "Bewirb dich auf Jobs, um sie hier zu sehen")}
            size="large"
            fullWidth
            actionLabel={t("common.browseJobs", "Jobs durchsuchen")}
            onAction={() => router.navigate("/(tabs)/jobs" as any)}
          />
        ) : (
          applications.map(app => {
            const colors = getStatusColor(app.status);
            return (
              <View key={app.application_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardLeft}>
                    {app.business_logo ? (
                      <Image source={{ uri: app.business_logo }} style={styles.logo} />
                    ) : (
                      <View style={[styles.logo, styles.logoPlaceholder]}>
                        <Ionicons name="business" size={20} color="#9ca3af" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobTitle}>{app.job_title}</Text>
                      <Text style={styles.businessName}>{app.business_name}</Text>
                      {app.job_location && (
                        <View style={styles.locationRow}>
                          <Ionicons name="location-outline" size={13} color="#6b7280" />
                          <Text style={styles.location}>{app.job_location}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                <Text style={styles.message}>{app.message}</Text>
                <View style={styles.footer}>
                  <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[styles.statusText, { color: colors.text }]}>
                      {t("jobs." + app.status) || app.status}
                    </Text>
                  </View>
                  <Text style={styles.date}>
                    {new Date(app.created_at).toLocaleDateString()}
                  </Text>
                </View>
                {app.cv_url && <Text style={styles.doc}>CV: Attached</Text>}
                {app.cover_letter_url && <Text style={styles.doc}>Cover Letter: Attached</Text>}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  content: { flex: 1, padding: 16 },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#374151", marginTop: 16 },
  emptySubtitle: { fontSize: 15, color: "#6b7280", marginTop: 8, marginBottom: 24 },
  browseBtn: { backgroundColor: COLORS.primaryDark, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  browseBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  cardHeader: { marginBottom: 10 },
  cardLeft: { flexDirection: "row", alignItems: "flex-start" },
  logo: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  logoPlaceholder: { backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  jobTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  businessName: { fontSize: 14, color: COLORS.primaryDark, marginTop: 2 },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  location: { fontSize: 13, color: "#6b7280", marginLeft: 2 },
  message: { fontSize: 14, color: "#374151", marginBottom: 12, lineHeight: 20 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: "600" },
  date: { fontSize: 13, color: "#9ca3af" },
  doc: { fontSize: 13, color: COLORS.primaryDark, marginTop: 6 },
});

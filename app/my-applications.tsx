import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "expo-router";
import { getMyApplications, MyApplication } from "../lib/api";

export default function MyApplicationsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);

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
        <View style={styles.loading}><ActivityIndicator size="large" color="#000000" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>{t("jobs.myApplications") || "My Applications"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {applications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No applications yet</Text>
            <Text style={styles.emptySubtitle}>Apply to jobs to see them here</Text>
            <Pressable style={styles.browseBtn} onPress={() => router.navigate("/(tabs)/jobs" as any)}>
              <Text style={styles.browseBtnText}>Browse Jobs</Text>
            </Pressable>
          </View>
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
  backBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  content: { flex: 1, padding: 16 },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#374151", marginTop: 16 },
  emptySubtitle: { fontSize: 15, color: "#6b7280", marginTop: 8, marginBottom: 24 },
  browseBtn: { backgroundColor: "#000000", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  browseBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#e5e7eb" },
  cardHeader: { marginBottom: 10 },
  cardLeft: { flexDirection: "row", alignItems: "flex-start" },
  logo: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  logoPlaceholder: { backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  jobTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  businessName: { fontSize: 14, color: "#000000", marginTop: 2 },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  location: { fontSize: 13, color: "#6b7280", marginLeft: 2 },
  message: { fontSize: 14, color: "#374151", marginBottom: 12, lineHeight: 20 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: "600" },
  date: { fontSize: 13, color: "#9ca3af" },
  doc: { fontSize: 13, color: "#000000", marginTop: 6 },
});

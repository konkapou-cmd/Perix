import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
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
import { formatDate } from "../lib/formatDate";
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
        <HeaderBackButton onPress={() => router.back()} tintColor="#264348" />
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
                      <Pressable onPress={() => app.business_id && router.push(`/business/${app.business_id}` as any)}>
                        <Image source={{ uri: app.business_logo }} style={styles.logo} />
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => app.business_id && router.push(`/business/${app.business_id}` as any)}>
                        <View style={[styles.logo, styles.logoPlaceholder]}>
                          <Ionicons name="business" size={20} color="#59ABE3" />
                        </View>
                      </Pressable>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.jobTitle}>{app.job_title}</Text>
                      <Pressable onPress={() => app.business_id && router.push(`/business/${app.business_id}` as any)}>
                        <Text style={styles.businessName}>{app.business_name}</Text>
                      </Pressable>
                      {app.job_location && (
                        <View style={styles.locationRow}>
                          <Ionicons name="location-outline" size={13} color="rgba(38,67,72,0.65)" />
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
                      {t(`jobs.${app.status}`, app.status)}
                    </Text>
                  </View>
                  <Text style={styles.date}>
                    {app.created_at ? formatDate(app.created_at.slice(0, 10)) : ""}
                  </Text>
                </View>
                {app.cv_url && (
                  <Pressable style={styles.docBtn} onPress={() => Linking.openURL(app.cv_url!)}>
                    <Ionicons name="document-text-outline" size={16} color="#264348" />
                    <Text style={styles.docText}>{t("jobs.cvAttached", "Lebenslauf ansehen")}</Text>
                  </Pressable>
                )}
                {app.cover_letter_url && (
                  <Pressable style={styles.docBtn} onPress={() => Linking.openURL(app.cover_letter_url!)}>
                    <Ionicons name="mail-outline" size={16} color="#264348" />
                    <Text style={styles.docText}>{t("jobs.coverLetterAttached", "Anschreiben ansehen")}</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "rgba(38,67,72,0.15)" },
  title: { fontSize: 18, fontWeight: "600", color: "#264348" },
  content: { flex: 1, padding: 16 },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#264348", marginTop: 16 },
  emptySubtitle: { fontSize: 15, color: "rgba(38,67,72,0.65)", marginTop: 8, marginBottom: 24 },
  browseBtn: { backgroundColor: "#59ABE3", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  browseBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "rgba(38,67,72,0.15)" },
  cardHeader: { marginBottom: 10 },
  cardLeft: { flexDirection: "row", alignItems: "flex-start" },
  logo: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  logoPlaceholder: { backgroundColor: "rgba(89,171,227,0.15)", justifyContent: "center", alignItems: "center" },
  jobTitle: { fontSize: 16, fontWeight: "600", color: "#264348" },
  businessName: { fontSize: 14, color: "#59ABE3", marginTop: 2 },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  location: { fontSize: 13, color: "rgba(38,67,72,0.65)", marginLeft: 2 },
  message: { fontSize: 14, color: "#264348", marginBottom: 12, lineHeight: 20 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: "600" },
  date: { fontSize: 13, color: "rgba(38,67,72,0.55)" },
  docBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(89,171,227,0.12)",
  },
  docText: { fontSize: 13, fontWeight: "600", color: "#264348" },
});

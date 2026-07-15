import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getActorAnalytics, ActorAnalyticsData, ActorStoryAnalytics } from "../../lib/api/storyAnalytics";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { HeaderBackButton } from "../../components/shared/HeaderBackButton";

export default function StoryAnalyticsOverviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken, user } = useAuth();
  const [analytics, setAnalytics] = useState<ActorAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState<number | null>(null);

  const loadData = async () => {
    if (!sessionToken) return;
    try {
      const data = await getActorAnalytics(sessionToken, "user", days || undefined);
      setAnalytics(data);
    } catch (e) {
      console.warn("Failed to load actor analytics:", e);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [sessionToken, days]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const dayFilters = [
    { label: t("stories.allTime", "All Time"), value: null },
    { label: "7d", value: 7 },
    { label: "30d", value: 30 },
    { label: "90d", value: 90 },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{t("stories.myAnalytics", "My Story Analytics")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.filterRow}>
        {dayFilters.map((f) => (
          <Pressable
            key={f.label}
            style={[styles.filterChip, days === f.value && styles.filterChipActive]}
            onPress={() => { setDays(f.value); setLoading(true); }}
          >
            <Text style={[styles.filterText, days === f.value && styles.filterTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.scrollContent}
      >
        {analytics && (
          <>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{analytics.total_stories}</Text>
                <Text style={styles.summaryLabel}>{t("stories.stories", "Stories")}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{analytics.total_views}</Text>
                <Text style={styles.summaryLabel}>{t("stories.views", "Views")}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{analytics.total_reactions}</Text>
                <Text style={styles.summaryLabel}>{t("stories.reactions", "Reactions")}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{Math.round(analytics.average_completion_rate * 100)}%</Text>
                <Text style={styles.summaryLabel}>{t("stories.completion", "Completion")}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{t("stories.perStory", "Per Story")}</Text>
            {analytics.stories.map((s) => (
              <Pressable
                key={s.story_id}
                style={styles.storyRow}
                onPress={() => router.push(`/story-analytics/${s.story_id}` as any)}
              >
                <View style={styles.storyRowLeft}>
                  <Ionicons
                    name={s.media_type === "video" ? "videocam" : "image"}
                    size={18}
                    color={COLORS.textMuted}
                  />
                  <Text style={styles.storyDate}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}
                  </Text>
                </View>
                <View style={styles.storyRowStats}>
                  <View style={styles.miniStat}>
                    <Ionicons name="eye-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.miniStatText}>{s.views}</Text>
                  </View>
                  <View style={styles.miniStat}>
                    <Ionicons name="heart-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.miniStatText}>{s.reactions}</Text>
                  </View>
                  <Text style={styles.completionText}>{Math.round(s.completion_rate * 100)}%</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                </View>
              </Pressable>
            ))}

            {analytics.stories.length === 0 && (
              <Text style={styles.emptyText}>{t("stories.noStories", "No stories found for this period")}</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACING.std, paddingTop: SPACING.small, paddingBottom: SPACING.compact,
    backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary, flex: 1, marginLeft: SPACING.compact },
  filterRow: {
    flexDirection: "row", paddingHorizontal: SPACING.std, paddingVertical: SPACING.small,
    backgroundColor: COLORS.background, gap: SPACING.small,
  },
  filterChip: {
    paddingHorizontal: SPACING.compact, paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.backgroundPage,
  },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterText: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, fontWeight: "500" },
  filterTextActive: { color: "#fff" },
  scrollContent: { paddingHorizontal: SPACING.std, paddingVertical: SPACING.compact },
  summaryRow: { flexDirection: "row", gap: SPACING.small, marginBottom: SPACING.std },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.compact,
    alignItems: "center",
  },
  summaryValue: { fontSize: 22, fontWeight: "700", color: COLORS.textPrimary },
  summaryLabel: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, marginTop: 2 },
  sectionTitle: {
    fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary,
    marginBottom: SPACING.small,
  },
  storyRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: SPACING.small, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  storyRowLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.small, flex: 1 },
  storyDate: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted },
  storyRowStats: { flexDirection: "row", alignItems: "center", gap: SPACING.small },
  miniStat: { flexDirection: "row", alignItems: "center", gap: 2 },
  miniStatText: { fontSize: FONT_SIZES.caption, color: COLORS.textPrimary, fontWeight: "500" },
  completionText: { fontSize: FONT_SIZES.caption, color: COLORS.primary, fontWeight: "600", minWidth: 32 },
  emptyText: { color: COLORS.textMuted, fontSize: FONT_SIZES.body, textAlign: "center", marginTop: 40 },
});

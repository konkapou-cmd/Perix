import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getStoryAnalytics, getStoryViewers, StoryAnalyticsData, StoryViewerItem } from "../../lib/api/storyAnalytics";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";

const STORY_REACTIONS: Record<string, string> = {
  "❤️": "#ef4444",
  "😂": "#f59e0b",
  "😮": "#3b82f6",
  "😢": "#6b7280",
  "👏": "#10b981",
  "🔥": "#f97316",
};

export default function StoryAnalyticsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [analytics, setAnalytics] = useState<StoryAnalyticsData | null>(null);
  const [viewers, setViewers] = useState<StoryViewerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    if (!sessionToken || !id) return;
    try {
      const [a, v] = await Promise.all([
        getStoryAnalytics(sessionToken, id),
        getStoryViewers(sessionToken, id, 20, 0),
      ]);
      setAnalytics(a);
      setViewers(v.viewers);
    } catch (e) {
      console.warn("Failed to load story analytics:", e);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id, sessionToken]);

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

  if (!analytics) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t("stories.analytics", "Story Analytics")}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t("stories.noData", "No analytics data available")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const maxTimeline = Math.max(...analytics.views_timeline.map((v) => v.count), 1);
  const totalReactions = Object.values(analytics.reactions).reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("stories.analytics", "Story Analytics")}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { borderLeftColor: "#3b82f6" }]}>
            <Ionicons name="eye-outline" size={20} color="#3b82f6" />
            <Text style={styles.statValue}>{analytics.total_views}</Text>
            <Text style={styles.statLabel}>{t("stories.totalViews", "Total Views")}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#10b981" }]}>
            <Ionicons name="people-outline" size={20} color="#10b981" />
            <Text style={styles.statValue}>{analytics.unique_viewers}</Text>
            <Text style={styles.statLabel}>{t("stories.uniqueViewers", "Unique Viewers")}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#f59e0b" }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#f59e0b" />
            <Text style={styles.statValue}>{Math.round(analytics.completion_rate * 100)}%</Text>
            <Text style={styles.statLabel}>{t("stories.completionRate", "Completion")}</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: "#8b5cf6" }]}>
            <Ionicons name="time-outline" size={20} color="#8b5cf6" />
            <Text style={styles.statValue}>{analytics.average_watch_time.toFixed(1)}s</Text>
            <Text style={styles.statLabel}>{t("stories.avgWatchTime", "Avg Watch")}</Text>
          </View>
        </View>

        {totalReactions > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("stories.reactions", "Reactions")}</Text>
            <View style={styles.reactionsRow}>
              {Object.entries(analytics.reactions).map(([emoji, count]) => (
                <View key={emoji} style={styles.reactionChip}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  <Text style={styles.reactionCount}>{count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {analytics.views_timeline.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("stories.viewsTimeline", "Views Over Time")}</Text>
            <View style={styles.timeline}>
              {analytics.views_timeline.map((item, i) => (
                <View key={i} style={styles.timelineBar}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max((item.count / maxTimeline) * 80, 4),
                        backgroundColor: COLORS.primary,
                      },
                    ]}
                  />
                  <Text style={styles.barLabel}>{item.date.slice(5)}</Text>
                  <Text style={styles.barCount}>{item.count}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {viewers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("stories.viewers", "Viewers")}</Text>
            {viewers.map((v) => (
              <Pressable
                key={v.user_id}
                style={styles.viewerRow}
                onPress={() => router.push(`/user/${v.user_id}`)}
              >
                {v.avatar ? (
                  <Image source={{ uri: v.avatar }} style={styles.viewerAvatar} />
                ) : (
                  <View style={styles.viewerAvatarPlaceholder}>
                    <Text style={styles.viewerAvatarText}>{(v.name || "?").charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.viewerInfo}>
                  <Text style={styles.viewerName}>{v.name || t("stories.unknownUser", "Unknown")}</Text>
                  <Text style={styles.viewerMeta}>
                    {v.watch_duration != null ? `${v.watch_duration.toFixed(1)}s` : ""}{" "}
                    {v.completed ? "✓" : ""}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingTop: SPACING.small,
    paddingBottom: SPACING.compact,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center", justifyContent: "center",
    marginRight: SPACING.compact,
  },
  headerTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary, flex: 1 },
  emptyText: { color: COLORS.textMuted, fontSize: FONT_SIZES.body, marginTop: 40 },
  scrollContent: { paddingHorizontal: SPACING.std, paddingVertical: SPACING.compact },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small },
  statCard: {
    flex: 1, minWidth: "45%",
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.std,
    borderLeftWidth: 3,
    gap: SPACING.small,
  },
  statValue: { fontSize: 24, fontWeight: "700", color: COLORS.textPrimary },
  statLabel: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted },
  section: { marginTop: SPACING.std },
  sectionTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary, marginBottom: SPACING.small },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small },
  reactionChip: {
    flexDirection: "row", alignItems: "center", gap: SPACING.small,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.compact, paddingVertical: SPACING.small,
  },
  reactionEmoji: { fontSize: 20 },
  reactionCount: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary },
  timeline: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.small, height: 120, paddingTop: 20 },
  timelineBar: { flex: 1, alignItems: "center" },
  bar: { width: "100%", borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, color: COLORS.textMuted, marginTop: 4 },
  barCount: { fontSize: 10, fontWeight: "600", color: COLORS.textPrimary },
  viewerRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: SPACING.small, borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  viewerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: SPACING.small },
  viewerAvatarPlaceholder: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#e0e7ff", alignItems: "center", justifyContent: "center",
    marginRight: SPACING.small,
  },
  viewerAvatarText: { fontSize: 14, fontWeight: "600", color: "#000" },
  viewerInfo: { flex: 1 },
  viewerName: { fontSize: FONT_SIZES.body, fontWeight: "500", color: COLORS.textPrimary },
  viewerMeta: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, marginTop: 2 },
});

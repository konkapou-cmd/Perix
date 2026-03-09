import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnalyticsCard } from "./AnalyticsCard";
import { AnalyticsChart } from "./AnalyticsChart";
import { TopEventsSection } from "./TopEventsSection";
import { EngagementSection } from "./EngagementSection";
import { AudienceInsights } from "./AudienceInsights";
import { useTranslation } from "react-i18next";

interface TopEvent {
  event_id: string;
  title: string;
  attendees: number;
  date?: string;
}

interface AnalyticsDashboardProps {
  type: "business" | "artist";
  profileViews: number;
  followers: number;
  totalEvents: number;
  totalAttendees: number;
  totalActivities?: number;
  engagementRate: number;
  topEvents: TopEvent[];
  growthData: Record<string, number>;
  onEventPress?: (eventId: string) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  type,
  profileViews,
  followers,
  totalEvents,
  totalAttendees,
  totalActivities = 0,
  engagementRate,
  topEvents,
  growthData,
  onEventPress,
  onRefresh,
  isLoading = false,
}) => {
  const { t } = useTranslation();
  
  // Convert growth data to chart format
  const chartData = Object.entries(growthData)
    .slice(-7)
    .map(([date, value]) => ({
      label: new Date(date).toLocaleDateString(undefined, { weekday: "short" }),
      value,
    }));

  return (
    <View style={styles.container}>
      {/* Header with Refresh */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t("dashboard.analyticsOverview") || "Analytics Overview"}</Text>
          <Text style={styles.subtitle}>{t("dashboard.last30Days") || "Last 30 days"}</Text>
        </View>
        {onRefresh && (
          <Pressable 
            style={styles.refreshButton} 
            onPress={onRefresh}
            disabled={isLoading}
          >
            <Ionicons 
              name="refresh" 
              size={18} 
              color={isLoading ? "#9ca3af" : "#4c6fff"} 
            />
          </Pressable>
        )}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsRow}>
        <AnalyticsCard
          title={t("dashboard.profileViews") || "Profile Views"}
          value={profileViews}
          icon="eye"
          iconColor="#4c6fff"
        />
        <View style={{ width: 12 }} />
        <AnalyticsCard
          title={t("dashboard.followers") || "Followers"}
          value={followers}
          icon="people"
          iconColor="#8b5cf6"
        />
      </View>

      <View style={[styles.statsRow, { marginTop: 12 }]}>
        <AnalyticsCard
          title={t("dashboard.totalEvents") || "Total Events"}
          value={totalEvents}
          icon="calendar"
          iconColor="#f59e0b"
        />
        <View style={{ width: 12 }} />
        <AnalyticsCard
          title={t("dashboard.totalRSVPs") || "Total RSVPs"}
          value={totalAttendees}
          icon="checkmark-circle"
          iconColor="#10b981"
        />
      </View>

      {type === "business" && totalActivities > 0 && (
        <View style={[styles.statsRow, { marginTop: 12 }]}>
          <AnalyticsCard
            title={t("dashboard.activitiesHosted") || "Activities Hosted"}
            value={totalActivities}
            icon="rocket"
            iconColor="#ec4899"
          />
          <View style={{ width: 12, flex: 1 }} />
        </View>
      )}

      {/* Audience Insights */}
      <View style={styles.section}>
        <AudienceInsights
          profileViews={profileViews}
          followers={followers}
        />
      </View>

      {/* Engagement Section */}
      <View style={styles.section}>
        <EngagementSection
          engagementRate={engagementRate}
          totalFollowers={followers}
          totalAttendees={totalAttendees}
          totalEvents={totalEvents}
        />
      </View>

      {/* Activity Chart */}
      {chartData.length > 0 && (
        <View style={styles.section}>
          <AnalyticsChart
            title="Activity This Week"
            data={chartData}
            color="#4c6fff"
          />
        </View>
      )}

      {/* Top Events */}
      <View style={styles.section}>
        <TopEventsSection
          events={topEvents}
          onEventPress={onEventPress}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
  },
  section: {
    marginTop: 16,
  },
});

export default AnalyticsDashboard;

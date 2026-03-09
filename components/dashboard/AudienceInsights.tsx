import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AudienceInsightsProps {
  profileViews: number;
  followers: number;
  viewsLabel?: string;
}

export const AudienceInsights: React.FC<AudienceInsightsProps> = ({
  profileViews,
  followers,
  viewsLabel = "Last 30 days",
}) => {
  // Calculate estimated reach
  const estimatedReach = Math.round(profileViews * 1.5 + followers * 2);
  
  // Calculate view-to-follower ratio
  const conversionRate = followers > 0 ? ((profileViews / followers) * 100).toFixed(1) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Audience Insights</Text>
        <View style={styles.periodBadge}>
          <Text style={styles.periodText}>{viewsLabel}</Text>
        </View>
      </View>

      {/* Main Stats */}
      <View style={styles.mainStats}>
        <View style={styles.mainStat}>
          <View style={styles.statIconContainer}>
            <Ionicons name="eye" size={24} color="#4c6fff" />
          </View>
          <Text style={styles.mainStatValue}>{profileViews.toLocaleString()}</Text>
          <Text style={styles.mainStatLabel}>Profile Views</Text>
        </View>
        <View style={styles.mainStatDivider} />
        <View style={styles.mainStat}>
          <View style={styles.statIconContainer}>
            <Ionicons name="pulse" size={24} color="#10b981" />
          </View>
          <Text style={styles.mainStatValue}>{estimatedReach.toLocaleString()}</Text>
          <Text style={styles.mainStatLabel}>Est. Reach</Text>
        </View>
      </View>

      {/* Metrics List */}
      <View style={styles.metricsList}>
        <View style={styles.metricRow}>
          <View style={styles.metricLeft}>
            <Ionicons name="analytics" size={18} color="#6b7280" />
            <Text style={styles.metricLabel}>View Rate</Text>
          </View>
          <Text style={styles.metricValue}>{conversionRate}x follower count</Text>
        </View>
        
        <View style={styles.metricRow}>
          <View style={styles.metricLeft}>
            <Ionicons name="trending-up" size={18} color="#6b7280" />
            <Text style={styles.metricLabel}>Growth Potential</Text>
          </View>
          <View style={[styles.potentialBadge, profileViews > followers ? styles.potentialHigh : styles.potentialMedium]}>
            <Text style={[styles.potentialText, profileViews > followers ? styles.potentialTextHigh : styles.potentialTextMedium]}>
              {profileViews > followers ? "High" : "Medium"}
            </Text>
          </View>
        </View>
      </View>

      {/* Insight Card */}
      <View style={styles.insightCard}>
        <Ionicons name="information-circle" size={18} color="#4c6fff" />
        <Text style={styles.insightText}>
          {profileViews > followers * 2
            ? "Your profile is getting great visibility! Consider converting visitors to followers with engaging content."
            : profileViews > 0
            ? "Good start! Share your profile link on social media to increase views."
            : "Start sharing your profile to build your audience."}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  periodBadge: {
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  periodText: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "500",
  },
  mainStats: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  mainStat: {
    flex: 1,
    alignItems: "center",
  },
  mainStatDivider: {
    width: 1,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 16,
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  mainStatValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  mainStatLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  metricsList: {
    marginBottom: 16,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  metricLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metricLabel: {
    fontSize: 14,
    color: "#374151",
  },
  metricValue: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "500",
  },
  potentialBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  potentialHigh: {
    backgroundColor: "#d1fae5",
  },
  potentialMedium: {
    backgroundColor: "#fef3c7",
  },
  potentialText: {
    fontSize: 12,
    fontWeight: "600",
  },
  potentialTextHigh: {
    color: "#059669",
  },
  potentialTextMedium: {
    color: "#d97706",
  },
  insightCard: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: "flex-start",
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: "#1e40af",
    lineHeight: 19,
  },
});

export default AudienceInsights;

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EngagementSectionProps {
  engagementRate: number;
  totalFollowers: number;
  totalAttendees: number;
  totalEvents: number;
}

export const EngagementSection: React.FC<EngagementSectionProps> = ({
  engagementRate,
  totalFollowers,
  totalAttendees,
  totalEvents,
}) => {
  // Calculate engagement level
  const getEngagementLevel = (rate: number) => {
    if (rate >= 5) return { label: "Excellent", color: "#10b981" };
    if (rate >= 3) return { label: "Good", color: "#3b82f6" };
    if (rate >= 1) return { label: "Average", color: "#f59e0b" };
    return { label: "Needs Work", color: "#ef4444" };
  };

  const level = getEngagementLevel(engagementRate);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Engagement Overview</Text>
      
      {/* Engagement Rate Circle */}
      <View style={styles.rateContainer}>
        <View style={[styles.rateCircle, { borderColor: level.color }]}>
          <Text style={styles.rateValue}>{engagementRate.toFixed(1)}</Text>
          <Text style={styles.rateLabel}>avg/event</Text>
        </View>
        <View style={styles.rateInfo}>
          <View style={[styles.levelBadge, { backgroundColor: `${level.color}15` }]}>
            <Text style={[styles.levelText, { color: level.color }]}>{level.label}</Text>
          </View>
          <Text style={styles.rateDescription}>
            Average attendees per event
          </Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Ionicons name="people" size={20} color="#8b5cf6" />
          <Text style={styles.statValue}>{totalFollowers}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="checkmark-circle" size={20} color="#10b981" />
          <Text style={styles.statValue}>{totalAttendees}</Text>
          <Text style={styles.statLabel}>Total RSVPs</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Ionicons name="calendar" size={20} color="#f59e0b" />
          <Text style={styles.statValue}>{totalEvents}</Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
      </View>

      {/* Tips */}
      <View style={styles.tipsContainer}>
        <View style={styles.tipHeader}>
          <Ionicons name="bulb" size={16} color="#f59e0b" />
          <Text style={styles.tipTitle}>Boost Engagement</Text>
        </View>
        <Text style={styles.tipText}>
          {engagementRate < 3 
            ? "Try posting stories regularly and engaging with your followers' comments."
            : "Great job! Keep creating quality content and hosting exciting events."}
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
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  rateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  rateCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  rateValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  rateLabel: {
    fontSize: 10,
    color: "#6b7280",
  },
  rateInfo: {
    flex: 1,
  },
  levelBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
  },
  levelText: {
    fontSize: 12,
    fontWeight: "600",
  },
  rateDescription: {
    fontSize: 13,
    color: "#6b7280",
  },
  statsGrid: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#e5e7eb",
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  tipsContainer: {
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 12,
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400e",
  },
  tipText: {
    fontSize: 12,
    color: "#78350f",
    lineHeight: 18,
  },
});

export default EngagementSection;

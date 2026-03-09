import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface AnalyticsCardProps {
  title: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  subtitle?: string;
}

export const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  value,
  icon,
  iconColor = "#4c6fff",
  trend,
  subtitle,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
          <Ionicons name={icon} size={20} color={iconColor} />
        </View>
        {trend && (
          <View style={[styles.trendBadge, trend.isPositive ? styles.trendPositive : styles.trendNegative]}>
            <Ionicons 
              name={trend.isPositive ? "trending-up" : "trending-down"} 
              size={12} 
              color={trend.isPositive ? "#10b981" : "#ef4444"} 
            />
            <Text style={[styles.trendText, trend.isPositive ? styles.trendTextPositive : styles.trendTextNegative]}>
              {trend.value}%
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.value}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    minWidth: 150,
    flex: 1,
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
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 2,
  },
  trendPositive: {
    backgroundColor: "#d1fae5",
  },
  trendNegative: {
    backgroundColor: "#fee2e2",
  },
  trendText: {
    fontSize: 12,
    fontWeight: "600",
  },
  trendTextPositive: {
    color: "#10b981",
  },
  trendTextNegative: {
    color: "#ef4444",
  },
  value: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  subtitle: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
});

export default AnalyticsCard;

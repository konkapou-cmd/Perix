import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

interface FilterOption {
  key: string;
  label: string;
}

interface CarouselSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  seeAllRoute?: string;
  filters?: {
    options: FilterOption[];
    activeKey: string;
    onChange: (key: string) => void;
  };
  emptyMessage?: string;
  children: React.ReactNode;
}

export function CarouselSection({ title, icon, seeAllRoute, filters, emptyMessage = "No items", children }: CarouselSectionProps) {
  const hasContent = React.Children.count(children) > 0;

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitle}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={18} color="#ffffff" />
          </View>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <View style={styles.sectionHeaderRight}>
          {seeAllRoute && (
            <Pressable style={styles.seeAllButton}>
              <Text style={styles.seeAllButtonText}>See All</Text>
              <Ionicons name="chevron-forward" size={14} color="#ffffff" />
            </Pressable>
          )}
        </View>
      </View>

      {filters && (
        <View style={styles.filterChipRow}>
          {filters.options.map(opt => (
            <Pressable
              key={opt.key}
              style={[styles.filterChip, filters.activeKey === opt.key && styles.filterChipActive]}
              onPress={() => filters.onChange(opt.key)}
            >
              <Text style={[styles.filterChipText, filters.activeKey === opt.key && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={152} decelerationRate="fast">
        {!hasContent ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        ) : (
          children
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 0,
    marginBottom: 10,
    padding: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
  },
  seeAllButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
  filterChipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  filterChipTextActive: {
    color: COLORS.background,
    fontWeight: "600",
  },
  emptyState: {
    width: 120,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
  },
});

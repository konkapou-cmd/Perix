import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import EmptyState from "../ui/EmptyState";
import { SectionHeader } from "../shared/SectionHeader";
import { COLORS, SPACING } from "../../lib/designTokens";

interface FilterOption {
  key: string;
  label: string;
}

interface CarouselSectionProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  seeAllRoute?: any;
  filters?: {
    options: FilterOption[];
    activeKey: string;
    onChange: (key: string) => void;
  };
  emptyMessage?: string;
  children: React.ReactNode;
}

export function CarouselSection({ title, icon, color, seeAllRoute, filters, emptyMessage = "No items", children }: CarouselSectionProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const hasContent = React.Children.count(children) > 0;
  const accent = color || COLORS.primaryDark;

  return (
    <View style={styles.card}>
      <SectionHeader
        icon={icon}
        title={title}
        accent={accent}
        onSeeAll={seeAllRoute ? () => router.navigate(seeAllRoute as any) : undefined}
      />

      {filters && (
        <View style={styles.filterChipRow}>
          {filters.options.map(opt => (
            <Pressable
              key={opt.key}
              style={[styles.filterChip, filters.activeKey === opt.key && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => filters.onChange(opt.key)}
            >
              <Text style={[styles.filterChipText, filters.activeKey === opt.key && { color: COLORS.textLight, fontWeight: "600" }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={152} decelerationRate="fast">
        {!hasContent ? (
          <EmptyState message={emptyMessage} muted />
        ) : (
          children
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    marginHorizontal: 0,
    marginBottom: 10,
    padding: SPACING.small,
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
    color: COLORS.textLight,
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
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  emptyState: {
    width: 120,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textGray,
    textAlign: "center",
  },
});

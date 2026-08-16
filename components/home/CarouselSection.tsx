import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "../shared/SectionHeader";
import { CARD_WIDTH } from "../shared/CarouselCard";
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
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  hideWhenEmpty?: boolean;
  layout?: "carousel" | "grid";
  children: React.ReactNode;
}

export function CarouselSection({ title, icon, color, seeAllRoute, filters, emptyMessage, hideWhenEmpty, layout = "carousel", children }: CarouselSectionProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const hasContent = React.Children.count(children) > 0;
  const accent = color || COLORS.primaryDark;

  if (hideWhenEmpty && !hasContent) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <SectionHeader
            icon={icon}
            title={title}
            accent={accent}
            onSeeAll={undefined}
          />
        </View>
        {seeAllRoute && (
          <Pressable style={[styles.seeAllBtn, { backgroundColor: accent }]} onPress={(e: any) => { e?.stopPropagation?.(); router.navigate(seeAllRoute as any); }}>
            <Text style={styles.seeAllText} numberOfLines={1}>{t("common.seeAll", "Όλα")}</Text>
          </Pressable>
        )}
      </View>

      <>
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

        {layout === "carousel" ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_WIDTH + 12} decelerationRate="fast" nestedScrollEnabled>
            {children}
          </ScrollView>
        ) : (
          <View style={styles.grid}>
            {children}
          </View>
        )}
      </>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.compact,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.compact,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 2,
  },
  seeAllText: {
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: SPACING.small,
  },
});

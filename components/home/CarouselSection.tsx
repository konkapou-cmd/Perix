import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "../shared/SectionHeader";
import { COLORS, SPACING } from "../../lib/designTokens";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  children: React.ReactNode;
}

export function CarouselSection({ title, icon, color, seeAllRoute, filters, emptyMessage, isCollapsed, onToggleCollapse, hideWhenEmpty, children }: CarouselSectionProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const collapsed = isCollapsed ?? false;
  const hasContent = React.Children.count(children) > 0;
  const accent = color || COLORS.primaryDark;

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleCollapse?.();
  };

  if (hideWhenEmpty && !hasContent) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Pressable
            onPress={handleToggle}
            style={styles.chevronTouchable}
            disabled={!onToggleCollapse}
            hitSlop={8}
          >
            <SectionHeader
              icon={icon}
              title={title}
              accent={accent}
              onSeeAll={undefined}
            />
            {onToggleCollapse && (
              <View style={[styles.chevronBtn, { borderColor: accent + "4D", borderWidth: 1.5 }]}>
                <Ionicons
                  name={collapsed ? "chevron-forward" : "chevron-down"}
                  size={20}
                  color={accent}
                />
              </View>
            )}
          </Pressable>
        </View>
        {seeAllRoute && (
          <Pressable style={[styles.seeAllBtn, { backgroundColor: accent }]} onPress={(e: any) => { e?.stopPropagation?.(); router.navigate(seeAllRoute as any); }}>
            <Text style={styles.seeAllText} numberOfLines={1}>{t("common.seeAll", "Όλα")}</Text>
          </Pressable>
        )}
      </View>

      {!collapsed && (
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

          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={152} decelerationRate="fast">
            {children}
          </ScrollView>
        </>
      )}
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
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  chevronTouchable: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  chevronBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
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
});

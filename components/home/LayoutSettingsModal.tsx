import React, { useMemo } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { HomeLayoutConfig } from "../../hooks/useLayoutPreferences";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { translateCategory } from "../../lib/categoryTranslation";

interface LayoutSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  homeLayout: HomeLayoutConfig;
  onToggleSection: (sectionId: string) => void;
  onSetSorting: (type: keyof HomeLayoutConfig["sorting"], value: string) => void;
  onSetFavoriteCategories: (categories: string[]) => void;
}

const SORT_OPTIONS = ["engagement", "distance", "chronological", "random"] as const;
const SORTABLE_TYPES = ["posts", "events", "activities", "businesses", "services"] as const;

const SORT_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; key: string }> = {
  engagement: { icon: "flame", key: "sortEngagement" },
  distance: { icon: "navigate", key: "sortDistance" },
  chronological: { icon: "time", key: "sortChronological" },
  random: { icon: "shuffle", key: "sortRandom" },
};

const TYPE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  posts: "newspaper-outline",
  events: "calendar-outline",
  activities: "people-outline",
  businesses: "storefront-outline",
  services: "construct-outline",
};

const SECTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  events: "calendar-outline",
  activities: "people-outline",
  businesses: "storefront-outline",
  hotels: "bed-outline",
  services: "construct-outline",
  jobs: "briefcase-outline",
  rentals: "home-outline",
  marketplace: "pricetag-outline",
  "homes-nearby": "key-outline",
  posts: "newspaper-outline",
};

const POPULAR_CATEGORIES = [
  "sports-fitness-wellness", "fashion-accessories", "beauty-care",
  "entertainment-events", "nightlife-social", "food-dining",
  "education-creativity", "professional-services", "shopping-retail",
  "automotive", "healthcare", "pets", "rentals",
];

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "sports-fitness-wellness": "fitness",
  "fashion-accessories": "shirt",
  "beauty-care": "rose",
  "entertainment-events": "ticket",
  "nightlife-social": "wine",
  "food-dining": "restaurant",
  "education-creativity": "school",
  "professional-services": "briefcase",
  "shopping-retail": "bag",
  automotive: "car",
  healthcare: "medkit",
  pets: "paw",
  rentals: "home",
};

export function LayoutSettingsModal({ visible, onClose, homeLayout, onToggleSection, onSetSorting, onSetFavoriteCategories }: LayoutSettingsModalProps) {
  const { t } = useTranslation();

  const sections = useMemo(
    () => homeLayout.sections.filter((s) => s.id !== "map"),
    [homeLayout.sections],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="options" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t("home.layoutSettings")}</Text>
              <Text style={styles.subtitle}>{t("home.personalizeHome", "Personalize your home feed")}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Sort order */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="swap-vertical" size={16} color={COLORS.primary} />
                <Text style={styles.cardTitle}>{t("home.sortContent")}</Text>
              </View>
              {SORTABLE_TYPES.map((type) => (
                <View key={type} style={styles.sortRow}>
                  <View style={styles.sortLabelRow}>
                    <Ionicons name={TYPE_ICONS[type]} size={16} color={COLORS.textSecondary} />
                    <Text style={styles.sortLabel}>{t(`home.${type}`)}</Text>
                  </View>
                  <View style={styles.sortChips}>
                    {SORT_OPTIONS.map((sort) => {
                      const active = homeLayout.sorting[type] === sort;
                      return (
                        <Pressable
                          key={sort}
                          style={[styles.sortChip, active && styles.sortChipActive]}
                          onPress={() => onSetSorting(type, sort)}
                        >
                          <Ionicons name={SORT_META[sort].icon} size={13} color={active ? "#fff" : COLORS.textMuted} />
                          <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                            {t(`home.${SORT_META[sort].key}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>

            {/* Favorite categories */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="grid" size={16} color={COLORS.primary} />
                <Text style={styles.cardTitle}>{t("home.favoriteCategories", "Categories")}</Text>
              </View>
              <View style={styles.categoryChips}>
                {POPULAR_CATEGORIES.map((cat) => {
                  const active = homeLayout.favoriteCategories.includes(cat);
                  return (
                    <Pressable
                      key={cat}
                      style={[styles.catChip, active && styles.catChipActive]}
                      onPress={() => {
                        if (active) {
                          onSetFavoriteCategories(homeLayout.favoriteCategories.filter((c) => c !== cat));
                        } else {
                          onSetFavoriteCategories([...homeLayout.favoriteCategories, cat]);
                        }
                      }}
                    >
                      <Ionicons
                        name={(CATEGORY_ICONS[cat] || "ellipse-outline") as any}
                        size={14}
                        color={active ? "#fff" : COLORS.textSecondary}
                      />
                      <Text style={[styles.catChipText, active && styles.catChipTextActive]} numberOfLines={1}>
                        {translateCategory(cat, t)}
                      </Text>
                      {active && <Ionicons name="checkmark-circle" size={14} color="#fff" />}
                    </Pressable>
                  );
                })}
              </View>
              {(homeLayout?.favoriteCategories?.length ?? 0) > 0 && (
                <Pressable style={styles.clearBtn} onPress={() => onSetFavoriteCategories([])}>
                  <Ionicons name="refresh" size={14} color={COLORS.primary} />
                  <Text style={styles.clearBtnText}>{t("home.showAllCategories", "Alle Kategorien anzeigen")}</Text>
                </Pressable>
              )}
            </View>

            {/* Section toggles */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="eye" size={16} color={COLORS.primary} />
                <Text style={styles.cardTitle}>{t("home.showSections")}</Text>
              </View>
              {sections.map((section) => {
                const enabled = section.enabled !== false;
                return (
                  <Pressable
                    key={section.id}
                    style={styles.sectionRow}
                    onPress={() => onToggleSection(section.id)}
                  >
                    <View style={[styles.sectionIcon, { backgroundColor: enabled ? COLORS.primaryLight : COLORS.backgroundPage }]}>
                      <Ionicons
                        name={(SECTION_ICONS[section.id] || "albums-outline") as any}
                        size={18}
                        color={enabled ? COLORS.primary : COLORS.textMuted}
                      />
                    </View>
                    <Text style={[styles.sectionLabel, !enabled && { color: COLORS.textMuted }]}>
                      {t(`home.${section.id}`, section.title)}
                    </Text>
                    <View style={[styles.switch, enabled && styles.switchOn]}>
                      <View style={[styles.switchThumb, enabled && styles.switchThumbOn]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  content: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 80,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.std,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: FONT_SIZES.h4,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.std,
    paddingBottom: 40,
    gap: SPACING.std,
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.std,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: SPACING.std,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h4,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: COLORS.textPrimary,
  },
  sortRow: {
    marginBottom: SPACING.std,
  },
  sortLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  sortLabel: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textSecondary,
  },
  sortChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundPage,
  },
  sortChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sortChipText: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textMuted,
  },
  sortChipTextActive: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  categoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: SPACING.small,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  catChipText: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textSecondary,
  },
  catChipTextActive: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  clearBtnText: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.primary,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
  },
  switch: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.border,
    padding: 3,
  },
  switchOn: {
    backgroundColor: "#59ABE3",
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  switchThumbOn: {
    alignSelf: "flex-end",
  },
});

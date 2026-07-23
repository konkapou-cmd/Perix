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

const POPULAR_CATEGORIES = [
  "restaurants-bars", "fashion-accessories", "beauty-care", "health-wellness",
  "shopping-retail", "sports-fitness-wellness", "entertainment-events",
  "education", "automotive", "professional-services", "pets", "food-dining",
  "nightlife", "music", "rentals", "technology",
];

export function LayoutSettingsModal({ visible, onClose, homeLayout, onToggleSection, onSetSorting, onSetFavoriteCategories }: LayoutSettingsModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("home.layoutSettings")}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={32} color={COLORS.textPlaceholder} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll}>
            <Text style={styles.sectionLabel}>{t("home.sortContent")}</Text>
            {SORTABLE_TYPES.map((type) => (
              <View key={type} style={styles.settingRow}>
                <Text style={styles.settingLabel}>{t(`home.${type}`)}</Text>
                <View style={styles.sortButtons}>
                  {SORT_OPTIONS.map((sort) => {
                    const isActive = homeLayout.sorting[type] === sort;
                    return (
                      <Pressable
                        key={sort}
                        style={[styles.sortButton, isActive && styles.sortButtonActive]}
                        onPress={() => onSetSorting(type, sort)}
                      >
                        <Text style={[styles.sortButtonText, isActive && styles.sortButtonTextActive]}>
                          {t(`home.sort${sort.charAt(0).toUpperCase() + sort.slice(1)}`)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
            </View>
          ))}

            <Text style={styles.sectionLabel}>{t("home.favoriteCategories", "Kategorien")}</Text>
            <View style={styles.categoryChips}>
              {POPULAR_CATEGORIES.map((cat) => {
                const active = homeLayout.favoriteCategories.includes(cat);
                return (
                  <Pressable
                    key={cat}
                    style={[styles.catChip, active && styles.catChipActive]}
                    onPress={() => {
                      if (active) {
                        onSetFavoriteCategories(homeLayout.favoriteCategories.filter(c => c !== cat));
                      } else {
                        onSetFavoriteCategories([...homeLayout.favoriteCategories, cat]);
                      }
                    }}
                  >
                    <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                      {translateCategory(cat, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {homeLayout.favoriteCategories.length > 0 && (
              <Pressable
                style={styles.clearCatBtn}
                onPress={() => onSetFavoriteCategories([])}
              >
                <Text style={styles.clearCatText}>{t("home.showAllCategories", "Alle Kategorien anzeigen")}</Text>
              </Pressable>
            )}

            <Text style={styles.sectionLabel}>{t("home.showSections")}</Text>
            {homeLayout.sections.filter(s => s.id !== "map").map((section) => (
              <View key={section.id} style={styles.settingRow}>
                <Text style={styles.settingLabel}>{t(`home.${section.id}`) || section.title}</Text>
                <Pressable
                  style={[styles.toggleButton, section.enabled !== false && styles.toggleButtonActive]}
                  onPress={() => onToggleSection(section.id)}
                >
                  <Text style={[styles.toggleButtonText, section.enabled !== false && styles.toggleButtonTextActive]}>
                    {section.enabled !== false ? t("common.show") : t("common.hide")}
                  </Text>
                </Pressable>
              </View>
            ))}
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
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderGray,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  scroll: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textDark,
    marginTop: 16,
    marginBottom: 12,
  },
  settingRow: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.textGray,
    marginBottom: 8,
  },
  sortButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    backgroundColor: COLORS.surfaceSoft,
  },
  sortButtonActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  sortButtonText: {
    fontSize: 12,
    color: COLORS.textGray,
  },
  sortButtonTextActive: {
    color: COLORS.textLight,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    backgroundColor: COLORS.surfaceSoft,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  toggleButtonText: {
    fontSize: 14,
    color: COLORS.textGray,
  },
  toggleButtonTextActive: {
    color: COLORS.textLight,
  },
  categoryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundPage,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catChipActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  catChipTextActive: {
    color: "#fff",
  },
  clearCatBtn: {
    paddingVertical: 8,
    marginBottom: 8,
  },
  clearCatText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
});

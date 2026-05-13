import React from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { HomeLayoutConfig } from "../../hooks/useLayoutPreferences";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

interface LayoutSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  homeLayout: HomeLayoutConfig;
  onToggleSection: (sectionId: string) => void;
  onSetSorting: (type: keyof HomeLayoutConfig["sorting"], value: string) => void;
}

const SORT_OPTIONS = ["engagement", "distance", "chronological", "random"] as const;
const SORTABLE_TYPES = ["posts", "events", "activities", "businesses"] as const;

export function LayoutSettingsModal({ visible, onClose, homeLayout, onToggleSection, onSetSorting }: LayoutSettingsModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <SafeAreaView style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("home.layoutSettings")}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close-circle" size={32} color="#9ca3af" />
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
    backgroundColor: "#ffffff",
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
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  scroll: {
    padding: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
    marginBottom: 12,
  },
  settingRow: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
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
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  sortButtonActive: {
    backgroundColor: "#000000",
    borderColor: "#000000",
  },
  sortButtonText: {
    fontSize: 12,
    color: "#6b7280",
  },
  sortButtonTextActive: {
    color: "#ffffff",
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  toggleButtonActive: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
  },
  toggleButtonText: {
    fontSize: 14,
    color: "#6b7280",
  },
  toggleButtonTextActive: {
    color: "#ffffff",
  },
});

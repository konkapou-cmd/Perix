import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING } from "../../lib/designTokens";
import ProgressivePicker from "../navigation/ProgressivePicker";

type TabType = "businesses" | "events" | "activities" | "rentals" | "jobs";

type Props = {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  locationName: string | null;
  t: (key: string, options?: any) => string;
};

const SECTION_OPTIONS: { key: TabType; label: string; icon: "business-outline" | "calendar-outline" | "people-outline" | "home-outline" | "briefcase-outline" }[] = [
  { key: "businesses", label: "Businesses", icon: "business-outline" },
  { key: "events", label: "Events", icon: "calendar-outline" },
  { key: "activities", label: "Activities", icon: "people-outline" },
  { key: "rentals", label: "Rentals", icon: "home-outline" },
  { key: "jobs", label: "Jobs", icon: "briefcase-outline" },
];

export default function LocatorHeader({ activeTab, onTabChange, locationName, t }: Props) {
  return (
    <View style={styles.container}>
      {locationName && (
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.locationText} numberOfLines={1}>
            {locationName}
          </Text>
        </View>
      )}
      <ProgressivePicker
        label={t("navigation.section", "Bereich")}
        value={activeTab}
        options={SECTION_OPTIONS.map((s) => ({
          key: s.key,
          label: t(`tabs.${s.key}`, s.label),
          icon: s.icon,
        }))}
        onChange={(tab) => onTabChange(tab as TabType)}
        primaryColor={COLORS.primaryDark}
        textColor={COLORS.textPrimary}
        mutedColor={COLORS.textMuted}
        backgroundColor={COLORS.background}
        borderColor={COLORS.border ?? "#e5e7eb"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.small,
    paddingVertical: 4,
    backgroundColor: COLORS.background,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  locationText: {
    fontSize: 13,
    color: COLORS.textMuted,
    flex: 1,
  },
});

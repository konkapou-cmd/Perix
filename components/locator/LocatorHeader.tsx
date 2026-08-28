import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING } from "../../lib/designTokens";
import ProgressivePicker from "../navigation/ProgressivePicker";

type TabType = "businesses" | "hotels" | "events" | "activities" | "rentals" | "jobs";

type Props = {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  locationName: string | null;
  t: (key: string, options?: any) => string;
};

const SECTION_OPTIONS: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "hotels", label: "Hotels", icon: "bed" },
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
          <Ionicons name="location-outline" size={14} color="#264348" />
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
        primaryColor="#59ABE3"
        textColor="#264348"
        mutedColor="#264348"
        backgroundColor={COLORS.background}
        borderColor="rgba(38,67,72,0.25)"
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
    color: "#264348",
    flex: 1,
  },
});

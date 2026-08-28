import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";
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

export default function LocatorHeader({ activeTab, onTabChange, t }: Props) {
  return (
    <View style={styles.container}>
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
    paddingHorizontal: 0,
    paddingVertical: 4,
    backgroundColor: COLORS.background,
  },
});

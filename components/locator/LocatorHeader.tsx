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

const SECTION_OPTIONS: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: "hotels", label: "Hotels", icon: "bed", color: "#59ABE3" },
  { key: "businesses", label: "Businesses", icon: "business-outline", color: "#264348" },
  { key: "events", label: "Events", icon: "calendar-outline", color: "#FF9F1C" },
  { key: "activities", label: "Activities", icon: "people-outline", color: "#FF9F1C" },
  { key: "rentals", label: "Rentals", icon: "home-outline", color: "#59ABE3" },
  { key: "jobs", label: "Jobs", icon: "briefcase-outline", color: "#264348" },
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
          color: s.color,
        }))}
        onChange={(tab) => onTabChange(tab as TabType)}
        primaryColor={SECTION_OPTIONS.find((s) => s.key === activeTab)?.color ?? "#264348"}
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

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

type TabType = "businesses" | "events" | "activities";

type Props = {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  locationName: string | null;
  t: (key: string, options?: any) => string;
};

const TABS: { key: TabType; icon: string; labelKey: string; fallback: string }[] = [
  { key: "businesses", icon: "business", labelKey: "tabs.businesses", fallback: "Businesses" },
  { key: "events", icon: "calendar", labelKey: "tabs.events", fallback: "Events" },
  { key: "activities", icon: "people", labelKey: "tabs.activities", fallback: "Activities" },
];

export default function LocatorHeader({ activeTab, onTabChange, locationName, t }: Props) {
  return (
    <View style={styles.container}>
      {locationName && (
        <View style={styles.locationRow}>
          <Ionicons name="location" size={14} color={COLORS.primary} />
          <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
        </View>
      )}
      <View style={styles.segmentedControl}>
        {TABS.map(({ key, icon, labelKey, fallback }) => {
          const isActive = activeTab === key;
          return (
            <Pressable
              key={key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(key)}
            >
              <Ionicons
                name={icon as any}
                size={15}
                color={isActive ? "#fff" : COLORS.textMuted}
              />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {t(labelKey, fallback)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: SPACING.md,
  },
  locationText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.primary,
    flexShrink: 1,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    padding: 3,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
});
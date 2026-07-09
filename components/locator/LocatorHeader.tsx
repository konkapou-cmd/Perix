import React, { useRef, useState } from "react";
import { Pressable, ScrollView, Platform, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

type TabType = "businesses" | "events" | "activities" | "rentals" | "jobs";

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
  { key: "rentals", icon: "home", labelKey: "tabs.rentals", fallback: "Rentals" },
  { key: "jobs", icon: "briefcase", labelKey: "tabs.jobs", fallback: "Jobs" },
];

const TAB_WIDTH = 108;
const SCROLL_AMOUNT = TAB_WIDTH * 2;

export default function LocatorHeader({ activeTab, onTabChange, locationName, t }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const handleScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setCanScrollLeft(contentOffset.x > 4);
    setCanScrollRight(contentOffset.x + layoutMeasurement.width < contentSize.width - 4);
  };

  const scrollLeft = () => scrollRef.current?.scrollTo({ x: Math.max(0, 0), animated: true });
  const scrollRight = () => scrollRef.current?.scrollTo({ x: Number.MAX_SAFE_INTEGER, animated: true });

  return (
    <View style={styles.container}>
      {locationName && (
        <View style={styles.locationRow}>
          <Ionicons name="location" size={14} color={COLORS.primary} />
          <Text style={styles.locationText} numberOfLines={1}>{locationName}</Text>
        </View>
      )}

      <View style={styles.tabBar}>
        {canScrollLeft && (
          <>
            <Pressable style={[styles.arrowBtn, styles.arrowLeft]} onPress={() => scrollRef.current?.scrollTo({ x: Math.max(0, (scrollRef.current as any)?._scrollMetrics?.offset ?? 0 - SCROLL_AMOUNT), animated: true })}>
              <Ionicons name="chevron-back" size={14} color={COLORS.textMuted} />
            </Pressable>
            <LinearGradient
              colors={[COLORS.background + "FF", COLORS.background + "00"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fadeEdge, styles.fadeLeft]}
              pointerEvents="none"
            />
          </>
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
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
                  color={isActive ? COLORS.background : COLORS.textMuted}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                  {t(labelKey, fallback)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {canScrollRight && (
          <>
            <LinearGradient
              colors={[COLORS.background + "00", COLORS.background + "FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.fadeEdge, styles.fadeRight]}
              pointerEvents="none"
            />
            <Pressable style={[styles.arrowBtn, styles.arrowRight]} onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.std,
    paddingTop: SPACING.small,
    paddingBottom: SPACING.small,
    backgroundColor: COLORS.background,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: SPACING.small,
  },
  locationText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.caption : FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.primary,
    flexShrink: 1,
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    backgroundColor: COLORS.backgroundPage,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: Platform.OS === "web" ? 4 : 3,
    paddingHorizontal: Platform.OS === "web" ? 4 : 3,
    overflow: "hidden",
  },
  scrollContent: {
    gap: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: Platform.OS === "web" ? SPACING.compact : SPACING.small,
    paddingHorizontal: SPACING.small,
    borderRadius: BORDER_RADIUS.sm,
    minWidth: TAB_WIDTH,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.bodySmall : FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.background,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  arrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    flexShrink: 0,
  },
  arrowLeft: {
    marginRight: -4,
  },
  arrowRight: {
    marginLeft: -4,
  },
  fadeEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 40,
    zIndex: 5,
  },
  fadeLeft: {
    left: 28,
  },
  fadeRight: {
    right: 28,
  },
});

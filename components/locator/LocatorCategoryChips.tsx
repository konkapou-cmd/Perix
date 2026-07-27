import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
  Text,
  View,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";

type CategoryChip = {
  key: string;
  label: string;
  icon?: string;
  color?: string;
};

type Props = {
  chips: CategoryChip[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  variant?: "category" | "theme";
};

export default function LocatorCategoryChips({ chips, selectedKey, onSelect }: Props) {
  const tabs = [{ key: null as string | null, label: "All" }, ...chips];
  const indicatorLeft = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(0)).current;
  const tabRefs = useRef<Map<string | null, { x: number; w: number }>>(new Map());
  const scrollRef = useRef<ScrollView>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(true);

  useEffect(() => {
    const pos = tabRefs.current.get(selectedKey);
    if (pos) {
      Animated.parallel([
        Animated.spring(indicatorLeft, { toValue: pos.x, useNativeDriver: false, tension: 180, friction: 20 }),
        Animated.spring(indicatorWidth, { toValue: pos.w, useNativeDriver: false, tension: 180, friction: 20 }),
      ]).start();
    }
  }, [selectedKey]);

  const handlePress = (key: string | null) => {
    onSelect(key);
    const pos = tabRefs.current.get(key);
    if (pos && scrollRef.current) {
      scrollRef.current.scrollTo({ x: Math.max(0, pos.x - 40), animated: true });
    }
  };

  const handleScroll = (e: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    setShowLeftFade(contentOffset.x > 4);
    setShowRightFade(contentOffset.x + layoutMeasurement.width < contentSize.width - 4);
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.container}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {tabs.map((tab) => {
          const isActive = selectedKey === tab.key;
          return (
            <Pressable
              key={String(tab.key)}
              style={styles.tab}
              onPress={() => handlePress(tab.key)}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                tabRefs.current.set(tab.key, { x, w: width });
                if (isActive) {
                  indicatorLeft.setValue(x);
                  indicatorWidth.setValue(width);
                }
              }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
        <Animated.View
          style={[styles.indicator, { left: indicatorLeft, width: indicatorWidth }]}
        />
      </ScrollView>
      {showLeftFade && (
        <LinearGradient
          colors={["rgba(255,255,255,1)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fadeEdge, styles.fadeLeft]}
          pointerEvents="none"
        />
      )}
      {showRightFade && (
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,1)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fadeEdge, styles.fadeRight]}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    marginBottom: SPACING.small,
  },
  container: {
    position: "relative",
  },
  scrollContent: {
    paddingHorizontal: SPACING.std,
    gap: Platform.OS === "web" ? 16 : 12,
    alignItems: "center",
    paddingBottom: 8,
  },
  tab: {
    alignItems: "center",
    paddingVertical: 4,
  },
  tabText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  fadeEdge: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 32,
    zIndex: 5,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
});

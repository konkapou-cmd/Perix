import React, { useCallback } from "react";
import {
  Pressable,
  ScrollView,
  Platform,
  StyleSheet,
  Text,
  View,
  LayoutAnimation,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { CategoryGroup } from "../../lib/api";

type Props = {
  categories: CategoryGroup[];
  selectedRoot: string;
  selectedSubcategory: string;
  onSelectRoot: (slug: string) => void;
  onSelectSubcategory: (slug: string) => void;
  onClose?: () => void;
};

const SIDEBAR_WIDTH = 260;

export { SIDEBAR_WIDTH };

export default function LocatorSidebar({
  categories,
  selectedRoot,
  selectedSubcategory,
  onSelectRoot,
  onSelectSubcategory,
  onClose,
}: Props) {
  const handleRootToggle = useCallback(
    (slug: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onSelectRoot(selectedRoot === slug ? "All" : slug);
    },
    [selectedRoot, onSelectRoot]
  );

  const handleSubSelect = useCallback(
    (slug: string) => {
      onSelectSubcategory(selectedSubcategory === slug ? "All" : slug);
      if (onClose) onClose();
    },
    [selectedSubcategory, onSelectSubcategory, onClose]
  );

  const handleAllPress = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onSelectRoot("All");
    onSelectSubcategory("All");
    if (onClose) onClose();
  }, [onSelectRoot, onSelectSubcategory, onClose]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Categories</Text>
        {onClose && (
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={20} color={COLORS.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* All category */}
        <Pressable
          style={[styles.item, selectedRoot === "All" && styles.itemActive]}
          onPress={handleAllPress}
        >
          <View style={styles.itemIcon}>
            <Ionicons
              name="grid-outline"
              size={16}
              color={selectedRoot === "All" ? COLORS.primary : COLORS.textMuted}
            />
          </View>
          <Text
            style={[
              styles.itemText,
              selectedRoot === "All" && styles.itemTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>

        {categories.map((cat) => {
          const isExpanded = selectedRoot === cat.slug;
          const hasGroups = cat.groups && cat.groups.length > 0;
          const hasSubs = (cat.subcategories && cat.subcategories.length > 0) || hasGroups;
          const allSubs = hasGroups
            ? cat.groups!.flatMap(g => g.subcategories || [])
            : (cat.subcategories || []);

          return (
            <View key={cat.slug}>
              <Pressable
                style={[styles.item, isExpanded && styles.itemActive]}
                onPress={() => {
                  if (hasSubs) {
                    handleRootToggle(cat.slug);
                  } else {
                    handleRootToggle(cat.slug);
                    if (onClose) onClose();
                  }
                }}
              >
                <View style={styles.itemIcon}>
                  <Ionicons
                    name="folder-outline"
                    size={16}
                    color={isExpanded ? COLORS.primary : COLORS.textMuted}
                  />
                </View>
                <Text
                  style={[
                    styles.itemText,
                    isExpanded && styles.itemTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {cat.name}
                </Text>
                {hasSubs && (
                  <Ionicons
                    name={isExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color={isExpanded ? COLORS.primary : COLORS.textMuted}
                    style={styles.chevron}
                  />
                )}
              </Pressable>

              {isExpanded && hasGroups ? (
                <View style={styles.groupList}>
                  {cat.groups!.map((group) => (
                    <View key={group.slug}>
                      <Text style={styles.groupHeader}>{group.name}</Text>
                      <View style={styles.subList}>
                        {group.subcategories.map((sub) => {
                          const isSubActive = selectedSubcategory === sub.slug;
                          return (
                            <Pressable
                              key={sub.slug}
                              style={[styles.subItem, isSubActive && styles.subItemActive]}
                              onPress={() => handleSubSelect(sub.slug)}
                            >
                              <View style={styles.subDot} />
                              <Text style={[styles.subText, isSubActive && styles.subTextActive]} numberOfLines={1}>
                                {sub.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              ) : isExpanded && hasSubs ? (
                <View style={styles.subList}>
                  {allSubs.map((sub) => {
                    const isSubActive = selectedSubcategory === sub.slug;
                    return (
                      <Pressable
                        key={sub.slug}
                        style={[styles.subItem, isSubActive && styles.subItemActive]}
                        onPress={() => handleSubSelect(sub.slug)}
                      >
                        <View style={styles.subDot} />
                        <Text style={[styles.subText, isSubActive && styles.subTextActive]} numberOfLines={1}>
                          {sub.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    height: "100%",
    backgroundColor: COLORS.background,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    ...Platform.select({
      web: { position: "relative" as any, flexShrink: 0 } as any,
      default: { position: "absolute" as any, top: 0, left: 0, bottom: 0, zIndex: 100, elevation: 10, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 4, height: 0 } },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: SPACING.small,
    paddingBottom: 40,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.compact,
    gap: SPACING.small,
    borderRadius: BORDER_RADIUS.sm,
    marginHorizontal: SPACING.small,
  },
  itemActive: {
    backgroundColor: COLORS.primary + "10",
  },
  itemIcon: {
    width: 22,
    alignItems: "center",
  },
  itemText: {
    flex: 1,
    fontSize: Platform.OS === "web" ? 14 : 13,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textPrimary,
    ...Platform.select({ web: { cursor: "pointer" } as any, default: {} }),
  },
  itemTextActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  chevron: {
    marginLeft: "auto",
  },
  subList: {
    paddingLeft: SPACING.std + 22 + SPACING.small,
    paddingRight: SPACING.small,
    marginBottom: SPACING.tiny,
  },
  subItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.small + 1,
    paddingHorizontal: SPACING.small,
    borderRadius: BORDER_RADIUS.sm,
    gap: SPACING.small,
  },
  subItemActive: {
    backgroundColor: COLORS.primary + "10",
  },
  subDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.textMuted,
  },
  subText: {
    flex: 1,
    fontSize: Platform.OS === "web" ? 13 : 12,
    color: COLORS.textMuted,
    ...Platform.select({ web: { cursor: "pointer" } as any, default: {} }),
  },
  subTextActive: {
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  groupList: {
    paddingLeft: SPACING.std + 22 + SPACING.small,
    paddingRight: SPACING.small,
    marginBottom: SPACING.tiny,
  },
  groupHeader: {
    fontSize: Platform.OS === "web" ? 11 : 10,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textMuted,
    textTransform: "uppercase" as any,
    letterSpacing: 0.5,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.small,
  },
});

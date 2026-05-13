import React from "react";
import { ScrollView, Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, SPACING } from "../../lib/designTokens";

type ChipOption = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

type ChipFilterProps = {
  options: ChipOption[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  style?: ViewStyle;
  color?: string;
};

export const ChipFilter = ({
  options,
  selectedKey,
  onSelect,
  style,
  color = COLORS.primary,
}: ChipFilterProps) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
    >
      {options.map((opt) => {
        const isActive = selectedKey === opt.key;
        return (
          <Pressable
            key={opt.key}
            style={[
              styles.chip,
              isActive
                ? { backgroundColor: color, borderColor: color }
                : styles.chipInactive,
            ]}
            onPress={() => onSelect(isActive ? null : opt.key)}
          >
            {opt.icon && (
              <Ionicons
                name={opt.icon}
                size={14}
                color={isActive ? COLORS.background : COLORS.textSecondary}
                style={styles.chipIcon}
              />
            )}
            <Text
              style={[
                styles.chipText,
                { color: isActive ? COLORS.background : COLORS.textSecondary },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    gap: 4,
  },
  chipInactive: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
  },
  chipText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
  chipIcon: {
    marginRight: 1,
  },
});

export default ChipFilter;

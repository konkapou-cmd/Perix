import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

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

export default function LocatorCategoryChips({ chips, selectedKey, onSelect, variant = "category" }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.container}
    >
      <Pressable
        style={[styles.chip, !selectedKey && styles.chipActive]}
        onPress={() => onSelect(null)}
      >
        {variant === "category" && (
          <Ionicons name="grid-outline" size={14} color={!selectedKey ? "#fff" : COLORS.textMuted} />
        )}
        <Text style={[styles.chipText, !selectedKey && styles.chipTextActive]}>
          {variant === "category" ? "All" : "All"}
        </Text>
      </Pressable>
      {chips.map((chip) => {
        const isActive = selectedKey === chip.key;
        return (
          <Pressable
            key={chip.key}
            style={[
              styles.chip,
              isActive && styles.chipActive,
              isActive && chip.color ? { backgroundColor: chip.color, borderColor: chip.color } : null,
            ]}
            onPress={() => onSelect(isActive ? null : chip.key)}
          >
            {chip.icon && (
              <Ionicons name={chip.icon as any} size={14} color={isActive ? "#fff" : COLORS.textMuted} />
            )}
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{chip.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 44,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 32,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textMuted,
  },
  chipTextActive: {
    color: "#fff",
  },
});
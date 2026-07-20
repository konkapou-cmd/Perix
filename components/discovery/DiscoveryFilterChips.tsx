import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";

export type FilterChip = {
  key: string;
  label: string;
  active: boolean;
};

type Props = {
  chips: FilterChip[];
  onToggle: (key: string) => void;
};

export default function DiscoveryFilterChips({ chips, onToggle }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {chips.map((chip) => (
        <Pressable
          key={chip.key}
          style={[styles.chip, chip.active && styles.chipActive]}
          onPress={() => onToggle(chip.key)}
        >
          <Text style={[styles.chipText, chip.active && styles.chipTextActive]}>
            {chip.label}
          </Text>
          {chip.active && (
            <Ionicons name="close" size={14} color="#fff" style={{ marginLeft: 4 }} />
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    gap: SPACING.small,
    flexDirection: "row",
    backgroundColor: COLORS.background,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: "#fff",
  },
});

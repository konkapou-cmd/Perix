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
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.25)",
  },
  chipActive: {
    backgroundColor: "#59ABE3",
    borderColor: "#59ABE3",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#264348",
  },
  chipTextActive: {
    color: "#fff",
  },
});

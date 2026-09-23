import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";

type Props = {
  label: string;
  icon?: string;
  selected?: boolean;
  color?: string;
  onPress: () => void;
  style?: ViewStyle;
};

export const AppChip = ({
  label,
  icon,
  selected = false,
  color = COLORS.primaryDark,
  onPress,
  style,
}: Props) => {
  const bg = selected ? color : COLORS.background;
  const fg = selected ? COLORS.background : COLORS.textSecondary;
  const borderC = selected ? color : COLORS.border;

  return (
    <Pressable
      style={[s.chip, { backgroundColor: bg, borderColor: borderC }, style]}
      onPress={onPress}
    >
      {icon && <Ionicons name={icon as any} size={14} color={fg} />}
      <Text style={[s.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
};

const s = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.compact,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    gap: SPACING.tiny,
  },
  label: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

export default AppChip;

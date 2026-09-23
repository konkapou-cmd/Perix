import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SHADOWS } from "../../lib/designTokens";

type FloatingCreateButtonProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
};

export const FloatingCreateButton = ({
  icon = "add",
  onPress,
}: FloatingCreateButtonProps) => {
  return (
    <Pressable
      style={styles.fab}
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Erstellen"
    >
      <Ionicons name={icon} size={28} color={COLORS.textLight} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.medium,
  },
});

export default FloatingCreateButton;

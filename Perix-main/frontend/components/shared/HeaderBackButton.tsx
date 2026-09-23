import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";

type HeaderBackButtonProps = {
  onPress: () => void;
  tintColor?: string;
};

export const HeaderBackButton = ({ onPress, tintColor = COLORS.textPrimary }: HeaderBackButtonProps) => {
  return (
    <Pressable
      style={[styles.btn, { backgroundColor: COLORS.backgroundPage }]}
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel="Zurück"
    >
      <Ionicons name="chevron-back" size={24} color={tintColor} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default HeaderBackButton;

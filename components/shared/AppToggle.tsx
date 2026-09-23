import React from "react";
import { Pressable, View, StyleSheet, ViewStyle } from "react-native";
import { COLORS } from "../../lib/designTokens";

type Props = {
  value: boolean;
  onToggle: () => void;
  color?: string;
  style?: ViewStyle;
};

export const AppToggle = ({
  value,
  onToggle,
  color = COLORS.primary,
  style,
}: Props) => {
  return (
    <Pressable
      onPress={onToggle}
      style={[s.track, { backgroundColor: value ? color : COLORS.border }, style]}
    >
      <View style={[s.knob, value && { alignSelf: "flex-end" }]} />
    </Pressable>
  );
};

const s = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
});

export default AppToggle;

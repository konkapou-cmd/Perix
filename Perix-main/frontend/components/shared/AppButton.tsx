import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "outline";
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  color?: string;
};

export const AppButton = ({
  label,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  color,
}: Props) => {
  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const isDanger = variant === "danger";
  const isOutline = variant === "outline";

  const bg = isPrimary
    ? color ?? COLORS.primary
    : isSecondary
      ? color ?? COLORS.primaryDark
      : isDanger
        ? "transparent"
        : "transparent";

  const borderW = isOutline ? 1 : isDanger ? 1 : 0;
  const borderC = isDanger ? COLORS.errorLight : isOutline ? COLORS.border : "transparent";
  const fg = isPrimary || isSecondary
    ? COLORS.background
    : isDanger
      ? COLORS.danger
      : color ?? COLORS.textPrimary;

  const opacity = disabled || loading ? 0.6 : 1;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        {
          backgroundColor: bg,
          borderWidth: borderW,
          borderColor: borderC,
          opacity: pressed ? 0.85 : opacity,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon as any} size={16} color={fg} />}
          <Text style={[s.label, { color: fg }, textStyle]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
};

const s = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.section,
    paddingVertical: 18,
    borderRadius: BORDER_RADIUS.button,
    gap: SPACING.small,
  },
  label: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});

export default AppButton;

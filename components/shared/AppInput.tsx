import React from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps, ViewStyle } from "react-native";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";

type Props = {
  label?: string;
  required?: boolean;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  containerStyle?: ViewStyle;
} & Omit<TextInputProps, "style">;

export const AppInput = ({
  label,
  required,
  value,
  onChangeText,
  placeholder,
  multiline,
  containerStyle,
  ...rest
}: Props) => {
  return (
    <View style={[s.container, containerStyle]}>
      {label != null && (
        <Text style={s.label}>
          {label}
          {required && <Text style={s.asterisk}> *</Text>}
        </Text>
      )}
      <TextInput
        style={[s.input, multiline && s.multiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textDisabled}
        multiline={multiline}
        {...rest}
      />
    </View>
  );
};

const s = StyleSheet.create({
  container: {},
  label: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.tiny,
    marginTop: SPACING.std,
  },
  asterisk: {
    color: COLORS.danger,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.compact,
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundPage,
  },
  multiline: {
    minHeight: 90,
    textAlignVertical: "top",
  },
});

export default AppInput;

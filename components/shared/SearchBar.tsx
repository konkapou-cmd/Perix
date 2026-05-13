import React from "react";
import { View, TextInput, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, FONT_SIZES, SPACING } from "../../lib/designTokens";

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  style?: ViewStyle;
  autoFocus?: boolean;
};

export const SearchBar = ({
  value,
  onChangeText,
  placeholder = "Search...",
  onClear,
  style,
  autoFocus,
}: SearchBarProps) => {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="search" size={18} color={COLORS.textMuted} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textDisabled}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
      />
      {value.length > 0 && onClear && (
        <Pressable onPress={onClear} hitSlop={8} style={styles.clearBtn}>
          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 44,
  },
  icon: {
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.primary,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 2,
  },
});

export default SearchBar;

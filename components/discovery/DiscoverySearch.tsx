import { useEffect, useRef, useState } from "react";
import { View, TextInput, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
};

export default function DiscoverySearch({ value, onChangeText, placeholder }: Props) {
  const { t } = useTranslation();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [local, setLocal] = useState(value);

  useEffect(() => { setLocal(value); }, [value]);

  const handleChange = (text: string) => {
    setLocal(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => onChangeText(text), 300);
  };

  const handleClear = () => {
    setLocal("");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    onChangeText("");
  };

  return (
    <View style={styles.container}>
      <Ionicons name="search" size={18} color={COLORS.textMuted} />
      <TextInput
        style={styles.input}
        value={local}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textDisabled}
        returnKeyType="search"
      />
      {local.length > 0 && (
        <Pressable onPress={handleClear} style={styles.clearBtn}>
          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    backgroundColor: COLORS.background,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    paddingVertical: 8,
  },
  clearBtn: {
    padding: 4,
  },
});

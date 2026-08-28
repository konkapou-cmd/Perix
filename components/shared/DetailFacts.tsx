import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING } from "../../lib/designTokens";

type DetailFactProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accentColor?: string;
  onPress?: () => void;
};

export function DetailFact({ icon, label, value, accentColor = "#59ABE3", onPress }: DetailFactProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.rowPressed : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Ionicons name={icon} size={18} color={accentColor} style={styles.icon} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color="#264348" style={styles.chevron} /> : null}
    </Pressable>
  );
}

type DetailFactsProps = {
  children: React.ReactNode;
};

export function DetailFacts({ children }: DetailFactsProps) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.small,
    paddingHorizontal: SPACING.std,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(38,67,72,0.08)",
  },
  rowPressed: {
    opacity: 0.6,
  },
  icon: {
    marginRight: 12,
  },
  label: {
    fontSize: 13,
    color: "rgba(38,67,72,0.65)",
    minWidth: 80,
  },
  value: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "600",
    color: "#264348",
    textAlign: "right",
    marginLeft: 12,
  },
  chevron: {
    marginLeft: 8,
  },
});

export default DetailFacts;

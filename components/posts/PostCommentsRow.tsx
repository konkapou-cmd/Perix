import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";

interface PostCommentsRowProps {
  count: number;
  onPress: () => void;
}

export default function PostCommentsRow({ count, onPress }: PostCommentsRowProps) {
  if (!count) return null;

  return (
    <Pressable style={styles.container} onPress={onPress}>
      <Ionicons name="chatbubble-outline" size={14} color={COLORS.textMuted} />
      <Text style={styles.text}>
        View {count > 1 ? `all ${count} comments` : "1 comment"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 2,
  },
  text: {
    fontSize: 13,
    color: COLORS.textGray,
  },
});

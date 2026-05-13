import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  subMessage?: string;
};

export const EmptyState = ({ icon = "document-outline", message, subMessage }: EmptyStateProps) => {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={COLORS.border} />
      <Text style={styles.message}>{message}</Text>
      {subMessage && <Text style={styles.subMessage}>{subMessage}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 32,
  },
  message: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  subMessage: {
    color: COLORS.textDisabled,
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
});

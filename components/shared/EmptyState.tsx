import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  message: string;
  subMessage?: string;
};

export const EmptyState = ({ icon = "document-outline", message, subMessage }: EmptyStateProps) => {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color="#d1d5db" />
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
    color: "#6b7280",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  subMessage: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
});

import { Redirect, router } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../context/AuthContext";
import { COLORS } from "../lib/designTokens";

export default function Index() {
  const { user, loading } = useAuth();

  const handleClearSession = async () => {
    await AsyncStorage.multiRemove(["session_token", "active_identity"]);
    router.replace("/login");
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
        <Pressable style={styles.clearButton} onPress={handleClearSession}>
          <Text style={styles.clearButtonText}>Clear session & login</Text>
        </Pressable>
      </View>
    );
  }

  return <Redirect href={user ? "/home" : "/login"} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.backgroundPage,
  },
  clearButton: {
    marginTop: 40,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.error,
    borderRadius: 8,
  },
  clearButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});

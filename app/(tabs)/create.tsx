import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../lib/designTokens";

export default function CreateScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        router.replace("/camera");
      } catch (error) {
        console.warn("Create tab redirect failed:", error);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.backgroundPage }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

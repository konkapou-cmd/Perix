import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "../../lib/designTokens";

export default function CreateScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/camera");
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.backgroundPage }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

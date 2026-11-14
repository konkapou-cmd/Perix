import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import Constants from "expo-constants";
import Game from "../components/game/MagdeburgSportCabrioGame";
import { PERIX_VECTOR_MAP_ID } from "../lib/city/mapPresentation";

const GEO_KEY =
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GEO_KEY ||
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  (process.env as any)?.EXPO_PUBLIC_GEO_KEY ||
  (process.env as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

/** Fullscreen driving game (mobile web only). The same map from the user's
 *  location, car spawns there, zoom/rotation locked, camera follows driver.
 *  Back returns to /app with its state intact (stack pop). */
export default function GameScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string }>();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const hasOrigin = Number.isFinite(lat) && Number.isFinite(lng);
  const isMobileWeb = Platform.OS === "web" && width < 1024;
  const goBack = () => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace("/app");
    } catch {
      try { router.replace("/app"); } catch {}
    }
  };
  if (!isMobileWeb || !hasOrigin) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#064472", textAlign: "center" }}>
          {!hasOrigin ? "Missing location" : "Available on mobile"}
        </Text>
        <Text style={{ marginTop: 8, color: "#5C7A99", textAlign: "center" }}>
          {!hasOrigin
            ? "Open /app, confirm your location, then tap fullscreen."
            : "Open this page on your phone to drive."}
        </Text>
        <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel="Back"
          onPress={goBack} style={{ marginTop: 16, paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: "#096BFF", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <Game
      apiKey={GEO_KEY}
      mapId={PERIX_VECTOR_MAP_ID}
      startPoint={{ latitude: lat, longitude: lng }}
      streetLines={[]}
      obstacles={[]}
      onExit={goBack}
    />
  );
}

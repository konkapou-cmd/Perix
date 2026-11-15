import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Pressable, Text, View } from "react-native";
import Constants from "expo-constants";
import Game from "../components/game/MagdeburgSportCabrioGame";
import { PERIX_VECTOR_MAP_ID } from "../lib/city/mapPresentation";
import { loadGameRoads, type RoadWay } from "../lib/city/gameRoads";

const GEO_KEY =
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GEO_KEY ||
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  (process.env as any)?.EXPO_PUBLIC_GEO_KEY ||
  (process.env as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

/** Fullscreen driving game (mobile web only). The same map from the user's
 *  location, car spawns there, zoom/rotation locked, camera follows driver.
 *  Real OSM road polylines (ODbL) bound the drive: leaving the roads ejects
 *  the driver. Back returns to /app with its state intact (stack pop). */
export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string }>();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const hasOrigin = Number.isFinite(lat) && Number.isFinite(lng);
  const isWeb = Platform.OS === "web";
  // null = loading; [] = free-roam fallback (fetch failed); list = road-bound.
  const [streetLines, setStreetLines] = useState<RoadWay[] | null>(null);
  const goBack = () => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace("/app");
    } catch {
      try { router.replace("/app"); } catch {}
    }
  };
  useEffect(() => {
    if (!isWeb || !hasOrigin) return;
    let active = true;
    void loadGameRoads({ latitude: lat, longitude: lng }).then((roads) => {
      if (active) setStreetLines(roads);
    });
    return () => { active = false; };
  }, [isWeb, hasOrigin, lat, lng]);
  if (!isWeb || !hasOrigin) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#064472", textAlign: "center" }}>
          {!hasOrigin ? "Missing location" : "Available on web"}
        </Text>
        <Text style={{ marginTop: 8, color: "#5C7A99", textAlign: "center" }}>
          {!hasOrigin
            ? "Open /app, confirm your location, then tap the wooden car."
            : "Open this page in a browser to drive (WASD / arrows on desktop)."}
        </Text>
        <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel="Back"
          onPress={goBack} style={{ marginTop: 16, paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: "#096BFF", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    );
  }
  if (streetLines === null) {
    return (
      <View testID="game-loading-roads" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#064472", textAlign: "center" }}>
          Φόρτωση δρόμων…
        </Text>
        <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel="Back"
          onPress={goBack} style={{ marginTop: 16, paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: "#096BFF", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, position: "relative" }}>
      <Game
        apiKey={GEO_KEY}
        mapId={PERIX_VECTOR_MAP_ID}
        startPoint={{ latitude: lat, longitude: lng }}
        streetLines={streetLines}
        obstacles={[]}
        laneHalfWidth={4.6}
        onExit={goBack}
      />
      <Text style={{ position: "absolute", right: 10, bottom: 8, color: "#FFFFFF", fontSize: 10, opacity: 0.85, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>
        © OpenStreetMap contributors · ODbL
      </Text>
    </View>
  );
}

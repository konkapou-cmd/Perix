import { useEffect, useRef, useState, Component, type ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Pressable, Text, View, useWindowDimensions } from "react-native";
import Constants from "expo-constants";
import Game from "../components/game/MagdeburgSportCabrioGame";
import { PERIX_VECTOR_MAP_ID } from "../lib/city/mapPresentation";
import { loadGameRoads, type RoadWay } from "../lib/city/gameRoads";
import { initialNearbyMapZoom } from "../lib/city/mapLayout";

/** Catches any runtime crash while the game mounts (WebGL, fullscreen
 *  transitions) so the player never gets thrown back to /app with a lost
 *  origin - they get a friendly screen and a Back button instead. */
class GameErrorBoundary extends Component<{ onExit: () => void; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <View testID="game-error-boundary" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#06233F" }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFFFFF", textAlign: "center" }}>
            Παρουσιάστηκε σφάλμα κατά την εκκίνηση του παιχνιδιού.
          </Text>
          <Text style={{ marginTop: 8, color: "#9FC3E8", textAlign: "center", fontSize: 13 }}>
            Δοκίμασε ξανά - αν επιμένει, η συσκευή μπορεί να μην υποστηρίζει το 3D.
          </Text>
          <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel="Back"
            onPress={this.props.onExit} style={{ marginTop: 20, paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: "#096BFF", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Back</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const GEO_KEY =
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GEO_KEY ||
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  (process.env as any)?.EXPO_PUBLIC_GEO_KEY ||
  (process.env as any)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

/** Landscape + fullscreen entry: both need a user gesture on mobile
 *  browsers, so the start tap requests them before the game mounts. */
function enterLandscape() {
  try {
    const el = document.documentElement as any;
    if (el && el.requestFullscreen) el.requestFullscreen();
  } catch (e) {}
  try {
    const orientation = (screen as any).orientation;
    const lock = orientation && orientation.lock;
    if (lock) {
      const p = lock("landscape");
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) {}
}

/** Fullscreen driving game (mobile web only). The same map from the user's
 *  location, opens at the same area-scale zoom as /app, car spawns there,
 *  camera follows driver. Real OSM road polylines (ODbL) bound the drive:
 *  leaving the roads ejects the driver. Back returns to /app with its state
 *  intact (stack pop). */
export default function GameScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; label?: string }>();
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  const hasOrigin = Number.isFinite(lat) && Number.isFinite(lng);
  const isWeb = Platform.OS === "web";
  // null = loading; [] = free-roam fallback (fetch failed); list = road-bound.
  const [streetLines, setStreetLines] = useState<RoadWay[] | null>(null);
  const [started, setStarted] = useState(false);
  // Same opening zoom as the /app map (300m target span, capped at 18).
  // Computed ONCE: the fullscreen/orientation resize must not change the
  // camera the game boots with (a changing prop would re-create the map).
  const openingZoomRef = useRef<number | null>(null);
  if (openingZoomRef.current === null) {
    openingZoomRef.current = initialNearbyMapZoom(width, height, Number.isFinite(lat) ? lat : 52.13, 300, 850, 18);
  }
  const openingZoom = openingZoomRef.current;
  const goBack = () => {
    try {
      if (router.canGoBack()) router.back();
      else router.replace("/app");
    } catch {
      try { router.replace("/app"); } catch {}
    }
  };
  const startGame = () => {
    enterLandscape();
    setStarted(true);
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
  if (!started) {
    return (
      <View testID="game-start-screen" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#06233F" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: "#FFFFFF", textAlign: "center" }}>
          Perix Driving
        </Text>
        <Text style={{ marginTop: 8, color: "#9FC3E8", textAlign: "center", fontSize: 14 }}>
          Οδήγησε στους δρόμους της πόλης. Εκτός δρόμου: τρακάρισμα!
        </Text>
        <Pressable testID="game-start" accessibilityRole="button" accessibilityLabel="Start driving"
          onPress={startGame} style={{ marginTop: 22, paddingHorizontal: 34, height: 52, borderRadius: 26, backgroundColor: "#096BFF", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>▶ Ξεκίνα (οριζόντια)</Text>
        </Pressable>
        <Text style={{ marginTop: 14, color: "#7FA3C8", textAlign: "center", fontSize: 12 }}>
          Το παιχνίδι ανοίγει σε πλήρη οθόνη, οριζόντια.
        </Text>
        <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel="Back"
          onPress={goBack} style={{ marginTop: 24, paddingHorizontal: 20, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#3D6A96", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#9FC3E8", fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, position: "relative" }}>
      <GameErrorBoundary onExit={goBack}>
        <Game
          apiKey={GEO_KEY}
          mapId={PERIX_VECTOR_MAP_ID}
          startPoint={{ latitude: lat, longitude: lng }}
          streetLines={streetLines}
          obstacles={[]}
          laneHalfWidth={4.6}
          initialZoom={openingZoom}
          onExit={goBack}
        />
      </GameErrorBoundary>
      <Text style={{ position: "absolute", right: 10, bottom: 8, color: "#FFFFFF", fontSize: 10, opacity: 0.85, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>
        © OpenStreetMap contributors · ODbL
      </Text>
    </View>
  );
}

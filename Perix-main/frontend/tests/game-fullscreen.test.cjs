const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
function load(file, dependencies = {}) {
  const exports = {};
  const module = { exports };
  const ReactGlobal = dependencies.react && (dependencies.react.default || dependencies.react);
  vm.runInNewContext(
    ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText,
    { exports, module, require: (name) => dependencies[name], console, React: ReactGlobal }
  );
  return module.exports;
}
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useMemo: (fn) => fn(),
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
};
let viewportWidth = 390;
const rn = {
  View: "View", Text: "Text", Image: "Image", Pressable: "Button",
  Platform: { OS: "web" }, StyleSheet: { create: (v) => v },
  useWindowDimensions: () => ({ width: viewportWidth, height: 800 }),
};
function nodes(tree, depth = 0) {
  if (!tree || typeof tree !== "object" || depth > 25) return [];
  if (Array.isArray(tree)) return tree.flatMap((t) => nodes(t, depth + 1));
  if (typeof tree.type === "function") {
    try {
      return nodes(tree.type(tree.props || {}), depth + 1);
    } catch {
      return [tree];
    }
  }
  return [tree, ...nodes(tree.props?.children, depth + 1)];
}
function texts(tree) {
  return nodes(tree).filter((n) => n.type === "Text").map((n) => [].concat(n.props.children || []).join(""));
}

test("header keeps fullscreen toggle and adds a separate wooden-cabrio game entry", () => {
  let pushed = null;
  const Header = load("components/city/MapScreenHeader.tsx", {
    react: { default: React }, "react-native": rn,
    "expo-router": { usePathname: () => "/app", useRouter: () => ({ navigate: (p) => { pushed = p; } }) },
    "react-i18next": { useTranslation: () => ({ t: (k, f) => f }) },
    "../../context/AuthContext": { useAuth: () => ({ user: null, loading: false }) },
    "../brand/PerixLogo": { default: "Logo" },
    "../../lib/city/mapLayout": {
      MAP_PAGE_BACKGROUND: "#fff", MAP_PAGE_GUTTER: 16, MAP_PAGE_MAX_WIDTH: 1200,
      MAP_HEADER_BRAND_HEIGHT: 56,
      mapHeaderMetrics: () => ({ logoWidth: 120, primaryWidth: 300, gap: 8, appWidth: 80, membersWidth: 104, compact: true }),
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
  }).default;
  viewportWidth = 390;
  const tree = Header({ gameOrigin: { latitude: 52.13, longitude: 11.63 } });
  const fsBtn = nodes(tree).find((n) => n.props.testID === "fullscreen-toggle");
  assert.ok(fsBtn, "fullscreen toggle renders on mobile");
  fsBtn.props.onPress();
  assert.equal(pushed, null, "fullscreen toggle keeps Fullscreen API behavior (no navigation)");
  const gameBtn = nodes(tree).find((n) => n.props.testID === "game-entry");
  assert.ok(gameBtn, "separate wooden-cabrio game entry renders next to it");
  gameBtn.props.onPress();
  assert.ok(String(pushed).startsWith("/game?"), `game entry navigates to /game, got ${pushed}`);
  assert.match(String(pushed), /lat=52\.13/);
  assert.match(String(pushed), /lng=11\.63/);
  pushed = null;
  const tree2 = Header({});
  nodes(tree2).find((n) => n.props.testID === "fullscreen-toggle").props.onPress();
  assert.equal(pushed, null, "without origin keeps Fullscreen API behavior (no navigation)");
  viewportWidth = 1280;
});

test("desktop header shows magnifier plus cabrio game entry", () => {
  const Header = load("components/city/MapScreenHeader.tsx", {
    react: { default: React }, "react-native": rn,
    "expo-router": { usePathname: () => "/app", useRouter: () => ({ navigate: () => {} }) },
    "react-i18next": { useTranslation: () => ({ t: (k, f) => f }) },
    "../../context/AuthContext": { useAuth: () => ({ user: null, loading: false }) },
    "../brand/PerixLogo": { default: "Logo" },
    "./FontMagnifierButton": { default: "Magnifier" },
    "../../lib/city/mapLayout": {
      MAP_PAGE_BACKGROUND: "#fff", MAP_PAGE_GUTTER: 16, MAP_PAGE_MAX_WIDTH: 1200,
      MAP_HEADER_BRAND_HEIGHT: 56,
      mapHeaderMetrics: () => ({ logoWidth: 120, primaryWidth: 300, gap: 8, appWidth: 80, membersWidth: 104, compact: true }),
    },
    "@expo/vector-icons": { Ionicons: "Icon" },
  }).default;
  viewportWidth = 1280;
  const desk = nodes(Header({ gameOrigin: { latitude: 52.13, longitude: 11.63 } }));
  assert.ok(desk.find((n) => n.props.testID === "map-header-desktop-tools"), "desktop tools cluster renders");
  assert.ok(desk.find((n) => n.type === "Magnifier"), "magnifier on desktop");
  assert.ok(desk.find((n) => n.props.testID === "game-entry"), "cabrio game entry on desktop");
  viewportWidth = 390;
  const mob = nodes(Header({ gameOrigin: { latitude: 52.13, longitude: 11.63 } }));
  assert.equal(mob.find((n) => n.props.testID === "map-header-desktop-tools"), undefined, "no desktop cluster on mobile");
  viewportWidth = 1280;
});

test("font magnifier offers instant global sizes", () => {
  const src = read("components/city/FontMagnifierButton.tsx");
  assert.match(src, /FONT_SCALE_STEPS\.map/);
  assert.match(src, /setStoredFontScale\(c\)/);
  assert.match(src, /font-magnifier-option-/);
  const Magnifier = load("components/city/FontMagnifierButton.tsx", {
    react: { default: React },
    "react-native": { ...rn, Platform: { OS: "web", select: (values) => values.web } },
    "react-i18next": { useTranslation: () => ({ t: (k, f) => f }) },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "../../lib/fontScale": {
      FONT_SCALE_STEPS: ["85", "100", "130"],
      getStoredFontScale: async () => "100",
      setStoredFontScale: async () => {},
    },
  }).default;
  const tree = nodes(Magnifier({}));
  assert.ok(tree.find((n) => n.props.testID === "font-magnifier-toggle"), "magnifier toggle renders");
});

test("game route loads real roads, drives on web and gates native/missing origin", () => {
  let router = null;
  const deps = (w, params, platform = "web") => ({
    react: { ...React, default: React }, "react-native": { ...rn, Platform: { OS: platform }, useWindowDimensions: () => ({ width: w, height: 800 }) },
    "expo-router": {
      useLocalSearchParams: () => params,
      useRouter: () => { router = { back: () => { router.backed = true; }, replace: (p) => { router.replaced = p; }, canGoBack: () => true }; return router; },
    },
    "expo-constants": { default: { expoConfig: { extra: { EXPO_PUBLIC_GEO_KEY: "k" } } } },
    "../components/game/MagdeburgSportCabrioGame": { default: "Game" },
    "../lib/city/mapPresentation": { PERIX_VECTOR_MAP_ID: "mid" },
    "../lib/city/gameRoads": { loadGameRoads: async () => [], filterRoadWays: () => [] },
  });
  const Screen = load("app/game.tsx", deps(390, { lat: "52.13", lng: "11.63" })).default;
  const tree = Screen();
  assert.ok(texts(tree).join(" ").includes("Φόρτωση δρόμων"), "web waits for the OSM roads before mounting the game");
  assert.ok(nodes(tree).find((n) => n.props.testID === "game-loading-roads"), "loading view is explicit");
  const desk = load("app/game.tsx", deps(1280, { lat: "52.13", lng: "11.63" })).default();
  assert.ok(texts(desk).join(" ").includes("Φόρτωση δρόμων"), "desktop web also loads roads (WASD/arrows)");
  const nat = load("app/game.tsx", deps(390, { lat: "52.13", lng: "11.63" }, "android")).default();
  assert.ok(texts(nat).join(" ").includes("web"), "native stays gated");
  const noloc = load("app/game.tsx", deps(390, {})).default();
  assert.ok(texts(noloc).join(" ").includes("Missing location"), "missing origin is explained");
  const src = read("app/game.tsx");
  assert.match(src, /loadGameRoads\(\{ latitude: lat, longitude: lng \}\)/);
  assert.match(src, /streetLines=\{streetLines\}/);
  assert.match(src, /laneHalfWidth=\{4\.6\}/);
  assert.match(src, /© OpenStreetMap contributors/);
  assert.match(src, /onExit=\{goBack\}/);
});

test("packed road polylines filter to the origin radius with a cap", () => {
  const { filterRoadWays } = load("lib/city/gameRoads.ts", {});
  const origin = { latitude: 52.13, longitude: 11.63 };
  const near = [[52.1301, 11.6301], [52.1302, 11.6302]];
  const far = [[52.5, 11.9], [52.51, 11.91]];
  const mixed = [[52.5, 11.9], [52.1301, 11.6301]]; // touches the radius via one point
  const out = filterRoadWays([far, near, mixed, null], origin, 450, 500);
  assert.equal(out.length, 2, "only ways touching the radius survive");
  assert.equal(out[0][0].lat, 52.1301);
  const capped = filterRoadWays([near, near, near, near, near], origin, 450, 2);
  assert.equal(capped.length, 2, "cap limits the way count");
  const invalid = filterRoadWays([[["x", "y"]]], origin, 450, 500);
  assert.equal(invalid.length, 0, "non-numeric points are dropped");
  assert.equal(filterRoadWays([], { latitude: NaN, longitude: 1 }).length, 0, "invalid origin returns empty");
});

test("game component starts from origin, free-roams without streets, and exits on back", () => {
  const src = read("components/game/MagdeburgSportCabrioGame.jsx");
  assert.doesNotMatch(src, /YOUR_GOOGLE_MAPS_API_KEY|YOUR_VECTOR_MAP_ID/);
  assert.match(src, /startPoint\s*=\s*null/);
  assert.match(src, /streetLines\s*=\s*\[\]/);
  assert.match(src, /hasStreets/);
  assert.match(src, /Free-roam/);
  assert.match(src, /mapTypeId: 'roadmap'/);
  assert.match(src, /tilt:\s*67/);
  const web = read("components/BusinessMap.web.tsx");
  assert.match(web, /map-mobile-cluster/);
  assert.match(web, /map-zoom-in/);
  assert.match(web, /map-zoom-out/);
  assert.match(web, /map-game-entry/);
  assert.match(web, /onGamePress/);
  const native = read("components/BusinessMap.native.tsx");
  assert.match(native, /map-mobile-cluster/);
  assert.match(native, /zoomControl(Enabled)?=\{false\}/);
  assert.match(native, /onGamePress\?:/);
  assert.match(src, /zoom:\s*20\.2/);
  assert.match(src, /tilt:\s*67/);
  assert.match(src, /map\.moveCamera/);
  assert.match(src, /onExit/);
  assert.match(src, /aria-label="Back"/);
  assert.match(src, /\.catch\(\(\) =>/);
  assert.match(src, /overlay\.setMap\(null\)/);
  // Car sits ON the terrain: elevation-anchored projection, scene shifted
  // to the car as local origin (no vertical slide at 67° tilt).
  assert.match(src, /new google\.maps\.ElevationService\(\)/);
  assert.match(src, /altitude: groundAltitude/);
  assert.match(src, /scene\.position\.set\(-state\.carPos\.x, 0, -state\.carPos\.z\)/);
  assert.match(src, /projectionMatrixInverse/);
  // Crash/eject/walk-back logic stays wired (obstacles trigger it).
  assert.match(src, /evaluateStreetBounds/);
  assert.match(src, /mode === 'FLYING'|'FLYING'/);
  assert.match(src, /'WALKING'/);
  assert.match(src, /'Τράκαρες!|Τράκαρες!/);
});

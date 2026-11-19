import { useEffect, useRef, useState, lazy, Suspense, Component, type ReactNode, type ComponentType } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import {Ionicons} from '@expo/vector-icons';
import Constants from "expo-constants";
import { useIsFocused } from "@react-navigation/native";
import { PERIX_VECTOR_MAP_ID } from "../lib/city/mapPresentation";
import { initialNearbyMapZoom } from "../lib/city/mapLayout";
import { createGameDisplaySession, gameDisplayMessage } from "../lib/gameDisplay";
import { FLIGHT_START_CITIES } from '../lib/city/flightStartCities';
import { useTranslation } from 'react-i18next';
import type { GameDisplayStatus } from '../lib/gameDisplay';

// Do not initialize Three.js/audio/game handlers merely by opening /app.
type GameProps = { apiKey: string; mapId: string; startPoint: { latitude: number; longitude: number };
  initialZoom: number;
  onExit: () => void; onLandscape: () => void; onFullscreen:()=>void; orientationNotice:string; onDismissOrientationNotice:()=>void };
const Game = lazy(() => import("../components/game/CityFlightGame")
  .then(module => ({ default: module.default as ComponentType<GameProps> })));
const INTRO_ART = require("../assets/game/perix-wooden-plane-adventure.webp");
const CITY_ART:Record<string,number>={magdeburg:require('../assets/landmarks/original-70/legacy-042.webp'),syros:require('../assets/landmarks/islands/gr-syros-001.webp'),mykonos:require('../assets/landmarks/islands/gr-mykonos-036.webp')};

/** Catches any runtime crash while the game mounts (WebGL, fullscreen
 *  transitions) so the player never gets thrown back to /app with a lost
 *  origin - they get a friendly screen and a Back button instead. */
class GameErrorBoundary extends Component<{ onExit: () => void; copy:{title:string;hint:string;back:string}; children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return (
        <View testID="game-error-boundary" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#06233F" }}>
          <View accessibilityRole="alert" accessibilityLabel={`${this.props.copy.title} ${this.props.copy.hint}`}><Ionicons name="alert-circle-outline" size={36} color="#9FC3E8"/></View>
          <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel={this.props.copy.back}
            onPress={this.props.onExit} style={{ marginTop: 20, paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: "#096BFF", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-back" size={22} color="#fff"/>
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

/** Independent city flight. One origin copy, automatic forward flight and
 *  altitude/turn controls. Portrait phones wait for landscape before mounting
 *  any flight map/WebGL scene. App camera and transit remain untouched. */
export default function GameScreen() {
  const {t}=useTranslation('flight');
  const router = useRouter();
  const focused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const [selectedCity,setSelectedCity]=useState<string|null>(null);
  const city=FLIGHT_START_CITIES.find(item=>item.id===selectedCity);
  // Capture the chosen pin by value when Start is tapped. Never modify GPS.
  const [flightOrigin,setFlightOrigin]=useState<{latitude:number;longitude:number}|null>(null);
  const origin=flightOrigin??(city?{latitude:city.latitude,longitude:city.longitude}:null);
  const lat=origin?.latitude??NaN;
  const isWeb = Platform.OS === "web";
  const [started, setStarted] = useState(false);
  const [displayStatus,setDisplayStatus]=useState<GameDisplayStatus|''>('');
  const orientationNotice=displayStatus?gameDisplayMessage(displayStatus,(key,fallback)=>t(key,{defaultValue:fallback})):'';
  // Flight is landscape-only on EVERY viewport, not just small phones.
  const portrait = height >= width;
  const display = useRef<ReturnType<typeof createGameDisplaySession> | null>(null);
  useEffect(() => {
    if (!isWeb || !focused) return;
    const session = createGameDisplaySession(document, screen.orientation,status=>{
      if(display.current===session)setDisplayStatus(status);
    });
    display.current = session;
    return () => { display.current = null; void session.close(); };
  }, [isWeb, focused]);
  // Use /app's nearby framing as a seed; flightCamera independently enforces
  // close city zoom for the low flight start without changing /app's zoom.
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
    if(!city)return;
    setFlightOrigin({latitude:city.latitude,longitude:city.longitude});
    // Try fullscreen from this click, then orientation; never await either
    // before starting an ALREADY landscape game. A later button click retries.
    // The portrait guard below still prevents any vertical flight scene.
    void display.current?.enter();
    setStarted(true);
  };
  // Stack screens may remain mounted when blurred. Unmount the actual game
  // immediately so it cannot drive its camera or consume the GPU in /app.
  if (!focused) return null;
  if (!isWeb) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" }}>
        <View accessibilityRole="alert" accessibilityLabel={`${t('nativeOnly')} ${t('nativeHint')}`}><Ionicons name="globe-outline" size={36} color="#5C7A99"/></View>
        <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel={t('back')}
          onPress={goBack} style={{ marginTop: 16, paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: "#096BFF", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={22} color="#fff"/>
        </Pressable>
      </View>
    );
  }
  if (!started || portrait) {
    const artWidth=portrait?Math.min(width-48,440):Math.max(120,Math.min(width*.4,420));
    const artHeight=portrait?Math.min(height*.32,artWidth*.75,330):Math.max(140,Math.min(height-48,315));
    return (
      <View testID="game-start-screen" style={{ flex: 1, backgroundColor: "#ffffff" }}>
        <ScrollView style={{flex:1}} contentContainerStyle={{flexGrow:1,alignItems:'center',justifyContent:'center',
          flexDirection:portrait?'column':'row',gap:20,padding:24}}>
        <Image source={INTRO_ART} resizeMode="contain" testID="flight-intro-art"
          accessibilityLabel={t('introAlt')}
          style={{width:artWidth,height:artHeight,borderRadius:18,flexShrink:0}} />
        <View style={{maxWidth:440,width:portrait?'100%':undefined,flexShrink:1,flexGrow:portrait?0:1,alignItems:'center'}}>
        <View testID="flight-city-picker" accessibilityRole="radiogroup" accessibilityLabel={t('chooseCity')} style={{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:10,marginTop:10}}>
          {FLIGHT_START_CITIES.map(item=><Pressable key={item.id} testID={`flight-city-${item.id}`} accessibilityRole="radio"
            accessibilityLabel={t(`cities.${item.id}`)} accessibilityState={{checked:selectedCity===item.id}}
            onPress={()=>{setSelectedCity(item.id);setStarted(false);setFlightOrigin(null);openingZoomRef.current=null;}}
            style={{width:76,height:62,borderRadius:14,borderWidth:2,borderColor:selectedCity===item.id?'#269fd8':'#dcecf6',backgroundColor:'#fff',overflow:'hidden'}}>
            <Image source={CITY_ART[item.id]} accessible={false} resizeMode="cover" style={{width:72,height:58}}/>
          </Pressable>)}
        </View>
        {portrait&&<View testID="flight-rotate-notice" accessibilityRole="image" accessibilityLabel={t('rotateNotice')} style={{marginTop:14}}><Ionicons name="phone-landscape-outline" size={27} color="#269fd8"/></View>}
        <Pressable testID="game-start" accessibilityRole="button" accessibilityLabel={t('start')}
          disabled={!city} accessibilityState={{disabled:!city}} onPress={startGame} style={{ marginTop: 22, paddingHorizontal: 34, height: 52, borderRadius: 26, backgroundColor:city?'#096BFF':'#9db4c9', alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 17 }}>{t('start')}</Text>
        </Pressable>
        <Pressable testID="game-back" accessibilityRole="button" accessibilityLabel={t('back')}
          onPress={goBack} style={{ marginTop: 24, paddingHorizontal: 20, height: 40, borderRadius: 20, borderWidth: 1, borderColor: "#3D6A96", alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="arrow-back" size={21} color="#276486"/>
        </Pressable>
        </View>
        </ScrollView>
      </View>
    );
  }
  if(!origin)return null;
  return (
    <View style={{ flex: 1, position: "absolute", top:0,right:0,bottom:0,left:0 }}>
      <GameErrorBoundary onExit={goBack} copy={{title:t('errorTitle'),hint:t('errorHint'),back:t('back')}}>
        <Suspense fallback={<ActivityIndicator accessibilityLabel={t('loadingScene')} color="#269fd8"/>}>
          <Game
            apiKey={GEO_KEY}
            mapId={PERIX_VECTOR_MAP_ID}
            startPoint={origin}
            initialZoom={openingZoom}
            onExit={goBack}
            onLandscape={() => { void display.current?.landscape(); }}
            onFullscreen={() => { void display.current?.fullscreen(); }}
            orientationNotice={orientationNotice}
            onDismissOrientationNotice={()=>setDisplayStatus('')}
          />
        </Suspense>
      </GameErrorBoundary>
    </View>
  );
}

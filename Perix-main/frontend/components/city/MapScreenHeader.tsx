import React from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import "../../i18n/city";
import { useAuth } from "../../context/AuthContext";
import PerixLogo from "../brand/PerixLogo";
import FontMagnifierButton from "./FontMagnifierButton";
import { MAP_PAGE_BACKGROUND, MAP_PAGE_GUTTER, MAP_PAGE_MAX_WIDTH, MAP_HEADER_BRAND_HEIGHT, mapHeaderMetrics } from "../../lib/city/mapLayout";

const FS_ENTER = require("../../assets/brand/fullscreen-enter.png");
const FS_EXIT = require("../../assets/brand/fullscreen-exit.png");
const GAME_CABRIO = require("../../assets/brand/game-cabrio.png");

/** Small centered fullscreen toggle (web only). Uses the Fullscreen API —
 *  no page zoom — so the map stays stable and pannable. */
function FullscreenToggle({ label, exitLabel }: { label: string; exitLabel: string }) {
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => {
      try { setFull(!!document.fullscreenElement); } catch {}
    };
    document.addEventListener("fullscreenchange", onChange);
    try { setFull(!!document.fullscreenElement); } catch {}
    return () => {
      try { document.removeEventListener("fullscreenchange", onChange); } catch {}
    };
  }, []);
  const toggle = () => {
    try {
      if (typeof document === "undefined") return;
      if (document.fullscreenElement) {
        void (document.exitFullscreen ? document.exitFullscreen() : undefined);
      } else {
        const el = document.documentElement as any;
        void (el && el.requestFullscreen ? el.requestFullscreen() : undefined);
      }
    } catch {}
  };
  return <Pressable testID="fullscreen-toggle" accessibilityRole="button"
    accessibilityLabel={full ? exitLabel : label} accessibilityState={{ expanded: full }}
    onPress={toggle} style={styles.fullscreenButton} hitSlop={6}>
    <Image source={full ? FS_EXIT : FS_ENTER} resizeMode="contain" style={styles.fullscreenIcon} accessible={false} />
  </Pressable>;
}

/** Mobile game entry: wooden cabrio icon, same 40px circle, exactly right of fullscreen. */
function GameButton({ gameHref }: { gameHref: string | null }) {
  const router = useRouter();
  const { t } = useTranslation();
  if (!gameHref) return null;
  return <Pressable testID="game-entry" accessibilityRole="button"
    accessibilityLabel={t("common.game", "Game")}
    onPress={() => router.navigate(gameHref as never)} style={styles.gameButton} hitSlop={6}>
    <Image source={GAME_CABRIO} resizeMode="cover" style={styles.gameIcon} accessible={false} />
  </Pressable>;
}

export default function MapScreenHeader({publicScreen=false,hideExplore=false,exploreOnly=false,right,brand,logoVariant,onBack,gameOrigin}:{publicScreen?:boolean;hideExplore?:boolean;exploreOnly?:boolean;right?:React.ReactNode;brand?:React.ReactNode | ((compact:boolean)=>React.ReactNode);logoVariant?:"watercolor"|"english";onBack?:()=>void;gameOrigin?:{latitude:number;longitude:number}|null}){
  const {t}=useTranslation(),{user,loading:authLoading}=useAuth(),router=useRouter(),pathname=usePathname();
  const width=useWindowDimensions().width,metrics=mapHeaderMetrics(width);
  const showDesktopLinks=width>=1024 && !hideExplore;
  const isDesktopWeb = Platform.OS === "web" && width >= 1024;
  // Fullscreen lives only on mobile web — desktop has browser zoom, native has no Fullscreen API.
  const showFullscreen = Platform.OS === "web" && width < 1024;
  // On /app the center button opens the fullscreen driving game at the user's
  // confirmed origin (stack push — back returns with /app state intact).
  const gameHref = gameOrigin && Number.isFinite(gameOrigin.latitude) && Number.isFinite(gameOrigin.longitude)
    ? `/game?lat=${gameOrigin.latitude}&lng=${gameOrigin.longitude}` as never : null;
  type NavLink={id:'app'|'members';label:string;path:string};
  const primary:NavLink[]=[{id:'app',label:'APP',path:'/app'},{id:'members',label:t('nav.members','Members'),path:user?'/home':'/login'}];
  // Members is the former Home destination, not an extra navigation item.
  const button=(link:NavLink,fixed=false)=>{
    const active=link.id==='app' ? pathname==='/' || pathname==='/app' : pathname===link.path;
    return <Pressable key={link.id} testID={`map-nav-${link.id}`} accessibilityRole="button" accessibilityState={{selected:active}}
      disabled={link.id==='members' && authLoading} onPress={()=>router.navigate(link.path as never)}
      accessibilityLabel={link.label}
      style={[styles.link,fixed && {width:link.id==='app'?metrics.appWidth:metrics.membersWidth,paddingHorizontal:0},
        !fixed && metrics.compact && styles.iconLink]}>
      {!fixed && metrics.compact ? <Ionicons name="compass-outline" size={20} color={active ? "#59ABE3" : "#064472"} />
        : <Text style={[styles.text,metrics.compact && styles.compactText,active && styles.activeText]} numberOfLines={1}>{link.label}</Text>}
    </Pressable>;
  };
  return <View style={styles.header} testID="map-screen-header">
    <View style={styles.row}>
      <View style={styles.side} testID="map-header-brand-slot">
         {onBack && <Pressable testID="map-header-back" accessibilityRole="button" accessibilityLabel={t("common.back", "Back")}
           onPress={onBack} style={styles.backButton} hitSlop={8}>
           <Ionicons name="arrow-back" size={22} color="#064472" />
         </Pressable>}
         <View style={{width:metrics.logoWidth,flexShrink:0}}>{typeof brand==='function'?brand(metrics.compact):brand || <PerixLogo size={metrics.compact?'mobileHeader':'compact'} variant={logoVariant} />}</View>
      </View>
       {showDesktopLinks && <View testID="map-screen-navigation" style={{width:metrics.primaryWidth,flexShrink:0}}>
         <View style={[styles.navGroup,{gap:metrics.gap}]} testID="map-primary-navigation">{primary.map(link=>button(link,true))}</View>
       </View>}
      <View style={[styles.side,styles.right]} testID="map-header-actions-slot">
        {right}
        {isDesktopWeb && (
          <View testID="map-header-desktop-tools" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <FontMagnifierButton />
            <GameButton gameHref={gameHref} />
          </View>
        )}
      </View>
      {showFullscreen && (
        <View testID="map-header-fullscreen-slot" pointerEvents="box-none" style={styles.fullscreenCenter}>
          <FullscreenToggle label={t("common.fullscreen", "Fullscreen")} exitLabel={t("common.exitFullscreen", "Exit fullscreen")} />
          {gameHref ? <View style={{ width: 8 }} /> : null}
          <GameButton gameHref={gameHref} />
        </View>
      )}
    </View>
  </View>;
}
const styles=StyleSheet.create({header:{width:'100%',maxWidth:MAP_PAGE_MAX_WIDTH,alignSelf:'center',paddingHorizontal:MAP_PAGE_GUTTER,paddingTop:6,paddingBottom:6,gap:4,backgroundColor:MAP_PAGE_BACKGROUND},
  row:{height:MAP_HEADER_BRAND_HEIGHT,flexDirection:'row',alignItems:'center',position:'relative'},side:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6},
  right:{justifyContent:'flex-end'},baseInline:{flex:1,minWidth:0,maxWidth:'100%'},mobileBase:{width:'100%',minWidth:0},
   navGroup:{flexDirection:'row',alignItems:'center',flexShrink:0},navGroupCentered:{justifyContent:'center'},
   link:{height:44,paddingHorizontal:16,justifyContent:'center',alignItems:'center',borderRadius:22,backgroundColor:'transparent'},
  backButton:{width:44,height:44,justifyContent:'center',alignItems:'center',borderRadius:22,backgroundColor:'transparent',flexShrink:0},
  iconLink:{width:44,paddingHorizontal:0},compactText:{fontSize:12},
   active:{backgroundColor:'transparent'},text:{fontSize:14,fontWeight:'600',color:'#064472'},activeText:{color:'#59ABE3'},
  fullscreenCenter:{position:'absolute',left:0,right:0,top:0,bottom:0,flexDirection:'row',alignItems:'center',justifyContent:'center',zIndex:1},
  gameButton:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#0b1620',borderWidth:1,borderColor:'#e5e7eb',overflow:'hidden'},
  gameIcon:{width:38,height:38,borderRadius:19},
  fullscreenButton:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,0.85)',borderWidth:1,borderColor:'#e5e7eb'},
  fullscreenIcon:{width:24,height:24},
});

import React from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import "../../i18n/city";
import { useAuth } from "../../context/AuthContext";
import PerixLogo from "../brand/PerixLogo";
import { MAP_PAGE_BACKGROUND, MAP_PAGE_GUTTER, MAP_PAGE_MAX_WIDTH, MAP_HEADER_BRAND_HEIGHT, mapHeaderMetrics } from "../../lib/city/mapLayout";

export default function MapScreenHeader({publicScreen=false,hideExplore=false,exploreOnly=false,right,brand,logoVariant}:{publicScreen?:boolean;hideExplore?:boolean;exploreOnly?:boolean;right?:React.ReactNode;brand?:React.ReactNode | ((compact:boolean)=>React.ReactNode);logoVariant?:"watercolor"|"english"}){
  const {t}=useTranslation(),{user,loading:authLoading}=useAuth(),router=useRouter(),pathname=usePathname();
  const metrics=mapHeaderMetrics(useWindowDimensions().width);
  type NavLink={id:'app'|'members'|'explore';label:string;path:string};
  const primary:NavLink[]=exploreOnly
    ? [{id:'explore',label:t('nav.explore','Explore'),path:'/locator'}]
    : [{id:'app',label:'APP',path:'/app'},{id:'members',label:t('nav.members','Members'),path:user?'/home':'/login'}];
  // Members is the former Home destination, not an extra navigation item.
  const secondary=publicScreen || hideExplore || exploreOnly ? [] : [{id:'explore' as const,label:t('nav.explore','Explore'),path:'/locator'}];
  const button=(link:NavLink,fixed=false)=>{
    const active=link.id==='app' ? pathname==='/' || pathname==='/app' : pathname===link.path;
    return <Pressable key={link.id} testID={`map-nav-${link.id}`} accessibilityRole="button" accessibilityState={{selected:active}}
      disabled={link.id==='members' && authLoading} onPress={()=>router.navigate(link.path as never)}
      accessibilityLabel={link.label}
      style={[styles.link,fixed && {width:exploreOnly?metrics.primaryWidth:link.id==='app'?metrics.appWidth:metrics.membersWidth,paddingHorizontal:0},
        !fixed && metrics.compact && styles.iconLink]}>
      {!fixed && metrics.compact ? <Ionicons name="compass-outline" size={20} color={active ? "#59ABE3" : "#064472"} />
        : <Text style={[styles.text,metrics.compact && styles.compactText,active && styles.activeText]} numberOfLines={1}>{link.label}</Text>}
    </Pressable>;
  };
  return <View style={styles.header} testID="map-screen-header">
    <View style={styles.row}>
      <View style={styles.side} testID="map-header-brand-slot">
         <View style={{width:metrics.logoWidth,flexShrink:0}}>{typeof brand==='function'?brand(metrics.compact):brand || <PerixLogo size={metrics.compact?'mobileHeader':'compact'} variant={logoVariant} />}</View>
      </View>
       <View testID="map-screen-navigation" style={{width:metrics.primaryWidth,flexShrink:0}}>
         <View style={[styles.navGroup,{gap:metrics.gap},exploreOnly&&styles.navGroupCentered]} testID="map-primary-navigation">{primary.map(link=>button(link,true))}</View>
      </View>
      <View style={[styles.side,styles.right]} testID="map-header-actions-slot">
        {secondary.map(link=>button(link))}{right}
      </View>
    </View>
  </View>;
}
const styles=StyleSheet.create({header:{width:'100%',maxWidth:MAP_PAGE_MAX_WIDTH,alignSelf:'center',paddingHorizontal:MAP_PAGE_GUTTER,paddingTop:6,paddingBottom:6,gap:4,backgroundColor:MAP_PAGE_BACKGROUND},
  row:{height:MAP_HEADER_BRAND_HEIGHT,flexDirection:'row',alignItems:'center'},side:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6},
  right:{justifyContent:'flex-end'},baseInline:{flex:1,minWidth:0,maxWidth:'100%'},mobileBase:{width:'100%',minWidth:0},
   navGroup:{flexDirection:'row',alignItems:'center',flexShrink:0},navGroupCentered:{justifyContent:'center'},
   link:{height:44,paddingHorizontal:16,justifyContent:'center',alignItems:'center',borderRadius:22,backgroundColor:'transparent'},
  iconLink:{width:44,paddingHorizontal:0},compactText:{fontSize:12},
   active:{backgroundColor:'transparent'},text:{fontSize:14,fontWeight:'600',color:'#064472'},activeText:{color:'#59ABE3'},
});

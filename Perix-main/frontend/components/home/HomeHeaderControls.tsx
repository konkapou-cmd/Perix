import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { Business } from "../../lib/api";
import { IdentityDropdown } from "../profile/IdentityDropdown";
import { MAP_PAGE_GUTTER } from "../../lib/city/mapLayout";

/** The location/name toolbar is bounded independently from the brand/nav row. */
export default function HomeHeaderControls({locationLabel,businesses,onLocationPress,onSelectIdentity,onCreateBusiness,onSettingsPress}:{
  locationLabel:string;businesses:Business[];onLocationPress:()=>void;
  onSelectIdentity:(type:'user'|'business',id:string,name:string,avatar?:string | null)=>void;
  onCreateBusiness:()=>void;onSettingsPress:()=>void;
}){
  const {t}=useTranslation();
  return <View testID="home-header-controls" style={styles.row}>
    <Pressable testID="home-header-location" accessibilityRole="button" accessibilityLabel={locationLabel} style={styles.location} onPress={onLocationPress}>
      <Ionicons name="location-outline" size={17} color="#064472" /><Text style={styles.locationText} numberOfLines={1}>{t("mobility.changeLocation", "Change location")}</Text>
    </Pressable>
    <View style={styles.actions}>
      <View testID="home-header-identity" style={styles.identity}><IdentityDropdown businesses={businesses} onSelectIdentity={onSelectIdentity} onCreateBusiness={onCreateBusiness} /></View>
      <Pressable testID="home-header-settings" accessibilityRole="button" accessibilityLabel={t('common.settings','Settings')} onPress={onSettingsPress} style={styles.settings}>
        <Ionicons name="options-outline" size={22} color="#264348" />
      </Pressable>
    </View>
  </View>;
}
const styles=StyleSheet.create({row:{width:'100%',minWidth:0,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:MAP_PAGE_GUTTER,paddingBottom:6,backgroundColor:'#fff'},
  location:{flex:1,minWidth:0,maxWidth:'45%',flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,minHeight:44},
  locationText:{flex:1,minWidth:0,flexShrink:1,fontSize:12,color:'#264348'},
  actions:{flex:1,minWidth:0,maxWidth:'55%',flexDirection:'row',alignItems:'center',gap:6},identity:{flex:1,minWidth:0,maxWidth:'100%'},
  settings:{width:40,height:40,flexShrink:0,alignItems:'center',justifyContent:'center'},
});

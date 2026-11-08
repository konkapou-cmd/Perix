import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useMapBounds } from "../../context/MapBoundsContext";
import { useLocation } from "../../context/LocationContext";
import { searchPlaces } from "../../lib/api/mobility";
import { DEFAULT_MAP_BASE, MapBase, validMapBase } from "../../lib/city/mapBase";

export default function MapBaseSelector(){
  const {t}=useTranslation(),{t:city}=useTranslation('city');
  const {mapBase,selectMapBase}=useMapBounds();
  const {setManualLocation}=useLocation();
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
  const [retry,setRetry]=useState(0),[results,setResults]=useState<MapBase[]>([]);
  const label=mapBase.label===DEFAULT_MAP_BASE.label ? `Magdeburg, ${city('ui.country')}` : mapBase.label;
  useEffect(()=>{
    if(!open || query.trim().length<3){setResults([]);setLoading(false);return;}
    let active=true;setLoading(true);setFailed(false);setResults([]);
    const timer=setTimeout(()=>{searchPlaces(null,query.trim()).then(response=>{
      if(!active)return;
      const points=[...(response.places || []).map(p=>({latitude:p.lat!,longitude:p.lng!,label:p.address || p.name})),
        ...(response.streets || []).map(p=>({latitude:p.lat!,longitude:p.lng!,label:p.address || p.name})),
        ...(response.stops || []).map(p=>({latitude:p.lat!,longitude:p.lng!,label:p.name}))];
      setResults(points.map(p=>({...p,latitudeDelta:0.09,longitudeDelta:0.09})).filter(validMapBase).slice(0,8));setLoading(false);
    }).catch(()=>{if(active){setLoading(false);setFailed(true);}});},400);
    return()=>{active=false;clearTimeout(timer);};
  },[open,query,retry]);
  const close=()=>{setOpen(false);setQuery('');setResults([]);setFailed(false);};
  return <>
    <Pressable testID="map-base-selector" accessibilityRole="button" accessibilityLabel={`${t('location.chooseMapBase','Choose map area')}: ${label}`}
      onPress={()=>setOpen(true)} style={styles.selector}>
      <Text style={[styles.label,styles.selectorLabel]} numberOfLines={1}>{label}</Text><Ionicons name="chevron-down" size={13} color="#216BA2" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.scrim}><View style={styles.dialog} accessibilityViewIsModal>
        <View style={styles.row}><Text style={styles.title}>{t('location.chooseMapBase','Choose map area')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={city('ui.close')} onPress={close} style={styles.close}><Ionicons name="close" size={22} color="#264348" /></Pressable>
        </View>
        <Text style={styles.note}>{t('location.mapBaseHint','This changes the map area, not your GPS location. Transit is shown only where data is available.')}</Text>
        <TextInput testID="map-base-query" accessibilityLabel={t('location.searchPlaceholder','Search city or location...')}
          placeholder={t('location.searchPlaceholder','Search city or location...')} value={query} onChangeText={setQuery} style={styles.input} />
        {loading && <ActivityIndicator />}
        {failed && <Pressable accessibilityRole="button" onPress={()=>setRetry(value=>value+1)} style={styles.result}><Text>{city('ui.unavailable')} · {city('ui.retry')}</Text></Pressable>}
        {!loading && !failed && query.trim().length>=3 && !results.length && <Text>{t('mobility.noLocationResults','No locations found')}</Text>}
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">{results.map((base,index)=><Pressable key={`${base.latitude}:${base.longitude}:${index}`}
          accessibilityRole="button" style={styles.result} onPress={()=>{selectMapBase(base);setManualLocation(base.latitude,base.longitude,base.label);close();}}>
          <Text style={styles.label}>{base.label}</Text>
        </Pressable>)}</ScrollView>
      </View></View>
    </Modal>
  </>;
}
const styles=StyleSheet.create({selector:{minHeight:44,flexDirection:'row',alignItems:'center',gap:4,flexShrink:1,minWidth:0,maxWidth:'100%'},label:{fontSize:12,color:'#216BA2',flexShrink:1},selectorLabel:{flex:1,minWidth:0},
  scrim:{flex:1,backgroundColor:'rgba(0,0,0,0.35)',justifyContent:'center',alignItems:'center',padding:16},
  dialog:{width:'100%',maxWidth:520,backgroundColor:'#fff',borderRadius:16,padding:16,gap:12},row:{flexDirection:'row',alignItems:'center'},
  title:{fontSize:18,fontWeight:'700',color:'#264348',flex:1},close:{width:44,height:44,alignItems:'center',justifyContent:'center'},
  note:{fontSize:12,lineHeight:18,color:'#59616A'},input:{height:48,borderWidth:1,borderColor:'#ccd6da',borderRadius:10,paddingHorizontal:12,color:'#264348'},
  results:{maxHeight:320},result:{minHeight:44,paddingVertical:12},
});

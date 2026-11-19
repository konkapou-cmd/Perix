import React from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

const ART=require('../../assets/game/perix-airplane-game-icon.webp');
/** One own-art launch action shared by mobile map/home and desktop location UI. */
export default function GameLaunchButton({testID='game-entry'}:{testID?:string}){
  const router=useRouter(),{t}=useTranslation('flight');
  return <Pressable testID={testID} accessibilityRole="button"
    accessibilityLabel={t('launch')} style={styles.button}
    onPress={()=>router.navigate('/game' as never)}>
    <Image testID="game-entry-art" source={ART} resizeMode="contain" accessible={false} style={styles.image}/>
  </Pressable>;
}
const styles=StyleSheet.create({button:{width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#fff',borderWidth:1,borderColor:'#e5e7eb'},image:{width:46,height:44}});

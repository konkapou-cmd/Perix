import React from 'react';
import { Image, View, StyleSheet, Platform, type ImageSourcePropType } from 'react-native';
import { TAB_BUTTON_FACE_SIZE, TAB_BUTTON_ICON_SIZE, TAB_BUTTON_FOCUSED_SCALE } from '../../lib/navigation/tabLayout';

/** Visual face only. The existing navigator owns presses, routes and auth. */
export default function TabArtworkButton({source,focused=false,children}:{
  source?:ImageSourcePropType;focused?:boolean;children?:React.ReactNode;
}){
  return <View testID="tab-artwork-button" style={styles.face}>
    <View testID="tab-artwork-visual" style={[styles.artwork,focused&&styles.selected,
      focused&&(Platform.OS==='web'?styles.webShadow:styles.nativeShadow)]}>
      {source ? <Image source={source} resizeMode="contain" accessible={false}
        style={{width:TAB_BUTTON_ICON_SIZE,height:TAB_BUTTON_ICON_SIZE,opacity:focused?1:.9}} /> : children}
    </View>
    {source && children}
  </View>;
}
const styles=StyleSheet.create({
  face:{width:TAB_BUTTON_FACE_SIZE,height:TAB_BUTTON_FACE_SIZE,alignItems:'center',justifyContent:'center',backgroundColor:'transparent'},
  artwork:{width:TAB_BUTTON_ICON_SIZE,height:TAB_BUTTON_ICON_SIZE,alignItems:'center',justifyContent:'center'},
  selected:{transform:[{scale:TAB_BUTTON_FOCUSED_SCALE}]},
  webShadow:{filter:'drop-shadow(0px 4px 5px rgba(22,60,87,0.3))'} as any,
  nativeShadow:{shadowColor:'#163c57',shadowOpacity:.3,shadowRadius:5,shadowOffset:{width:0,height:3},elevation:4},
});

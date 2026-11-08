import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useMapBounds } from "../../context/MapBoundsContext";
import NearbyTransitSection from "../mobility/NearbyTransitSection";
import type { OriginPoint } from "../../lib/city/nearbyTransit";

export default function MapLocationPopup({ visible, onClose, onOriginSelect }: {
  visible: boolean; onClose: () => void; onOriginSelect?: (point: OriginPoint) => void;
}) {
  const { t } = useTranslation();
  const { selectMapBase } = useMapBounds();
  return <Modal visible={visible} transparent onRequestClose={onClose} animationType="fade">
    <View style={styles.scrim}><View testID="map-location-popup" accessibilityViewIsModal style={styles.dialog}>
      <View style={styles.row}><Text style={styles.title}>{t("mobility.changeLocation", "Change location")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close", "Close")} onPress={onClose} style={styles.close}>
          <Ionicons name="close" size={22} color="#216BA2" />
        </Pressable>
      </View>
      {visible && <NearbyTransitSection originEditorOnly stops={[]} stopsLoaded onOriginSelect={point=>{
        selectMapBase({...point,label:point.name || `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`,latitudeDelta:0.09,longitudeDelta:0.09});
        onOriginSelect?.(point);onClose();
      }} />}
    </View></View>
  </Modal>;
}
const styles=StyleSheet.create({scrim:{flex:1,backgroundColor:"rgba(0,0,0,0.3)",justifyContent:"center",alignItems:"center",padding:16},
  dialog:{width:"100%",maxWidth:520,backgroundColor:"#fff",borderRadius:16,padding:16},row:{flexDirection:"row",alignItems:"center"},
  title:{flex:1,minWidth:0,color:"#064472",fontSize:18,fontWeight:"700"},close:{width:44,height:44,justifyContent:"center",alignItems:"center"}});

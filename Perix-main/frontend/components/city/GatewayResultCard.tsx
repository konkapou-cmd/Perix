import React from "react";
import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { locatorCardStyles as styles } from "../locator/LocatorCard";
import type { DirectoryEntity } from "../../lib/city/gateway";
import { gatewayEntityColor } from "../../lib/city/presentation";
import { getPublicServiceImages } from "../../lib/city/publicServiceImages";
import { useTranslation } from "react-i18next";

export default function GatewayResultCard({ entity, onPress }: { entity: DirectoryEntity; onPress: () => void }) {
  const color=gatewayEntityColor(entity);
  const { i18n } = useTranslation("city");
  const language=(i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const localServiceImages=entity.publicService ? getPublicServiceImages(entity.publicService.source_record_id,
    entity.publicService.profile_image_asset,entity.publicService.cover_image_asset) : null;
  const profileImage=entity.publicService?.profile_image_url
    ? {uri:entity.publicService.profile_image_url} : localServiceImages?.profile;
  const imageSource=entity.publicService ? profileImage : entity.cover_image ? {uri:entity.cover_image} : profileImage;
  const illustrationLabel=language==="el"?"Εικαστικό":language==="de"?"Illustration":"Illustration";
  return <Pressable testID="gateway-result-card" accessibilityRole="button" onPress={onPress} style={[styles.card,styles.flatCard]}>
    <View style={styles.cardRow}>
      <View style={[styles.photoWrap,{backgroundColor:"#fff",overflow:"hidden"},entity.publicService && {width:104,height:104}]}>
        {imageSource ? <Image source={imageSource} style={[styles.photo, entity.publicService && {width:"100%",height:"100%"}]} contentFit="cover"
          accessibilityLabel={entity.publicService?.visual_is_illustration ? `${entity.title} — ${illustrationLabel}` : entity.title} />
          : <Ionicons name={entity.type === "event" ? "calendar-outline" : entity.type === "activity" ? "walk-outline" : "location-outline"} size={32} color={color} />}
        {entity.publicService?.visual_is_illustration && <Text style={{position:"absolute",left:2,bottom:2,overflow:"hidden",paddingHorizontal:3,
          borderRadius:3,backgroundColor:"rgba(0,0,0,0.7)",color:"#fff",fontSize:8,lineHeight:12}}>{illustrationLabel}</Text>}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle,entity.type==="public_service"&&{color:"#59ABE3"}]} numberOfLines={2}>{entity.title}</Text>
        {!!entity.address && <Text style={styles.cardMetaText} numberOfLines={2}>{entity.address}</Text>}
        {!!entity.description && <Text style={styles.cardSubtitle} numberOfLines={3}>{entity.description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#216BA2" />
    </View>
  </Pressable>;
}

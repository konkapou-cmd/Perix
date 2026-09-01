import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import BusinessMap from "../BusinessMap";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { openInMaps } from "../../lib/utils/openMapUrl";

type ContentMapProps = {
  latitude: number;
  longitude: number;
  title?: string;
  address?: string;
  interactive?: boolean;
  flush?: boolean;
};

export default function ContentMap({ latitude, longitude, title, address, interactive = true, flush = false }: ContentMapProps) {
  const { t } = useTranslation();
  const openMap = () => {
    openInMaps({ latitude, longitude, address, label: title });
  };

  return (
    <View style={[styles.container, flush && styles.containerFlush]}>
      <BusinessMap
        location={{ latitude, longitude }}
        markers={[{
          id: "location",
          latitude,
          longitude,
          title: title || "",
          description: address || "",
        }]}
        height={200}
        staticMode={!interactive}
        onMarkerPress={interactive ? openMap : undefined}
      />
      <Pressable style={styles.overlay} onPress={openMap}>
        <Ionicons name="navigate" size={20} color="#fff" />
        <Text style={styles.overlayText}>{t("common.openInMaps", "In Maps öffnen")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    marginTop: SPACING.compact,
    marginHorizontal: SPACING.page,
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
  },
  containerFlush: {
    marginHorizontal: 0,
    borderRadius: 0,
  },
  overlay: {
    position: "absolute",
    bottom: 18,
    alignSelf: "center",
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(38,67,72,0.92)",
    paddingHorizontal: 18,
    borderRadius: 22,
  },
  overlayText: {
    color: "#fff",
    fontSize: FONT_SIZES.small,
    fontWeight: "600",
  },
});

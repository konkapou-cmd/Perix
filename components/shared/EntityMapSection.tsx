import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import LocationCard from "./LocationCard";
import ContentMap from "./ContentMap";
import { openInMaps } from "../../lib/utils/openMapUrl";

type EntityMapSectionProps = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  title?: string;
  accentColor?: string;
  interactive?: boolean;
};

export default function EntityMapSection({
  address,
  latitude,
  longitude,
  title,
  accentColor = COLORS.primary,
  interactive = true,
}: EntityMapSectionProps) {
  const hasAddress = !!address;
  const hasCoords = latitude != null && longitude != null;

  if (!hasAddress && !hasCoords) return null;

  return (
    <View style={styles.container}>
      {hasAddress && (
        <LocationCard
          label="Adresse"
          address={address}
          accentColor={accentColor}
          onPress={() => openInMaps({ latitude, longitude, address })}
        />
      )}
      {hasCoords && (
        <ContentMap
          latitude={latitude!}
          longitude={longitude!}
          title={title}
          address={address ?? undefined}
          interactive={interactive}
        />
      )}
      {!hasCoords && hasAddress && (
        <View style={styles.noMap}>
          <Ionicons name="location-outline" size={20} color={COLORS.textMuted} />
          <Text style={styles.noMapText}>Kein Kartenstandort verfügbar</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: SPACING.compact,
  },
  noMap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: SPACING.page,
    paddingVertical: SPACING.compact,
  },
  noMapText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
  },
});

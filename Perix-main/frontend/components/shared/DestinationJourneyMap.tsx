import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import BusinessMap from "../BusinessMap";
import { useDestinationJourney } from "../../hooks/useDestinationJourney";
import { journeyPlanLines, journeyViewport } from "../../lib/journeyPresentation";
import { openInMaps } from "../../lib/utils/openMapUrl";
import { COLORS } from "../../lib/designTokens";

type Props = { latitude: number; longitude: number; title?: string; address?: string; interactive?: boolean };

/** Inline business directions from the same passenger planner as Locator. */
export default function DestinationJourneyMap({ latitude, longitude, title, address, interactive = true }: Props) {
  const { t } = useTranslation();
  const journey = useDestinationJourney(latitude, longitude);
  const lines = useMemo(() => journeyPlanLines(journey.plan), [journey.plan]);
  const region = useMemo(() => journeyViewport([
    { latitude, longitude }, ...(journey.origin ? [journey.origin] : []), ...lines.flatMap(l => l.points),
  ])!, [latitude, longitude, journey.origin, lines]);
  const [focusToken, setFocusToken] = useState(1);
  useEffect(() => { setFocusToken(n => n + 1); }, [region]);
  const marker = useMemo(() => [{ id: "location", latitude, longitude, title: title || "", description: address || "" }],
    [latitude, longitude, title, address]);
  return <View>
    <BusinessMap initialRegion={region} focusRegion={region} focusToken={focusToken}
      markers={marker} planLines={lines} height={250} staticMode={!interactive}
      pinLocation={journey.origin} showUserLocation={!!journey.origin} />
    <View style={styles.instructions}>
      <Text style={styles.heading}>{t("mobility.directionsTo", "How to get to {{name}}", { name: title || t("common.destination", "your destination") })}</Text>
      {journey.origin ? <Text style={styles.note}>{journey.originSource === "manual"
        ? `${t("location.selectedOrigin", "From selected location")}: ${journey.originName || ""}`
        : t("location.liveOrigin", "From live location")}</Text> : null}
      {journey.loading || journey.locating ? <ActivityIndicator color={COLORS.primary} /> : null}
      {!journey.origin ? <Text>{journey.failed
        ? t("mobility.locationUnavailable", "Your current location is unavailable. Enable location and try again.")
        : t("location.chooseOrigin", "Choose an address or use live location to plan your journey.")}</Text>
        : journey.failed ? <Text>{t("mobility.planError", "Could not plan a journey right now.")}</Text>
        : journey.resolved && !journey.plan ? <Text>{t("mobility.noConnection", "No transit connection was found for this journey.")}</Text> : null}
      {journey.plan ? <>
        <Text>{journey.plan.departure} → {journey.plan.arrival} · {journey.plan.duration_minutes}′</Text>
        {journey.plan.legs.map((leg, index) => <Text key={index} style={styles.step}>
          {leg.type === "ride"
            ? `${leg.route_number || ""} → ${leg.direction || ""}\n${leg.board || ""} (${leg.depart || "—"}) → ${leg.alight || ""} (${leg.arrive || "—"})`
            : t("mobility.walkStep", "Walk {{n}}′ to {{name}}", {
              n: leg.minutes, name: leg.label || (index === journey.plan!.legs.length - 1 ? title || t("common.destination", "your destination") : t("mobility.boardingStop", "the boarding stop")),
            })}
        </Text>)}
        <Text style={styles.note}>{t("mobility.estimatedJourney", "Estimated journey · transit times may change")}</Text>
      </> : null}
      <Pressable onPress={journey.refresh} disabled={journey.locating || journey.loading} style={styles.action}>
        <Text style={styles.actionText}>{journey.originSource === "manual" ? t("mobility.refreshSelectedDirections", "Refresh directions")
          : journey.origin ? t("mobility.refreshDirections", "Refresh from my current location") : t("locator.enableLocation", "Use my location")}</Text>
      </Pressable>
      <Pressable onPress={() => openInMaps({ latitude, longitude, address, label: title })} style={styles.action}>
        <Text style={styles.actionText}>{t("common.openInMaps", "Open in Maps")}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  instructions: { padding: 14, gap: 8, backgroundColor: COLORS.background },
  heading: { fontWeight: "700", color: COLORS.primary }, step: { marginTop: 4 },
  note: { fontSize: 12, color: COLORS.textMuted },
  action: { paddingVertical: 10 }, actionText: { color: COLORS.primary, fontWeight: "600" },
});

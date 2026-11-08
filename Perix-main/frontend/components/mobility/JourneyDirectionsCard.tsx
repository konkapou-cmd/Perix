import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { GatewayJourneyState } from "../../hooks/city/useGatewayJourney";

export default function JourneyDirectionsCard({ journey, onLocate, locating, onRetry }: {
  journey: GatewayJourneyState; onLocate: () => void; locating: boolean; onRetry: () => void;
}) {
  const { t } = useTranslation();
  const { t: city } = useTranslation("city");
  const plan = journey.plan;
  return <View testID="city-journey-directions" style={styles.card} accessibilityLiveRegion="polite">
    <Text style={styles.title}>{t("mobility.planDirectionsTitle", "Step-by-step directions")}</Text>
    {journey.status === "location" && <>
      <Text>{t("mobility.planNoLocation", "Enable location to plan a journey from where you are.")}</Text>
      <Pressable accessibilityRole="button" disabled={locating} onPress={onLocate} style={styles.button}>
        <Text style={styles.link}>{t(locating ? "home.locating" : "home.useMyLocation")}</Text>
      </Pressable>
    </>}
    {journey.status === "loading" && <View style={styles.row}><ActivityIndicator /><Text>{t("mobility.planning", "Finding the best connection…")}</Text></View>}
    {journey.status === "error" && <Text>{t("mobility.planError", "Could not plan a journey right now.")}</Text>}
    {journey.status === "empty" && !journey.note && <Text>{t("mobility.planNoRoute", "No connection found for this destination.")}</Text>}
    {!!journey.note && <Text>{journey.note}</Text>}
    {journey.status === "ready" && plan && <>
      <Text>{journey.origin?.kind === "manual" ? `${t("mobility.manualLocation","Entered location")}${journey.origin.name ? ` · ${journey.origin.name}` : ""}`
        : t("mobility.planOrigin", "From your current location")}</Text>
      <Text style={styles.title}>{plan.departure} → {plan.arrival}</Text>
      <Text>{t("mobility.planTotal", "{{n}} min", { n: plan.duration_minutes })} · {t("mobility.planWalking", "{{n}} min walking", { n: plan.walking_minutes })}</Text>
      {plan.legs.map((leg, index) => {
        const label = leg.type === "ride"
          ? t("mobility.planStepRide", "{{line}} → {{direction}}: board at {{depart}} ({{board}}), alight at {{arrive}} ({{alight}})", {
            line: leg.route_number, direction: leg.direction, depart: leg.depart, board: leg.board, arrive: leg.arrive, alight: leg.alight,
          }) : leg.type === "walk_transfer"
            ? t("mobility.planStepTransfer", "Transfer: walk {{n}}′ to {{label}}", { n: leg.minutes, label: leg.label })
            : leg.label === "destination"
              ? t("mobility.planStepDest", "Walk {{n}}′ to your destination (arrival {{time}})", { n: leg.minutes, time: plan.arrival })
              : t("mobility.planStepWalk", "Walk {{n}}′ to {{label}}", { n: leg.minutes, label: leg.label });
        return <View key={index} style={styles.row}><Text style={styles.number}>{index + 1}.</Text><Text style={styles.step}>{label}</Text></View>;
      })}
    </>}
    {["ready", "empty", "error"].includes(journey.status) && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
      <Text style={styles.link}>{city(journey.status === "ready" ? "ui.refresh" : "ui.retry")}</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 10 }, title: { color: "#264348", fontWeight: "600", fontSize: 15 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, step: { flex: 1, lineHeight: 22, color: "#264348" },
  number: { color: "#264348", fontWeight: "700" }, button: { minHeight: 44, justifyContent: "center" }, link: { color: "#216BA2" },
});

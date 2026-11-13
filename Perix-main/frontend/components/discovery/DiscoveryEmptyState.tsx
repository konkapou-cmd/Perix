import { View, Text, StyleSheet, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES } from "../../lib/designTokens";
import { EMPTY_STATE_ILLUSTRATIONS } from "../../lib/illustrationSources.generated";

type Props = {
  type: "no-results" | "no-location";
};

export default function DiscoveryEmptyState({ type }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Image
        source={type === "no-location" ? EMPTY_STATE_ILLUSTRATIONS.no_content : EMPTY_STATE_ILLUSTRATIONS.no_businesses_found}
        style={{ width: 96, height: 96 }}
        resizeMode="contain"
      />
      <Text style={styles.title}>
        {type === "no-location"
          ? t("marketplace.noLocation", "Standort nicht verfügbar")
          : t("marketplace.noResults", "Keine Ergebnisse gefunden")}
      </Text>
      <Text style={styles.subtitle}>
        {type === "no-location"
          ? t("marketplace.noLocationHint", "Aktiviere deinen Standort oder suche manuell.")
          : t("marketplace.noResultsHint", "Passe deine Filter oder die Kartenansicht an.")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.section,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: "600",
    color: "#264348",
    marginTop: SPACING.small,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.bodySmall,
    color: "#264348",
    marginTop: 4,
    textAlign: "center",
  },
});

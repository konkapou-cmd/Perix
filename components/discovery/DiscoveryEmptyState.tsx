import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES } from "../../lib/designTokens";

type Props = {
  type: "no-results" | "no-location";
};

export default function DiscoveryEmptyState({ type }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Ionicons
        name={type === "no-location" ? "navigate-outline" : "search-outline"}
        size={48}
        color={COLORS.textMuted}
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
    color: COLORS.textPrimary,
    marginTop: SPACING.small,
    textAlign: "center",
  },
  subtitle: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: "center",
  },
});

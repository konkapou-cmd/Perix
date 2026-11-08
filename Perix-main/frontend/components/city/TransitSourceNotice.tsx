import { Linking, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BACKEND_URL } from "../../lib/api/core";

const labels: Record<string, string> = {
  en: "Transit estimates, not GPS · Sources & licences",
  de: "ÖPNV-Schätzungen, kein GPS · Quellen & Lizenzen",
  el: "Εκτιμήσεις μετακινήσεων, όχι GPS · Πηγές & άδειες",
  es: "Estimaciones, no GPS · Fuentes y licencias",
  fr: "Estimations, pas de GPS · Sources et licences",
  it: "Stime, non GPS · Fonti e licenze",
  sq: "Vlerësime, jo GPS · Burimet dhe licencat",
  pl: "Szacunki, nie GPS · Źródła i licencje",
  sr: "Процене, не GPS · Извори и лиценце",
  ru: "Оценки, не GPS · Источники и лицензии",
};

export default function TransitSourceNotice({ osm = false }: { osm?: boolean }) {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  return <View style={styles.row} testID="transit-source-notice">
    <Text accessibilityRole="link" style={styles.link}
      onPress={() => { void Linking.openURL(`${BACKEND_URL}/api/mobility/v2/data-sources`).catch(() => {}); }}>
      {labels[language] || labels.en}
    </Text>
    {osm && <Text accessibilityRole="link" style={styles.link}
      onPress={() => { void Linking.openURL("https://www.openstreetmap.org/copyright").catch(() => {}); }}>
      © OpenStreetMap contributors · ODbL
    </Text>}
  </View>;
}
const styles = StyleSheet.create({
  row: { marginHorizontal: 16, marginVertical: 4, gap: 2 },
  link: { fontSize: 12, lineHeight: 18, color: "#434B54", textDecorationLine: "underline" },
});

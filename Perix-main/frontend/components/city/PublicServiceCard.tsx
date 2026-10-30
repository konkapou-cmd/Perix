import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BORDER_RADIUS, COLORS, FONT_SIZES, SPACING } from "../../lib/designTokens";
import { PublicService, PUBLIC_SERVICE_THEME as theme } from "../../lib/city/publicServices";
import { useTranslation } from "react-i18next";
import "../../i18n/city";

function WebLink({ label, url }: { label: string; url: string | null }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => { void Linking.openURL(url).catch(() => {}); }} style={styles.link}><Text style={{ color: theme.blue }}>{label}</Text></Pressable>;
}

export function PublicServiceCard({ service, full = false, onPress }: { service: PublicService; full?: boolean; onPress?: () => void }) {
  const { t, i18n } = useTranslation("city");
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const description = language === "el" ? service.description_el || service.description_en || service.description_de : language === "de" ? service.description_de || service.description_en || service.description_el : service.description_en || service.description_de || service.description_el;
  const icon = service.cover_icon === "leaf-outline" ? "leaf-outline" : "medkit-outline";
  const content = <>
    <View style={styles.cover}><Ionicons name={icon} size={full ? 44 : 26} color={theme.navy} /><Text style={styles.kind}>{t("source.0")}</Text></View>
    <Text style={styles.title}>{service.name}</Text>
    {service.address && <Text>{service.address}</Text>}
    {service.latitude == null && <Text style={styles.note}>{t("ui.noCoordinates")}</Text>}
    {full && <>
      {description && <Text style={styles.bio}>{description}</Text>}
      {service.phone && <Pressable accessibilityRole="link" accessibilityLabel={`${t("ui.call")} ${service.phone}`} style={styles.link} onPress={() => {
        const number = service.phone!.replace(/[^+\d]/g, "");
        if (number) void Linking.openURL(`tel:${number}`).catch(() => {});
      }}><Text style={{ color: theme.blue }}>{t("ui.call")}: {service.phone}</Text></Pressable>}
      <WebLink label={t("ui.website")} url={service.website} />
      <Text style={styles.bio}>{t("source.1")}: {service.opening_hours || t("source.2")}</Text>
      <View style={styles.provenance}>
        <Text style={styles.title}>{t("source.3")}</Text>
        <Text style={styles.note}>{t("source.4")}</Text>
        {(service.sources.length ? service.sources : [service]).map((source, i) => <View key={`${source.source_dataset_url}:${i}`} style={styles.source}>
          <Text>{t("source.5")}: {source.source_provider}</Text>
          <WebLink label={source.source_provider} url={source.source_provider_url} />
          <Text>{t("source.6")}: {source.source_reference_period || t("source.2")}</Text>
          <Text>{t("source.7")}: {source.source_published_at || t("source.2")}</Text>
          <Text>{t("source.8")}: {source.source_last_updated_at || t("source.2")}</Text>
          <Text>{t("source.9")}: {source.data_collected_at}</Text>
          <WebLink label={t("source.10")} url={source.source_record_url || source.source_dataset_url} />
          <WebLink label={t("source.11")} url={source.source_credits_url} />
          <WebLink label={`${t("source.12")}: ${source.source_license_id}`} url={source.source_license_url} />
          <Text style={styles.note}>{source.attribution}</Text>
          <Text style={styles.note}>{source.modifications}</Text>
          {source.source_locator && <Text style={styles.note}>{source.source_locator}</Text>}
        </View>)}
      </View>
    </>}
  </>;
  return onPress && !full ? <Pressable accessibilityRole="button" accessibilityLabel={`${t("source.13")} ${service.name}`} onPress={onPress} style={styles.card}>{content}</Pressable> : <View style={styles.card}>{content}</View>;
}

const styles = StyleSheet.create({
  card: { padding: SPACING.std, borderRadius: BORDER_RADIUS.card, borderWidth: 1.5, borderColor: COLORS.pinHotel, backgroundColor: "#fff", gap: SPACING.small, marginBottom: SPACING.small },
  cover: { padding: SPACING.std, borderRadius: BORDER_RADIUS.button, backgroundColor: theme.ivory, gap: SPACING.small },
  kind: { fontSize: FONT_SIZES.micro, color: theme.navy }, title: { fontSize: FONT_SIZES.h4, fontWeight: "700", color: theme.navy },
  bio: { lineHeight: 24, marginTop: SPACING.small }, note: { color: "#59616A", fontSize: FONT_SIZES.bodySmall, lineHeight: 21 },
  provenance: { marginTop: SPACING.large, borderTopWidth: 1, borderTopColor: "#E7EAF0", paddingTop: SPACING.std, gap: SPACING.small },
  source: { gap: SPACING.small, marginBottom: SPACING.std }, link: { minHeight: 44, justifyContent: "center" },
});

import React, { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import GoogleDirectionsFrame from "./GoogleDirectionsFrame";
import { MAP_ACTION_COLORS } from "../../lib/city/mapLayout";
import { DirectionsDestination, DirectionsOrigin, GoogleTravelMode, googleDirectionsEmbedUrl,
  googleDirectionsOpenUrl, validDirectionsPoint } from "../../lib/city/googleDirections";

const modeIcons = { walking: "walk-outline", transit: "bus-outline", driving: "car-outline" } as const;

export default function GoogleDirectionsPreview({ destination, origin, onLocate, locating, initiallyOpen = false, onClose }: {
  destination: DirectionsDestination; origin: DirectionsOrigin | null; onLocate: () => void; locating: boolean; initiallyOpen?: boolean;
  onClose?:()=>void;
}) {
  const { t, i18n } = useTranslation("city");
  const { t: common } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  const [mode, setMode] = useState<GoogleTravelMode>("walking");
  // Snapshot only on explicit open/refresh (or the first fix after a locate).
  // A stream of live fixes must not reload an iframe: this is NOT live navigation.
  const [previewOrigin, setPreviewOrigin] = useState<DirectionsOrigin | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const extra = Constants.expoConfig?.extra;
  const key = extra?.EXPO_PUBLIC_GEO_KEY || extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    || process.env.EXPO_PUBLIC_GEO_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  useEffect(() => {
    if (open && !previewOrigin && validDirectionsPoint(origin)) setPreviewOrigin({ ...origin });
  }, [open, previewOrigin, origin]);
  const src = useMemo(() => googleDirectionsEmbedUrl(key, previewOrigin, destination, mode, language),
    [key, previewOrigin, destination.latitude, destination.longitude, mode, language]);
  const externalUrl = googleDirectionsOpenUrl(open ? previewOrigin : origin, destination, mode);
  const refresh = () => {
    setPreviewOrigin(validDirectionsPoint(origin) ? { ...origin } : null);
    setFailed(false); setRevision(value => value + 1);
  };
  if (!validDirectionsPoint(destination)) return null;
  return <View testID="google-directions-preview" style={styles.card}>
    <Pressable testID="google-directions-toggle" accessibilityRole="button" accessibilityState={{ expanded: open }}
      onPress={() => { if (!open) refresh(); else onClose?.(); setOpen(value => !value); }}
      style={[styles.action, styles.pill, !open && styles.selectedMode]}>
      <Ionicons name={open ? "close-outline" : "navigate-outline"} size={20}
        color={open ? MAP_ACTION_COLORS.text : MAP_ACTION_COLORS.activeText} />
      <Text style={[styles.actionText, !open && styles.selectedText]}>{t(open ? "googleDirections.close" : "googleDirections.go")}</Text>
    </Pressable>
    {open && <>
      <Text style={styles.title} numberOfLines={2}>{destination.title}</Text>
      {!!destination.sub && <Text style={styles.note} numberOfLines={2}>{destination.sub}</Text>}
      <View style={styles.modes}>
        {(Object.keys(modeIcons) as GoogleTravelMode[]).map(value => <Pressable key={value}
          testID={`google-directions-mode-${value}`} accessibilityRole="button" accessibilityState={{ selected: mode === value }}
          onPress={() => { setMode(value); setFailed(false); }} style={[styles.mode, mode === value && styles.selectedMode]}>
          <Ionicons name={modeIcons[value]} size={18} color={mode === value ? MAP_ACTION_COLORS.activeText : MAP_ACTION_COLORS.text} />
          <Text style={[styles.modeText, mode === value && styles.selectedText]}>{t(`googleDirections.${value}`)}</Text>
        </Pressable>)}
      </View>
      <Text style={styles.note}>{t("googleDirections.note")}</Text>
      {!previewOrigin ? <View style={styles.actions}>
        <Text style={styles.note}>{t("googleDirections.noOrigin")}</Text>
        <Pressable testID="google-directions-locate" accessibilityRole="button" disabled={locating} onPress={onLocate} style={[styles.action, styles.pill]}>
          <Text style={styles.actionText}>{common(locating ? "home.locating" : "home.useMyLocation")}</Text>
        </Pressable>
      </View> : <View style={styles.actions}>
        <Text style={styles.note}>{previewOrigin.kind === "manual"
          ? `${common("mobility.manualLocation", "Entered location")}${previewOrigin.name ? ` · ${previewOrigin.name}` : ""}`
          : common("mobility.planOrigin", "From your current location")}</Text>
        <Pressable testID="google-directions-refresh" accessibilityRole="button" onPress={refresh} style={[styles.action, styles.pill]}>
          <Text style={styles.actionText}>{t("googleDirections.refresh")}</Text>
        </Pressable>
      </View>}
      {Platform.OS === "web" && previewOrigin && (!key
        ? <Text accessibilityLiveRegion="polite" style={styles.note}>{t("googleDirections.missingKey")}</Text>
        : src && !failed && <View style={styles.frame}>
          <GoogleDirectionsFrame key={`${src}:${revision}`} src={src} title={`${t("googleDirections.preview")} · ${destination.title}`}
            onError={() => setFailed(true)} />
        </View>)}
      {failed && <Text accessibilityLiveRegion="polite" style={styles.note}>{t("googleDirections.failed")}</Text>}
      {externalUrl && <Pressable testID="google-directions-external" accessibilityRole="link" style={styles.external}
        onPress={() => { void Linking.openURL(externalUrl).catch(() => setFailed(true)); }}>
        <Text style={styles.externalText}>{t("googleDirections.open")}</Text>
        <Ionicons name="open-outline" size={18} color={MAP_ACTION_COLORS.activeText} />
      </Pressable>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { minWidth: 0, gap: 8, backgroundColor: "#fff" },
  title: { minWidth: 0, color: "#064472", fontSize: 16, fontWeight: "700" },
  note: { minWidth: 0, color: "#59616A", fontSize: 12, lineHeight: 18 },
  action: { minHeight: 44, flexDirection: "row", gap: 8, alignItems: "center" },
  actionText: { flexShrink: 1, minWidth: 0, color: MAP_ACTION_COLORS.text, fontSize: 14, fontWeight: "600" },
  pill: { alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 16, borderRadius: 22, backgroundColor: MAP_ACTION_COLORS.background },
  actions: { gap: 4 }, modes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  mode: { minHeight: 44, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 22, backgroundColor: MAP_ACTION_COLORS.background },
  selectedMode: { backgroundColor: MAP_ACTION_COLORS.activeBackground }, modeText: { color: MAP_ACTION_COLORS.text, fontSize: 13, fontWeight: "600" },
  selectedText: { color: MAP_ACTION_COLORS.activeText }, frame: { height: 300, minWidth: 200, overflow: "hidden", borderRadius: 8 },
  external: { alignSelf: "flex-start", maxWidth: "100%", minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22, backgroundColor: MAP_ACTION_COLORS.activeBackground,
    flexDirection: "row", alignItems: "center", gap: 8 },
  externalText: { flexShrink: 1, minWidth: 0, color: MAP_ACTION_COLORS.activeText, fontWeight: "600", fontSize: 14 },
});

import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../lib/api/core";
import { COLORS, BORDER_RADIUS, FONT_SIZES, SPACING } from "../../lib/designTokens";

type Place = { place_id: string | number; description: string; lat: number | null; lng?: number | null; lon?: number | null };
type Props = {
  sessionToken?: string | null;
  nearLat?: number | null;
  nearLng?: number | null;
  onSelectPlace: (latitude: number, longitude: number, name: string) => void;
  onUseLive?: () => Promise<boolean | void>;
  onClose?: () => void;
  autoFocus?: boolean;
};

export function AreaSelectionForm({ sessionToken, nearLat, nearLng, onSelectPlace, onUseLive, onClose, autoFocus = false }: Props) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<"idle" | "empty" | "failed" | "gps-failed">("idle");
  const sequence = useRef(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current++; }; }, []);
  useEffect(() => {
    const request = ++sequence.current;
    const text = query.trim();
    setPlaces([]);
    setStatus("idle");
    if (text.length < 3) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        let path = `/places/autocomplete?input=${encodeURIComponent(text)}&lang=${encodeURIComponent(i18n.language || "en")}`;
        if (nearLat != null && nearLng != null) path += `&near_lat=${nearLat}&near_lng=${nearLng}`;
        const response = await apiRequest<{ predictions: Place[] }>(path, "GET", sessionToken || undefined);
        if (!mounted.current || request !== sequence.current) return;
        const valid = (response.predictions || []).filter(place => {
          const lng = place.lng ?? place.lon;
          return typeof place.lat === "number" && typeof lng === "number"
            && Number.isFinite(place.lat) && Number.isFinite(lng) && Math.abs(place.lat) <= 90 && Math.abs(lng) <= 180;
        });
        setPlaces(valid);
        setStatus(valid.length ? "idle" : "empty");
      } catch {
        if (mounted.current && request === sequence.current) setStatus("failed");
      } finally {
        if (mounted.current && request === sequence.current) setLoading(false);
      }
    }, 450);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, nearLat, nearLng, sessionToken, i18n.language]);

  const locate = async () => {
    if (!onUseLive || locating) return;
    setLocating(true);
    try {
      const success = await onUseLive();
      if (mounted.current && success === false) setStatus("gps-failed");
    } catch { if (mounted.current) setStatus("gps-failed"); }
    finally { if (mounted.current) setLocating(false); }
  };
  return <View style={styles.card}>
    <View style={styles.heading}>
      <Ionicons name="location-outline" size={22} color={COLORS.primary} />
      <Text style={styles.title}>{t("home.setLocationTitle", "Set your area")}</Text>
      {onClose ? <Pressable accessibilityLabel={t("common.close", "Close")} onPress={onClose} style={styles.close}>
        <Ionicons name="close" size={22} color={COLORS.textSecondary} />
      </Pressable> : null}
    </View>
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={COLORS.primary} />
      <TextInput value={query} onChangeText={setQuery} style={styles.input} autoFocus={autoFocus}
        maxLength={200} autoCorrect={false} accessibilityLabel={t("location.enterAddress", "Enter an address or place")}
        placeholder={t("location.enterAddress", "Enter an address or place")}
        placeholderTextColor={COLORS.textPlaceholder} />
      {query ? <Pressable accessibilityLabel={t("common.clear", "Clear")} onPress={() => setQuery("")} style={styles.close}>
        <Ionicons name="close-circle" size={19} color={COLORS.textMuted} />
      </Pressable> : null}
    </View>
    {loading ? <ActivityIndicator color={COLORS.primary} style={styles.loading} /> : null}
    {places.length ? <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.results}>
      {places.map(place => <Pressable key={place.place_id} style={styles.result}
        onPress={() => { sequence.current++; onSelectPlace(place.lat!, (place.lng ?? place.lon)! , place.description); }}>
        <Ionicons name="location" size={18} color={COLORS.eventsAccent} />
        <Text style={styles.resultText}>{place.description}</Text>
      </Pressable>)}
    </ScrollView> : null}
    {status !== "idle" ? <Text style={styles.message} accessibilityLiveRegion="polite">
      {status === "empty" ? t("location.noPlaces", "No places found. Try an address, city or postcode.")
        : status === "gps-failed" ? t("location.liveUnavailable", "Location is unavailable. Choose an address or try again.")
          : t("location.searchFailed", "Search is unavailable right now. Please try again.")}
    </Text> : null}
    {onUseLive ? <Pressable onPress={locate} disabled={locating} style={styles.liveButton}>
      {locating ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="locate" size={19} color={COLORS.primary} />}
      <Text style={styles.liveText}>{t("home.useMyLocation", "Use my location")}</Text>
    </Pressable> : null}
  </View>;
}

export function AreaSelectionModal({ visible, ...props }: Props & { visible: boolean; onClose: () => void }) {
  return visible ? <Modal visible transparent animationType="fade" onRequestClose={props.onClose}>
    <View style={styles.backdrop}><View style={styles.modalCard}><AreaSelectionForm {...props} autoFocus /></View></View>
  </Modal> : null;
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.card, padding: SPACING.page, gap: SPACING.compact, width: "100%" },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: FONT_SIZES.body, fontWeight: "700", color: COLORS.textPrimary, flex: 1 },
  close: { padding: 8 },
  search: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 8, paddingHorizontal: 12,
    borderRadius: BORDER_RADIUS.button, borderColor: COLORS.borderLight, borderWidth: 1 },
  input: { flex: 1, minWidth: 0, height: 44, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  loading: { padding: 8 }, results: { maxHeight: 260 },
  result: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.border },
  resultText: { flex: 1, fontSize: FONT_SIZES.bodySmall, color: COLORS.textPrimary },
  message: { color: COLORS.textSecondary, fontSize: FONT_SIZES.small },
  liveButton: { minHeight: 44, backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.button,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  liveText: { color: COLORS.primary, fontWeight: "600", fontSize: FONT_SIZES.bodySmall },
  backdrop: { flex: 1, backgroundColor: "rgba(7,10,46,0.35)", padding: SPACING.page, paddingTop: 60, alignItems: "center" },
  modalCard: { width: "100%", maxWidth: 560 },
});

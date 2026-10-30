import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useOptionalLocation } from "../../context/LocationContext";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";
import { AreaSelectionModal } from "./AreaSelection";

export default function MapLocationControl() {
  const context = useOptionalLocation();
  const { sessionToken } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const attemptRef = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attemptRef.current++; }; }, []);
  if (!context) return null;
  const locate = async () => {
    if (locating) return false;
    const attempt = ++attemptRef.current;
    setLocating(true); setFailed(false);
    try {
      const position = await context.useLiveLocation();
      if (!mounted.current || attempt !== attemptRef.current) return false;
      if (position) { setOpen(false); return true; }
      setFailed(true); setOpen(true); return false;
    } catch { if (mounted.current && attempt === attemptRef.current) { setFailed(true); setOpen(true); } return false; }
    finally { if (mounted.current && attempt === attemptRef.current) setLocating(false); }
  };
  const label = context.locationMode === "live" ? t("location.live", "Live location")
    : context.locationMode === "manual" ? context.mapPosition?.name || t("location.selectedArea", "Selected area")
      : t("home.setLocationTitle", "Set your area");
  return <View style={styles.controls}>
    <Pressable onPress={() => setOpen(true)} style={styles.area}
      accessibilityLabel={t("location.change", "Change location")}>
      <Ionicons name={context.locationMode === "live" ? "locate" : "location-outline"} size={18}
        color={context.locationMode === "manual" ? COLORS.eventsAccent : COLORS.primary} />
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Ionicons name="pencil" size={14} color={COLORS.primary} />
    </Pressable>
    <Pressable style={styles.gps} disabled={locating} onPress={locate}
      accessibilityLabel={t("home.useMyLocation", "Use my location")}>
      {locating ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Ionicons name="locate" size={21} color={COLORS.primary} />}
    </Pressable>
    {failed && !open ? <Text style={styles.error}>{t("location.liveUnavailable", "Location is unavailable. Choose an address or try again.")}</Text> : null}
    <AreaSelectionModal visible={open} sessionToken={sessionToken} nearLat={context.mapPosition?.latitude}
      nearLng={context.mapPosition?.longitude} onClose={() => setOpen(false)} onUseLive={locate}
      onSelectPlace={(lat, lng, name) => { attemptRef.current++; context.setManualLocation(lat, lng, name); setLocating(false); setFailed(false); setOpen(false); }} />
  </View>;
}

const styles = StyleSheet.create({
  controls: { position: "absolute", top: 10, left: 10, zIndex: 30, flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "85%" },
  area: { height: 44, maxWidth: 220, flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.button,
    borderWidth: 1, borderColor: COLORS.border },
  label: { flexShrink: 1, fontSize: 12, color: COLORS.textPrimary },
  gps: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.button, borderWidth: 1, borderColor: COLORS.border },
  error: { color: COLORS.errorText, fontSize: 12 },
});

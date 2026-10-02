import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { driverStart, driverLocation, driverStatus, driverEnd, DriverSession } from "../../lib/api/mobility";

// Driver page: no Perix account needed - just the vehicle code from the
// operator. Starts GPS transmission and offers one-tap status buttons.

export default function MobilityDriverScreen() {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [session, setSession] = useState<DriverSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("active");
  const watchRef = useRef<number | null>(null);
  const sessionRef = useRef<DriverSession | null>(null);

  const stopWatch = () => {
    if (watchRef.current != null) {
      try {
        navigator.geolocation.clearWatch(watchRef.current);
      } catch {}
      watchRef.current = null;
    }
  };

  const sendLocation = (lat: number, lng: number) => {
    const s = sessionRef.current;
    if (!s) return;
    driverLocation(s.session_token, lat, lng, null, null).catch(() => {});
  };

  const start = async () => {
    if (!code.trim() || starting) return;
    setStarting(true);
    setError(null);
    try {
      const s = await driverStart(code.trim());
      sessionRef.current = s;
      setSession(s);
      setStatus(s.status);
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.geolocation) {
        watchRef.current = navigator.geolocation.watchPosition(
          (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
          () => {},
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
        );
      }
    } catch (e: any) {
      setError(t("mobility.driverInvalidCode", "Invalid or expired code"));
    } finally {
      setStarting(false);
    }
  };

  const changeStatus = (next: string) => {
    const s = sessionRef.current;
    if (!s) return;
    setStatus(next);
    driverStatus(s.session_token, next).catch(() => {});
  };

  const end = async () => {
    const s = sessionRef.current;
    stopWatch();
    if (s) {
      await driverEnd(s.session_token).catch(() => {});
    }
    sessionRef.current = null;
    setSession(null);
    setCode("");
  };

  useEffect(() => () => stopWatch(), []);

  const busStatuses = [
    { key: "good", label: t("mobility.status.good", "All good"), color: "#22C55E" },
    { key: "traffic", label: t("mobility.status.traffic", "Traffic"), color: "#FFC400" },
    { key: "stau", label: t("mobility.status.stau", "Heavy traffic"), color: "#EF4444" },
  ];
  const taxiStatuses = [
    { key: "available", label: t("mobility.status.available", "Available"), color: "#22C55E" },
    { key: "busy", label: t("mobility.status.busy", "Busy"), color: "#FFC400" },
    { key: "offline", label: t("mobility.status.offline", "Offline"), color: "#9CA3AF" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.brandWrap}>
            <Text style={styles.brand}>Perıx</Text>
            <Ionicons name="sunny" size={10} color="#FFC93C" />
          </View>
          <Text style={styles.title}>{t("mobility.driverTitle", "Vehicle location")}</Text>

          {!session ? (
            <>
              <Text style={styles.hint}>{t("mobility.driverCodePlaceholder", "Enter vehicle code")}</Text>
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={setCode}
                placeholder="••••••"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                autoCapitalize="none"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable style={styles.primaryButton} onPress={start} disabled={starting || code.trim().length === 0}>
                {starting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{t("mobility.driverStart", "Start")}</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.vehicleCard}>
                <Ionicons
                  name={session.mode === "bus" ? "bus" : session.mode === "tram" ? "train" : "car"}
                  size={26}
                  color="#59ABE3"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleTitle}>
                    {session.mode !== "taxi"
                      ? `${session.route_number || session.fleet_number} → ${session.route_direction || ""}`
                      : session.name}
                  </Text>
                  <Text style={styles.vehicleSub}>
                    {session.fleet_number} · {session.registration || ""}
                  </Text>
                </View>
                <View style={styles.liveDot}>
                  <Ionicons name="radio" size={14} color="#22C55E" />
                  <Text style={styles.liveText}>{t("mobility.driverLocationActive", "Location active")}</Text>
                </View>
              </View>

              <Text style={styles.hint}>
                {session.mode === "taxi" ? "STATUS" : "ROAD"}
              </Text>
              {(session.mode === "taxi" ? taxiStatuses : busStatuses).map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.statusButton, status === s.key && { borderColor: s.color, backgroundColor: s.color + "1A" }]}
                  onPress={() => changeStatus(s.key)}
                >
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.statusText, status === s.key && { fontWeight: "700" }]}>{s.label}</Text>
                </Pressable>
              ))}

              <Pressable style={[styles.primaryButton, styles.endButton]} onPress={end}>
                <Text style={styles.primaryButtonText}>{t("mobility.driverEnd", "End")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F8FC" },
  content: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    padding: 24,
    width: "100%",
    ...Platform.select({ web: { maxWidth: 420, marginHorizontal: "auto" } }),
  },
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  brand: { fontSize: 20, fontWeight: "800", color: "#096BFF", letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: "700", color: "#264348", marginBottom: 16 },
  hint: { fontSize: 13, color: "#6B7280", marginBottom: 8, fontWeight: "600" },
  codeInput: {
    borderWidth: 1,
    borderColor: "#E7EAF0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: "center",
    color: "#264348",
    marginBottom: 14,
  },
  error: { color: "#EF4444", fontSize: 13, marginBottom: 10, textAlign: "center" },
  primaryButton: {
    backgroundColor: "#59ABE3",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  endButton: { backgroundColor: "#EF4444", marginTop: 18 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EAF5FF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  vehicleTitle: { fontSize: 16, fontWeight: "700", color: "#264348" },
  vehicleSub: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  liveDot: { flexDirection: "row", alignItems: "center", gap: 4 },
  liveText: { fontSize: 11, color: "#22C55E", fontWeight: "700" },
  statusButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: "#E7EAF0",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 15, color: "#264348", fontWeight: "600" },
});

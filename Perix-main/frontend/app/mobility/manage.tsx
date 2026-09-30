import React, { useCallback, useEffect, useState } from "react";
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
import { useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { HeaderBackButton } from "../../components/shared/HeaderBackButton";
import {
  listMobilityVehicles,
  createMobilityVehicle,
  generateDriverCode,
  getLiveVehicles,
  LiveVehicle,
} from "../../lib/api/mobility";

// Operator page: manage vehicles, generate driver codes and watch the live
// fleet. Available to any logged-in business owner (transport operators).

export default function MobilityManageScreen() {
  const { t } = useTranslation();
  const { sessionToken, user } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [live, setLive] = useState<LiveVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<"bus" | "taxi">("bus");
  const [fleetNumber, setFleetNumber] = useState("");
  const [name, setName] = useState("");
  const [routeNumber, setRouteNumber] = useState("");
  const [routeDirection, setRouteDirection] = useState("");
  const [codes, setCodes] = useState<Record<string, { code: string; expires_at: string }>>({});
  const [codeLoading, setCodeLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [v, l] = await Promise.all([
        listMobilityVehicles(sessionToken),
        getLiveVehicles(sessionToken).catch(() => [] as LiveVehicle[]),
      ]);
      setVehicles(v || []);
      setLive(l || []);
    } catch (e) {
      console.warn("mobility manage load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) {
      router.replace("/login" as any);
      return;
    }
    load();
    const interval = setInterval(() => {
      getLiveVehicles(sessionToken).then(setLive).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [sessionToken, load]);

  const addVehicle = async () => {
    if (!sessionToken || !fleetNumber.trim() || adding) return;
    setAdding(true);
    try {
      await createMobilityVehicle(sessionToken, {
        mode,
        fleet_number: fleetNumber.trim(),
        name: name.trim() || undefined,
        route_number: routeNumber.trim() || undefined,
        route_direction: routeDirection.trim() || undefined,
      });
      setFleetNumber("");
      setName("");
      setRouteNumber("");
      setRouteDirection("");
      await load();
    } catch (e) {
      console.warn("create vehicle failed:", e);
    } finally {
      setAdding(false);
    }
  };

  const generateCode = async (vehicleId: string) => {
    if (!sessionToken || codeLoading) return;
    setCodeLoading(vehicleId);
    try {
      const res = await generateDriverCode(sessionToken, vehicleId);
      setCodes((prev) => ({ ...prev, [vehicleId]: res }));
    } catch (e) {
      console.warn("generate code failed:", e);
    } finally {
      setCodeLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} tintColor="#264348" />
        <Text style={styles.headerTitle}>{t("mobility.manageTitle", "Mobility")}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Live fleet */}
        <Text style={styles.sectionTitle}>{t("mobility.manageLive", "Live now")}</Text>
        <View style={styles.liveRow}>
          {live.length === 0 ? (
            <Text style={styles.emptyText}>{t("mobility.noVehicles", "No live vehicles right now")}</Text>
          ) : (
            live.map((v) => (
              <View key={v.vehicle_id} style={styles.liveChip}>
                <Ionicons name={v.mode === "bus" ? "bus" : "car"} size={14} color="#59ABE3" />
                <Text style={styles.liveChipText}>
                  {v.mode === "bus" ? v.route_number || v.fleet_number : v.name} · {t("mobility.status." + v.status, v.status)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Add vehicle */}
        <Text style={styles.sectionTitle}>{t("mobility.manageAddVehicle", "Add vehicle")}</Text>
        <View style={styles.card}>
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeOption, mode === "bus" && styles.modeOptionActive]}
              onPress={() => setMode("bus")}
            >
              <Ionicons name="bus" size={15} color={mode === "bus" ? "#fff" : "#264348"} />
              <Text style={[styles.modeText, mode === "bus" && { color: "#fff" }]}>{t("mobility.bus", "Bus")}</Text>
            </Pressable>
            <Pressable
              style={[styles.modeOption, mode === "taxi" && styles.modeOptionActive]}
              onPress={() => setMode("taxi")}
            >
              <Ionicons name="car" size={15} color={mode === "taxi" ? "#fff" : "#264348"} />
              <Text style={[styles.modeText, mode === "taxi" && { color: "#fff" }]}>{t("mobility.taxi", "Taxi")}</Text>
            </Pressable>
          </View>
          <TextInput style={styles.input} value={fleetNumber} onChangeText={setFleetNumber} placeholder="Fleet number (e.g. 1204)" placeholderTextColor="#9CA3AF" />
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name (e.g. Taxi 14)" placeholderTextColor="#9CA3AF" />
          {mode === "bus" && (
            <>
              <TextInput style={styles.input} value={routeNumber} onChangeText={setRouteNumber} placeholder="Line (e.g. 52)" placeholderTextColor="#9CA3AF" />
              <TextInput style={styles.input} value={routeDirection} onChangeText={setRouteDirection} placeholder="Direction (e.g. Braunlager Straße)" placeholderTextColor="#9CA3AF" />
            </>
          )}
          <Pressable style={styles.addButton} onPress={addVehicle} disabled={adding || !fleetNumber.trim()}>
            {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>+</Text>}
          </Pressable>
        </View>

        {/* Vehicles */}
        <Text style={styles.sectionTitle}>{t("mobility.manageVehicles", "Vehicles")}</Text>
        {vehicles.map((v) => (
          <View key={v.vehicle_id} style={styles.vehicleRow}>
            <View style={styles.vehicleIcon}>
              <Ionicons name={v.mode === "bus" ? "bus" : "car"} size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vehicleName}>
                {v.mode === "bus" ? `${v.route_number || v.fleet_number} → ${v.route_direction || ""}` : v.name || v.fleet_number}
              </Text>
              <Text style={styles.vehicleSub}>{v.fleet_number}</Text>
            </View>
            <Pressable
              style={styles.codeButton}
              onPress={() => generateCode(v.vehicle_id)}
              disabled={codeLoading === v.vehicle_id}
            >
              {codeLoading === v.vehicle_id ? (
                <ActivityIndicator size="small" color="#59ABE3" />
              ) : (
                <Text style={styles.codeButtonText}>{t("mobility.manageGenerateCode", "Generate code")}</Text>
              )}
            </Pressable>
            {codes[v.vehicle_id] && (
              <View style={styles.codeDisplay}>
                <Text style={styles.codeValue}>{codes[v.vehicle_id].code}</Text>
                <Text style={styles.codeHint}>{t("mobility.manageCodeHint", "Give this code to the driver - it expires after 12 hours.")}</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F8FC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E7EAF0",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#264348" },
  content: {
    padding: 16,
    paddingBottom: 40,
    ...Platform.select({ web: { maxWidth: 900, width: "100%", marginHorizontal: "auto" } }),
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(38,67,72,0.65)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  liveRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  liveChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  liveChipText: { fontSize: 13, color: "#264348", fontWeight: "600" },
  emptyText: { fontSize: 14, color: "#6B7280" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    padding: 14,
    gap: 8,
  },
  modeToggle: { flexDirection: "row", gap: 8, marginBottom: 4 },
  modeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    backgroundColor: "#F9FAFB",
  },
  modeOptionActive: { backgroundColor: "#264348", borderColor: "#264348" },
  modeText: { fontSize: 14, fontWeight: "600", color: "#264348" },
  input: {
    borderWidth: 1,
    borderColor: "#E7EAF0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#264348",
  },
  addButton: {
    backgroundColor: "#59ABE3",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  addButtonText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  vehicleRow: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  vehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#59ABE3",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleName: { fontSize: 15, fontWeight: "700", color: "#264348" },
  vehicleSub: { fontSize: 13, color: "#6B7280" },
  codeButton: {
    borderWidth: 1,
    borderColor: "#59ABE3",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  codeButtonText: { color: "#59ABE3", fontSize: 13, fontWeight: "700" },
  codeDisplay: { width: "100%", marginTop: 6 },
  codeValue: { fontSize: 22, fontWeight: "800", color: "#264348", letterSpacing: 4 },
  codeHint: { fontSize: 12, color: "#6B7280", marginTop: 2 },
});

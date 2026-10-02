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
  getMobilityOperatorInfo,
  getBusNetwork,
  importBusNetwork,
  activateBusNetwork,
  getTaxiPricing,
  setTaxiPricing,
  listTaxiRequests,
  acceptTaxiRequest,
  declineTaxiRequest,
  completeTaxiRequest,
  TaxiRequest,
  BusNetwork,
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
  const [mode, setMode] = useState<"bus" | "tram" | "taxi">("bus");
  const [fleetNumber, setFleetNumber] = useState("");
  const [name, setName] = useState("");
  const [routeNumber, setRouteNumber] = useState("");
  const [routeDirection, setRouteDirection] = useState("");
  const [codes, setCodes] = useState<Record<string, { code: string; expires_at: string }>>({});
  const [codeLoading, setCodeLoading] = useState<string | null>(null);
  const [operatorRole, setOperatorRole] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);
  const [network, setNetwork] = useState<BusNetwork | null>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ version_id: string; diff: any } | null>(null);
  const [taxiBaseFare, setTaxiBaseFare] = useState("4.5");
  const [taxiPerKm, setTaxiPerKm] = useState("2.6");
  const [taxiMinimum, setTaxiMinimum] = useState("8.0");
  const [savingPricing, setSavingPricing] = useState(false);
  const [taxiRequests, setTaxiRequests] = useState<TaxiRequest[]>([]);
  const [assignVehicleFor, setAssignVehicleFor] = useState<string | null>(null);
  const [assignVehicleId, setAssignVehicleId] = useState<string | null>(null);

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
    getMobilityOperatorInfo(sessionToken)
      .then((info) => setOperatorRole(info.mobility_role))
      .catch(() => setOperatorRole(null))
      .finally(() => setRoleChecked(true));
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken || !operatorRole) return;
    load();
    getBusNetwork(sessionToken).then(setNetwork).catch(() => {});
    const interval = setInterval(() => {
      getLiveVehicles(sessionToken).then(setLive).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [sessionToken, operatorRole, load]);

  const doImport = async () => {
    if (!sessionToken || importing || !importText.trim()) return;
    setImporting(true);
    try {
      const parsed = JSON.parse(importText);
      const routes = Array.isArray(parsed) ? parsed : parsed.routes;
      if (!Array.isArray(routes)) throw new Error("routes array required");
      const res = await importBusNetwork(sessionToken, parsed.name || undefined, routes);
      setImportResult(res);
    } catch (e: any) {
      alert("Import failed: " + (e?.message || "invalid JSON"));
    } finally {
      setImporting(false);
    }
  };

  const doActivate = async () => {
    if (!sessionToken || !importResult) return;
    try {
      await activateBusNetwork(sessionToken, importResult.version_id);
      setImportResult(null);
      setImportText("");
      const net = await getBusNetwork(sessionToken);
      setNetwork(net);
    } catch (e) {
      console.warn("activate failed:", e);
    }
  };

  const savePricing = async () => {
    if (!sessionToken || savingPricing) return;
    setSavingPricing(true);
    try {
      await setTaxiPricing(sessionToken, {
        base_fare: parseFloat(taxiBaseFare) || 4.5,
        per_km: parseFloat(taxiPerKm) || 2.6,
        minimum: parseFloat(taxiMinimum) || 8.0,
      });
      const p = await getTaxiPricing(sessionToken);
      setTaxiBaseFare(String(p.base_fare));
      setTaxiPerKm(String(p.per_km));
      setTaxiMinimum(String(p.minimum));
    } catch (e) {
      console.warn("save pricing failed:", e);
    } finally {
      setSavingPricing(false);
    }
  };

  const loadTaxiRequests = useCallback(async () => {
    if (!sessionToken || operatorRole !== "taxi_operator") return;
    try {
      const list = await listTaxiRequests(sessionToken);
      setTaxiRequests(list);
    } catch (e) {
      console.warn("load taxi requests failed:", e);
    }
  }, [sessionToken, operatorRole]);

  useEffect(() => {
    if (operatorRole !== "taxi_operator") return;
    loadTaxiRequests();
    const interval = setInterval(loadTaxiRequests, 10000);
    return () => clearInterval(interval);
  }, [operatorRole, loadTaxiRequests]);

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
        {roleChecked && !operatorRole && (
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={28} color="#59ABE3" />
            <Text style={styles.noticeText}>
              {t("mobility.operatorRequired", "Mobility management is available for transport operator businesses (Public Transport / Taxis).")}
            </Text>
          </View>
        )}

        {operatorRole && (
        <>
        {/* Live fleet */}
        <Text style={styles.sectionTitle}>{t("mobility.manageLive", "Live now")}</Text>
        <View style={styles.liveRow}>
          {live.length === 0 ? (
            <Text style={styles.emptyText}>{t("mobility.noVehicles", "No live vehicles right now")}</Text>
          ) : (
            live.map((v) => (
              <View key={v.vehicle_id} style={styles.liveChip}>
                <Ionicons name={v.mode === "bus" ? "bus" : v.mode === "tram" ? "train" : "car"} size={14} color="#59ABE3" />
                <Text style={styles.liveChipText}>
                  {v.mode !== "taxi" ? v.route_number || v.fleet_number : v.name} · {t("mobility.status." + v.status, v.status)}
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
              style={[styles.modeOption, mode === "tram" && styles.modeOptionActive]}
              onPress={() => setMode("tram")}
            >
              <Ionicons name="train" size={15} color={mode === "tram" ? "#fff" : "#264348"} />
              <Text style={[styles.modeText, mode === "tram" && { color: "#fff" }]}>{t("mobility.tram", "Tram")}</Text>
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
          {(mode === "bus" || mode === "tram") && (
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
              <Ionicons name={v.mode === "bus" ? "bus" : v.mode === "tram" ? "train" : "car"} size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vehicleName}>
                {v.mode !== "taxi" ? `${v.route_number || v.fleet_number} → ${v.route_direction || ""}` : v.name || v.fleet_number}
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

        {/* Bus network: routes & stops */}
        <Text style={styles.sectionTitle}>{t("mobility.routesStops", "Routes & Stops")}</Text>
        <View style={styles.card}>
          <Text style={styles.networkInfo}>
            {network && network.version_id
              ? `${t("mobility.activeNetwork", "Active network")}: ${network.name || network.version_id} · ${network.routes.length} ${t("mobility.routesCount", "routes")}`
              : t("mobility.noNetwork", "No network imported yet")}
          </Text>
          {network && network.routes.length > 0 && (
            <View style={styles.routeChips}>
              {network.routes.map((r) => (
                <View key={r.route_number} style={styles.routeChip}>
                  <Text style={styles.routeChipText}>
                    {r.route_number} · {r.stops.length} stops
                  </Text>
                </View>
              ))}
            </View>
          )}
          <TextInput
            style={[styles.input, styles.importInput]}
            value={importText}
            onChangeText={setImportText}
            placeholder={t("mobility.importJsonHint", 'Paste network JSON: {"name": "...", "routes": [{"route_number": "52", "name": "...", "stops": [{"stop_id": "A", "name": "...", "lat": 52.1, "lng": 11.6, "scheduled": "18:42"}]}]}')}
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={5}
          />
          <Pressable style={styles.importButton} onPress={doImport} disabled={importing}>
            {importing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.importButtonText}>{t("mobility.importNetwork", "Import network")}</Text>
            )}
          </Pressable>
          {importResult && (
            <View style={styles.diffCard}>
              <Text style={styles.diffTitle}>{t("mobility.importPreview", "Import preview")}</Text>
              <Text style={styles.diffText}>
                {t("mobility.addedRoutes", "Added routes")}: {(importResult.diff.added_routes || []).join(", ") || "—"}{"\n"}
                {t("mobility.changedRoutes", "Changed routes")}: {(importResult.diff.changed_routes || []).join(", ") || "—"}{"\n"}
                {t("mobility.removedRoutes", "Removed routes")}: {(importResult.diff.removed_routes || []).join(", ") || "—"}
              </Text>
              <Pressable style={styles.activateButton} onPress={doActivate}>
                <Text style={styles.activateButtonText}>{t("mobility.activateNetwork", "Activate new network")}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Taxi: pricing + incoming requests */}
        {operatorRole === "taxi_operator" && (
          <>
            <Text style={styles.sectionTitle}>{t("mobility.taxiPricing", "Taxi pricing")}</Text>
            <View style={styles.card}>
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>{t("mobility.taxiBaseFare", "Base fare")}</Text>
                <TextInput
                  style={[styles.input, styles.pricingInput]}
                  value={taxiBaseFare}
                  onChangeText={setTaxiBaseFare}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.pricingLabel}>{t("mobility.taxiPerKm", "Per km")}</Text>
                <TextInput
                  style={[styles.input, styles.pricingInput]}
                  value={taxiPerKm}
                  onChangeText={setTaxiPerKm}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.pricingLabel}>{t("mobility.taxiMinimum", "Minimum")}</Text>
                <TextInput
                  style={[styles.input, styles.pricingInput]}
                  value={taxiMinimum}
                  onChangeText={setTaxiMinimum}
                  keyboardType="decimal-pad"
                />
              </View>
              <Pressable style={styles.importButton} onPress={savePricing} disabled={savingPricing}>
                {savingPricing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.importButtonText}>{t("common.save", "Save")}</Text>
                )}
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>{t("mobility.taxiRequests", "Taxi requests")}</Text>
            {taxiRequests.length === 0 ? (
              <Text style={styles.emptyText}>{t("mobility.taxiNoRequests", "No requests yet")}</Text>
            ) : (
              taxiRequests.map((r) => (
                <View key={r.request_id} style={styles.vehicleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>
                      {r.client_name} · {r.pickup_address || "Pickup"} → {r.destination_address || "Destination"}
                    </Text>
                    <Text style={styles.vehicleSub}>
                      {r.distance_km} km · ~{r.duration_minutes} min · €{r.fare_min}–{r.fare_max} ·{" "}
                      {t("mobility.status." + r.status, r.status)}
                    </Text>
                  </View>
                  {r.status === "requested" && (
                    assignVehicleFor === r.request_id ? (
                      <View style={styles.assignBox}>
                        {live.filter((v) => v.mode === "taxi").map((v) => (
                          <Pressable
                            key={v.vehicle_id}
                            style={styles.assignOption}
                            onPress={() => setAssignVehicleId(v.vehicle_id)}
                          >
                            <Ionicons
                              name={assignVehicleId === v.vehicle_id ? "radio-button-on" : "radio-button-off"}
                              size={14}
                              color="#59ABE3"
                            />
                            <Text style={styles.assignOptionText}>{v.name}</Text>
                          </Pressable>
                        ))}
                        <Pressable
                          style={styles.assignConfirm}
                          onPress={async () => {
                            if (!sessionToken || !assignVehicleId) return;
                            await acceptTaxiRequest(sessionToken, r.request_id, assignVehicleId);
                            setAssignVehicleFor(null);
                            setAssignVehicleId(null);
                            loadTaxiRequests();
                          }}
                        >
                          <Text style={styles.assignConfirmText}>{t("mobility.taxiAssign", "Assign")}</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.codeButton}
                        onPress={() => {
                          setAssignVehicleFor(r.request_id);
                          setAssignVehicleId(null);
                        }}
                      >
                        <Text style={styles.codeButtonText}>{t("mobility.taxiAcceptAssign", "Accept & assign")}</Text>
                      </Pressable>
                    )
                  )}
                  {r.status === "requested" && (
                    <Pressable
                      style={styles.declineButton}
                      onPress={async () => {
                        if (!sessionToken) return;
                        await declineTaxiRequest(sessionToken, r.request_id);
                        loadTaxiRequests();
                      }}
                    >
                      <Text style={styles.declineButtonText}>{t("mobility.taxiDecline", "Decline")}</Text>
                    </Pressable>
                  )}
                  {r.status === "accepted" && (
                    <Pressable
                      style={styles.codeButton}
                      onPress={async () => {
                        if (!sessionToken) return;
                        await completeTaxiRequest(sessionToken, r.request_id);
                        loadTaxiRequests();
                      }}
                    >
                      <Text style={styles.codeButtonText}>{t("mobility.taxiComplete", "Complete")}</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </>
        )}
        </>
        )}
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
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EAF5FF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDFF7",
    padding: 14,
  },
  noticeText: { flex: 1, fontSize: 14, color: "#264348", lineHeight: 20 },
  networkInfo: { fontSize: 14, color: "#264348", fontWeight: "600" },
  routeChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  routeChip: {
    backgroundColor: "#EAF5FF",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  routeChipText: { fontSize: 12, color: "#264348", fontWeight: "600" },
  importInput: { minHeight: 90, textAlignVertical: "top" },
  importButton: {
    backgroundColor: "#59ABE3",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  importButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  diffCard: {
    backgroundColor: "#EAF5FF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDFF7",
    padding: 12,
    marginTop: 10,
  },
  diffTitle: { fontSize: 14, fontWeight: "700", color: "#264348", marginBottom: 4 },
  diffText: { fontSize: 13, color: "#264348", lineHeight: 20 },
  activateButton: {
    backgroundColor: "#22C55E",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 10,
  },
  activateButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  pricingRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  pricingLabel: { fontSize: 13, color: "#264348", fontWeight: "600" },
  pricingInput: { width: 70, paddingVertical: 8, textAlign: "center" },
  assignBox: { width: "100%", marginTop: 6, gap: 6 },
  assignOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  assignOptionText: { fontSize: 13, color: "#264348", fontWeight: "600" },
  assignConfirm: {
    backgroundColor: "#22C55E",
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
  },
  assignConfirmText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  declineButton: {
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  declineButtonText: { color: "#EF4444", fontSize: 12, fontWeight: "700" },
});

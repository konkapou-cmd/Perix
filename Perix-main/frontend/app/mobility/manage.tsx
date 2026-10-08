import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  importGtfsZip,
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
  registerDevice,
  listDevices,
  assignDevice,
  deleteDevice,
  MobilityDevice,
  createGraphOverlay,
  listGraphOverlays,
  GraphOverlay,
  createStopOverride,
  listStopOverrides,
  deleteStopOverride,
  createTripOverride,
  listTripOverrides,
  deleteTripOverride,
} from "../../lib/api/mobility";

// Operator page: manage vehicles, generate driver codes and watch the live
// fleet. Available to any logged-in business owner (transport operators).

export default function MobilityManageScreen() {
  const { t } = useTranslation();
  const { sessionToken, user } = useAuth();
  const router = useRouter();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [live, setLive] = useState<LiveVehicle[]>([]);
  const [activeExpanded, setActiveExpanded] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "live" | "realtime" | "schedule">("all");
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
  const [importResult, setImportResult] = useState<{ version_id: string; diff: any; summary?: any } | null>(null);
  const [taxiBaseFare, setTaxiBaseFare] = useState("4.5");
  const [taxiPerKm, setTaxiPerKm] = useState("2.6");
  const [taxiMinimum, setTaxiMinimum] = useState("8.0");
  const [savingPricing, setSavingPricing] = useState(false);
  const [taxiRequests, setTaxiRequests] = useState<TaxiRequest[]>([]);
  const [assignVehicleFor, setAssignVehicleFor] = useState<string | null>(null);
  const [assignVehicleId, setAssignVehicleId] = useState<string | null>(null);

  // --- Network Editor (V2) state ---
  const [devices, setDevices] = useState<MobilityDevice[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [deviceSource, setDeviceSource] = useState<"PERIX_GPS" | "PHONE_GPS">("PERIX_GPS");
  const [deviceSecret, setDeviceSecret] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [overlays, setOverlays] = useState<GraphOverlay[]>([]);
  const [ovName, setOvName] = useState("");
  const [ovGeometry, setOvGeometry] = useState("");
  const [ovRoute, setOvRoute] = useState("");
  const [ovBusy, setOvBusy] = useState(false);
  const [stopOverrides, setStopOverrides] = useState<any[]>([]);
  const [soKind, setSoKind] = useState<string>("rename");
  const [soTarget, setSoTarget] = useState("");
  const [soName, setSoName] = useState("");
  const [soLat, setSoLat] = useState("");
  const [soLng, setSoLng] = useState("");
  const [soBusy, setSoBusy] = useState(false);
  const [tripOverrides, setTripOverrides] = useState<any[]>([]);
  const [toKind, setToKind] = useState<string>("trip_canceled");
  const [toTripId, setToTripId] = useState("");
  const [toStopId, setToStopId] = useState("");
  const [toReason, setToReason] = useState("");
  const [toBusy, setToBusy] = useState(false);

  // Active means an operating service unit right now. It does not
  // necessarily mean a physical vehicle is sending GPS.
  //
  // LIVE     = fresh physical position (GPS/device/external GPS)
  // REALTIME = virtual position constrained by realtime trip updates
  // SCHEDULE = virtual position derived from the timetable
  const activeServiceUnits = useMemo(() => {
    const vehiclesById = new Map<string, any>();
    (vehicles || []).forEach((v) => {
      if (v?.vehicle_id) vehiclesById.set(String(v.vehicle_id), v);
    });

    return (live || [])
      .map((v) => {
        const rawQuality = String(
          v.position_quality ||
            (!v.estimated
              ? "LIVE"
              : v.position_source === "REALTIME_ESTIMATE"
                ? "REALTIME"
                : "SCHEDULE")
        ).toUpperCase();

        const quality: "LIVE" | "REALTIME" | "SCHEDULE" =
          rawQuality === "LIVE"
            ? "LIVE"
            : rawQuality === "REALTIME"
              ? "REALTIME"
              : "SCHEDULE";

        return {
          ...v,
          quality,
          physicalVehicle: vehiclesById.get(String(v.vehicle_id)) || null,
        };
      })
      .sort((a, b) => {
        const rank = { LIVE: 0, REALTIME: 1, SCHEDULE: 2 };
        const q = rank[a.quality] - rank[b.quality];
        if (q !== 0) return q;

        const modeCompare = String(a.mode).localeCompare(String(b.mode));
        if (modeCompare !== 0) return modeCompare;

        const routeCompare = String(a.route_number || "").localeCompare(
          String(b.route_number || ""),
          undefined,
          { numeric: true }
        );
        if (routeCompare !== 0) return routeCompare;

        return String(a.route_direction || "").localeCompare(
          String(b.route_direction || "")
        );
      });
  }, [live, vehicles]);

  const activeCounts = useMemo(
    () => ({
      total: activeServiceUnits.length,
      live: activeServiceUnits.filter((v) => v.quality === "LIVE").length,
      realtime: activeServiceUnits.filter((v) => v.quality === "REALTIME").length,
      schedule: activeServiceUnits.filter((v) => v.quality === "SCHEDULE").length,
      bus: activeServiceUnits.filter((v) => v.mode === "bus").length,
      tram: activeServiceUnits.filter((v) => v.mode === "tram").length,
      taxi: activeServiceUnits.filter((v) => v.mode === "taxi").length,
    }),
    [activeServiceUnits]
  );

  const filteredActiveUnits = useMemo(() => {
    if (activeFilter === "all") return activeServiceUnits;

    const quality =
      activeFilter === "live"
        ? "LIVE"
        : activeFilter === "realtime"
          ? "REALTIME"
          : "SCHEDULE";

    return activeServiceUnits.filter((v) => v.quality === quality);
  }, [activeServiceUnits, activeFilter]);

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

  // Network Editor data (V2)
  const loadEditor = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [devs, ovs, sos, tos] = await Promise.all([
        listDevices(sessionToken).catch(() => [] as MobilityDevice[]),
        listGraphOverlays(sessionToken).catch(() => [] as GraphOverlay[]),
        listStopOverrides(sessionToken).catch(() => []),
        listTripOverrides(sessionToken).catch(() => []),
      ]);
      setDevices(devs || []);
      setOverlays(ovs || []);
      setStopOverrides(sos || []);
      setTripOverrides(tos || []);
    } catch (e) {
      console.warn("editor load failed:", e);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken && operatorRole) loadEditor();
  }, [sessionToken, operatorRole, loadEditor]);

  const doRegisterDevice = async () => {
    if (!sessionToken || deviceBusy) return;
    setDeviceBusy(true);
    try {
      const res = await registerDevice(sessionToken, {
        name: deviceName.trim(),
        source_type: deviceSource,
      });
      setDeviceSecret(res.secret);
      setDeviceName("");
      loadEditor();
    } catch (e: any) {
      alert("Device registration failed: " + (e?.message || e));
    } finally {
      setDeviceBusy(false);
    }
  };

  const doAssignDevice = async (deviceId: string, vehicleId: string) => {
    if (!sessionToken || !vehicleId.trim()) return;
    try {
      await assignDevice(sessionToken, deviceId, vehicleId.trim());
      loadEditor();
    } catch (e: any) {
      alert("Assign failed: " + (e?.message || e));
    }
  };

  const doCreateOverlay = async () => {
    if (!sessionToken || ovBusy) return;
    setOvBusy(true);
    try {
      const geometry = JSON.parse(ovGeometry);
      await createGraphOverlay(sessionToken, {
        name: ovName.trim(),
        geometry,
        allowed_modes: ["bus", "tram"],
        route_number: ovRoute.trim() || null,
        verified: true,
      });
      setOvName("");
      setOvGeometry("");
      setOvRoute("");
      loadEditor();
    } catch (e: any) {
      alert("Overlay creation failed: " + (e?.message || "invalid geometry JSON"));
    } finally {
      setOvBusy(false);
    }
  };

  const doCreateStopOverride = async () => {
    if (!sessionToken || soBusy || !soTarget.trim()) return;
    setSoBusy(true);
    try {
      const payload: Record<string, any> = { kind: soKind, target_stop_id: soTarget.trim() };
      if (soKind === "rename") payload.name = soName.trim();
      if (soKind === "move") {
        payload.latitude = parseFloat(soLat);
        payload.longitude = parseFloat(soLng);
      }
      if (soKind === "manual_stop") {
        payload.stop_id = soTarget.trim();
        payload.name = soName.trim() || soTarget.trim();
        payload.latitude = parseFloat(soLat);
        payload.longitude = parseFloat(soLng);
        payload.modes = ["bus", "tram"];
        payload.platforms = [
          { platform_id: soTarget.trim() + "_p1", latitude: parseFloat(soLat), longitude: parseFloat(soLng), name: soName.trim() || soTarget.trim(), directions: [] },
        ];
      }
      await createStopOverride(sessionToken, payload);
      setSoTarget("");
      setSoName("");
      setSoLat("");
      setSoLng("");
      loadEditor();
    } catch (e: any) {
      alert("Override failed: " + (e?.message || e));
    } finally {
      setSoBusy(false);
    }
  };

  const doCreateTripOverride = async () => {
    if (!sessionToken || toBusy || !toTripId.trim()) return;
    setToBusy(true);
    try {
      await createTripOverride(sessionToken, {
        kind: toKind,
        trip_id: toTripId.trim(),
        stop_id: toStopId.trim() || null,
        reason: toReason.trim() || null,
      });
      setToTripId("");
      setToStopId("");
      setToReason("");
      loadEditor();
    } catch (e: any) {
      alert("Trip override failed: " + (e?.message || e));
    } finally {
      setToBusy(false);
    }
  };

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

  const pickGtfsFile = () => {
    if (typeof document === "undefined") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,application/zip";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f || !sessionToken || importing) return;
      setImporting(true);
      try {
        const res = await importGtfsZip(sessionToken, f, f.name);
        setImportResult(res as any);
      } catch (e: any) {
        alert(t("mobility.importFailed", "GTFS import failed") + ": " + (e?.message || ""));
      } finally {
        setImporting(false);
      }
    };
    input.click();
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
        {/* Active operating service units. Collapsed by default so a
            large imported timetable never takes over the whole page. */}
        <View style={styles.activePanel}>
          <Pressable
            style={styles.activePanelHeader}
            onPress={() => setActiveExpanded((value) => !value)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.activePanelTitle}>
                {t("mobility.activeServiceNow", "Active service now")}
              </Text>
              <Text style={styles.activePanelMeta}>
                {activeCounts.total} {t("mobility.activeUnits", "active")} ·{" "}
                GPS {activeCounts.live} · RT {activeCounts.realtime} ·{" "}
                {t("mobility.scheduleShort", "Schedule")} {activeCounts.schedule}
              </Text>
              <Text style={styles.activePanelModes}>
                {t("mobility.bus", "Bus")} {activeCounts.bus} ·{" "}
                {t("mobility.tram", "Tram")} {activeCounts.tram} ·{" "}
                {t("mobility.taxi", "Taxi")} {activeCounts.taxi}
              </Text>
            </View>

            <Ionicons
              name={activeExpanded ? "chevron-up" : "chevron-down"}
              size={20}
              color="#264348"
            />
          </Pressable>

          {activeExpanded && (
            <>
              <Text style={styles.activeExplain}>
                {t(
                  "mobility.activeExplain",
                  "Active = a service currently operating. GPS Live is a physical position; Realtime and Schedule are estimated service trips."
                )}
              </Text>

              <View style={styles.activeFilters}>
                {([
                  ["all", t("common.all", "All"), activeCounts.total],
                  ["live", "GPS", activeCounts.live],
                  ["realtime", "Realtime", activeCounts.realtime],
                  ["schedule", t("mobility.scheduleShort", "Schedule"), activeCounts.schedule],
                ] as const).map(([key, label, count]) => (
                  <Pressable
                    key={key}
                    style={[
                      styles.activeFilterChip,
                      activeFilter === key && styles.activeFilterChipActive,
                    ]}
                    onPress={() => setActiveFilter(key)}
                  >
                    <Text
                      style={[
                        styles.activeFilterText,
                        activeFilter === key && styles.activeFilterTextActive,
                      ]}
                    >
                      {label} {count}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {filteredActiveUnits.length === 0 ? (
                <Text style={[styles.emptyText, { paddingHorizontal: 14, paddingBottom: 14 }]}>
                  {t("mobility.noActiveUnits", "No active service units in this category")}
                </Text>
              ) : (
                <ScrollView
                  style={styles.activeList}
                  contentContainerStyle={styles.activeListContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  {filteredActiveUnits.map((v) => {
                    const physical = v.physicalVehicle;
                    const qualityLabel =
                      v.quality === "LIVE"
                        ? t("mobility.gpsLive", "GPS Live")
                        : v.quality === "REALTIME"
                          ? t("mobility.realtimeEstimate", "Realtime estimate")
                          : t("mobility.scheduleEstimate", "Schedule estimate");

                    const qualityColor =
                      v.quality === "LIVE"
                        ? "#16A34A"
                        : v.quality === "REALTIME"
                          ? "#2563EB"
                          : "#6B7280";

                    const tripLabel = v.trip_id
                      ? `${t("mobility.trip", "Trip")} ${v.trip_id}`
                      : t("mobility.tripUnknown", "Trip id unavailable");

                    return (
                      <View key={v.vehicle_id} style={styles.activeUnitRow}>
                        <View
                          style={[
                            styles.activeUnitIcon,
                            {
                              backgroundColor:
                                v.mode === "tram"
                                  ? "#8B0000"
                                  : v.mode === "bus"
                                    ? "#1E3A8A"
                                    : "#D9A400",
                            },
                          ]}
                        >
                          <Ionicons
                            name={v.mode === "bus" ? "bus" : v.mode === "tram" ? "train" : "car"}
                            size={15}
                            color="#fff"
                          />
                        </View>

                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.activeUnitTitle} numberOfLines={1}>
                            {v.mode !== "taxi"
                              ? `${v.route_number || v.fleet_number || "—"} → ${v.route_direction || "—"}`
                              : physical?.name || v.name || physical?.fleet_number || v.vehicle_id}
                          </Text>

                          <Text style={styles.activeUnitSub} numberOfLines={2}>
                            {physical
                              ? `${t("mobility.linkedVehicle", "Vehicle")} ${physical.fleet_number || physical.name || physical.vehicle_id}${physical.registration ? ` · ${physical.registration}` : ""}`
                              : `${tripLabel} · ${t("mobility.noPerixVehicleLink", "no Perix vehicle record linked")}`}
                          </Text>

                          {v.quality === "LIVE" && (
                            <Text style={styles.activeUnitAge}>
                              {t("mobility.positionAge", "Position age")}:{" "}
                              {Math.max(0, Math.round(v.position_age_seconds || 0))}s
                            </Text>
                          )}
                        </View>

                        <View
                          style={[
                            styles.activeQualityBadge,
                            { borderColor: qualityColor },
                          ]}
                        >
                          <View
                            style={[
                              styles.activeQualityDot,
                              { backgroundColor: qualityColor },
                            ]}
                          />
                          <Text
                            style={[
                              styles.activeQualityText,
                              { color: qualityColor },
                            ]}
                          >
                            {qualityLabel}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </>
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
              <Text style={styles.vehicleSub}>
                {v.mode !== "taxi"
                  ? t("mobility.manageTimetableDriven", "Runs from the imported timetable - no driver needed")
                  : v.fleet_number}
              </Text>
            </View>
            {v.mode === "taxi" ? (
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
            ) : null}
            {v.mode === "taxi" && codes[v.vehicle_id] && (
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
          <Pressable style={styles.uploadButton} onPress={pickGtfsFile} disabled={importing}>
            <Ionicons name="cloud-upload-outline" size={16} color="#59ABE3" />
            <Text style={styles.uploadButtonText}>{t("mobility.uploadGtfs", "Upload GTFS (.zip)")}</Text>
          </Pressable>
          {importResult && (
            <View style={styles.diffCard}>
              <Text style={styles.diffTitle}>{t("mobility.importPreview", "Import preview")}</Text>
              {importResult.summary && (
                <Text style={styles.diffText}>
                  {t("mobility.busLines", "Bus lines")}: {importResult.summary.bus_lines} ·{" "}
                  {t("mobility.tramLines", "Tram lines")}: {importResult.summary.tram_lines} ·{" "}
                  {t("mobility.tripCount", "Trips")}: {importResult.summary.trips}{"\n"}
                  {t("mobility.serviceDate", "Service date")}: {(() => {
                    const sd = String(importResult.summary.service_date || "");
                    const m = sd.match(/^(\d{4})-(\d{2})-(\d{2})/);
                    return m ? `${m[3]}/${m[2]}/${m[1]}` : sd;
                  })()}
                </Text>
              )}
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

        {/* Network Editor (V2): GPS devices, graph overlays, overrides */}
        <Text style={styles.sectionTitle}>{t("mobility.editorTitle", "Network Editor")}</Text>

        <Text style={styles.editorSubtitle}>{t("mobility.editorDevices", "GPS devices (hardware or phone)")}</Text>
        <View style={styles.card}>
          <View style={styles.editorRow}>
            <TextInput style={[styles.input, { flex: 1 }]} value={deviceName} onChangeText={setDeviceName} placeholder={t("mobility.editorDeviceName", "Device name")} placeholderTextColor="#9CA3AF" />
            <Pressable
              style={[styles.codeButton, deviceSource === "PERIX_GPS" && styles.codeButtonActive]}
              onPress={() => setDeviceSource("PERIX_GPS")}
            >
              <Text style={styles.codeButtonText}>GPS Box</Text>
            </Pressable>
            <Pressable
              style={[styles.codeButton, deviceSource === "PHONE_GPS" && styles.codeButtonActive]}
              onPress={() => setDeviceSource("PHONE_GPS")}
            >
              <Text style={styles.codeButtonText}>Phone</Text>
            </Pressable>
          </View>
          <Pressable style={styles.addButton} onPress={doRegisterDevice} disabled={deviceBusy || !deviceName.trim()}>
            {deviceBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>+</Text>}
          </Pressable>
          {deviceSecret && (
            <View style={styles.codeDisplay}>
              <Text style={styles.codeValue}>{deviceSecret}</Text>
              <Text style={styles.codeHint}>{t("mobility.editorSecretHint", "Store this secret on the device now - it is shown only once.")}</Text>
            </View>
          )}
          {devices.map((d) => (
            <View key={d.device_id} style={styles.vehicleRow}>
              <View style={styles.vehicleIcon}>
                <Ionicons name={d.source_type === "PHONE_GPS" ? "phone-portrait" : "hardware-chip"} size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{d.name || d.device_id}</Text>
                <Text style={styles.vehicleSub}>
                  {d.device_id} · {d.source_type}
                  {d.vehicle_id ? ` → ${d.vehicle_id}` : ""}
                </Text>
              </View>
              <Pressable onPress={() => doAssignDevice(d.device_id, prompt("Vehicle ID") || "")}>
                <Text style={styles.codeButtonText}>{t("mobility.editorAssign", "Assign")}</Text>
              </Pressable>
              <Pressable onPress={() => sessionToken && deleteDevice(sessionToken, d.device_id).then(loadEditor)}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={styles.editorSubtitle}>{t("mobility.editorOverlays", "Missing road/track (graph overlay)")}</Text>
        <View style={styles.card}>
          <TextInput style={styles.input} value={ovName} onChangeText={setOvName} placeholder={t("mobility.editorOverlayName", "Name (e.g. new depot access)")} placeholderTextColor="#9CA3AF" />
          <TextInput style={[styles.input, styles.importInput]} value={ovGeometry} onChangeText={setOvGeometry} placeholder={'Geometry JSON: [[52.1, 11.6], [52.101, 11.602]]'} placeholderTextColor="#9CA3AF" multiline numberOfLines={3} />
          <TextInput style={styles.input} value={ovRoute} onChangeText={setOvRoute} placeholder={t("mobility.editorOverlayRoute", "Route number (optional)")} placeholderTextColor="#9CA3AF" />
          <Pressable style={styles.uploadButton} onPress={doCreateOverlay} disabled={ovBusy || !ovGeometry.trim()}>
            {ovBusy ? <ActivityIndicator size="small" color="#59ABE3" /> : <Text style={styles.uploadButtonText}>{t("mobility.editorAddOverlay", "Add overlay")}</Text>}
          </Pressable>
          {overlays.map((o) => (
            <View key={o.overlay_id} style={styles.vehicleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{o.name || o.overlay_id}</Text>
                <Text style={styles.vehicleSub}>{o.overlay_id} · {(o.geometry || []).length} points{o.route_number ? ` · route ${o.route_number}` : ""}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.editorSubtitle}>{t("mobility.editorStopOverrides", "Stop corrections")}</Text>
        <View style={styles.card}>
          <View style={styles.editorRow}>
            <Pressable style={[styles.codeButton, soKind === "rename" && styles.codeButtonActive]} onPress={() => setSoKind("rename")}>
              <Text style={styles.codeButtonText}>Rename</Text>
            </Pressable>
            <Pressable style={[styles.codeButton, soKind === "move" && styles.codeButtonActive]} onPress={() => setSoKind("move")}>
              <Text style={styles.codeButtonText}>Move</Text>
            </Pressable>
            <Pressable style={[styles.codeButton, soKind === "deactivate" && styles.codeButtonActive]} onPress={() => setSoKind("deactivate")}>
              <Text style={styles.codeButtonText}>Remove</Text>
            </Pressable>
            <Pressable style={[styles.codeButton, soKind === "manual_stop" && styles.codeButtonActive]} onPress={() => setSoKind("manual_stop")}>
              <Text style={styles.codeButtonText}>New stop</Text>
            </Pressable>
          </View>
          <TextInput style={styles.input} value={soTarget} onChangeText={setSoTarget} placeholder={t("mobility.editorStopTarget", "Stop id (physical:...)")} placeholderTextColor="#9CA3AF" />
          {soKind !== "deactivate" && <TextInput style={styles.input} value={soName} onChangeText={setSoName} placeholder={t("mobility.editorStopName", "Name")} placeholderTextColor="#9CA3AF" />}
          {(soKind === "move" || soKind === "manual_stop") && (
            <View style={styles.editorRow}>
              <TextInput style={[styles.input, { flex: 1 }]} value={soLat} onChangeText={setSoLat} placeholder="Lat" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
              <TextInput style={[styles.input, { flex: 1 }]} value={soLng} onChangeText={setSoLng} placeholder="Lng" placeholderTextColor="#9CA3AF" keyboardType="numeric" />
            </View>
          )}
          <Pressable style={styles.uploadButton} onPress={doCreateStopOverride} disabled={soBusy || !soTarget.trim()}>
            {soBusy ? <ActivityIndicator size="small" color="#59ABE3" /> : <Text style={styles.uploadButtonText}>{t("mobility.editorApply", "Apply override")}</Text>}
          </Pressable>
          {stopOverrides.map((o) => (
            <View key={o.override_id} style={styles.vehicleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{o.kind}</Text>
                <Text style={styles.vehicleSub}>{o.target_stop_id}{o.name ? ` → ${o.name}` : ""}</Text>
              </View>
              <Pressable onPress={() => sessionToken && deleteStopOverride(sessionToken, o.override_id).then(loadEditor)}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={styles.editorSubtitle}>{t("mobility.editorTripOverrides", "Trip exceptions (cancel / skip stop)")}</Text>
        <View style={styles.card}>
          <View style={styles.editorRow}>
            <Pressable style={[styles.codeButton, toKind === "trip_canceled" && styles.codeButtonActive]} onPress={() => setToKind("trip_canceled")}>
              <Text style={styles.codeButtonText}>Cancel trip</Text>
            </Pressable>
            <Pressable style={[styles.codeButton, toKind === "stop_skipped" && styles.codeButtonActive]} onPress={() => setToKind("stop_skipped")}>
              <Text style={styles.codeButtonText}>Skip stop</Text>
            </Pressable>
          </View>
          <TextInput style={styles.input} value={toTripId} onChangeText={setToTripId} placeholder={t("mobility.editorTripId", "Trip id")} placeholderTextColor="#9CA3AF" />
          {toKind === "stop_skipped" && (
            <TextInput style={styles.input} value={toStopId} onChangeText={setToStopId} placeholder={t("mobility.editorStopId", "Stop id")} placeholderTextColor="#9CA3AF" />
          )}
          <TextInput style={styles.input} value={toReason} onChangeText={setToReason} placeholder={t("mobility.editorReason", "Reason (optional)")} placeholderTextColor="#9CA3AF" />
          <Pressable style={styles.uploadButton} onPress={doCreateTripOverride} disabled={toBusy || !toTripId.trim()}>
            {toBusy ? <ActivityIndicator size="small" color="#59ABE3" /> : <Text style={styles.uploadButtonText}>{t("mobility.editorApply", "Apply")}</Text>}
          </Pressable>
          {tripOverrides.map((o) => (
            <View key={o.override_id} style={styles.vehicleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{o.kind}</Text>
                <Text style={styles.vehicleSub}>{o.trip_id}{o.stop_id ? ` · stop ${o.stop_id}` : ""}</Text>
              </View>
              <Pressable onPress={() => sessionToken && deleteTripOverride(sessionToken, o.override_id).then(loadEditor)}>
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          ))}
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
  activePanel: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    overflow: "hidden",
  },
  activePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  activePanelTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#264348",
  },
  activePanelMeta: {
    marginTop: 3,
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },
  activePanelModes: {
    marginTop: 2,
    fontSize: 11,
    color: "#6B7280",
  },
  activeExplain: {
    marginHorizontal: 14,
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 17,
    color: "#6B7280",
  },
  activeFilters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  activeFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
  },
  activeFilterChipActive: {
    backgroundColor: "#264348",
    borderColor: "#264348",
  },
  activeFilterText: {
    fontSize: 11,
    color: "#264348",
    fontWeight: "700",
  },
  activeFilterTextActive: {
    color: "#fff",
  },
  activeList: {
    maxHeight: 360,
    borderTopWidth: 1,
    borderTopColor: "#EEF0F3",
  },
  activeListContent: {
    padding: 10,
    gap: 8,
  },
  activeUnitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#EEF0F3",
  },
  activeUnitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  activeUnitTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#264348",
  },
  activeUnitSub: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: "#6B7280",
  },
  activeUnitAge: {
    marginTop: 2,
    fontSize: 10,
    color: "#6B7280",
  },
  activeQualityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  activeQualityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeQualityText: {
    fontSize: 10,
    fontWeight: "800",
  },
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
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  codeButtonActive: { backgroundColor: "#264348", borderColor: "#264348" },
  editorSubtitle: { fontSize: 13, fontWeight: "800", color: "#264348", marginTop: 14, marginBottom: 6 },
  editorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" },
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
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#59ABE3",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  uploadButtonText: { color: "#59ABE3", fontSize: 14, fontWeight: "700" },
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

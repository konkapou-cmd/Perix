import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";

export default function MobilityDataStatus({ lastSuccess, failed, networkFailed, networkLoading, enabled = true }: {
  lastSuccess: number | null; failed: boolean; networkFailed: boolean; networkLoading: boolean;
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [enabled]);
  const age = lastSuccess == null ? null : Math.max(0, Math.floor((now - lastSuccess) / 1000));
  if (!failed && !networkFailed && !networkLoading && age != null && age < 15) return null;
  return <Text style={styles.status} accessibilityLiveRegion="polite">
    {failed ? t("mobility.refreshFailed", "Vehicle updates delayed; retrying automatically.")
      : age == null ? t("mobility.loadingVehicles", "Loading vehicles…")
        : age >= 15 ? t("mobility.waitingFreshData", "Waiting for fresh vehicle data…") : ""}
    {age != null && (failed || age >= 15) ? ` · ${t("mobility.lastUpdateSeconds", "Last update {{n}}s ago", { n: age })}` : ""}
    {networkFailed ? ` ${t("mobility.networkRetry", "Lines/stops could not refresh; retrying with the last available map.")}`
      : networkLoading ? ` ${t("mobility.networkLoading", "Loading lines and stops…")}` : ""}
  </Text>;
}
const styles = StyleSheet.create({ status: { marginHorizontal: 16, marginVertical: 6, fontSize: 12, color: COLORS.textSecondary } });

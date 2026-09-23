import { useEffect, useRef, useState } from "react";
import { Platform, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

/**
 * Detects when a newer build of the web app is deployed and shows a small
 * "New version available" banner. The served index.html is never cached, so
 * fetching it reveals the current entry bundle hash.
 */
export default function UpdateBanner() {
  const { t } = useTranslation();
  const [newVersion, setNewVersion] = useState(false);
  const currentHashRef = useRef<string | null>(null);
  const checkingRef = useRef(false);

  const getCurrentEntryHash = (): string | null => {
    if (typeof document === "undefined") return null;
    const scripts = document.querySelectorAll('script[src*="entry-"]');
    for (const s of Array.from(scripts)) {
      const src = (s as HTMLScriptElement).src || "";
      const m = src.match(/entry-([a-f0-9]+)\.js/);
      if (m) return m[1];
    }
    return null;
  };

  const checkVersion = async () => {
    if (Platform.OS !== "web" || checkingRef.current) return;
    if (!currentHashRef.current) currentHashRef.current = getCurrentEntryHash();
    if (!currentHashRef.current) return;
    checkingRef.current = true;
    try {
      const res = await fetch("/", { cache: "no-store" });
      const html = await res.text();
      const m = html.match(/entry-([a-f0-9]+)\.js/);
      if (m && m[1] !== currentHashRef.current) {
        setNewVersion(true);
      }
    } catch {
      // offline — retry on the next tick
    } finally {
      checkingRef.current = false;
    }
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const interval = setInterval(() => {
      void checkVersion();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (Platform.OS !== "web" || !newVersion) return null;

  const reload = () => {
    try {
      window.location.reload();
    } catch {}
  };

  return (
    <View
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        zIndex: 2000,
        transform: [{ translateX: -160 }],
        width: 320,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: "#ffffff",
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        shadowColor: "#000",
        shadowOpacity: 0.18,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 10,
      }}
    >
      <Ionicons name="sparkles" size={18} color="#59ABE3" />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: "#264348" }}>
        {t("update.newVersion", "New version available")}
      </Text>
      <Pressable
        onPress={reload}
        style={{ backgroundColor: "#59ABE3", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
          {t("update.reload", "Update")}
        </Text>
      </Pressable>
    </View>
  );
}

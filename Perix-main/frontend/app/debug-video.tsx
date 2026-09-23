import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AdaptiveVideo from "../components/AdaptiveVideo";
import { useAuth } from "../context/AuthContext";
import { getStories } from "../lib/api/stories";

const TEST_URL = "https://stream.mux.com/cIhnxNkoh5h6ZNWx9inLPAJ5RetNM01UyJdRpvxEkf900.m3u8";

export default function DebugVideoScreen() {
  const [log, setLog] = useState<string>("idle");
  const [key, setKey] = useState(0);
  const [storyInfo, setStoryInfo] = useState<string>("");
  const { sessionToken } = useAuth();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";

  useEffect(() => {
    (window as any).__PERIX_VIDEO_DEBUG = true;
    return () => {
      (window as any).__PERIX_VIDEO_DEBUG = false;
      if ((window as any).__PERIX_VIDEO_DEBUG_IV) {
        clearInterval((window as any).__PERIX_VIDEO_DEBUG_IV);
        (window as any).__PERIX_VIDEO_DEBUG_IV = null;
      }
    };
  }, []);

  useEffect(() => {
    setStoryInfo((s) => `browser=${ua}\n${s || ""}`);
  }, [ua]);

  useEffect(() => {
    if (!sessionToken) return;
    getStories(sessionToken)
      .then((groups) => {
        const lines: string[] = [];
        (groups || []).slice(0, 5).forEach((g: any, gi: number) => {
          (g.stories || []).forEach((s: any) => {
            lines.push(
              `g${gi} ${g.actor_id} | type=${s.media_type} status=${s.video_status} ` +
              `media_url=${s.media_url ? s.media_url.slice(0, 70) : "NULL"} ` +
              `mux_pid=${s.mux_playback_id || "NULL"} asset=${s.mux_asset_id || "NULL"}`
            );
          });
        });
        setStoryInfo(lines.join("\n") || "no story groups returned");
      })
      .catch((e: any) => setStoryInfo("ERR: " + (e?.message || JSON.stringify(e))));
  }, [sessionToken]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Video debug</Text>
      <View style={styles.videoBox}>
        <AdaptiveVideo
          key={key}
          uri={TEST_URL}
          autoPlay
          initialMuted
          resizeMode="contain"
          showMuteButton
          onPlay={() => setLog("PLAYING ✓")}
          style={{ width: "100%", height: 280 }}
        />
      </View>
      <Text style={styles.log}>{log}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => {
          setLog("retrying...");
          setKey((k) => k + 1);
        }}
      >
        <Text style={styles.btnText}>Retry</Text>
      </Pressable>
      <ScrollView style={{ marginTop: 16, maxHeight: 220 }}>
        <Text style={styles.storyInfo}>browser: {ua}</Text>
        <Text style={styles.storyInfo}>{storyInfo || "loading stories..."}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#fff", padding: 20, paddingTop: 60 },
  title: { fontSize: 18, fontWeight: "700", color: "#264348", marginBottom: 12 },
  videoBox: { borderRadius: 12, overflow: "hidden" },
  log: { fontSize: 14, color: "#1F4788", marginTop: 12, fontWeight: "600" },
  btn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#59ABE3",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnText: { color: "#fff", fontWeight: "700" },
  storyInfo: { fontSize: 12, color: "#264348", lineHeight: 18, fontFamily: "monospace" },
});

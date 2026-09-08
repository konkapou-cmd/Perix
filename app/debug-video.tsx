import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AdaptiveVideo from "../components/AdaptiveVideo";

const TEST_URL = "https://stream.mux.com/cIhnxNkoh5h6ZNWx9inLPAJ5RetNM01UyJdRpvxEkf900.m3u8";

export default function DebugVideoScreen() {
  const [log, setLog] = useState<string>("idle");
  const [key, setKey] = useState(0);

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
});

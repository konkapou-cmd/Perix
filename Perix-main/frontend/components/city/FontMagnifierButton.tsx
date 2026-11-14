import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  FONT_SCALE_STEPS,
  getStoredFontScale,
  setStoredFontScale,
  type FontScaleChoice,
} from "../../lib/fontScale";

/** Magnifier button + small popup (85/100/130). Applies instantly and
 *  globally (setStoredFontScale patches all text live) — desktop header
 *  and, later, the mobile map cluster share this one control. */
export default function FontMagnifierButton() {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState<FontScaleChoice>("100");
  React.useEffect(() => {
    let live = true;
    getStoredFontScale().then((c) => {
      if (live) setChoice(c);
    });
    return () => {
      live = false;
    };
  }, []);
  const pick = (c: FontScaleChoice) => {
    setChoice(c);
    setOpen(false);
    void setStoredFontScale(c);
  };
  return (
    <View style={styles.wrap} testID="font-magnifier">
      <Pressable
        testID="font-magnifier-toggle"
        accessibilityRole="button"
        accessibilityLabel={t("common.fontSize", "Font size")}
        onPress={() => setOpen((v) => !v)}
        style={styles.button}
        hitSlop={6}
      >
        <Ionicons name="search-outline" size={22} color="#064472" />
      </Pressable>
      {open && (
        <View style={styles.popup} testID="font-magnifier-popup">
          {FONT_SCALE_STEPS.map((c) => (
            <Pressable
              key={c}
              testID={`font-magnifier-option-${c}`}
              accessibilityRole="button"
              onPress={() => pick(c)}
              style={[styles.option, choice === c && styles.optionActive]}
            >
              <Text style={[styles.optionText, choice === c && styles.optionTextActive]}>
                {c === "100" ? t("common.fontSizeNormal", "100% · Normal") : `${c}%`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", alignItems: "center", justifyContent: "center" },
  button: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.85)", borderWidth: 1, borderColor: "#e5e7eb",
  },
  popup: {
    position: "absolute", top: 46, right: 0, backgroundColor: "#fff", borderRadius: 12,
    borderWidth: 1, borderColor: "#e5e7eb", paddingVertical: 4, minWidth: 150,
    ...Platform.select({ web: { boxShadow: "0 8px 24px rgba(6,68,114,0.18)" as any }, default: {} }),
  },
  option: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  optionActive: { backgroundColor: "#EAF5FF" },
  optionText: { fontSize: 14, color: "#064472", fontWeight: "600" },
  optionTextActive: { color: "#096BFF" },
});

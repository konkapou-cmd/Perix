import React, { useState } from "react";
import { ActivityIndicator, Image, ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import appI18n, { LANGUAGES, setStoredLanguage } from "../../i18n";
import "../../i18n/city";
import { COLORS } from "../../lib/designTokens";

const FLAGS: Record<string, ImageSourcePropType> = {
  en: require("../../assets/brand/flags/gb.png"), de: require("../../assets/brand/flags/de.png"),
  el: require("../../assets/brand/flags/gr.png"), es: require("../../assets/brand/flags/es.png"),
  sq: require("../../assets/brand/flags/al.png"), fr: require("../../assets/brand/flags/fr.png"),
  it: require("../../assets/brand/flags/it.png"), sr: require("../../assets/brand/flags/rs.png"),
  pl: require("../../assets/brand/flags/pl.png"), ru: require("../../assets/brand/flags/ru.png"),
};

export default function CityLanguagePicker() {
  const { t, i18n } = useTranslation("city");
  const current = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const changeLanguage = async (code: string) => {
    if (saving) return;
    setSaving(true); setError(false);
    await setStoredLanguage(code);
    // react-i18next exposes a render snapshot; validate against the shared
    // application instance after the existing async persistence completes.
    if ((appI18n.resolvedLanguage || appI18n.language || "").split("-")[0] === code) setOpen(false);
    else setError(true);
    setSaving(false);
  };
  return <>
    <Pressable testID="city-language-trigger" accessibilityRole="button" accessibilityLabel={`${t("ui.chooseLanguage")}: ${LANGUAGES.find(l => l.code === current)?.nativeName || current}`}
      accessibilityState={{ expanded: open }} onPress={() => { setError(false); setOpen(true); }} style={styles.trigger}>
      <Image source={FLAGS[current] || FLAGS.en} resizeMode="cover" style={styles.flag} />
      <View style={styles.chevron}><Ionicons name="chevron-down" size={10} color="#064472" /></View>
    </Pressable>
    <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.dialog}>
        <View style={styles.heading}><Text style={styles.title}>{t("ui.chooseLanguage")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t("ui.close")} onPress={() => setOpen(false)} style={styles.close}><Ionicons name="close" size={22} color="#064472" /></Pressable>
        </View>
        {error && <Text accessibilityLiveRegion="polite">{t("ui.languageError")}</Text>}
        {saving && <ActivityIndicator color={COLORS.pinHotel} />}
        <ScrollView>{LANGUAGES.map(language => <Pressable key={language.code} testID={`city-language-${language.code}`}
          accessibilityRole="button" accessibilityLabel={language.nativeName} accessibilityState={{ selected: current === language.code, disabled: saving }} disabled={saving}
          style={[styles.option, current === language.code && styles.selected]} onPress={() => { void changeLanguage(language.code); }}>
          <Image source={FLAGS[language.code]} resizeMode="cover" style={styles.optionFlag} /><Text style={styles.name}>{language.nativeName}</Text>
          {current === language.code && <Ionicons name="checkmark" size={20} color="#064472" />}
        </Pressable>)}</ScrollView>
      </View></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: COLORS.pinHotel, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  flag: { width: 32, height: 32, borderRadius: 16 }, chevron: { position: "absolute", right: -1, bottom: 0, borderRadius: 7, backgroundColor: "#fff", padding: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", alignItems: "center", justifyContent: "center", padding: 20 },
  dialog: { width: "100%", maxWidth: 360, maxHeight: "82%", padding: 16, backgroundColor: "#fff", borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.pinHotel },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, title: { color: "#064472", fontSize: 18, fontWeight: "700" }, close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  option: { minHeight: 48, flexDirection: "row", alignItems: "center", padding: 8, gap: 12, borderRadius: 12 }, selected: { backgroundColor: "#F0F8FE" },
  optionFlag: { width: 28, height: 28, borderRadius: 14 }, name: { flex: 1, color: "#064472", fontSize: 16 },
});

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { MobilityMode } from "../../lib/city/mobilityControls";

/** Shared presentation only: fleet reads and taxi actions stay with each screen. */
export default function MobilityModeControls({ value, onChange }: { value: MobilityMode; onChange: (mode: MobilityMode) => void }) {
  const { t } = useTranslation();
  return <View style={styles.row} testID="mobility-mode-controls">
    {([['all', 'apps', 'All'], ['bus', 'bus', 'Bus'], ['tram', 'train', 'Tram'], ['subway', 'subway', 'U-Bahn'], ['s-bahn', 'train', 'S-Bahn'], ['rail', 'train', 'Regional'], ['ferry', 'boat', 'Ferry'], ['taxi', 'car', 'Taxi']] as const).map(([mode, icon, fallback]) => {
      const active = value === mode;
      return <Pressable key={mode} accessibilityRole="button" accessibilityState={{ selected: active }}
        onPress={() => onChange(mode)} style={[styles.option, active && styles.active]}>
        <Ionicons name={icon} size={16} color={active ? '#fff' : '#264348'} />
        <Text style={[styles.text, active && styles.activeText]}>{t(`mobility.${mode}`, fallback)}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#eef2f3' },
  active: { backgroundColor: '#264348' }, text: { color: '#264348', fontWeight: '600', fontSize: 13 }, activeText: { color: '#fff' },
});

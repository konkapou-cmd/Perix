import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
// Resolves to LocationPickerMap.web.tsx on web and LocationPickerMap.native.tsx on native
import LocationPickerMap from "./LocationPickerMap";
import { reverseGeocodeLabel } from "../lib/reverseGeocode";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: { latitude: number; longitude: number; address: string }) => void;
  initialLocation?: { latitude: number; longitude: number } | null;
};

export default function LocationPickerModal({
  visible,
  onClose,
  onSelect,
  initialLocation,
}: Props) {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [selected, setSelected] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(
    initialLocation
      ? { latitude: initialLocation.latitude, longitude: initialLocation.longitude }
      : null
  );
  const [resolving, setResolving] = useState(false);
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveSeqRef = useRef(0);

  useEffect(() => {
    if (visible && initialLocation) {
      setSelected({
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
      });
    }
  }, [visible, initialLocation]);

  // When the pin moves to new coordinates without a text address, reverse
  // geocode a friendly label like "Next to Egnatia Street" so the location
  // field looks complete.
  useEffect(() => {
    if (!selected || selected.address) return;
    const seq = ++resolveSeqRef.current;
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    resolveTimerRef.current = setTimeout(async () => {
      if (seq !== resolveSeqRef.current) return;
      setResolving(true);
      const label = await reverseGeocodeLabel(
        selected.latitude,
        selected.longitude,
        sessionToken
      );
      if (seq !== resolveSeqRef.current) return;
      setResolving(false);
      if (label) {
        setSelected((prev) =>
          prev && prev.latitude === selected.latitude && prev.longitude === selected.longitude
            ? { ...prev, address: label }
            : prev
        );
      }
    }, 600);
    return () => {
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    };
  }, [selected?.latitude, selected?.longitude]);

  const handleConfirm = () => {
    if (selected) {
      onSelect({
        latitude: selected.latitude,
        longitude: selected.longitude,
        address: selected.address || "",
      });
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
          <Text style={styles.title}>{t("map.pickLocation", "Pick Location")}</Text>
          <Pressable
            onPress={handleConfirm}
            disabled={!selected}
            style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
          >
            <Text style={[styles.confirmText, !selected && styles.confirmTextDisabled]}>
              {t("common.confirm", "Confirm")}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.selectedRow}>
            <Ionicons name="location-outline" size={16} color="#264348" />
            {resolving ? (
              <ActivityIndicator size="small" color="#59ABE3" />
            ) : (
              <Text style={styles.selectedText} numberOfLines={2}>
                {selected?.address
                  || t("map.dragPinHint", "Drag the pin to set your exact location")}
              </Text>
            )}
          </View>

          <LocationPickerMap
            location={selected}
            onLocationChange={(loc) =>
              setSelected({
                latitude: loc.latitude,
                longitude: loc.longitude,
                address: (loc as any).address || undefined,
              })
            }
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingVertical: 10,
  },
  selectedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#264348",
  },
  confirmBtn: {
    backgroundColor: "#000000",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: "#e5e7eb",
  },
  confirmText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  confirmTextDisabled: {
    color: "#9ca3af",
  },
});

import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import LocationPickerMap from "./LocationPickerMap.native";
import LocationPickerMapWeb from "./LocationPickerMap.web";

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
  const [selected, setSelected] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(
    initialLocation
      ? { latitude: initialLocation.latitude, longitude: initialLocation.longitude }
      : null
  );

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

  const MapComponent = Platform.OS === "web" ? LocationPickerMapWeb : LocationPickerMap;

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
          <Text style={styles.title}>Pick Location</Text>
          <Pressable
            onPress={handleConfirm}
            disabled={!selected}
            style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
          >
            <Text style={[styles.confirmText, !selected && styles.confirmTextDisabled]}>
              Confirm
            </Text>
          </Pressable>
        </View>

        <MapComponent
          location={selected}
          onLocationChange={(loc) => setSelected(loc)}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
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

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type Location = {
  latitude: number;
  longitude: number;
  address: string;
};

type Props = {
  location: Location | null;
  onSetLocation: () => void;
};

export default function LocationSection({ location, onSetLocation }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.cardTitle}>{t("business.businessLocation")}</Text>
        <Pressable style={styles.secondaryButton} onPress={onSetLocation}>
          <Text style={styles.secondaryButtonText}>{t("business.setLocation")}</Text>
        </Pressable>
      </View>
      {location ? (
        <View style={styles.locationInfo}>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={20} color="#4c6fff" />
            <Text style={styles.locationText}>
              {location.address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
            </Text>
          </View>
          <Text style={styles.locationHint}>{t("business.locationHint")}</Text>
        </View>
      ) : (
        <Text style={styles.emptyText}>{t("business.noLocation")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
    fontSize: 13,
  },
  locationInfo: {
    paddingVertical: 8,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationText: {
    flex: 1,
    marginLeft: 8,
    color: "#374151",
    fontSize: 14,
  },
  locationHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});

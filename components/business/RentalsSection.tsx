import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Rental } from "../../lib/api";
import { COLORS } from "../../lib/designTokens";

type Props = {
  rentals: Rental[];
  readOnly?: boolean;
  onAddRental?: () => void;
  onDeleteRental?: (rentalId: string) => void;
};

export default function RentalsSection({ rentals, readOnly = false, onAddRental, onDeleteRental }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t("rentals.rentals", "Rentals")}</Text>
        {!readOnly && onAddRental && (
          <Pressable style={styles.addButton} onPress={onAddRental}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>{t("rentals.postRental", "Post Rental")}</Text>
          </Pressable>
        )}
      </View>
      {rentals.length === 0 ? (
        <Text style={styles.emptyText}>{t("rentals.noRentals", "No rentals posted yet")}</Text>
      ) : (
        rentals.map((rental) => (
          <Pressable
            key={rental.rental_id}
            style={styles.eventRow}
            onPress={() => router.push(`/rental/${rental.rental_id}` as any)}
          >
            {rental.cover_image ? (
              <Image source={{ uri: rental.cover_image }} style={styles.rentalCoverThumb} />
            ) : rental.gallery_images && rental.gallery_images.length > 0 ? (
              <Image source={{ uri: rental.gallery_images[0] }} style={styles.rentalCoverThumb} />
            ) : (
              <View style={[styles.rentalCoverThumb, styles.rentalCoverPlaceholder]}>
                <Ionicons name="home" size={16} color="#9ca3af" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.eventTitle} numberOfLines={1}>{rental.title}</Text>
              <Text style={styles.eventMeta} numberOfLines={1}>
                {rental.rent_price ? rental.rent_price : ""}
                {rental.rooms_size ? ` · ${rental.rooms_size}` : ""}
              </Text>
              {rental.address ? (
                <Text style={styles.eventSubMeta} numberOfLines={1}>{rental.address}</Text>
              ) : null}
            </View>
            {!readOnly && onDeleteRental && (
              <Pressable style={styles.iconButton} onPress={() => onDeleteRental(rental.rental_id)}>
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </Pressable>
            )}
          </Pressable>
        ))
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.primary,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 24,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rentalCoverThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  rentalCoverPlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  eventMeta: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  eventSubMeta: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 1,
  },
  iconButton: {
    padding: 8,
  },
});

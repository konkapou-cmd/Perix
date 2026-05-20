import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Rental } from "../../lib/api";
import { FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";

type Props = {
  rentals: Rental[];
  readOnly?: boolean;
  onAddRental?: () => void;
  onEditRental?: (rental: Rental) => void;
  onDeleteRental?: (rentalId: string) => void;
};

export default function RentalsSection({ rentals, readOnly = false, onAddRental, onEditRental, onDeleteRental }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("rentals.rentals", "Rentals")}</Text>
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
              <Image source={{ uri: rental.cover_image }} style={styles.thumb} />
            ) : rental.gallery_images && rental.gallery_images.length > 0 ? (
              <Image source={{ uri: rental.gallery_images[0] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="home" size={16} color="#9ca3af" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.eventTitle} numberOfLines={1}>{rental.title}</Text>
              <Text style={styles.eventMeta} numberOfLines={1}>
                {rental.rent_price ? rental.rent_price : ""}
                {rental.rooms_size ? ` · ${rental.rooms_size}` : ""}
              </Text>
            </View>
            {!readOnly && onDeleteRental && (
              <View style={{ flexDirection: "row", gap: 4 }}>
                {onEditRental && (
                  <Pressable style={styles.iconBtn} onPress={() => onEditRental(rental)}>
                    <Ionicons name="create-outline" size={18} color="#111827" />
                  </Pressable>
                )}
                <Pressable style={styles.iconBtn} onPress={() => onDeleteRental(rental.rental_id)}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </Pressable>
              </View>
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
  cardTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#111827",
    marginBottom: 12,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#111827",
  },
  eventMeta: {
    fontSize: FONT_SIZES.small,
    color: "#9ca3af",
    marginTop: 2,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: {
    padding: 8,
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});

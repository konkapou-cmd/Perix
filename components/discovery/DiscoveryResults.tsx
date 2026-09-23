import { FlatList, Pressable, Text, Image, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { Listing } from "../../lib/api/listings";

type Props = {
  listings: Listing[];
  onPressItem: (listing: Listing) => void;
  ListHeaderComponent?: React.ReactElement;
};

export default function DiscoveryResults({ listings, onPressItem, ListHeaderComponent }: Props) {
  const { t } = useTranslation();

  const renderItem = ({ item }: { item: Listing }) => {
    const img = item.cover_image_url || item.image_urls?.[0] || item.gallery_images?.[0];
    const addressLabel =
      item.location_visibility === "approximate"
        ? item.public_location_label || t("marketplace.approximateLocation", "Ungefährer Standort")
        : item.address;

    return (
      <Pressable style={styles.card} onPress={() => onPressItem(item)}>
        {img ? (
          <Image source={{ uri: img }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="image-outline" size={32} color={COLORS.textDisabled} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.price ? (
            <Text style={styles.price}>{item.price}</Text>
          ) : null}
          {addressLabel ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.address} numberOfLines={1}>
                {addressLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <FlatList
      data={listings}
      renderItem={renderItem}
      keyExtractor={(item) => item.listing_id}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.grid}
      ListHeaderComponent={ListHeaderComponent}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: SPACING.std,
    paddingTop: SPACING.small,
    paddingBottom: 100,
  },
  row: {
    gap: SPACING.small,
    marginBottom: SPACING.small,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.backgroundPage,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    padding: SPACING.small,
  },
  title: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  price: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: "700",
    color: COLORS.success,
    marginTop: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  address: {
    fontSize: 11,
    color: COLORS.textMuted,
    flex: 1,
  },
});

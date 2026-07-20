import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { entityRoutes, pushEntityRoute, getRentalNavigationId, showInvalidEntityAlert } from "../lib/navigation/entityRoutes";

import { useAuth } from "../context/AuthContext";
import { getMyRentals, Rental } from "../lib/api";
import {
  COLORS,
  SPACING,
  FONT_SIZES,
  FONT_WEIGHTS,
  BORDER_RADIUS,
} from "../lib/designTokens";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";

export default function MyRentalsScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [rentals, setRentals] = useState<Rental[]>([]);

  useEffect(() => {
    loadRentals();
  }, [sessionToken]);

  const loadRentals = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const data = await getMyRentals(sessionToken);
      setRentals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load my rentals:", error);
    }
    setLoading(false);
  };

  const translatePropertyType = (slug: string) => {
    const map: Record<string, string> = {
      apartment: t("categories.apartments", "Apartments"),
      house: t("categories.houses", "Houses"),
      studio: t("categories.studios", "Studios"),
      room: t("categories.rooms", "Rooms"),
    };
    return map[slug] || slug;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.title}>{t("rentals.myRentals", "My Rentals")}</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.textPrimary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.title}>{t("rentals.myRentals", "My Rentals")}</Text>
      </View>

      {rentals.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="home-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>{t("rentals.noRentals")}</Text>
        </View>
      ) : (
        <FlatList
          data={rentals}
          keyExtractor={(item) => item.rental_id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.rentalCard}
              onPress={() => pushEntityRoute(router, entityRoutes.rental(getRentalNavigationId(item as any) as any), () => showInvalidEntityAlert(t))}
            >
              {item.cover_image ? (
                <Image source={{ uri: item.cover_image }} style={styles.rentalImage} />
              ) : item.gallery_images && item.gallery_images[0] ? (
                <Image source={{ uri: item.gallery_images[0] }} style={styles.rentalImage} />
              ) : (
                <View style={[styles.rentalImage, styles.rentalImagePlaceholder]}>
                  <Ionicons name="home" size={24} color="#9ca3af" />
                </View>
              )}
              <View style={styles.rentalInfo}>
                <Text style={styles.rentalTitle} numberOfLines={1}>{item.title}</Text>
                {item.rent_price && (
                  <Text style={styles.rentalPrice}>{item.rent_price}</Text>
                )}
                {item.address && (
                  <Text style={styles.rentalAddress} numberOfLines={1}>{item.address}</Text>
                )}
                <View style={styles.badges}>
                  {item.property_type && (
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeBadgeText}>{translatePropertyType(item.property_type)}</Text>
                    </View>
                  )}
                  {item.is_active === false && (
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>{t("common.inactive", "Inactive")}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
  },
  rentalCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  rentalImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  rentalImagePlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  rentalInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rentalTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  rentalPrice: {
    fontSize: 14,
    color: "#f59e0b",
    fontWeight: "600",
    marginTop: 2,
  },
  rentalAddress: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  badges: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  typeBadge: {
    backgroundColor: "#d1fae5",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065f46",
  },
  inactiveBadge: {
    backgroundColor: "#fef2f2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactiveBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#991b1b",
  },
  deleteButton: {
    padding: 8,
  },
});

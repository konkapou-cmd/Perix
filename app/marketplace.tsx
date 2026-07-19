import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getListings, Listing } from "../lib/api/listings";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../lib/designTokens";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";
import { useAuth } from "../context/AuthContext";

type MarketTab = "items" | "homes";

export default function MarketplaceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { sessionToken } = useAuth();
  const [activeTab, setActiveTab] = useState<MarketTab>((tab === "homes" ? "homes" : "items"));
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const type = activeTab === "homes" ? "home_rental" : "product";
    setLoading(true);
    getListings(type)
      .then(setListings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  const renderItem = ({ item }: { item: Listing }) => {
    const img = item.cover_image_url || item.image_urls?.[0] || item.gallery_images?.[0];
    return (
      <Pressable
        style={styles.card}
        onPress={() => {
          if (activeTab === "homes") {
            router.push(`/rental/${item.listing_id}` as any);
          } else {
            router.push(`/listing/${item.listing_id}` as any);
          }
        }}
      >
        {img ? (
          <Image source={{ uri: img }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardPlaceholder]}>
            <Ionicons name={activeTab === "homes" ? "home" : "pricetag"} size={32} color="#9ca3af" />
          </View>
        )}
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.cardPrice}>{item.price ? `${item.price}` : t("marketplace.askForPrice", "Ask for price")}</Text>
          {item.address ? (
            <Text style={styles.cardAddress} numberOfLines={1}>
              <Ionicons name="location-outline" size={12} color="#9ca3af" /> {item.address}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{t("marketplace.title", "Marketplace")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === "items" && styles.tabActive]}
          onPress={() => setActiveTab("items")}
        >
          <Ionicons name="pricetag-outline" size={18} color={activeTab === "items" ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === "items" && styles.tabTextActive]}>
            {t("marketplace.items", "Items")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "homes" && styles.tabActive]}
          onPress={() => setActiveTab("homes")}
        >
          <Ionicons name="home-outline" size={18} color={activeTab === "homes" ? COLORS.primary : COLORS.textMuted} />
          <Text style={[styles.tabText, activeTab === "homes" && styles.tabTextActive]}>
            {t("marketplace.homes", "Homes")}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.listing_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name={activeTab === "homes" ? "home-outline" : "pricetag-outline"} size={48} color="#9ca3af" />
              <Text style={styles.emptyText}>
                {activeTab === "homes"
                  ? t("marketplace.noHomes", "No homes listed yet")
                  : t("marketplace.noItems", "No items listed yet")}
              </Text>
            </View>
          }
          numColumns={2}
          columnWrapperStyle={styles.row}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACING.std, paddingTop: SPACING.small, paddingBottom: SPACING.small,
    backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: FONT_SIZES.h3, fontWeight: "700", color: COLORS.textPrimary, flex: 1, marginLeft: SPACING.small },
  tabRow: { flexDirection: "row", padding: SPACING.small, gap: SPACING.small, backgroundColor: COLORS.background },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.backgroundPage,
  },
  tabActive: { backgroundColor: COLORS.primary + "15" },
  tabText: { fontSize: 14, fontWeight: "600", color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary },
  list: { padding: SPACING.small, paddingBottom: 60 },
  row: { gap: SPACING.small },
  card: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden", marginBottom: SPACING.small,
  },
  cardImage: { width: "100%", height: 140, backgroundColor: "#f3f4f6" },
  cardPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardInfo: { padding: SPACING.small, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: COLORS.textPrimary },
  cardPrice: { fontSize: 13, fontWeight: "700", color: COLORS.success },
  cardAddress: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  emptyText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
});

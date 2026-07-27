import { useEffect, useState } from "react";
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { getMyListings, updateListing, deleteListing, Listing, ListingType } from "../lib/api/listings";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../lib/designTokens";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";
import ListingModal from "../components/user/ListingModal";

export default function MyListingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken } = useAuth();
  const [tab, setTab] = useState<ListingType>("product");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);

  const load = () => {
    if (!sessionToken) { setLoading(false); return; }
    setLoading(true);
    getMyListings(sessionToken, tab)
      .then((items) => setListings(items.filter((i) => i.is_active)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tab, sessionToken]);

  const handlePublish = async (listing: Listing) => {
    await updateListing(sessionToken!, listing.listing_id, { status: "published" });
    load();
  };

  const handleMarkSold = async (listing: Listing) => {
    const newStatus = tab === "product" ? "sold" : "rented";
    await updateListing(sessionToken!, listing.listing_id, { status: newStatus as any });
    load();
  };

  const handleDelete = (listing: Listing) => {
    Alert.alert(
      t("common.confirm", "Confirm"),
      t("common.deleteConfirm", "Are you sure?"),
      [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        { text: t("common.delete", "Delete"), style: "destructive", onPress: async () => {
          await deleteListing(sessionToken!, listing.listing_id);
          load();
        }},
      ],
    );
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      draft: { label: t("common.draft", "Entwurf"), color: COLORS.textMuted },
      published: { label: t("common.published", "Aktiv"), color: COLORS.success },
      sold: { label: t("common.sold", "Verkauft"), color: COLORS.primaryDark },
      rented: { label: t("common.rented", "Vermietet"), color: COLORS.primaryDark },
    };
    const info = map[status] || map.draft;
    return <View style={[styles.statusBadge, { backgroundColor: info.color + "20" }]}><Text style={[styles.statusText, { color: info.color }]}>{info.label}</Text></View>;
  };

  const renderItem = ({ item }: { item: Listing }) => (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        {item.price ? <Text style={styles.cardPrice}>{item.price}</Text> : null}
        <View style={styles.cardBadges}>
          {getStatusBadge(item.status)}
          <Text style={styles.cardType}>{tab === "product" ? t("marketplace.product", "Product") : t("marketplace.home", "Home")}</Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        {item.status === "draft" && (
          <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.success }]} onPress={() => handlePublish(item)}>
            <Text style={styles.actionBtnText}>{t("common.publish", "Publish")}</Text>
          </Pressable>
        )}
        {item.status === "published" && (
          <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.primaryDark }]} onPress={() => handleMarkSold(item)}>
            <Text style={styles.actionBtnText}>{tab === "product" ? t("marketplace.markAsSold", "Als verkauft markieren") : t("marketplace.markAsRented", "Als vermietet markieren")}</Text>
          </Pressable>
        )}
        {(item.status === "sold" || item.status === "rented") && (
          <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.success }]} onPress={() => handlePublish(item)}>
            <Text style={styles.actionBtnText}>{t("marketplace.relist", "Erneut einstellen")}</Text>
          </Pressable>
        )}
        <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.primaryLight }]} onPress={() => setEditingListing(item)}>
          <Ionicons name="create-outline" size={16} color={COLORS.primary} />
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: COLORS.errorBg }]} onPress={() => handleDelete(item)}>
          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{t("marketplace.myListings", "My Listings")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.tabRow}>
        <Pressable style={[styles.tab, tab === "product" && styles.tabActive]} onPress={() => setTab("product")}>
          <Text style={[styles.tabText, tab === "product" && styles.tabTextActive]}>{t("marketplace.items", "Items")}</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === "home_rental" && styles.tabActive]} onPress={() => setTab("home_rental")}>
          <Text style={[styles.tabText, tab === "home_rental" && styles.tabTextActive]}>{t("marketplace.homes", "Homes")}</Text>
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
              <Ionicons name={tab === "product" ? "pricetag-outline" : "home-outline"} size={48} color="#9ca3af" />
              <Text style={styles.emptyText}>{t("marketplace.noListingsYet", "No listings yet")}</Text>
            </View>
          }
        />
      )}

      <ListingModal
        visible={!!editingListing}
        listingType={editingListing?.listing_type || "product"}
        editingListing={editingListing}
        sessionToken={sessionToken || ""}
        onClose={() => setEditingListing(null)}
        onSave={load}
      />
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
    flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.backgroundPage,
  },
  tabActive: { backgroundColor: COLORS.primary + "15" },
  tabText: { fontSize: 14, fontWeight: "600", color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary },
  list: { padding: SPACING.small },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
  card: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.std, marginBottom: SPACING.small,
  },
  cardInfo: { gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: COLORS.textPrimary },
  cardPrice: { fontSize: 14, fontWeight: "700", color: COLORS.success },
  cardBadges: { flexDirection: "row", alignItems: "center", gap: SPACING.small, marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  statusText: { fontSize: 11, fontWeight: "600" },
  cardType: { fontSize: 11, color: COLORS.textMuted },
  cardActions: { flexDirection: "row", gap: SPACING.small, marginTop: SPACING.small },
  actionBtn: {
    paddingHorizontal: SPACING.small, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.md, alignItems: "center", justifyContent: "center",
  },
  actionBtnText: { fontSize: 12, fontWeight: "600", color: "#fff" },
});

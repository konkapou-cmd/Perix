import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getListing, Listing } from "../../lib/api/listings";
import { toggleSaved, checkSaved } from "../../lib/api/saved";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { HeaderBackButton } from "../../components/shared/HeaderBackButton";
import AdaptiveImage from "../../components/AdaptiveImage";

const CONDITIONS: Record<string, string> = {
  new: "New", like_new: "Like New", good: "Good", used: "Used",
};

export default function ListingDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sessionToken, user } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getListing(id)
      .then((d) => { setListing(d); return d; })
      .then((d) => {
        if (sessionToken) {
          checkSaved(sessionToken, "listing", d.listing_id).then((r) => setIsSaved(r.is_saved)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, sessionToken]);

  const handleToggleSave = async () => {
    if (!sessionToken || !listing) return;
    setSaving(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "listing", listing.listing_id);
      setIsSaved(is_saved);
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("common.pleaseTryAgain", "Please try again"));
    }
    setSaving(false);
  };

  const handleShare = async () => {
    if (!listing) return;
    await Share.share({ message: `${listing.title} — ${listing.price || ""} on Perix` });
  };

  const handleContact = () => {
    if (!listing || !sessionToken) {
      Alert.alert(t("common.loginRequired", "Login Required"), t("common.loginToContact", "Please log in to contact the seller."));
      return;
    }
    router.push({ pathname: "/(tabs)/messages" as any, params: { id: listing.owner_id, name: "Seller" } as any });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t("listing.notFound", "Listing not found")}</Text>
          <View style={{ width: 44 }} />
        </View>
      </SafeAreaView>
    );
  }

  const img = listing.cover_image_url || listing.image_urls?.[0] || listing.gallery_images?.[0];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {img ? (
          <AdaptiveImage uri={img} ratio={4 / 3} maxHeight={300} borderRadius={12} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]}>
            <Ionicons name="pricetag-outline" size={48} color="#9ca3af" />
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.title}>{listing.title}</Text>
          {listing.price ? (
            <Text style={styles.price}>{listing.price}</Text>
          ) : (
            <Text style={styles.askPrice}>{t("marketplace.askForPrice", "Ask for price")}</Text>
          )}

          {listing.description ? (
            <Text style={styles.description}>{listing.description}</Text>
          ) : null}

          <View style={styles.tags}>
            {listing.condition ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{CONDITIONS[listing.condition] || listing.condition}</Text>
              </View>
            ) : null}
            {listing.brand ? (
              <View style={styles.tag}>
                <Ionicons name="bookmark-outline" size={12} color={COLORS.primary} />
                <Text style={styles.tagText}>{listing.brand}</Text>
              </View>
            ) : null}
            {listing.delivery_method ? (
              <View style={styles.tag}>
                <Ionicons name="cube-outline" size={12} color={COLORS.primary} />
                <Text style={styles.tagText}>{listing.delivery_method}</Text>
              </View>
            ) : null}
          </View>

          {listing.address ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.textMuted} />
              <Text style={styles.addressText}>{listing.address}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.contactBtn} onPress={handleContact}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            <Text style={styles.contactText}>{t("common.contact", "Contact Seller")}</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={22} color={COLORS.textPrimary} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={handleToggleSave} disabled={saving}>
            <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={22} color={isSaved ? COLORS.gold : COLORS.textPrimary} />
          </Pressable>
        </View>
      </ScrollView>
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
  headerTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary, flex: 1, marginLeft: SPACING.small },
  body: { padding: SPACING.std, paddingBottom: 60 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", borderRadius: BORDER_RADIUS.lg, backgroundColor: "#f3f4f6" },
  coverPlaceholder: { height: 240, alignItems: "center", justifyContent: "center" },
  infoCard: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg, padding: SPACING.std, marginTop: SPACING.std },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary },
  price: { fontSize: 22, fontWeight: "800", color: COLORS.success, marginTop: SPACING.small },
  askPrice: { fontSize: 16, color: COLORS.textMuted, marginTop: SPACING.small, fontStyle: "italic" },
  description: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.small, lineHeight: 22 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginTop: SPACING.small },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.small },
  addressText: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, flex: 1 },
  actions: {
    flexDirection: "row", alignItems: "center", gap: SPACING.small,
    marginTop: SPACING.std, paddingTop: SPACING.small,
  },
  contactBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.primaryDark, borderRadius: BORDER_RADIUS.md,
    paddingVertical: 14,
  },
  contactText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.background,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border,
  },
});

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
import { ContentHero, ContentGallery } from "../../components/shared";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import { buildMediaItems } from "../../lib/api/mediaUtils";
import { normalizeId } from "../../lib/navigation/entityRoutes";
import { formatPrice } from "../../lib/serviceFormat";

export default function ListingDetailScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = normalizeId(rawId);
  const router = useRouter();
  const { sessionToken, user } = useAuth();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showVideoCover, setShowVideoCover] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);

  const hasBothCoverAndVideo = !!(listing?.cover_image_url && listing?.video_url);
  const effectiveVideoCover = hasBothCoverAndVideo ? showVideoCover : (!listing?.cover_image_url && !!listing?.video_url);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
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
    if (!sessionToken) {
      Alert.alert(t("common.loginRequired", "Login Required"), t("common.loginToSave", "Please log in to save this listing."), [
        { text: t("common.cancel", "Cancel"), style: "cancel" },
        { text: t("auth.login", "Login"), onPress: () => router.push("/login") },
      ]);
      return;
    }
    if (!listing) return;
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
    router.push({ pathname: `/messages/${listing.owner_id}` as any, params: { name: listing.business_name || listing.seller_name || t("marketplace.seller", "Anbieter"), entityType: "user" } as any });
  };

  if (!id) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
          <Text style={{ fontSize: 16, color: COLORS.textMuted, marginTop: SPACING.std }}>
            {t("listing.invalid", "This listing cannot be opened.")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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

  const allMediaItems: MediaItem[] = listing ? buildMediaItems({
    video_url: listing.video_url,
    cover_image_url: listing.cover_image_url,
    image_urls: listing.image_urls,
    gallery_images: listing.gallery_images,
    gallery_videos: listing.gallery_videos,
    mux_thumbnail_url: listing.mux_thumbnail_url,
    video_status: listing.video_status,
  }) : [];

  const muxFallback = listing?.video_url && !listing?.mux_thumbnail_url
    ? listing.video_url.replace(/stream\.mux\.com\/([a-zA-Z0-9]+).*/, (_: string, id: string) => `https://image.mux.com/${id}/thumbnail.jpg`)
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle} numberOfLines={1}>{listing.title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <ContentHero
            coverImageUrl={listing.cover_image_url}
            videoUrl={listing.video_url}
            muxThumbnailUrl={listing.mux_thumbnail_url || muxFallback}
            videoStatus={listing.video_status}
            isCoverVideo={effectiveVideoCover}
            coverFocalPoint={listing.cover_focal_point}
            imageUrls={listing.image_urls}
            title={listing.title}
            badges={[
              listing.price ? { icon: "pricetag", text: formatPrice(listing.price) } : null,
              listing.listing_type === "home_rental" ? { icon: "home", text: t("marketplace.home", "Home") } : { icon: "pricetag", text: t("marketplace.product", "Product") },
              listing.condition ? { icon: "star", text: listing.condition } : null,
            ].filter(Boolean) as any}
            subtitle={{
              text: listing.business_name || listing.seller_name || "",
              icon: listing.seller_type === "business" ? "storefront-outline" : "person-outline",
              avatarUrl: listing.seller_avatar || undefined,
              onPress: listing.seller_id ? () => router.push(`/user/${listing.seller_id}` as any) : undefined,
            }}
            mediaItems={allMediaItems}
            onMediaPress={(idx) => {
              setViewerMedia(allMediaItems);
              setViewerIndex(idx);
              setViewerOpen(true);
            }}
          />
          {hasBothCoverAndVideo && (
            <Pressable
              style={styles.coverToggle}
              onPress={() => setShowVideoCover((v) => !v)}
            >
              <Ionicons
                name={showVideoCover ? "image-outline" : "videocam-outline"}
                size={18}
                color="#fff"
              />
            </Pressable>
          )}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.title}>{listing.title}</Text>
          {listing.price ? (
             <Text style={styles.price}>{formatPrice(listing.price)}</Text>
          ) : (
            <Text style={styles.askPrice}>{t("marketplace.askForPrice", "Ρωτήστε για τιμή")}</Text>
          )}

          {listing.description ? (
            <Text style={styles.description}>{listing.description}</Text>
          ) : null}

          {(listing.business_name || listing.seller_name) && (
            <Pressable
              style={styles.sellerRow}
              onPress={() => {
                const sid = listing.seller_id || listing.owner_id;
                if (sid) router.push(`/user/${sid}` as any);
              }}
            >
              {listing.seller_avatar ? (
                <Image source={{ uri: listing.seller_avatar }} style={styles.sellerAvatar} />
              ) : (
                <Ionicons name={listing.seller_type === "business" ? "storefront-outline" : "person-outline"} size={16} color={COLORS.primary} />
              )}
              <Text style={styles.sellerText}>{listing.business_name || listing.seller_name}</Text>
            </Pressable>
          )}

          <View style={styles.tags}>
                {listing.condition ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{t(`marketplace.${listing.condition}`, listing.condition)}</Text>
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

          {listing.listing_type === "home_rental" && (
            <View style={styles.homeDetails}>
              {listing.property_type ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="home-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.homeDetailText}>{t(`rentals.${listing.property_type}`, listing.property_type)}</Text>
                </View>
              ) : null}
              {listing.bedrooms ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="bed-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.homeDetailText}>{listing.bedrooms} {t("rentals.bedrooms", "Bedrooms")}</Text>
                </View>
              ) : null}
              {listing.bathrooms ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="water-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.homeDetailText}>{listing.bathrooms} {t("rentals.bathrooms", "Bathrooms")}</Text>
                </View>
              ) : null}
              {listing.size_sqm ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="resize-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.homeDetailText}>{listing.size_sqm} m²</Text>
                </View>
              ) : null}
              {listing.furnished ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                  <Text style={[styles.homeDetailText, { color: COLORS.success }]}>{t("services.furnished", "Furnished")}</Text>
                </View>
              ) : null}
              {listing.available_from ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.homeDetailText}>{t("services.availableFrom", "Available from")}: {listing.available_from.split("-").reverse().join("-")}</Text>
                </View>
              ) : null}
              {listing.lease_duration ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="time-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.homeDetailText}>{t("services.leaseDuration", "Lease Duration")}: {listing.lease_duration}</Text>
                </View>
              ) : null}
              {listing.deposit ? (
                <View style={styles.homeDetailItem}>
                  <Ionicons name="wallet-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.homeDetailText}>{t("rentals.deposit", "Deposit")}: {listing.deposit}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {allMediaItems.length > 0 && (
          <View style={{ marginHorizontal: -SPACING.std }}>
            <ContentGallery mediaItems={allMediaItems} title={t("listing.gallery", "Γκαλερί")} />
          </View>
        )}

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

      <LazyMediaViewer
        visible={viewerOpen}
        media={viewerMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
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
  headerTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.textPrimary, flex: 1, marginLeft: SPACING.small },
  body: { padding: SPACING.std, paddingBottom: 60 },
  heroWrap: { position: "relative" },
  coverToggle: {
    position: "absolute",
    bottom: 70,
    right: 12,
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  sellerRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: SPACING.small, paddingVertical: SPACING.tiny,
  },
  sellerAvatar: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  sellerText: {
    fontSize: FONT_SIZES.bodySmall, fontWeight: "600",
    color: COLORS.primary,
  },
  homeDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.small,
    marginTop: SPACING.small,
    paddingTop: SPACING.small,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  homeDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primaryLight + "50",
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  homeDetailText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
});

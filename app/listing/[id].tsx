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
import { ContentHero, ContentGallery, ContentMap } from "../../components/shared";
import { DetailFacts, DetailFact } from "../../components/shared/DetailFacts";
import { BottomCTA } from "../../components/shared/BottomCTA";
import { openInMaps } from "../../lib/utils/openMapUrl";
import { getCategoryConfig } from "../../lib/marketplace/marketplaceTaxonomy";
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
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);

  const effectiveVideoCover = listing ? (!listing.cover_image_url && !!listing.video_url) : false;

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
          <ActivityIndicator size="large" color="#264348" />
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
            hideBack
            flush
            badges={[
              listing.price ? { icon: "pricetag", text: formatPrice(listing.price), color: COLORS.success } : null,
              listing.listing_type === "home_rental" ? { icon: "home", text: t("marketplace.home", "Home"), color: COLORS.success } : { icon: "pricetag", text: t("marketplace.product", "Product"), color: COLORS.success },
              listing.condition ? { icon: "star", text: t(`listing.condition.${listing.condition}`, listing.condition), color: COLORS.success } : null,
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
        </View>

        <DetailFacts>
          <DetailFact
            icon="pricetag"
            label={t("listing.price") || "Preis"}
            value={listing.price ? formatPrice(listing.price) : t("marketplace.askForPrice", "Preis auf Anfrage")}
            accentColor={COLORS.success}
          />
          {listing.condition ? (
            <DetailFact
              icon="star"
              label={t("listing.conditionTitle") || "Zustand"}
              value={t(`listing.condition.${listing.condition}`, listing.condition)}
              accentColor={COLORS.success}
            />
          ) : null}
          {listing.category ? (
            <DetailFact
              icon="grid"
              label={t("marketplace.category") || "Kategorie"}
              value={(() => {
                const cfg = getCategoryConfig(listing.category!);
                const sub = listing.subcategory ? cfg?.subcategories.find((s) => s.key === listing.subcategory) : null;
                const catLabel = cfg ? t(cfg.labelKey, cfg.fallback) : listing.category;
                return sub ? `${catLabel} · ${t(sub.labelKey, sub.fallback)}` : catLabel;
              })()}
              accentColor={COLORS.success}
            />
          ) : null}
          {listing.brand ? (
            <DetailFact
              icon="bookmark-outline"
              label={t("listing.brand") || "Marke"}
              value={listing.brand}
              accentColor={COLORS.success}
            />
          ) : null}
          {listing.delivery_method ? (
            <DetailFact
              icon="cube-outline"
              label={t("marketplace.delivery") || "Lieferung"}
              value={t(`marketplace.${listing.delivery_method}`, listing.delivery_method)}
              accentColor={COLORS.success}
            />
          ) : null}
          {(listing.business_name || listing.seller_name) ? (
            <DetailFact
              icon={listing.seller_type === "business" ? "storefront-outline" : "person-outline"}
              label={t("marketplace.seller") || "Verkäufer"}
              value={listing.business_name || listing.seller_name || ""}
              accentColor={COLORS.success}
              onPress={() => {
                const sid = listing.seller_id || listing.owner_id;
                if (sid) router.push(`/user/${sid}` as any);
              }}
            />
          ) : null}
          {listing.address ? (
            <DetailFact
              icon="location-outline"
              label={t("listing.address") || "Ort"}
              value={listing.address}
              accentColor={COLORS.success}
              onPress={() => openInMaps({ latitude: listing.latitude ?? undefined, longitude: listing.longitude ?? undefined, address: listing.address || "" })}
            />
          ) : null}
          {listing.listing_type === "home_rental" && (
            <>
              {listing.property_type ? (
                <DetailFact
                  icon="home-outline"
                  label={t("rentals.propertyType") || "Art"}
                  value={t(`rentals.types.${listing.property_type}`, listing.property_type)}
                  accentColor={COLORS.success}
                />
              ) : null}
              {listing.bedrooms ? (
                <DetailFact
                  icon="bed-outline"
                  label={t("rentals.bedrooms") || "Zimmer"}
                  value={`${listing.bedrooms} ${t("rentals.bedrooms", "Bedrooms")}`}
                  accentColor={COLORS.success}
                />
              ) : null}
              {listing.bathrooms ? (
                <DetailFact
                  icon="water-outline"
                  label={t("rentals.bathrooms") || "Bäder"}
                  value={`${listing.bathrooms} ${t("rentals.bathrooms", "Bathrooms")}`}
                  accentColor={COLORS.success}
                />
              ) : null}
              {listing.size_sqm ? (
                <DetailFact
                  icon="resize-outline"
                  label={t("rentals.size") || "Größe"}
                  value={`${listing.size_sqm} m²`}
                  accentColor={COLORS.success}
                />
              ) : null}
              {listing.furnished ? (
                <DetailFact
                  icon="checkmark-circle-outline"
                  label={t("services.furnished") || "Möbliert"}
                  value={t("services.furnished", "Furnished")}
                  accentColor={COLORS.success}
                />
              ) : null}
              {listing.available_from ? (
                <DetailFact
                  icon="calendar-outline"
                  label={t("services.availableFrom") || "Verfügbar ab"}
                  value={listing.available_from.split("-").reverse().join("-")}
                  accentColor={COLORS.success}
                />
              ) : null}
              {listing.lease_duration ? (
                <DetailFact
                  icon="time-outline"
                  label={t("services.leaseDuration") || "Laufzeit"}
                  value={listing.lease_duration}
                  accentColor={COLORS.success}
                />
              ) : null}
              {listing.deposit ? (
                <DetailFact
                  icon="wallet-outline"
                  label={t("rentals.deposit") || "Kaution"}
                  value={listing.deposit}
                  accentColor={COLORS.success}
                />
              ) : null}
            </>
          )}
        </DetailFacts>

        {listing.latitude != null && listing.longitude != null && (
          <ContentMap
            latitude={listing.latitude}
            longitude={listing.longitude}
            title={listing.title}
            address={listing.address ?? undefined}
            flush
          />
        )}

        {listing.description ? (
          <View style={styles.plainSection}>
            <Text style={styles.sectionTitle}>{t("listing.description") || "Beschreibung"}</Text>
            <Text style={styles.description}>{listing.description}</Text>
          </View>
        ) : null}

        {allMediaItems.length > 0 && (
          <ContentGallery mediaItems={allMediaItems} title={t("listing.gallery", "Galerie")} />
        )}

        <BottomCTA
          primaryLabel={t("common.contact", "Contact Seller")}
          primaryIcon="chatbubble-ellipses-outline"
          accentColor={COLORS.success}
          onPrimary={handleContact}
          saved={isSaved}
          onSave={handleToggleSave}
          onShare={handleShare}
          onWhatsApp={handleShare}
        />
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
  body: { paddingBottom: 60 },
  heroWrap: { position: "relative" },
  plainSection: { marginTop: SPACING.section, paddingHorizontal: SPACING.std },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#264348", marginBottom: SPACING.small },
  description: { fontSize: FONT_SIZES.bodySmall, color: "#264348", lineHeight: 22 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { width: "100%", borderRadius: BORDER_RADIUS.lg, backgroundColor: "#f3f4f6" },
  coverPlaceholder: { height: 240, alignItems: "center", justifyContent: "center" },
  infoCard: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg, padding: SPACING.std, marginTop: SPACING.std },
  title: { fontSize: 20, fontWeight: "700", color: "#264348" },
  price: { fontSize: 22, fontWeight: "800", color: COLORS.success, marginTop: SPACING.small },
  askPrice: { fontSize: 16, color: "#264348", marginTop: SPACING.small, fontStyle: "italic" },
  description: { fontSize: FONT_SIZES.bodySmall, color: "#264348", marginTop: SPACING.small, lineHeight: 22 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.small, marginTop: SPACING.small },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "transparent", borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  tagText: { fontSize: 12, color: "#264348", fontWeight: "600" },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.small },
  addressText: { fontSize: FONT_SIZES.caption, color: "#264348", flex: 1 },
  actions: {
    flexDirection: "row", alignItems: "center", gap: SPACING.small,
    marginTop: SPACING.std, paddingTop: SPACING.small,
  },
  contactBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.success, borderRadius: BORDER_RADIUS.md,
    paddingVertical: 14,
  },
  contactText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  iconBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.background,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(38,67,72,0.25)",
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
    color: "#59ABE3",
  },
  homeDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.small,
    marginTop: SPACING.small,
    paddingTop: SPACING.small,
    borderTopWidth: 1,
    borderTopColor: "rgba(38,67,72,0.15)",
  },
  homeDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "transparent",
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  homeDetailText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#264348",
  },
});

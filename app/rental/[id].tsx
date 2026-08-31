import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getRental, Rental, toggleSaved, checkSaved } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { HeaderBackButton } from "../../components/shared/HeaderBackButton";
import { ContentHero, ContentGallery } from "../../components/shared";
import LazyMediaViewer, { MediaItem } from "../../components/LazyMediaViewer";
import { buildMediaItems } from "../../lib/api/mediaUtils";
import { normalizeId } from "../../lib/navigation/entityRoutes";

function muxFallback(videoUrl?: string | null): string | null {
  if (!videoUrl) return null;
  const m = videoUrl.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  return m ? `https://image.mux.com/${m[1]}/thumbnail.jpg` : null;
}

export default function RentalDetailPage() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = normalizeId(rawId);
  const { sessionToken } = useAuth();
  const router = useRouter();
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    getRental(sessionToken || "", id)
      .then((d) => { setRental(d); return d; })
      .then((d) => {
        if (sessionToken) {
          checkSaved(sessionToken, "rental", d.rental_id).then((r) => setIsSaved(r.is_saved)).catch(() => {});
        }
      })
      .catch(() => setRental(null))
      .finally(() => setLoading(false));
  }, [id, sessionToken]);

  const handleToggleSave = async () => {
    if (!sessionToken || !rental) return;
    setSaving(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "rental", rental.rental_id);
      setIsSaved(is_saved);
    } catch {
      Alert.alert(t("common.error", "Error"), t("common.pleaseTryAgain", "Please try again"));
    }
    setSaving(false);
  };

  const handleShare = () => {
    if (!rental) return;
    Share.share({ message: `${rental.title}${rental.rent_price ? " - " + rental.rent_price : ""} on Perix` });
  };

  const handleContact = () => {
    if (!rental || !sessionToken) {
      Alert.alert(t("common.loginRequired", "Login Required"), t("common.loginToContact", "Please log in to contact."));
      return;
    }
    const name = (rental as any).business_name || "Anbieter";
    const targetId = (rental as any).business_id || (rental as any).owner_id;
    if (targetId) router.push({ pathname: `/messages/${targetId}` as any, params: { name, entityType: "user" } as any });
  };

  const allMediaItems: MediaItem[] = rental ? buildMediaItems({
    video_url: (rental as any).video_url,
    cover_image_url: rental.cover_image,
    image_urls: rental.gallery_images || [],
    gallery_images: rental.gallery_images || [],
    gallery_videos: (rental as any).gallery_videos || [],
    mux_thumbnail_url: (rental as any).mux_thumbnail_url,
    video_status: (rental as any).video_status,
  }) : [];

  const isCoverVideo = !rental?.cover_image && !!(rental as any)?.video_url;
  const roomsText = (rental as any)?.rooms || rental?.rooms_size;
  const addressLabel = (rental as any)?.public_location_label || rental?.address;

  if (!id) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}><HeaderBackButton onPress={() => router.back()} /></View>
        <View style={styles.center}>
          <Text style={{ fontSize: 16, color: COLORS.textMuted, marginTop: SPACING.std }}>
            {t("rentals.invalidRental", "This rental cannot be opened.")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.rentalsAccent} /></View>
      </SafeAreaView>
    );
  }

  if (!rental) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <HeaderBackButton onPress={() => router.back()} />
          <Text style={styles.headerTitle}>{t("rentals.notFound", "Not found")}</Text>
          <View style={{ width: 44 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle} numberOfLines={1}>{rental.title}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ContentHero
          coverImageUrl={rental.cover_image}
          videoUrl={(rental as any).video_url}
          muxThumbnailUrl={(rental as any).mux_thumbnail_url || muxFallback((rental as any).video_url)}
          videoStatus={(rental as any).video_status}
          isCoverVideo={isCoverVideo}
          coverFocalPoint={(rental as any).cover_focal_point}
          imageUrls={rental.gallery_images || []}
          title={rental.title}
          badges={[
            { icon: "home", text: t("rentals.types." + ((rental as any).property_type || "apartment"), (rental as any).property_type || "Apartment") },
            rental.rent_price ? { icon: "pricetag", text: rental.rent_price } : null,
            roomsText ? { icon: "bed-outline", text: roomsText } : null,
          ].filter(Boolean) as any}
          subtitle={{
            text: (rental as any).business_name || t("rentals.rental", "Rental"),
            icon: "storefront-outline",
            avatarUrl: (rental as any).business_logo || undefined,
            onPress: (rental as any).business_id ? () => router.push(`/business/${(rental as any).business_id}` as any) : undefined,
          }}
          mediaItems={allMediaItems}
          onMediaPress={(idx) => {
            setViewerMedia(allMediaItems);
            setViewerIndex(idx);
            setViewerOpen(true);
          }}
        />

        <View style={styles.infoCard}>
          <Text style={styles.title}>{rental.title}</Text>
          {rental.rent_price ? (
            <Text style={styles.price}>{rental.rent_price}</Text>
          ) : null}

          {(rental as any).business_name ? (
            <Pressable
              style={styles.sellerRow}
              onPress={() => {
                if ((rental as any).business_id) router.push(`/business/${(rental as any).business_id}` as any);
              }}
            >
              {(rental as any).business_logo ? (
                <Image source={{ uri: (rental as any).business_logo }} style={styles.sellerAvatar} />
              ) : (
                <Ionicons name="storefront-outline" size={16} color={COLORS.primary} />
              )}
              <Text style={styles.sellerText}>{(rental as any).business_name}</Text>
            </Pressable>
          ) : null}

          {rental.description ? (
            <Text style={styles.description}>{rental.description}</Text>
          ) : null}

          <View style={styles.homeDetails}>
            {roomsText ? (
              <View style={styles.homeDetailItem}>
                <Ionicons name="bed-outline" size={16} color={COLORS.primary} />
                <Text style={styles.homeDetailText}>{roomsText}</Text>
              </View>
            ) : null}
            {(rental as any).size_sqm ? (
              <View style={styles.homeDetailItem}>
                <Ionicons name="resize-outline" size={16} color={COLORS.primary} />
                <Text style={styles.homeDetailText}>{(rental as any).size_sqm} m²</Text>
              </View>
            ) : null}
            {(rental as any).furnished ? (
              <View style={styles.homeDetailItem}>
                <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                <Text style={[styles.homeDetailText, { color: COLORS.success }]}>{t("services.furnished", "Furnished")}</Text>
              </View>
            ) : null}
            {(rental as any).available_from ? (
              <View style={styles.homeDetailItem}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                <Text style={styles.homeDetailText}>{(rental as any).available_from}</Text>
              </View>
            ) : null}
          </View>

          {addressLabel ? (
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.textMuted} />
              <Text style={styles.addressText}>{addressLabel}</Text>
            </View>
          ) : null}
        </View>

        {allMediaItems.length > 0 && (
          <View style={{ marginHorizontal: -SPACING.std }}>
            <ContentGallery mediaItems={allMediaItems} title={t("listing.gallery", "Galerie")} />
          </View>
        )}

        <View style={styles.actions}>
          <Pressable style={styles.contactBtn} onPress={handleContact}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            <Text style={styles.contactText}>{t("common.contact", "Contact")}</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  infoCard: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg, padding: SPACING.std, marginTop: SPACING.std },
  title: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary },
  price: { fontSize: 22, fontWeight: "800", color: COLORS.success, marginTop: SPACING.small },
  description: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.small, lineHeight: 22 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: SPACING.small },
  addressText: { fontSize: FONT_SIZES.caption, color: COLORS.textMuted, flex: 1 },
  actions: {
    flexDirection: "row", alignItems: "center", gap: SPACING.small,
    marginTop: SPACING.std, paddingTop: SPACING.small,
  },
  contactBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.rentalsAccent, borderRadius: BORDER_RADIUS.md,
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

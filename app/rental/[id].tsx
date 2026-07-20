import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getRental, Rental, toggleSaved, checkSaved } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import ContentHero from "../../components/shared/ContentHero";
import ContentGallery from "../../components/shared/ContentGallery";
import ContentMap from "../../components/shared/ContentMap";
import ContentSection from "../../components/shared/ContentSection";
import { InfoCard } from "../../components/shared/InfoCard";
import { LocationCard } from "../../components/shared/LocationCard";
import EntityMapSection from "../../components/shared/EntityMapSection";
import ErrorState from "../../components/shared/ErrorState";
import { ShareSection } from "../../components/shared/ShareSection";
import { BottomCTA } from "../../components/shared/BottomCTA";
import { EntityHeader } from "../../components/shared/EntityHeader";
import { normalizeId } from "../../lib/navigation/entityRoutes";

export default function RentalDetailPage() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = normalizeId(rawId);
  const { sessionToken } = useAuth();
  const router = useRouter();
  const [rental, setRental] = useState<Rental | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  useEffect(() => {
    loadRental();
  }, [id, sessionToken]);

  const loadRental = async () => {
    if (!id) { setLoading(false); return; }
    if (!sessionToken) return;
    try {
      const data = await getRental(sessionToken, id);
      setRental(data);
      try {
        const { is_saved } = await checkSaved(sessionToken, "rental", id);
        setIsSaved(is_saved);
      } catch {}
    } catch (error) {
      console.log("Failed to load rental:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSave = async () => {
    if (!sessionToken || !rental) return;
    setSavingItem(true);
    try {
      const { is_saved } = await toggleSaved(sessionToken, "rental", rental.rental_id);
      setIsSaved(is_saved);
    } catch (error) {
      console.error("Failed to toggle save:", error);
    } finally {
      setSavingItem(false);
    }
  };

  const handleShare = async () => {
    const message = `${rental.title} - ${rental.rent_price || ""} on Perix`;
    await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
  };

  if (!id) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <ErrorState
          message={t("rentals.invalidRental", "Dieses Mietangebot kann nicht geöffnet werden.")}
          fullWidth
        />
        <Pressable style={styles.notFoundBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.rentalsAccent} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <ActivityIndicator size="large" color={COLORS.rentalsAccent} />
      </SafeAreaView>
    );
  }

  if (!rental) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <ErrorState
          message={t("rentals.notFound", "Mietangebot nicht gefunden")}
          fullWidth
          onRetry={() => loadRental()}
        />
        <Pressable style={styles.notFoundBack} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.rentalsAccent} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const mediaItems = [
    ...(rental.cover_image ? [{ uri: rental.cover_image, type: "image" as const }] : []),
    ...(rental.gallery_images || []).map((uri: string) => ({ uri, type: "image" as const })),
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ContentHero
          coverImageUrl={rental.cover_image}
          imageUrls={rental.gallery_images || []}
          title={rental.title}
          badges={[
            ...(rental.property_type ? [{
              icon: "home" as const,
              text: rental.property_type.charAt(0).toUpperCase() + rental.property_type.slice(1),
              color: COLORS.rentalsAccent,
            }] : []),
            ...(rental.rent_price ? [{
              icon: "cash" as const,
              text: rental.rent_price,
              color: COLORS.warning,
            }] : []),
          ]}
          subtitle={rental.business_name ? {
            text: rental.business_name,
            icon: "business-outline" as const,
          } : undefined}
          mediaItems={mediaItems}
          onMediaPress={(idx) => {}}
        />

        <EntityHeader
          title={rental.title}
          subtitle={rental.business_name || ""}
          subtitlePrefix="bei"
          avatarUrl={rental.business_logo}
          accentColor={COLORS.rentalsAccent}
          onPress={rental.business_id ? () => router.push(`/business/${rental.business_id}` as any) : undefined}
        />

        <View style={styles.infoRow}>
          {rental.rent_price && (
            <InfoCard
              icon="cash-outline"
              label={t("rentals.rentPrice") || "Mietpreis"}
              value={rental.rent_price}
              accentColor={COLORS.warning}
            />
          )}
          {rental.rooms_size && (
            <InfoCard
              icon="resize-outline"
              label={t("rentals.roomsSize") || "Zimmer / Groesse"}
              value={rental.rooms_size}
              accentColor={COLORS.rentalsAccent}
            />
          )}
        </View>

        {rental.description && (
          <ContentSection icon="document-text" title={t("rentals.description") || "Beschreibung"}>
            <Text style={styles.descriptionText}>{rental.description}</Text>
          </ContentSection>
        )}

        <EntityMapSection
            address={rental.address}
            latitude={rental.latitude}
            longitude={rental.longitude}
            title={rental.title}
            accentColor={COLORS.rentalsAccent}
          />

        {rental.gallery_images && rental.gallery_images.length > 0 && (
          <ContentGallery
            mediaItems={rental.gallery_images.map((uri: string) => ({ uri, type: "image" as const }))}
            title="Galerie"
          />
        )}

        <ShareSection
          accentColor={COLORS.rentalsAccent}
          saved={isSaved}
          onWhatsApp={handleShare}
          onShare={handleShare}
          onSave={handleToggleSave}
        />

        <BottomCTA
          primaryLabel="Jetzt buchen"
          primaryIcon="calendar-outline"
          accentColor={COLORS.rentalsAccent}
          onPrimary={() => {}}
          saved={isSaved}
          onSave={handleToggleSave}
          onShare={handleShare}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage, overflow: "hidden" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.backgroundPage },
  content: { paddingBottom: 60 },
  errorText: { fontSize: FONT_SIZES.h3, color: COLORS.textMuted, marginBottom: SPACING.small },
  notFoundBack: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.small },
  backText: { fontSize: FONT_SIZES.body, color: COLORS.rentalsAccent, marginLeft: 4 },
  infoRow: {
    flexDirection: "row",
    gap: SPACING.compact,
    marginTop: SPACING.small,
    paddingHorizontal: SPACING.page,
  },
  descriptionText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textSecondary, lineHeight: 22 },
});

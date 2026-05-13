import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import BusinessMap from "../../components/BusinessMap";

export default function RentalDetailPage() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
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
    if (!sessionToken || !id) return;
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

  const openMap = () => {
    if (rental?.latitude && rental?.longitude) {
      Linking.openURL(`https://maps.google.com/maps?q=${rental.latitude},${rental.longitude}`);
    } else if (rental?.address) {
      Linking.openURL(`https://maps.google.com/maps?q=${encodeURIComponent(rental.address)}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!rental) {
    return (
      <SafeAreaView style={styles.centered} edges={["top"]}>
        <Text style={styles.errorText}>{t("rentals.notFound") || "Rental not found"}</Text>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </Pressable>

        <View style={styles.heroContainer}>
          {rental.cover_image ? (
            <Image source={{ uri: rental.cover_image }} style={styles.heroMedia} />
          ) : rental.gallery_images && rental.gallery_images.length > 0 ? (
            <Image source={{ uri: rental.gallery_images[0] }} style={styles.heroMedia} />
          ) : (
            <View style={styles.heroPlaceholder}>
              <View style={styles.heroIconContainer}>
                <Ionicons name="home" size={32} color="#fff" />
              </View>
            </View>
          )}
          <View style={styles.badgeRow}>
            {rental.property_type && (
              <View style={styles.typeBadge}>
                <View style={styles.badgeIconContainer}>
                  <Ionicons name="home" size={14} color="#fff" />
                </View>
                <Text style={styles.badgeText}>
                  {rental.property_type.charAt(0).toUpperCase() + rental.property_type.slice(1)}
                </Text>
              </View>
            )}
            {rental.rent_price && (
              <View style={styles.salaryBadge}>
                <View style={styles.badgeIconContainerGold}>
                  <Ionicons name="cash" size={12} color="#fff" />
                </View>
                <Text style={styles.badgeText}>{rental.rent_price}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>{rental.title}</Text>
          {rental.business_name && (
            <Pressable
              style={styles.businessRow}
              onPress={() => {
                if (rental.business_id) router.push(`/business/${rental.business_id}` as any);
              }}
            >
              {rental.business_logo ? (
                <Image source={{ uri: rental.business_logo }} style={styles.businessLogo} />
              ) : (
                <View style={styles.businessLogoPlaceholder}>
                  <Ionicons name="business" size={16} color="#6b7280" />
                </View>
              )}
              <Text style={styles.businessName}>{rental.business_name}</Text>
              <Ionicons name="chevron-forward" size={16} color="#6b7280" />
            </Pressable>
          )}
        </View>

        <View style={styles.infoRow}>
          {rental.rent_price && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconContainerGold}>
                <Ionicons name="cash-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.infoLabel}>{t("rentals.rentPrice") || "Rent"}</Text>
              <Text style={styles.infoValue}>{rental.rent_price}</Text>
            </View>
          )}
          {rental.rooms_size && (
            <View style={styles.infoCard}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="resize-outline" size={18} color="#fff" />
              </View>
              <Text style={styles.infoLabel}>{t("rentals.roomsSize") || "Size"}</Text>
              <Text style={styles.infoValue}>{rental.rooms_size}</Text>
            </View>
          )}
        </View>

        {rental.deposit && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("rentals.deposit") || "Deposit"}</Text>
            </View>
            <Text style={styles.cardValue}>{rental.deposit}</Text>
          </View>
        )}

        {rental.available_from && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("rentals.availableFrom") || "Available From"}</Text>
            </View>
            <Text style={styles.cardValue}>{rental.available_from}</Text>
          </View>
        )}

        {rental.address && (
          <Pressable style={styles.card} onPress={openMap}>
            <View style={styles.cardHeader}>
              <Ionicons name="location" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("rentals.address") || "Address"}</Text>
            </View>
            <Text style={styles.cardValue}>{rental.address}</Text>
          </Pressable>
        )}

        {rental.latitude && rental.longitude && (
          <View style={styles.miniMapContainer}>
            <BusinessMap
              location={{ latitude: rental.latitude, longitude: rental.longitude }}
              markers={[{
                id: rental.rental_id,
                latitude: rental.latitude,
                longitude: rental.longitude,
                title: rental.title,
                description: rental.business_name || "",
                type: "rental" as const,
                pinColor: "#10b981",
              }]}
            />
          </View>
        )}

        {rental.description && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("rentals.description") || "Description"}</Text>
            </View>
            <Text style={styles.descriptionText}>{rental.description}</Text>
          </View>
        )}

        {rental.gallery_images && rental.gallery_images.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="images-outline" size={18} color={COLORS.primary} />
              <Text style={styles.cardTitle}>{t("rentals.gallery") || "Gallery"}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {rental.gallery_images.map((uri, idx) => (
                <Image key={idx} source={{ uri }} style={styles.galleryImage} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable style={styles.saveButton} onPress={handleToggleSave} disabled={savingItem}>
            <Ionicons
              name={isSaved ? "bookmark" : "bookmark-outline"}
              size={22}
              color={isSaved ? COLORS.gold : COLORS.primary}
            />
            <Text style={[styles.saveButtonText, isSaved && { color: COLORS.gold }]}>
              {isSaved ? t("common.saved") : t("common.save")}
            </Text>
          </Pressable>
          <Pressable style={styles.shareButton} onPress={async () => {
            const message = `${rental.title} - ${rental.rent_price || ""} on Perix`;
            await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
          }}>
            <Ionicons name="share-outline" size={22} color={COLORS.primary} />
            <Text style={styles.shareButtonText}>{t("common.share")}</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.backgroundPage },
  content: { padding: SPACING.lg, paddingBottom: 40 },
  backButton: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.md },
  backText: { fontSize: FONT_SIZES.body, color: COLORS.primary, marginLeft: 4 },
  errorText: { fontSize: FONT_SIZES.h3, color: COLORS.textMuted, marginBottom: SPACING.md },
  heroContainer: { borderRadius: BORDER_RADIUS.xl, overflow: "hidden", marginBottom: SPACING.lg },
  heroMedia: { width: "100%", height: 220, resizeMode: "cover" },
  heroPlaceholder: {
    width: "100%",
    height: 220,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  heroIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: -32, paddingHorizontal: 12 },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: { fontSize: 12, color: "#fff", fontWeight: "600" },
  salaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#b45309",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeIconContainer: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIconContainerGold: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: { marginBottom: SPACING.lg },
  title: { fontSize: FONT_SIZES.h1, fontWeight: "700", color: COLORS.primary, marginBottom: SPACING.xs },
  businessRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.xs,
    gap: 8,
  },
  businessLogo: { width: 24, height: 24, borderRadius: 12 },
  businessLogoPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  businessName: { fontSize: FONT_SIZES.body, color: "#6b7280", flex: 1 },
  infoRow: { flexDirection: "row", gap: SPACING.md, marginBottom: SPACING.lg },
  infoCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: "center",
  },
  infoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  infoIconContainerGold: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#b45309",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  infoLabel: { fontSize: FONT_SIZES.small, color: "#6b7280", marginBottom: 2 },
  infoValue: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
  card: {
    backgroundColor: "#fff",
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  miniMapContainer: {
    height: 150,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: SPACING.xs,
  },
  cardTitle: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
  cardValue: { fontSize: FONT_SIZES.body, color: "#374151" },
  descriptionText: { fontSize: FONT_SIZES.body, color: "#374151", lineHeight: 22 },
  galleryImage: {
    width: 140,
    height: 100,
    borderRadius: BORDER_RADIUS.md,
    marginRight: SPACING.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  saveButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border || "#e5e7eb",
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    gap: 8,
  },
  saveButtonText: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
  shareButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: COLORS.border || "#e5e7eb",
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    gap: 8,
  },
  shareButtonText: { fontSize: FONT_SIZES.body, fontWeight: "600", color: COLORS.primary },
});

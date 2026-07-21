import { useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { Listing, ListingStatus } from "../../lib/api/listings";
import { entityRoutes, pushEntityRoute } from "../../lib/navigation/entityRoutes";
import { MARKETPLACE_CATEGORIES, getCategoryConfig } from "../../lib/marketplace/marketplaceTaxonomy";

type Props = {
  listings: Listing[];
  isOwner: boolean;
  onAdd: () => void;
  onEdit: (listing: Listing) => void;
  onToggleMarketplace: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
};

function statusBadge(status: ListingStatus, isActive: boolean): { label: string; color: string } {
  if (!isActive) return { label: "Inaktiv", color: COLORS.textMuted };
  if (status === "draft") return { label: "Entwurf", color: COLORS.textMuted };
  if (status === "published") return { label: "Aktiv", color: COLORS.success };
  if (status === "sold" || status === "rented") return { label: "Verkauft", color: COLORS.warning };
  return { label: status, color: COLORS.textPrimary };
}

export default function ProfileItemsSection({ listings, isOwner, onAdd, onEdit, onToggleMarketplace, onDelete }: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  const catCounts = useMemo(() => {
    const counts: Record<string, { count: number; label: string; icon: string }> = {};
    listings.forEach((l) => {
      const cat = l.category || "other";
      if (!counts[cat]) {
        const cfg = getCategoryConfig(cat);
        counts[cat] = { count: 0, label: cfg?.fallback || cat, icon: cfg?.icon || "ellipsis-horizontal-outline" };
      }
      counts[cat].count++;
    });
    return counts;
  }, [listings]);

  return (
    <View style={styles.container}>
      {isOwner && (
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
          <Text style={styles.addText}>{t("marketplace.addItem", "Artikel hinzufügen")}</Text>
        </Pressable>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {Object.entries(catCounts).map(([key, info]) => (
          <Pressable key={key} style={styles.catChip}>
            <Ionicons name={info.icon as any} size={14} color={COLORS.textSecondary} />
            <Text style={styles.catChipText}>{info.label} ({info.count})</Text>
          </Pressable>
        ))}
      </ScrollView>

      {listings.map((listing) => {
        const badge = statusBadge(listing.status, listing.is_active);
        const img = listing.cover_image_url || listing.image_urls?.[0];
        return (
          <Pressable
            key={listing.listing_id}
            style={styles.card}
            onPress={() => pushEntityRoute(router, entityRoutes.listing(listing.listing_id), () => {})}
          >
            <View style={styles.cardRow}>
              {img ? (
                <View style={styles.cardImgWrap}>
                  <Ionicons name="image-outline" size={32} color={COLORS.textMuted} />
                </View>
              ) : (
                <View style={[styles.cardImgWrap, { backgroundColor: COLORS.backgroundPage }]}>
                  <Ionicons name="image-outline" size={24} color={COLORS.textDisabled} />
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle} numberOfLines={2}>{listing.title}</Text>
                <View style={styles.cardMeta}>
                  <View style={[styles.badge, { backgroundColor: badge.color + "20" }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                  {listing.price ? <Text style={styles.cardPrice}>{listing.price}</Text> : null}
                </View>
              </View>
            </View>

            {isOwner && (
              <View style={styles.cardActions}>
                <Pressable style={styles.actionBtn} onPress={() => onEdit(listing)}>
                  <Ionicons name="create-outline" size={16} color={COLORS.textPrimary} />
                </Pressable>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => onToggleMarketplace(listing)}
                >
                  <Ionicons
                    name={listing.publication_scope === "profile_and_marketplace" ? "stop-circle-outline" : "storefront-outline"}
                    size={16}
                    color={listing.publication_scope === "profile_and_marketplace" ? COLORS.warning : COLORS.primary}
                  />
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={() => {
                  Alert.alert(t("common.confirmDelete", "Löschen"), t("common.areYouSure", "Bist du sicher?"), [
                    { text: t("common.cancel", "Abbrechen"), style: "cancel" },
                    { text: t("common.delete", "Löschen"), style: "destructive", onPress: () => onDelete(listing) },
                  ]);
                }}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                </Pressable>
              </View>
            )}
          </Pressable>
        );
      })}

      {listings.length === 0 && !isOwner && (
        <Text style={styles.emptyText}>{t("marketplace.noItems", "Keine Artikel")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.std, paddingBottom: SPACING.section },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 12, marginBottom: SPACING.small,
  },
  addText: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.primary },
  catRow: { gap: SPACING.small, marginBottom: SPACING.small },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage, borderWidth: 1, borderColor: COLORS.border,
  },
  catChipText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  card: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.small,
    padding: SPACING.small,
  },
  cardRow: { flexDirection: "row", gap: SPACING.small },
  cardImgWrap: {
    width: 72, height: 72, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.backgroundPage, alignItems: "center", justifyContent: "center",
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: COLORS.textPrimary },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BORDER_RADIUS.full },
  badgeText: { fontSize: 11, fontWeight: "600" },
  cardPrice: { fontSize: 13, fontWeight: "700", color: COLORS.success },
  cardActions: { flexDirection: "row", gap: 4, marginTop: 8, justifyContent: "flex-end" },
  actionBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: FONT_SIZES.bodySmall, color: COLORS.textMuted, textAlign: "center", marginTop: SPACING.section },
});

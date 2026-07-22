import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import { Listing, ListingStatus } from "../../lib/api/listings";
import { entityRoutes, pushEntityRoute } from "../../lib/navigation/entityRoutes";
import { MARKETPLACE_CATEGORIES, getCategoryConfig, getSubcategories } from "../../lib/marketplace/marketplaceTaxonomy";

type Props = {
  listings: Listing[];
  isOwner: boolean;
  canAdd?: boolean;
  addLoading?: boolean;
  addDisabledReason?: string;
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

export default function ProfileItemsSection({ listings, isOwner, canAdd = true, addLoading = false, addDisabledReason, onAdd, onEdit, onToggleMarketplace, onDelete }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

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
    // Order by MARKETPLACE_CATEGORIES
    const ordered: { key: string; label: string; icon: string; count: number }[] = [];
    for (const mcat of MARKETPLACE_CATEGORIES) {
      if (counts[mcat.key]) ordered.push({ key: mcat.key, ...counts[mcat.key] });
    }
    for (const [key, info] of Object.entries(counts)) {
      if (!ordered.some((o) => o.key === key)) ordered.push({ key, ...info });
    }
    return ordered;
  }, [listings]);

  const visibleListings = useMemo(() => {
    let filtered = listings;
    if (selectedCat) {
      filtered = filtered.filter((l) => l.category === selectedCat);
      if (selectedSub) filtered = filtered.filter((l) => l.subcategory === selectedSub);
    }
    return filtered;
  }, [listings, selectedCat, selectedSub]);

  const categoryListings = useMemo(
    () => (selectedCat ? listings.filter((l) => l.category === selectedCat) : []),
    [listings, selectedCat],
  );

  const subsForCat = useMemo(() => {
    if (!selectedCat) return [];
    const cat = getCategoryConfig(selectedCat);
    if (!cat) return [];
    return cat.subcategories
      .map((s) => ({
        key: s.key,
        label: s.fallback,
        count: categoryListings.filter((l) => l.subcategory === s.key).length,
      }))
      .filter((s) => s.count > 0);
  }, [selectedCat, categoryListings]);

  const handleCardPress = (listing: Listing) => {
    if (!isOwner || (listing.status === "published" && listing.is_active)) {
      pushEntityRoute(router, entityRoutes.listing(listing.listing_id), () => {});
    } else {
      onEdit(listing);
    }
  };

  return (
    <View style={styles.container}>
      {isOwner && (
        <Pressable
          style={[styles.addBtn, (!canAdd || addLoading) && styles.addBtnDisabled]}
          onPress={canAdd && !addLoading ? onAdd : undefined}
        >
          <Ionicons
            name={addLoading ? "hourglass-outline" : "add-circle-outline"}
            size={20}
            color={canAdd && !addLoading ? COLORS.primary : COLORS.textMuted}
          />
          <Text style={[styles.addText, (!canAdd || addLoading) && { color: COLORS.textMuted }]}>
            {addLoading
              ? t("common.loading", "Lädt...")
              : !canAdd && addDisabledReason
                ? addDisabledReason
                : t("marketplace.addItem", "Artikel hinzufügen")}
          </Text>
        </Pressable>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        <Pressable
          style={[styles.catChip, !selectedCat && styles.catChipActive]}
          onPress={() => { setSelectedCat(null); setSelectedSub(null); }}
        >
          <Text style={[styles.catChipText, !selectedCat && styles.catChipTextActive]}>
            {t("marketplace.all", "Alle")} ({listings.length})
          </Text>
        </Pressable>
        {catCounts.map((info) => (
          <Pressable
            key={info.key}
            style={[styles.catChip, selectedCat === info.key && styles.catChipActive]}
            onPress={() => { setSelectedCat(selectedCat === info.key ? null : info.key); setSelectedSub(null); }}
          >
            <Ionicons name={info.icon as any} size={14} color={selectedCat === info.key ? "#fff" : COLORS.textSecondary} />
            <Text style={[styles.catChipText, selectedCat === info.key && styles.catChipTextActive]}>
              {info.label} ({info.count})
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {subsForCat.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subRow}>
          <Pressable
            style={[styles.subChip, !selectedSub && styles.catChipActive]}
            onPress={() => setSelectedSub(null)}
          >
            <Text style={[styles.catChipText, !selectedSub && styles.catChipTextActive]}>
              {t("marketplace.all", "Alle")} ({categoryListings.length})
            </Text>
          </Pressable>
          {subsForCat.map((sub) => (
            <Pressable
              key={sub.key}
              style={[styles.subChip, selectedSub === sub.key && styles.catChipActive]}
              onPress={() => setSelectedSub(selectedSub === sub.key ? null : sub.key)}
            >
              <Text style={[styles.catChipText, selectedSub === sub.key && styles.catChipTextActive]}>
                {sub.label} ({sub.count})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {visibleListings.map((listing) => {
        const badge = statusBadge(listing.status, listing.is_active);
        const img = listing.cover_image_url || listing.image_urls?.[0];
        return (
          <Pressable key={listing.listing_id} style={styles.card} onPress={() => handleCardPress(listing)}>
            <View style={styles.cardRow}>
              {img ? (
                <Image source={{ uri: img }} style={styles.cardImg} />
              ) : (
                <View style={[styles.cardImg, { backgroundColor: COLORS.backgroundPage, alignItems: "center", justifyContent: "center" }]}>
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
                <Pressable style={styles.actionBtn} onPress={(e) => { (e as any).stopPropagation?.(); onEdit(listing); }}>
                  <Ionicons name="create-outline" size={16} color={COLORS.textPrimary} />
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={(e) => { (e as any).stopPropagation?.(); onToggleMarketplace(listing); }}>
                  <Ionicons
                    name={listing.publication_scope === "profile_and_marketplace" ? "stop-circle-outline" : "storefront-outline"}
                    size={16}
                    color={listing.publication_scope === "profile_and_marketplace" ? COLORS.warning : COLORS.primary}
                  />
                </Pressable>
                <Pressable style={styles.actionBtn} onPress={(e) => {
                  (e as any).stopPropagation?.();
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

      {visibleListings.length === 0 && (
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
  addBtnDisabled: { opacity: 0.5 },
  catRow: { gap: SPACING.small, marginBottom: SPACING.small },
  subRow: { gap: SPACING.small, marginBottom: SPACING.small },
  catChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage, borderWidth: 1, borderColor: COLORS.border,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { fontSize: 12, fontWeight: "600", color: COLORS.textSecondary },
  catChipTextActive: { color: COLORS.background },
  subChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.backgroundPage, borderWidth: 1, borderColor: COLORS.border,
  },
  card: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.small,
    padding: SPACING.small,
  },
  cardRow: { flexDirection: "row", gap: SPACING.small },
  cardImg: {
    width: 72, height: 72, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.backgroundPage,
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

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

import { useAuth } from "../context/AuthContext";
import { getSavedItems, toggleSaved, SavedItem } from "../lib/api";
import { translateJobType } from "../lib/categoryTranslation";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from "../lib/designTokens";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";

const TYPE_ICONS: Record<string, string> = {
  event: "calendar",
  activity: "people",
  job: "briefcase",
  post: "document-text",
  business: "storefront",
};

const TYPE_COLORS: Record<string, string> = {
  event: COLORS.eventAccent,
  activity: COLORS.activityAccent,
  job: COLORS.info,
  post: COLORS.primary,
  business: COLORS.success,
};

export default function SavedScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [unsaving, setUnsaving] = useState<string | null>(null);

  const filters = ["all", "event", "activity", "job", "post", "business"];

  useEffect(() => {
    loadItems();
  }, [sessionToken]);

  const typeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((i) => { counts[i.item_type] = (counts[i.item_type] || 0) + 1; });
    return counts;
  }, [items]);

  const visibleItems = React.useMemo(
    () => (activeFilter === "all" ? items : items.filter((i) => i.item_type === activeFilter)),
    [items, activeFilter]
  );

  const loadItems = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const res = await getSavedItems(sessionToken, undefined);
      setItems(res.items);
    } catch (e) {
      console.log("Failed to load saved items:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsave = useCallback(
    async (item: SavedItem) => {
      if (!sessionToken || unsaving) return;
      setUnsaving(item.item_id);
      try {
        await toggleSaved(sessionToken, item.item_type, item.item_id);
        setItems((prev) => prev.filter((i) => i.item_id !== item.item_id));
      } catch (e) {
        console.log("Failed to unsave:", e);
      } finally {
        setUnsaving(null);
      }
    },
    [sessionToken, unsaving]
  );

  const handlePress = useCallback(
    (item: SavedItem) => {
      const route = `/${item.item_type === "business" ? "business" : item.item_type}/${item.item_id}`;
      router.push(route as any);
    },
    [router]
  );

  const renderItem = (item: SavedItem) => {
    const data = item.item_data;
    const icon = TYPE_ICONS[item.item_type] || "bookmark";
    const color = TYPE_COLORS[item.item_type] || COLORS.primary;
    const title =
      data?.title ||
      data?.name ||
      data?.text ||
      t("saved.untitled", "Untitled");
    const subtitle = data?.location || data?.address || translateJobType(data?.job_type, t) || "";

    return (
      <Pressable
        key={item.saved_id}
        style={styles.card}
        onPress={() => handlePress(item)}
      >
        <View style={[styles.typeBadge, { backgroundColor: color + "18" }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>

        <View style={styles.cardBody}>
          {data?.cover_image_url || data?.image_url || data?.logo_image ? (
            <Image
              source={{ uri: (data.cover_image_url || data.image_url || data.logo_image)! }}
              style={styles.cardImage}
            />
          ) : (
            <View style={[styles.cardImagePlaceholder, { backgroundColor: color + "15" }]}>
              <Ionicons name={icon as any} size={20} color={color} />
            </View>
          )}
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
            <Text style={styles.cardType}>
              {t(`saved.type_${item.item_type}`, item.item_type)}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.unsaveBtn}
          onPress={() => handleUnsave(item)}
          disabled={unsaving === item.item_id}
        >
          <Ionicons
            name={unsaving === item.item_id ? "hourglass-outline" : "bookmark"}
            size={20}
            color={COLORS.primary}
          />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{t("saved.title", "Saved")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterList}>
        {filters.map((f) => {
          const count = f === "all" ? items.length : (typeCounts[f] || 0);
          const active = activeFilter === f;
          return (
            <Pressable
              key={f}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]} numberOfLines={1} ellipsizeMode="tail">
                {f === "all"
                  ? t("saved.all", "All")
                  : t(`saved.type_${f}`, f)}
              </Text>
              <View style={[styles.filterCount, active && styles.filterCountActive]}>
                <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#59ABE3" />
        </View>
      ) : visibleItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="bookmark-outline" size={48} color="#264348" />
          <Text style={styles.emptyText}>
            {t("saved.empty", "No saved items yet")}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {visibleItems.map(renderItem)}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.small,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: "700",
    color: "#264348",
  },
  filterList: { paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, gap: SPACING.small, borderBottomWidth: 1, borderBottomColor: "rgba(38,67,72,0.15)", backgroundColor: COLORS.background },
  filterBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(38,67,72,0.15)", borderRadius: BORDER_RADIUS.md, paddingHorizontal: SPACING.std, paddingVertical: 12 },
  filterBtnActive: { backgroundColor: "#59ABE3", borderColor: "#59ABE3" },
  filterBtnText: { fontSize: FONT_SIZES.bodySmall, fontWeight: "600", color: "#264348" },
  filterBtnTextActive: { color: "#fff" },
  filterCount: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(38,67,72,0.08)", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  filterCountActive: { backgroundColor: "rgba(255,255,255,0.25)" },
  filterCountText: { fontSize: FONT_SIZES.micro, fontWeight: "700", color: COLORS.textMuted },
  filterCountTextActive: { color: "#fff" },
  list: {
    flex: 1,
  },
  listContent: {
    padding: SPACING.std,
    gap: SPACING.small,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.15)",
    padding: SPACING.compact,
  },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.small,
  },
  cardBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  cardImage: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.sm,
    marginRight: SPACING.small,
  },
  cardImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.small,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  cardSubtitle: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  cardType: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textMuted,
    textTransform: "capitalize",
    marginTop: 2,
  },
  unsaveBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: SPACING.small,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.compact,
    paddingHorizontal: SPACING.section,
  },
  emptyText: {
    fontSize: FONT_SIZES.body,
    color: COLORS.textMuted,
    textAlign: "center",
  },
});

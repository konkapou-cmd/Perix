import React from "react";
import { View, Text, StyleSheet, Pressable, Platform, useWindowDimensions, DimensionValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Service } from "../../lib/api/core";
import { COLORS, BORDER_RADIUS, CATEGORY_SERVICE_TYPES, CategoryServiceType } from "../../lib/designTokens";
import { getServiceSingular } from "../../lib/serviceLabels";
import CategoryServiceCard from "./CategoryServiceCard";

type Props = {
  services: Service[];
  rootCategory: string;
  readOnly?: boolean;
  onAddService?: (type: string) => void;
  onServicePress?: (service: Service) => void;
  onEditService?: (service: Service) => void;
  onDeleteService?: (serviceId: string) => void;
  onOpenSlotManager?: (serviceId: string) => void;
  cardColor?: string;
  textColor?: string;
};

const MENU_CATEGORY_ORDER = ["starter", "main", "dessert", "drink", "side"];

function getTabLabel(rootCategory: string): string {
  switch (rootCategory) {
    case "food-dining": return "Menu";
    case "rentals": case "rental-real-estate": return "Rooms";
    case "shopping-retail": case "fashion-accessories": return "Products";
    case "beauty-care": case "healthcare": case "pets": return "Appointments";
    case "sports-fitness-wellness": return "Classes & Services";
    case "education-creativity": return "Classes & Services";
    case "automotive": return "Vehicles";
    case "nightlife-social": return "Reservations";
    case "entertainment-events": return "Bookings";
    default: return "Services";
  }
}

function snakeToPascal(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()).replace(/^[a-z]/, (c) => c.toUpperCase());
}

const TYPE_LABEL_OVERRIDES: Record<string, string> = {
  "tailoring_alteration": "services.typeTailoring",
};

function getTypeLabelKey(type: string): string {
  if (TYPE_LABEL_OVERRIDES[type]) return TYPE_LABEL_OVERRIDES[type];
  return `services.type${snakeToPascal(type)}`;
}

export default function ServiceSection({ services, rootCategory, readOnly, onAddService, onServicePress, onEditService, onDeleteService, onOpenSlotManager, cardColor = "#fff" }: Props) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const isFood = rootCategory === "food-dining";
  const isRental = rootCategory === "rentals" || rootCategory === "rental-real-estate";
  const tabLabel = getTabLabel(rootCategory);
  const isWeb = Platform.OS === "web";

  const typeDefs = rootCategory ? CATEGORY_SERVICE_TYPES[rootCategory] || [] : [];
  const typeDefMap: Record<string, CategoryServiceType> = {};
  typeDefs.forEach((td) => { typeDefMap[td.type] = td; });

  const getCardWidth = () => {
    if (isFood || isRental) return isWeb ? "calc(50% - 5px)" : (windowWidth - 32 - 10) / 2;
    return isWeb ? "calc(33.33% - 7px)" : (windowWidth - 32 - 20) / 3;
  };

  if (services.length === 0 && readOnly) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name={isFood ? "restaurant" : "grid"} size={48} color="#d1d5db" />
        <Text style={styles.emptyText}>{t("services.noServices", `No ${tabLabel.toLowerCase()} available yet`)}</Text>
      </View>
    );
  }

  const renderEditActions = (item: Service) => {
    if (readOnly || (!onEditService && !onDeleteService && !onOpenSlotManager)) return null;
    return (
      <View style={styles.actionRow}>
        {onOpenSlotManager && (
          <Pressable onPress={() => onOpenSlotManager(item.service_id)} hitSlop={8} style={styles.actionBtn}>
            <Ionicons name="time-outline" size={14} color={COLORS.primary} />
          </Pressable>
        )}
        {onEditService && (
          <Pressable onPress={() => onEditService(item)} hitSlop={8} style={styles.actionBtn}>
            <Ionicons name="pencil" size={14} color={COLORS.textMuted} />
          </Pressable>
        )}
        {onDeleteService && (
          <Pressable onPress={() => onDeleteService(item.service_id)} hitSlop={8} style={styles.actionBtn}>
            <Ionicons name="trash-outline" size={14} color={COLORS.danger} />
          </Pressable>
        )}
      </View>
    );
  };

  // Unified: group services by their type field
  const groupedByType: Record<string, Service[]> = {};
  services.forEach((s) => {
    const key = s.type || "other";
    if (!groupedByType[key]) groupedByType[key] = [];
    groupedByType[key].push(s);
  });

  return (
    <View style={styles.container}>
      {Object.entries(groupedByType).map(([type, items]) => {
        const info = typeDefMap[type];
        const heading = info?.publicTabLabel || info?.label || type;
        const addLabel = info?.publicTabLabel?.replace(/s$/, "") || info?.label || type;
        return (
          <View key={type} style={styles.typeGroup}>
            <View style={styles.typeHeader}>
              {info && <Ionicons name={info.icon as any} size={16} color={COLORS.primary} style={{ marginRight: 6 }} />}
              <Text style={styles.categoryTitle}>{heading}</Text>
            </View>
            {!readOnly && onAddService && (
              <Pressable style={[styles.addBtn, { backgroundColor: cardColor }]} onPress={() => onAddService(type)}>
                <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                <Text style={styles.addBtnText}>{t("services.add", "Add")} {addLabel}</Text>
              </Pressable>
            )}
            {type === "menu_item" ? (
              // Menu items: sub-group by menu_category
              (() => {
                const menuGrouped: Record<string, Service[]> = {};
                MENU_CATEGORY_ORDER.forEach((cat) => {
                  const catItems = items.filter((s) => s.menu_category === cat);
                  if (catItems.length > 0) menuGrouped[cat] = catItems;
                });
                const uncategorized = items.filter((s) => !s.menu_category || !MENU_CATEGORY_ORDER.includes(s.menu_category));
                if (uncategorized.length > 0) menuGrouped["other"] = uncategorized;
                return Object.entries(menuGrouped).map(([cat, catItems]) => (
                  <View key={cat}>
                    <Text style={styles.categoryTitle}>{t(`menu.${cat}`, cat.charAt(0).toUpperCase() + cat.slice(1) + "s")}</Text>
                    <View style={styles.cardGrid}>
                      {catItems.map((item) => (
                        <View key={item.service_id} style={{ width: getCardWidth() as DimensionValue }}>
                          <CategoryServiceCard service={item} rootCategory={rootCategory} onPress={onServicePress} cardWidth="100%" />
                          {renderEditActions(item)}
                        </View>
                      ))}
                    </View>
                  </View>
                ));
              })()
            ) : (
              <View style={styles.cardGrid}>
                {items.map((item) => (
                  <View key={item.service_id} style={{ width: getCardWidth() as DimensionValue }}>
                    <CategoryServiceCard service={item} rootCategory={rootCategory} onPress={onServicePress} cardWidth="100%" />
                    {renderEditActions(item)}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: COLORS.textMuted },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: BORDER_RADIUS.md, marginBottom: 12 },
  addBtnText: { fontSize: 13, fontWeight: "500", color: COLORS.primary },
  categoryTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 10, marginTop: 8 },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typeGroup: { marginBottom: 8 },
  typeHeader: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 4, paddingRight: 4 },
  actionBtn: { padding: 4 },
});

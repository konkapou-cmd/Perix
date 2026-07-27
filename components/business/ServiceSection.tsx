import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Service } from "../../lib/api/core";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { getServiceModuleIcon, getServiceModuleLabel } from "../../lib/config/serviceModules";
import { getDefaultModule } from "../../lib/config/serviceCategoryMatrix";
import { EmptyState } from "../shared";
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
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  secondaryColor?: string;
};

function getTabLabel(rootCategory: string): string {
  switch (rootCategory) {
    case "food-dining": return "Menü";
    case "rentals": case "rental-real-estate": return "Zimmer";
    case "shopping-retail": case "fashion-accessories": return "Produkte";
    case "beauty-care": case "healthcare": case "pets": return "Termine";
    case "sports-fitness-wellness": return "Kurse & Dienste";
    case "education-creativity": return "Kurse & Dienste";
    case "automotive": return "Fahrzeuge";
    case "nightlife-social": return "Reservierungen";
    case "entertainment-events": return "Buchungen";
    default: return "Dienste";
  }
}

export default function ServiceSection({
  services, rootCategory, readOnly, onAddService, onServicePress, onEditService, onDeleteService, onOpenSlotManager, primaryColor = COLORS.primary, cardColor = "#fff", textColor = COLORS.textPrimary, secondaryColor = COLORS.textSecondary,
}: Props) {
  const { t } = useTranslation();
  const tabLabel = getTabLabel(rootCategory);

  const groupedByType: Record<string, Service[]> = {};
  services.forEach((s) => {
    const key = s.type || "other";
    if (!groupedByType[key]) groupedByType[key] = [];
    groupedByType[key].push(s);
  });

  const typeEntries = Object.entries(groupedByType);

  if (services.length === 0 && readOnly) {
    return (
      <EmptyState icon="grid" message={t("services.noServices")} subMessage={readOnly ? undefined : t("services.addFirstService")} />
    );
  }

  if (services.length === 0 && readOnly) {
    return (
      <EmptyState icon="grid" message={t("services.noServices")} />
    );
  }

  if (services.length === 0) {
    return (
      <EmptyState
        icon="grid"
        message={t("services.noServices")}
        subMessage={t("services.addFirstService")}
        actionLabel={t("services.add", "Hinzufügen")}
        onAction={() => onAddService?.(getDefaultModule(rootCategory))}
      />
    );
  }

  return (
    <View style={s.container}>
      {typeEntries.map(([type, items]) => {
        const icon = getServiceModuleIcon(type);
        const label = getServiceModuleLabel(type, (k: string, fb?: string) => t(k, fb ?? type));

        return (
          <View key={type}>
            {typeEntries.length > 1 && (
              <View style={s.typeHeader}>
                <Ionicons name={icon} size={16} color={primaryColor} style={{ marginRight: SPACING.small }} />
                <Text style={[s.categoryTitle, { color: textColor }]}>{label}</Text>
              </View>
            )}
            {!readOnly && onAddService && (
              <Pressable style={[s.addBtn, { backgroundColor: cardColor, borderColor: primaryColor }]} onPress={() => onAddService(type)}>
                <Ionicons name="add-circle-outline" size={18} color={primaryColor} />
                <Text style={[s.addBtnText, { color: primaryColor }]}>{t("services.add", "Hinzufügen")} {label}</Text>
              </Pressable>
            )}
            <View style={s.grid}>
              {items.map((item) => (
                <View key={item.service_id}>
                  <CategoryServiceCard
                    service={item}
                    rootCategory={rootCategory}
                    onPress={onServicePress}
                    primaryColor={primaryColor}
                    textColor={textColor}
                    secondaryColor={secondaryColor}
                  />
                  {!readOnly && (onEditService || onDeleteService || onOpenSlotManager) && (
                    <View style={s.actionRow}>
                      {onOpenSlotManager && (
                        <Pressable onPress={() => onOpenSlotManager(item.service_id)} hitSlop={8} style={s.actionBtn}>
                          <Ionicons name="time-outline" size={16} color={primaryColor} />
                        </Pressable>
                      )}
                      {onEditService && (
                        <Pressable onPress={() => onEditService(item)} hitSlop={8} style={s.actionBtn}>
                          <Ionicons name="create-outline" size={16} color={primaryColor} />
                        </Pressable>
                      )}
                      {onDeleteService && (
                        <Pressable onPress={() => onDeleteService(item.service_id)} hitSlop={8} style={s.actionBtn}>
                          <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  typeHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.compact,
    marginBottom: SPACING.small,
  },
  categoryTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.small,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.small,
  },
  addBtnText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  grid: {
    gap: SPACING.small,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.small,
    paddingTop: SPACING.tiny,
    paddingBottom: SPACING.small,
    paddingRight: SPACING.tiny,
  },
  actionBtn: {
    padding: SPACING.tiny,
  },
});

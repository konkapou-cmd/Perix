import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Service } from "../../lib/api/core";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { getServiceModuleIcon, getServiceModuleLabel } from "../../lib/config/serviceModules";
import { getDefaultModule } from "../../lib/config/serviceCategoryMatrix";
import { EmptyState } from "../shared";
import { SectionHeader } from "../shared/SectionHeader";
import CategoryServiceCard from "./CategoryServiceCard";

type Props = {
  services: Service[];
  rootCategory: string;
  readOnly?: boolean;
  onAddService?: (type: string) => void;
  onServicePress?: (service: Service) => void;
  onEditService?: (service: Service) => void;
  onDeleteService?: (serviceId: string) => void;
  onOpenSlotManager?: (serviceId: string, serviceType?: string) => void;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  secondaryColor?: string;
};

function getTabLabel(rootCategory: string, t: (k: string, fb?: string) => string): string {
  switch (rootCategory) {
    case "food-dining": return t("services.tabMenu", "Menü");
    case "rentals": case "rental-real-estate": return t("services.tabRooms", "Zimmer");
    case "shopping-retail": case "fashion-accessories": return t("services.tabProducts", "Produkte");
    case "beauty-care": case "healthcare": case "pets": return t("services.tabAppointments", "Termine");
    case "sports-fitness-wellness": case "education-creativity": return t("services.tabCourses", "Kurse & Dienste");
    case "automotive": return t("services.tabVehicles", "Fahrzeuge");
    case "nightlife-social": return t("services.tabReservations", "Reservierungen");
    case "entertainment-events": return t("services.tabBookings", "Buchungen");
    default: return t("services.tabServices", "Dienste");
  }
}

export default function ServiceSection({
  services, rootCategory, readOnly, onAddService, onServicePress, onEditService, onDeleteService, onOpenSlotManager, primaryColor = COLORS.primary, cardColor = "#fff", textColor = COLORS.textPrimary, secondaryColor = COLORS.textSecondary,
}: Props) {
  const { t } = useTranslation();
  const tabLabel = getTabLabel(rootCategory, (k, fb) => t(k, fb ?? ""));

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
      <SectionHeader
        icon={getServiceModuleIcon(getDefaultModule(rootCategory)) || "construct"}
        title={tabLabel}
        accent="#59ABE3"
        onSeeAll={!readOnly && onAddService ? () => onAddService(getDefaultModule(rootCategory)) : undefined}
        seeAllLabel={t("services.add", "Hinzufügen")}
        style={{ paddingHorizontal: SPACING.std }}
      />
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel}>
              {items.map((item) => (
                <View key={item.service_id} style={s.cardWrap}>
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
                        <Pressable onPress={() => onOpenSlotManager(item.service_id, item.type)} hitSlop={8} style={s.actionBtn}>
                          <Ionicons name="time-outline" size={16} color="#fff" />
                        </Pressable>
                      )}
                      {onEditService && (
                        <Pressable onPress={() => onEditService(item)} hitSlop={8} style={s.actionBtn}>
                          <Ionicons name="create-outline" size={16} color="#fff" />
                        </Pressable>
                      )}
                      {onDeleteService && (
                        <Pressable onPress={() => onDeleteService(item.service_id)} hitSlop={8} style={s.actionBtn}>
                          <Ionicons name="trash-outline" size={16} color="#fff" />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
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
    marginTop: 0,
    marginBottom: SPACING.tiny,
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
  carousel: {
    gap: SPACING.small,
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.small,
  },
  cardWrap: {
    width: 200,
    position: "relative",
  },
  actionRow: {
    position: "absolute",
    top: SPACING.small,
    right: SPACING.small,
    flexDirection: "row",
    gap: SPACING.small,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
});

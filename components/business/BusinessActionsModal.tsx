import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, BORDER_RADIUS, SPACING } from "../../lib/designTokens";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type ActionItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  count?: number;
};

export type BusinessAction =
  | "create-product"
  | "create-service"
  | "create-event"
  | "create-job"
  | "manage-products"
  | "manage-services"
  | "manage-events"
  | "manage-jobs"
  | "manage-bookings"
  | "manage-media";

type Props = {
  visible: boolean;
  loading?: boolean;
  businessProductsEnabled?: boolean;
  listingsCount?: number;
  onClose: () => void;
  onAction: (action: BusinessAction) => void;
};

export default function BusinessActionsModal({ visible, loading, businessProductsEnabled, listingsCount, onClose, onAction }: Props) {
  const { t } = useTranslation();

  const showCreateProduct = !loading && businessProductsEnabled;
  const showManageProducts = !loading && (businessProductsEnabled || (listingsCount ?? 0) > 0);

  const createActions: ActionItem[] = [
    ...(showCreateProduct ? [{ key: "create-product", label: t("marketplace.addProduct", "Produkt hinzufügen"), icon: "pricetag-outline" as const }] : []),
    { key: "create-service", label: t("services.addService", "Dienst hinzufügen"), icon: "construct-outline" as const },
    { key: "create-event", label: t("business.createEvent", "Veranstaltung erstellen"), icon: "sparkles" as const },
    { key: "create-job", label: t("business.createJob", "Job erstellen"), icon: "briefcase" as const },
  ];

  const bookingsAction: ActionItem = {
    key: "manage-bookings",
    label: t("business.seeMyBookings", "Meine Buchungen ansehen"),
    icon: "receipt-outline",
  };

  const renderRow = (action: ActionItem) => (
    <Pressable
      key={action.key}
      style={styles.actionRow}
      onPress={() => {
        onClose();
        onAction(action.key as BusinessAction);
      }}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={action.icon} size={22} color="#59ABE3" />
      </View>
      <View style={styles.actionInfo}>
        <Text style={styles.actionLabel}>{action.label}</Text>
      </View>
      {action.count != null && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{action.count}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color="#264348" />
    </Pressable>
  );

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("business.actions", "Business Aktionen")}</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          ) : (
            <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.actionsList}>
                {createActions.map(renderRow)}
              </View>

              <View style={styles.actionsList}>
                {renderRow(bookingsAction)}
              </View>
            </ScrollView>
          )}

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>{t("common.cancel", "Abbrechen")}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 34,
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#264348",
    textAlign: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  actionsList: {
    paddingHorizontal: 16,
    gap: 2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(89,171,227,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#264348",
  },
  countBadge: {
    backgroundColor: "rgba(38,67,72,0.08)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginRight: 4,
  },
  countText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#264348",
  },
  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "transparent",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.25)",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#264348",
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  scrollBody: {
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  scrollContent: {
    paddingBottom: 16,
  },
});

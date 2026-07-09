import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

type ActionItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description?: string;
};

export type BusinessAction = "cityad" | "event" | "job" | "service" | "bookings";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAction: (action: BusinessAction) => void;
};

export default function BusinessActionsModal({ visible, onClose, onAction }: Props) {
  const { t } = useTranslation();

  const actions: ActionItem[] = [
    {
      key: "cityad",
      label: t("cityAd.createAd") || "Stadt anzeigen erstellen",
      icon: "megaphone",
    },
    {
      key: "event",
      label: t("business.createEvent") || "Veranstaltung erstellen",
      icon: "calendar",
    },
    {
      key: "job",
      label: t("business.createJob") || "Job erstellen",
      icon: "briefcase",
    },
    {
      key: "service",
      label: t("services.addService") || "Dienst hinzufügen",
      icon: "add-circle",
    },
    {
      key: "bookings",
      label: t("services.manageBookings") || "Buchungen verwalten",
      icon: "calendar-number",
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {t("business.actions", "Business Aktionen")}
          </Text>

          <View style={styles.actionsList}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onAction(action.key as BusinessAction);
                }}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon} size={22} color={COLORS.primaryDark} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                  {action.description && (
                    <Text style={styles.actionDesc}>{action.description}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>
              {t("common.cancel", "Abbrechen")}
            </Text>
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
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    maxHeight: SCREEN_HEIGHT * 0.7,
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
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 16,
  },
  actionsList: {
    paddingHorizontal: 16,
    gap: 4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  actionDesc: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  cancelBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
});

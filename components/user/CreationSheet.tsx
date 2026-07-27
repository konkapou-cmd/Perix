import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";

export type CreationAction = "business" | "camera" | "activity" | "home_rental" | "product";

type Props = {
  visible: boolean;
  onClose: () => void;
  onAction: (action: CreationAction) => void;
  hasBusiness?: boolean;
};

export default function CreationSheet({ visible, onClose, onAction, hasBusiness }: Props) {
  const { t } = useTranslation();

  const actions = [
    {
      id: "business" as CreationAction,
      title: t("creation.business", "Business"),
      subtitle: hasBusiness
        ? t("creation.businessSubtitleOpen", "Open your business profile")
        : t("creation.businessSubtitleCreate", "Create your business profile"),
      icon: "business-outline",
    },
    {
      id: "camera" as CreationAction,
      title: t("creation.camera", "Photo or Video"),
      subtitle: t("creation.cameraSubtitle", "Share a post with the community"),
      icon: "camera-outline",
    },
    {
      id: "activity" as CreationAction,
      title: t("creation.activity", "Create Activity"),
      subtitle: t("creation.activitySubtitle", "Organise an activity with other people"),
      icon: "people-outline",
    },
    {
      id: "home_rental" as CreationAction,
      title: t("creation.homeRental", "List a Home"),
      subtitle: t("creation.homeRentalSubtitle", "Offer an apartment, house, studio or room for rent"),
      icon: "home-outline",
    },
    {
      id: "product" as CreationAction,
      title: t("creation.product", "Sell an Item"),
      subtitle: t("creation.productSubtitle", "Publish a product in the community marketplace"),
      icon: "pricetag-outline",
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
            {t("creation.title", "Create")}
          </Text>

          <View style={styles.actionsList}>
            {actions.map((action) => (
              <Pressable
                key={action.id}
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onAction(action.id);
                }}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name={action.icon as any} size={22} color={COLORS.primaryDark} />
                </View>
                <View style={styles.actionInfo}>
                  <Text style={styles.actionLabel}>{action.title}</Text>
                  <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
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

import { Dimensions } from "react-native";
const { height: SCREEN_HEIGHT } = Dimensions.get("window");

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
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  actionsList: {
    paddingHorizontal: 16,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  actionSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
});

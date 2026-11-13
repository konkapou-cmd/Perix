import React from "react";
import { View, Text, StyleSheet, Modal, Pressable, Platform, ScrollView, Image, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "../../lib/designTokens";
import { illustratedIconSource } from "../icons/IllustratedIcon";
import {
  CreationActor,
} from "../../lib/creation/creationActions";
import type { EntitlementSnapshot } from "../../lib/api/account";

export type CreationAction = "camera" | "activity" | "home_rental" | "product";

type Row = {
  section: "personal" | "premium" | "business";
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconSource?: ImageSourcePropType;
  allowed: boolean;
  reasonCode?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onAction: (action: CreationAction) => void;
  /** Optional server entitlements (phase 1 shadow snapshot). */
  entitlements?: EntitlementSnapshot | null;
  activeActorType?: CreationActor;
  /** Where locked rows navigate (default: the plans page). */
  onUpgrade?: () => void;
};

export default function CreationSheet({
  visible,
  onClose,
  onAction,
  entitlements,
  activeActorType = "user",
  onUpgrade,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const plan = entitlements?.effective_plan ?? "free_user";
  const isPremium = plan === "premium_user";
  const isBusinessPlan =
    plan === "business" || plan === "event_pro" || activeActorType === "business";

  const goUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      onClose();
      router.push("/plans" as any);
    }
  };

  const premiumUnlocked = isPremium || isBusinessPlan;

  // One flat list — fixed order: Photo/video Post, Activity, Event, Service,
  // Job, Product, Home. Everything is always visible; plan-gated rows simply
  // navigate to /plans on tap (not dimmed).
  const rows: Row[] = [
    {
      section: "personal",
      id: "camera",
      title: t("creation.camera", "Photo or Video"),
      subtitle: t("creation.cameraSubtitle", "Share a post with the community"),
      icon: "camera-outline",
      iconSource: illustratedIconSource("home", "posts"),
      allowed: true,
    },
    {
      section: "premium",
      id: "activity",
      title: t("creation.activity", "Create Activity"),
      subtitle: t("creation.activitySubtitle", "Organise an activity with other people"),
      icon: "people-outline",
      iconSource: illustratedIconSource("home", "activities"),
      allowed: premiumUnlocked,
      reasonCode: premiumUnlocked ? null : "plan_required",
    },
    {
      section: "business",
      id: "business-event",
      title: t("business.createEvent", "Veranstaltung erstellen"),
      subtitle: t("creation.businessEventSubtitle", "Publish events for your business"),
      icon: "sparkles",
      iconSource: illustratedIconSource("home", "events"),
      allowed: isBusinessPlan,
      reasonCode: isBusinessPlan ? null : "business_required",
    },
    {
      section: "business",
      id: "business-service",
      title: t("services.addService", "Dienst hinzufügen"),
      subtitle: t("creation.businessServiceSubtitle", "Offer professional services"),
      icon: "construct-outline",
      iconSource: illustratedIconSource("home", "services"),
      allowed: isBusinessPlan,
      reasonCode: isBusinessPlan ? null : "business_required",
    },
    {
      section: "business",
      id: "business-job",
      title: t("business.createJob", "Job erstellen"),
      subtitle: t("creation.businessJobSubtitle", "Publish jobs and review applications"),
      icon: "briefcase",
      iconSource: illustratedIconSource("home", "jobs"),
      allowed: isBusinessPlan,
      reasonCode: isBusinessPlan ? null : "business_required",
    },
    isPremium || isBusinessPlan
      ? {
          section: "personal",
          id: "product",
          title: t("creation.product", "Sell an Item"),
          subtitle: t("creation.productSubtitle", "Publish a product in the community marketplace"),
          icon: "pricetag-outline",
          iconSource: illustratedIconSource("home", "products"),
          allowed: true,
        }
      : {
          section: "personal",
          id: "product",
          title: t("creation.classifiedAd", "Post a classified ad"),
          subtitle: t(
            "creation.classifiedAdSubtitle",
            "Offer something with a photo and description — up to 3 active ads for 30 days",
          ),
          icon: "megaphone-outline",
          allowed: true,
        },
    {
      section: "premium",
      id: "home_rental",
      title: t("creation.homeRental", "List a Home"),
      subtitle: t("creation.homeRentalSubtitle", "Offer an apartment, house, studio or room for rent"),
      icon: "home-outline",
      iconSource: illustratedIconSource("home", "homes-nearby"),
      allowed: premiumUnlocked,
      reasonCode: premiumUnlocked ? null : "plan_required",
    },
  ];

  const renderRow = (row: Row) => (
    <Pressable
      key={row.id}
      style={styles.actionRow}
      onPress={() => {
        if (row.allowed) {
          onClose();
          onAction(row.id as CreationAction);
        } else {
          goUpgrade();
        }
      }}
    >
      <View style={styles.actionIcon}>
        {row.iconSource ? (
          <Image source={row.iconSource} resizeMode="contain" style={styles.actionIconImage} />
        ) : (
          <Ionicons name={row.icon as any} size={22} color="#59ABE3" />
        )}
      </View>
      <View style={styles.actionInfo}>
        <Text style={styles.actionLabel}>{row.title}</Text>
        <Text style={styles.actionSubtitle}>{row.subtitle}</Text>
      </View>
      {row.allowed ? (
        <Ionicons name="chevron-forward" size={18} color="#264348" />
      ) : (
        <View style={styles.upgradePill}>
          <Text style={styles.upgradeText}>{t("creation.upgrade", "Αναβάθμισε")}</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t("creation.title", "Create")}</Text>
          <Text style={styles.subtitle}>
            {t("creation.seeAllSubtitle", "Όλες οι επιλογές — ό,τι χρειάζεται αναβάθμιση σε πάει στα πλάνα")}
          </Text>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {rows.map(renderRow)}
          </ScrollView>

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>{t("common.cancel", "Abbrechen")}</Text>
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
    maxHeight: SCREEN_HEIGHT * 0.88,
    ...Platform.select({
      web: { width: "100%", maxWidth: 1280, alignSelf: "center" },
    }),
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#264348",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "rgba(38,67,72,0.65)",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 24,
  },
  scroll: {
    paddingHorizontal: 16,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(38,67,72,0.08)",
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#f1f7fb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  actionIconImage: {
    width: 24,
    height: 24,
  },
  actionInfo: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#264348",
  },
  actionSubtitle: {
    fontSize: 12,
    color: "rgba(38,67,72,0.65)",
    marginTop: 2,
  },
  upgradePill: {
    alignItems: "center",
    backgroundColor: "#b8860b",
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  upgradeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.25)",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#264348",
  },
});

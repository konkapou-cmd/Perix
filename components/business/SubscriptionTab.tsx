import React, { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { applyVoucher } from "../../lib/api/subscriptions";

type Feature = {
  icon: string;
  titleKey: string;
  descKey: string;
  comingSoon?: boolean;
};

const FEATURES: Feature[] = [
  { icon: "map-outline", titleKey: "subscription.feature.map", descKey: "subscription.featureMapDesc" },
  { icon: "calendar-outline", titleKey: "subscription.feature.events", descKey: "subscription.featureEventsDesc" },
  { icon: "briefcase-outline", titleKey: "subscription.feature.jobs", descKey: "subscription.featureJobsDesc" },
  { icon: "bookmark-outline", titleKey: "subscription.feature.bookings", descKey: "subscription.featureBookingsDesc" },
  { icon: "images-outline", titleKey: "subscription.feature.gallery", descKey: "subscription.featureGalleryDesc" },
  { icon: "bar-chart-outline", titleKey: "subscription.feature.analytics", descKey: "subscription.featureAnalyticsDesc", comingSoon: true },
  { icon: "headset-outline", titleKey: "subscription.feature.support", descKey: "subscription.featureSupportDesc", comingSoon: true },
];

type Props = {
  sessionToken: string;
  businessId: string;
  subscriptionStatus?: string;
  planType?: string | null;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
};

export default function SubscriptionTab({
  sessionToken,
  businessId,
  subscriptionStatus,
  planType,
  primaryColor,
  cardColor,
  textColor,
}: Props) {
  const { t } = useTranslation();
  const [voucherCode, setVoucherCode] = useState("");
  const [applying, setApplying] = useState(false);

  const planLabel = t("subscription.free") || "Free";
  const planDesc = t("subscription.freeDesc") || "All features included at no cost";

  const handleApplyVoucher = async () => {
    if (!voucherCode.trim()) return;
    try {
      setApplying(true);
      await applyVoucher(sessionToken, voucherCode.trim(), businessId);
      Alert.alert(t("common.success") || "Success", t("subscription.voucherApplied") || "Voucher applied!");
      setVoucherCode("");
    } catch (e) {
      Alert.alert(t("common.error") || "Error", (e as Error)?.message || t("subscription.invalidVoucher") || "Invalid voucher code");
    } finally {
      setApplying(false);
    }
  };

  const pColor = primaryColor || COLORS.primary;
  const cColor = cardColor || COLORS.background;
  const tColor = textColor || COLORS.textPrimary;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <View style={[s.planCard, { backgroundColor: cColor }]}>
        <View style={s.planHeader}>
          <Ionicons name="rocket-outline" size={28} color={pColor} />
          <View style={s.planInfo}>
            <Text style={[s.planLabel, { color: tColor }]}>{t("subscription.currentPlan") || "Current Plan"}</Text>
            <View style={s.planBadgeRow}>
              <View style={[s.planBadge, { backgroundColor: COLORS.success }]}>
                <Text style={s.planBadgeText}>{planLabel}</Text>
              </View>
              <Text style={[s.planDesc, { color: COLORS.textMuted }]}>{planDesc}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[s.sectionCard, { backgroundColor: cColor }]}>
        <Text style={[s.sectionTitle, { color: tColor }]}>
          {t("subscription.featuresIncluded") || "All features included"}
        </Text>
        <View style={s.featuresGrid}>
          {FEATURES.map((feat) => (
            <View key={feat.titleKey} style={s.featureItem}>
              <View style={s.featureIconWrap}>
                <Ionicons name={feat.icon as any} size={20} color={pColor} />
              </View>
              <View style={s.featureTextWrap}>
                <Text style={[s.featureTitle, { color: tColor }]}>
                  {t(feat.titleKey)}
                  {feat.comingSoon ? (
                    <Text style={s.comingSoonBadge}> {t("subscription.comingSoon") || "Soon"}</Text>
                  ) : null}
                </Text>
                <Text style={s.featureDesc}>{t(feat.descKey)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[s.sectionCard, { backgroundColor: cColor }]}>
        <Text style={[s.sectionTitle, { color: tColor }]}>
          {t("subscription.benefitsTitle") || "With a subscription, your business gets:"}
        </Text>
        <Text style={s.benefitText}>{t("subscription.benefit1")}</Text>
        <Text style={s.benefitText}>{t("subscription.benefit2")}</Text>
        <Text style={s.benefitText}>{t("subscription.benefit3")}</Text>
        <Text style={s.benefitText}>{t("subscription.benefit4")}</Text>
      </View>

      <View style={[s.sectionCard, { backgroundColor: cColor }]}>
        <Text style={[s.sectionTitle, { color: tColor }]}>
          {t("subscription.haveVoucher") || "Have a voucher code?"}
        </Text>
        <View style={s.voucherRow}>
          <TextInput
            style={s.voucherInput}
            value={voucherCode}
            onChangeText={setVoucherCode}
            placeholder={t("subscription.enterVoucherCode") || "Enter voucher code"}
            placeholderTextColor={COLORS.textDisabled}
            autoCapitalize="characters"
          />
          <Pressable
            style={[s.voucherBtn, (!voucherCode.trim() || applying) && s.voucherBtnDisabled]}
            onPress={handleApplyVoucher}
            disabled={!voucherCode.trim() || applying}
          >
            {applying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.voucherBtnText}>{t("subscription.apply") || "Apply"}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={[s.upgradeCard, { backgroundColor: cColor }]}>
        <Ionicons name="star-outline" size={24} color={COLORS.textDisabled} />
        <View style={s.upgradeInfo}>
          <Text style={[s.upgradeTitle, { color: COLORS.textMuted }]}>
            {t("subscription.upgradeComingSoon") || "Paid plans coming soon"}
          </Text>
          <Text style={s.upgradeDesc}>{t("subscription.monthlyDesc")}</Text>
        </View>
      </View>

      <View style={{ height: SPACING.huge }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  planCard: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
  },
  planInfo: {
    flex: 1,
  },
  planLabel: {
    fontSize: FONT_SIZES.caption,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  planBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  planBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  planBadgeText: {
    color: "#fff",
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  planDesc: {
    fontSize: FONT_SIZES.small,
    flex: 1,
  },
  sectionCard: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: SPACING.lg,
  },
  featuresGrid: {
    gap: SPACING.lg,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextWrap: {
    flex: 1,
    paddingTop: SPACING.xs,
  },
  featureTitle: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  featureDesc: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  comingSoonBadge: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.warning,
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.sm,
    overflow: "hidden",
  },
  benefitText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING.xs,
    paddingLeft: SPACING.lg,
  },
  voucherRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  voucherInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.mdLg,
    fontSize: FONT_SIZES.body,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.backgroundPage,
  },
  voucherBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  voucherBtnDisabled: {
    opacity: 0.5,
  },
  voucherBtnText: {
    color: "#fff",
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  upgradeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
  },
  upgradeInfo: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  upgradeDesc: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textDisabled,
    marginTop: 2,
  },
});

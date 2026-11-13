import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Platform, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { COLORS } from "../../lib/designTokens";
import { useAuth } from "../../context/AuthContext";
import {
  redeemCode,
  fetchEntitlements,
  resendVerification,
  type EntitlementSnapshot,
} from "../../lib/api/account";

type Plan = {
  id: "free" | "premium" | "business" | "event_pro";
  name: string;
  monthly: string;
  tax?: string;
  yearly?: string;
  tagline: string;
  accent: string;
  patch?: boolean;
  suits?: string;
  categories?: string;
  features: { label: string; value: string }[];
};

const COMPARISON_ROWS: { label: string; free: string; premium: string; business: string; eventPro: string }[] = [
  { label: "Μηνύματα / μήνα", free: "30", premium: "Απεριόριστα", business: "Απεριόριστα", eventPro: "Απεριόριστα" },
  { label: "Posts", free: "3 εμφανή", premium: "12 εμφανή", business: "24 εμφανή", eventPro: "24 εμφανή" },
  { label: "Αγγελίες", free: "3 ενεργές", premium: "3 ενεργές", business: "Επαγγελματικές", eventPro: "Επαγγελματικές" },
  { label: "Προσωπικά προϊόντα", free: "—", premium: "10", business: "50", eventPro: "50" },
  { label: "Activities", free: "—", premium: "✓", business: "Ανά δικαίωμα", eventPro: "Ανά δικαίωμα" },
  { label: "Σπίτια", free: "—", premium: "1", business: "20", eventPro: "20" },
  { label: "Business Services", free: "—", premium: "—", business: "10", eventPro: "10" },
  { label: "Events", free: "—", premium: "—", business: "4", eventPro: "15 / μήνα" },
  { label: "Προβολές στον χάρτη", free: "—", premium: "—", business: "—", eventPro: "Συχνότερες" },
  { label: "Γκαλερί φωτό / βίντεο", free: "3 / —", premium: "12 / 6", business: "30 / 12", eventPro: "30 / 12" },
  { label: "City Ads", free: "—", premium: "—", business: "Επί πληρωμή", eventPro: "Επί πληρωμή" },
  { label: "Αιτήσεις εργασίας", free: "3 / μήνα", premium: "Απεριόριστες", business: "—", eventPro: "—" },
  { label: "Θέσεις εργασίας", free: "—", premium: "—", business: "10 / έτος", eventPro: "10 / έτος" },
];

export default function PlansScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken, user } = useAuth();
  const [redeemValue, setRedeemValue] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [entitlements, setEntitlements] = useState<EntitlementSnapshot | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailResendState, setEmailResendState] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    fetchEntitlements(sessionToken, "user")
      .then((snapshot) => {
        if (!cancelled) setEntitlements(snapshot);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const onResendEmail = async () => {
    if (!sessionToken || resendingEmail) return;
    setResendingEmail(true);
    setEmailResendState(null);
    try {
      const res = await resendVerification(sessionToken);
      setEmailResendState(res.status);
    } catch (e) {
      setEmailResendState("error");
    } finally {
      setResendingEmail(false);
    }
  };

  const onRedeem = async () => {
    const code = redeemValue.trim();
    if (!code) return;
    if (!sessionToken) {
      router.push("/login" as any);
      return;
    }
    setRedeeming(true);
    try {
      const result = await redeemCode(sessionToken, code);
      Alert.alert(
        result.ok
          ? t("plans.redeemSuccessTitle", "Κωδικός ενεργός")
          : t("plans.redeemErrorTitle", "Κωδικός μη διαθέσιμος"),
        result.message,
      );
      if (result.ok) setRedeemValue("");
    } catch (e) {
      Alert.alert(
        t("plans.redeemErrorTitle", "Κωδικός μη διαθέσιμος"),
        t("plans.redeemNetworkError", "Κάτι πήγε στραβά. Δοκίμασε ξανά."),
      );
    } finally {
      setRedeeming(false);
    }
  };

  const plans: Plan[] = [
    {
      id: "free",
      name: t("plans.free", "Free"),
      monthly: "0 €",
      tagline: t("plans.freeTagline", "Για να ξεκινήσεις στην κοινότητα"),
      accent: "#59ABE3",
      features: [
        { label: t("plans.featureMessages", "Μηνύματα"), value: "30 / μήνα" },
        { label: t("plans.featurePosts", "Posts"), value: "3 εμφανή" },
        { label: t("plans.featureAds", "Αγγελίες"), value: "3 ενεργές" },
        { label: t("plans.featureJobApplications", "Αιτήσεις εργασίας"), value: "3 / μήνα" },
      ],
    },
    {
      id: "premium",
      name: t("plans.premium", "Premium"),
      monthly: "9,90 €",
      yearly: "99 € / έτος",
      tagline: t("plans.premiumTagline", "Απεριόριστα μηνύματα, προϊόντα και δραστηριότητες"),
      accent: "#064472",
      features: [
        { label: t("plans.featureMessages", "Μηνύματα"), value: t("plans.unlimited", "Απεριόριστα") },
        { label: t("plans.featurePosts", "Posts"), value: "12 εμφανή" },
        { label: t("plans.featureProducts", "Προσωπικά προϊόντα"), value: "10" },
        { label: t("plans.featureHomes", "Σπίτια"), value: "1" },
        { label: t("plans.featureActivities", "Activities"), value: "✓" },
        { label: t("plans.featureJobApplications", "Αιτήσεις εργασίας"), value: t("plans.unlimited", "Απεριόριστες") },
      ],
    },
    {
      id: "business",
      name: t("plans.business", "Business"),
      monthly: t("plans.businessMonthly", "39,90 €"),
      tax: t("plans.taxSuffix", "+ φόρος"),
      yearly: t("plans.businessYearly", "399 € / έτος"),
      tagline: t("plans.businessTagline", "Επαγγελματικό προφίλ, υπηρεσίες και Events"),
      accent: "#1E3A8A",
      features: [
        { label: t("plans.featureMessages", "Μηνύματα"), value: t("plans.unlimited", "Απεριόριστα") },
        { label: t("plans.featurePosts", "Posts"), value: "24 εμφανή" },
        { label: t("plans.featureProducts", "Προϊόντα"), value: "50" },
        { label: t("plans.featureServices", "Business Services"), value: "10" },
        { label: t("plans.featureEvents", "Events"), value: "4" },
        { label: t("plans.featureHomes", "Ακίνητα"), value: "20" },
        { label: t("plans.featureCityAds", "City Ads"), value: "Επί πληρωμή" },
        { label: t("plans.featureJobPosts", "Θέσεις εργασίας"), value: "10 / έτος" },
      ],
    },
    {
      id: "event_pro",
      name: t("plans.eventPro", "Event Pro"),
      monthly: t("plans.eventProMonthly", "89,90 €"),
      tax: t("plans.taxSuffix", "+ φόρος"),
      tagline: t("plans.eventProTagline", "Business + patch: 15 Events/μήνα και συχνότερες προβολές στον χάρτη"),
      accent: "#1E3A8A",
      patch: true,
      suits: t("plans.eventProSuits", "Διοργανωτές, χώρους, promoters"),
      categories: t(
        "plans.eventProCategories",
        "Entertainment & Events · Nightlife & Social · Sports & Fitness · Food & Dining",
      ),
      features: [
        { label: t("plans.featureMessages", "Μηνύματα"), value: t("plans.unlimited", "Απεριόριστα") },
        { label: t("plans.featureEvents", "Events"), value: "15 / μήνα" },
        { label: t("plans.featureMapViews", "Προβολές στον χάρτη"), value: t("plans.mapViewsMore", "Συχνότερες") },
        { label: t("plans.featurePosts", "Posts"), value: t("plans.postsVisible", "24 εμφανή") },
        { label: t("plans.featureProducts", "Προϊόντα"), value: "50" },
        { label: t("plans.featureServices", "Business Services"), value: "10" },
        { label: t("plans.featureHomes", "Ακίνητα"), value: "20" },
        { label: t("plans.featureCityAds", "City Ads"), value: "Επί πληρωμή" },
        { label: t("plans.featureJobPosts", "Θέσεις εργασίας"), value: "10 / έτος" },
      ],
    },
  ];

  const onSelect = (plan: Plan) => {
    if (plan.id === "free") {
      Alert.alert(
        t("plans.freeSelectedTitle", "Free πλάνο"),
        t("plans.freeSelectedBody", "Το Free πλάνο είναι ήδη ενεργό για τον λογαριασμό σου."),
      );
      return;
    }
    Alert.alert(
      t("plans.soonTitle", "Σύντομα διαθέσιμο"),
      t(
        "plans.soonBody",
        "Η ενεργοποίηση των πληρωμένων πλάνων θα είναι διαθέσιμη σύντομα. Θα σε ειδοποιήσουμε!",
      ),
    );
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/home" as any);
    }
  };

  return (
    <View style={styles.container}>
      {/* Mobile only: the page keeps a simple back + title header. On web the
          app's own global TopNavbar is already visible — no extra bar here. */}
      {Platform.OS !== "web" ? (
        <View style={styles.topBar}>
          <Pressable onPress={goBack} style={styles.backBtn} accessibilityRole="button">
            <Ionicons name="chevron-back" size={22} color="#264348" />
          </Pressable>
          <Text style={styles.topTitle}>{t("plans.title", "Πλάνα & Συνδρομές")}</Text>
          <View style={{ width: 40 }} />
        </View>
      ) : (
        <Text style={styles.pageTitle}>{t("plans.title", "Πλάνα & Συνδρομές")}</Text>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heroSubtitle}>
          {t("plans.heroSubtitle", "Διάβασε, σύγκρινε και επίλεξε. Μπορείς να αλλάξεις πλάνο όποτε θέλεις.")}
        </Text>

        <View style={styles.redeemCard}>
          <View style={styles.redeemRow}>
            <Ionicons name="key-outline" size={18} color="#59ABE3" />
            <Text style={styles.redeemLabel}>
              {t("plans.redeemTitle", "Έχεις κωδικό; Βάλ' τον εδώ:")}
            </Text>
          </View>
          <View style={styles.redeemInputRow}>
            <TextInput
              style={styles.redeemInput}
              value={redeemValue}
              onChangeText={setRedeemValue}
              placeholder={t("plans.redeemPlaceholder", "π.χ. User100")}
              placeholderTextColor="rgba(38,67,72,0.45)"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.redeemBtn, redeeming && { opacity: 0.6 }]}
              disabled={redeeming || !redeemValue.trim()}
              onPress={onRedeem}
              accessibilityRole="button"
            >
              <Text style={styles.redeemBtnText}>
                {redeeming ? "…" : t("plans.redeemAction", "Εξαργύρωσε")}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.redeemNote}>
            {t(
              "plans.redeemNote",
              "Οι κωδικοί ισχύουν για τους πρώτους 100. Μετά την ενεργοποίηση έχεις 2 μέρες να ολοκληρώσεις το προφίλ σου, αλλιώς το πλάνο επιστρέφει αυτόματα.",
            )}
          </Text>
        </View>

        {user && user.email_verified === false ? (
          <View style={styles.emailBanner}>
            <Ionicons name="mail-unread-outline" size={18} color="#264348" />
            <Text style={styles.emailBannerText}>
              {t("plans.verifyEmail", "Επιβεβαίωσε το email σου (έχεις 6 ώρες) για να μπορείς να προσθέτεις περιεχόμενο.")}
            </Text>
            <Pressable
              onPress={onResendEmail}
              disabled={resendingEmail}
              style={styles.emailResendBtn}
              accessibilityRole="button"
            >
              <Text style={styles.emailResendText}>
                {resendingEmail ? "…" : t("plans.resendEmail", "Αποστολή ξανά")}
              </Text>
            </Pressable>
            {emailResendState === "sent" ? (
              <Text style={styles.emailResendOk}>{t("plans.emailSent", "Στάλθηκε!")}</Text>
            ) : null}
          </View>
        ) : null}

        {entitlements ? (
          <View style={styles.myPlanCard}>
            <View style={styles.redeemRow}>
              <Ionicons name="ribbon-outline" size={18} color="#59ABE3" />
              <Text style={styles.redeemLabel}>
                {t("plans.myPlanTitle", "Το πλάνο σου")}:{" "}
                <Text style={styles.myPlanName}>
                  {entitlements.effective_plan === "premium_user"
                    ? "Premium"
                    : entitlements.effective_plan === "business"
                    ? "Business"
                    : "Free"}
                </Text>
              </Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t("plans.featureMessages", "Μηνύματα")}</Text>
              <Text style={styles.limitValue}>
                {entitlements.limits.messages_per_month == null
                  ? t("plans.unlimited", "Απεριόριστα")
                  : `${entitlements.usage.messages_sent_month ?? 0} / ${entitlements.limits.messages_per_month}`}
              </Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t("plans.featurePosts", "Posts")}</Text>
              <Text style={styles.limitValue}>{entitlements.limits.posts ?? "—"}</Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t("plans.limitGallery", "Γκαλερί φωτό / βίντεο")}</Text>
              <Text style={styles.limitValue}>
                {`${entitlements.limits.gallery_photos ?? 0} / ${entitlements.limits.gallery_videos ?? 0}`}
              </Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t("plans.featureAds", "Αγγελίες")}</Text>
              <Text style={styles.limitValue}>{entitlements.limits.classified_ads ?? "—"}</Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t("plans.featureProducts", "Προσωπικά προϊόντα")}</Text>
              <Text style={styles.limitValue}>{entitlements.limits.personal_products ?? "—"}</Text>
            </View>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t("plans.featureHomes", "Σπίτια")}</Text>
              <Text style={styles.limitValue}>{entitlements.limits.personal_homes ?? "—"}</Text>
            </View>
            {entitlements.redemption && !entitlements.redemption.reverted && entitlements.redemption.profile_complete_deadline ? (
              <Text style={styles.limitDeadline}>
                {t("plans.completeBy", "Ολοκλήρωσε το προφίλ σου έως")}{" "}
                {new Date(entitlements.redemption.profile_complete_deadline).toLocaleDateString("el-GR")}
              </Text>
            ) : null}
            {entitlements.redemption?.reverted ? (
              <Text style={styles.limitDeadline}>
                {t("plans.planReverted", "Το πλάνο επέστρεψε επειδή δεν ολοκληρώθηκε το προφίλ εγκαίρως.")}
              </Text>
            ) : null}
          </View>
        ) : null}

        {plans.map((plan) => (
          <View key={plan.id} style={[styles.planCard, { borderColor: plan.accent }]}>
            <View style={styles.planHeader}>
              <View style={styles.planNameRow}>
                <Text style={[styles.planName, { color: plan.accent }]}>{plan.name}</Text>
                {plan.patch ? (
                  <View style={styles.patchBadge}>
                    <Text style={styles.patchBadgeText}>{t("plans.patch", "PATCH")}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.priceBox}>
                <Text style={[styles.price, { color: plan.accent }]}>{plan.monthly}</Text>
                {plan.tax ? <Text style={styles.taxSuffix}>{plan.tax}</Text> : null}
                <Text style={styles.priceSuffix}>/ {t("plans.perMonth", "μήνα")}</Text>
              </View>
            </View>
            <View style={styles.planBody}>
              <Text style={styles.planTagline}>{plan.tagline}</Text>
              {plan.yearly ? (
                <Text style={styles.yearly}>
                  {plan.yearly}
                  {plan.tax ? <Text style={styles.yearlyTax}> {plan.tax}</Text> : null}
                </Text>
              ) : null}
              {plan.features.map((feature) => (
                <View key={feature.label} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={plan.accent} />
                  <Text style={styles.featureLabel}>{feature.label}</Text>
                  <Text style={styles.featureValue}>{feature.value}</Text>
                </View>
              ))}
              {plan.suits ? (
                <View style={styles.patchRow}>
                  <Ionicons name="people-outline" size={16} color="#1E3A8A" />
                  <Text style={styles.patchRowLabel}>{t("plans.patchSuits", "Ταιριάζει σε")}</Text>
                  <Text style={[styles.patchRowValue, styles.patchSuitValue]}>{plan.suits}</Text>
                </View>
              ) : null}
              {plan.categories ? (
                <Text style={styles.patchCategories}>
                  {t("plans.categoriesLabel", "Κατηγορίες: ")}
                  {plan.categories}
                </Text>
              ) : null}
              <Pressable
                style={[styles.selectBtn, { backgroundColor: plan.accent }]}
                onPress={() => onSelect(plan)}
                accessibilityRole="button"
              >
                <Text style={styles.selectBtnText}>{t("plans.use", "Χρησιμοποίησε")}</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Text style={styles.compareTitle}>{t("plans.compare", "Σύγκριση πλάνων")}</Text>
        <View style={styles.compareTable}>
          <View style={styles.compareHeaderRow}>
            <Text style={styles.compareFeatureHead}>{t("plans.featureColumn", "Δυνατότητα")}</Text>
            <Text style={styles.compareHead}>Free</Text>
            <Text style={styles.compareHead}>Premium</Text>
            <Text style={styles.compareHead}>Business</Text>
            <Text style={styles.compareHead}>Event Pro</Text>
          </View>
          {COMPARISON_ROWS.map((row) => (
            <View key={row.label} style={styles.compareRow}>
              <Text style={styles.compareFeature}>{row.label}</Text>
              <Text style={styles.compareCell}>{row.free}</Text>
              <Text style={styles.compareCell}>{row.premium}</Text>
              <Text style={styles.compareCell}>{row.business}</Text>
              <Text style={styles.compareCell}>{row.eventPro}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          {t("plans.footnote", "Δοκιμαστικές τιμές. Καμία χρέωση δεν πραγματοποιείται ακόμη.")}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage ?? "#f5f8fa",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "web" ? 16 : 54,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  topTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#59ABE3",
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#59ABE3",
    marginTop: 14,
    marginHorizontal: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "rgba(38,67,72,0.7)",
    marginTop: 6,
    marginBottom: 14,
  },
  redeemCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(89,171,227,0.45)",
  },
  redeemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  redeemLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#264348",
  },
  redeemInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  redeemInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.25)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#264348",
  },
  redeemBtn: {
    backgroundColor: "#59ABE3",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 108,
    alignItems: "center",
  },
  redeemBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  redeemNote: {
    fontSize: 11,
    color: "rgba(38,67,72,0.55)",
    marginTop: 8,
  },
  emailBanner: {
    backgroundColor: COLORS.warningLight ?? "#FFF1B8",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.warning ?? "#FFC400",
    gap: 6,
  },
  emailBannerText: {
    fontSize: 12,
    color: "#264348",
    lineHeight: 17,
  },
  emailResendBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#59ABE3",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  emailResendText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  emailResendOk: {
    fontSize: 11,
    color: COLORS.success ?? "#22C55E",
    fontWeight: "700",
  },
  myPlanCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(89,171,227,0.45)",
  },
  myPlanName: {
    fontWeight: "800",
    color: "#59ABE3",
  },
  limitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(38,67,72,0.06)",
  },
  limitLabel: {
    fontSize: 13,
    color: "#264348",
  },
  limitValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#264348",
  },
  limitDeadline: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F4788",
    marginTop: 8,
  },
  planCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 14,
    overflow: "hidden",
  },
  planHeader: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(38,67,72,0.1)",
  },
  planNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  planName: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  priceBox: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 3,
  },
  price: {
    fontSize: 20,
    fontWeight: "800",
  },
  taxSuffix: {
    color: "rgba(38,67,72,0.55)",
    fontSize: 10,
    fontWeight: "600",
  },
  priceSuffix: {
    color: "rgba(38,67,72,0.7)",
    fontSize: 11,
  },
  planBody: {
    padding: 14,
  },
  planTagline: {
    fontSize: 14,
    color: "#264348",
    marginBottom: 4,
  },
  yearly: {
    fontSize: 12,
    color: "rgba(38,67,72,0.6)",
    marginBottom: 8,
  },
  yearlyTax: {
    fontSize: 9,
    color: "rgba(38,67,72,0.5)",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  featureLabel: {
    flex: 1,
    fontSize: 13,
    color: "#264348",
  },
  featureValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#264348",
  },
  selectBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  selectBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  compareTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#264348",
    marginTop: 14,
    marginBottom: 8,
  },
  compareTable: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
  },
  compareHeaderRow: {
    flexDirection: "row",
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(38,67,72,0.1)",
  },
  compareFeatureHead: {
    flex: 2.2,
    fontSize: 12,
    fontWeight: "700",
    color: "#264348",
  },
  compareHead: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#264348",
    textAlign: "center",
  },
  compareRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(38,67,72,0.06)",
  },
  compareFeature: {
    flex: 2.2,
    fontSize: 12,
    color: "rgba(38,67,72,0.8)",
  },
  compareCell: {
    flex: 1,
    fontSize: 12,
    color: "#264348",
    textAlign: "center",
  },
  patchBadge: {
    backgroundColor: "#1E3A8A",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  patchBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
  patchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  patchRowLabel: {
    flex: 1,
    fontSize: 13,
    color: "#264348",
  },
  patchRowValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#264348",
    flexShrink: 1,
    textAlign: "right",
  },
  patchSuitValue: {
    fontWeight: "600",
  },
  patchCategories: {
    fontSize: 12,
    color: "rgba(38,67,72,0.7)",
    marginTop: 6,
    lineHeight: 17,
  },
  footnote: {
    fontSize: 11,
    color: "rgba(38,67,72,0.5)",
    textAlign: "center",
    marginTop: 16,
  },
});

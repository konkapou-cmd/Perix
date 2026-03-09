import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { 
  getMyBusinesses, 
  Business,
  // Stripe functions
  getStripeSubscriptionPlans,
  validateVoucher,
  validatePromoterCode,
  createSubscriptionCheckout,
  getCheckoutStatus,
  SubscriptionPlan as StripePlan,
} from "../lib/api";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import Constants from "expo-constants";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "";

type SubscriptionPlanType = "monthly" | "yearly";

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { safeGoBackToProfile, router } = useSafeNavigation();
  const { sessionToken } = useAuth();
  const params = useLocalSearchParams<{ session_id?: string }>();
  
  const [loading, setLoading] = useState(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanType>("yearly");
  const [subscribing, setSubscribing] = useState(false);
  
  // Stripe plans state
  const [stripePlans, setStripePlans] = useState<StripePlan[]>([]);
  
  // Voucher state
  const [voucherCode, setVoucherCode] = useState("");
  const [applyingVoucher, setApplyingVoucher] = useState(false);
  const [voucherValid, setVoucherValid] = useState<boolean | null>(null);
  const [voucherInfo, setVoucherInfo] = useState<any>(null);
  const [voucherMessage, setVoucherMessage] = useState<{type: "success" | "error", text: string} | null>(null);
  
  // Promoter/Referral state
  const [promoterCode, setPromoterCode] = useState("");
  const [promoterValid, setPromoterValid] = useState<boolean | null>(null);
  const [promoterName, setPromoterName] = useState("");
  const [checkingPromoter, setCheckingPromoter] = useState(false);
  
  // Payment status checking
  const [checkingStatus, setCheckingStatus] = useState(false);

  const loadBusinesses = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await getMyBusinesses(sessionToken);
      setBusinesses(data || []);
      if (data?.length > 0) {
        setSelectedBusiness(data[0]);
      }
    } catch (error) {
      console.error("Failed to load businesses:", error);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  const loadStripePlans = useCallback(async () => {
    try {
      const result = await getStripeSubscriptionPlans();
      setStripePlans(result.plans);
    } catch (error) {
      console.error("Failed to load Stripe plans:", error);
      // Fallback plans
      setStripePlans([
        { plan_id: "business_monthly", name: "Monthly", price: 29.90, interval: "month", features: [], currency: "EUR" },
        { plan_id: "business_yearly", name: "Yearly", price: 299.00, interval: "year", features: [], currency: "EUR" },
      ]);
    }
  }, []);

  // Check if returning from Stripe payment
  useEffect(() => {
    if (params.session_id && sessionToken) {
      checkPaymentStatus(params.session_id);
    }
  }, [params.session_id, sessionToken]);

  useEffect(() => {
    loadBusinesses();
    loadStripePlans();
  }, [loadBusinesses, loadStripePlans]);

  const checkPaymentStatus = async (sessionId: string) => {
    if (!sessionToken) return;
    setCheckingStatus(true);
    
    let attempts = 0;
    const maxAttempts = 10;
    
    const poll = async () => {
      try {
        const status = await getCheckoutStatus(sessionToken, sessionId);
        
        if (status.payment_status === "paid") {
          Alert.alert(
            t("subscription.success") || "Success!",
            t("subscription.subscriptionActivated") || "Your business subscription is now active!",
            [{ text: "OK", onPress: () => loadBusinesses() }]
          );
          setCheckingStatus(false);
          return;
        }
        
        if (status.status === "expired" || attempts >= maxAttempts) {
          Alert.alert(
            t("subscription.failed") || "Payment Issue",
            t("subscription.checkLater") || "Please check your subscription status later."
          );
          setCheckingStatus(false);
          return;
        }
        
        attempts++;
        setTimeout(poll, 2000);
      } catch (error) {
        console.error("Status check error:", error);
        setCheckingStatus(false);
      }
    };
    
    await poll();
  };

  const getSubscriptionStatus = (business: Business) => {
    if (business.subscription_status === "active") {
      return { status: t("subscription.active"), color: "#10b981" };
    }
    if (business.subscription_status === "trial" && business.trial_expires_at) {
      const diff = new Date(business.trial_expires_at).getTime() - Date.now();
      const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      return { status: `${t("subscription.trial")} (${days} ${t("subscription.daysLeft")})`, color: "#f59e0b" };
    }
    return { status: t("subscription.inactive"), color: "#ef4444" };
  };

  // Stripe subscribe handler
  const handleStripeSubscribe = async () => {
    if (!sessionToken || !selectedBusiness) return;
    
    try {
      setSubscribing(true);
      const originUrl = BACKEND_URL.replace("/api", "");
      
      const result = await createSubscriptionCheckout(
        sessionToken,
        selectedBusiness.business_id,
        selectedPlan,
        originUrl,
        voucherValid ? voucherCode : undefined,
        promoterValid ? promoterCode : undefined
      );

      // Open Stripe checkout
      const supported = await Linking.canOpenURL(result.checkout_url);
      if (supported) {
        await Linking.openURL(result.checkout_url);
      } else {
        // Fallback to WebBrowser
        await WebBrowser.openBrowserAsync(result.checkout_url);
      }
    } catch (error: any) {
      Alert.alert(
        t("subscription.error") || "Error",
        error?.message || t("subscription.subscriptionFailed") || "Failed to start checkout"
      );
    } finally {
      setSubscribing(false);
    }
  };

  // Validate voucher
  const handleValidateVoucher = async () => {
    if (!voucherCode.trim()) return;
    
    setApplyingVoucher(true);
    setVoucherMessage(null);
    
    try {
      const result = await validateVoucher(voucherCode);
      setVoucherValid(result.valid);
      setVoucherInfo(result);
      
      if (result.valid) {
        setVoucherMessage({ type: "success", text: result.description || "Voucher applied!" });
      } else {
        setVoucherMessage({ type: "error", text: result.message || "Invalid voucher code" });
      }
    } catch (error: any) {
      setVoucherValid(false);
      setVoucherMessage({ type: "error", text: "Error validating voucher" });
    } finally {
      setApplyingVoucher(false);
    }
  };

  // Validate promoter code
  const handleValidatePromoter = async () => {
    if (!promoterCode.trim()) return;
    
    setCheckingPromoter(true);
    try {
      const result = await validatePromoterCode(promoterCode);
      setPromoterValid(result.valid);
      if (result.valid && result.promoter_name) {
        setPromoterName(result.promoter_name);
      }
    } catch (error) {
      setPromoterValid(false);
    } finally {
      setCheckingPromoter(false);
    }
  };

  // Get current price based on plan and voucher
  const getCurrentPrice = () => {
    const plan = stripePlans.find(p => p.interval === (selectedPlan === "monthly" ? "month" : "year"));
    if (!plan) return 0;
    
    if (voucherValid && voucherInfo?.discount_type === "special_pricing") {
      return selectedPlan === "monthly" ? voucherInfo.monthly_price : voucherInfo.yearly_price;
    }
    
    return plan.price;
  };

  const getOriginalPrice = () => {
    const plan = stripePlans.find(p => p.interval === (selectedPlan === "monthly" ? "month" : "year"));
    return plan?.price || 0;
  };

  // Calculate savings for yearly plan
  const getSavings = () => {
    if (selectedPlan === "yearly") {
      const monthlyPlan = stripePlans.find(p => p.interval === "month");
      const yearlyPlan = stripePlans.find(p => p.interval === "year");
      if (monthlyPlan && yearlyPlan) {
        return (monthlyPlan.price * 12) - yearlyPlan.price;
      }
    }
    return 0;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#4c6fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBackToProfile} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>{t("subscription.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {businesses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>{t("subscription.noBusinesses")}</Text>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push("/business-dashboard")}
            >
              <Text style={styles.primaryButtonText}>{t("subscription.createBusiness")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Business Selector */}
            <Text style={styles.sectionTitle}>{t("subscription.selectBusiness")}</Text>
            {businesses.map((business) => {
              const { status, color } = getSubscriptionStatus(business);
              return (
                <Pressable
                  key={business.business_id}
                  style={[
                    styles.businessCard,
                    selectedBusiness?.business_id === business.business_id && styles.selectedCard,
                  ]}
                  onPress={() => setSelectedBusiness(business)}
                >
                  <View style={styles.businessInfo}>
                    <Text style={styles.businessName}>{business.name}</Text>
                    <Text style={styles.businessCategory}>{business.category}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: color + "20" }]}>
                    <Text style={[styles.statusText, { color }]}>{status}</Text>
                  </View>
                </Pressable>
              );
            })}

            {/* Subscription Plans */}
            <Text style={styles.sectionTitle}>{t("subscription.choosePlan")}</Text>
            
            {stripePlans.length > 0 ? (
              <>
                <Pressable
                  style={[styles.planCard, selectedPlan === "monthly" && styles.selectedPlan]}
                  onPress={() => setSelectedPlan("monthly")}
                  data-testid="plan-monthly"
                >
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>{t("subscription.monthly")}</Text>
                    {selectedPlan === "monthly" && (
                      <Ionicons name="checkmark-circle" size={24} color="#4c6fff" />
                    )}
                  </View>
                  <Text style={styles.planPrice}>
                    €{voucherValid && voucherInfo?.discount_type === "special_pricing" 
                      ? voucherInfo.monthly_price 
                      : stripePlans.find(p => p.interval === "month")?.price || "29.90"}
                  </Text>
                  <Text style={styles.planInterval}>{t("subscription.perMonth") || "per month"}</Text>
                  {voucherValid && voucherInfo?.discount_type === "special_pricing" && (
                    <Text style={styles.originalPrice}>€{stripePlans.find(p => p.interval === "month")?.price}</Text>
                  )}
                </Pressable>

                <Pressable
                  style={[styles.planCard, selectedPlan === "yearly" && styles.selectedPlan]}
                  onPress={() => setSelectedPlan("yearly")}
                  data-testid="plan-yearly"
                >
                  {getSavings() > 0 && (
                    <View style={styles.saveBadge}>
                      <Text style={styles.saveText}>{t("subscription.save") || "Save"} €{getSavings().toFixed(0)}</Text>
                    </View>
                  )}
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>{t("subscription.yearly")}</Text>
                    {selectedPlan === "yearly" && (
                      <Ionicons name="checkmark-circle" size={24} color="#4c6fff" />
                    )}
                  </View>
                  <Text style={styles.planPrice}>
                    €{voucherValid && voucherInfo?.discount_type === "special_pricing" 
                      ? voucherInfo.yearly_price 
                      : stripePlans.find(p => p.interval === "year")?.price || "299.00"}
                  </Text>
                  <Text style={styles.planInterval}>{t("subscription.perYear") || "per year"}</Text>
                  <Text style={styles.monthlyEquivalent}>
                    {t("subscription.monthlyEquiv") || "≈ €"}{Math.floor((voucherValid && voucherInfo?.discount_type === "special_pricing" ? voucherInfo.yearly_price : stripePlans.find(p => p.interval === "year")?.price || 299) / 12)}{t("subscription.perMonthShort") || "/mo"}
                  </Text>
                  {voucherValid && voucherInfo?.discount_type === "special_pricing" && (
                    <Text style={styles.originalPrice}>€{stripePlans.find(p => p.interval === "year")?.price}</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <View style={styles.loadingPlans}>
                <ActivityIndicator color="#4c6fff" />
                <Text style={styles.loadingText}>{t("subscription.loadingPlans")}</Text>
              </View>
            )}

            {/* Marketing Copy */}
            <View style={styles.marketingSection}>
              <Text style={styles.headline}>{t("subscription.headline")}</Text>
              <Text style={styles.subheadline}>{t("subscription.subheadline")}</Text>
              
              <Text style={styles.benefitsTitle}>{t("subscription.benefitsTitle")}</Text>
              <View style={styles.featureList}>
                {[
                  t("subscription.benefit1"),
                  t("subscription.benefit2"),
                  t("subscription.benefit3"),
                  t("subscription.benefit4"),
                ].map((benefit, index) => (
                  <View key={index} style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    <Text style={styles.featureText}>{benefit}</Text>
                  </View>
                ))}
              </View>
              
              <Text style={styles.noAlgorithms}>{t("subscription.noAlgorithms")}</Text>
            </View>

            {/* Voucher Code Section */}
            <View style={styles.voucherSection}>
              <Text style={styles.voucherTitle}>{t("subscription.haveVoucher") || "Have a voucher code?"}</Text>
              <View style={styles.voucherInputRow}>
                <TextInput
                  style={styles.voucherInput}
                  placeholder={t("subscription.enterVoucherCode") || "Enter voucher code"}
                  value={voucherCode}
                  onChangeText={setVoucherCode}
                  autoCapitalize="characters"
                  placeholderTextColor="#999"
                />
                <Pressable 
                  style={[styles.voucherButton, (!voucherCode.trim() || applyingVoucher) && styles.buttonDisabled]}
                  onPress={handleValidateVoucher}
                  disabled={!voucherCode.trim() || applyingVoucher}
                >
                  {applyingVoucher ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.voucherButtonText}>{t("subscription.apply") || "Apply"}</Text>
                  )}
                </Pressable>
              </View>
              {voucherMessage && (
                <Text style={[
                  styles.voucherMessage, 
                  voucherMessage.type === "success" ? styles.voucherSuccess : styles.voucherError
                ]}>
                  {voucherMessage.text}
                </Text>
              )}
            </View>

            {/* Referral Code Section */}
            <View style={styles.voucherSection}>
              <Text style={styles.voucherTitle}>{t("subscription.haveReferral") || "Have a referral code? (Optional)"}</Text>
              <View style={styles.voucherInputRow}>
                <TextInput
                  style={styles.voucherInput}
                  placeholder={t("subscription.enterReferralCode") || "Enter referral code"}
                  value={promoterCode}
                  onChangeText={setPromoterCode}
                  autoCapitalize="characters"
                  placeholderTextColor="#999"
                />
                <Pressable 
                  style={[styles.voucherButton, (!promoterCode.trim() || checkingPromoter) && styles.buttonDisabled]}
                  onPress={handleValidatePromoter}
                  disabled={!promoterCode.trim() || checkingPromoter}
                >
                  {checkingPromoter ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.voucherButtonText}>{t("subscription.validate") || "Validate"}</Text>
                  )}
                </Pressable>
              </View>
              {promoterValid !== null && (
                <Text style={[
                  styles.voucherMessage, 
                  promoterValid ? styles.voucherSuccess : styles.voucherError
                ]}>
                  {promoterValid 
                    ? `${t("subscription.referredBy") || "Referred by"} ${promoterName}` 
                    : t("subscription.invalidReferral") || "Invalid referral code"}
                </Text>
              )}
            </View>

            {/* Price Summary */}
            <View style={styles.summarySection}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{t("subscription.total") || "Total"}</Text>
                <Text style={styles.summaryPrice}>€{getCurrentPrice().toFixed(2)}</Text>
              </View>
              {voucherValid && voucherInfo?.discount_type === "special_pricing" && (
                <View style={styles.summaryRow}>
                  <Text style={styles.discountLabel}>{t("subscription.youSave") || "You save"}</Text>
                  <Text style={styles.discountAmount}>
                    -€{(getOriginalPrice() - getCurrentPrice()).toFixed(2)}
                  </Text>
                </View>
              )}
              <Text style={styles.taxNote}>{t("subscription.taxIncluded") || "Tax included"}</Text>
            </View>

            {/* Subscribe Button */}
            <Pressable 
              style={[styles.subscribeButton, subscribing && styles.buttonDisabled]} 
              onPress={handleStripeSubscribe}
              disabled={subscribing || stripePlans.length === 0}
              data-testid="subscribe-button"
            >
              {subscribing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="card" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.subscribeButtonText}>
                    {selectedBusiness?.subscription_status === "active"
                      ? t("subscription.managePlan")
                      : t("subscription.subscribe") || "Subscribe Now"}
                  </Text>
                </>
              )}
            </Pressable>

            {checkingStatus && (
              <View style={styles.checkingStatusBox}>
                <ActivityIndicator color="#4c6fff" />
                <Text style={styles.checkingStatusText}>{t("subscription.checkingPayment") || "Checking payment status..."}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
    marginBottom: 20,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginTop: 20,
    marginBottom: 12,
  },
  businessCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedCard: {
    borderColor: "#4c6fff",
  },
  businessInfo: {
    flex: 1,
  },
  businessName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  businessCategory: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  planCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedPlan: {
    borderColor: "#4c6fff",
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  saveBadge: {
    backgroundColor: "#10b981",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  saveText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  planPrice: {
    fontSize: 24,
    fontWeight: "700",
    color: "#4c6fff",
    marginTop: 8,
  },
  planDescription: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 4,
  },
  featureList: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  featureText: {
    fontSize: 14,
    color: "#374151",
    marginLeft: 10,
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  subscribeButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 24,
    marginBottom: 12,
  },
  subscribeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  checkStatusButton: {
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 40,
    borderWidth: 1,
    borderColor: "#4c6fff",
  },
  checkStatusText: {
    color: "#4c6fff",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingPlans: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#6b7280",
    marginTop: 8,
  },
  marketingSection: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  headline: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  subheadline: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  noAlgorithms: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 16,
    fontStyle: "italic",
    lineHeight: 20,
  },
  comparison: {
    fontSize: 14,
    color: "#374151",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
  },
  callToAction: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4c6fff",
    textAlign: "center",
    marginTop: 16,
  },
  // Voucher styles
  voucherSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  voucherTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#166534",
    marginBottom: 12,
  },
  voucherInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  voucherInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  voucherButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: "center",
  },
  voucherButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  voucherMessage: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "500",
  },
  voucherSuccess: {
    color: "#166534",
  },
  voucherError: {
    color: "#dc2626",
  },
  // New styles for updated UI
  planInterval: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 2,
  },
  monthlyEquivalent: {
    color: "#4c6fff",
    fontSize: 12,
    marginTop: 4,
  },
  originalPrice: {
    color: "#9ca3af",
    fontSize: 14,
    textDecorationLine: "line-through" as const,
    marginTop: 4,
  },
  summarySection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 8,
  },
  summaryLabel: {
    color: "#6b7280",
    fontSize: 15,
  },
  summaryPrice: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700" as const,
  },
  discountLabel: {
    color: "#22c55e",
    fontSize: 13,
  },
  discountAmount: {
    color: "#22c55e",
    fontSize: 15,
    fontWeight: "600" as const,
  },
  taxNote: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
  },
  checkingStatusBox: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: "#f0f4ff",
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
    gap: 12,
  },
  checkingStatusText: {
    color: "#4c6fff",
    fontSize: 14,
  },
});

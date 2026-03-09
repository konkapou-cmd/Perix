import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import { useAuth } from "../context/AuthContext";
import { LinearGradient } from "expo-linear-gradient";
import {
  registerAsPromoter,
  getPromoterProfile,
  PromoterInfo,
} from "../lib/api";
import * as Clipboard from "expo-clipboard";

export default function PromoterScreen() {
  const { t } = useTranslation();
  const { safeGoBack } = useSafeNavigation();
  const { sessionToken, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [promoterProfile, setPromoterProfile] = useState<(PromoterInfo & { recent_referrals?: any[] }) | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Registration form
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    bank_details: "",
  });

  const loadPromoterProfile = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const profile = await getPromoterProfile(sessionToken);
      setPromoterProfile(profile);
    } catch (error: any) {
      // Not a promoter yet - show registration form
      if (error.message?.includes("not registered")) {
        setPromoterProfile(null);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadPromoterProfile();
  }, [loadPromoterProfile]);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: user.display_name || user.username || "",
        email: user.email || "",
      }));
    }
  }, [user]);

  const handleRegister = async () => {
    if (!sessionToken) return;
    
    if (!formData.name.trim() || !formData.email.trim()) {
      Alert.alert(
        t("promoter.error") || "Error",
        t("promoter.fillRequired") || "Please fill in name and email"
      );
      return;
    }

    setIsRegistering(true);
    try {
      const result = await registerAsPromoter(sessionToken, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        bank_details: formData.bank_details.trim() || undefined,
      });
      
      Alert.alert(
        t("promoter.success") || "Success!",
        `${t("promoter.registeredMessage") || "You are now a promoter!"}\n\n${t("promoter.yourCode") || "Your code"}: ${result.promoter_code}`,
        [{ text: "OK", onPress: () => loadPromoterProfile() }]
      );
    } catch (error: any) {
      Alert.alert(
        t("promoter.error") || "Error",
        error.message || t("promoter.registrationFailed") || "Registration failed"
      );
    } finally {
      setIsRegistering(false);
    }
  };

  const copyCode = async () => {
    if (promoterProfile?.promoter_code) {
      await Clipboard.setStringAsync(promoterProfile.promoter_code);
      Alert.alert(t("promoter.copied") || "Copied!", t("promoter.codeCopied") || "Code copied to clipboard");
    }
  };

  const shareCode = async () => {
    if (promoterProfile?.promoter_code) {
      try {
        await Share.share({
          message: `${t("promoter.shareMessage") || "Join Perix with my referral code"}: ${promoterProfile.promoter_code}\n\nDownload the app and use this code when subscribing to get started!`,
        });
      } catch (error) {
        console.error("Share error:", error);
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4c6fff" />
          <Text style={styles.loadingText}>{t("common.loading") || "Loading..."}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={safeGoBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("promoter.title") || "Promoter Program"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {promoterProfile ? (
          // Promoter Dashboard
          <>
            {/* Hero Card with Code */}
            <LinearGradient
              colors={["#4c6fff", "#6366f1"]}
              style={styles.heroCard}
            >
              <Ionicons name="trophy" size={40} color="#fff" />
              <Text style={styles.heroTitle}>{t("promoter.welcomeBack") || "Welcome, Promoter!"}</Text>
              <Text style={styles.heroName}>{promoterProfile.name}</Text>
              
              <View style={styles.codeContainer}>
                <Text style={styles.codeLabel}>{t("promoter.yourReferralCode") || "Your Referral Code"}</Text>
                <View style={styles.codeBox}>
                  <Text style={styles.codeText}>{promoterProfile.promoter_code}</Text>
                  <Pressable style={styles.copyBtn} onPress={copyCode}>
                    <Ionicons name="copy" size={20} color="#4c6fff" />
                  </Pressable>
                </View>
              </View>

              <Pressable style={styles.shareBtn} onPress={shareCode}>
                <Ionicons name="share-social" size={20} color="#4c6fff" />
                <Text style={styles.shareBtnText}>{t("promoter.shareCode") || "Share Code"}</Text>
              </Pressable>
            </LinearGradient>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{promoterProfile.total_referrals || 0}</Text>
                <Text style={styles.statLabel}>{t("promoter.referrals") || "Referrals"}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: "#10b981" }]}>
                  €{(promoterProfile.total_earnings || 0).toFixed(2)}
                </Text>
                <Text style={styles.statLabel}>{t("promoter.totalEarned") || "Total Earned"}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: "#f59e0b" }]}>
                  €{(promoterProfile.pending_payout || 0).toFixed(2)}
                </Text>
                <Text style={styles.statLabel}>{t("promoter.pendingPayout") || "Pending"}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{promoterProfile.share_percentage || 30}%</Text>
                <Text style={styles.statLabel}>{t("promoter.commission") || "Commission"}</Text>
              </View>
            </View>

            {/* How It Works */}
            <View style={styles.howItWorks}>
              <Text style={styles.sectionTitle}>{t("promoter.howItWorks") || "How It Works"}</Text>
              
              <View style={styles.stepItem}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{t("promoter.step1Title") || "Share Your Code"}</Text>
                  <Text style={styles.stepDesc}>{t("promoter.step1Desc") || "Share your unique referral code with businesses"}</Text>
                </View>
              </View>
              
              <View style={styles.stepItem}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{t("promoter.step2Title") || "They Subscribe"}</Text>
                  <Text style={styles.stepDesc}>{t("promoter.step2Desc") || "When they subscribe using your code, you earn"}</Text>
                </View>
              </View>
              
              <View style={styles.stepItem}>
                <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{t("promoter.step3Title") || "Get Paid"}</Text>
                  <Text style={styles.stepDesc}>{t("promoter.step3Desc") || "Receive 30% of each subscription payment"}</Text>
                </View>
              </View>
            </View>

            {/* Recent Referrals */}
            {promoterProfile.recent_referrals && promoterProfile.recent_referrals.length > 0 && (
              <View style={styles.recentSection}>
                <Text style={styles.sectionTitle}>{t("promoter.recentReferrals") || "Recent Referrals"}</Text>
                {promoterProfile.recent_referrals.map((referral, index) => (
                  <View key={index} style={styles.referralItem}>
                    <View style={styles.referralIcon}>
                      <Ionicons name="business" size={20} color="#4c6fff" />
                    </View>
                    <View style={styles.referralInfo}>
                      <Text style={styles.referralPlan}>{referral.plan_type} plan</Text>
                      <Text style={styles.referralDate}>
                        {new Date(referral.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.referralAmount}>
                      +€{(referral.promoter_amount || 0).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          // Registration Form
          <>
            {/* Hero Section */}
            <LinearGradient
              colors={["#4c6fff", "#6366f1"]}
              style={styles.heroCard}
            >
              <Ionicons name="megaphone" size={48} color="#fff" />
              <Text style={styles.heroTitle}>{t("promoter.becomePromoter") || "Become a Promoter"}</Text>
              <Text style={styles.heroSubtitle}>
                {t("promoter.earnMoney") || "Earn 30% commission on every business subscription you refer"}
              </Text>
            </LinearGradient>

            {/* Benefits */}
            <View style={styles.benefitsSection}>
              <Text style={styles.sectionTitle}>{t("promoter.benefits") || "Benefits"}</Text>
              
              {[
                { icon: "cash", title: t("promoter.benefit1Title") || "Earn 30% Commission", desc: t("promoter.benefit1Desc") || "Get 30% of every subscription payment" },
                { icon: "infinite", title: t("promoter.benefit2Title") || "Recurring Income", desc: t("promoter.benefit2Desc") || "Earn every time your referrals renew" },
                { icon: "flash", title: t("promoter.benefit3Title") || "Instant Tracking", desc: t("promoter.benefit3Desc") || "See your earnings in real-time" },
                { icon: "wallet", title: t("promoter.benefit4Title") || "Easy Payouts", desc: t("promoter.benefit4Desc") || "Request payouts anytime" },
              ].map((benefit, index) => (
                <View key={index} style={styles.benefitItem}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name={benefit.icon as any} size={24} color="#4c6fff" />
                  </View>
                  <View style={styles.benefitContent}>
                    <Text style={styles.benefitTitle}>{benefit.title}</Text>
                    <Text style={styles.benefitDesc}>{benefit.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Registration Form */}
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>{t("promoter.registerNow") || "Register Now"}</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("promoter.name") || "Name"} *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.name}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                  placeholder={t("promoter.namePlaceholder") || "Your full name"}
                  placeholderTextColor="#6b7280"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("promoter.email") || "Email"} *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                  placeholder={t("promoter.emailPlaceholder") || "your@email.com"}
                  placeholderTextColor="#6b7280"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("promoter.phone") || "Phone"} ({t("common.optional") || "optional"})</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phone}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, phone: text }))}
                  placeholder={t("promoter.phonePlaceholder") || "+49 123 456 789"}
                  placeholderTextColor="#6b7280"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t("promoter.bankDetails") || "Bank Details"} ({t("common.optional") || "optional"})</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.bank_details}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, bank_details: text }))}
                  placeholder={t("promoter.bankPlaceholder") || "IBAN, PayPal email, etc."}
                  placeholderTextColor="#6b7280"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <Pressable 
                style={[styles.registerBtn, isRegistering && styles.btnDisabled]}
                onPress={handleRegister}
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="rocket" size={20} color="#fff" />
                    <Text style={styles.registerBtnText}>{t("promoter.startEarning") || "Start Earning"}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#6b7280",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  heroCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginTop: 16,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginTop: 12,
    textAlign: "center",
  },
  heroName: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    marginTop: 4,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  codeContainer: {
    marginTop: 20,
    alignItems: "center",
    width: "100%",
  },
  codeLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginBottom: 8,
  },
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 12,
  },
  codeText: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 2,
  },
  copyBtn: {
    padding: 4,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
    gap: 8,
  },
  shareBtnText: {
    color: "#4c6fff",
    fontSize: 15,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 20,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#141414",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  statValue: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  statLabel: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  howItWorks: {
    marginTop: 28,
  },
  stepItem: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 14,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#4c6fff",
    justifyContent: "center",
    alignItems: "center",
  },
  stepNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  stepDesc: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 2,
  },
  recentSection: {
    marginTop: 28,
  },
  referralItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  referralIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(76, 111, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  referralInfo: {
    flex: 1,
    marginLeft: 12,
  },
  referralPlan: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  referralDate: {
    color: "#6b7280",
    fontSize: 12,
  },
  referralAmount: {
    color: "#10b981",
    fontSize: 16,
    fontWeight: "600",
  },
  benefitsSection: {
    marginTop: 28,
  },
  benefitItem: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 14,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(76, 111, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  benefitDesc: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 2,
  },
  formSection: {
    marginTop: 28,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: "#d1d5db",
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#141414",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#222",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  registerBtn: {
    flexDirection: "row",
    backgroundColor: "#4c6fff",
    borderRadius: 12,
    paddingVertical: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    gap: 10,
  },
  registerBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

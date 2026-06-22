import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, LayoutAnimation } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "../lib/designTokens";

export default function HelpSupportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggleExpand = (i: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(expanded === i ? null : i);
  };

  const faqs = [
    {
      q: t("help.createEventQ") || "How do I create an event?",
      a: t("help.createEventA") || "Go to your profile, switch to your business identity, and tap the '+ Create Event' button. Fill in the event details, choose a theme, and publish."
    },
    {
      q: t("help.changePasswordQ") || "How do I change my password?",
      a: t("help.changePasswordA") || "Go to Settings → Account → Change Password. Enter your current password and your new password, then tap Save."
    },
    {
      q: t("help.reportContentQ") || "How do I report inappropriate content?",
      a: t("help.reportContentA") || "On any post, event, or profile, tap the three-dot menu (⋯) and select 'Report'. Our moderation team will review it within 24 hours."
    },
    {
      q: t("help.deleteAccountQ") || "How do I delete my account?",
      a: t("help.deleteAccountA") || "Go to Settings and tap 'Delete Account' in the Danger Zone section. You will be asked to confirm twice. This permanently removes all your data."
    },
    {
      q: t("help.businessQ") || "How do I create a business profile?",
      a: t("help.businessA") || "From your profile, tap the identity dropdown and select 'Upgrade to Business'. Choose your category, enter your business name, and start your 90-day free trial."
    },
    {
      q: t("help.subscriptionQ") || "What happens after my free trial?",
      a: t("help.subscriptionA") || "Your 90-day free trial gives you full access to all features. After the trial, you can subscribe to a paid plan to continue using business features. You will be notified before the trial ends."
    },
    {
      q: t("help.privacyQ") || "How is my data protected?",
      a: t("help.privacyA") || "We take data protection seriously. All data is encrypted in transit and at rest. We never sell your personal information. See our Privacy Policy for full details."
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("help.title") || "Help & Support"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>{t("help.faq") || "Frequently Asked Questions"}</Text>
        {faqs.map((faq, i) => (
          <Pressable key={i} style={styles.faqCard} onPress={() => toggleExpand(i)}>
            <View style={styles.faqHeader}>
              <Text style={styles.faqQuestion}>{faq.q}</Text>
              <Ionicons
                name={expanded === i ? "chevron-up" : "chevron-down"}
                size={18}
                color="#6b7280"
              />
            </View>
            {expanded === i && <Text style={styles.faqAnswer}>{faq.a}</Text>}
          </Pressable>
        ))}
        <View style={styles.contactCard}>
          <Ionicons name="mail" size={24} color="#000" />
          <Text style={styles.contactTitle}>{t("help.stillNeedHelp") || "Still need help?"}</Text>
          <Text style={styles.contactText}>{t("help.contactDesc") || "Reach out to our support team and we'll get back to you within 24 hours."}</Text>
          <Pressable
            style={styles.contactBtn}
            onPress={() => Linking.openURL("mailto:support@perix.app")}
          >
            <Ionicons name="send" size={16} color="#fff" />
            <Text style={styles.contactBtnText}>{t("help.emailUs") || "Email Support"}</Text>
          </Pressable>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#000",
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 12 },
  faqCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 8,
  },
  faqHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQuestion: { fontSize: 15, fontWeight: "600", color: COLORS.textPrimary, flex: 1, paddingRight: 8 },
  faqAnswer: { fontSize: 14, lineHeight: 22, color: "#374151", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  contactCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 20, marginTop: 16,
    alignItems: "center", gap: 8,
  },
  contactTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  contactText: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  contactBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#000", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  contactBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});

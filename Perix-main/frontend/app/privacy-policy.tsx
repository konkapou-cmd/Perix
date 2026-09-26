import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "../lib/designTokens";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";

export default function PrivacyPolicyScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const sections = [
    {
      title: t("privacy.controllerTitle") || "Data Controller",
      content: t("privacy.controllerContent") ||
        "The data controller responsible for your personal data is Perix (app.perixapp.com), operated by the Perix team.\n\nYou can contact us at any time:\n\n• Data protection: privacy@perix.app\n• General support: support@perix.app"
    },
    {
      title: t("privacy.dataCollection") || "Data Collection",
      content: t("privacy.dataCollectionContent") || 
        "We collect information you provide directly to us, such as when you create an account, update your profile, post content, or contact us for support. This includes your name, email address, phone number, profile photos, and any other information you choose to provide."
    },
    {
      title: t("privacy.dataUsage") || "How We Use Your Data",
      content: t("privacy.dataUsageContent") || 
        "We use the information we collect to:\n\n• Provide, maintain, and improve our services\n• Process transactions and send related information\n• Send you technical notices, updates, and support messages\n• Respond to your comments, questions, and requests\n• Monitor and analyze trends, usage, and activities\n• Detect, investigate, and prevent fraudulent transactions and other illegal activities"
    },
    {
      title: t("privacy.legalBasisTitle") || "Legal Basis (GDPR Art. 6)",
      content: t("privacy.legalBasisContent") ||
        "We process your personal data only on the following legal bases:\n\n• Performance of a contract (Art. 6(1)(b)) — providing your account and the app's features\n• Legitimate interests (Art. 6(1)(f)) — keeping the service secure, preventing fraud and abuse, moderating content and protecting users\n• Consent (Art. 6(1)(a)) — where you have given consent, e.g. for optional notifications\n• Legal obligations (Art. 6(1)(c)) — tax, accounting and law-enforcement requirements\n\nYou may withdraw consent at any time without affecting the lawfulness of earlier processing."
    },
    {
      title: t("privacy.dataSharing") || "Information Sharing",
      content: t("privacy.dataSharingContent") || 
        "We do not sell your personal information. We may share information about you in the following circumstances:\n\n• With your consent or at your direction\n• With vendors, consultants, and service providers who need access to perform services for us\n• In response to legal process or government requests\n• To protect the rights, property, and safety of Perix and our users"
    },
    {
      title: t("privacy.dataSecurity") || "Data Security",
      content: t("privacy.dataSecurityContent") || 
        "We take reasonable measures to help protect information about you from loss, theft, misuse, unauthorized access, disclosure, alteration, and destruction. All data is encrypted in transit and at rest."
    },
    {
      title: t("privacy.retentionTitle") || "Data Retention",
      content: t("privacy.retentionContent") ||
        "We keep your personal data only as long as necessary for the purposes described in this policy:\n\n• Account data — while your account exists, then deleted (or anonymised) within 30 days of deletion\n• Content (posts, messages, media) — while your account exists, then permanently deleted\n• Booking, payment and subscription records — as long as required by tax and financial law\n• Technical identifiers for abuse/fraud prevention — up to 12 months\n• Reports — kept for moderation without unnecessary personal details"
    },
    {
      title: t("privacy.transfersTitle") || "International Transfers",
      content: t("privacy.transfersContent") ||
        "Your data is stored on servers within the European Union. Some processors (e.g. media hosting and video encoding providers) may process data outside the EEA; in such cases we rely on standard contractual clauses or equivalent safeguards under GDPR Chapter V."
    },
    {
      title: t("privacy.cookies") || "Cookies & Tracking",
      content: t("privacy.cookiesContent") || 
        "We use cookies and similar tracking technologies to track activity on our service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent."
    },
    {
      title: t("privacy.userRights") || "Your Rights",
      content: t("privacy.userRightsContent") || 
        "You have the right to:\n\n• Access your personal data (Art. 15)\n• Correct inaccurate data (Art. 16)\n• Request deletion of your data (Art. 17)\n• Restrict processing (Art. 18)\n• Data portability (Art. 20)\n• Object to processing (Art. 21)\n• Withdraw consent at any time (Art. 7(3))\n\nTo exercise these rights, contact us through the app or via email. We respond within one month."
    },
    {
      title: t("privacy.complaintTitle") || "Complaints",
      content: t("privacy.complaintContent") ||
        "If you believe your data has been processed unlawfully, you have the right to lodge a complaint with your national data-protection supervisory authority in the EU, without prejudice to any other legal remedy."
    },
    {
      title: t("privacy.automatedTitle") || "Automated Decisions",
      content: t("privacy.automatedContent") ||
        "We do not make decisions with legal or similarly significant effects based solely on automated processing. Content flagged by automated moderation is always reviewed by a human before any final action."
    },
    {
      title: t("privacy.accountDeletion") || "Account Deletion",
      content: t("privacy.accountDeletionContent") || 
        "You can delete your account at any time from Settings → Delete Account, or without installing the app at perixapp.com/account-deletion.\n\nWhat is deleted immediately and permanently:\n\n• Your account profile, name, email, photos and all personal data\n• Your posts, comments, stories, events, activities and listings\n• Your likes, saves, friend connections, messages and conversations\n• Your search/notification data, sessions and push tokens\n• Hosted media (photos and videos) associated with your content\n\nWhat is removed from public view immediately, then permanently deleted within 30 days:\n\n• Business or artist profiles you operated and their content. These are kept briefly (up to 30 days) so pending bookings and transactions involving other people can be settled, then permanently deleted.\n\nWhat we retain and why:\n\n• Booking, subscription and payment records: retained as required by tax and financial law.\n• A technical identifier (no personal data): kept for up to 12 months for abuse and fraud prevention.\n• Reports about your account: retained for moderation purposes without your personal details."
    },
    {
      title: t("privacy.children") || "Children's Privacy",
      content: t("privacy.childrenContent") || 
        "Our service is not intended for children under 16. We do not knowingly collect personal information from children under 16. If we become aware that a child under 16 has provided us with personal information, we will take steps to delete such information."
    },
    {
      title: t("privacy.changes") || "Changes to This Policy",
      content: t("privacy.changesContent") || 
        "We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the effective date. You are advised to review this policy periodically for any changes."
    },
    {
      title: t("privacy.contact") || "Contact Us",
      content: t("privacy.contactContent") || 
        "If you have any questions about this Privacy Policy, please contact us:\n\n• Through the app's support feature\n• By email at privacy@perix.app"
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} tintColor={COLORS.textLight} />
        <Text style={styles.headerTitle}>{t("privacy.title") || "Privacy Policy"}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Last Updated */}
        <Text style={styles.lastUpdated}>
          {t("privacy.lastUpdated") || "Last updated"}: September 2026
        </Text>

        {/* Introduction */}
        <Text style={styles.intro}>
          {t("privacy.intro") || 
            "Perix (\"we\", \"our\", or \"us\") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application."}
        </Text>

        {/* Sections */}
        {sections.map((section, index) => (
          <View key={index} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionContent}>{section.content}</Text>
          </View>
        ))}

        {/* GDPR Notice */}
        <View style={styles.gdprNotice}>
          <Ionicons name="shield-checkmark" size={24} color={COLORS.primaryDark} />
          <View style={styles.gdprText}>
            <Text style={styles.gdprTitle}>
              {t("privacy.gdprTitle") || "GDPR Compliance"}
            </Text>
            <Text style={styles.gdprContent}>
              {t("privacy.gdprContent") || 
                "We comply with the General Data Protection Regulation (GDPR) for users in the European Union."}
            </Text>
          </View>
        </View>

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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  lastUpdated: {
    color: "#6b7280",
    fontSize: 13,
    marginTop: 20,
    marginBottom: 8,
  },
  intro: {
    color: "#d1d5db",
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 10,
  },
  sectionContent: {
    color: "#9ca3af",
    fontSize: 14,
    lineHeight: 22,
  },
  gdprNotice: {
    flexDirection: "row",
    backgroundColor: "rgba(76, 111, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  gdprText: {
    flex: 1,
  },
  gdprTitle: {
    color: COLORS.primaryDark,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  gdprContent: {
    color: "#9ca3af",
    fontSize: 13,
    lineHeight: 20,
  },
});

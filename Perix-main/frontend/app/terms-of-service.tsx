import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { COLORS } from "../lib/designTokens";
import { HeaderBackButton } from "../components/shared/HeaderBackButton";

export default function TermsOfServiceScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const sections = [
    {
      title: t("terms.acceptance") || "Acceptance of Terms",
      content: t("terms.acceptanceContent") || "By accessing or using Perix, you agree to be bound by these Terms of Service. If you do not agree, you may not use the service."
    },
    {
      title: t("terms.eligibility") || "Eligibility",
      content: t("terms.eligibilityContent") || "You must be at least 16 years old to use Perix. By creating an account, you represent that you meet this age requirement."
    },
    {
      title: t("terms.platformRoleTitle") || "Our Role — Platform Only",
      content: t("terms.platformRoleContent") || "Perix is a neutral platform that connects users and businesses. Perix is NOT a party to any transactions, agreements or payments between users or between users and businesses. All arrangements and payments happen directly between the parties. Perix does not guarantee the quality, safety or legality of any item, service, booking or content and is not liable for them."
    },
    {
      title: t("terms.userContent") || "User Content",
      content: t("terms.userContentContent") || "You retain ownership of the content you post on Perix. By posting content, you grant us a worldwide, non-exclusive, transferable license to host, display, distribute and adapt your content within the platform, including for the operation and promotion of the service. You are responsible for the content you post and must ensure it complies with applicable laws."
    },
    {
      title: t("terms.acceptableUse") || "Acceptable Use",
      content: t("terms.acceptableUseContent") || "You agree not to:\n\n• Post harmful, abusive, or illegal content\n• Impersonate others or provide false information\n• Interfere with the operation of the service\n• Use the service for spam or unauthorized advertising\n• Violate any applicable laws or regulations"
    },
    {
      title: t("terms.moderationTitle") || "Content Moderation",
      content: t("terms.moderationContent") || "To keep Perix safe and lawful, we may at any time, at our sole discretion: remove, hide or restrict content; suspend or terminate accounts; and process reports from users. Content hidden by automated systems is reviewed by a human. Our moderation rules are described in the app (Blocked Users → Moderation & reporting rules) and at /api/reports/policy."
    },
    {
      title: t("terms.intellectualProperty") || "Intellectual Property",
      content: t("terms.intellectualPropertyContent") || "Perix and its original content, features, and functionality are owned by Perix and are protected by international copyright, trademark, and other intellectual property laws."
    },
    {
      title: t("terms.termination") || "Termination",
      content: t("terms.terminationContent") || "You may stop using the service and delete your account at any time (Settings → Delete Account). We may also suspend or terminate your account without prior notice for conduct that violates these Terms or is harmful to other users, us, or third parties."
    },
    {
      title: t("terms.disclaimers") || "Disclaimers",
      content: t("terms.disclaimersContent") || "Perix is provided on an 'as is' basis. We make no warranties, expressed or implied, regarding the accuracy, reliability, or availability of the service or any content, product or service offered by third parties. Your use of the service is at your sole risk."
    },
    {
      title: t("terms.liability") || "Limitation of Liability",
      content: t("terms.liabilityContent") || "To the maximum extent permitted by law:\n\n• Perix shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use of the service.\n• Perix is not liable for the acts, content, products or services of other users or businesses.\n• Perix's total liability is limited to the greater of €100 or the amounts you paid us in the 12 months before the claim.\n\nNothing in these Terms limits liability that cannot be limited by law (e.g. for intent or gross negligence)."
    },
    {
      title: t("terms.indemnificationTitle") || "Indemnification",
      content: t("terms.indemnificationContent") || "You agree to indemnify and hold harmless Perix, its team and affiliates from any claims, damages, losses and costs (including reasonable legal fees) arising from your use of the service, your content, or your violation of these Terms or of third-party rights."
    },
    {
      title: t("terms.governingLaw") || "Governing Law",
      content: t("terms.governingLawContent") || "These Terms shall be governed by and construed in accordance with the laws of Germany, without regard to its conflict of law provisions. Any disputes shall be resolved in the courts of Magdeburg, Germany."
    },
    {
      title: t("terms.euConsumersTitle") || "EU Consumers",
      content: t("terms.euConsumersContent") || "If you are a consumer in the European Union, you benefit from the mandatory consumer-protection provisions of the law of your country of residence. Nothing in these Terms removes those rights. For online disputes you may also use the EU Online Dispute Resolution platform at ec.europa.eu/consumers/odr. The Digital Services Act (EU 2022/2065) point of contact is support@perix.app."
    },
    {
      title: t("terms.changes") || "Changes to Terms",
      content: t("terms.changesContent") || "We reserve the right to modify these terms at any time. We will notify you of material changes by posting the updated terms on this page. Continued use of the service after changes constitutes acceptance."
    },
    {
      title: t("terms.contact") || "Contact",
      content: t("terms.contactContent") || "For questions about these Terms, contact us at:\n\n• Within the app via Settings → Help & Support\n• By email at support@perix.app"
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <HeaderBackButton onPress={() => router.back()} tintColor={COLORS.textLight} />
        <Text style={styles.headerTitle}>{t("terms.title") || "Terms of Service"}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated}>{t("terms.lastUpdated") || "Last updated: September 2026"}</Text>
        {sections.map((s, i) => (
          <View key={i} style={styles.card}>
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.cardContent}>{s.content}</Text>
          </View>
        ))}
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
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  lastUpdated: { fontSize: 13, color: "#9ca3af", marginBottom: 16, textAlign: "center" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 8 },
  cardContent: { fontSize: 14, lineHeight: 22, color: "#374151" },
});

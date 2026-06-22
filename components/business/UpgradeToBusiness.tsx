import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { apiRequest } from "../../lib/api/core";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

const BENEFITS = [
  { icon: "calendar", textKey: "upgrade.eventCreation", fallback: "Create Events & Activities" },
  { icon: "briefcase", textKey: "upgrade.jobPostings", fallback: "Post Jobs & Rentals" },
  { icon: "map", textKey: "upgrade.mapDiscovery", fallback: "Get discovered on the map" },
  { icon: "images", textKey: "upgrade.gallery", fallback: "Upload unlimited gallery" },
  { icon: "bar-chart", textKey: "upgrade.analytics", fallback: "Track insights & analytics" },
  { icon: "color-palette", textKey: "upgrade.customTheme", fallback: "Custom profile theme" },
];

export default function UpgradeToBusiness({ visible, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const { sessionToken, user, refreshUser } = useAuth();
  const [rootCategory, setRootCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [businessName, setBusinessName] = useState(user?.name ? `${user.name}'s Business` : "");
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!rootCategory.trim() || !subcategory.trim()) {
      Alert.alert(t("common.error") || "Error", t("upgrade.selectCategory") || "Please select a category and subcategory");
      return;
    }
    if (!sessionToken) return;

    try {
      setLoading(true);
      await apiRequest("/auth/upgrade-to-business", "POST", sessionToken, {
        root_category: rootCategory.trim(),
        subcategory: subcategory.trim(),
        business_name: businessName.trim() || undefined,
      });
      await refreshUser();
      onSuccess?.();
      onClose();
      Alert.alert(t("upgrade.success") || "Success", t("upgrade.upgraded") || "Your business profile has been created! 90-day free trial activated.");
    } catch (e: any) {
      Alert.alert(t("common.error") || "Error", e?.message || t("upgrade.failed") || "Failed to create business");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#374151" />
              </Pressable>
              <Text style={styles.title}>{t("upgrade.title", "Unlock Your Business")}</Text>
            </View>

            {/* Benefits */}
            <Text style={styles.sectionTitle}>{t("upgrade.withBusiness", "With a business profile you can:")}</Text>
            <View style={styles.benefitsGrid}>
              {BENEFITS.map((b) => (
                <View key={b.icon} style={styles.benefitCard}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name={b.icon as any} size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.benefitText}>{t(b.textKey, b.fallback)}</Text>
                </View>
              ))}
            </View>

            {/* Trial info */}
            <View style={styles.trialCard}>
              <Ionicons name="gift" size={24} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.trialTitle}>{t("upgrade.freeTrial", "90-Day Free Trial")}</Text>
                <Text style={styles.trialSub}>{t("upgrade.noPayment", "No payment required. Cancel anytime.")}</Text>
              </View>
            </View>

            {/* Category fields */}
            <Text style={styles.sectionTitle}>{t("upgrade.categoryTitle", "Choose your business category")}</Text>
            <View style={styles.inputRow}>
              <Ionicons name="grid-outline" size={20} color="#6b7280" />
              <TextInput
                value={rootCategory}
                onChangeText={setRootCategory}
                placeholder={t("upgrade.rootCategory", "Category (e.g. food-dining)")}
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="options-outline" size={20} color="#6b7280" />
              <TextInput
                value={subcategory}
                onChangeText={setSubcategory}
                placeholder={t("upgrade.subcategory", "Subcategory (e.g. italian)")}
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>
            <View style={styles.inputRow}>
              <Ionicons name="business-outline" size={20} color="#6b7280" />
              <TextInput
                value={businessName}
                onChangeText={setBusinessName}
                placeholder={t("upgrade.businessName", "Business Name")}
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>

            {/* Submit */}
            <Pressable
              style={[styles.submitBtn, (!rootCategory || !subcategory || loading) && styles.submitBtnDisabled]}
              onPress={handleUpgrade}
              disabled={!rootCategory || !subcategory || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitText}>{t("upgrade.startTrial", "Start Free Trial →")}</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
    gap: 12,
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
    marginTop: 8,
  },
  benefitsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  benefitCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    width: "48%",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    flexShrink: 1,
  },
  trialCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.primary + "10",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    marginBottom: 8,
  },
  trialTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.primary,
  },
  trialSub: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  submitBtn: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, Modal, Platform, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { Business } from "../../lib/api";
import { fetchEntitlements } from "../../lib/api/account";
import { COLORS } from "../../lib/designTokens";
import { PROFILE_COLORS } from "./ProfileDesign";
import { useRouter } from "expo-router";

const { width } = Dimensions.get("window");

interface IdentityDropdownProps {
  businesses: Business[];
  onSelectIdentity: (type: "user" | "business", id: string, name: string, avatar?: string | null) => void;
  onCreateBusiness: () => void;
  onAfterSelect?: () => void;
  customLabel?: string;
  compact?: boolean;
}

export const IdentityDropdown: React.FC<IdentityDropdownProps> = ({
  businesses,
  onSelectIdentity,
  onCreateBusiness,
  onAfterSelect,
  customLabel,
  compact = false,
}) => {
  const { t } = useTranslation();
  const { user, activeIdentity, sessionToken } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [businessGrant, setBusinessGrant] = useState<string | null>(null);
  const router = useRouter();

  if (!user) return null;

  // Refresh the Business-plan grant whenever the switcher opens: a redeemed
  // Pro100 code (or an owned business plan) unlocks business creation.
  useEffect(() => {
    if (!modalVisible || !sessionToken) return;
    let cancelled = false;
    fetchEntitlements(sessionToken, "user")
      .then((snapshot) => {
        if (!cancelled) setBusinessGrant(snapshot.business_plan_grant ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [modalVisible, sessionToken]);

  const currentAvatar = activeIdentity?.type === "business"
    ? activeIdentity.avatar
    : activeIdentity?.avatar || user.profile_photo || user.picture;

  // A purchased Business / Event Pro plan (plan_type on any owned business
  // or a redeemed Pro100 grant) unlocks business creation; otherwise it
  // goes through the plans page.
  const hasBusinessPlan =
    !!businessGrant ||
    businesses.some(
      (b) => b.plan_type === "business" || b.plan_type === "event_pro"
    );

  return (
    <>
      <Pressable
        testID={compact ? "account-type-switcher" : undefined}
        accessibilityRole="button"
        accessibilityLabel={customLabel || t("profile.switchIdentity") || "Switch account type"}
        style={styles.container}
        onPress={() => setModalVisible(true)}
      >
        {compact ? <View style={styles.compactButton}>
          {currentAvatar ? <Image source={{ uri: currentAvatar }} style={styles.compactAvatar} />
            : <Text style={styles.compactInitial}>{(activeIdentity?.name || user.name || "U").charAt(0).toUpperCase()}</Text>}
        </View> : <View style={styles.pillButton}>
          <View style={styles.leftSection}>
            {currentAvatar ? (
              <Image source={{ uri: currentAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{activeIdentity?.name?.charAt(0) || user.name?.charAt(0) || "M"}</Text>
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>{activeIdentity?.name || user.name}</Text>
          </View>
          <Ionicons name="chevron-down" size={16} color="#264348" />
        </View>}
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("profile.switchIdentity") || "Switch Identity"}</Text>
              <Pressable onPress={() => setModalVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={20} color="#264348" />
              </Pressable>
            </View>

            {/* User Profile */}
            <Pressable 
              style={[
                styles.identityItem,
                activeIdentity?.type === "user" && styles.identityItemActive
              ]}
              onPress={() => {
                onSelectIdentity("user", user.user_id, user.name, user.profile_photo || user.picture);
                setModalVisible(false);
                onAfterSelect?.();
              }}
            >
              {user.profile_photo || user.picture ? (
                <Image source={{ uri: user.profile_photo || user.picture || "" }} style={styles.itemAvatar} />
              ) : (
                <View style={[styles.itemAvatarPlaceholder, { backgroundColor: '#264348' }]}>
                  <Text style={styles.itemAvatarText}>{user.name?.charAt(0) || "U"}</Text>
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{user.name}</Text>
                <Text style={styles.itemType}>{t("profile.user") || "Personal Profile"}</Text>
              </View>
              {activeIdentity?.type === "user" && (
                <Ionicons name="checkmark-circle" size={24} color="#59ABE3" />
              )}
            </Pressable>

            {/* Businesses */}
            {businesses.map((business) => (
              <Pressable 
                key={business.business_id}
                style={[
                  styles.identityItem,
                  activeIdentity?.type === "business" && activeIdentity.id === business.business_id && styles.identityItemActive
                ]}
                onPress={() => {
                  onSelectIdentity("business", business.business_id, business.name, business.logo_image);
                  setModalVisible(false);
                  onAfterSelect?.();
                }}
              >
                {business.logo_image ? (
                  <Image source={{ uri: business.logo_image }} style={styles.itemAvatar} />
                ) : (
                  <View style={[styles.itemAvatarPlaceholder, { backgroundColor: '#264348' }]}>
                    <Ionicons name="business" size={20} color="#fff" />
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{business.name}</Text>
                  <Text style={styles.itemType}>{t("profile.business") || "Business Profile"}</Text>
                </View>
                {activeIdentity?.type === "business" && activeIdentity.id === business.business_id && (
                  <Ionicons name="checkmark-circle" size={24} color="#59ABE3" />
                )}
              </Pressable>
            ))}

            {/* Create Actions */}
            <View style={styles.createActions}>
              <Pressable
                style={styles.createButton}
                onPress={() => {
                  setModalVisible(false);
                  if (hasBusinessPlan) {
                    onCreateBusiness();
                  } else {
                    router.push("/plans" as any);
                  }
                }}
              >
                <Ionicons name="add-circle-outline" size={20} color="#10b981" />
                <Text style={[styles.createText, { color: "#10b981" }]}>{t("profile.createBusiness", "Δημιουργία επιχείρησης")}</Text>
              </Pressable>
              <Pressable
                style={styles.plansButton}
                onPress={() => {
                  setModalVisible(false);
                  router.push("/plans" as any);
                }}
              >
                <Ionicons name="layers-outline" size={18} color="#59ABE3" />
                <Text style={styles.plansText}>{t("profile.viewPlans", "Δες τα πλάνα")}</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: "stretch",
    maxWidth:'100%',minWidth:0,flexShrink:1,
  },
  pillButton: {
    maxWidth:'100%',minWidth:0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "transparent",
    gap: 8,
  },
  compactButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#DDF2FF", borderWidth: 1, borderColor: "#59ABE3", overflow: "hidden" },
  compactAvatar: { width: "100%", height: "100%", borderRadius: 20 },
  compactInitial: { color: "#064472", fontSize: 16, fontWeight: "700" },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth:0,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(38,67,72,0.25)",
    backgroundColor: "#264348",
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  name: {
    flexShrink:1,minWidth:0,
    fontSize: 13,
    fontWeight: "600",
    color: "#264348",
    marginLeft: 8,
    maxWidth: 150,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: "80%",
    ...Platform.select({
      web: { width: "100%", maxWidth: 1280, alignSelf: "center" },
    }),
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#264348",
  },
  closeButton: {
    padding: 8,
    backgroundColor: "rgba(38,67,72,0.08)",
    borderRadius: 20,
  },
  identityItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: PROFILE_COLORS.CARD,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  identityItemActive: {
    backgroundColor: PROFILE_COLORS.CARD,
    borderColor: "#59ABE3",
  },
  itemAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  itemAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  itemAvatarText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  itemInfo: {
    marginLeft: 16,
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#264348",
  },
  itemType: {
    fontSize: 13,
    color: "#264348",
    marginTop: 2,
  },
  createActions: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 16,
    gap: 12,
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: PROFILE_COLORS.CARD,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    borderStyle: "dashed",
    justifyContent: "center",
    gap: 8,
  },
  createText: {
    fontSize: 15,
    fontWeight: "600",
  },
  plansButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#f1f7fb",
  },
  plansText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#59ABE3",
  },
});

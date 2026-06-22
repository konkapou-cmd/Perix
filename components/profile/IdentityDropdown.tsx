import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image, Modal, Platform, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { Business } from "../../lib/api";
import { COLORS } from "../../lib/designTokens";

const { width } = Dimensions.get("window");

interface IdentityDropdownProps {
  businesses: Business[];
  onSelectIdentity: (type: "user" | "business", id: string, name: string, avatar?: string | null) => void;
  onCreateBusiness: () => void;
  customLabel?: string;
}

export const IdentityDropdown: React.FC<IdentityDropdownProps> = ({
  businesses,
  onSelectIdentity,
  onCreateBusiness,
  customLabel
}) => {
  const { t } = useTranslation();
  const { user, activeIdentity } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);

  if (!user) return null;

  const currentAvatar = activeIdentity?.avatar || user.profile_photo || user.picture;

  return (
    <>
      <Pressable 
        style={styles.container} 
        onPress={() => setModalVisible(true)}
      >
        <View style={styles.pillButton}>
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
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </View>
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
                <Ionicons name="close" size={20} color="#6b7280" />
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
              }}
            >
              {user.profile_photo || user.picture ? (
                <Image source={{ uri: user.profile_photo || user.picture || "" }} style={styles.itemAvatar} />
              ) : (
                <View style={[styles.itemAvatarPlaceholder, { backgroundColor: '#000000' }]}>
                  <Text style={styles.itemAvatarText}>{user.name?.charAt(0) || "U"}</Text>
                </View>
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{user.name}</Text>
                <Text style={styles.itemType}>{t("profile.user") || "Personal Profile"}</Text>
              </View>
              {activeIdentity?.type === "user" && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.primaryDark} />
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
                }}
              >
                {business.logo_image ? (
                  <Image source={{ uri: business.logo_image }} style={styles.itemAvatar} />
                ) : (
                  <View style={[styles.itemAvatarPlaceholder, { backgroundColor: '#10b981' }]}>
                    <Ionicons name="business" size={20} color="#fff" />
                  </View>
                )}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{business.name}</Text>
                  <Text style={styles.itemType}>{t("profile.business") || "Business Profile"}</Text>
                </View>
                {activeIdentity?.type === "business" && activeIdentity.id === business.business_id && (
                  <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                )}
              </Pressable>
            ))}

            {/* Create Actions */}
            <View style={styles.createActions}>
              {!businesses.length && (
                <Pressable style={styles.createButton} onPress={() => { setModalVisible(false); onCreateBusiness(); }}>
                  <Ionicons name="add-circle-outline" size={20} color="#10b981" />
                  <Text style={[styles.createText, { color: '#10b981' }]}>{t("profile.createBusiness")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    gap: 8,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
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
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "#1f2937",
  },
  avatarText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  name: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
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
    color: COLORS.textPrimary,
  },
  closeButton: {
    padding: 8,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
  },
  identityItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  identityItemActive: {
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
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
    color: COLORS.textPrimary,
  },
  itemType: {
    fontSize: 13,
    color: "#6b7280",
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    borderStyle: "dashed",
    justifyContent: "center",
    gap: 8,
  },
  createText: {
    fontSize: 15,
    fontWeight: "600",
  }
});
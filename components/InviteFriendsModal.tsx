import React from "react";
import { Modal, View, Text, Pressable, StyleSheet, Share, Platform, Linking, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";

interface InviteFriendsModalProps {
  visible: boolean;
  onClose: () => void;
  inviteCode?: string;
  userName?: string;
}

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || "https://api.perixapp.com";
const APP_URL = BACKEND_URL.replace('/api', '').replace('api.', '');

export const InviteFriendsModal: React.FC<InviteFriendsModalProps> = ({
  visible,
  onClose,
  inviteCode,
  userName,
}) => {
  const { t } = useTranslation();

  const getInviteMessage = () => {
    const baseMessage = userName 
      ? `${userName} ${t("share.invitesYou") || "invites you to join Perix!"}`
      : t("share.joinPerix") || "Join me on Perix - the social app for your city!";
    
    const appLink = APP_URL;
    const codeText = inviteCode 
      ? `\n\n${t("share.useCode") || "Use my invite code"}: ${inviteCode}` 
      : "";
    
    return `${baseMessage}${codeText}\n\n${t("share.downloadAt") || "Download at"}: ${appLink}`;
  };

  const shareVia = async (platform: "whatsapp" | "instagram" | "facebook" | "copy" | "other") => {
    const message = getInviteMessage();
    
    try {
      switch (platform) {
        case "whatsapp":
          const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
          const canOpenWhatsApp = await Linking.canOpenURL(whatsappUrl);
          if (canOpenWhatsApp) {
            await Linking.openURL(whatsappUrl);
          } else {
            Alert.alert(t("common.error"), t("share.whatsappNotInstalled") || "WhatsApp is not installed");
          }
          break;
          
        case "instagram":
          // Instagram doesn't support text sharing directly, so we use stories
          const instagramUrl = Platform.OS === 'ios' 
            ? "instagram-stories://share" 
            : "instagram://story-camera";
          const canOpenInsta = await Linking.canOpenURL(instagramUrl);
          if (canOpenInsta) {
            await Linking.openURL(instagramUrl);
            // Copy the message to clipboard for the user to paste
            Alert.alert(
              t("share.instagramTip") || "Tip",
              t("share.pasteMessage") || "Message copied! Paste it in your Instagram story."
            );
          } else {
            Alert.alert(t("common.error"), t("share.instagramNotInstalled") || "Instagram is not installed");
          }
          break;
          
        case "facebook":
          const fbUrl = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(message)}&u=${encodeURIComponent(APP_URL)}`;
          await Linking.openURL(fbUrl);
          break;
          
        case "copy":
          // Use the Share API to copy
          await Share.share({ message });
          break;
          
        case "other":
          await Share.share({ 
            message,
            title: t("share.inviteToPerix") || "Invite to Perix",
          });
          break;
      }
      onClose();
    } catch (error) {
      console.error("Share error:", error);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("share.inviteFriends") || "Invite Friends"}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </Pressable>
          </View>
          
          <Text style={styles.subtitle}>
            {t("share.shareVia") || "Share via"}
          </Text>
          
          <View style={styles.optionsGrid}>
            <Pressable style={styles.option} onPress={() => shareVia("whatsapp")}>
              <View style={[styles.iconCircle, { backgroundColor: "#25D366" }]}>
                <Ionicons name="logo-whatsapp" size={28} color="#fff" />
              </View>
              <Text style={styles.optionText}>WhatsApp</Text>
            </Pressable>
            
            <Pressable style={styles.option} onPress={() => shareVia("instagram")}>
              <View style={[styles.iconCircle, { backgroundColor: "#E4405F" }]}>
                <Ionicons name="logo-instagram" size={28} color="#fff" />
              </View>
              <Text style={styles.optionText}>Instagram</Text>
            </Pressable>
            
            <Pressable style={styles.option} onPress={() => shareVia("facebook")}>
              <View style={[styles.iconCircle, { backgroundColor: "#1877F2" }]}>
                <Ionicons name="logo-facebook" size={28} color="#fff" />
              </View>
              <Text style={styles.optionText}>Facebook</Text>
            </Pressable>
            
            <Pressable style={styles.option} onPress={() => shareVia("other")}>
              <View style={[styles.iconCircle, { backgroundColor: "#000000" }]}>
                <Ionicons name="share-social" size={28} color="#fff" />
              </View>
              <Text style={styles.optionText}>{t("common.other") || "Other"}</Text>
            </Pressable>
          </View>
          
          {inviteCode && (
            <View style={styles.codeContainer}>
              <Text style={styles.codeLabel}>{t("share.yourInviteCode") || "Your invite code"}</Text>
              <View style={styles.codeBox}>
                <Text style={styles.codeText}>{inviteCode}</Text>
                <Pressable onPress={() => shareVia("copy")}>
                  <Ionicons name="copy-outline" size={20} color="#000000" />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  closeButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
  },
  optionsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
  },
  option: {
    alignItems: "center",
    width: 70,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  optionText: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
  },
  codeContainer: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
  },
  codeLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  codeBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  codeText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: 2,
  },
});

export default InviteFriendsModal;

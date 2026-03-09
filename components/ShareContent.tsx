import React, { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

// Get the web app URL (without /api)
const getWebUrl = () => {
  if (!BACKEND_URL) return "https://perixapp.com";
  return BACKEND_URL.replace("/api", "").replace("api.", "app.");
};

export type ShareableContentType = "profile" | "event" | "activity" | "artist" | "business" | "post";

interface ShareContentProps {
  visible: boolean;
  onClose: () => void;
  contentType: ShareableContentType;
  contentId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  extraData?: {
    location?: string;
    date?: string;
    organizerName?: string;
  };
}

interface ShareOption {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  gradient: [string, string];
}

const SHARE_OPTIONS: ShareOption[] = [
  { id: "whatsapp", name: "WhatsApp", icon: "logo-whatsapp", color: "#25D366", gradient: ["#25D366", "#128C7E"] },
  { id: "instagram", name: "Instagram", icon: "logo-instagram", color: "#E4405F", gradient: ["#E4405F", "#833AB4"] },
  { id: "facebook", name: "Facebook", icon: "logo-facebook", color: "#1877F2", gradient: ["#1877F2", "#0D65D9"] },
  { id: "twitter", name: "X (Twitter)", icon: "logo-twitter", color: "#1DA1F2", gradient: ["#1DA1F2", "#0D8BD9"] },
  { id: "telegram", name: "Telegram", icon: "paper-plane", color: "#0088CC", gradient: ["#0088CC", "#006699"] },
  { id: "copy", name: "Copy Link", icon: "copy-outline", color: "#6b7280", gradient: ["#6b7280", "#4b5563"] },
  { id: "more", name: "More", icon: "share-outline", color: "#4c6fff", gradient: ["#4c6fff", "#6366f1"] },
];

export default function ShareContent({
  visible,
  onClose,
  contentType,
  contentId,
  title,
  description,
  imageUrl,
  extraData,
}: ShareContentProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // Generate the shareable URL
  const getShareUrl = () => {
    const baseUrl = getWebUrl();
    switch (contentType) {
      case "profile":
        return `${baseUrl}/user/${contentId}`;
      case "event":
        return `${baseUrl}/event/${contentId}`;
      case "activity":
        return `${baseUrl}/activity/${contentId}`;
      case "artist":
        return `${baseUrl}/artist/${contentId}`;
      case "business":
        return `${baseUrl}/business/${contentId}`;
      case "post":
        return `${baseUrl}/post/${contentId}`;
      default:
        return baseUrl;
    }
  };

  // Generate the deep link URL for the app
  const getDeepLink = () => {
    switch (contentType) {
      case "profile":
        return `perix://user/${contentId}`;
      case "event":
        return `perix://event/${contentId}`;
      case "activity":
        return `perix://activity/${contentId}`;
      case "artist":
        return `perix://artist/${contentId}`;
      case "business":
        return `perix://business/${contentId}`;
      case "post":
        return `perix://post/${contentId}`;
      default:
        return "perix://";
    }
  };

  // Generate share message based on content type
  const getShareMessage = () => {
    const url = getShareUrl();
    let emoji = "🎉";
    let typeLabel = "";
    
    switch (contentType) {
      case "profile":
        emoji = "👤";
        typeLabel = t("share.checkProfile") || "Check out this profile";
        break;
      case "event":
        emoji = "🎫";
        typeLabel = t("share.checkEvent") || "Check out this event";
        break;
      case "activity":
        emoji = "🎯";
        typeLabel = t("share.joinActivity") || "Join this activity";
        break;
      case "artist":
        emoji = "🎤";
        typeLabel = t("share.checkArtist") || "Check out this artist";
        break;
      case "business":
        emoji = "🏪";
        typeLabel = t("share.checkBusiness") || "Check out this business";
        break;
      case "post":
        emoji = "📝";
        typeLabel = t("share.checkPost") || "Check out this post";
        break;
    }

    let message = `${emoji} ${title}`;
    
    if (description) {
      message += `\n\n${description.substring(0, 100)}${description.length > 100 ? "..." : ""}`;
    }
    
    if (extraData?.date) {
      message += `\n📅 ${extraData.date}`;
    }
    
    if (extraData?.location) {
      message += `\n📍 ${extraData.location}`;
    }
    
    if (extraData?.organizerName) {
      message += `\n👤 ${extraData.organizerName}`;
    }
    
    message += `\n\n${typeLabel}:\n${url}`;
    message += `\n\n${t("share.downloadApp") || "Download Perix app for the best experience!"}`;
    
    return message;
  };

  const handleShare = async (optionId: string) => {
    const shareUrl = getShareUrl();
    const message = getShareMessage();

    try {
      switch (optionId) {
        case "whatsapp": {
          const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
          const canOpen = await Linking.canOpenURL(whatsappUrl);
          if (canOpen) {
            await Linking.openURL(whatsappUrl);
          } else {
            // Fallback to web WhatsApp
            await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
          }
          break;
        }
        
        case "instagram": {
          // Instagram doesn't support direct sharing via URL scheme for stories
          // We'll copy to clipboard and open Instagram
          await Clipboard.setStringAsync(message);
          Alert.alert(
            t("share.instagramTitle") || "Share to Instagram",
            t("share.instagramDesc") || "Link copied! Open Instagram and paste in your story or bio.",
            [
              { text: t("common.cancel") || "Cancel", style: "cancel" },
              { 
                text: t("share.openInstagram") || "Open Instagram",
                onPress: async () => {
                  const instagramUrl = "instagram://";
                  const canOpen = await Linking.canOpenURL(instagramUrl);
                  if (canOpen) {
                    await Linking.openURL(instagramUrl);
                  } else {
                    await Linking.openURL("https://instagram.com");
                  }
                }
              }
            ]
          );
          break;
        }
        
        case "facebook": {
          const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(title)}`;
          await Linking.openURL(facebookUrl);
          break;
        }
        
        case "twitter": {
          const twitterText = `${title}\n\n${shareUrl}`;
          const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}`;
          await Linking.openURL(twitterUrl);
          break;
        }
        
        case "telegram": {
          const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(message)}`;
          await Linking.openURL(telegramUrl);
          break;
        }
        
        case "copy": {
          await Clipboard.setStringAsync(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          break;
        }
        
        case "more":
        default: {
          await Share.share({
            message,
            url: shareUrl,
            title,
          });
          break;
        }
      }
    } catch (error) {
      console.error("Share error:", error);
      // Fallback to system share
      await Share.share({ message, title });
    }
    
    if (optionId !== "copy" && optionId !== "instagram") {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>{t("share.shareVia") || "Share via"}</Text>
          </View>

          {/* Preview Card */}
          <View style={styles.previewCard}>
            <View style={styles.previewContent}>
              <Text style={styles.previewTitle} numberOfLines={2}>{title}</Text>
              {description && (
                <Text style={styles.previewDesc} numberOfLines={2}>{description}</Text>
              )}
              <Text style={styles.previewUrl}>{getShareUrl()}</Text>
            </View>
          </View>

          {/* Share Options Grid */}
          <View style={styles.optionsGrid}>
            {SHARE_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={styles.optionItem}
                onPress={() => handleShare(option.id)}
              >
                <LinearGradient
                  colors={option.gradient}
                  style={styles.optionIcon}
                >
                  {option.id === "copy" && copied ? (
                    <Ionicons name="checkmark" size={24} color="#fff" />
                  ) : (
                    <Ionicons name={option.icon} size={24} color="#fff" />
                  )}
                </LinearGradient>
                <Text style={styles.optionText}>
                  {option.id === "copy" && copied 
                    ? (t("share.copied") || "Copied!") 
                    : option.name}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Cancel Button */}
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>{t("common.cancel") || "Cancel"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 16,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  previewCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  previewContent: {
    gap: 4,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  previewDesc: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  previewUrl: {
    fontSize: 12,
    color: "#4c6fff",
    marginTop: 4,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  optionItem: {
    width: "23%",
    alignItems: "center",
    paddingVertical: 12,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  optionText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
    textAlign: "center",
  },
  cancelButton: {
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
});

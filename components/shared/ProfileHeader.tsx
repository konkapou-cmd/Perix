import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type ProfileHeaderProps = {
  name: string;
  subtitle?: string;
  coverPhoto?: string | null;
  profilePhoto?: string | null;
  onBack: () => void;
  actions?: React.ReactNode;
  coverPlaceholder?: string;
  showDefaultAvatar?: boolean;
  avatarSize?: "small" | "medium" | "large";
};

export const ProfileHeader = ({
  name,
  subtitle,
  coverPhoto,
  profilePhoto,
  onBack,
  actions,
  coverPlaceholder,
  showDefaultAvatar = true,
  avatarSize = "medium",
}: ProfileHeaderProps) => {
  const { t } = useTranslation();
  
  const avatarSizes = {
    small: { width: 64, height: 64, borderRadius: 32 },
    medium: { width: 80, height: 80, borderRadius: 40 },
    large: { width: 100, height: 100, borderRadius: 50 },
  };
  
  const avatarStyle = avatarSizes[avatarSize];

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={20} color="#4c6fff" />
        <Text style={styles.backText}>{t("common.back")}</Text>
      </Pressable>

      <View style={styles.coverContainer}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto }} style={styles.coverImage} />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Text style={styles.coverPlaceholderText}>
              {coverPlaceholder || t("userProfile.noCoverPhoto")}
            </Text>
          </View>
        )}

        {showDefaultAvatar && (
          <View style={[styles.avatarContainer, { marginTop: -avatarStyle.height / 2 }]}>
            {profilePhoto ? (
              <Image
                source={{ uri: profilePhoto }}
                style={[styles.avatar, avatarStyle]}
              />
            ) : (
              <View style={[styles.avatarFallback, avatarStyle]}>
                <Text style={[styles.avatarFallbackText, { fontSize: avatarStyle.width * 0.35 }]}>
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.name}>{name}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        {actions && <View style={styles.actionsContainer}>{actions}</View>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  backButton: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  backText: {
    color: "#4c6fff",
    fontWeight: "500",
    marginLeft: 4,
  },
  coverContainer: {
    position: "relative",
  },
  coverImage: {
    width: "100%",
    height: 150,
  },
  coverPlaceholder: {
    width: "100%",
    height: 150,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  coverPlaceholderText: {
    color: "#9ca3af",
    fontSize: 14,
  },
  avatarContainer: {
    alignItems: "center",
  },
  avatar: {
    borderWidth: 4,
    borderColor: "#fff",
  },
  avatarFallback: {
    backgroundColor: "#4c6fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#fff",
  },
  avatarFallbackText: {
    color: "#fff",
    fontWeight: "600",
  },
  infoContainer: {
    padding: 16,
    paddingTop: 8,
    alignItems: "center",
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  actionsContainer: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
  },
});

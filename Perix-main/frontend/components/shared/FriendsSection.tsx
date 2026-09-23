import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/designTokens";
import { FriendProfile } from "../../lib/api";

type FriendsSectionProps = {
  friends: FriendProfile[];
  isFriend: boolean;
  onToggleFriend: () => void;
  isLoading?: boolean;
  showMakeButton?: boolean;
  showFriendRequests?: boolean;
};

const navigateToProfile = (fp: FriendProfile, router: any) => {
  if (fp.entity_type === "user") {
    router.push(`/user/${fp.entity_id}`);
  } else if (fp.entity_type === "business") {
    router.push(`/business/${fp.entity_id}`);
  } else if (fp.entity_type === "artist") {
    router.push(`/artist/${fp.entity_id}`);
  }
};

export const FriendsSection = ({
  friends,
  isFriend,
  onToggleFriend,
  isLoading = false,
  showMakeButton = true,
  showFriendRequests = false,
}: FriendsSectionProps) => {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("userProfile.connections")}</Text>

      {showFriendRequests && (
        <Pressable
          style={styles.friendRequestsButton}
          onPress={() => router.push("/friend-requests")}
        >
          <Ionicons name="person-add" size={16} color="#0066cc" />
          <Text style={styles.friendRequestsText}>{t("profile.friendRequests") || "Friend Requests"}</Text>
          <Ionicons name="chevron-forward" size={16} color="#0066cc" />
        </Pressable>
      )}
      
      {showMakeButton && (
        <Pressable
          style={[
            styles.friendButton,
            isFriend && styles.friendButtonActive,
            isLoading && styles.buttonDisabled,
          ]}
          onPress={onToggleFriend}
          disabled={isLoading}
        >
          <Text style={[styles.friendButtonText, isFriend && styles.friendButtonTextActive]}>
            {isFriend ? t("userProfile.friends") : t("userProfile.makeFriends")}
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionLabel}>{t("userProfile.commonFriends")}</Text>
      {friends.length === 0 ? (
        <Text style={styles.emptyText}>{t("userProfile.noCommonFriends")}</Text>
      ) : (
        <View style={styles.friendsList}>
          {friends.slice(0, 5).map((friend) => (
            <Pressable
              key={`${friend.entity_type}-${friend.entity_id}`}
              style={styles.friendItem}
              onPress={() => navigateToProfile(friend, router)}
            >
              {friend.image ? (
                <Image
                  source={{ uri: friend.image }}
                  style={styles.friendAvatar}
                />
              ) : (
                <View style={styles.friendAvatarFallback}>
                  <Text style={styles.friendAvatarText}>
                    {friend.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.friendName} numberOfLines={1}>
                {friend.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  friendButton: {
    backgroundColor: COLORS.primaryDark,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  friendButtonActive: {
    backgroundColor: "#e5e7eb",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  friendButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  friendButtonTextActive: {
    color: "#374151",
  },
  sectionLabel: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 8,
  },
  emptyText: {
    color: "#9ca3af",
    fontSize: 14,
  },
  friendsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  friendItem: {
    alignItems: "center",
    width: 64,
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  friendAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6b7280",
  },
  friendName: {
    fontSize: 12,
    color: "#374151",
    marginTop: 4,
    textAlign: "center",
  },
  friendRequestsButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f0f7ff",
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  friendRequestsText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: "#0066cc",
  },
});

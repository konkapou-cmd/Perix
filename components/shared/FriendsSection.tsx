import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";

type Friend = {
  user_id: string;
  name: string;
  profile_photo?: string | null;
};

type FriendsSectionProps = {
  friends: Friend[];
  isFriend: boolean;
  onToggleFriend: () => void;
  isLoading?: boolean;
  showMakeButton?: boolean;
};

export const FriendsSection = ({
  friends,
  isFriend,
  onToggleFriend,
  isLoading = false,
  showMakeButton = true,
}: FriendsSectionProps) => {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("userProfile.connections")}</Text>
      
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
              key={friend.user_id}
              style={styles.friendItem}
              onPress={() => router.push(`/user/${friend.user_id}`)}
            >
              {friend.profile_photo ? (
                <Image
                  source={{ uri: friend.profile_photo }}
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
    color: "#111827",
    marginBottom: 12,
  },
  friendButton: {
    backgroundColor: "#4c6fff",
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
});

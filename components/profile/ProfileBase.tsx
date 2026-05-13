import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Dimensions,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { PROFILE, PROFILE_COLORS } from "./ProfileDesign";
import { ThemeStyles } from "../../hooks/useThemeStyles";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type ProfileTab = string;

export type TabDefinition = {
  key: ProfileTab;
  label: string;
  icon: string;
  count?: number;
};

interface ProfileBaseProps {
  identityPicker?: React.ReactNode;
  children: React.ReactNode;
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  primaryColor?: string;
  postCount?: number;
  mediaCount?: number;
  storiesCount?: number;
  eventsCount?: number;
  jobsCount?: number;
}

export const ProfileBase: React.FC<ProfileBaseProps> = ({
  identityPicker,
  children,
  activeTab,
  onTabChange,
  primaryColor = PROFILE_COLORS.PRIMARY,
  postCount,
  mediaCount,
}) => {
  return <>{children}</>;
};

interface ProfileHeaderProps {
  identityPicker?: React.ReactNode;
  coverUri?: string | null;
  avatarUri?: string | null;
  avatarInitial?: string;
  name: string;
  slug?: string;
  bio?: string | null;
  location?: string | null;
  primaryColor?: string;
  textColor?: string;
  cardColor?: string;
  bgColor?: string;
  borderColor?: string;
  themeStyles?: ThemeStyles;
  readOnly?: boolean;
  onEditCover?: () => void;
  onEditAvatar?: () => void;
  onShare?: () => void;
  onSettings?: () => void;
  onEditProfile?: () => void;
  onCustomizeTheme?: () => void;
  onViewPublic?: () => void;
  onLogout?: () => void;
  showLogout?: boolean;
  onSaved?: () => void;
  showMessageButton?: boolean;
  onMessagePress?: () => void;
  friendStatus?: "friends" | "request_sent" | "request_received" | "none";
  onFriendPress?: () => void;
  showFollowButton?: boolean;
  onFollowPress?: () => void;
  onSavePress?: () => void;
  isSaved?: boolean;
  savingItem?: boolean;
  stats?: { label: string; count: number }[];
  completenessItems?: { label: string; done: boolean }[];
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  identityPicker,
  coverUri,
  avatarUri,
  avatarInitial = "?",
  name,
  slug,
  bio,
  location,
  primaryColor = PROFILE_COLORS.PRIMARY,
  textColor = PROFILE_COLORS.TEXT,
  cardColor = PROFILE_COLORS.CARD,
  bgColor = PROFILE_COLORS.BG,
  borderColor = PROFILE_COLORS.BORDER,
  themeStyles,
  readOnly = false,
  onEditCover,
  onEditAvatar,
  onShare,
  onSettings,
  onEditProfile,
  onCustomizeTheme,
  onViewPublic,
  onLogout,
  showLogout = false,
  onSaved,
  showMessageButton = false,
  onMessagePress,
  friendStatus,
  onFriendPress,
  showFollowButton = false,
  onFollowPress,
  onSavePress,
  isSaved = false,
  savingItem = false,
  stats,
  completenessItems,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    if (slug) {
      await Clipboard.setStringAsync(slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const profileUrl = slug || name;

  return (
    <View style={[styles.headerContainer, { backgroundColor: bgColor }]}>
      <Pressable
        style={styles.coverContainer}
        onPress={!readOnly ? onEditCover : undefined}
      >
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.coverImage} />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: cardColor }]}>
            {!readOnly && (
              <Ionicons name="image-outline" size={40} color="#d1d5db" />
            )}
          </View>
        )}
        {!readOnly && (
          <View style={[styles.coverEditBadge, { backgroundColor: primaryColor }]}>
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
        )}
        {identityPicker && (
          <View style={styles.identityOverlay}>
            {identityPicker}
          </View>
        )}
      </Pressable>

      <View style={styles.avatarRow}>
        <Pressable
          style={styles.avatarWrapper}
          onPress={!readOnly ? onEditAvatar : undefined}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: primaryColor }]}>
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            </View>
          )}
          {!readOnly && (
            <View style={[styles.avatarEditBadge, { backgroundColor: primaryColor }]}>
              <Ionicons name="camera" size={10} color="#fff" />
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.headerInfo}>
        <Text style={[styles.headerName, { color: textColor }, themeStyles as TextStyle]} numberOfLines={1}>
          {name || t("profile.perixUser", "Perix User")}
        </Text>

        {slug && (
          <Pressable onPress={handleCopyLink} style={styles.slugRow}>
            <Text style={[styles.slugText, { color: primaryColor }, themeStyles as TextStyle]} numberOfLines={1}>
              {slug}
            </Text>
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={14}
              color={copied ? PROFILE_COLORS.SUCCESS : primaryColor}
            />
          </Pressable>
        )}

        {location && (
          <View style={styles.locationRow}>
            <Ionicons name="location" size={13} color={PROFILE_COLORS.TEXT_SECONDARY} />
            <Text style={[styles.locationText, { color: PROFILE_COLORS.TEXT_SECONDARY }, themeStyles as TextStyle]}>
              {location}
            </Text>
          </View>
        )}

        {bio && (
          <Text style={[styles.bioText, { color: textColor }, themeStyles as TextStyle]} numberOfLines={3}>
            {bio}
          </Text>
        )}
      </View>

      {stats && stats.length > 0 && (
        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <View key={i} style={styles.statItem}>
              <Text style={[styles.statCount, { color: textColor }, themeStyles as TextStyle]}>{s.count}</Text>
              <Text style={[styles.statLabel, { color: PROFILE_COLORS.TEXT_SECONDARY }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {!readOnly && completenessItems && completenessItems.some(c => !c.done) && (
        <View style={[styles.completenessCard, { backgroundColor: cardColor, borderColor }]}>
          <Text style={[styles.completenessTitle, { color: textColor }]}>Complete your profile</Text>
          {completenessItems.filter(c => !c.done).map((c, i) => (
            <View key={i} style={styles.completenessRow}>
              <Ionicons name="close-circle" size={16} color={PROFILE_COLORS.DANGER} />
              <Text style={[styles.completenessLabel, { color: PROFILE_COLORS.TEXT_SECONDARY }]}>{c.label}</Text>
            </View>
          ))}
          <Pressable style={[styles.completenessBtn, { backgroundColor: primaryColor }]} onPress={onEditProfile}>
            <Text style={styles.completenessBtnText}>{t("profile.completeNow", "Complete Now")}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.actionRow}>
        {!readOnly && (
          <>
            <View style={styles.primaryActions}>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
                onPress={onEditProfile}
              >
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>{t("common.edit", "Edit Profile")}</Text>
              </Pressable>
              {onShare && (
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: cardColor, borderWidth: 1, borderColor: primaryColor }]}
                  onPress={onShare}
                >
                  <Ionicons name="share-social-outline" size={16} color={primaryColor} />
                  <Text style={[styles.primaryBtnText, { color: primaryColor }]}>{t("common.share", "Share")}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.secondaryRow}>
              {onCustomizeTheme && (
                <Pressable style={styles.iconBtn} onPress={onCustomizeTheme}>
                  <Ionicons name="color-palette-outline" size={20} color={PROFILE_COLORS.TEXT_SECONDARY} />
                </Pressable>
              )}
              {onSaved && (
                <Pressable style={styles.iconBtn} onPress={onSaved}>
                  <Ionicons name="bookmark-outline" size={20} color={PROFILE_COLORS.TEXT_SECONDARY} />
                </Pressable>
              )}
              <Pressable style={styles.iconBtn} onPress={onSettings || (() => router.push("/settings"))}>
                <Ionicons name="settings-outline" size={20} color={PROFILE_COLORS.TEXT_SECONDARY} />
              </Pressable>
              {showLogout && onLogout && (
                <Pressable style={styles.iconBtn} onPress={onLogout}>
                  <Ionicons name="log-out-outline" size={20} color={PROFILE_COLORS.DANGER} />
                </Pressable>
              )}
            </View>
          </>
        )}
        {readOnly && (
          <>
            <View style={styles.primaryActions}>
              {showMessageButton && onMessagePress && (
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
                  onPress={onMessagePress}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>{t("profile.message", "Message")}</Text>
                </Pressable>
              )}
              {onFriendPress && (
                <Pressable
                  style={[styles.primaryBtn, {
                    backgroundColor: friendStatus === "friends" ? cardColor : primaryColor,
                    borderWidth: friendStatus === "friends" ? 1 : 0,
                    borderColor: friendStatus === "friends" ? borderColor : primaryColor,
                  }]}
                  onPress={onFriendPress}
                >
                  <Ionicons
                    name={friendStatus === "friends" ? "people" : "person-add-outline"}
                    size={16}
                    color={friendStatus === "friends" ? textColor : "#fff"}
                  />
                  <Text style={[styles.primaryBtnText, { color: friendStatus === "friends" ? textColor : "#fff" }]}>
                    {friendStatus === "friends" ? t("profile.friends", "Friends") :
                     friendStatus === "request_sent" ? t("profile.pending", "Pending") :
                     friendStatus === "request_received" ? t("profile.acceptRequest", "Accept") :
                     t("profile.addFriend", "Add Friend")}
                  </Text>
                </Pressable>
              )}
              {showFollowButton && onFollowPress && (
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
                  onPress={onFollowPress}
                >
                  <Ionicons name="heart-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>{t("profile.follow", "Follow")}</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.secondaryRow}>
              {onShare && (
                <Pressable style={styles.iconBtn} onPress={onShare}>
                  <Ionicons name="share-social-outline" size={20} color={PROFILE_COLORS.TEXT_SECONDARY} />
                </Pressable>
              )}
              {onSavePress && (
                <Pressable style={styles.iconBtn} onPress={onSavePress} disabled={savingItem}>
                  <Ionicons
                    name={isSaved ? "bookmark" : "bookmark-outline"}
                    size={20}
                    color={isSaved ? "#FFD700" : PROFILE_COLORS.TEXT_SECONDARY}
                  />
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
};

interface ProfileTabsProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  tabs: TabDefinition[];
  primaryColor?: string;
  bgColor?: string;
  borderColor?: string;
  themeStyles?: ThemeStyles;
}

export const ProfileTabs: React.FC<ProfileTabsProps> = ({
  activeTab,
  onTabChange,
  tabs,
  primaryColor = PROFILE_COLORS.PRIMARY,
  bgColor = PROFILE_COLORS.CARD,
  borderColor = PROFILE_COLORS.BORDER,
  themeStyles,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.tabsScroll, { backgroundColor: bgColor, borderTopColor: borderColor, borderBottomColor: borderColor }]}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tabButton, isActive && { borderBottomColor: primaryColor, borderBottomWidth: 2 }]}
            onPress={() => onTabChange(tab.key)}
          >
            <Ionicons
              name={isActive ? (tab.icon.replace("-outline", "") as any) : tab.icon as any}
              size={20}
              color={isActive ? primaryColor : PROFILE_COLORS.TEXT_SECONDARY}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? primaryColor : PROFILE_COLORS.TEXT_SECONDARY },
                themeStyles as TextStyle,
              ]}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? ` ${tab.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingBottom: 12,
  },
  coverContainer: {
    width: SCREEN_WIDTH,
    height: PROFILE.COVER_HEIGHT,
    position: "relative",
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  coverEditBadge: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  identityOverlay: {
    position: "absolute",
    bottom: 56,
    left: 12,
    right: 12,
    zIndex: 20,
  },
  avatarRow: {
    alignItems: "flex-start",
    paddingHorizontal: PROFILE.HORIZONTAL_PADDING,
    marginTop: PROFILE.AVATAR_BOTTOM_OFFSET,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: PROFILE.AVATAR_SIZE,
    height: PROFILE.AVATAR_SIZE,
    borderRadius: PROFILE.AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: PROFILE_COLORS.CARD,
  },
  avatarFallback: {
    width: PROFILE.AVATAR_SIZE,
    height: PROFILE.AVATAR_SIZE,
    borderRadius: PROFILE.AVATAR_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: PROFILE_COLORS.CARD,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: "700",
    color: "#fff",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: PROFILE_COLORS.CARD,
  },
  headerInfo: {
    paddingHorizontal: PROFILE.HORIZONTAL_PADDING,
    marginTop: 8,
  },
  headerName: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 2,
  },
  slugRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  slugText: {
    fontSize: 14,
    fontWeight: "500",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 13,
  },
  bioText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: PROFILE.HORIZONTAL_PADDING,
    marginTop: 10,
    gap: 4,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
  },
  statCount: {
    fontSize: 17,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  completenessCard: {
    marginHorizontal: PROFILE.HORIZONTAL_PADDING,
    marginTop: 10,
    padding: 14,
    borderRadius: PROFILE.BUTTON_RADIUS,
    borderWidth: 1,
    gap: 6,
  },
  completenessTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  completenessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  completenessLabel: {
    fontSize: 13,
  },
  completenessBtn: {
    marginTop: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: PROFILE.BUTTON_RADIUS,
    alignSelf: "flex-start",
  },
  completenessBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  actionRow: {
    paddingHorizontal: PROFILE.HORIZONTAL_PADDING,
    marginTop: 12,
  },
  primaryActions: {
    flexDirection: "row",
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: PROFILE.BUTTON_RADIUS,
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: "#fff",
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
    justifyContent: "center",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  tabsScroll: {
    flexDirection: "row",
    paddingHorizontal: 4,
    gap: 8,
  },
  tabButton: {
    minWidth: 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});

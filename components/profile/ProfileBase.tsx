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
import { COLORS } from "../../lib/designTokens";
import AdaptiveImage from "../AdaptiveImage";
import FocalImage from "../FocalImage";
import AdaptiveVideo from "../AdaptiveVideo";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { PROFILE, PROFILE_COLORS } from "./ProfileDesign";
import { ThemeStyles } from "../../hooks/useThemeStyles";
import ProgressivePicker from "../navigation/ProgressivePicker";

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
  coverVideoUri?: string | null;
  coverFocalPoint?: { x: number; y: number } | null;
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
  onRepositionCover?: () => void;
  onEditAvatar?: () => void;
  onShare?: () => void;
  onSettings?: () => void;
  onEditProfile?: () => void;
  onCustomizeTheme?: () => void;
  onViewPublic?: () => void;
  onLogout?: () => void;
  showLogout?: boolean;
  onSaved?: () => void;
  onPlan?: () => void;
  showMessageButton?: boolean;
  onMessagePress?: () => void;
  friendStatus?: "friends" | "request_sent" | "request_received" | "none";
  onFriendPress?: () => void;
  showFollowButton?: boolean;
  onFollowPress?: () => void;
  onSavePress?: () => void;
  isSaved?: boolean;
  savingItem?: boolean;
  stats?: { label: string; count: number; onPress?: () => void }[];
  completenessItems?: { label: string; done: boolean }[];
}

type ActionBtnVariant = "primary" | "outline" | "secondaryIcon" | "dangerIcon" | "savedIcon";

function ProfileActionButton({
  label,
  icon,
  variant = "primary",
  color = PROFILE_COLORS.PRIMARY,
  onPress,
  disabled,
}: {
  label?: string;
  icon: string;
  variant?: ActionBtnVariant;
  color?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const isPrimary = variant === "primary" || variant === "savedIcon";
  const isOutline = variant === "outline";
  const isIcon = variant === "secondaryIcon" || variant === "dangerIcon" || variant === "savedIcon";

  const bg = variant === "primary" ? color
    : variant === "outline" ? "transparent"
    : variant === "dangerIcon" ? PROFILE_COLORS.DANGER
    : "transparent";

  const fg = variant === "primary" ? "#fff"
    : variant === "outline" ? color
    : variant === "dangerIcon" ? PROFILE_COLORS.DANGER
    : variant === "savedIcon" ? COLORS.gold
    : PROFILE_COLORS.TEXT_SECONDARY;

  const iconSize = isPrimary ? 16 : 20;

  if (isIcon && !label) {
    return (
      <Pressable style={abStyles.iconBtn} onPress={onPress} disabled={disabled} hitSlop={8}>
        <Ionicons name={icon as any} size={20} color={fg} />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[
        abStyles.btn,
        isPrimary && { backgroundColor: bg },
        isOutline && { backgroundColor: bg, borderWidth: 1.5, borderColor: color },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon as any} size={iconSize} color={fg} />
      {label && <Text style={[abStyles.text, { color: fg }]} numberOfLines={1}>{label}</Text>}
    </Pressable>
  );
}

const abStyles = StyleSheet.create({
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: PROFILE.BUTTON_RADIUS,
    minHeight: 44,
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
});

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  identityPicker,
  coverUri,
  coverVideoUri,
  coverFocalPoint,
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
  onRepositionCover,
  onEditAvatar,
  onShare,
  onSettings,
  onEditProfile,
  onCustomizeTheme,
  onPlan,
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
        {coverVideoUri ? (
          <AdaptiveVideo
            uri={coverVideoUri}
            style={styles.coverImage}
            borderRadius={0}
            isLooping
            initialMuted
          />
        ) : coverUri ? (
          <FocalImage uri={coverUri} aspectRatio={3} focalPoint={coverFocalPoint ?? { x: 0.5, y: 0.5 }} style={styles.coverImage} />
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: cardColor }]}>
            {!readOnly && (
              <Ionicons name="image-outline" size={40} color="#d1d5db" />
            )}
          </View>
        )}
        {!readOnly && (
          <Pressable
            style={[styles.coverEditBadge, { backgroundColor: primaryColor }]}
            onPress={coverUri || coverVideoUri ? onRepositionCover : onEditCover}
          >
            <Ionicons name="camera" size={14} color="#fff" />
          </Pressable>
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
            s.onPress ? (
              <Pressable key={i} style={styles.statItem} onPress={s.onPress}>
                <Text style={[styles.statCount, { color: textColor }, themeStyles as TextStyle]}>{s.count}</Text>
                <Text style={[styles.statLabel, { color: PROFILE_COLORS.TEXT_SECONDARY }]} numberOfLines={1} ellipsizeMode="tail">{s.label}</Text>
              </Pressable>
            ) : (
              <View key={i} style={styles.statItem}>
                <Text style={[styles.statCount, { color: textColor }, themeStyles as TextStyle]}>{s.count}</Text>
                <Text style={[styles.statLabel, { color: PROFILE_COLORS.TEXT_SECONDARY }]} numberOfLines={1} ellipsizeMode="tail">{s.label}</Text>
              </View>
            )
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
              <ProfileActionButton
                icon="create-outline"
                label={t("common.edit", "Profil bearbeiten")}
                onPress={onEditProfile}
                color={primaryColor}
              />
              {onShare && (
                <ProfileActionButton
                  icon="share-social-outline"
                  label={t("common.share", "Teilen")}
                  variant="outline"
                  onPress={onShare}
                  color={primaryColor}
                />
              )}
            </View>
            <View style={styles.secondaryRow}>
              {onCustomizeTheme && (
                <ProfileActionButton
                  icon="color-palette-outline"
                  label={t("common.design", "Design")}
                  variant="secondaryIcon"
                  onPress={onCustomizeTheme}
                />
              )}
              {onPlan && (
                <ProfileActionButton
                  icon="star-outline"
                  label={t("subscription.plan", "Plan")}
                  variant="secondaryIcon"
                  onPress={onPlan}
                />
              )}
              <ProfileActionButton
                icon="settings-outline"
                label={t("common.settings", "Einstellungen")}
                variant="secondaryIcon"
                onPress={onSettings || (() => router.push("/settings"))}
              />
              {showLogout && onLogout && (
                <ProfileActionButton
                  icon="log-out-outline"
                  label={t("common.logout", "Abmelden")}
                  variant="dangerIcon"
                  onPress={onLogout}
                />
              )}
            </View>
          </>
        )}
        {readOnly && (
          <>
            <View style={styles.primaryActions}>
              {showMessageButton && onMessagePress && (
                <ProfileActionButton
                  icon="chatbubble-ellipses-outline"
                  label={t("profile.message", "Nachricht")}
                  onPress={onMessagePress}
                  color={primaryColor}
                />
              )}
              {onFriendPress && (
                <ProfileActionButton
                  icon={friendStatus === "friends" ? "people" : "person-add-outline"}
                  label={friendStatus === "friends" ? t("profile.friends", "Freunde") :
                    friendStatus === "request_sent" ? t("profile.pending", "Anfrage gesendet") :
                    friendStatus === "request_received" ? t("profile.acceptRequest", "Annehmen") :
                    t("profile.addFriend", "Freund hinzufügen")}
                  variant={friendStatus === "friends" ? "outline" : "primary"}
                  onPress={onFriendPress}
                  color={friendStatus === "friends" ? primaryColor : primaryColor}
                />
              )}
              {showFollowButton && onFollowPress && (
                <ProfileActionButton
                  icon={friendStatus === "friends" ? "people" : "person-add-outline"}
                  label={friendStatus === "friends" ? t("profile.friends", "Folgen") :
                    friendStatus === "request_sent" ? t("profile.pending", "Anfrage gesendet") :
                    friendStatus === "request_received" ? t("profile.acceptRequest", "Annehmen") :
                    t("profile.follow", "Folgen")}
                  variant={friendStatus === "friends" ? "outline" : "primary"}
                  onPress={onFollowPress}
                  color={friendStatus === "friends" ? primaryColor : primaryColor}
                />
              )}
            </View>
            <View style={styles.secondaryRow}>
              {onShare && (
                <ProfileActionButton
                  icon="share-social-outline"
                  variant="secondaryIcon"
                  onPress={onShare}
                />
              )}
              {onSavePress && (
                <ProfileActionButton
                  icon={isSaved ? "bookmark" : "bookmark-outline"}
                  variant="savedIcon"
                  onPress={onSavePress}
                  disabled={savingItem}
                />
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
  const { t } = useTranslation();

  return (
    <ProgressivePicker
      label={t("navigation.section", "Bereich")}
      value={activeTab}
      options={tabs.map((tab) => ({
        key: tab.key,
        label: tab.label,
        icon: tab.icon as any,
        count: tab.count,
      }))}
      onChange={onTabChange}
      primaryColor={primaryColor}
      backgroundColor={bgColor}
      borderColor={borderColor}
    />
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    paddingBottom: 12,
  },
  coverContainer: {
    width: "100%",
    aspectRatio: PROFILE.COVER_ASPECT_RATIO,
    position: "relative",
    overflow: "hidden",
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    marginTop: 24,
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
    marginTop: 24,
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
    gap: 16,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 18,
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
    gap: 20,
    marginTop: 10,
    justifyContent: "center",
  },
  iconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  iconLabel: {
    fontSize: 12,
    color: PROFILE_COLORS.TEXT_SECONDARY,
  },
  tabsScroll: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 24,
    marginBottom: 20,
  },
  tabButton: {
    minWidth: 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});

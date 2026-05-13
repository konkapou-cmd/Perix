import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Share,
  Pressable,
  Dimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { User, UserPublic, GalleryItem, Post, APP_URL, ActivityItem, isUpcomingActivity } from "../../lib/api";
import { ActivitiesSection } from "../business";

import {
  ProfileHeader,
  ProfileTabs,
  ProfileTab,
  TabDefinition,
} from "./ProfileBase";
import { ProfilePosts } from "./ProfilePosts";
import { ProfileMedia } from "./ProfileMedia";
import { ProfileAboutData } from "./ProfileAbout";
import { ProfileAboutInline } from "./ProfileAboutInline";
import { PROFILE, PROFILE_COLORS } from "./ProfileDesign";
import { useThemeStyles } from "../../hooks/useThemeStyles";

import { FriendshipStatus } from "../../lib/api";

interface UserProfilePremiumProps {
  user: User | UserPublic;
  userId?: string;
  displayName?: string;
  setDisplayName?: (val: string) => void;
  bio?: string;
  setBio?: (val: string) => void;
  location?: string;
  setLocation?: (val: string) => void;
  slug?: string;
  onUpdateSlug?: (slug: string) => void;
  savingInfo?: boolean;
  handleSaveProfileInfo?: () => void;
  friends?: any[];
  setInviteModalVisible?: (val: boolean) => void;
  sessionToken?: string;
  themeModalVisible?: boolean;
  setThemeModalVisible?: (val: boolean) => void;
  handleAddPhoto?: () => void;
  handleAddVideo?: () => void;
  openCaptionEdit?: (url: string) => void;
  getCaptionForUrl?: (url: string) => string;
  refreshUser?: () => void;
  handleUpdateProfileGallery?: () => void;
  handleDeleteGalleryItem?: (type: "image" | "video", index: number) => void;
  handleUpdateProfilePhoto?: () => void;
  handleUpdateCoverPhoto?: () => void;
  languageModalVisible?: boolean;
  setLanguageModalVisible?: (val: boolean) => void;
  handleLogout?: () => void;
  galleryImages?: string[];
  galleryVideos?: string[];
  galleryItems?: GalleryItem[];
  readOnly?: boolean;
  userPosts?: Post[];
  onDeletePost?: (post: Post) => void;
  onEditPost?: (post: Post) => void;
  currentUserId?: string;
  userActivities?: ActivityItem[];
  openActivityModal?: (activity?: ActivityItem) => void;
  handleEditActivity?: (activity: ActivityItem) => void;
  handleDeleteActivity?: (activityId: string) => void;
  postText?: string;
  setPostText?: (val: string) => void;
  postImage?: string | null;
  postVideo?: string | null;
  postVideoPreview?: string | null;
  pickPostImage?: () => void;
  pickPostVideo?: () => void;
  onDiscardMedia?: () => void;
  handleCreatePost?: () => void;
  isOwnProfile?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  identityPicker?: React.ReactNode;
  friendStatus?: FriendshipStatus;
  onFriendPress?: () => void;
  showMessageButton?: boolean;
  onMessagePress?: () => void;
  avatarUri?: string | null;
  onEditProfile?: () => void;
  onOpenTagModal?: () => void;
  onEditTags?: (userIds: string[], businessIds: string[]) => void;
  showMentionSuggestions?: boolean;
  mentionSuggestions?: { id: string; name: string; type: 'user' | 'business'; avatar?: string | null }[];
  onSelectMention?: (item: { id: string; name: string; type: 'user' | 'business' }) => void;
  pendingMentionIds?: string[];
  onRefreshPosts?: () => void;
  businesses?: any[];
  onShare?: () => void;
  onSavePress?: () => void;
  isSaved?: boolean;
  savingItem?: boolean;
  onCreateStory?: () => void;
}

export const UserProfilePremium: React.FC<UserProfilePremiumProps> = ({
  user,
  userId,
  bio,
  location,
  slug,
  friends = [],
  sessionToken,
  themeModalVisible,
  setThemeModalVisible,
  setInviteModalVisible,
  handleAddPhoto,
  handleAddVideo,
  handleDeleteGalleryItem,
  handleUpdateProfilePhoto,
  handleUpdateCoverPhoto,
  setLanguageModalVisible,
  handleLogout,
  galleryImages = [],
  galleryVideos = [],
  readOnly = false,
  userPosts = [],
  onDeletePost,
  onEditPost,
  currentUserId,
  userActivities = [],
  openActivityModal,
  handleEditActivity,
  handleDeleteActivity,
  postText = "",
  setPostText = () => {},
  showMentionSuggestions = false,
  mentionSuggestions = [],
  onSelectMention,
  pendingMentionIds = [],
  onRefreshPosts,
  businesses = [],
  postImage = null,
  postVideo = null,
  postVideoPreview = null,
  pickPostImage,
  pickPostVideo,
  onDiscardMedia,
  handleCreatePost,
  isOwnProfile = false,
  identityPicker,
  avatarUri,
  friendStatus,
  onFriendPress,
  showMessageButton,
  onMessagePress,
  onEditProfile,
  onOpenTagModal,
  onEditTags,
  onShare,
  onSavePress,
  isSaved = false,
  savingItem = false,
  refreshing,
  onRefresh,
  onCreateStory,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [copied, setCopied] = useState(false);

  const hasActiveActivities = userActivities.some(a => isUpcomingActivity(a));

  const tabs: TabDefinition[] = useMemo(() => {
    const base: TabDefinition[] = [];
    if (hasActiveActivities) {
      base.push({ key: "activities", label: t("userProfile.activities", "Activities"), icon: "people-outline", count: userActivities.length });
    }
    base.push({ key: "posts", label: t("profile.posts", "Posts"), icon: "newspaper-outline", count: userPosts.length });
    base.push({ key: "media", label: t("profile.media", "Media"), icon: "images-outline", count: galleryImages.length + galleryVideos.length });
    if (!hasActiveActivities) {
      base.push({ key: "activities", label: t("userProfile.activities", "Activities"), icon: "people-outline", count: userActivities.length });
    }
    return base;
  }, [hasActiveActivities, userActivities.length, userPosts.length, galleryImages.length, galleryVideos.length, t]);

  const theme = user.theme;
  const { themeStyles, themeColors } = useThemeStyles(theme);
  const bgColor = themeColors.backgroundColor;
  const primaryColor = themeColors.primaryColor;
  const textColor = themeColors.textColor;
  const secondaryColor = themeColors.secondaryColor;
  const cardColor = themeColors.cardColor;
  const borderColor = themeColors.borderColor;
  const resolvedUserId = userId || user.user_id;

  const slugUrl = slug ? `${APP_URL}/user/${slug}` : undefined;

  const handleCopyLink = async () => {
    if (slugUrl) {
      await Clipboard.setStringAsync(slugUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = () => {
    const name = user?.name || "this profile";
    const url = slugUrl || `${APP_URL}/user/${user?.user_id || ""}`;
    Share.share({
      message: `Check out ${name} on Perix!\n${url}`,
      url,
    });
  };

  const handleViewPublic = () => {
    router.push(`/user/${resolvedUserId}`);
  };

  const aboutData: ProfileAboutData = {
    type: "user",
    bio: bio || user.bio,
    location: location || user.location,
  };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          refreshing !== undefined && onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
          ) : undefined
        }
      >
        <ProfileHeader
          identityPicker={identityPicker}
          coverUri={user.cover_photo}
          avatarUri={(user.profile_photo || user.picture) as string}
          avatarInitial={user.name?.charAt(0)?.toUpperCase() || "?"}
          name={user.name}
          slug={slugUrl}
          bio={bio || user.bio}
          location={location || user.location}
          primaryColor={primaryColor}
          textColor={textColor}
          cardColor={cardColor}
          bgColor={bgColor}
          borderColor={borderColor}
          themeStyles={themeStyles}
          readOnly={readOnly}
          onEditCover={handleUpdateCoverPhoto}
          onEditAvatar={handleUpdateProfilePhoto}
          onShare={onShare || handleShare}
          onViewPublic={handleViewPublic}
          onCustomizeTheme={() => setThemeModalVisible?.(true)}
          onEditProfile={onEditProfile}
          onSettings={() => router.push("/settings")}
          onLogout={handleLogout}
          showLogout={!readOnly}
          onSaved={() => router.push("/saved")}
          showMessageButton={showMessageButton}
          onMessagePress={onMessagePress}
          friendStatus={friendStatus}
          onFriendPress={onFriendPress}
          onSavePress={readOnly ? onSavePress : undefined}
          isSaved={readOnly ? isSaved : undefined}
          savingItem={readOnly ? savingItem : undefined}
          stats={[
            { label: t("profile.posts", "Posts"), count: userPosts.length },
            { label: t("profile.friends", "Friends"), count: friends.length },
            { label: t("userProfile.activities", "Activities"), count: userActivities.length },
          ]}
          completenessItems={
            !readOnly
              ? [
                  { label: t("profile.addPhoto", "Add a profile photo"), done: !!(user.profile_photo || user.picture) },
                  { label: t("profile.addBio", "Add a bio"), done: !!(bio || user.bio) },
                  { label: t("profile.addLocation", "Add your location"), done: !!(location || user.location) },
                ]
              : undefined
}
         />

        <ProfileAboutInline
          data={aboutData}
          primaryColor={primaryColor}
          cardColor={cardColor}
          textColor={textColor}
          borderColor={borderColor}
          readOnly={readOnly}
          onEditProfile={onEditProfile}
          themeStyles={themeStyles}
        />

        <ProfileTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={tabs}
          primaryColor={primaryColor}
          bgColor={cardColor}
          borderColor={borderColor}
          themeStyles={themeStyles}
        />

        <View style={styles.tabContent}>
          {activeTab === "posts" && (
            <ProfilePosts
              posts={userPosts}
              primaryColor={primaryColor}
              cardColor={cardColor}
              textColor={textColor}
              textSecondaryColor={secondaryColor}
              bgColor={bgColor}
              readOnly={readOnly}
              postText={postText}
              setPostText={setPostText}
              postImage={postImage}
              postVideo={postVideo}
              postVideoPreview={postVideoPreview}
              pickPostImage={pickPostImage}
              pickPostVideo={pickPostVideo}
              onDiscardMedia={onDiscardMedia}
              handleCreatePost={handleCreatePost}
              onDeletePost={onDeletePost}
              onEditPost={onEditPost}
              currentUserId={currentUserId}
              avatarUri={avatarUri}
              themeStyles={themeStyles}
              onOpenTagModal={onOpenTagModal}
              onEditTags={onEditTags}
              friends={friends}
              businesses={businesses}
              showMentionSuggestions={showMentionSuggestions}
              mentionSuggestions={mentionSuggestions}
              onSelectMention={onSelectMention}
              pendingMentionIds={pendingMentionIds}
              onRefreshPosts={onRefreshPosts}
              isOwnProfile={isOwnProfile}
              onCreateStory={onCreateStory}
            />
          )}
          {activeTab === "media" && (
            <ProfileMedia
              images={galleryImages}
              videos={galleryVideos}
              posts={userPosts}
              primaryColor={primaryColor}
              cardColor={cardColor}
              textColor={textColor}
              readOnly={readOnly}
              onAddPhoto={handleAddPhoto}
              onAddVideo={handleAddVideo}
              onDeleteItem={(source, type, uri) => {
                if (source === "post") {
                  const post = userPosts.find(p => p.image_url === uri || p.video_url === uri);
                  if (post) onDeletePost?.(post);
                } else {
                  if (type === "image") {
                    const idx = galleryImages.indexOf(uri);
                    if (idx !== -1) handleDeleteGalleryItem?.("image", idx);
                  } else {
                    const idx = galleryVideos.indexOf(uri);
                    if (idx !== -1) handleDeleteGalleryItem?.("video", idx);
                  }
                }
              }}
            />
          )}
          {activeTab === "activities" && (
            <ActivitiesSection
              activities={userActivities}
              onAddActivity={() => openActivityModal?.()}
              onEditActivity={handleEditActivity ?? (() => {})}
              onDeleteActivity={handleDeleteActivity ?? (() => {})}
              readOnly={readOnly}
              primaryColor={primaryColor}
              cardColor={cardColor}
              textColor={textColor}
              secondaryColor={secondaryColor}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    marginTop: 12,
  },
  tabSection: {
    paddingTop: 12,
  },
  highlightsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  
});

import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  Pressable,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useIsFocused } from "@react-navigation/native";
import { COLORS } from "../../lib/designTokens";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { User, UserPublic, GalleryItem, Post, APP_URL, ActivityItem, updateProfileMedia } from "../../lib/api";
import { fetchEntitlements, resendVerification } from "../../lib/api/account";
import { illustratedIconSource } from "../icons/IllustratedIcon";
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
import { Listing } from "../../lib/api/listings";
import { getBookings } from "../../lib/api/services";
import ProfileItemsSection from "../marketplace/ProfileItemsSection";
import { useThemeStyles } from "../../hooks/useThemeStyles";
import FriendsCarousel from "../FriendsCarousel";
import { FriendsSection } from "../shared/FriendsSection";
import CoverPositionEditor from "../CoverPositionEditor";
import ImageZoomModal from "../ImageZoomModal";

import { FriendshipStatus, FriendProfile } from "../../lib/api";

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
  isPosting?: boolean;
  uploadPercent?: number;
  isOwnProfile?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  friendStatus?: FriendshipStatus;
  onFriendPress?: () => void;
  showMessageButton?: boolean;
  onMessagePress?: () => void;
  avatarUri?: string | null;
  onEditProfile?: () => void;
  onOpenTagModal?: () => void;
  onEditTags?: (userIds: string[], businessIds: string[]) => void;
  showMentionSuggestions?: boolean;
  mentionSuggestions?: { id: string; name: string; type: 'user' | 'business' | 'activity' | 'listing'; avatar?: string | null }[];
  onSelectMention?: (item: { id: string; name: string; type: 'user' | 'business' | 'activity' | 'listing' }) => void;
  pendingMentionIds?: string[];
  onRefreshPosts?: () => void;
  businesses?: any[];
  onShare?: () => void;
  onSavePress?: () => void;
  onReportPress?: () => void;
  onBlockPress?: () => void;
  isBlocked?: boolean;
  isSaved?: boolean;
  savingItem?: boolean;
  onCreateStory?: () => void;
  onOpenBookings?: () => void;
  onViewFriends?: () => void;
  initialSavedPostIds?: Set<string>;
  userListings?: Listing[];
  userHomeListings?: Listing[];
  onAddItem?: () => void;
  onAddHome?: () => void;
  onEditItem?: (listing: Listing) => void;
  onToggleMarketplace?: (listing: Listing) => void;
  onDeleteItem?: (listing: Listing) => void;
  initialTab?: "activities" | "posts" | "items";
  tagHintText?: string | null;
  profileViews?: number | null;

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
  refreshUser,
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
  isPosting = false,
  uploadPercent = 0,
  isOwnProfile = false,
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
  onReportPress,
  onBlockPress,
  isBlocked = false,
  refreshing,
  onRefresh,
  onCreateStory,
  onOpenBookings,
  onViewFriends,
  initialSavedPostIds,
  userListings = [],
  userHomeListings = [],
  onAddItem,
  onAddHome,
  onEditItem,
  onToggleMarketplace,
  onDeleteItem,
  initialTab,
  tagHintText = null,
  profileViews = null,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab as ProfileTab || "posts");
  const [copied, setCopied] = useState(false);
  const [showCoverReposition, setShowCoverReposition] = useState(false);
  const [coverViewer, setCoverViewer] = useState<{ items: { uri: string; type: "image"; id: string }[]; index: number } | null>(null);
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  // Plan gate for the owner's tabs: default "free_user" keeps premium tabs locked
  // until the entitlement snapshot arrives (same rule as the CreationSheet).
  const [plan, setPlan] = useState<string>("free_user");
  const [redemptionDeadline, setRedemptionDeadline] = useState<string | null>(null);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailResendState, setEmailResendState] = useState<string | null>(null);

  const onResendEmail = async () => {
    if (!sessionToken || resendingEmail) return;
    setResendingEmail(true);
    setEmailResendState(null);
    try {
      const res = await resendVerification(sessionToken);
      setEmailResendState(res.status);
    } catch (e) {
      setEmailResendState("error");
    } finally {
      setResendingEmail(false);
    }
  };

  useEffect(() => {
    if (readOnly || !sessionToken) return;
    let cancelled = false;
    fetchEntitlements(sessionToken, "user")
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot.effective_plan) setPlan(snapshot.effective_plan);
        const deadline = snapshot.redemption?.profile_complete_deadline;
        if (deadline) setRedemptionDeadline(deadline);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [readOnly, sessionToken]);
  const scrollRef = useRef<ScrollView>(null);
  const tabsYRef = useRef(0);

  useEffect(() => {
    if (!sessionToken || !onOpenBookings || !isScreenFocused) return;
    let cancelled = false;
    getBookings(sessionToken, undefined, "pending")
      .then((data) => {
        if (!cancelled) setPendingBookingsCount(data.length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionToken, onOpenBookings, isScreenFocused]);

  const handleTabChange = useCallback((tab: ProfileTab) => {
    const def = tabsRef.current.find((td) => td.key === tab);
    if (def?.locked) {
      router.push("/plans" as any);
      return;
    }
    setActiveTab(tab);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: tabsYRef.current, animated: true });
    }, 50);
  }, [router]);

  const isPremiumPlan = plan === "premium_user";
  const isBusinessPlan = plan === "business" || plan === "event_pro";
  const premiumUnlocked = isPremiumPlan || isBusinessPlan;

  const tabs: TabDefinition[] = useMemo(() => {
    const base: TabDefinition[] = [];
    if (readOnly) {
      // Public profile: only tabs that already have content (data connections unchanged).
      if (galleryImages.length + galleryVideos.length > 0) {
        base.push({ key: "media", label: t("profile.media", "Media"), icon: "images-outline", count: galleryImages.length + galleryVideos.length });
      }
      base.push({ key: "posts", label: t("profile.posts", "Posts"), iconSource: illustratedIconSource("home", "posts"), icon: "newspaper-outline", count: userPosts.length });
      if (userActivities.length > 0) {
        base.push({ key: "activities", label: t("userProfile.activities", "Activities"), iconSource: illustratedIconSource("home", "activities"), icon: "people-outline", count: userActivities.length });
      }
      if (userHomeListings.length > 0) {
        base.push({ key: "homes", label: t("marketplace.listings", "Listings"), iconSource: illustratedIconSource("home", "homes-nearby"), icon: "home-outline", count: userHomeListings.length });
      }
      if (userListings.length > 0) {
        base.push({ key: "items", label: t("marketplace.items", "Items"), iconSource: illustratedIconSource("home", "products"), icon: "list-outline", count: userListings.length });
      }
      return base;
    }
    // Owner: every possible tab is visible — plan-gated ones are locked with
    // an upgrade hint (same split rule as the CreationSheet: Free locks
    // Activities / Items / Homes, Premium & Business unlock them).
    base.push({ key: "media", label: t("profile.media", "Media"), icon: "images-outline", count: galleryImages.length + galleryVideos.length });
    base.push({ key: "posts", label: t("profile.posts", "Posts"), iconSource: illustratedIconSource("home", "posts"), icon: "newspaper-outline", count: userPosts.length });
    base.push({ key: "activities", label: t("userProfile.activities", "Activities"), iconSource: illustratedIconSource("home", "activities"), icon: "people-outline", count: userActivities.length, locked: !premiumUnlocked });
    base.push({ key: "items", label: t("marketplace.items", "Items"), iconSource: illustratedIconSource("home", "products"), icon: "list-outline", count: userListings.length, locked: !premiumUnlocked });
    base.push({ key: "homes", label: t("marketplace.listings", "Listings"), iconSource: illustratedIconSource("home", "homes-nearby"), icon: "home-outline", count: userHomeListings.length, locked: !premiumUnlocked });
    if (onOpenBookings) {
      base.push({ key: "bookings", label: t("services.myBookings", "My Bookings"), icon: "calendar-outline", count: pendingBookingsCount });
    }
    base.push({ key: "applications", label: t("jobs.myApplications", "Meine Bewerbungen"), icon: "document-text-outline" });
    return base;
  }, [readOnly, t, userPosts.length, userActivities.length, galleryImages.length, galleryVideos.length, userListings.length, userHomeListings.length, onOpenBookings, pendingBookingsCount, premiumUnlocked]);

  // If the plan arrives late and the active tab is locked, fall back to posts.
  useEffect(() => {
    if (readOnly) return;
    const def = tabs.find((td) => td.key === activeTab);
    if (def?.locked) setActiveTab("posts");
  }, [tabs, activeTab, readOnly]);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const theme = user.theme;
  const { themeStyles } = useThemeStyles(theme);
  const bgColor = "#FFFFFF";
  const primaryColor = "#59ABE3";
  const textColor = "#264348";
  const secondaryColor = "rgba(38,67,72,0.65)";
  const cardColor = "#FFFFFF";
  const borderColor = "rgba(38,67,72,0.15)";
  const resolvedUserId = userId || user.user_id;

  const slugUrl = slug
    ? `${APP_URL}/share/user/${slug}`
    : `${APP_URL}/share/user/${resolvedUserId}`;

  const handleCopyLink = async () => {
    if (slugUrl) {
      await Clipboard.setStringAsync(slugUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = () => {
    const name = user?.name || "this profile";
    Share.share({
      message: `${name}\n${slugUrl}`,
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

  const isWeb = Platform.OS === "web";

  const profileHeaderContent = (
    <>
      <ProfileHeader
        coverUri={user.cover_photo}
        coverVideoUri={(!user.cover_photo && (user as any).video_url) ? (user as any).video_url : undefined}
        coverFocalPoint={user.cover_focal_point}
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
        onRepositionCover={() => setShowCoverReposition(true)}
        onCoverPress={() => {
          if (user.cover_photo) {
            setCoverViewer({ items: [{ uri: user.cover_photo, type: "image", id: "cover" }], index: 0 });
          }
        }}
        onAvatarPress={() => {
          const viewerAvatar = (user.profile_photo || user.picture) as string | undefined;
          if (viewerAvatar) {
            setCoverViewer({ items: [{ uri: viewerAvatar, type: "image", id: "avatar" }], index: 0 });
          }
        }}
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
        onReportPress={readOnly ? onReportPress : undefined}
        onBlockPress={readOnly ? onBlockPress : undefined}
        isBlocked={isBlocked}
        stats={[
          { label: t("profile.friends", "Friends"), count: friends.length, onPress: onViewFriends },
          ...(profileViews != null ? [{ label: t("profile.profileViews", "Profile views"), count: profileViews }] : []),
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
        completenessTip={
          !readOnly
            ? t("profile.trustTip", "Δεν χρειάζεται να δείχνετε ωραίοι, αλλά άνθρωποι εμπιστοσύνης.")
            : undefined
        }
        profileDeadline={
          !readOnly && redemptionDeadline
            ? `${t("profile.completeProfileDeadline", "Ολοκλήρωσε το προφίλ σου έως")} ${new Date(redemptionDeadline).toLocaleDateString("el-GR")}`
            : undefined
        }
      />

      {!readOnly && (
        <Pressable
          style={[styles.plansBanner, { borderColor: primaryColor }]}
          onPress={() => router.push("/plans" as any)}
          accessibilityRole="button"
        >
          <Ionicons name="layers-outline" size={18} color={primaryColor} />
          <Text style={[styles.plansBannerText, { color: textColor }]}>
            {t("profile.viewPlans", "Δες τα πλάνα — Free, Premium, Business")}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={primaryColor} />
        </Pressable>
      )}

      {!readOnly && user.email_verified === false && (
        <View style={styles.emailBanner}>
          <Ionicons name="mail-unread-outline" size={18} color="#264348" />
          <View style={{ flex: 1 }}>
            <Text style={styles.emailBannerText}>
              {t("profile.verifyEmail", "Επιβεβαίωσε το email σου (έχεις 6 ώρες) για να προσθέτεις περιεχόμενο.")}
            </Text>
            {emailResendState === "sent" ? (
              <Text style={styles.emailSentText}>{t("profile.emailSent", "Στάλθηκε! Τσέκαρε τα εισερχόμενά σου.")}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={onResendEmail}
            disabled={resendingEmail}
            style={styles.emailResendBtn}
            accessibilityRole="button"
          >
            <Text style={styles.emailResendText}>
              {resendingEmail ? "…" : t("profile.resendEmail", "Αποστολή ξανά")}
            </Text>
          </Pressable>
        </View>
      )}

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

      <View onLayout={(e) => { tabsYRef.current = e.nativeEvent.layout.y; }}>
        <ProfileTabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabs={tabs}
          primaryColor={primaryColor}
          bgColor={cardColor}
        borderColor={borderColor}
        themeStyles={themeStyles}
          onLockedPress={() => router.push("/plans" as any)}
      />
      </View>
      {coverViewer ? (
        <ImageZoomModal
          visible={!!coverViewer}
          mediaArray={coverViewer.items}
          initialIndex={coverViewer.index}
          onClose={() => setCoverViewer(null)}
        />
      ) : null}
    </>
  );

  const tabContentNonPosts = (
    <View style={styles.tabContent}>
      {activeTab === "media" && (
        <ProfileMedia
          images={galleryImages}
          videos={galleryVideos}
          posts={userPosts}
          primaryColor={primaryColor}
          cardColor={cardColor}
          textColor={textColor}
          readOnly={readOnly}
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
      {activeTab === "bookings" && (
        <View style={styles.bookingTab}>
          <Text style={[styles.bookingTabTitle, { color: textColor }]} numberOfLines={1}>{t("services.myBookings", "My Bookings")}</Text>
          <Text style={[styles.bookingTabDesc, { color: secondaryColor }]} numberOfLines={1} ellipsizeMode="tail">{t("services.myBookingsDesc", "View and manage your booked services")}</Text>
          <Pressable
            style={[styles.bookingTabBtn, { backgroundColor: primaryColor }]}
            onPress={() => { onOpenBookings?.(); setActiveTab("posts"); }}
          >
            <Ionicons name="calendar" size={18} color="#fff" />
            <Text style={styles.bookingTabBtnText}>{t("services.viewBookings", "View My Bookings")}</Text>
          </Pressable>
        </View>
      )}
      {activeTab === "applications" && (
        <View style={styles.bookingTab}>
          <Text style={[styles.bookingTabTitle, { color: textColor }]} numberOfLines={1}>{t("jobs.myApplications", "Meine Bewerbungen")}</Text>
          <Text style={[styles.bookingTabDesc, { color: secondaryColor }]} numberOfLines={1} ellipsizeMode="tail">{t("jobs.myApplicationsDesc", "Hier findest du deine Bewerbungen")}</Text>
          <Pressable
            style={[styles.bookingTabBtn, { backgroundColor: primaryColor }]}
            onPress={() => router.push("/my-applications" as any)}
          >
            <Ionicons name="briefcase" size={18} color="#fff" />
            <Text style={styles.bookingTabBtnText}>{t("jobs.myApplications", "Meine Bewerbungen")}</Text>
          </Pressable>
        </View>
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
      {activeTab === "items" && (
        <ProfileItemsSection
          listings={userListings}
          isOwner={isOwnProfile ?? false}
          listingType="product"
          onAdd={isOwnProfile ? onAddItem! : () => {}}
          onEdit={isOwnProfile ? onEditItem! : (() => {}) as any}
          onToggleMarketplace={isOwnProfile ? onToggleMarketplace! : (() => {}) as any}
          onDelete={isOwnProfile ? onDeleteItem! : (() => {}) as any}
        />
      )}
      {activeTab === "homes" && (
        <ProfileItemsSection
          listings={userHomeListings}
          isOwner={isOwnProfile ?? false}
          listingType="home_rental"
          onAdd={isOwnProfile ? (onAddHome ?? onAddItem)! : (() => {})}
          onEdit={(l) => onEditItem?.(l)}
          onToggleMarketplace={(l) => onToggleMarketplace?.(l)}
          onDelete={(l) => onDeleteItem?.(l)}
        />
      )}
    </View>
  );

  if (!isWeb) {
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: bgColor }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <ProfilePosts
          posts={activeTab === "posts" ? userPosts : []}
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
          isPosting={isPosting}
          uploadPercent={uploadPercent}
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
          isScreenFocused={isScreenFocused}
          tagHintText={tagHintText}
          refreshing={refreshing}
          onRefresh={onRefresh}
          initialSavedPostIds={initialSavedPostIds}
          listHeaderComponent={profileHeaderContent}
          listEmptyComponent={activeTab === "posts" ? undefined : tabContentNonPosts}
          showComposer={activeTab === "posts"}
        />
        {user.cover_photo && (
          <CoverPositionEditor
            visible={showCoverReposition}
            uri={user.cover_photo}
            initialFocalPoint={user.cover_focal_point ?? { x: 0.5, y: 0.5 }}
            aspectRatio={3}
            onCancel={() => setShowCoverReposition(false)}
            onSave={async (fp) => {
              if (sessionToken) {
                await updateProfileMedia(sessionToken, { cover_focal_point: fp } as any);
              }
              setShowCoverReposition(false);
              refreshUser?.();
            }}
          />
        )}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: bgColor }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
        refreshControl={
          refreshing !== undefined && onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
          ) : undefined
        }
      >
        {profileHeaderContent}
        {activeTab === "posts" ? (
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
              isPosting={isPosting}
              uploadPercent={uploadPercent}
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
              isScreenFocused={isScreenFocused}
          tagHintText={tagHintText}
              refreshing={refreshing}
              onRefresh={onRefresh}
              initialSavedPostIds={initialSavedPostIds}
            />
          ) : (
            tabContentNonPosts
          )}
      </ScrollView>

      {user.cover_photo && (
        <CoverPositionEditor
          visible={showCoverReposition}
          uri={user.cover_photo}
          initialFocalPoint={user.cover_focal_point ?? { x: 0.5, y: 0.5 }}
          aspectRatio={3}
          onCancel={() => setShowCoverReposition(false)}
          onSave={async (fp) => {
            if (sessionToken) {
              await updateProfileMedia(sessionToken, { cover_focal_point: fp } as any);
            }
            setShowCoverReposition(false);
            refreshUser?.();
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  plansBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  plansBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  emailBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.warning ?? "#FFC400",
    backgroundColor: COLORS.warningLight ?? "#FFF1B8",
  },
  emailBannerText: {
    fontSize: 12,
    color: "#264348",
    lineHeight: 17,
  },
  emailSentText: {
    fontSize: 11,
    color: COLORS.success ?? "#22C55E",
    fontWeight: "700",
    marginTop: 2,
  },
  emailResendBtn: {
    backgroundColor: "#59ABE3",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  emailResendText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  tabContent: {
    paddingHorizontal: 0,
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
  bookingTab: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  bookingTabTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  bookingTabDesc: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  bookingTabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  bookingTabBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});

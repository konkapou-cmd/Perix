import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Share,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import {
  BusinessDetail,
  EventItem,
  CategoryGroup,
  Post,
  Job,
  Rental,
  Service,
  BusinessAnalytics,
  APP_URL,
  isUpcomingEvent,
  updateBusiness,
} from "../../lib/api";
import { translateCategory } from "../../lib/categoryTranslation";
import {
  EventsSection,
  JobsSection,
  ServiceSection,
} from "../business";
import { ContentMap } from "../shared";
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
import { PROFILE_COLORS } from "./ProfileDesign";
import { COLORS, CATEGORY_SERVICE_TYPES, resolveCategory, getServiceTypeConfig } from "../../lib/designTokens";
import { useThemeStyles } from "../../hooks/useThemeStyles";
import useResponsiveLayout from "../../hooks/useResponsiveLayout";
import FriendsCarousel from "../FriendsCarousel";
import { FriendsSection } from "../shared/FriendsSection";
import CoverPositionEditor from "../CoverPositionEditor";


interface BusinessProfilePremiumProps {
  business: BusinessDetail;
  businessId?: string;
  sessionToken: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  categoryTree?: CategoryGroup[];
  events?: EventItem[];
  openCategoryModal?: () => void;
  openEventModal?: (event?: EventItem) => void;
  handleEditEvent?: (event: EventItem) => void;
  handleDeleteEvent?: (eventId: string) => void;
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
  jobs?: Job[];
  openJobModal?: () => void;
  handleDeleteJob?: (jobId: string) => void;
  handleEditJob?: (job: any) => void;
  fanGalleryPosts?: Post[];
  handleHideFanPost?: (postId: string) => void;
  openingHours?: Record<string, any>;
  openHoursModal?: () => void;
  socialLinks?: Record<string, string>;
  openSocialLinksModal?: () => void;
  openLocationModal?: () => void;
  galleryImages?: string[];
  galleryVideos?: string[];
  handleAddGalleryPhoto?: () => void;
  handleAddGalleryVideo?: () => void;
  isUploading?: boolean;
  handleDeleteGalleryImage?: (index: number) => void;
  handleDeleteGalleryVideo?: (index: number) => void;
  handleMoveGalleryImage?: (from: number, to: number) => void;
  handleMoveGalleryVideo?: (from: number, to: number) => void;
  onUpdateLogo?: () => void;
  onUpdateCover?: () => void;
  slug?: string;
  onUpdateSlug?: (slug: string) => void;
  analytics?: BusinessAnalytics | null;
  analyticsLoading?: boolean;
  loadAnalytics?: (businessId: string) => void;
  themeModalVisible?: boolean;
  setThemeModalVisible?: (val: boolean) => void;
  onEditProfile?: () => void;
  readOnly?: boolean;
  businessPosts?: Post[];
  onDeletePost?: (post: Post) => void;
  onEditPost?: (post: Post) => void;
  currentUserId?: string;
  identityPicker?: React.ReactNode;
  showMessageButton?: boolean;
  onMessagePress?: () => void;
  friendStatus?: "friends" | "request_sent" | "request_received" | "none";
  onFollowPress?: () => void;
  onShare?: () => void;
  onSavePress?: () => void;
  isSaved?: boolean;
  savingItem?: boolean;
  avatarUri?: string | null;
  onOpenTagModal?: () => void;
  onEditTags?: (userIds: string[], businessIds: string[]) => void;
  showMentionSuggestions?: boolean;
  mentionSuggestions?: { id: string; name: string; type: 'user' | 'business'; avatar?: string | null }[];
  onSelectMention?: (item: { id: string; name: string; type: 'user' | 'business' }) => void;
  pendingMentionIds?: string[];
  onRefreshPosts?: () => void;
  friends?: any[];
  onCreateStory?: () => void;
  onUploadCityAd?: () => void;
  onPlan?: () => void;
  services?: Service[];
  rentals?: any[];
  openMediaViewer?: (index: number) => void;
  onAddService?: (type: string) => void;
  handleEditService?: (service: Service) => void;
  handleDeleteService?: (serviceId: string) => void;
  openBookingModal?: (service: Service) => void;
  onOpenSlotManager?: (serviceId: string) => void;
  onOpenBookingList?: () => void;
  onViewFriends?: () => void;
}

export const BusinessProfilePremium: React.FC<BusinessProfilePremiumProps> = ({
  business: detail,
  sessionToken,
  refreshing,
  onRefresh,
  events = [],
  openEventModal,
  handleEditEvent,
  handleDeleteEvent,
  postText = "",
  setPostText = () => {},
  postImage,
  postVideo,
  postVideoPreview,
  pickPostImage,
  pickPostVideo,
  onDiscardMedia,
  handleCreatePost,
  isPosting = false,
  uploadPercent = 0,
  showMentionSuggestions = false,
  mentionSuggestions = [],
  onSelectMention,
  pendingMentionIds = [],
  onRefreshPosts,
  friends = [],
  isOwnProfile = false,
  jobs = [],
  openJobModal,
  handleDeleteJob,
  handleEditJob,
  openingHours = {},
  openHoursModal,
  socialLinks = {},
  openSocialLinksModal,
  openLocationModal,
  galleryImages = [],
  galleryVideos = [],
  handleAddGalleryPhoto,
  handleAddGalleryVideo,
  isUploading = false,
  handleDeleteGalleryImage,
  handleDeleteGalleryVideo,
  onUpdateLogo,
  onUpdateCover,
  analytics,
  analyticsLoading,
  loadAnalytics,
  themeModalVisible,
  setThemeModalVisible,
  onEditProfile,
  readOnly = false,
  businessPosts = [],
  onDeletePost,
  onEditPost,
  currentUserId,
  slug,
  identityPicker,
  showMessageButton,
  onMessagePress,
  friendStatus,
  onFollowPress,
  onShare,
  onSavePress,
  isSaved = false,
  savingItem = false,
  avatarUri,
  onOpenTagModal,
  onEditTags,
  onCreateStory,
  onUploadCityAd,
  onPlan,
  services = [],
  onAddService,
  handleEditService,
  handleDeleteService,
  openBookingModal,
  onOpenSlotManager,
  onOpenBookingList,
  onViewFriends,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [activeTab, setActiveTab] = useState("posts");
  const [privateActiveTab, setPrivateActiveTab] = useState("posts");
  const [showCoverReposition, setShowCoverReposition] = useState(false);
  const [coverRepositionFp, setCoverRepositionFp] = useState(detail.business.cover_focal_point ?? { x: 0.5, y: 0.5 });

  const publicTabs: TabDefinition[] = useMemo(() => {
    const tabs: TabDefinition[] = [];
    tabs.push({ key: "posts", label: t("profile.posts", "Posts"), icon: "newspaper-outline", count: businessPosts.length });
    if (galleryImages.length + galleryVideos.length > 0) {
      tabs.push({ key: "media", label: t("profile.media", "Media"), icon: "images-outline", count: galleryImages.length + galleryVideos.length });
    }
    if (events.length > 0) {
      tabs.push({ key: "events", label: t("events.title", "Events"), icon: "calendar", count: events.length });
    }
    if (jobs.length > 0) {
      tabs.push({ key: "jobs", label: t("jobs.title", "Jobs"), icon: "briefcase", count: jobs.length });
    }
    // Service type tabs — one per categoryKey:serviceType
    const mod = detail.business.enabled_modules;
    const hasServiceModule = mod?.services || mod?.menu || mod?.gym || mod?.rentals;
    if (hasServiceModule) {
      const seen = new Set<string>();
      (services || []).filter(s => s.is_active).forEach(s => {
        const cat = resolveCategory(s.root_category || "");
        const tabKey = `svc:${cat}:${s.type}`;
        if (!seen.has(tabKey)) {
          seen.add(tabKey);
          const config = getServiceTypeConfig(cat, s.type);
          const count = (services || []).filter(sv =>
            resolveCategory(sv.root_category || "") === cat &&
            sv.type === s.type &&
            sv.is_active
          ).length;
          tabs.push({
            key: tabKey,
            label: config?.publicTabLabel || s.type,
            icon: config?.icon || "grid",
            count,
          });
        }
      });
    }
    return tabs;
  }, [businessPosts.length, galleryImages.length, galleryVideos.length, events.length, jobs.length, services, detail.business.enabled_modules, detail.business.root_category, t]);

  const privateTabs: TabDefinition[] = useMemo(() => {
    const tabs: TabDefinition[] = [];
    // 1. Posts
    tabs.push({ key: "posts", label: t("profile.posts", "Posts"), icon: "newspaper-outline", count: businessPosts.length });
    // 2. Service type tabs — one per categoryKey:serviceType (same as publicTabs)
    const mod = detail.business.enabled_modules;
    const hasServiceModule = mod?.services || mod?.menu || mod?.gym || mod?.rentals;
    if (hasServiceModule) {
      const seen = new Set<string>();
      (services || []).filter(s => s.is_active).forEach(s => {
        const cat = resolveCategory(s.root_category || "");
        const tabKey = `svc:${cat}:${s.type}`;
        if (!seen.has(tabKey)) {
          seen.add(tabKey);
          const config = getServiceTypeConfig(cat, s.type);
          const count = (services || []).filter(sv =>
            resolveCategory(sv.root_category || "") === cat &&
            sv.type === s.type &&
            sv.is_active
          ).length;
          tabs.push({
            key: tabKey,
            label: config?.publicTabLabel || s.type,
            icon: config?.icon || "grid",
            count,
          });
        }
      });
    }
    // 3. Events
    if (events.length > 0) {
      tabs.push({ key: "events", label: t("events.title", "Events"), icon: "calendar", count: events.length });
    }
    // 4. Jobs
    if (jobs.length > 0) {
      tabs.push({ key: "jobs", label: t("jobs.title", "Jobs"), icon: "briefcase", count: jobs.length });
    }
    // 5. Media (always visible for owner)
    tabs.push({ key: "media", label: t("profile.media", "Media"), icon: "images-outline", count: galleryImages.length + galleryVideos.length });
    return tabs;
  }, [businessPosts.length, galleryImages.length, galleryVideos.length, events.length, jobs.length, services, detail.business.enabled_modules, detail.business.root_category, t]);

  const theme = detail.business.theme;
  const { themeStyles, themeColors, isDark } = useThemeStyles(theme);
  const { isDesktop } = useResponsiveLayout();
  const bgColor = themeColors.backgroundColor;
  const primaryColor = themeColors.primaryColor;
  const textColor = themeColors.textColor;
  const secondaryColor = themeColors.secondaryColor;
  const cardColor = themeColors.cardColor;
  const borderColor = themeColors.borderColor;

  const slugUrl = slug ? `${APP_URL}/business/${slug}` : undefined;

  const handleCopyLink = async () => {
    if (slugUrl) {
      await Clipboard.setStringAsync(slugUrl);
    }
  };

  const handleShare = () => {
    const name = detail?.business?.name || "this business";
    const url = slugUrl || `${APP_URL}/business/${detail?.business?.business_id || ""}`;
    Share.share({
      message: `Check out ${name} on Perix!\n${url}`,
      url,
    });
  };

  const handleViewPublic = () => {
    router.push(`/business/${detail.business.business_id}`);
  };

  const ALL_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  
  const transformedHours: Record<string, { open: string; close: string }> = {};
  
  // Always include all 7 days with data from API or defaults
  ALL_DAYS.forEach((day) => {
    const dayData = openingHours?.[day];
    if (dayData && dayData.periods && dayData.periods[0]) {
      transformedHours[day] = {
        open: dayData.periods[0].open || "09:00",
        close: dayData.periods[0].close || "18:00",
      };
    } else {
      // Default hours if not set
      transformedHours[day] = {
        open: "09:00",
        close: "18:00",
      };
    }
  });

  const aboutData: ProfileAboutData = {
    type: "business",
    bio: detail.business.description,
    location: detail.business.address,
    website: isOwnProfile ? undefined : detail.business.website,
    email: isOwnProfile ? undefined : detail.business.email,
    phone: isOwnProfile ? undefined : detail.business.phone,
    socialLinks: isOwnProfile ? undefined : socialLinks,
    openingHours: isOwnProfile ? undefined : transformedHours,
    isOpen: (() => {
      try {
        const now = new Date();
        const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const todayKey = dayNames[now.getDay()];
        const todayData = openingHours?.[todayKey];
        if (!todayData || !todayData.enabled || !todayData.periods?.[0]) return false;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        for (const period of todayData.periods) {
          const [oH, oM] = (period.open || "09:00").split(":").map(Number);
          const [cH, cM] = (period.close || "18:00").split(":").map(Number);
          const openMin = oH * 60 + oM;
          const closeMin = cH * 60 + cM;
          if (currentMinutes >= openMin && currentMinutes <= closeMin) return true;
        }
        return false;
      } catch { return false; }
    })(),
  };

  const profileHeaderContent = (
    <>
      <ProfileHeader
        identityPicker={identityPicker}
        coverUri={detail.business.cover_image}
        coverVideoUri={(!detail.business.cover_image && (detail.business as any).video_url) ? (detail.business as any).video_url : undefined}
        coverFocalPoint={detail.business.cover_focal_point}
        onRepositionCover={() => setShowCoverReposition(true)}
        avatarUri={detail.business.logo_image}
        avatarInitial={detail.business.name?.charAt(0)?.toUpperCase() || "B"}
        name={detail.business.name}
        slug={slugUrl}
        bio={detail.business.description}
        location={detail.business.address}
        primaryColor={primaryColor}
        textColor={textColor}
        cardColor={cardColor}
        bgColor={bgColor}
        borderColor={borderColor}
        themeStyles={themeStyles}
        readOnly={readOnly}
        onEditCover={onUpdateCover}
        onEditAvatar={onUpdateLogo}
        onShare={onShare || handleShare}
        onViewPublic={handleViewPublic}
        onCustomizeTheme={() => setThemeModalVisible?.(true)}
        onPlan={onPlan}
        onEditProfile={onEditProfile}
        onSettings={() => router.push("/settings")}
        onLogout={() => {}}
        showLogout={false}
        showMessageButton={showMessageButton}
        onMessagePress={onMessagePress}
        showFollowButton={!!onFollowPress}
        onFollowPress={onFollowPress}
        onSavePress={onSavePress}
        isSaved={isSaved}
        savingItem={savingItem}
        friendStatus={friendStatus || "none"}
        stats={[
          { label: t("profile.posts", "Posts"), count: businessPosts.length },
          { label: t("profile.friends", "Friends"), count: detail.business.friends_count ?? friends.length, onPress: onViewFriends },
          { label: t("business.events", "Events"), count: events.length },
          { label: t("jobs.myJobs", "Jobs"), count: jobs.length },
        ]}
        completenessItems={
          !readOnly
            ? [
                { label: t("profile.addPhoto", "Add a logo"), done: !!detail.business.logo_image },
                { label: t("profile.addBio", "Add a description"), done: !!detail.business.description },
                { label: t("profile.addLocation", "Add an address"), done: !!detail.business.address },
              ]
            : undefined
        }
      />
      {detail.business.root_category && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="grid-outline" size={14} color={COLORS.textMuted} />
            <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
              {`${translateCategory(detail.business.root_category, t)}${detail.business.subcategory ? ` / ${translateCategory(detail.business.subcategory, t)}` : ""}`}
            </Text>
          </View>
        </View>
      )}
      <ProfileAboutInline
        data={aboutData}
        primaryColor={primaryColor}
        cardColor={cardColor}
        textColor={textColor}
        borderColor={borderColor}
        readOnly={readOnly}
        onEditHours={openHoursModal}
        onEditProfile={onEditProfile}
        themeStyles={themeStyles}
      />
      {!isOwnProfile && detail.business.latitude && detail.business.longitude && (
        <ContentMap
          latitude={detail.business.latitude}
          longitude={detail.business.longitude}
          title={detail.business.name}
          address={detail.business.address}
          interactive={false}
        />
      )}
      {isOwnProfile && !readOnly && (
        <FriendsCarousel
          friends={friends as any}
          showAddButton={false}
          currentUserId={currentUserId}
          currentUserName={detail.business.name}
        />
      )}
      {readOnly && (
        <FriendsSection
          friends={friends as any}
          isFriend={friendStatus === "friends"}
          onToggleFriend={onFollowPress || (() => {})}
          showMakeButton={false}
          showFriendRequests={false}
        />
      )}
    </>
  );

  const isPrivatePostsMobile = !readOnly && privateActiveTab === "posts" && Platform.OS !== "web";
  const isPublicPostsMobile = readOnly && activeTab === "posts" && Platform.OS !== "web";

  if (isPrivatePostsMobile) {
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: bgColor }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <ProfilePosts
          posts={businessPosts}
          primaryColor={primaryColor}
          cardColor={cardColor}
          textColor={textColor}
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
          businesses={[detail.business]}
          showMentionSuggestions={showMentionSuggestions}
          mentionSuggestions={mentionSuggestions}
          onSelectMention={onSelectMention}
          pendingMentionIds={pendingMentionIds}
          onRefreshPosts={onRefreshPosts}
          isOwnProfile={isOwnProfile}
          onCreateStory={onCreateStory}
          isScreenFocused={isScreenFocused}
          refreshing={refreshing}
          onRefresh={onRefresh}
          listHeaderComponent={
            <>
              {profileHeaderContent}
              <ProfileTabs
                activeTab={privateActiveTab}
                onTabChange={setPrivateActiveTab}
                tabs={privateTabs}
                primaryColor={primaryColor}
                bgColor={cardColor}
                borderColor={COLORS.border}
              />
            </>
          }
        />
        {detail.business?.cover_image && (
          <CoverPositionEditor
            visible={showCoverReposition}
            uri={detail.business.cover_image}
            initialFocalPoint={detail.business.cover_focal_point ?? { x: 0.5, y: 0.5 }}
            aspectRatio={3}
            onCancel={() => setShowCoverReposition(false)}
            onSave={async (fp) => {
              await updateBusiness(sessionToken, detail.business.business_id, { cover_focal_point: fp });
              setShowCoverReposition(false);
              onRefresh?.();
            }}
          />
        )}
      </KeyboardAvoidingView>
    );
  }

  if (isPublicPostsMobile) {
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: bgColor }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <ProfilePosts
          posts={businessPosts}
          readOnly={true}
          isOwnProfile={false}
          primaryColor={primaryColor}
          cardColor={cardColor}
          textColor={textColor}
          currentUserId={currentUserId}
          avatarUri={avatarUri}
          friends={friends}
          businesses={[detail.business]}
          isScreenFocused={isScreenFocused}
          refreshing={refreshing}
          onRefresh={onRefresh}
          listHeaderComponent={
            <>
              {profileHeaderContent}
              <ProfileTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={publicTabs}
                primaryColor={primaryColor}
                bgColor={cardColor}
                borderColor={COLORS.border}
              />
            </>
          }
        />
        {detail.business?.cover_image && (
          <CoverPositionEditor
            visible={showCoverReposition}
            uri={detail.business.cover_image}
            initialFocalPoint={detail.business.cover_focal_point ?? { x: 0.5, y: 0.5 }}
            aspectRatio={3}
            onCancel={() => setShowCoverReposition(false)}
            onSave={async (fp) => {
              await updateBusiness(sessionToken, detail.business.business_id, { cover_focal_point: fp });
              setShowCoverReposition(false);
              onRefresh?.();
            }}
          />
        )}
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: bgColor }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          refreshing !== undefined && onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
          ) : undefined
        }
      >
        {profileHeaderContent}

        {readOnly ? (
          <>
            <ProfileTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              tabs={publicTabs}
              primaryColor={primaryColor}
              bgColor={cardColor}
              borderColor={COLORS.border}
            />
            <View style={styles.tabContent}>
              {activeTab === "posts" && (
                <ProfilePosts
                  posts={businessPosts}
                  readOnly={true}
                  isOwnProfile={false}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  currentUserId={currentUserId}
                  avatarUri={avatarUri}
                  friends={friends}
                  businesses={[detail.business]}
                  isScreenFocused={isScreenFocused}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              )}
              {activeTab === "media" && (
                <ProfileMedia
                  images={galleryImages}
                  videos={galleryVideos}
                  posts={businessPosts}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  readOnly={true}
                />
              )}
              {activeTab === "events" && (
                <EventsSection
                  events={events}
                  readOnly={true}
                  onAddEvent={() => {}}
                  onEditEvent={() => {}}
                  onDeleteEvent={() => {}}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  secondaryColor={secondaryColor}
                />
              )}
              {activeTab.startsWith("svc:") && (
                (() => {
                  const [, cat, type] = activeTab.split(":");
                  const filteredServices = (services || []).filter(s =>
                    resolveCategory(s.root_category || "") === cat &&
                    s.type === type &&
                    s.is_active
                  );
                  return (
                    <ServiceSection
                      key={activeTab}
                      services={filteredServices}
                      rootCategory={cat}
                      readOnly={true}
                      onServicePress={(s) => router.push(`/service/${s.service_id}` as any)}
                      cardColor={cardColor}
                      textColor={textColor}
                    />
                  );
                })()
              )}
              {activeTab === "jobs" && (
                <JobsSection jobs={jobs} readOnly={true} primaryColor={primaryColor} cardColor={cardColor} textColor={textColor} secondaryColor={secondaryColor} />
              )}
            </View>
          </>
        ) : (
          <>
            <ProfileTabs
              activeTab={privateActiveTab}
              onTabChange={setPrivateActiveTab}
              tabs={privateTabs}
              primaryColor={primaryColor}
              bgColor={cardColor}
              borderColor={COLORS.border}
            />
            <View style={styles.tabContent}>
              {privateActiveTab === "posts" && (
                <ProfilePosts
                  posts={businessPosts}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
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
                  businesses={[detail.business]}
                  showMentionSuggestions={showMentionSuggestions}
                  mentionSuggestions={mentionSuggestions}
                  onSelectMention={onSelectMention}
                  pendingMentionIds={pendingMentionIds}
                  onRefreshPosts={onRefreshPosts}
                  isOwnProfile={isOwnProfile}
                  onCreateStory={onCreateStory}
                  isScreenFocused={isScreenFocused}
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                />
              )}
              {privateActiveTab === "media" && (
                <ProfileMedia
                  images={galleryImages}
                  videos={galleryVideos}
                  posts={businessPosts}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  onDeleteItem={(source, type, uri) => {
                    if (source === "post") {
                      const post = businessPosts.find(p => p.image_url === uri || p.video_url === uri);
                      if (post) onDeletePost?.(post);
                    } else {
                      if (type === "image") {
                        const idx = galleryImages.indexOf(uri);
                        if (idx !== -1) handleDeleteGalleryImage?.(idx);
                      } else {
                        const idx = galleryVideos.indexOf(uri);
                        if (idx !== -1) handleDeleteGalleryVideo?.(idx);
                      }
                    }
                  }}
                />
              )}
              {privateActiveTab === "events" && (
                <EventsSection
                  events={events}
                  onAddEvent={openEventModal ?? (() => {})}
                  onEditEvent={handleEditEvent ?? ((e) => openEventModal?.(e))}
                  onDeleteEvent={handleDeleteEvent ?? (() => {})}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  secondaryColor={secondaryColor}
                />
              )}
              {privateActiveTab === "jobs" && (
                <JobsSection
                  jobs={jobs}
                  onAddJob={openJobModal ?? (() => {})}
                  onEditJob={handleEditJob}
                  onDeleteJob={handleDeleteJob ?? (() => {})}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  secondaryColor={secondaryColor}
                />
              )}
              {privateActiveTab.startsWith("svc:") && (
                (() => {
                  const [, cat, type] = privateActiveTab.split(":");
                  const filteredServices = (services || []).filter(s =>
                    resolveCategory(s.root_category || "") === cat &&
                    s.type === type &&
                    s.is_active
                  );
                  return (
                    <ServiceSection
                      key={privateActiveTab}
                      services={filteredServices}
                      rootCategory={cat}
                      readOnly={false}
                      onAddService={onAddService}
                      onEditService={handleEditService}
                      onDeleteService={handleDeleteService}
                      onOpenSlotManager={onOpenSlotManager}
                      onServicePress={(service) => router.push(`/service/${service.service_id}` as any)}
                      cardColor={cardColor}
                      textColor={textColor}
                    />
                  );
                })()
              )}
            </View>
          </>
        )}
      </ScrollView>

      {detail.business?.cover_image && (
        <CoverPositionEditor
          visible={showCoverReposition}
          uri={detail.business.cover_image}
          initialFocalPoint={detail.business.cover_focal_point ?? { x: 0.5, y: 0.5 }}
          aspectRatio={3}
          onCancel={() => setShowCoverReposition(false)}
          onSave={async (fp) => {
            await updateBusiness(sessionToken, detail.business.business_id, { cover_focal_point: fp });
            setShowCoverReposition(false);
            onRefresh?.();
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  tabContent: {
    paddingHorizontal: 0,
    paddingBottom: 24,
    marginTop: 12,
  },
  tabSection: {
    paddingTop: 12,
  },

  highlightsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  privateSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  primaryActionText: {
    color: COLORS.primaryDark,
    fontSize: 15,
    fontWeight: "600",
  },
  publicContent: {
    paddingHorizontal: 16,
    gap: 16,
    marginTop: 12,
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  carouselGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  carouselCard: {
    width: 150,
    height: 160,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginRight: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    ...Platform.select({ web: { cursor: "pointer", transition: "box-shadow 0.2s" } as any, default: {} }),
  },
  carouselCardDesktop: {
    width: 220,
    height: 240,
  },
  carouselImage: {
    width: "100%",
    height: 90,
    backgroundColor: "#f3f4f6",
  },
  carouselImageDesktop: {
    height: 140,
  },
  carouselFallback: {
    width: "100%",
    height: 90,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  carouselInfo: {
    padding: 12,
    flex: 1,
    justifyContent: "center",
  },
  carouselTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  carouselSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
});

import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  Share,
  Text,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import {
  BusinessDetail,
  EventItem,
  CategoryGroup,
  Post,
  Job,
  Rental,
  BusinessAnalytics,
  APP_URL,
  isUpcomingEvent,
} from "../../lib/api";
import { translateCategory } from "../../lib/categoryTranslation";
import {
  EventsSection,
  JobsSection,
  RentalsSection,
  SubscriptionTab,
} from "../business";
import BusinessMap from "../BusinessMap";
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
import { useThemeStyles } from "../../hooks/useThemeStyles";
import AdaptiveImage from "../AdaptiveImage";
import AdaptiveVideo from "../AdaptiveVideo";
import LazyMediaViewer, { MediaItem } from "../LazyMediaViewer";

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
  isOwnProfile?: boolean;
  jobs?: Job[];
  openJobModal?: () => void;
  handleDeleteJob?: (jobId: string) => void;
  rentals?: Rental[];
  openRentalModal?: () => void;
  handleDeleteRental?: (rentalId: string) => void;
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
  handleDeleteGalleryImage?: (index: number) => void;
  handleDeleteGalleryVideo?: (index: number) => void;
  handleMoveGalleryImage?: (from: number, to: number) => void;
  handleMoveGalleryVideo?: (from: number, to: number) => void;
  openMediaViewer?: (uri: string, type: "image" | "video", index: number) => void;
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
  isFollowing?: boolean;
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
  rentals = [],
  openRentalModal,
  handleDeleteRental,
  openingHours = {},
  openHoursModal,
  socialLinks = {},
  openSocialLinksModal,
  openLocationModal,
  galleryImages = [],
  galleryVideos = [],
  handleAddGalleryPhoto,
  handleAddGalleryVideo,
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
  isFollowing,
  onFollowPress,
  onShare,
  onSavePress,
  isSaved = false,
  savingItem = false,
  avatarUri,
  onOpenTagModal,
  onEditTags,
  onCreateStory,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [showAnalytics, setShowAnalytics] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<MediaItem[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const buildBusinessMediaItems = (biz: any): MediaItem[] => {
    const items: MediaItem[] = [];
    (biz.gallery_images || []).forEach((u: string) => items.push({ type: "image", uri: u }));
    (biz.gallery_videos || []).forEach((u: string) => items.push({ type: "video", uri: u }));
    (biz.posts || []).forEach((p: any) => {
      if (p.image_url) items.push({ type: "image", uri: p.image_url, ratio: p.media_ratio || undefined });
      if (p.video_url) items.push({ type: "video", uri: p.video_url });
    });
    return items;
  };

  const hasUpcomingEvents = events.some(e => isUpcomingEvent(e));

  const tabs: TabDefinition[] = useMemo(() => {
    const contentTabs: TabDefinition[] = [];

    if (events.length > 0) {
      contentTabs.push({ key: "events", label: t("business.events", "Events"), icon: "calendar-outline", count: events.length });
    }
    if (jobs.length > 0) {
      contentTabs.push({ key: "jobs", label: t("jobs.myJobs", "Jobs"), icon: "briefcase-outline", count: jobs.length });
    }
    if ((detail.business.root_category === "rental-real-estate" || detail.business.enabled_modules?.rentals) && rentals && rentals.length > 0) {
      contentTabs.push({ key: "rentals", label: t("rentals.rentals", "Rentals"), icon: "home-outline", count: rentals.length });
    }

    const alwaysTabs: TabDefinition[] = [
      { key: "posts", label: t("profile.posts", "Posts"), icon: "newspaper-outline", count: businessPosts.length },
      { key: "media", label: t("profile.media", "Media"), icon: "images-outline", count: galleryImages.length + galleryVideos.length },
    ];

    if (!readOnly) {
      alwaysTabs.push({ key: "plan", label: t("subscription.plan", "Plan"), icon: "star-outline" });
    }

    if (hasUpcomingEvents || contentTabs.length > 0) {
      return [...contentTabs, ...alwaysTabs];
    }
    return alwaysTabs;
  }, [events.length, jobs.length, rentals, detail.business.root_category, detail.business.enabled_modules, businessPosts.length, galleryImages.length, galleryVideos.length, readOnly, hasUpcomingEvents, t]);

  const theme = detail.business.theme;
  const { themeStyles, themeColors, isDark } = useThemeStyles(theme);
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
    website: detail.business.website,
    email: detail.business.email,
    phone: detail.business.phone,
    socialLinks,
    openingHours: transformedHours,
    category: detail.business.root_category 
      ? `${translateCategory(detail.business.root_category, t)}${detail.business.subcategory ? ` / ${translateCategory(detail.business.subcategory, t)}` : ""}`
      : "",
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
          coverUri={detail.business.cover_image}
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
          friendStatus={isFollowing ? "friends" : "none"}
          stats={[
            { label: t("profile.posts", "Posts"), count: businessPosts.length },
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

        {/* Business Map */}
        {detail.business.latitude && detail.business.longitude && (
          <Pressable
            style={styles.businessMapContainer}
            onPress={() => {
              const url = `https://www.google.com/maps/search/?api=1&query=${detail.business.latitude},${detail.business.longitude}`;
              require("react-native").Linking.openURL(url);
            }}
          >
            <BusinessMap
              location={{ latitude: detail.business.latitude, longitude: detail.business.longitude }}
              markers={[{
                id: detail.business.business_id,
                latitude: detail.business.latitude,
                longitude: detail.business.longitude,
                title: detail.business.name,
                type: "business",
              }]}
            />
            <View style={styles.mapOverlay}>
              <Ionicons name="navigate-outline" size={14} color="#fff" />
              <Text style={styles.mapOverlayText}>{t("profile.aboutInline.directions", "Directions")}</Text>
            </View>
          </Pressable>
        )}

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
               posts={businessPosts}
               primaryColor={primaryColor}
               cardColor={cardColor}
               textColor={textColor}
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
               businesses={[detail.business]}
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
              posts={businessPosts}
              primaryColor={primaryColor}
              cardColor={cardColor}
              textColor={textColor}
              readOnly={readOnly}
              onAddPhoto={handleAddGalleryPhoto}
              onAddVideo={handleAddGalleryVideo}
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
{activeTab === "events" && (
            <View style={styles.tabSection}>
              <EventsSection
                events={events}
                onAddEvent={readOnly ? () => {} : (openEventModal ?? (() => {}))}
                onEditEvent={readOnly ? () => {} : (handleEditEvent ?? ((e) => openEventModal?.(e)))}
                onDeleteEvent={readOnly ? () => {} : (handleDeleteEvent ?? (() => {}))}
                readOnly={readOnly}
                primaryColor={primaryColor}
                cardColor={cardColor}
                textColor={textColor}
                secondaryColor={secondaryColor}
              />
            </View>
          )}
          {activeTab === "jobs" && (
            <View style={styles.tabSection}>
              <JobsSection
                jobs={jobs}
                readOnly={readOnly}
                onAddJob={readOnly ? undefined : (openJobModal ?? (() => {}))}
                onDeleteJob={readOnly ? undefined : (handleDeleteJob ?? (() => {}))}
              />
            </View>
          )}
          {activeTab === "rentals" && (
            <View style={styles.tabSection}>
              <RentalsSection
                rentals={rentals}
                readOnly={readOnly}
                onAddRental={readOnly ? undefined : (openRentalModal ?? (() => {}))}
                onDeleteRental={readOnly ? undefined : (handleDeleteRental ?? (() => {}))}
              />
            </View>
          )}
          {activeTab === "plan" && !readOnly && (
            <SubscriptionTab
              sessionToken={sessionToken}
              businessId={detail.business.business_id}
              subscriptionStatus={detail.business.subscription_status}
              planType={(detail.business as any).plan_type}
              primaryColor={primaryColor}
              cardColor={cardColor}
              textColor={textColor}
            />
          )}
        </View>
      </ScrollView>

      <LazyMediaViewer
        visible={viewerOpen}
        media={viewerMedia}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />
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
    paddingBottom: 24,
    marginTop: 12,
  },
  tabSection: {
    paddingTop: 12,
  },
  businessMapContainer: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
  },
  businessMap: {
    height: 140,
  },
  mapOverlay: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  mapOverlayText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  highlightsSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});

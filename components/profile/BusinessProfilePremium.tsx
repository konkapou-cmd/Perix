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
  Image,
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
import { COLORS } from "../../lib/designTokens";
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
  handleEditJob?: (job: any) => void;
  rentals?: Rental[];
  openRentalModal?: () => void;
  handleDeleteRental?: (rentalId: string) => void;
  handleEditRental?: (rental: any) => void;
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
  onUploadCityAd?: () => void;
  onPlan?: () => void;
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
  handleEditJob,
  rentals = [],
  openRentalModal,
  handleDeleteRental,
  handleEditRental,
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
  onUploadCityAd,
  onPlan,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
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
        {/* Category/Subcategory badge - always visible */}
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

        {/* Business Map - hidden for own profile */}
        {!isOwnProfile && detail.business.latitude && detail.business.longitude && (
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

        {/* City Ad upload button for business owners */}
        {isOwnProfile && onUploadCityAd && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <Pressable
              style={styles.primaryActionBtn}
              onPress={onUploadCityAd}
            >
              <Ionicons name="videocam" size={18} color={COLORS.primaryDark} />
              <Text style={styles.primaryActionText}>{t("cityAd.createAd") || "Create City Ad"}</Text>
            </Pressable>
          </View>
        )}

        {/* Create Event, Job, Rental buttons for business owner */}
        {isOwnProfile && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
            {openEventModal && (
              <Pressable
                style={styles.primaryActionBtn}
                onPress={() => openEventModal()}
              >
                <Ionicons name="calendar-outline" size={18} color={COLORS.primaryDark} />
                <Text style={styles.primaryActionText}>{t("business.createEvent") || "Create Event"}</Text>
              </Pressable>
            )}
            {openJobModal && (
              <Pressable
                style={styles.primaryActionBtn}
                onPress={openJobModal}
              >
                <Ionicons name="briefcase-outline" size={18} color={COLORS.primaryDark} />
                <Text style={styles.primaryActionText}>{t("business.createJob") || "Create Job"}</Text>
              </Pressable>
            )}
            {detail.business.root_category === "rental-real-estate" && openRentalModal && (
              <Pressable
                style={styles.primaryActionBtn}
                onPress={openRentalModal}
              >
                <Ionicons name="home-outline" size={18} color={COLORS.primaryDark} />
                <Text style={styles.primaryActionText}>{t("business.publishRental") || "Publish Rental"}</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Public profile: website-style layout without tabs */}
        {readOnly ? (
          <View style={styles.publicContent}>
            {/* Events Carousel */}
            {events.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitle}>
                    <View style={styles.sectionIcon}>
                      <Ionicons name="calendar" size={18} color="#fff" />
                    </View>
                    <Text style={styles.sectionTitleText}>{t("events.title", "Events")}</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={160} decelerationRate="fast">
                  {events.map((event, idx) => (
                    <Pressable key={event.event_id || idx} style={styles.carouselCard} onPress={() => router.push(`/event/${event.event_id}`)}>
                      {event.video_url ? (
                        <AdaptiveVideo uri={event.video_url} style={styles.carouselImage} autoPlay isLooping initialMuted showMuteButton pauseWhenNotVisible />
                      ) : event.cover_image_url || event.image_urls?.[0] ? (
                        <Image source={{ uri: event.cover_image_url || event.image_urls![0] }} style={styles.carouselImage} />
                      ) : (
                        <View style={styles.carouselFallback}>
                          <Ionicons name="calendar" size={32} color={COLORS.textMuted} />
                        </View>
                      )}
                      <View style={styles.carouselInfo}>
                        <Text style={styles.carouselTitle} numberOfLines={1}>{event.title}</Text>
                        <Text style={styles.carouselSubtitle} numberOfLines={1}>{event.start_time || ""}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Rentals Carousel */}
            {rentals.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitle}>
                    <View style={styles.sectionIcon}>
                      <Ionicons name="home" size={18} color="#fff" />
                    </View>
                    <Text style={styles.sectionTitleText}>{t("business.rentals", "Rentals")}</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={160} decelerationRate="fast">
                  {rentals.map((rental: any, idx: number) => (
                    <Pressable key={rental.rental_id || idx} style={styles.carouselCard} onPress={() => router.push(`/rental/${rental.rental_id}`)}>
                      {rental.cover_image || rental.gallery_images?.[0] ? (
                        <Image source={{ uri: rental.cover_image || rental.gallery_images?.[0] }} style={styles.carouselImage} />
                      ) : (
                        <View style={styles.carouselFallback}>
                          <Ionicons name="home" size={32} color={COLORS.textMuted} />
                        </View>
                      )}
                      <View style={styles.carouselInfo}>
                        <Text style={styles.carouselTitle} numberOfLines={1}>{rental.title || "Rental"}</Text>
                        <Text style={styles.carouselSubtitle} numberOfLines={1}>{rental.price ? `${rental.price}€` : ""}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Jobs Carousel */}
            {jobs.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitle}>
                    <View style={styles.sectionIcon}>
                      <Ionicons name="briefcase" size={18} color="#fff" />
                    </View>
                    <Text style={styles.sectionTitleText}>{t("business.jobs", "Jobs")}</Text>
                  </View>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={160} decelerationRate="fast">
                  {jobs.map((job: any, idx: number) => (
                    <Pressable key={job.job_id || idx} style={styles.carouselCard} onPress={() => router.push(`/job/${job.job_id}`)}>
                      {job.cover_image ? (
                        <Image source={{ uri: job.cover_image }} style={styles.carouselImage} />
                      ) : (
                        <View style={styles.carouselFallback}>
                          <Ionicons name="briefcase" size={32} color={COLORS.textMuted} />
                        </View>
                      )}
                      <View style={styles.carouselInfo}>
                        <Text style={styles.carouselTitle} numberOfLines={1}>{job.title || "Job"}</Text>
                        <Text style={styles.carouselSubtitle} numberOfLines={1}>{job.application_deadline || ""}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Gallery */}
            {(galleryImages.length > 0 || galleryVideos.length > 0) && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitle}>
                    <View style={styles.sectionIcon}>
                      <Ionicons name="images" size={18} color="#fff" />
                    </View>
                    <Text style={styles.sectionTitleText}>{t("business.gallery", "Gallery")}</Text>
                  </View>
                </View>
                <ProfileMedia
                  images={galleryImages}
                  videos={galleryVideos}
                  posts={businessPosts}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  readOnly={true}
                />
              </View>
            )}

            {/* Posts */}
            {businessPosts.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitle}>
                    <View style={styles.sectionIcon}>
                      <Ionicons name="document-text" size={18} color="#fff" />
                    </View>
                    <Text style={styles.sectionTitleText}>{t("profile.posts", "Posts")}</Text>
                  </View>
                </View>
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
                />
              </View>
            )}
          </View>
        ) : (
          /* Private profile: vertical list layout */
          <>
            {/* Events */}
            {events.length > 0 && (
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

            {/* Jobs */}
            {jobs.length > 0 && (
              <JobsSection
                jobs={jobs}
                onAddJob={openJobModal ?? (() => {})}
                onEditJob={handleEditJob}
                onDeleteJob={handleDeleteJob ?? (() => {})}
              />
            )}

            {/* Rentals */}
            {detail.business.root_category === "rental-real-estate" && rentals && rentals.length > 0 && (
              <RentalsSection
                rentals={rentals}
                onAddRental={openRentalModal ?? (() => {})}
                onEditRental={handleEditRental}
                onDeleteRental={handleDeleteRental ?? (() => {})}
              />
            )}

            {/* Media */}
            {(galleryImages.length > 0 || galleryVideos.length > 0) && (
              <View style={styles.privateSection}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitle}>
                    <View style={styles.sectionIcon}>
                      <Ionicons name="images" size={18} color="#fff" />
                    </View>
                    <Text style={styles.sectionTitleText}>{t("business.gallery", "Gallery")}</Text>
                  </View>
                </View>
                <ProfileMedia
                  images={galleryImages}
                  videos={galleryVideos}
                  posts={businessPosts}
                  primaryColor={primaryColor}
                  cardColor={cardColor}
                  textColor={textColor}
                  onAddPhoto={handleAddGalleryPhoto}
                  onAddVideo={handleAddGalleryVideo}
                  isUploading={isUploading}
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
              </View>
            )}

            {/* Posts */}
            <View style={styles.privateSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitle}>
                  <View style={styles.sectionIcon}>
                    <Ionicons name="document-text" size={18} color="#fff" />
                  </View>
                  <Text style={styles.sectionTitleText}>{t("profile.posts", "Posts")}</Text>
                </View>
              </View>
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
          </View>
          </>
        )}
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
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
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
  },
  carouselImage: {
    width: "100%",
    height: 90,
    backgroundColor: "#f3f4f6",
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
    color: "#111827",
    marginBottom: 4,
  },
  carouselSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
});

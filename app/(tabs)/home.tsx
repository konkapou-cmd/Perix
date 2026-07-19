import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { CalendarList } from "react-native-calendars";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import AdaptiveImage from "../../components/AdaptiveImage";
import { useAuth } from "../../context/AuthContext";
import { useLocation } from "../../context/LocationContext";
import { useMapBounds } from "../../context/MapBoundsContext";
import useResponsiveLayout from "../../hooks/useResponsiveLayout";
import {
  addPostComment,
  createPost,
  deletePostComment,
  deletePost,
  EventTheme,
  getPostComments,
  PostComment,
  Post,
  User,
  updatePostComment,
  updatePost,
  togglePostLike,
  uploadImageToCloudinary,
  uploadVideoMux,
  createStory,
  apiRequest,
  searchUsers,
  UploadProgress,
  isUpcomingEvent,
  isUpcomingActivity,
  toggleSaved,
  EVENT_THEMES,
  ACTIVITY_TYPES,
  BACKEND_URL,
  MAX_VIDEO_SIZE_BYTES,
} from "../../lib/api";
import { MEDIA_LIMITS, normalizeDurationSeconds } from "../../lib/constants/mediaLimits";
import { COLORS } from "../../lib/designTokens";
import { formatEventDate } from "../../lib/formatDate";
import ShareContent from "../../components/ShareContent";
import * as Location from "expo-location";
import UploadProgressSheet from "../../components/UploadProgressSheet";
import { translateCategory } from "../../lib/categoryTranslation";
import { getThemeColors } from "../../hooks/useThemeStyles";
import { SkeletonBox, CarouselCard } from "../../components/shared";
import { CityAdViewer } from "../../components/stories/CityAdViewer";
import { SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

import { useFeedData } from "../../hooks/useFeedData";
import { useContentSorting } from "../../hooks/useContentSorting";
import { useLayoutPreferences } from "../../hooks/useLayoutPreferences";
import { CityAdCircles } from "../../components/home/CityAdCircles";
import { CarouselSection } from "../../components/home/CarouselSection";
import { MapSection } from "../../components/home/MapSection";
import { getListings, Listing } from "../../lib/api/listings";
import { LocationSearchOverlay } from "../../components/home/LocationSearchOverlay";
import { PostCard } from "../../components/home/PostCard";
import { LayoutSettingsModal } from "../../components/home/LayoutSettingsModal";

function HomeSkeleton() {
  return (
    <ScrollView contentContainerStyle={{ padding: SPACING.std, paddingBottom: 40 }} style={{ backgroundColor: COLORS.backgroundPage }}>
      <SkeletonBox width="100%" height={200} borderRadius={8} style={{ marginBottom: SPACING.section }} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ marginBottom: SPACING.std }}>
          <SkeletonBox width={120} height={20} style={{ marginBottom: SPACING.small }} />
          <View style={{ flexDirection: "row" }}>
            {[0, 1, 2, 3].map((j) => (
              <SkeletonBox key={j} width={140} height={160} borderRadius={8} style={{ marginRight: SPACING.compact }} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, sessionToken, activeIdentity, logout } = useAuth();
  const { location: globalLocation } = useLocation();
  const { mapBounds, isMapInitialized, refreshKey: mapRefreshKey, setMapBounds } = useMapBounds();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsiveLayout();

  const [feedMode, setFeedMode] = useState<"nearby" | "following">("nearby");

  const feedData = useFeedData({
    sessionToken,
    mapBounds,
    userLocation: globalLocation ? { latitude: globalLocation.latitude, longitude: globalLocation.longitude } : null,
    user,
    refreshKey: mapRefreshKey,
    friendsOnly: feedMode === "following",
  });

  const [localPosts, setLocalPosts] = useState<Post[]>([]);
  const [localSavedPostIds, setLocalSavedPostIds] = useState<Set<string> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const unique = feedData.posts.filter((p, i, arr) => arr.findIndex(x => x.post_id === p.post_id) === i);
    setLocalPosts(unique);
  }, [feedData.posts]);
  useEffect(() => { if (localSavedPostIds === null) setLocalSavedPostIds(feedData.savedPostIds); }, [feedData.savedPostIds, localSavedPostIds]);

  const posts = localPosts;
  const savedPostIds = localSavedPostIds ?? feedData.savedPostIds;
  const { events, businesses, jobs, rentals, activities, storyGroups, services,
    savedEventIds, savedActivityIds, savedBusinessIds, savedJobIds, savedRentalIds, savedServiceIds,
    feedError, loading: feedLoading, backgroundLoading, refresh: refreshFeed,
  } = feedData;

  const [marketplaceItems, setMarketplaceItems] = useState<Listing[]>([]);
  useEffect(() => { getListings("product").then(setMarketplaceItems).catch(() => {}); }, []);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [eventsFilter, setEventsFilter] = useState<"all" | "attending" | "mine">("all");
  const [activitiesFilter, setActivitiesFilter] = useState<"all" | "attending" | "mine">("all");
  const [showNoLocationMessage, setShowNoLocationMessage] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [visiblePostId, setVisiblePostId] = useState<string | null>(null);
  const scrollRef = useRef<FlatList<Post>>(null);
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 50, minimumViewTime: 300 }).current;
  const onViewableItemsChangedRef = useRef(({ viewableItems }: { viewableItems: { key: string }[] }) => {
    if (viewableItems.length > 0) {
      setVisiblePostId(viewableItems[0].key);
    } else {
      setVisiblePostId(null);
    }
  }).current;

  const { homeLayout, toggleSection, setSorting } = useLayoutPreferences();

  const { sortedEvents, sortedBusinesses, sortedJobs, sortedActivities, sortedPosts, sortedRentals, sortedServices } = useContentSorting({
    posts, events, businesses, jobs, activities, rentals, services,
    sorting: homeLayout.sorting,
    userLocation,
    mapBounds,
    eventsFilter,
    activitiesFilter,
    mapRefreshKey,
  });

  useEffect(() => {
    if (globalLocation) setUserLocation({ latitude: globalLocation.latitude, longitude: globalLocation.longitude });
  }, [globalLocation]);

  useEffect(() => {
    if (isMapInitialized) return;
    if (user?.latitude && user?.longitude) {
      const d = 0.09;
      setMapBounds({ minLat: user.latitude - d / 2, maxLat: user.latitude + d / 2, minLng: user.longitude - d / 2, maxLng: user.longitude + d / 2, centerLat: user.latitude, centerLng: user.longitude });
      return;
    }
    if (globalLocation) {
      const d = 0.09;
      setMapBounds({ minLat: globalLocation.latitude - d / 2, maxLat: globalLocation.latitude + d / 2, minLng: globalLocation.longitude - d / 2, maxLng: globalLocation.longitude + d / 2, centerLat: globalLocation.latitude, centerLng: globalLocation.longitude });
    }
  }, [user, globalLocation, isMapInitialized, setMapBounds]);

  const handleRecenterOnMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        const d = 0.09;
        setMapBounds({ minLat: loc.coords.latitude - d / 2, maxLat: loc.coords.latitude + d / 2, minLng: loc.coords.longitude - d / 2, maxLng: loc.coords.longitude + d / 2, centerLat: loc.coords.latitude, centerLng: loc.coords.longitude });
      }
    } catch (error) {
      console.error("Failed to get location:", error);
    }
  };

  const loadMorePosts = async () => {
    if (!sessionToken || loadingMorePosts || !hasMorePosts || !mapBounds) return;
    setLoadingMorePosts(true);
    try {
      const { getHomeFeed } = await import("../../lib/api");
      const moreFeedData = await getHomeFeed(sessionToken, undefined, undefined, {
        minLat: mapBounds.minLat, maxLat: mapBounds.maxLat, minLng: mapBounds.minLng, maxLng: mapBounds.maxLng,
      }, posts.length);
      if (moreFeedData.posts.length === 0) {
        setHasMorePosts(false);
      } else {
        const existingIds = new Set(posts.map(p => p.post_id));
        const newPosts = moreFeedData.posts.filter(p => !existingIds.has(p.post_id));
        if (newPosts.length === 0) {
          setHasMorePosts(false);
        } else {
          setLocalPosts(prev => {
          const merged = [...prev, ...newPosts];
          const seen = new Set<string>();
          return merged.filter(p => seen.has(p.post_id) ? false : (seen.add(p.post_id), true));
        });
        }
      }
    } catch (e) {
      console.log("Error loading more posts:", e);
    } finally {
      setLoadingMorePosts(false);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    setHasMorePosts(true);
    await refreshFeed();
    setIsRefreshing(false);
  };

  const hasInitialFocusRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasInitialFocusRef.current) {
        hasInitialFocusRef.current = true;
        return;
      }
      refreshFeed();
    }, [refreshFeed])
  );

  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [uploadingAd, setUploadingAd] = useState(false);

  const handleCreateCityAd = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: MEDIA_LIMITS.video.pickerQuality,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      setUploadingAd(true);
      const story = await createStory(sessionToken, {
        media_url: undefined,
        media_type: "video",
        actor_type: "business",
        actor_id: activeIdentity?.id,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
        video_status: "uploading",
      });
      const muxResult = await uploadVideoMux(sessionToken, result.assets[0].uri, `story:${story.story_id}`);
      const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
      if (videoUrl || muxResult.mux_upload_id) {
        await apiRequest(`/stories/${story.story_id}`, "PATCH", sessionToken, {
          media_url: videoUrl || undefined,
          mux_upload_id: muxResult.mux_upload_id,
          mux_asset_id: muxResult.mux_asset_id,
          mux_playback_id: muxResult.mux_playback_id,
          mux_thumbnail_url: muxResult.mux_thumbnail_url,
          video_status: muxResult.mux_playback_id ? "ready" : "processing",
        });
      }
      Alert.alert(t("cityAd.adPublished") || "Your city ad has been published!");
      setUploadingAd(false);
    } catch (e) {
      console.error("City ad creation failed:", e);
      setUploadingAd(false);
      Alert.alert(t("common.error"), "Failed to create city ad");
    }
  };

  const [postText, setPostText] = useState("");
  const [tagResults, setTagResults] = useState<User[]>([]);
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);
  const [taggedBusinessId, setTaggedBusinessId] = useState<string | null>(null);
  const [taggedBusiness, setTaggedBusiness] = useState<any>(null);
  const [showBusinessTagModal, setShowBusinessTagModal] = useState(false);
  const [businessSearchQuery, setBusinessSearchQuery] = useState("");
  const [youtubeLink, setYoutubeLink] = useState<string | null>(null);
  const [soundcloudLink, setSoundcloudLink] = useState<string | null>(null);
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideo, setPostVideo] = useState<string | null>(null);
  const [postVideoMuxUploadId, setPostVideoMuxUploadId] = useState<string | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);
  const [postMediaRatio, setPostMediaRatio] = useState<number | null>(null);
  const [posting, setPostPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  const [commentModal, setCommentModal] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);

  const [editModal, setEditModal] = useState(false);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editText, setEditText] = useState("");
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editVideo, setEditVideo] = useState<string | null>(null);
  const [editVideoPreview, setEditVideoPreview] = useState<string | null>(null);
  const [editMediaRatio, setEditMediaRatio] = useState<number | null>(null);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [activitiesCalendarOpen, setActivitiesCalendarOpen] = useState(false);
  const [activitiesCalendarDate, setActivitiesCalendarDate] = useState<string | null>(null);
  const [eventThemes, setEventThemes] = useState<EventTheme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [showThemeFilter, setShowThemeFilter] = useState(false);

  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareContentId, setShareContentId] = useState<string>("");
  const [shareContentTitle, setShareContentTitle] = useState<string>("");
  const isAnyModalOpen = commentModal || editModal || calendarOpen || activitiesCalendarOpen || showThemeFilter || showBusinessTagModal || showLayoutSettings || showLocationSearch || shareModalVisible;
  const isFocused = useIsFocused();
  const [userWantsSound, setUserWantsSound] = useState(true);
  const [friends, setFriends] = useState<any[]>([]);

  const brandOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (backgroundLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(brandOpacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
          Animated.timing(brandOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      brandOpacity.stopAnimation();
      brandOpacity.setValue(1);
    }
  }, [backgroundLoading]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.permissionRequired") || "Permission Required", t("home.mediaPermissionMessage") || "Please allow access to your photo library to upload images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: MEDIA_LIMITS.image.pickerQuality, base64: true, allowsEditing: true, aspect: [4, 5], exif: false });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      setPostMediaRatio(asset.width && asset.height && asset.height > 0 ? asset.width / asset.height : null);
      setPostImage(`data:image/jpeg;base64,${asset.base64}`);
      setPostVideo(null);
      setPostVideoPreview(null);
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.permissionRequired") || "Permission Required", t("home.mediaPermissionMessage") || "Please allow access to your photo library to upload videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: MEDIA_LIMITS.video.pickerQuality });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(t("common.error"), `Das Video ist zu groß. Maximal erlaubt sind ${MEDIA_LIMITS.post.maxVideoFileSizeMb} MB.`);
        return;
      }
      if (normalizeDurationSeconds(asset.duration) > MEDIA_LIMITS.post.maxVideoDurationSeconds) {
        Alert.alert("Video zu lang", `Videos dürfen maximal ${MEDIA_LIMITS.post.maxVideoDurationSeconds} Sekunden lang sein.`);
        return;
      }
      setPostMediaRatio(asset.width && asset.height && asset.height > 0 ? asset.width / asset.height : null);
      setPostVideoPreview(asset.uri);
      setPostImage(null);
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const muxResult = await uploadVideoMux(sessionToken, asset.uri, undefined, (p) => setUploadProgress(p));
          const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
          if (!videoUrl && !muxResult.mux_upload_id) throw new Error("Video upload failed");
          setPostVideo(videoUrl);
          setPostVideoMuxUploadId(muxResult.mux_upload_id);
          setTimeout(() => { setShowUploadProgress(false); setUploadProgress(null); }, 1000);
        } catch {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("home.uploadFailed"), t("home.pleaseTryAgain"));
          setPostVideo(null);
        }
      }
    }
  };

  const handleCreatePost = async () => {
    if (!user?.latitude || !user?.longitude) {
      Alert.alert(t("common.error") || "Error", t("home.locationRequired") || "Please set your location in your profile before posting");
      return;
    }
    const rawText = postText;
    const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;
    const SOUNDCLOUD_REGEX = /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(?:[^\s]*)?/gi;
    let finalText = rawText;
    let extractedYoutube = youtubeLink;
    let extractedSoundcloud = soundcloudLink;
    if (!extractedYoutube) { YOUTUBE_REGEX.lastIndex = 0; const m = YOUTUBE_REGEX.exec(rawText); if (m) { extractedYoutube = m[0]; finalText = rawText.replace(m[0], "").replace(/\n{2,}/g, "\n").trim(); } }
    if (!extractedSoundcloud) { SOUNDCLOUD_REGEX.lastIndex = 0; const m = SOUNDCLOUD_REGEX.exec(rawText); if (m) { extractedSoundcloud = m[0]; finalText = rawText.replace(m[0], "").replace(/\n{2,}/g, "\n").trim(); } }
    if (!sessionToken || (!finalText.trim() && !postImage && !postVideo && !extractedYoutube && !extractedSoundcloud)) return;
    try {
      setPostPosting(true);
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      if (postImage) { try { imageUrl = await uploadImageToCloudinary(sessionToken, postImage); } catch (e) { console.error("[Post] Image upload failed:", e); } }
      if (postVideo) videoUrl = postVideo;
      let actor = activeIdentity ? { type: activeIdentity.type, id: activeIdentity.id } : undefined;
      if (!actor && user) actor = { type: "user", id: user.user_id };
      const businessId = activeIdentity?.type === "business" ? activeIdentity.id : undefined;
      const newPost = await createPost(sessionToken, finalText.trim() || t("home.sharedAnUpdate"), imageUrl ? null : postImage, null, businessId, actor, postMediaRatio || undefined, taggedUserIds, taggedBusinessId, null, imageUrl, videoUrl, extractedYoutube, extractedSoundcloud, postVideoMuxUploadId);
      setLocalPosts((prev: Post[]) => [newPost, ...prev.filter(p => p.post_id !== newPost.post_id)]);
      setPostText(""); setPostImage(null); setPostVideo(null); setPostVideoMuxUploadId(null); setPostVideoPreview(null); setPostMediaRatio(null); setTaggedUserIds([]); setTagResults([]); setTaggedBusinessId(null); setTaggedBusiness(null); setYoutubeLink(null); setSoundcloudLink(null);
    } catch (e) {
      console.error("[Post] Create post failed:", e);
      Alert.alert(t("common.error"), t("home.postFailed") || "Failed to create post");
    } finally {
      setPostPosting(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    if (!sessionToken) return;
    const actor = activeIdentity ? { type: activeIdentity.type, id: activeIdentity.id } : undefined;
    const updated = await togglePostLike(sessionToken, post.post_id, actor);
    setLocalPosts((prev: Post[]) => prev.map((item) => (item.post_id === updated.post_id ? updated : item)));
  };

  const openComments = async (post: Post) => {
    if (!sessionToken) return;
    setCommentLoading(true);
    setCommentPost(post);
    setCommentModal(true);
    const data = await getPostComments(sessionToken, post.post_id);
    setComments(data);
    setCommentLoading(false);
  };

  const handleAddComment = async () => {
    if (!sessionToken || !commentPost || !commentText.trim()) return;
    const actor = activeIdentity ? { type: activeIdentity.type, id: activeIdentity.id } : undefined;
    let updated: Post;
    if (editingCommentId) {
      updated = await updatePostComment(sessionToken, commentPost.post_id, editingCommentId, commentText.trim());
    } else {
      updated = await addPostComment(sessionToken, commentPost.post_id, commentText.trim(), actor);
    }
    setLocalPosts((prev: Post[]) => prev.map((item) => (item.post_id === updated.post_id ? updated : item)));
    const data = await getPostComments(sessionToken, commentPost.post_id);
    setComments(data);
    setCommentText("");
    setEditingCommentId(null);
  };

  const handleEditComment = (comment: PostComment) => {
    setEditingCommentId(comment.comment_id);
    setCommentText(comment.text);
  };

  const handleDeleteComment = async (comment: PostComment) => {
    if (!sessionToken || !commentPost) return;
    const updated = await deletePostComment(sessionToken, commentPost.post_id, comment.comment_id);
    setLocalPosts((prev: Post[]) => prev.map((item) => (item.post_id === updated.post_id ? updated : item)));
    const data = await getPostComments(sessionToken, commentPost.post_id);
    setComments(data);
  };

  const pickEditImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert(t("common.permissionRequired") || "Permission Required", t("home.mediaPermissionMessage") || "Please allow access to your photo library."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: MEDIA_LIMITS.image.pickerQuality, base64: true });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      setEditMediaRatio(asset.width && asset.height && asset.height > 0 ? asset.width / asset.height : null);
      setEditImage(`data:image/jpeg;base64,${asset.base64}`);
      setEditVideo(null);
      setEditVideoPreview(null);
    }
  };

  const pickEditVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { Alert.alert(t("common.permissionRequired") || "Permission Required", t("home.mediaPermissionMessage") || "Please allow access to your photo library."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: MEDIA_LIMITS.video.pickerQuality });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      setEditMediaRatio(asset.width && asset.height && asset.height > 0 ? asset.width / asset.height : null);
      setEditVideoPreview(asset.uri);
      setEditImage(null);
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const muxResult = await uploadVideoMux(sessionToken, asset.uri, undefined, (p) => setUploadProgress(p));
          const editVideoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
          setEditVideo(editVideoUrl);
          setTimeout(() => { setShowUploadProgress(false); setUploadProgress(null); }, 1000);
        } catch {
          setShowUploadProgress(false); setUploadProgress(null);
          Alert.alert(t("home.uploadFailed"), t("home.pleaseTryAgain"));
          setEditVideo(null);
        }
      }
    }
  };

  const handleUpdatePost = async () => {
    if (!sessionToken || !editPost) return;
    const YOUTUBE_REGEX_EDIT = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;
    const SOUNDCLOUD_REGEX_EDIT = /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(?:[^\s]*)?/gi;
    let finalEditText = editText.trim();
    let extractedYt: string | null = null;
    let extractedSc: string | null = null;
    YOUTUBE_REGEX_EDIT.lastIndex = 0; const ytMatch = YOUTUBE_REGEX_EDIT.exec(editText);
    if (ytMatch) { extractedYt = ytMatch[0]; finalEditText = editText.replace(ytMatch[0], "").replace(/\n{2,}/g, "\n").trim(); }
    SOUNDCLOUD_REGEX_EDIT.lastIndex = 0; const scMatch = SOUNDCLOUD_REGEX_EDIT.exec(editText);
    if (scMatch) { extractedSc = scMatch[0]; finalEditText = finalEditText.replace(scMatch[0], "").replace(/\n{2,}/g, "\n").trim(); }
    const updated = await updatePost(sessionToken, editPost.post_id, { text: finalEditText || editPost.text, image_base64: editImage || undefined, video_base64: editVideo || undefined, media_ratio: editMediaRatio || undefined, youtube_link: extractedYt || null, soundcloud_url: extractedSc || null });
    setLocalPosts((prev: Post[]) => prev.map((item) => (item.post_id === updated.post_id ? updated : item)));
    setEditModal(false);
    setEditMediaRatio(null);
  };

  const handleDeletePost = async (post: Post) => {
    if (!sessionToken) return;
    await deletePost(sessionToken, post.post_id);
    setLocalPosts((prev: Post[]) => prev.filter((item) => item.post_id !== post.post_id));
    setEditModal(false);
  };

  const handlePostTextChange = async (value: string) => {
    setPostText(value);
    if (!sessionToken) return;
    const match = value.match(/@([\w\d_-]*)$/);
    if (!match || !match[1]) { setTagResults([]); return; }
    const friends = await searchUsers(sessionToken, match[1], true);
    let merged = [...friends];
    if (friends.length < 5) {
      const all = await searchUsers(sessionToken, match[1], false);
      all.forEach((u) => { if (!merged.find((item) => item.user_id === u.user_id)) merged.push(u); });
    }
    setTagResults(merged.slice(0, 6));
  };

  const handleSelectTag = (user: User) => {
    const updated = postText.replace(/@([\w\d_-]*)$/, `@${user.name} `);
    setPostText(updated);
    setTagResults([]);
    setTaggedUserIds((prev) => prev.includes(user.user_id) ? prev : [...prev, user.user_id]);
  };

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    events.forEach((event) => { const dateKey = formatEventDate(event.start_time); marks[dateKey] = { marked: true, dotColor: COLORS.primaryDark }; });
    return marks;
  }, [events]);

  const eventsForDate = useMemo(() => {
    let filtered = events;
    if (calendarDate) filtered = filtered.filter((event) => event.start_time.startsWith(calendarDate));
    if (selectedTheme) filtered = filtered.filter((event) => event.theme === selectedTheme);
    return filtered;
  }, [calendarDate, events, selectedTheme]);

  const activitiesMarkedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    activities.forEach((activity) => { const dateKey = activity.date?.split(" ")[0] || activity.date; if (dateKey) marks[dateKey] = { marked: true, dotColor: COLORS.primaryDark }; });
    return marks;
  }, [activities]);

  const activitiesForDate = useMemo(() => {
    let filtered = activities;
    if (activitiesCalendarDate) filtered = filtered.filter((activity) => activity.date?.startsWith(activitiesCalendarDate));
    return filtered;
  }, [activitiesCalendarDate, activities]);

  const getThemeLabel = (slug: string) => {
    const translationKey = `events.themes.${slug}`;
    const translated = t(translationKey);
    if (translated && translated !== translationKey) return translated;
    return eventThemes.find((et) => et.slug === slug)?.label || slug;
  };

  const getBizName = (id: string) => businesses.find(b => b.business_id === id)?.name || id;

  if (feedLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.backgroundPage }} edges={["top"]}>
        <HomeSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.stickyHeader}>
        <View style={styles.stickyHeaderLeft}>
          <Animated.Text style={[styles.stickyHeaderBrand, { opacity: brandOpacity }]}>Perix</Animated.Text>
          <Text style={styles.stickyHeaderSub}>{t("home.discoverNearby", "Discover nearby")}</Text>
        </View>
        <View style={styles.stickyHeaderRight}>
          <Pressable style={[styles.stickyHeaderIcon, { backgroundColor: COLORS.primaryLight }]} onPress={() => setShowLocationSearch(true)}>
            <Ionicons name="search" size={22} color={COLORS.primary} />
          </Pressable>
          <Pressable style={[styles.stickyHeaderIcon, { backgroundColor: COLORS.filterIconBg }]} onPress={() => setShowLayoutSettings(true)}>
            <Ionicons name="options-outline" size={22} color={COLORS.filterIcon} />
          </Pressable>
          <Pressable style={[styles.stickyHeaderIcon, { backgroundColor: COLORS.errorBorder }]} onPress={async () => { await logout(); }}>
            <Text style={{ color: COLORS.errorText, fontWeight: "700", fontSize: 11 }}>CLR</Text>
          </Pressable>
        </View>
      </View>

      <LocationSearchOverlay
        visible={showLocationSearch}
        sessionToken={sessionToken}
        onClose={() => setShowLocationSearch(false)}
        onSelectPlace={(lat, lng) => {
          const d = 0.09;
          setMapBounds({ minLat: lat - d / 2, maxLat: lat + d / 2, minLng: lng - d / 2, maxLng: lng + d / 2, centerLat: lat, centerLng: lng });
        }}
      />

      <FlatList
        ref={scrollRef}
        data={homeLayout.sections.find(s => s.id === "posts")?.enabled !== false ? sortedPosts : []}
        keyExtractor={(item) => item.post_id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 0 }}>
          <View key={item.post_id}>
          <PostCard
            context="home"
            post={item}
            isSaved={savedPostIds.has(item.post_id)}
            onLike={() => handleToggleLike(item)}
            onComment={() => openComments(item)}
            onSave={async () => {
              if (!sessionToken) return;
              try {
                const { is_saved } = await toggleSaved(sessionToken, "post", item.post_id);
                setLocalSavedPostIds(prev => { const next = new Set(prev); is_saved ? next.add(item.post_id) : next.delete(item.post_id); return next; });
              } catch (e) { console.warn("toggleSaved failed:", e); }
            }}
            sessionToken={sessionToken}
            isActive={item.post_id === visiblePostId && !isAnyModalOpen && isFocused}
            showMuteButton
            muted={!(userWantsSound && item.post_id === visiblePostId && !isAnyModalOpen && isFocused)}
            onMuteChange={setUserWantsSound}
            onCardTap={() => setUserWantsSound(false)}
          />
          </View>
          </View>
        )}
        ListHeaderComponent={
          <>
        {feedError && posts.length === 0 && (
          <View style={{ margin: SPACING.small, padding: SPACING.compact, backgroundColor: COLORS.errorBg, borderRadius: BORDER_RADIUS.lg, alignItems: "center" }}>
            <Ionicons name="alert-circle" size={32} color={COLORS.errorText} style={{ marginBottom: SPACING.small }} />
            <Text style={{ fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.errorTitle, marginBottom: SPACING.tiny }}>{t("home.feedErrorTitle") || "Unable to load feed"}</Text>
            <Text style={{ fontSize: FONT_SIZES.small, color: COLORS.errorDark, textAlign: "center", marginBottom: SPACING.small }}>{t("home.feedErrorMessage") || "There was a problem loading posts and activities. Please try again."}</Text>
            <Pressable style={{ paddingHorizontal: SPACING.std, paddingVertical: SPACING.small, backgroundColor: COLORS.errorText, borderRadius: BORDER_RADIUS.md }} onPress={onRefresh}>
              <Text style={{ color: COLORS.textLight, fontWeight: FONT_WEIGHTS.semibold, fontSize: FONT_SIZES.small }}>{t("common.retry") || "Retry"}</Text>
            </Pressable>
          </View>
        )}

        {!isMapInitialized && (
          <View style={styles.mapPromptContainer}>
            <View style={styles.mapPromptCard}>
              <View style={styles.mapPromptIconContainer}>
                <Ionicons name="map" size={48} color={COLORS.primaryDark} />
              </View>
              <Text style={styles.mapPromptTitle}>{t("home.setLocationTitle", { defaultValue: "Set Your Area" })}</Text>
              <Text style={styles.mapPromptText}>{t("home.setLocationDescription", { defaultValue: "To see content from nearby businesses, please first set your location area on the map." })}</Text>
              <Pressable style={styles.mapPromptButton} onPress={handleRecenterOnMe} data-testid="recenter-btn">
                <Ionicons name="locate" size={20} color={COLORS.textLight} />
                <Text style={styles.mapPromptButtonText}>{t("home.useMyLocation", { defaultValue: "Use My Location" })}</Text>
              </Pressable>
              <Pressable style={[styles.mapPromptButton, styles.mapPromptButtonSecondary]} onPress={() => router.navigate("/(tabs)/locator" as any)} data-testid="go-to-map-btn">
                <Ionicons name="navigate" size={20} color={COLORS.primaryDark} />
                <Text style={[styles.mapPromptButtonText, styles.mapPromptButtonTextSecondary]}>{t("home.goToMap", { defaultValue: "Go to Map" })}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <CityAdCircles
          user={user}
          storyGroups={storyGroups}
          onYourStoryPress={handleCreateCityAd}
          onStoryPress={(idx) => { setStoryViewerIndex(idx); setStoryViewerOpen(true); }}
          activeIdentity={activeIdentity}
        />

        {mapBounds && homeLayout.sections.find(s => s.id === "map")?.enabled !== false && (
          <MapSection
            mapBounds={mapBounds}
            businesses={businesses}
            events={events}
            activities={activities}
            rentals={rentals}
            jobs={jobs}
            services={sortedServices}
            onRegionChange={(bounds) => {
              setMapBounds({ ...bounds, centerLat: (bounds.minLat + bounds.maxLat) / 2, centerLng: (bounds.minLng + bounds.maxLng) / 2 });
            }}
            onRecenter={(lat, lng) => {
              const d = 0.09;
              setMapBounds({ minLat: lat - d / 2, maxLat: lat + d / 2, minLng: lng - d / 2, maxLng: lng + d / 2, centerLat: lat, centerLng: lng });
            }}
          />
        )}

        {homeLayout.sections.find(s => s.id === "events")?.enabled !== false && (
          <CarouselSection
            title={t("home.events")}
            icon="calendar"
            color={COLORS.eventsAccent}
            seeAllRoute={{ pathname: "/(tabs)/locator" as any, params: { tab: "events" } } as any}
            filters={{
              options: [
                { key: "all", label: t("common.all", "All") },
                { key: "attending", label: t("home.attending", "Attending") },
                { key: "mine", label: t("home.mine", "Mine") },
              ],
              activeKey: eventsFilter,
              onChange: (k) => setEventsFilter(k as "all" | "attending" | "mine"),
            }}
            emptyMessage={t("home.noEvents")}
          >
            {sortedEvents.map((event) => {
              const eventTheme = (event as any).profile_theme;
              const themeColors = getThemeColors(eventTheme);
              const textColor = themeColors.textColor;
              const eventImg = event.cover_image_url || (!event.video_url ? (event.image_urls?.[0] || event.gallery_images?.[0]) : undefined);
              const going = event.is_attending;
              const yours = event.is_creator && !event.is_attending;
              return (
                <CarouselCard
                  key={`${event.event_id}-${mapRefreshKey}`}
                  imageUrl={eventImg}
                  videoUrl={event.video_url}
                  title={event.title}
                  subtitle={`${event.theme && EVENT_THEMES[event.theme] ? EVENT_THEMES[event.theme].label + " · " : ""}${event.creator?.name || event.business?.name || event.artist?.name || ""}`}
                  thirdLine={formatEventDate(event.start_time)}
                  onPress={() => router.push(`/event/${event.event_id}`)}
                  isSaved={savedEventIds.has(event.event_id)}
                  textColor={textColor}
                  fallbackIcon="calendar"
                  overlay={
                    <>
                      {going && (
                        <View style={styles.goingBadge}>
                          <Ionicons name="checkmark-circle" size={10} color={COLORS.textLight} />
                          <Text style={styles.goingText}>{t("home.going", "Going")}</Text>
                        </View>
                      )}
                      {yours && (
                        <View style={styles.ownerBadge}>
                          <Ionicons name="star" size={10} color={COLORS.textLight} />
                          <Text style={styles.ownerText}>{t("home.yours", "Yours")}</Text>
                        </View>
                      )}
                    </>
                  }
                />
              );
            })}
          </CarouselSection>
        )}

        {homeLayout.sections.find(s => s.id === "activities")?.enabled !== false && (
          <CarouselSection
            title={t("tabs.activities")}
            icon="people"
            color={COLORS.activitiesAccent}
            seeAllRoute={{ pathname: "/(tabs)/locator" as any, params: { tab: "activities" } } as any}
            filters={{
              options: [
                { key: "all", label: t("common.all", "All") },
                { key: "attending", label: t("home.going", "Going") },
                { key: "mine", label: t("home.mine", "Mine") },
              ],
              activeKey: activitiesFilter,
              onChange: (k) => setActivitiesFilter(k as "all" | "attending" | "mine"),
            }}
            emptyMessage={t("activities.noActivities")}
          >
            {sortedActivities.map((activity) => {
              const activityTheme = (activity as any).profile_theme;
              const themeColors = getThemeColors(activityTheme);
              const textColor = themeColors.textColor;
              const activityImg = activity.cover_image_url || (!activity.video_url ? (activity.image_urls?.[0] || activity.gallery_images?.[0]) : undefined);
              const going = activity.my_status === "accepted" || activity.my_status === "going";
              const yours = activity.is_creator && !going;
              return (
                <CarouselCard
                  key={`${activity.activity_id}-${mapRefreshKey}`}
                  imageUrl={activityImg}
                  videoUrl={activity.video_url}
                  title={activity.title}
                  subtitle={`${activity.theme && ACTIVITY_TYPES[activity.theme] ? ACTIVITY_TYPES[activity.theme].label + " · " : ""}${activity.creator?.name || ""}`}
                  thirdLine={formatEventDate(activity.date)}
                  onPress={() => router.push(`/activity/${activity.activity_id}`)}
                  isSaved={savedActivityIds.has(activity.activity_id)}
                  textColor={textColor}
                  fallbackIcon="people"
                  overlay={
                    <>
                      {going && (
                        <View style={styles.goingBadge}>
                          <Ionicons name="checkmark-circle" size={10} color={COLORS.textLight} />
                          <Text style={styles.goingText}>{t("home.going", "Going")}</Text>
                        </View>
                      )}
                      {yours && (
                        <View style={styles.ownerBadge}>
                          <Ionicons name="star" size={10} color={COLORS.textLight} />
                          <Text style={styles.ownerText}>{t("home.yours", "Yours")}</Text>
                        </View>
                      )}
                    </>
                  }
                />
              );
            })}
          </CarouselSection>
        )}

        {homeLayout.sections.find(s => s.id === "businesses")?.enabled !== false && (
          <CarouselSection
            title={t("home.businesses")}
            icon="business"
            color={COLORS.businessesAccent}
            seeAllRoute={{ pathname: "/(tabs)/locator" as any, params: { tab: "businesses" } } as any}
          >
            {sortedBusinesses.map((business) => {
              const businessTheme = business.theme;
              const themeColors = getThemeColors(businessTheme);
              const primaryColor = themeColors.primaryColor;
              const bizImg = business.logo_image || business.profile_photo || business.cover_image;
              return (
                <CarouselCard
                  key={`${business.business_id}-${mapRefreshKey}`}
                  imageUrl={bizImg}
                  title={business.name}
                  subtitle={translateCategory(business.subcategory, t)}
                  onPress={() => router.push(`/business/${business.business_id}`)}
                  isSaved={savedBusinessIds.has(business.business_id)}
                  textColor={primaryColor}
                  fallbackIcon="business"
                />
              );
            })}
          </CarouselSection>
        )}

        {homeLayout.sections.find(s => s.id === "services")?.enabled !== false && (
          <CarouselSection
            title={t("modules.services") || "Services"}
            icon="briefcase"
            color={COLORS.servicesAccent}
            seeAllRoute="/services"
            emptyMessage={t("services.noServices") || "No services nearby"}
          >
            {sortedServices.filter(s => s.type !== "rental_property").map((service) => {
              const serviceImg = service.cover_image_url || (!service.video_url ? (service.image_urls?.[0] || service.gallery_images?.[0]) : undefined);
              return (
                <CarouselCard
                  key={service.service_id}
                  imageUrl={serviceImg}
                  videoUrl={service.video_url}
                  title={service.name}
                  subtitle={service.type}
                  onPress={() => router.push(`/service/${service.service_id}` as any)}
                  isSaved={savedServiceIds.has(service.service_id)}
                  fallbackIcon="briefcase"
                />
              );
            })}
          </CarouselSection>
        )}

        {homeLayout.sections.find(s => s.id === "rentals")?.enabled !== false && (
          <>
            <CarouselSection
              title={t("rentals.professionalRentals", "Professional Rentals")}
              icon="business"
              color={COLORS.rentalsAccent}
              seeAllRoute="/rentals"
              emptyMessage={t("rentals.noRentals") || "No rentals nearby"}
            >
              {sortedRentals.filter((r: any) => (r.source_type || "business") === "business").map((rental) => {
                const rentalImg = rental.cover_image || (!(rental as any).video_url ? rental.gallery_images?.[0] : undefined);
                return (
                  <CarouselCard
                    key={rental.rental_id}
                    imageUrl={rentalImg}
                    videoUrl={rental.video_url}
                    title={rental.title}
                    subtitle={(rental as any).source_badge ? `💼 ${(rental as any).source_badge}` : (rental.rent_price || rental.rooms_size || "")}
                    thirdLine={rental.address || ""}
                    onPress={() => router.push(`/service/${rental.service_id || rental.rental_id}` as any)}
                    isSaved={savedRentalIds.has(rental.rental_id)}
                    fallbackIcon="home"
                  />
                );
              })}
            </CarouselSection>

            <CarouselSection
              title={t("rentals.homesFromOwners", "Homes from Owners")}
              icon="home"
              color={COLORS.primaryDark}
              seeAllRoute="/marketplace?tab=homes"
              emptyMessage={t("rentals.noOwnerHomes", "No owner-listed homes nearby")}
            >
              {sortedRentals.filter((r: any) => r.source_type === "owner").map((rental) => {
                const rentalImg = rental.cover_image || (!(rental as any).video_url ? rental.gallery_images?.[0] : undefined);
                return (
                  <CarouselCard
                    key={rental.rental_id}
                    imageUrl={rentalImg}
                    videoUrl={rental.video_url}
                    title={rental.title}
                    subtitle={(rental as any).source_badge ? `🏠 ${(rental as any).source_badge}` : (rental.rent_price || rental.rooms_size || "")}
                    thirdLine={rental.address || ""}
                    onPress={() => router.push(`/rental/${rental.rental_id}` as any)}
                    isSaved={savedRentalIds.has(rental.rental_id)}
                    fallbackIcon="home"
                  />
                );
              })}
            </CarouselSection>
          </>
        )}

        {homeLayout.sections.find(s => s.id === "jobs")?.enabled !== false && (
          <CarouselSection
            title={t("home.jobs") || "Jobs"}
            icon="briefcase"
            color={COLORS.jobsAccent}
            seeAllRoute="/(tabs)/jobs"
            emptyMessage={t("jobs.noJobs") || "No jobs nearby"}
          >
            {sortedJobs.map((job) => {
              const jobImg = job.cover_image || (!job.video_url ? (job.image_urls?.[0] || job.gallery_images?.[0] || job.business_logo) : undefined);
              return (
                <CarouselCard
                  key={job.job_id}
                  imageUrl={jobImg}
                  videoUrl={job.video_url}
                  title={job.title}
                  subtitle={job.business_name || job.location || ""}
                  onPress={() => router.push(`/job/${job.job_id}`)}
                  isSaved={savedJobIds.has(job.job_id)}
                  fallbackIcon="briefcase"
                />
              );
            })}
          </CarouselSection>
        )}

        {homeLayout.sections.find(s => s.id === "marketplace")?.enabled !== false && (
          <CarouselSection
            title={t("home.marketplace", "Marketplace")}
            icon="pricetag"
            color={COLORS.warning}
            seeAllRoute="/marketplace?tab=items"
            emptyMessage={t("marketplace.noItems", "No items for sale nearby")}
          >
            {marketplaceItems.map((item) => (
              <CarouselCard
                key={item.listing_id}
                imageUrl={item.cover_image_url || item.image_urls?.[0]}
                videoUrl={item.video_url}
                title={item.title}
                subtitle={`${t("marketplace.forSale", "For sale")}${item.price ? ` · ${item.price}` : ""}`}
                thirdLine={item.address || ""}
                onPress={() => router.push(`/listing/${item.listing_id}` as any)}
                isSaved={false}
                fallbackIcon="pricetag"
              />
            ))}
          </CarouselSection>
        )}

        {homeLayout.sections.find(s => s.id === "posts")?.enabled !== false && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.activitiesSectionTitle}>
                <View style={[styles.activitiesIconContainer, { backgroundColor: COLORS.primary }]}>
                  <Ionicons name="newspaper" size={18} color={COLORS.textLight} />
                </View>
                <Text style={styles.cardTitle}>{t("home.posts") || "Posts"}</Text>
              </View>
              <View style={styles.feedToggle}>
                <Pressable
                  style={[styles.feedToggleBtn, feedMode === "nearby" && styles.feedToggleBtnActive]}
                  onPress={() => setFeedMode("nearby")}
                >
                  <Text style={[styles.feedToggleText, feedMode === "nearby" && styles.feedToggleTextActive]}>
                    {t("home.nearby") || "Nearby"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.feedToggleBtn, feedMode === "following" && styles.feedToggleBtnActive]}
                  onPress={() => setFeedMode("following")}
                >
                  <Text style={[styles.feedToggleText, feedMode === "following" && styles.feedToggleTextActive]}>
                    {t("home.friends") || "Friends"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
          </>
        }
        ListFooterComponent={
          <>
        {loadingMorePosts && sortedPosts.length > 0 && (
          <View style={{ paddingVertical: 20, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8 }}>Loading more...</Text>
          </View>
        )}
        {showNoLocationMessage && (
          <View style={[styles.emptyState, { marginHorizontal: 16, marginVertical: 20 }]}>
            <Text style={styles.emptyText}>{t("home.noLocationSet") || "Please set your location in your profile to see nearby content"}</Text>
          </View>
        )}
        <View style={{ height: 100 }} />
          </>
        }
        ListEmptyComponent={
          homeLayout.sections.find(s => s.id === "posts")?.enabled !== false ? (
            <View style={styles.storyEmpty}><Text style={styles.storyEmptyText}>{t("home.noPosts") || "No posts yet"}</Text></View>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        contentContainerStyle={{ paddingBottom: 52 + insets.bottom + 20 }}
        onViewableItemsChanged={onViewableItemsChangedRef}
        viewabilityConfig={viewabilityConfigRef}
        onEndReached={loadMorePosts}
        onEndReachedThreshold={2}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={5}
      />

      <Modal visible={calendarOpen} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.calendarModalHeader}>
            <View style={styles.calendarHeaderContent}>
              <View style={styles.calendarHeaderIcon}><Ionicons name="calendar" size={24} color={COLORS.textLight} /></View>
              <View>
                <Text style={styles.calendarModalTitle}>{t("home.eventsCalendar")}</Text>
                <Text style={styles.calendarModalSubtitle}>{calendarDate ? calendarDate : t("home.upcomingEvents")}</Text>
              </View>
            </View>
            <Pressable style={styles.calendarCloseButton} onPress={() => setCalendarOpen(false)}><Ionicons name="close-circle" size={32} color={COLORS.textPlaceholder} /></Pressable>
          </View>
          <View style={{ flex: 1, backgroundColor: "#fafafa" }}>
            <CalendarList onDayPress={(day) => setCalendarDate(day.dateString)} markedDates={{ ...markedDates, ...(calendarDate ? { [calendarDate]: { selected: true, selectedColor: COLORS.primaryDark, selectedTextColor: COLORS.textLight } } : {}) }} pastScrollRange={3} futureScrollRange={6} style={styles.calendarList} theme={{ backgroundColor: COLORS.background, calendarBackground: COLORS.background, textSectionTitleColor: COLORS.textGray, selectedDayBackgroundColor: COLORS.primaryDark, selectedDayTextColor: COLORS.textLight, todayTextColor: COLORS.primaryDark, dayTextColor: COLORS.textDark, textDisabledColor: COLORS.borderLight, dotColor: COLORS.primaryDark, selectedDotColor: COLORS.textLight, arrowColor: COLORS.primaryDark, monthTextColor: COLORS.textPrimary, textDayFontWeight: "500", textMonthFontWeight: "700", textDayFontSize: 14 }} />
          </View>
          <View style={styles.themeFilterContainer}>
            <Pressable style={styles.themeFilterButton} onPress={() => setShowThemeFilter(true)} data-testid="calendar-theme-filter">
              <Ionicons name="musical-notes" size={18} color={COLORS.primaryDark} />
              <Text style={styles.themeFilterText}>{selectedTheme ? getThemeLabel(selectedTheme) : t("events.allThemes")}</Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textGray} />
            </Pressable>
          </View>
          <View style={styles.calendarEventsSection}>
            <Text style={styles.calendarEventsTitle}>{calendarDate ? t("home.eventsOn", { date: calendarDate }) : t("home.upcomingEvents")}</Text>
            <ScrollView style={{ maxHeight: 180 }}>
              {eventsForDate.length === 0 ? (
                <View style={styles.emptyEventState}><Ionicons name="calendar-outline" size={40} color={COLORS.borderLight} /><Text style={styles.emptyText}>{t("common.noEventsDate")}</Text></View>
              ) : eventsForDate.map((event) => (
                <Pressable key={event.event_id} style={styles.calendarEventCard} onPress={() => { setCalendarOpen(false); router.push(`/event/${event.event_id}`); }}>
                  <View style={styles.eventThumbContainer}>
                    {event.video_url ? (
                      <AdaptiveVideo uri={event.video_url} style={styles.eventThumbCard} autoPlay isLooping initialMuted />
                    ) : (event.cover_image_url || event.image_urls?.[0] || event.gallery_images?.[0]) ? (
                      <AdaptiveImage uri={event.cover_image_url ?? event.image_urls?.[0] ?? event.gallery_images?.[0] ?? ""} style={styles.eventThumbCard} fallbackColor={COLORS.primaryDark} />
                    ) : (<View style={[styles.eventThumbCard, styles.eventThumbPlaceholder]}><Ionicons name="musical-note" size={18} color={COLORS.primaryDark} /></View>)}
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                    <View style={styles.eventMetaRow}><Ionicons name="business" size={12} color={COLORS.textGray} /><Text style={styles.eventMeta}>{event.business?.name || event.artist?.name || "Event"}</Text></View>
                    <View style={styles.eventMetaRow}><Ionicons name="calendar-outline" size={12} color={COLORS.primaryDark} /><Text style={[styles.eventMeta, { color: COLORS.primaryDark }]}>{formatEventDate(event.start_time)}</Text>{event.theme && (<View style={styles.eventThemeBadge}><Text style={styles.eventThemeText}>{getThemeLabel(event.theme)}</Text></View>)}</View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.borderLight} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={showThemeFilter} animationType="slide" transparent>
        <View style={styles.themeModalOverlay}>
          <View style={styles.themeModalContainer}>
            <View style={styles.themeModalHeader}><Text style={styles.themeModalTitle}>{t("events.filterByTheme")}</Text><Pressable onPress={() => setShowThemeFilter(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></Pressable></View>
            <ScrollView style={styles.themeModalList}>
              <Pressable style={styles.themeModalItem} onPress={() => { setSelectedTheme(""); setShowThemeFilter(false); }}><Text style={styles.themeModalItemText}>{t("events.allThemes")}</Text>{!selectedTheme && <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />}</Pressable>
              {eventThemes.map((theme) => (
                <Pressable key={theme.slug} style={styles.themeModalItem} onPress={() => { setSelectedTheme(theme.slug); setShowThemeFilter(false); }}>
                  <Text style={styles.themeModalItemText}>{getThemeLabel(theme.slug)}</Text>{selectedTheme === theme.slug && <Ionicons name="checkmark" size={20} color={COLORS.primaryDark} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={activitiesCalendarOpen} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.activitiesCalendarModalHeader}>
            <View style={styles.calendarHeaderContent}>
              <View style={styles.activitiesCalendarHeaderIcon}><Ionicons name="people" size={24} color={COLORS.textLight} /></View>
              <View>
                <Text style={styles.calendarModalTitle}>{t("home.activitiesCalendar")}</Text>
                <Text style={styles.activitiesCalendarModalSubtitle}>{activitiesCalendarDate ? activitiesCalendarDate : t("home.upcomingActivities")}</Text>
              </View>
            </View>
            <Pressable style={styles.calendarCloseButton} onPress={() => setActivitiesCalendarOpen(false)}><Ionicons name="close-circle" size={32} color="#c4b5fd" /></Pressable>
          </View>
          <View style={{ flex: 1, backgroundColor: "#fafafa" }}>
            <CalendarList onDayPress={(day) => setActivitiesCalendarDate(day.dateString)} markedDates={{ ...activitiesMarkedDates, ...(activitiesCalendarDate ? { [activitiesCalendarDate]: { selected: true, selectedColor: COLORS.primaryDark, selectedTextColor: COLORS.textLight } } : {}) }} pastScrollRange={3} futureScrollRange={6} style={styles.calendarList} theme={{ backgroundColor: COLORS.background, calendarBackground: COLORS.background, textSectionTitleColor: COLORS.textGray, selectedDayBackgroundColor: COLORS.primaryDark, selectedDayTextColor: COLORS.textLight, todayTextColor: COLORS.primaryDark, dayTextColor: COLORS.textDark, textDisabledColor: COLORS.borderLight, dotColor: COLORS.primaryDark, selectedDotColor: COLORS.textLight, arrowColor: COLORS.primaryDark, monthTextColor: COLORS.textPrimary, textDayFontWeight: "500", textMonthFontWeight: "700", textDayFontSize: 14 }} />
          </View>
          <View style={[styles.calendarEventsSection, { backgroundColor: "#f5f3ff" }]}>
            <Text style={[styles.calendarEventsTitle, { color: COLORS.primaryDark }]}>{activitiesCalendarDate ? t("home.activitiesOn", { date: activitiesCalendarDate }) : t("home.upcomingActivities")}</Text>
            <ScrollView style={{ maxHeight: 180 }}>
              {activitiesForDate.length === 0 ? (
                <View style={styles.emptyEventState}><Ionicons name="people-outline" size={40} color="#c4b5fd" /><Text style={styles.emptyText}>{t("common.noActivitiesDate")}</Text></View>
              ) : activitiesForDate.map((activity) => (
                <Pressable key={activity.activity_id} style={[styles.calendarEventCard, { borderColor: "#e9d5ff" }]} onPress={() => { setActivitiesCalendarOpen(false); router.push(`/activity/${activity.activity_id}`); }}>
                  <View style={styles.eventThumbContainer}>
                    {activity.video_url ? (
                      <AdaptiveVideo uri={activity.video_url} style={styles.eventThumbCard} autoPlay isLooping initialMuted />
                    ) : (activity.cover_image_url || activity.image_urls?.[0] || activity.gallery_images?.[0]) ? (
                      <AdaptiveImage uri={activity.cover_image_url ?? activity.image_urls?.[0] ?? activity.gallery_images?.[0] ?? ""} style={styles.eventThumbCard} fallbackColor={COLORS.primaryDark} />
                    ) : (<View style={[styles.eventThumbCard, { backgroundColor: "#f3e8ff" }]}><Ionicons name="people" size={20} color={COLORS.primaryDark} /></View>)}
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{activity.title}</Text>
                    <View style={styles.eventMetaRow}><Ionicons name="time-outline" size={12} color={COLORS.textGray} /><Text style={styles.eventMeta}>{activity.date}</Text></View>
                    {activity.is_private && (<View style={styles.eventThemeBadge}><Ionicons name="lock-closed" size={10} color={COLORS.warning} /><Text style={[styles.eventThemeText, { color: COLORS.warning }]}>{t("activities.private")}</Text></View>)}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#c4b5fd" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={commentModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{t("common.comments")}</Text><Pressable onPress={() => setCommentModal(false)}><Ionicons name="close" size={22} color={COLORS.textPrimary} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.commentHint}>{t("home.postingAs", { name: activeIdentity?.name || user?.name || "User" })}</Text>
            {commentLoading ? (<ActivityIndicator color={COLORS.primaryDark} />) : comments.map((comment) => (
              <View key={comment.comment_id} style={styles.commentRow}>
                <Pressable style={styles.commentAvatar} onPress={() => { if (comment.user_id) { setCommentModal(false); router.push(`/user/${comment.user_id}`); } }}>
                  {comment.actor_avatar || comment.author?.profile_photo || comment.author?.picture ? (<Image source={{ uri: (comment.actor_avatar || comment.author?.profile_photo || comment.author?.picture) as string }} style={styles.commentAvatarImage} />) : (<Text style={styles.commentAvatarText}>{(comment.actor_name || comment.author?.name || "U").charAt(0).toUpperCase()}</Text>)}
                </Pressable>
                <View style={styles.commentBody}>
                  <Pressable onPress={() => { if (comment.user_id) { setCommentModal(false); router.push(`/user/${comment.user_id}`); } }}>
                    <Text style={[styles.commentAuthor, { color: COLORS.primaryDark }]}>{comment.actor_name || comment.author?.name}</Text>
                  </Pressable>
                  <Text style={styles.commentText}>{comment.text}</Text>
                  {comment.user_id === user?.user_id ? (
                    <View style={styles.commentActions}>
                      <Pressable onPress={() => handleEditComment(comment)} style={styles.commentActionButton}><Text style={styles.commentActionText}>{t("common.edit")}</Text></Pressable>
                      <Pressable onPress={() => handleDeleteComment(comment)} style={styles.commentActionButton}><Text style={styles.commentActionText}>{t("common.delete")}</Text></Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.commentInputRow}>
            <TextInput placeholder={t("home.addComment")} value={commentText} onChangeText={setCommentText} style={styles.commentInput} />
            <Pressable style={styles.commentButton} onPress={handleAddComment}><Ionicons name="send" size={18} color={COLORS.textLight} /></Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={editModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{t("home.editPost")}</Text><Pressable onPress={() => setEditModal(false)}><Ionicons name="close" size={22} color={COLORS.textPrimary} /></Pressable></View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput value={editText} onChangeText={setEditText} style={[styles.modalInput, styles.modalTextarea]} multiline />
            {editImage ? (<AdaptiveImage uri={editImage} style={styles.postImagePreview} ratio={editMediaRatio || undefined} />) : null}
            {editVideoPreview ? (<AdaptiveVideo autoPlay uri={editVideoPreview} style={styles.videoPreview} ratio={editMediaRatio || undefined} />) : null}
            <View style={styles.postActions}>
              <Pressable style={styles.iconButton} onPress={pickEditImage}><Ionicons name="image-outline" size={18} color={COLORS.primaryDark} /><Text style={styles.iconButtonText}>{t("common.photo")}</Text></Pressable>
              <Pressable style={styles.iconButton} onPress={pickEditVideo}><Ionicons name="videocam-outline" size={18} color={COLORS.primaryDark} /><Text style={styles.iconButtonText}>{t("common.video")}</Text></Pressable>
            </View>
            <Pressable style={styles.primaryButton} onPress={handleUpdatePost}><Text style={styles.primaryButtonText}>{t("home.saveChanges")}</Text></Pressable>
            {editPost ? (<Pressable style={[styles.secondaryButton, styles.deleteButton]} onPress={() => handleDeletePost(editPost)}><Text style={styles.deleteButtonText}>{t("home.deletePost")}</Text></Pressable>) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showBusinessTagModal} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.tagBusinessModal}>
            <View style={styles.modalHeader}><Text style={styles.modalTitle}>{t("home.selectBusiness")}</Text><Pressable onPress={() => setShowBusinessTagModal(false)}><Ionicons name="close" size={24} color={COLORS.textPrimary} /></Pressable></View>
            <TextInput style={styles.searchInput} placeholder={t("home.searchBusiness")} value={businessSearchQuery} onChangeText={setBusinessSearchQuery} />
            <ScrollView style={styles.businessList} keyboardShouldPersistTaps="handled">
              {businesses.filter((b) => b.name.toLowerCase().includes(businessSearchQuery.toLowerCase())).map((business) => (
                <Pressable key={business.business_id} style={styles.businessListItem} onPress={() => { setTaggedBusinessId(business.business_id); setTaggedBusiness(business); setShowBusinessTagModal(false); setBusinessSearchQuery(""); }}>
                  <View style={styles.businessItemAvatar}>
                    {business.logo_image ? (<Image source={{ uri: business.logo_image }} style={styles.businessItemImage} />) : (<Text style={styles.businessItemInitial}>{business.name.charAt(0).toUpperCase()}</Text>)}
                  </View>
                  <View style={styles.businessItemInfo}><Text style={styles.businessItemName}>{business.name}</Text><Text style={styles.businessItemCategory}>{business.address}</Text></View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <UploadProgressSheet visible={showUploadProgress} progress={uploadProgress} context="post" mode="blocking" />

      <ShareContent visible={shareModalVisible} onClose={() => setShareModalVisible(false)} contentType="post" contentId={shareContentId} title={shareContentTitle} description="" />

      <Modal visible={storyViewerOpen} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setStoryViewerOpen(false)}>
        {storyViewerOpen && storyGroups.length > 0 && (
          <CityAdViewer groups={storyGroups} initialGroupIndex={storyViewerIndex} onClose={() => setStoryViewerOpen(false)} />
        )}
      </Modal>

      {/* Uploading Ad Overlay */}
      {uploadingAd && (
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          alignItems: "center", justifyContent: "center",
          zIndex: 1000,
        }}>
          <ActivityIndicator size="large" color={COLORS.textLight} />
          <Text style={{ color: COLORS.textLight, fontSize: 16, marginTop: 12, fontWeight: "600" }}>
            {t("cityAd.uploadingAd") || "Uploading your ad..."}
          </Text>
        </View>
      )}

      <LayoutSettingsModal
        visible={showLayoutSettings}
        onClose={() => setShowLayoutSettings(false)}
        homeLayout={homeLayout}
        onToggleSection={toggleSection}
        onSetSorting={setSorting}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  mapPromptContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 40, alignItems: "center" },
  mapPromptCard: { backgroundColor: COLORS.background, borderRadius: 24, padding: 32, alignItems: "center", width: "100%", shadowColor: COLORS.primaryDark, shadowOpacity: 0.15, shadowRadius: 24, elevation: 8 },
  mapPromptIconContainer: { width: 96, height: 96, borderRadius: 48, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  mapPromptTitle: { fontSize: 22, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 12, textAlign: "center" },
  mapPromptText: { fontSize: 15, color: COLORS.textMuted, textAlign: "center", lineHeight: 22, marginBottom: 24, paddingHorizontal: 8 },
  mapPromptButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24, gap: 10, shadowColor: COLORS.primaryDark, shadowOpacity: 0.4, shadowRadius: 12, elevation: 4 },
  mapPromptButtonText: { color: COLORS.background, fontSize: 16, fontWeight: "700" },
  mapPromptButtonSecondary: { backgroundColor: COLORS.background, borderWidth: 2, borderColor: COLORS.primaryDark, marginTop: 10 },
  mapPromptButtonTextSecondary: { color: COLORS.primaryDark },
  header: { padding: 20 },
  headerTitle: { fontSize: 24, fontWeight: "700", color: COLORS.textPrimary },
  headerSubtitle: { marginTop: 6, color: COLORS.textMuted },
  card: { backgroundColor: COLORS.background, marginHorizontal: 0, marginBottom: 10, paddingTop: 12, paddingHorizontal: SPACING.small, paddingBottom: 8 },
  cardTitle: { fontSize: Platform.OS === "web" ? 18 : 16, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionHeaderRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  seeAllButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  seeAllButtonText: { fontSize: Platform.OS === "web" ? 14 : 13, fontWeight: "600" },
  artistCard: { width: Platform.OS === "web" ? 180 : 145, backgroundColor: COLORS.background, marginRight: 12, marginBottom: 4, borderRadius: 12,     shadowColor: COLORS.primaryDark, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  contentCardImage: { width: Platform.OS === "web" ? 180 : 145, height: Platform.OS === "web" ? 135 : 110, backgroundColor: COLORS.divider, alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  contentCardFallback: { width: "100%", height: "100%", backgroundColor: COLORS.surfaceMuted, alignItems: "center", justifyContent: "center" },
  contentCardFallbackIcon: { fontSize: 32, color: COLORS.textDisabled },
  contentCardText: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  contentCardTitle: { fontSize: Platform.OS === "web" ? 15 : 13, fontWeight: "600", color: COLORS.textPrimary },
  contentCardSub: { fontSize: Platform.OS === "web" ? 13 : 11, color: COLORS.textDisabled, marginTop: 1 },
  savedBadge: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  goingBadge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, backgroundColor: COLORS.success, zIndex: 5 },
  goingText: { fontSize: Platform.OS === "web" ? 10 : 8, fontWeight: "600", color: COLORS.background },
  ownerBadge: { position: "absolute", top: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 8, backgroundColor: COLORS.warning, zIndex: 5 },
  ownerText: { fontSize: Platform.OS === "web" ? 10 : 8, fontWeight: "600", color: COLORS.background },
  artistAvatarImage: { width: "100%", height: "100%" },
  artistName: { fontSize: Platform.OS === "web" ? 14 : 13, fontWeight: "500", marginTop: 4 },
  artistMeta: { fontSize: Platform.OS === "web" ? 13 : 11, color: COLORS.textMuted, marginTop: 2 },
  activitiesSectionTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  activitiesIconContainer: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  feedToggle: { flexDirection: "row", backgroundColor: COLORS.divider, borderRadius: 8, padding: 2 },
  feedToggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
  feedToggleBtnActive: { backgroundColor: COLORS.background,     shadowColor: COLORS.primaryDark, shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  feedToggleText: { fontSize: 13, fontWeight: "500", color: COLORS.textMuted },
  feedToggleTextActive: { color: COLORS.textPrimary, fontWeight: "600" },
  filterChipRow: { flexDirection: "row", gap: 8, marginBottom: 12, marginTop: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: Platform.OS === "web" ? 13 : 12, fontWeight: "500", color: COLORS.textMuted },
  filterChipTextActive: { color: COLORS.background, fontWeight: "600" },
  storyEmpty: { width: 120, paddingHorizontal: 8, alignItems: "center" },
  storyEmptyText: { fontSize: Platform.OS === "web" ? 13 : 12, color: COLORS.textMuted, textAlign: "center" },
  emptyState: { marginHorizontal: 16, backgroundColor: COLORS.background, padding: 24, borderRadius: 16, alignItems: "center" },
  emptyText: { color: COLORS.textDisabled },
  postCard: { backgroundColor: COLORS.background, borderRadius: 12, padding: 16, marginBottom: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  postAvatar: { width: 36, height: 36, borderRadius: 18 },
  postAvatarFallback: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryTint, justifyContent: "center", alignItems: "center" },
  postAvatarText: { fontSize: 14, fontWeight: "600", color: COLORS.primaryDark },
  postAuthorInfo: { marginLeft: 10 },
  postAuthorName: { fontSize: 14, fontWeight: "600", color: COLORS.textPrimary },
  postTimeText: { fontSize: 12, color: COLORS.textMuted },
  postTextContent: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 8 },
  postImagePreview: { width: "100%", height: 200, borderRadius: 8, marginBottom: 8 },
  postStats: { flexDirection: "row", gap: 16 },
  postStatItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatText: { fontSize: 13, color: COLORS.textMuted },
  stickyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.small, paddingVertical: 10, backgroundColor: COLORS.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, zIndex: 10 },
  stickyHeaderLeft: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  stickyHeaderBrand: { fontSize: 22, fontWeight: "800", color: COLORS.primary, letterSpacing: -0.5 },
  stickyHeaderSub: { fontSize: 14, color: COLORS.textMuted },
  stickyHeaderRight: { flexDirection: "row", gap: 4 },
  stickyHeaderIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.backgroundPage, alignItems: "center", justifyContent: "center" },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 18, fontWeight: "600", color: COLORS.textPrimary },
  modalBody: { padding: 20 },
  modalInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  modalTextarea: { minHeight: 90, textAlignVertical: "top" },
  postActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 12, gap: 8 },
  iconButton: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  iconButtonText: { color: COLORS.primaryDark, fontWeight: "600", marginLeft: 4, fontSize: 13 },
  primaryButton: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center", marginLeft: "auto" },
  primaryButtonText: { color: COLORS.background, fontWeight: "600", fontSize: 15 },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: 10, borderRadius: 12, alignItems: "center", marginTop: 8 },
  deleteButton: { borderColor: COLORS.errorLight },
  deleteButtonText: { color: COLORS.danger, fontWeight: "600" },
  videoPreview: { width: "100%", borderRadius: 14, marginBottom: 8 },
  commentRow: { flexDirection: "row", marginBottom: 12 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryTint, alignItems: "center", justifyContent: "center", marginRight: 10 },
  commentAvatarImage: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarText: { color: COLORS.primaryDark, fontWeight: "600" },
  commentBody: { flex: 1 },
  commentActions: { flexDirection: "row", marginTop: 6 },
  commentActionButton: { marginRight: 12 },
  commentActionText: { color: COLORS.primaryDark, fontSize: 12, fontWeight: "600" },
  commentAuthor: { fontWeight: "600", color: COLORS.textPrimary, marginBottom: 4 },
  commentText: { color: COLORS.textSecondary },
  commentHint: { color: COLORS.textMuted, fontSize: 12, marginBottom: 12 },
  commentInputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  commentInput: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 10 },
  commentButton: { backgroundColor: COLORS.primary, padding: 10, borderRadius: 10 },
  calendarModalHeader: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 16 },
  activitiesCalendarModalHeader: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 16 },
  calendarHeaderContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  calendarHeaderIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  activitiesCalendarHeaderIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  calendarModalTitle: { fontSize: 20, fontWeight: "700", color: COLORS.background },
  calendarModalSubtitle: { fontSize: 13, color: "#d1fae5", marginTop: 2 },
  activitiesCalendarModalSubtitle: { fontSize: 13, color: COLORS.primaryLight, marginTop: 2 },
  calendarCloseButton: { position: "absolute", top: 16, right: 20 },
  calendarList: { maxHeight: 350, backgroundColor: COLORS.background },
  themeFilterContainer: { paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  themeFilterButton: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.divider, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  themeFilterText: { flex: 1, fontSize: 14, color: COLORS.textSecondary },
  themeModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  themeModalContainer: { backgroundColor: COLORS.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "60%" },
  themeModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  themeModalTitle: { fontSize: 18, fontWeight: "600", color: COLORS.textPrimary },
  themeModalList: { padding: 8 },
  themeModalItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  themeModalItemText: { fontSize: 16, color: COLORS.textSecondary },
  calendarEventsSection: { backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  calendarEventsTitle: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 12 },
  emptyEventState: { alignItems: "center", paddingVertical: 24, gap: 8 },
  calendarEventCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background, padding: 12, borderRadius: 16, marginBottom: 10, shadowColor: COLORS.textPrimary, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  eventThumbContainer: { marginRight: 12 },
  eventThumbCard: { width: 50, height: 50, borderRadius: 12 },
  eventThumbPlaceholder: { backgroundColor: COLORS.divider, alignItems: "center", justifyContent: "center" },
  eventInfo: { flex: 1 },
  eventTitle: { fontWeight: "600", color: COLORS.textPrimary },
  eventMeta: { color: COLORS.textMuted, fontSize: 12 },
  eventMetaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  eventThemeBadge: { backgroundColor: COLORS.warningLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 4 },
  eventThemeText: { fontSize: 10, fontWeight: "600", color: COLORS.warning },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  tagBusinessModal: { backgroundColor: COLORS.background, borderRadius: 16, width: "90%", maxHeight: "70%", overflow: "hidden" },
  searchInput: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  businessList: { maxHeight: 350, paddingHorizontal: 16 },
  businessListItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider, gap: 12 },
  businessItemAvatar: { width: 44, height: 44, borderRadius: 10, backgroundColor: COLORS.divider, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  businessItemImage: { width: 44, height: 44 },
  businessItemInitial: { fontSize: 18, fontWeight: "600", color: COLORS.primaryDark },
  businessItemInfo: { flex: 1 },
  businessItemName: { fontSize: 15, fontWeight: "600", color: COLORS.textPrimary },
  businessItemCategory: { fontSize: 13, color: COLORS.textMuted },
});

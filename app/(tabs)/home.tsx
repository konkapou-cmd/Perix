import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { CalendarList } from "react-native-calendars";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { Video } from "expo-av";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import AdaptiveImage from "../../components/AdaptiveImage";
import PostContent from "../../components/PostContent";
import FriendsCarousel from "../../components/FriendsCarousel";
import { useAuth } from "../../context/AuthContext";
import { useLocation } from "../../context/LocationContext";
import { useMapBounds } from "../../context/MapBoundsContext";
import {
  addPostComment,
  Artist,
  Business,
  createPost,
  createStory,
  deletePostComment,
  deletePost,
  deleteStory,
  EventItem,
  EventTheme,
  getPostComments,
  PostComment,
  getArtists,
  getEvents,
  getBusinesses,
  getActivities,
  ActivityItem,
  getPosts,
  getStories,
  getGroupedStories,
  getHomeFeed,
  getEventThemes,
  getMyFriends,
  Post,
  Story,
  GroupedStory,
  User,
  UserPublic,
  updatePostComment,
  updatePost,
  togglePostLike,
  uploadMedia,
  uploadImageToCloudinary,
  searchUsers,
  UploadProgress,
  reactToStory,
} from "../../lib/api";
import * as Location from "expo-location";
import UploadProgressModal from "../../components/UploadProgressModal";
import { translateCategory } from "../../lib/categoryTranslation";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user, sessionToken, activeIdentity } = useAuth();
  const { location: globalLocation, radiusKm } = useLocation();
  const { mapBounds, isMapInitialized, refreshKey: mapRefreshKey } = useMapBounds();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [groupedStories, setGroupedStories] = useState<GroupedStory[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [postText, setPostText] = useState("");
  const [tagResults, setTagResults] = useState<User[]>([]);
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);
  const [taggedBusinessId, setTaggedBusinessId] = useState<string | null>(null);
  const [taggedBusiness, setTaggedBusiness] = useState<Business | null>(null);
  const [showBusinessTagModal, setShowBusinessTagModal] = useState(false);
  const [businessSearchQuery, setBusinessSearchQuery] = useState("");
  const [taggedArtistId, setTaggedArtistId] = useState<string | null>(null);
  const [taggedArtist, setTaggedArtist] = useState<Artist | null>(null);
  const [showArtistTagModal, setShowArtistTagModal] = useState(false);
  const [artistSearchQuery, setArtistSearchQuery] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideo, setPostVideo] = useState<string | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);
  const [postMediaRatio, setPostMediaRatio] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [eventThemes, setEventThemes] = useState<EventTheme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string>("");
  const [showThemeFilter, setShowThemeFilter] = useState(false);
  const googleKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
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
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyIndex, setStoryIndex] = useState(0);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [currentStoryInGroup, setCurrentStoryInGroup] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [globalMuted, setGlobalMuted] = useState(false);
  const [friends, setFriends] = useState<UserPublic[]>([]);

  const shuffle = <T,>(items: T[] | undefined | null) =>
    items ? [...items].sort(() => Math.random() - 0.5) : [];

  // Sync with global location from context
  useEffect(() => {
    if (globalLocation) {
      setUserLocation({
        latitude: globalLocation.latitude,
        longitude: globalLocation.longitude,
      });
    }
  }, [globalLocation]);

  // Fallback: Get user location on mount if no global location
  useEffect(() => {
    if (globalLocation) return; // Skip if global location is available
    const requestLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        try {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        } catch (e) {
          console.log("Location error:", e);
        }
      }
    };
    requestLocation();
  }, [globalLocation]);

  const loadContent = useCallback(async () => {
    if (!sessionToken) return;
    // Only load content if map has been initialized
    if (!isMapInitialized || !mapBounds) return;
    
    try {
      // Load event themes
      try {
        const themes = await getEventThemes();
        setEventThemes(themes);
      } catch (e) {
        console.log("Failed to load event themes:", e);
      }
      
      // Load grouped stories for the new UI
      try {
        const grouped = await getGroupedStories(sessionToken);
        setGroupedStories(grouped);
      } catch (e) {
        console.log("Failed to load grouped stories:", e);
      }
      
      // Load friends for the carousel
      try {
        const friendsData = await getMyFriends(sessionToken);
        setFriends(friendsData);
      } catch (e) {
        console.log("Failed to load friends:", e);
      }
      
      // Use map bounds for filtering content
      const feed = await getHomeFeed(sessionToken, userLocation, radiusKm, mapBounds);
      setPosts(feed.posts);
      setStories(feed.stories);
      setEvents(shuffle(feed.events));
      setArtists(shuffle(feed.artists));
      setBusinesses(shuffle(feed.businesses));
      setActivities(shuffle(feed.activities || []));
    } catch (error) {
      // Fallback to individual API calls if feed fails
      console.log("Home feed error, falling back to individual calls", error);
      const [postData, storyData, eventData, artistData, businessData, activityData] =
        await Promise.all([
        getPosts(
          sessionToken,
          undefined,
          activeIdentity
            ? { type: activeIdentity.type, id: activeIdentity.id }
            : undefined
        ),
        getStories(sessionToken),
        getEvents(sessionToken),
        getArtists(sessionToken),
        getBusinesses(sessionToken),
        getActivities(sessionToken),
      ]);
      setPosts(postData);
      setStories(storyData);
      setEvents(shuffle(eventData));
      setArtists(shuffle(artistData));
      setBusinesses(shuffle(businessData));
      setActivities(shuffle(activityData));
    }
  }, [sessionToken, activeIdentity, userLocation, isMapInitialized, mapBounds, radiusKm]);

  useEffect(() => {
    if (!sessionToken) return;
    // Only load if map is initialized
    if (!isMapInitialized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadContent().finally(() => setLoading(false));
  }, [loadContent, sessionToken, isMapInitialized, mapRefreshKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContent();
    setRefreshing(false);
  };

  const pickImage = async () => {
    // Request permission first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common.permissionRequired') || 'Permission Required',
        t('home.mediaPermissionMessage') || 'Please allow access to your photo library to upload images.'
      );
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
      allowsEditing: true,
      aspect: [4, 5],
      exif: false,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      const uri = `data:image/jpeg;base64,${asset.base64}`;
      const ratio = asset.width && asset.height ? asset.width / asset.height : null;
      setPostMediaRatio(ratio);
      setPostImage(uri);
      setPostVideo(null);
      setPostVideoPreview(null);
    }
  };

  const MAX_VIDEO_SIZE_MB = 300;
  const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

  const pickVideo = async () => {
    // Request permission first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common.permissionRequired') || 'Permission Required',
        t('home.mediaPermissionMessage') || 'Please allow access to your photo library to upload videos.'
      );
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.5,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      const uri = asset.uri;
      
      // Check file size
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(
          t("common.error"),
          t("home.videoTooLarge") || `Video must be under ${MAX_VIDEO_SIZE_MB}MB. Your video is ${Math.round(asset.fileSize / 1024 / 1024)}MB.`
        );
        return;
      }
      
      const ratio = asset.width && asset.height ? asset.width / asset.height : null;
      setPostMediaRatio(ratio);
      setPostVideoPreview(uri);
      setPostImage(null);
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const uploaded = await uploadMedia(sessionToken, uri, "video", (progress) => {
            setUploadProgress(progress);
          });
          setPostVideo(uploaded);
          // Auto-hide after short delay on success
          setTimeout(() => {
            setShowUploadProgress(false);
            setUploadProgress(null);
          }, 1000);
        } catch (error) {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("home.uploadFailed"), t("home.pleaseTryAgain"));
          setPostVideo(null);
        }
      }
    }
  };

  const handleCreatePost = async () => {
    if (!sessionToken || (!postText.trim() && !postImage && !postVideo)) return;
    try {
      setPosting(true);
      
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      
      // Upload image to Cloudinary first if present
      if (postImage) {
        try {
          console.log("[Post] Uploading image to Cloudinary...");
          imageUrl = await uploadImageToCloudinary(sessionToken, postImage);
          console.log("[Post] Image uploaded:", imageUrl?.substring(0, 50));
        } catch (e) {
          console.error("[Post] Image upload failed:", e);
          // Fall back to base64 if upload fails
        }
      }
      
      // For videos, the upload already happened in pickVideo()
      // postVideo is already the Cloudinary URL, not a local file
      if (postVideo) {
        console.log("[Post] Using pre-uploaded video URL:", postVideo?.substring(0, 50));
        videoUrl = postVideo;
      }
      
      const actor = activeIdentity
        ? { type: activeIdentity.type, id: activeIdentity.id }
        : undefined;
      const businessId =
        activeIdentity?.type === "business" ? activeIdentity.id : undefined;
      
      const newPost = await createPost(
        sessionToken,
        postText.trim() || t("home.sharedAnUpdate"),
        imageUrl ? null : postImage, // Only send base64 if Cloudinary upload failed
        null, // No more video_base64
        businessId,
        actor,
        postMediaRatio || undefined,
        taggedUserIds,
        taggedBusinessId,
        taggedArtistId,
        imageUrl, // Send Cloudinary URL
        videoUrl  // Send video URL
      );
      setPosts([newPost, ...posts]);
      setPostText("");
      setPostImage(null);
      setPostVideo(null);
      setPostVideoPreview(null);
      setPostMediaRatio(null);
      setTaggedUserIds([]);
      setTagResults([]);
      setTaggedBusinessId(null);
      setTaggedBusiness(null);
      setTaggedArtistId(null);
      setTaggedArtist(null);
    } catch (e) {
      console.error("[Post] Create post failed:", e);
      Alert.alert(t('common.error'), t('home.postFailed') || 'Failed to create post');
    } finally {
      setPosting(false);
    }
  };

  const handleToggleLike = async (post: Post) => {
    if (!sessionToken) return;
    const actor = activeIdentity
      ? { type: activeIdentity.type, id: activeIdentity.id }
      : undefined;
    const updated = await togglePostLike(sessionToken, post.post_id, actor);
    setPosts((prev) =>
      prev.map((item) => (item.post_id === updated.post_id ? updated : item))
    );
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
    const actor = activeIdentity
      ? { type: activeIdentity.type, id: activeIdentity.id }
      : undefined;
    let updated: Post;
    if (editingCommentId) {
      updated = await updatePostComment(
        sessionToken,
        commentPost.post_id,
        editingCommentId,
        commentText.trim()
      );
    } else {
      updated = await addPostComment(
        sessionToken,
        commentPost.post_id,
        commentText.trim(),
        actor
      );
    }
    setPosts((prev) =>
      prev.map((item) => (item.post_id === updated.post_id ? updated : item))
    );
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
    const updated = await deletePostComment(
      sessionToken,
      commentPost.post_id,
      comment.comment_id
    );
    setPosts((prev) =>
      prev.map((item) => (item.post_id === updated.post_id ? updated : item))
    );
    const data = await getPostComments(sessionToken, commentPost.post_id);
    setComments(data);
  };

  const handleDeleteStory = async (storyId: string) => {
    if (!sessionToken) return;
    Alert.alert(t("home.deleteStory"), t("home.deleteStoryConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          await deleteStory(sessionToken, storyId);
          // Remove from flat stories list
          setStories((prev) => prev.filter((s) => s.story_id !== storyId));
          
          // Update grouped stories
          setGroupedStories((prev) => {
            const updated = prev.map((group) => ({
              ...group,
              stories: group.stories.filter((s) => s.story_id !== storyId),
              story_count: group.stories.filter((s) => s.story_id !== storyId).length,
            })).filter((group) => group.stories.length > 0);
            return updated;
          });
          
          // Check if we need to move to next group or close viewer
          const currentGroup = groupedStories[selectedGroupIndex];
          if (currentGroup) {
            const remainingStories = currentGroup.stories.filter((s) => s.story_id !== storyId);
            if (remainingStories.length === 0) {
              // Move to next group or close
              if (selectedGroupIndex + 1 < groupedStories.length) {
                setCurrentStoryInGroup(0);
              } else {
                setStoryViewerOpen(false);
              }
            } else if (currentStoryInGroup >= remainingStories.length) {
              // Current index is now out of bounds
              setCurrentStoryInGroup(remainingStories.length - 1);
            }
          }
        },
      },
    ]);
  };

  const readVideoAsDataUri = async (uri: string, mimeType: string) => {
    const useWebReader =
      Platform.OS === "web" || !FileSystem?.readAsStringAsync;
    if (useWebReader) {
      const response = await fetch(uri);
      const blob = await response.blob();
      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return dataUri;
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as any,
    });
    return `data:${mimeType};base64,${base64}`;
  };

  const openEditPost = (post: Post) => {
    setEditPost(post);
    setEditText(post.text);
    setEditImage(post.image_base64 || null);
    setEditVideo(post.video_url || null);
    setEditVideoPreview(post.video_url || null);
    setEditMediaRatio(post.media_ratio || null);
    setEditModal(true);
  };

  const pickEditImage = async () => {
    // Request permission first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common.permissionRequired') || 'Permission Required',
        t('home.mediaPermissionMessage') || 'Please allow access to your photo library.'
      );
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      const uri = `data:image/jpeg;base64,${asset.base64}`;
      const ratio = asset.width && asset.height ? asset.width / asset.height : null;
      setEditMediaRatio(ratio);
      setEditImage(uri);
      setEditVideo(null);
      setEditVideoPreview(null);
    }
  };

  const handlePostTextChange = async (value: string) => {
    setPostText(value);
    if (!sessionToken) return;
    const match = value.match(/@([\w\d_-]*)$/);
    if (!match) {
      setTagResults([]);
      return;
    }
    const query = match[1];
    if (!query) {
      setTagResults([]);
      return;
    }
    const friends = await searchUsers(sessionToken, query, true);
    let merged = friends;
    if (friends.length < 5) {
      const all = await searchUsers(sessionToken, query, false);
      merged = [...friends];
      all.forEach((user) => {
        if (!merged.find((item) => item.user_id === user.user_id)) {
          merged.push(user);
        }
      });
    }
    setTagResults(merged.slice(0, 6));
  };

  const handleSelectTag = (user: User) => {
    const updated = postText.replace(/@([\w\d_-]*)$/, `@${user.name} `);
    setPostText(updated);
    setTagResults([]);
    setTaggedUserIds((prev) =>
      prev.includes(user.user_id) ? prev : [...prev, user.user_id]
    );
  };

  const pickEditVideo = async () => {
    // Request permission first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common.permissionRequired') || 'Permission Required',
        t('home.mediaPermissionMessage') || 'Please allow access to your photo library.'
      );
      return;
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.5,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const ratio = asset.width && asset.height ? asset.width / asset.height : null;
      setEditMediaRatio(ratio);
      setEditVideoPreview(uri);
      setEditImage(null);
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const uploaded = await uploadMedia(sessionToken, uri, "video", (progress) => {
            setUploadProgress(progress);
          });
          setEditVideo(uploaded);
          setTimeout(() => {
            setShowUploadProgress(false);
            setUploadProgress(null);
          }, 1000);
        } catch (error) {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("home.uploadFailed"), t("home.pleaseTryAgain"));
          setEditVideo(null);
        }
      }
    }
  };

  const handleUpdatePost = async () => {
    if (!sessionToken || !editPost) return;
    const updated = await updatePost(sessionToken, editPost.post_id, {
      text: editText.trim() || editPost.text,
      image_base64: editImage || undefined,
      video_base64: editVideo || undefined,
      media_ratio: editMediaRatio || undefined,
    });
    setPosts((prev) =>
      prev.map((item) => (item.post_id === updated.post_id ? updated : item))
    );
    setEditModal(false);
    setEditMediaRatio(null);
  };

  const handleDeletePost = async (post: Post) => {
    if (!sessionToken) return;
    await deletePost(sessionToken, post.post_id);
    setPosts((prev) => prev.filter((item) => item.post_id !== post.post_id));
    setEditModal(false);
  };

  const openStoryViewer = (groupIndex: number) => {
    setSelectedGroupIndex(groupIndex);
    setCurrentStoryInGroup(0);
    setStoryViewerOpen(true);
  };

  const goToNextStory = () => {
    const currentGroup = groupedStories[selectedGroupIndex];
    if (!currentGroup) {
      setStoryViewerOpen(false);
      return;
    }
    
    // If there are more stories in the current group, go to next story
    if (currentStoryInGroup + 1 < currentGroup.stories.length) {
      setCurrentStoryInGroup(currentStoryInGroup + 1);
    } else {
      // Move to next user's stories
      if (selectedGroupIndex + 1 < groupedStories.length) {
        setSelectedGroupIndex(selectedGroupIndex + 1);
        setCurrentStoryInGroup(0);
      } else {
        setStoryViewerOpen(false);
      }
    }
  };

  const goToPrevStory = () => {
    // If there are previous stories in the current group, go to previous story
    if (currentStoryInGroup > 0) {
      setCurrentStoryInGroup(currentStoryInGroup - 1);
    } else {
      // Move to previous user's stories (last story)
      if (selectedGroupIndex > 0) {
        const prevGroup = groupedStories[selectedGroupIndex - 1];
        setSelectedGroupIndex(selectedGroupIndex - 1);
        setCurrentStoryInGroup(prevGroup.stories.length - 1);
      }
    }
  };

  // Get current story being viewed
  const getCurrentStory = () => {
    const currentGroup = groupedStories[selectedGroupIndex];
    if (!currentGroup) return null;
    return currentGroup.stories[currentStoryInGroup];
  };

  const getCurrentGroupInfo = () => {
    return groupedStories[selectedGroupIndex];
  };

  const openStoryPicker = () => {
    Alert.alert(t("home.createStory"), t("home.chooseSource"), [
      { text: t("home.camera"), onPress: () => router.push("/camera" as any) },
      { text: t("home.recordVideo"), onPress: () => router.push({ pathname: "/camera" as any, params: { mode: "video" } }) },
      { text: t("home.gallery"), onPress: () => handleCreateStory(false) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };


  const handleCreateStory = async (useCamera = false) => {
    if (!sessionToken) return;
    
    // Request appropriate permission
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('common.permissionRequired') || 'Permission Required',
          t('home.cameraPermissionMessage') || 'Please allow access to your camera.'
        );
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('common.permissionRequired') || 'Permission Required',
          t('home.mediaPermissionMessage') || 'Please allow access to your photo library.'
        );
        return;
      }
    }
    
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.5,
          base64: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.5,
          base64: true,
        });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const base64Uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const actor = activeIdentity
        ? { type: activeIdentity.type, id: activeIdentity.id }
        : undefined;
      const businessId =
        activeIdentity?.type === "business" ? activeIdentity.id : undefined;
      
      // Upload image to Cloudinary first
      let imageUrl: string | undefined;
      try {
        console.log("[Story] Uploading image to Cloudinary...");
        imageUrl = await uploadImageToCloudinary(sessionToken, base64Uri);
        console.log("[Story] Image uploaded:", imageUrl?.substring(0, 50));
      } catch (e) {
        console.error("[Story] Image upload failed, using base64:", e);
      }
      
      // Create story with Cloudinary URL (or fallback to base64)
      const story = await createStory(
        sessionToken, 
        imageUrl ? undefined : base64Uri, // Only use base64 if upload failed
        undefined, 
        businessId, 
        actor,
        imageUrl // Use Cloudinary URL if available
      );
      setStories([story, ...stories]);
      
      // Refresh grouped stories to include the new story
      try {
        const grouped = await getGroupedStories(sessionToken);
        setGroupedStories(grouped);
      } catch (e) {
        console.log("Failed to refresh grouped stories:", e);
      }
    }
  };


  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    events.forEach((event) => {
      const dateKey = event.start_time.split("T")[0];
      marks[dateKey] = { marked: true, dotColor: "#4c6fff" };
    });
    return marks;
  }, [events]);

  const eventsForDate = useMemo(() => {
    let filtered = events;
    if (calendarDate) {
      filtered = filtered.filter((event) => event.start_time.startsWith(calendarDate));
    }
    if (selectedTheme) {
      filtered = filtered.filter((event) => event.theme === selectedTheme);
    }
    return filtered;
  }, [calendarDate, events, selectedTheme]);

  const getThemeLabel = (slug: string) => {
    // Try to get translated theme label, fallback to API label or slug
    const translationKey = `events.themes.${slug}`;
    const translated = t(translationKey);
    // If translation exists and is not the key itself, use it
    if (translated && translated !== translationKey) {
      return translated;
    }
    // Fallback to API label or slug
    return eventThemes.find(t => t.slug === slug)?.label || slug;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4c6fff" />
      </SafeAreaView>
    );
  }

  // Show prompt to interact with map first if map is not initialized
  if (!isMapInitialized) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('home.greeting', { name: user?.name?.split(" ")[0] || "there" })}</Text>
          <Text style={styles.headerSubtitle}>{t('home.sharePrompt')}</Text>
        </View>
        <View style={styles.mapPromptContainer}>
          <View style={styles.mapPromptCard}>
            <View style={styles.mapPromptIconContainer}>
              <Ionicons name="map" size={48} color="#4c6fff" />
            </View>
            <Text style={styles.mapPromptTitle}>{t('home.setLocationTitle', { defaultValue: 'Set Your Area' })}</Text>
            <Text style={styles.mapPromptText}>
              {t('home.setLocationDescription', { defaultValue: 'To see content from businesses and artists, please first set your location area on the map.' })}
            </Text>
            <Pressable 
              style={styles.mapPromptButton}
              onPress={() => router.push('/(tabs)/locator')}
              data-testid="go-to-map-btn"
            >
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.mapPromptButtonText}>{t('home.goToMap', { defaultValue: 'Go to Map' })}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('home.greeting', { name: user?.name?.split(" ")[0] || "there" })}</Text>
        <Text style={styles.headerSubtitle}>{t('home.sharePrompt')}</Text>
      </View>

      {/* Events Carousel */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardTitle}>{t('home.events')}</Text>
          <View style={styles.sectionHeaderRight}>
            {(activeIdentity?.type === 'business' || activeIdentity?.type === 'artist') && (
              <Pressable 
                style={styles.addButton}
                onPress={() => {
                  if (activeIdentity?.type === 'business') {
                    router.push('/business-dashboard');
                  } else {
                    router.push('/artist-dashboard');
                  }
                }}
                data-testid="create-event-btn"
              >
                <Ionicons name="add" size={20} color="#4c6fff" />
              </Pressable>
            )}
            <Pressable onPress={() => setCalendarOpen(true)}>
              <Text style={styles.link}>{t('home.openCalendar')}</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {events.length === 0 ? (
            <View style={styles.storyEmpty}>
              <Text style={styles.storyEmptyText}>{t('home.noEvents')}</Text>
            </View>
          ) : (
            events.map((event) => (
              <Pressable
                key={event.event_id}
                style={styles.artistCard}
                onPress={() => router.push(`/event/${event.event_id}`)}
                data-testid={`event-card-${event.event_id}`}
              >
                <View style={styles.artistAvatar}>
                  {event.image_base64 ? (
                    <Image source={{ uri: event.image_base64 }} style={styles.artistAvatarImage} />
                  ) : (
                    <Ionicons name="calendar" size={20} color="#4c6fff" />
                  )}
                </View>
                <Text style={styles.artistName} numberOfLines={1}>{event.title}</Text>
                <Text style={styles.artistMeta}>{event.start_time.split("T")[0]}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {/* Activities Carousel */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardTitle}>{t('tabs.activities')}</Text>
          <Pressable onPress={() => router.push('/(tabs)/activities')}>
            <Text style={styles.link}>{t('home.openCalendar')}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {activities.length === 0 ? (
            <View style={styles.storyEmpty}>
              <Text style={styles.storyEmptyText}>{t('activities.noActivities')}</Text>
            </View>
          ) : (
            activities.map((activity) => (
              <Pressable
                key={activity.activity_id}
                style={styles.artistCard}
                onPress={() => router.push('/(tabs)/activities')}
                data-testid={`activity-card-${activity.activity_id}`}
              >
                <View style={styles.artistAvatar}>
                  {activity.image_base64 ? (
                    <Image source={{ uri: activity.image_base64 }} style={styles.artistAvatarImage} />
                  ) : (
                    <Ionicons name="people" size={20} color="#10b981" />
                  )}
                </View>
                <Text style={styles.artistName} numberOfLines={1}>{activity.title}</Text>
                <Text style={styles.artistMeta}>{activity.date}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {/* Unterhaltung (Entertainment) Carousel */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardTitle}>{t('home.entertainment')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.storyEmpty}>
            <Text style={styles.storyEmptyText}>{t('home.noEntertainment')}</Text>
          </View>
        </ScrollView>
      </View>

      {/* Artists Carousel */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardTitle}>{t('home.artists')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {artists.length === 0 ? (
            <View style={styles.storyEmpty}>
              <Text style={styles.storyEmptyText}>{t('home.noArtists')}</Text>
            </View>
          ) : (
            artists.map((artist) => (
              <Pressable
                key={artist.artist_id}
                style={styles.artistCard}
                onPress={() => router.push(`/artist/${artist.artist_id}`)}
              >
                <View style={styles.artistAvatar}>
                  {artist.profile_photo || artist.gallery_images?.[0] ? (
                    <Image
                      source={{
                        uri: artist.profile_photo || artist.gallery_images?.[0],
                      }}
                      style={styles.artistAvatarImage}
                    />
                  ) : (
                    <Ionicons name="musical-notes" size={20} color="#4c6fff" />
                  )}
                </View>
                <Text style={styles.artistName}>{artist.name}</Text>
                <Text style={styles.artistMeta}>{artist.town || ""}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {/* Businesses Carousel */}
      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.cardTitle}>{t('home.businesses')}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {businesses.length === 0 ? (
            <View style={styles.storyEmpty}>
              <Text style={styles.storyEmptyText}>{t('home.noBusinesses')}</Text>
            </View>
          ) : (
            businesses.map((business) => (
              <Pressable
                key={business.business_id}
                style={styles.artistCard}
                onPress={() => router.push(`/business/${business.business_id}`)}
              >
                <View style={styles.artistAvatar}>
                  {business.logo_image ? (
                    <Image source={{ uri: business.logo_image }} style={styles.artistAvatarImage} />
                  ) : (
                    <Ionicons name="business" size={20} color="#4c6fff" />
                  )}
                </View>
                <Text style={styles.artistName}>{business.name}</Text>
                <Text style={styles.artistMeta}>{translateCategory(business.subcategory, t)}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home.stories')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Pressable style={styles.storyAdd} onPress={openStoryPicker}>
            <Ionicons name="add-circle" size={22} color="#4c6fff" />
            <Text style={styles.storyAddText}>{t('home.addStory')}</Text>
          </Pressable>
          {groupedStories.length === 0 ? (
            <View style={styles.storyEmpty}>
              <Text style={styles.storyEmptyText}>{t('home.noStories')}</Text>
            </View>
          ) : (
            groupedStories.map((group, index) => (
              <Pressable
                key={group.user_id}
                style={styles.storyCard}
                onPress={() => openStoryViewer(index)}
                data-testid={`story-group-${group.user_id}`}
              >
                <View style={styles.storyImageContainer}>
                  {group.preview_image ? (
                    <Image source={{ uri: group.preview_image }} style={styles.storyImage} />
                  ) : (
                    <View style={[styles.storyImage, { backgroundColor: '#374151', justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="play-circle" size={32} color="#fff" />
                    </View>
                  )}
                  {group.story_count > 1 && (
                    <View style={styles.storyCountBadge}>
                      <Text style={styles.storyCountText}>{group.story_count}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.storyAuthor} numberOfLines={1}>
                  {group.actor_name}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>

      {/* Friends Carousel */}
      <FriendsCarousel 
        friends={friends}
        showAddButton={true}
        currentUserId={user?.user_id}
        currentUserName={user?.name}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home.createPost')}</Text>
          <Pressable
            style={styles.identityBadge}
            onPress={() => router.push("/(tabs)/profile")}
          >
            <Ionicons 
              name={
                activeIdentity?.type === "business" ? "business" : 
                activeIdentity?.type === "artist" ? "mic" : 
                "person-circle"
              } 
              size={16} 
              color={
                activeIdentity?.type === "business" ? "#10b981" : 
                activeIdentity?.type === "artist" ? "#8b5cf6" : 
                "#4c6fff"
              } 
            />
            <Text style={[
              styles.identityBadgeText,
              activeIdentity?.type === "business" && { color: "#10b981" },
              activeIdentity?.type === "artist" && { color: "#8b5cf6" },
            ]}>
              {t('home.postingAs', { name: activeIdentity?.name || user?.name || "User" })}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
          </Pressable>
        <TextInput
          style={styles.postInput}
          placeholder={t("home.writeSomething")}
          multiline
          value={postText}
          onChangeText={handlePostTextChange}
        />
        {tagResults.length > 0 ? (
          <View style={styles.tagDropdown}>
            {tagResults.map((tagUser) => (
              <Pressable
                key={tagUser.user_id}
                style={styles.tagItem}
                onPress={() => handleSelectTag(tagUser)}
              >
                <View style={styles.tagAvatar}>
                  {tagUser.profile_photo ? (
                    <Image
                      source={{ uri: tagUser.profile_photo }}
                      style={styles.tagAvatarImage}
                    />
                  ) : (
                    <Text style={styles.tagAvatarText}>
                      {tagUser.name?.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <Text style={styles.tagName}>{tagUser.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {postImage ? (
          <View style={styles.mediaPreviewContainer}>
            <AdaptiveImage
              uri={postImage}
              style={styles.postImagePreview}
              ratio={postMediaRatio || undefined}
            />
            <Pressable 
              style={styles.removeMediaButton}
              onPress={() => {
                setPostImage(null);
                setPostMediaRatio(null);
              }}
            >
              <Ionicons name="close-circle" size={28} color="#ef4444" />
            </Pressable>
          </View>
        ) : null}
        {postVideoPreview ? (
          <View style={styles.mediaPreviewContainer}>
            <AdaptiveVideo
              uri={postVideoPreview}
              style={styles.videoPreview}
              ratio={postMediaRatio || undefined}
            />
            <Pressable 
              style={styles.removeMediaButton}
              onPress={() => {
                setPostVideo(null);
                setPostVideoPreview(null);
                setPostMediaRatio(null);
              }}
            >
              <Ionicons name="close-circle" size={28} color="#ef4444" />
            </Pressable>
          </View>
        ) : null}
        {/* Tagged Business Badge - show above buttons */}
        {taggedBusiness && (
          <View style={styles.taggedBusinessRow}>
            <View style={styles.taggedBusinessBadge}>
              <Ionicons name="business" size={14} color="#4c6fff" />
              <Text style={styles.taggedBusinessText} numberOfLines={1}>
                {taggedBusiness.name}
              </Text>
              <Pressable onPress={() => { setTaggedBusinessId(null); setTaggedBusiness(null); }}>
                <Ionicons name="close-circle" size={16} color="#ef4444" />
              </Pressable>
            </View>
          </View>
        )}
        {/* Tagged Artist Badge */}
        {taggedArtist && (
          <View style={styles.taggedBusinessRow}>
            <View style={[styles.taggedBusinessBadge, { borderColor: '#8b5cf6' }]}>
              <Ionicons name="musical-notes" size={14} color="#8b5cf6" />
              <Text style={[styles.taggedBusinessText, { color: '#8b5cf6' }]} numberOfLines={1}>
                {taggedArtist.name}
              </Text>
              <Pressable onPress={() => { setTaggedArtistId(null); setTaggedArtist(null); }}>
                <Ionicons name="close-circle" size={16} color="#ef4444" />
              </Pressable>
            </View>
          </View>
        )}
        <View style={styles.postActionsRow}>
          {/* Media actions (Photo + Video merged) */}
          <View style={styles.actionGroup}>
            <Pressable style={styles.iconButton} onPress={pickImage}>
              <Ionicons name="image-outline" size={18} color="#4c6fff" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={pickVideo}>
              <Ionicons name="videocam-outline" size={18} color="#4c6fff" />
            </Pressable>
          </View>
          {/* Tag actions (Business + Artist merged) */}
          <View style={styles.actionGroup}>
            <Pressable style={styles.iconButton} onPress={() => setShowBusinessTagModal(true)}>
              <Ionicons name="business-outline" size={18} color="#10b981" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => setShowArtistTagModal(true)}>
              <Ionicons name="person-outline" size={18} color="#8b5cf6" />
            </Pressable>
          </View>
        </View>
        <Pressable
          style={[styles.postButton, posting && styles.buttonDisabled]}
          onPress={handleCreatePost}
          disabled={posting}
        >
          {posting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={18} color="#fff" />
              <Text style={styles.postButtonText}>{t('common.post')}</Text>
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.feedHeader}>
        <Text style={styles.cardTitle}>{t('home.latestPosts')}</Text>
      </View>
      {posts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{t('home.beFirstToShare')}</Text>
        </View>
      ) : (
        posts.map((post) => (
          <View key={post.post_id} style={styles.postCard}>
            <View style={styles.postHeader}>
              <Pressable
                style={styles.postAuthorRow}
                onPress={() => {
                  // Navigate based on actor_type
                  if (post.actor_type === "business" && post.actor_id) {
                    router.push(`/business/${post.actor_id}`);
                  } else if (post.actor_type === "artist" && post.actor_id) {
                    router.push(`/artist/${post.actor_id}`);
                  } else {
                    router.push(`/user/${post.user_id}`);
                  }
                }}
              >
                <View style={styles.avatar}>
                  {post.actor_avatar || post.author.profile_photo ? (
                    <Image
                      source={{
                        uri: (post.actor_avatar || post.author.profile_photo) as string,
                      }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Text style={styles.avatarText}>
                      {(post.actor_name || post.author.name)
                        ?.charAt(0)
                        .toUpperCase()}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={styles.postAuthor}>
                    {post.actor_name || post.author.name}
                  </Text>
                  <Text style={styles.postTime}>
                    {new Date(post.created_at).toLocaleString()}
                  </Text>
                </View>
              </Pressable>
              {user?.user_id === post.user_id ? (
                <Pressable onPress={() => openEditPost(post)}>
                  <Ionicons name="ellipsis-horizontal" size={18} color="#6b7280" />
                </Pressable>
              ) : null}
            </View>
            <PostContent 
              text={post.text}
              textStyle={styles.postBody}
              videoStyle={styles.videoPost}
              globalMuted={globalMuted}
              onMuteChange={(muted) => setGlobalMuted(muted)}
            />
            {/* Tagged Business Link */}
            {post.tagged_business_ids && post.tagged_business_ids.length > 0 && (
              <Pressable 
                style={styles.taggedBusinessLink}
                onPress={() => router.push(`/business/${post.tagged_business_ids![0]}`)}
              >
                <Ionicons name="business" size={14} color="#4c6fff" />
                <Text style={styles.taggedBusinessLinkText}>
                  {post.tagged_business?.name || t('home.taggedBusiness')}
                </Text>
              </Pressable>
            )}
            {post.image_base64 ? (
              <AdaptiveImage
                uri={post.image_base64}
                style={styles.postImage}
                ratio={post.media_ratio || undefined}
              />
            ) : null}
            {post.video_url ? (
              <AdaptiveVideo
                uri={post.video_url}
                style={styles.videoPost}
                ratio={post.media_ratio || undefined}
                autoPlay={true}
                isLooping={true}
                showMuteButton={true}
                initialMuted={true}
                pauseWhenNotVisible={true}
                onMuteChange={(muted) => setGlobalMuted(muted)}
              />
            ) : null}
            <View style={styles.postFooter}>
              <Pressable
                style={styles.footerItem}
                onPress={() => handleToggleLike(post)}
              >
                <Ionicons
                  name={post.liked_by_me ? "heart" : "heart-outline"}
                  size={16}
                  color={post.liked_by_me ? "#ef4444" : "#6b7280"}
                />
                <Text style={styles.footerText}>{post.likes_count} {t('common.likes')}</Text>
              </Pressable>
              <Pressable
                style={styles.footerItem}
                onPress={() => openComments(post)}
              >
                <Ionicons name="chatbubble-outline" size={16} color="#6b7280" />
                <Text style={styles.footerText}>{post.comments_count} {t('common.comments')}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
      </ScrollView>

      <Modal visible={calendarOpen} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('home.eventsCalendar')}</Text>
            <Pressable onPress={() => setCalendarOpen(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <CalendarList
              onDayPress={(day) => setCalendarDate(day.dateString)}
              markedDates={{
                ...markedDates,
                ...(calendarDate
                  ? { [calendarDate]: { selected: true, selectedColor: "#4c6fff" } }
                  : {}),
              }}
              pastScrollRange={3}
              futureScrollRange={6}
              style={{ maxHeight: 350 }}
            />
          </View>
          
          {/* Theme Filter */}
          <View style={styles.themeFilterContainer}>
            <Pressable 
              style={styles.themeFilterButton}
              onPress={() => setShowThemeFilter(true)}
              data-testid="calendar-theme-filter"
            >
              <Ionicons name="musical-notes" size={18} color="#4c6fff" />
              <Text style={styles.themeFilterText}>
                {selectedTheme ? getThemeLabel(selectedTheme) : t('events.allThemes')}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </Pressable>
          </View>
          
          <View style={styles.calendarEventsSection}>
            <Text style={styles.calendarEventsTitle}>
              {calendarDate ? t('home.eventsOn', { date: calendarDate }) : t('home.upcomingEvents')}
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {eventsForDate.length === 0 ? (
                <Text style={styles.emptyText}>{t('common.noEventsDate')}</Text>
              ) : (
                eventsForDate.map((event) => (
                  <Pressable
                    key={event.event_id}
                    style={styles.calendarEventRow}
                    onPress={() => {
                      setCalendarOpen(false);
                      router.push(`/event/${event.event_id}`);
                    }}
                  >
                    <View style={styles.eventDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      <Text style={styles.eventMeta}>
                        {event.business?.name || event.artist?.name || "Event"} · {event.start_time.split("T")[0]}
                        {event.theme && ` · ${getThemeLabel(event.theme)}`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Theme Filter Modal */}
      <Modal visible={showThemeFilter} animationType="slide" transparent>
        <View style={styles.themeModalOverlay}>
          <View style={styles.themeModalContainer}>
            <View style={styles.themeModalHeader}>
              <Text style={styles.themeModalTitle}>{t('events.filterByTheme')}</Text>
              <Pressable onPress={() => setShowThemeFilter(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>
            <ScrollView style={styles.themeModalList}>
              <Pressable
                style={styles.themeModalItem}
                onPress={() => {
                  setSelectedTheme("");
                  setShowThemeFilter(false);
                }}
              >
                <Text style={styles.themeModalItemText}>{t('events.allThemes')}</Text>
                {!selectedTheme && <Ionicons name="checkmark" size={20} color="#4c6fff" />}
              </Pressable>
              {eventThemes.map((theme) => (
                <Pressable
                  key={theme.slug}
                  style={styles.themeModalItem}
                  onPress={() => {
                    setSelectedTheme(theme.slug);
                    setShowThemeFilter(false);
                  }}
                >
                  <Text style={styles.themeModalItemText}>{getThemeLabel(theme.slug)}</Text>
                  {selectedTheme === theme.slug && <Ionicons name="checkmark" size={20} color="#4c6fff" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={commentModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('common.comments')}</Text>
            <Pressable onPress={() => setCommentModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.commentHint}>
              {t('home.postingAs', { name: activeIdentity?.name || user?.name || "User" })}
            </Text>
            {commentLoading ? (
              <ActivityIndicator color="#4c6fff" />
            ) : (
              comments.map((comment) => (
                <View key={comment.comment_id} style={styles.commentRow}>
                  <Pressable 
                    style={styles.commentAvatar}
                    onPress={() => {
                      if (comment.user_id) {
                        setCommentModal(false);
                        router.push(`/user/${comment.user_id}`);
                      }
                    }}
                  >
                    {comment.actor_avatar || comment.author?.profile_photo ? (
                      <Image
                        source={{
                          uri: (comment.actor_avatar || comment.author?.profile_photo) as string,
                        }}
                        style={styles.commentAvatarImage}
                      />
                    ) : (
                      <Text style={styles.commentAvatarText}>
                        {(comment.actor_name || comment.author?.name || "U")
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    )}
                  </Pressable>
                  <View style={styles.commentBody}>
                    <Pressable
                      onPress={() => {
                        if (comment.user_id) {
                          setCommentModal(false);
                          router.push(`/user/${comment.user_id}`);
                        }
                      }}
                    >
                      <Text style={[styles.commentAuthor, { color: '#4c6fff' }]}>
                        {comment.actor_name || comment.author?.name}
                      </Text>
                    </Pressable>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    {comment.user_id === user?.user_id ? (
                      <View style={styles.commentActions}>
                        <Pressable
                          onPress={() => handleEditComment(comment)}
                          style={styles.commentActionButton}
                        >
                          <Text style={styles.commentActionText}>{t('common.edit')}</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteComment(comment)}
                          style={styles.commentActionButton}
                        >
                          <Text style={styles.commentActionText}>{t('common.delete')}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
          <View style={styles.commentInputRow}>
            <TextInput
              placeholder={t('home.addComment')}
              value={commentText}
              onChangeText={setCommentText}
              style={styles.commentInput}
            />
            <Pressable style={styles.commentButton} onPress={handleAddComment}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={editModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('home.editPost')}</Text>
            <Pressable onPress={() => setEditModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput
              value={editText}
              onChangeText={setEditText}
              style={[styles.modalInput, styles.modalTextarea]}
              multiline
            />
            {editImage ? (
              <AdaptiveImage
                uri={editImage}
                style={styles.postImagePreview}
                ratio={editMediaRatio || undefined}
              />
            ) : null}
            {editVideoPreview ? (
              <AdaptiveVideo
                uri={editVideoPreview}
                style={styles.videoPreview}
                ratio={editMediaRatio || undefined}
              />
            ) : null}
            <View style={styles.postActions}>
              <Pressable style={styles.iconButton} onPress={pickEditImage}>
                <Ionicons name="image-outline" size={18} color="#4c6fff" />
                <Text style={styles.iconButtonText}>{t('common.photo')}</Text>
              </Pressable>
              <Pressable style={styles.iconButton} onPress={pickEditVideo}>
                <Ionicons name="videocam-outline" size={18} color="#4c6fff" />
                <Text style={styles.iconButtonText}>{t('common.video')}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.primaryButton} onPress={handleUpdatePost}>
              <Text style={styles.primaryButtonText}>{t('home.saveChanges')}</Text>
            </Pressable>
            {editPost ? (
              <Pressable
                style={[styles.secondaryButton, styles.deleteButton]}
                onPress={() => handleDeletePost(editPost)}
              >
                <Text style={styles.deleteButtonText}>{t('home.deletePost')}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={storyViewerOpen} animationType="fade">
        <SafeAreaView style={styles.storyViewerContainer}>
          <View style={styles.storyViewerHeader}>
            <Text style={styles.storyViewerTitle}>{t('common.stories')}</Text>
            <Pressable onPress={() => setStoryViewerOpen(false)}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
          </View>
          {getCurrentGroupInfo() && getCurrentStory() ? (
            <View style={styles.storyViewerBody}>
              {/* Progress bar for stories in this group */}
              <View style={styles.storyProgressContainer}>
                {getCurrentGroupInfo()?.stories.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.storyProgressBar,
                      idx === currentStoryInGroup && styles.storyProgressBarActive,
                      idx < currentStoryInGroup && styles.storyProgressBarViewed,
                    ]}
                  />
                ))}
              </View>
              
              <View style={styles.storyViewerMeta}>
                <View style={styles.storyViewerAvatar}>
                  {getCurrentGroupInfo()?.actor_avatar ? (
                    <Image
                      source={{ uri: getCurrentGroupInfo()?.actor_avatar || '' }}
                      style={styles.storyViewerAvatarImage}
                    />
                  ) : (
                    <Text style={styles.storyViewerAvatarText}>
                      {(getCurrentGroupInfo()?.actor_name || "U").charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View>
                  <Text style={styles.storyViewerName}>
                    {getCurrentGroupInfo()?.actor_name}
                  </Text>
                  <Text style={styles.storyViewerTime}>
                    {currentStoryInGroup + 1} / {getCurrentGroupInfo()?.story_count}
                  </Text>
                </View>
              </View>
              {/* Story Media - Support both images and videos with URL or base64 */}
              {getCurrentStory()?.video_url ? (
                <Video
                  source={{ uri: getCurrentStory()?.video_url }}
                  style={styles.storyViewerImage}
                  useNativeControls={false}
                  shouldPlay
                  isLooping
                  isMuted={globalMuted}
                />
              ) : (
                <Image
                  source={{ uri: getCurrentStory()?.image_url || getCurrentStory()?.image_base64 }}
                  style={styles.storyViewerImage}
                />
              )}
              <View style={styles.storyViewerControls}>
                <Pressable style={styles.storyControl} onPress={goToPrevStory}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </Pressable>
                {getCurrentStory()?.user_id === user?.user_id && (
                  <Pressable
                    style={styles.storyDeleteButton}
                    onPress={() => {
                      const story = getCurrentStory();
                      if (story) handleDeleteStory(story.story_id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#fff" />
                  </Pressable>
                )}
                <Pressable style={styles.storyControl} onPress={goToNextStory}>
                  <Ionicons name="chevron-forward" size={24} color="#fff" />
                </Pressable>
              </View>
              
              {/* Story Reactions */}
              {getCurrentStory()?.user_id !== user?.user_id && (
                <View style={styles.storyReactionsContainer}>
                  <Text style={styles.storyReactionsLabel}>{t('story.react') || 'React'}</Text>
                  <View style={styles.storyReactionsRow}>
                    {['❤️', '🔥', '😍', '😂', '😮', '👏'].map((emoji) => (
                      <Pressable
                        key={emoji}
                        style={styles.storyReactionButton}
                        onPress={async () => {
                          const story = getCurrentStory();
                          if (story && sessionToken) {
                            try {
                              await reactToStory(sessionToken, story.story_id, emoji);
                              Alert.alert(
                                t('story.reactionSent') || 'Reaction Sent!',
                                `${emoji} ${t('story.reactionSentDesc') || 'sent to'} ${getCurrentGroupInfo()?.actor_name}`
                              );
                            } catch (e) {
                              console.log('Failed to react to story:', e);
                            }
                          }
                        }}
                      >
                        <Text style={styles.storyReactionEmoji}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* Business Tag Modal */}
      <Modal visible={showBusinessTagModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.tagBusinessModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('home.selectBusiness')}</Text>
              <Pressable onPress={() => setShowBusinessTagModal(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder={t('home.searchBusiness')}
              value={businessSearchQuery}
              onChangeText={setBusinessSearchQuery}
            />
            <ScrollView style={styles.businessList} keyboardShouldPersistTaps="handled">
              {businesses
                .filter((b) => b.name.toLowerCase().includes(businessSearchQuery.toLowerCase()))
                .map((business) => (
                  <Pressable
                    key={business.business_id}
                    style={styles.businessListItem}
                    onPress={() => {
                      setTaggedBusinessId(business.business_id);
                      setTaggedBusiness(business);
                      setShowBusinessTagModal(false);
                      setBusinessSearchQuery("");
                    }}
                  >
                    <View style={styles.businessItemAvatar}>
                      {business.logo_image ? (
                        <Image source={{ uri: business.logo_image }} style={styles.businessItemImage} />
                      ) : (
                        <Text style={styles.businessItemInitial}>
                          {business.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.businessItemInfo}>
                      <Text style={styles.businessItemName}>{business.name}</Text>
                      <Text style={styles.businessItemCategory}>{business.address}</Text>
                    </View>
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Artist Tag Modal */}
      <Modal visible={showArtistTagModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.tagBusinessModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('home.selectArtist')}</Text>
              <Pressable onPress={() => setShowArtistTagModal(false)}>
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>
            <TextInput
              style={styles.searchInput}
              placeholder={t('home.searchArtist')}
              value={artistSearchQuery}
              onChangeText={setArtistSearchQuery}
            />
            <ScrollView style={styles.businessList} keyboardShouldPersistTaps="handled">
              {artists
                .filter((a) => a.name.toLowerCase().includes(artistSearchQuery.toLowerCase()))
                .map((artist) => (
                  <Pressable
                    key={artist.artist_id}
                    style={styles.businessListItem}
                    onPress={() => {
                      setTaggedArtistId(artist.artist_id);
                      setTaggedArtist(artist);
                      setShowArtistTagModal(false);
                      setArtistSearchQuery("");
                    }}
                  >
                    <View style={[styles.businessItemAvatar, { borderColor: '#8b5cf6' }]}>
                      {artist.profile_photo || artist.gallery_images?.[0] ? (
                        <Image source={{ uri: artist.profile_photo || artist.gallery_images?.[0] }} style={styles.businessItemImage} />
                      ) : (
                        <Ionicons name="musical-notes" size={20} color="#8b5cf6" />
                      )}
                    </View>
                    <View style={styles.businessItemInfo}>
                      <Text style={styles.businessItemName}>{artist.name}</Text>
                      <Text style={styles.businessItemCategory}>{artist.genres?.join(', ') || artist.town}</Text>
                    </View>
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <UploadProgressModal visible={showUploadProgress} progress={uploadProgress} />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fb",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#f5f6fb",
    alignItems: "center",
    justifyContent: "center",
  },
  // Map prompt styles for when map is not initialized
  mapPromptContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: "center",
  },
  mapPromptCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: "100%",
    shadowColor: "#4c6fff",
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  mapPromptIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  mapPromptTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },
  mapPromptText: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  mapPromptButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4c6fff",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    gap: 10,
    shadowColor: "#4c6fff",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  mapPromptButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  header: {
    padding: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtitle: {
    marginTop: 6,
    color: "#6b7280",
  },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    shadowColor: "#111827",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
  },
  link: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  calendarEventsSection: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  calendarEventsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  calendarEventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 12,
  },
  eventThumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    marginRight: 10,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4c6fff",
    marginRight: 10,
  },
  eventTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  eventMeta: {
    color: "#6b7280",
    fontSize: 12,
  },
  // Vertical events/activities list styles
  eventsList: {
    gap: 8,
  },
  eventListItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  eventListThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  eventListThumbImage: {
    width: "100%",
    height: "100%",
  },
  eventListContent: {
    flex: 1,
  },
  eventListTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  eventListMeta: {
    fontSize: 11,
    color: "#6b7280",
  },
  artistCard: {
    width: 140,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#f3f5ff",
    marginRight: 12,
    alignItems: "center",
  },
  artistAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  artistAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  artistName: {
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
  },
  artistMeta: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "center",
  },
  storyAdd: {
    width: 80,
    height: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbe2ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    backgroundColor: "#f3f5ff",
  },
  storyAddText: {
    marginTop: 6,
    fontSize: 12,
    color: "#4c6fff",
  },
  storyCard: {
    width: 80,
    marginRight: 12,
  },
  storyImageContainer: {
    position: "relative",
    width: 80,
    height: 110,
  },
  storyImage: {
    width: 80,
    height: 110,
    borderRadius: 16,
  },
  storyCountBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#4c6fff",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  storyCountText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  storyAuthor: {
    marginTop: 6,
    fontSize: 11,
    color: "#6b7280",
    textAlign: "center",
  },
  storyEmpty: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  storyEmptyText: {
    color: "#9ca3af",
  },
  postInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    textAlignVertical: "top",
    fontSize: 14,
    color: "#111827",
  },
  tagDropdown: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 8,
    marginTop: 8,
  },
  tagItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  tagAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  tagAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  tagAvatarText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  tagName: {
    color: "#111827",
    fontWeight: "600",
  },
  postImagePreview: {
    marginTop: 12,
    width: "100%",
    borderRadius: 12,
  },
  postActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  },
  postActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12,
  },
  actionGroup: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 4,
    gap: 2,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  iconButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 4,
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: "auto",
  },
  postButton: {
    flexDirection: "row",
    backgroundColor: "#4c6fff",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    gap: 8,
    shadowColor: "#4c6fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  postButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  mediaPreviewContainer: {
    position: "relative",
    width: "100%",
    marginBottom: 12,
  },
  removeMediaButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 14,
  },
  taggedBusinessRow: {
    marginBottom: 8,
  },
  taggedBusinessBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    alignSelf: "flex-start",
    gap: 6,
  },
  taggedBusinessText: {
    color: "#4c6fff",
    fontSize: 13,
    fontWeight: "500",
    maxWidth: 150,
  },
  taggedBusinessLink: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eff6ff",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    alignSelf: "flex-start",
    marginTop: 8,
    marginBottom: 8,
    gap: 6,
  },
  taggedBusinessLinkText: {
    color: "#4c6fff",
    fontSize: 13,
    fontWeight: "600",
  },
  identityBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  identityBadgeText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 6,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  deleteButton: {
    borderColor: "#fecaca",
  },
  deleteButtonText: {
    color: "#ef4444",
    fontWeight: "600",
  },
  storyViewerContainer: {
    flex: 1,
    backgroundColor: "#111827",
  },
  storyViewerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  storyViewerTitle: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  storyViewerBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  storyViewerMeta: {
    position: "absolute",
    top: 24,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 2,
  },
  storyViewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  storyViewerAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  storyViewerAvatarText: {
    color: "#fff",
    fontWeight: "600",
  },
  storyViewerName: {
    color: "#fff",
    fontWeight: "600",
  },
  storyViewerTime: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  storyProgressContainer: {
    position: "absolute",
    top: 8,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 4,
    zIndex: 3,
  },
  storyProgressBar: {
    flex: 1,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  },
  storyProgressBarActive: {
    backgroundColor: "#4c6fff",
  },
  storyProgressBarViewed: {
    backgroundColor: "#fff",
  },
  storyViewerImage: {
    width: "100%",
    height: "80%",
    resizeMode: "cover",
  },
  storyViewerControls: {
    position: "absolute",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
  },
  storyControl: {
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 20,
  },
  storyDeleteButton: {
    padding: 10,
    backgroundColor: "rgba(239,68,68,0.8)",
    borderRadius: 20,
  },
  storyReactionsContainer: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 20,
  },
  storyReactionsLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginBottom: 8,
  },
  storyReactionsRow: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 30,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  storyReactionButton: {
    padding: 8,
  },
  storyReactionEmoji: {
    fontSize: 24,
  },
  secondaryButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  modalBody: {
    padding: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  modalTextarea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  sectionLabel: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  optionText: {
    marginLeft: 8,
    color: "#111827",
  },
  artistChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#eef2ff",
    marginRight: 8,
  },
  artistChipText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  commentRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  commentAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentAvatarText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  commentBody: {
    flex: 1,
  },
  commentActions: {
    flexDirection: "row",
    marginTop: 6,
  },
  commentActionButton: {
    marginRight: 12,
  },
  commentActionText: {
    color: "#4c6fff",
    fontSize: 12,
    fontWeight: "600",
  },
  commentAuthor: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  commentText: {
    color: "#374151",
  },
  commentHint: {
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 12,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  commentButton: {
    backgroundColor: "#4c6fff",
    padding: 10,
    borderRadius: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  feedHeader: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  emptyState: {
    marginHorizontal: 16,
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: {
    color: "#9ca3af",
  },
  postCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    padding: 16,
    shadowColor: "#111827",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  postAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    fontWeight: "600",
    color: "#4c6fff",
  },
  postAuthor: {
    fontWeight: "600",
    color: "#111827",
  },
  postTime: {
    fontSize: 12,
    color: "#9ca3af",
  },
  postBody: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 12,
  },
  postImage: {
    width: "100%",
    borderRadius: 14,
    marginBottom: 12,
  },
  videoPreview: {
    width: "100%",
    borderRadius: 14,
    marginBottom: 12,
  },
  videoPost: {
    width: "100%",
    borderRadius: 14,
    marginBottom: 12,
  },
  postFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    color: "#6b7280",
    fontSize: 12,
  },
  // Theme filter styles
  themeFilterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  themeFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  themeFilterText: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  themeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  themeModalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
  },
  themeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  themeModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  themeModalList: {
    padding: 8,
  },
  themeModalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  themeModalItemText: {
    fontSize: 16,
    color: "#374151",
  },
  // Business tagging styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  tagBusinessModal: {
    backgroundColor: "#fff",
    borderRadius: 16,
    width: "90%",
    maxHeight: "70%",
    overflow: "hidden",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  businessList: {
    maxHeight: 350,
    paddingHorizontal: 16,
  },
  businessListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 12,
  },
  businessItemAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  businessItemImage: {
    width: 44,
    height: 44,
  },
  businessItemInitial: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4c6fff",
  },
  businessItemInfo: {
    flex: 1,
  },
  businessItemName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  businessItemCategory: {
    fontSize: 13,
    color: "#6b7280",
  },
});

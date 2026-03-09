import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import AdaptiveImage from "../../components/AdaptiveImage";
import {
  BusinessDetail,
  Post,
  PostComment,
  ChatMessage,
  EventItem,
  addPostComment,
  createPost,
  createStory,
  createEvent,
  deletePostComment,
  deleteEvent,
  getBusinessDetail,
  getBusinessFanGallery,
  getCommonFriends,
  getEventMessages,
  getPostComments,
  toggleBusinessFavorite,
  updatePostComment,
  sendEventMessage,
  toggleFriend,
  togglePostLike,
  updateEvent,
  updateBusiness,
  uploadMedia,
  UploadProgress,
  initiateCall,
  reportBusiness,
  ProfileTheme,
} from "../../lib/api";
import { translateCategory, translateCategoryObject } from "../../lib/categoryTranslation";
import { useAuth } from "../../context/AuthContext";
import { useSafeNavigation } from "../../hooks/useSafeNavigation";
import UploadProgressModal from "../../components/UploadProgressModal";
import BusinessMap from "../../components/BusinessMap";

// Video size validation helper - no limits, chunked uploads handle any size
const ensureVideoSize = async (uri: string): Promise<boolean> => {
  // No size limits - chunked uploads handle files of any size
  return true;
};

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

const NIGHTLIFE_ROOTS = ["culture-entertainment", "food-drink", "nightlife"];

// Days of week for opening hours
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Helper function to format opening hours
const formatOpeningHours = (openingHours: any): string => {
  if (!openingHours?.schedule) return "";
  
  const schedule = openingHours.schedule;
  const lines: string[] = [];
  
  DAYS.forEach(day => {
    const dayData = schedule[day];
    if (dayData && dayData.enabled && dayData.periods?.length > 0) {
      const periods = dayData.periods.map((p: any) => `${p.open}-${p.close}`).join(", ");
      lines.push(`${day}: ${periods}`);
    } else if (dayData && !dayData.enabled) {
      lines.push(`${day}: Closed`);
    }
  });
  
  return lines.length > 0 ? lines.join("\n") : "";
};

export default function BusinessDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { safeGoBack, router } = useSafeNavigation();
  const { sessionToken, activeIdentity, setActiveIdentity, user } = useAuth();
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventModal, setEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  const [businessPosts, setBusinessPosts] = useState<Post[]>([]);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideo, setPostVideo] = useState<string | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);
  const [postMediaRatio, setPostMediaRatio] = useState<number | null>(null);
  const [commentModal, setCommentModal] = useState(false);
  const [commentPost, setCommentPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [eventChatModal, setEventChatModal] = useState(false);
  const [eventChatEvent, setEventChatEvent] = useState<EventItem | null>(null);
  const [eventChatMessages, setEventChatMessages] = useState<ChatMessage[]>([]);
  const [eventChatText, setEventChatText] = useState("");
  const [friendList, setFriendList] = useState<
    { user_id: string; name: string; profile_photo?: string | null }[]
  >([]);
  const [isFriend, setIsFriend] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [editBusinessModal, setEditBusinessModal] = useState(false);
  const [businessForm, setBusinessForm] = useState({
    name: "",
    description: "",
    phone: "",
    website: "",
    email: "",
    social_links: "",
    tags: "",
    logo_image: "",
    cover_image: "",
    gallery_images: [] as string[],
    gallery_videos: [] as string[],
  });
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { description: string; place_id: string }[]
  >([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    location: "",
    image_base64: "",
  });
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  
  // Story and Media Viewer State
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  
  // Fan Gallery State
  const [fanGalleryPosts, setFanGalleryPosts] = useState<Post[]>([]);
  
  // Report State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  // Get theme colors from business profile (with defaults)
  const businessTheme = useMemo(() => {
    const theme = detail?.business?.theme;
    return {
      backgroundColor: theme?.background_color || '#ffffff',
      primaryColor: theme?.primary_color || '#4c6fff',
      secondaryColor: theme?.secondary_color || '#f3f4f6',
      textColor: theme?.text_color || '#111827',
      cardColor: theme?.card_color || theme?.secondary_color || '#f9fafb',
      gradientStart: theme?.gradient_start || null,
      gradientEnd: theme?.gradient_end || null,
      useGradient: theme?.use_gradient || false,
      hasCustomTheme: !!theme?.background_color,
    };
  }, [detail?.business?.theme]);

  const openStoryViewer = (index: number) => {
    setCurrentStoryIndex(index);
    setStoryViewerVisible(true);
  };

  const openImageViewer = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setImageViewerVisible(true);
  };

  const openVideoViewer = (videoUrl: string) => {
    setSelectedVideo(videoUrl);
    setVideoViewerVisible(true);
  };

  const navigateStory = (direction: 'prev' | 'next') => {
    const stories = detail?.stories || [];
    if (direction === 'next' && currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
    } else if (direction === 'prev' && currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else {
      setStoryViewerVisible(false);
    }
  };

  const googleKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  const loadDetail = useCallback(async () => {
    if (!sessionToken || !id) return;
    setLoading(true);
    try {
      const data = await getBusinessDetail(
        sessionToken,
        id,
        activeIdentity
          ? { type: activeIdentity.type, id: activeIdentity.id }
          : undefined
      );
      setDetail(data);
      setFavoritesCount(data.business.favorites_count || 0);
      setIsFavorited(data.is_favorited);
      setBusinessPosts(data.posts || []);
      
      // Load friends data separately - don't fail if this fails
      if (data.business.owner_id) {
        try {
          const friendsData = await getCommonFriends(
            sessionToken,
            data.business.owner_id
          );
          setFriendList(friendsData.common);
          setIsFriend(friendsData.is_friend);
        } catch (e) {
          console.log("Friends data fetch failed:", e);
        }
      }
      
      // Load fan gallery separately
      try {
        const fanPosts = await getBusinessFanGallery(sessionToken, id);
        setFanGalleryPosts(fanPosts);
      } catch (e) {
        console.log("Fan gallery fetch failed:", e);
      }
    } catch (error) {
      console.error("Failed to load business detail:", error);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, id, activeIdentity]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!googleKey || addressQuery.length < 3) {
        setSuggestions([]);
        return;
      }
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        addressQuery
      )}&key=${googleKey}`;
      const response = await fetch(url);
      const data = await response.json();
      setSuggestions(data.predictions || []);
    }, 400);
    return () => clearTimeout(timer);
  }, [addressQuery, googleKey]);

  const canCreateEvent = useMemo(() => {
    if (!detail) return false;
    return (
      detail.is_owner &&
      detail.business.enabled_modules?.events &&
      NIGHTLIFE_ROOTS.includes(detail.business.root_category)
    );
  }, [detail]);

  const openNewEvent = () => {
    setEditingEventId(null);
    setForm({
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      image_base64: "",
    });
    setImagePreview(null);
    setAddressQuery("");
    setEventModal(true);
  };

  const openEditEvent = (event: any) => {
    setEditingEventId(event.event_id);
    const date = event.start_time.split("T")[0];
    const time = event.start_time.split("T")[1]?.slice(0, 5) || "";
    setForm({
      title: event.title,
      description: event.description || "",
      date,
      time,
      location: event.location || "",
      image_base64: event.image_base64,
    });
    setImagePreview(event.image_base64);
    setAddressQuery(event.location || "");
    setEventModal(true);
  };

  const handlePickEventImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setForm((prev) => ({ ...prev, image_base64: uri }));
      setImagePreview(uri);
    }
  };

  const handlePlaceSelect = async (suggestion: {
    description: string;
    place_id: string;
  }) => {
    setAddressQuery(suggestion.description);
    setSuggestions([]);
    setForm((prev) => ({ ...prev, location: suggestion.description }));
  };

  const saveEvent = async () => {
    if (!sessionToken || !detail || !form.title || !form.date || !form.time) return;
    if (!form.image_base64) return;
    const [year, month, day] = form.date.split("-").map(Number);
    const [hour, minute] = form.time.split(":").map(Number);
    const start = new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0));
    if (editingEventId) {
      const updated = await updateEvent(sessionToken, editingEventId, {
        title: form.title,
        description: form.description || undefined,
        image_base64: form.image_base64,
        start_time: start.toISOString(),
        location: form.location || undefined,
      });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              events: prev.events.map((event) =>
                event.event_id === updated.event_id ? updated : event
              ),
            }
          : prev
      );
    } else {
      const created = await createEvent(sessionToken, {
        business_id: detail.business.business_id,
        title: form.title,
        description: form.description || undefined,
        image_base64: form.image_base64,
        start_time: start.toISOString(),
        location: form.location || detail.business.address,
      });
      setDetail((prev) =>
        prev ? { ...prev, events: [created, ...prev.events] } : prev
      );
    }
    setEventModal(false);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!sessionToken) return;
    await deleteEvent(sessionToken, eventId);
    setDetail((prev) =>
      prev
        ? { ...prev, events: prev.events.filter((event) => event.event_id !== eventId) }
        : prev
    );
  };

  // WhatsApp share for events
  const shareEventToWhatsApp = async (event: EventItem) => {
    const eventDate = new Date(event.start_time).toLocaleDateString();
    const eventTime = new Date(event.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const location = event.location || "";
    
    // Use /share/ prefix for public deep links
    const eventUrl = `${BACKEND_URL?.replace('/api', '')}/share/event/${event.event_id}`;
    
    const message = `${t("events.invitationMessage", { 
      title: event.title, 
      organizer: detail?.business.name || "",
      date: eventDate,
      time: eventTime,
      location 
    })}\n\n${t("events.rsvpHere")}: ${eventUrl}`;
    
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    
    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({ message });
      }
    } catch (error) {
      await Share.share({ message });
    }
  };

  const openEventChat = async (event: EventItem) => {
    if (!sessionToken) return;
    setEventChatEvent(event);
    const messages = await getEventMessages(sessionToken, event.event_id);
    setEventChatMessages(messages);
    setEventChatModal(true);
  };

  // Handle report business
  const handleReportBusiness = async () => {
    if (!sessionToken || !id || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      await reportBusiness(sessionToken, id as string, reportReason.trim());
      setReportModalVisible(false);
      setReportReason("");
      Alert.alert(
        t("userProfile.reportSubmitted") || "Report Submitted",
        t("businessProfile.reportMessage") || "Thank you for your report. Our team will review it shortly.",
        [{ text: t("common.ok"), onPress: () => safeGoBack() }]
      );
    } catch (error: any) {
      console.error("Failed to report business:", error);
      Alert.alert(t("common.error"), error.message || t("common.error"));
    } finally {
      setReportLoading(false);
    }
  };

  const sendEventChat = async () => {
    if (!sessionToken || !eventChatEvent || !eventChatText.trim()) return;
    const message = await sendEventMessage(
      sessionToken,
      eventChatEvent.event_id,
      eventChatText.trim()
    );
    setEventChatMessages((prev) => [...prev, message]);
    setEventChatText("");
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

  const handleToggleFavorite = async () => {
    if (!sessionToken || !detail) return;
    const updated = await toggleBusinessFavorite(
      sessionToken,
      detail.business.business_id
    );
    setFavoritesCount(updated.favorites_count);
    setIsFavorited(updated.is_favorited);
  };

  const handleToggleFriend = async () => {
    if (!sessionToken || !detail?.business.owner_id) return;
    const result = await toggleFriend(sessionToken, detail.business.owner_id);
    setIsFriend(result.is_friend);
    const friendsData = await getCommonFriends(
      sessionToken,
      detail.business.owner_id
    );
    setFriendList(friendsData.common);
  };

  const pickPostImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
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

  const pickPostVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      const uri = asset.uri;
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
          setTimeout(() => {
            setShowUploadProgress(false);
            setUploadProgress(null);
          }, 1000);
        } catch (error) {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
          setPostVideo(null);
        }
      }
    }
  };

  const handleCreateBusinessPost = async () => {
    if (!sessionToken || !detail) return;
    if (!postText.trim() && !postImage && !postVideo) return;
    const newPost = await createPost(
      sessionToken,
      postText.trim() || t("business.shareUpdate"),
      postImage,
      postVideo,
      detail.business.business_id,
      { type: "business", id: detail.business.business_id },
      postMediaRatio || undefined
    );
    setBusinessPosts([newPost, ...businessPosts]);
    setPostText("");
    setPostImage(null);
    setPostVideo(null);
    setPostVideoPreview(null);
    setPostMediaRatio(null);
  };

  const handleAddStory = async (useCamera?: boolean) => {
    if (!sessionToken || !detail) return;
    const picker = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;
    const result = await picker({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const story = await createStory(
        sessionToken,
        uri,
        undefined,
        detail.business.business_id,
        { type: "business", id: detail.business.business_id }
      );
      setDetail((prev) =>
        prev ? { ...prev, stories: [story, ...prev.stories] } : prev
      );
    }
  };

  const openStoryPicker = () => {
    Alert.alert(t("business.createStory"), t("business.chooseSource"), [
      { text: t("business.camera"), onPress: () => handleAddStory(true) },
      { text: t("business.gallery"), onPress: () => handleAddStory(false) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };


  const handleToggleLike = async (post: Post) => {
    if (!sessionToken) return;
    const actor = activeIdentity
      ? { type: activeIdentity.type, id: activeIdentity.id }
      : undefined;
    const updated = await togglePostLike(sessionToken, post.post_id, actor);
    setBusinessPosts((prev) =>
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
    setBusinessPosts((prev) =>
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
    setBusinessPosts((prev) =>
      prev.map((item) => (item.post_id === updated.post_id ? updated : item))
    );
    const data = await getPostComments(sessionToken, commentPost.post_id);
    setComments(data);
  };

  const openEditBusiness = () => {
    if (!detail) return;
    setBusinessForm({
      name: detail.business.name || "",
      description: detail.business.description || "",
      phone: detail.business.phone || "",
      website: detail.business.website || "",
      email: detail.business.email || "",
      social_links: detail.business.social_links?.links || "",
      tags: detail.business.tags?.join(", ") || "",
      logo_image: detail.business.logo_image || "",
      cover_image: detail.business.cover_image || "",
      gallery_images: detail.business.gallery_images || [],
      gallery_videos: detail.business.gallery_videos || [],
    });
    setEditBusinessModal(true);
  };

  const pickBusinessImage = async (target: "logo" | "cover" | "gallery") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (target === "logo") {
        setBusinessForm((prev) => ({ ...prev, logo_image: uri }));
      } else if (target === "cover") {
        setBusinessForm((prev) => ({ ...prev, cover_image: uri }));
      } else {
        setBusinessForm((prev) => ({
          ...prev,
          gallery_images: [...prev.gallery_images, uri],
        }));
      }
    }
  };

  const pickBusinessVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      const ok = await ensureVideoSize(uri);
      if (!ok) return;
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const uploaded = await uploadMedia(sessionToken, uri, "video", (progress) => {
            setUploadProgress(progress);
          });
          setBusinessForm((prev) => ({
            ...prev,
            gallery_videos: [...prev.gallery_videos, uploaded],
          }));
          setTimeout(() => {
            setShowUploadProgress(false);
            setUploadProgress(null);
          }, 1000);
        } catch (error) {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
        }
      }
    }
  };

  // Direct upload functions for tapping cover/logo/gallery
  const uploadCoverImageDirect = async () => {
    if (!sessionToken || !detail || !detail.is_owner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      try {
        const updated = await updateBusiness(sessionToken, detail.business.business_id, {
          cover_image: uri,
        });
        setDetail((prev) => (prev ? { ...prev, business: updated } : prev));
      } catch (error) {
        Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
      }
    }
  };

  const uploadLogoImageDirect = async () => {
    if (!sessionToken || !detail || !detail.is_owner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      try {
        const updated = await updateBusiness(sessionToken, detail.business.business_id, {
          logo_image: uri,
        });
        setDetail((prev) => (prev ? { ...prev, business: updated } : prev));
        if (activeIdentity?.type === "business" && activeIdentity.id === updated.business_id) {
          await setActiveIdentity({
            type: "business",
            id: updated.business_id,
            name: updated.name,
            avatar: updated.logo_image || null,
          });
        }
      } catch (error) {
        Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
      }
    }
  };

  const addGalleryImageDirect = async () => {
    if (!sessionToken || !detail || !detail.is_owner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      try {
        const newImages = [...(detail.business.gallery_images || []), uri];
        const updated = await updateBusiness(sessionToken, detail.business.business_id, {
          gallery_images: newImages,
        });
        setDetail((prev) => (prev ? { ...prev, business: updated } : prev));
      } catch (error) {
        Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
      }
    }
  };

  const addGalleryVideoDirect = async () => {
    if (!sessionToken || !detail || !detail.is_owner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "preparing", progress: 0 });
        const uploaded = await uploadMedia(sessionToken, uri, "video", (progress) => {
          setUploadProgress(progress);
        });
        const newVideos = [...(detail.business.gallery_videos || []), uploaded];
        const updated = await updateBusiness(sessionToken, detail.business.business_id, {
          gallery_videos: newVideos,
        });
        setDetail((prev) => (prev ? { ...prev, business: updated } : prev));
        setTimeout(() => {
          setShowUploadProgress(false);
          setUploadProgress(null);
        }, 1000);
      } catch (error) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
      }
    }
  };

  const deleteGalleryImage = async (index: number) => {
    if (!sessionToken || !detail || !detail.is_owner) return;
    Alert.alert(
      t("common.delete"),
      t("businessProfile.deleteImageConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              const newImages = (detail.business.gallery_images || []).filter((_, i) => i !== index);
              const updated = await updateBusiness(sessionToken, detail.business.business_id, {
                gallery_images: newImages,
              });
              setDetail((prev) => (prev ? { ...prev, business: updated } : prev));
            } catch (error) {
              Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
            }
          },
        },
      ]
    );
  };

  const deleteGalleryVideo = async (index: number) => {
    if (!sessionToken || !detail || !detail.is_owner) return;
    Alert.alert(
      t("common.delete"),
      t("businessProfile.deleteVideoConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              const newVideos = (detail.business.gallery_videos || []).filter((_, i) => i !== index);
              const updated = await updateBusiness(sessionToken, detail.business.business_id, {
                gallery_videos: newVideos,
              });
              setDetail((prev) => (prev ? { ...prev, business: updated } : prev));
            } catch (error) {
              Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
            }
          },
        },
      ]
    );
  };

  const handleUpdateBusiness = async () => {
    if (!sessionToken || !detail) return;
    const updated = await updateBusiness(sessionToken, detail.business.business_id, {
      name: businessForm.name || undefined,
      description: businessForm.description || undefined,
      phone: businessForm.phone || undefined,
      website: businessForm.website || undefined,
      email: businessForm.email || undefined,
      social_links: businessForm.social_links
        ? { links: businessForm.social_links }
        : undefined,
      tags: businessForm.tags
        ? businessForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : undefined,
      logo_image: businessForm.logo_image || undefined,
      cover_image: businessForm.cover_image || undefined,
      gallery_images: businessForm.gallery_images,
      gallery_videos: businessForm.gallery_videos,
    });
    setDetail((prev) => (prev ? { ...prev, business: updated } : prev));
    if (activeIdentity?.type === "business" && activeIdentity.id === updated.business_id) {
      await setActiveIdentity({
        type: "business",
        id: updated.business_id,
        name: updated.name,
        avatar: updated.logo_image || null,
      });
    }
    setEditBusinessModal(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#4c6fff" />
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={styles.centered}>
        <Pressable style={styles.backButton} onPress={safeGoBack}>
          <Ionicons name="chevron-back" size={20} color="#4c6fff" />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{t('businessProfile.notFound')}</Text>
        <Pressable style={styles.retryButton} onPress={() => {
          setLoading(true);
          loadDetail();
        }}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[
      styles.container,
      businessTheme.hasCustomTheme && { backgroundColor: businessTheme.backgroundColor }
    ]}>
      {/* Theme Gradient Background */}
      {businessTheme.useGradient && businessTheme.gradientStart && businessTheme.gradientEnd && (
        <LinearGradient
          colors={[businessTheme.gradientStart, businessTheme.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
      )}
      
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backButton} onPress={safeGoBack}>
          <Ionicons name="chevron-back" size={20} color={businessTheme.hasCustomTheme ? businessTheme.primaryColor : "#4c6fff"} />
          <Text style={[styles.backText, businessTheme.hasCustomTheme && { color: businessTheme.primaryColor }]}>Back</Text>
        </Pressable>
        <View style={styles.coverSection}>
          {detail.is_owner ? (
            <Pressable onPress={uploadCoverImageDirect}>
              {detail.business.cover_image ? (
                <Image source={{ uri: detail.business.cover_image }} style={styles.coverImage} />
              ) : (
                <View style={[styles.coverPlaceholder, businessTheme.hasCustomTheme && { backgroundColor: businessTheme.secondaryColor }]}>
                  <Ionicons name="camera-outline" size={24} color={businessTheme.hasCustomTheme ? businessTheme.textColor : "#9ca3af"} />
                  <Text style={[styles.coverPlaceholderText, businessTheme.hasCustomTheme && { color: businessTheme.textColor }]}>{t("businessProfile.tapToAddCover")}</Text>
                </View>
              )}
            </Pressable>
          ) : detail.business.cover_image ? (
            <Image source={{ uri: detail.business.cover_image }} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverPlaceholder, businessTheme.hasCustomTheme && { backgroundColor: businessTheme.secondaryColor }]}>
              <Text style={[styles.coverPlaceholderText, businessTheme.hasCustomTheme && { color: businessTheme.textColor }]}>{t("businessProfile.noCoverImage")}</Text>
            </View>
          )}
          {detail.is_owner ? (
            <Pressable style={[styles.logoBadge, businessTheme.hasCustomTheme && { borderColor: businessTheme.primaryColor }]} onPress={uploadLogoImageDirect}>
              {detail.business.logo_image ? (
                <Image source={{ uri: detail.business.logo_image }} style={styles.logoImage} />
              ) : (
                <View style={[styles.logoPlaceholder, businessTheme.hasCustomTheme && { backgroundColor: businessTheme.cardColor }]}>
                  <Ionicons name="camera-outline" size={16} color={businessTheme.primaryColor} />
                </View>
              )}
            </Pressable>
          ) : (
            <View style={[styles.logoBadge, businessTheme.hasCustomTheme && { borderColor: businessTheme.primaryColor }]}>
              {detail.business.logo_image ? (
                <Image source={{ uri: detail.business.logo_image }} style={styles.logoImage} />
              ) : (
                <Ionicons name="business" size={20} color={businessTheme.primaryColor} />
              )}
            </View>
          )}
        </View>

        <View style={styles.headerInfo}>
          <Text style={[styles.title, businessTheme.hasCustomTheme && { color: businessTheme.textColor }]}>{detail.business.name}</Text>
          <Text style={[styles.meta, businessTheme.hasCustomTheme && { color: businessTheme.textColor, opacity: 0.7 }]}>
            {translateCategory(detail.business.root_category, t)} · {translateCategory(detail.business.subcategory, t)}
          </Text>
          <Text style={styles.descriptionText}>
            {detail.business.description || t('businessProfile.noDescription')}
          </Text>
          <Text style={styles.address}>{detail.business.address}</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.actionButton} onPress={handleToggleFavorite}>
            <Ionicons
              name={isFavorited ? "heart" : "heart-outline"}
              size={18}
              color={isFavorited ? "#ef4444" : "#4c6fff"}
            />
            <Text style={styles.actionText}>{favoritesCount} Favorites</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={() =>
              WebBrowser.openBrowserAsync(
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  detail.business.address
                )}`
              )
            }
          >
            <Ionicons name="navigate" size={18} color="#4c6fff" />
            <Text style={styles.actionText}>{t("businessProfile.getDirections")}</Text>
          </Pressable>
          <Pressable
            style={styles.actionButton}
            onPress={async () => {
              try {
                // Use /share/ prefix for public deep links
                const businessUrl = `${BACKEND_URL?.replace('/api', '')}/share/business/${detail.business.business_id}`;
                await Share.share({
                  message: `${t('businessProfile.checkOut', { name: detail.business.name })} - Perix\n\n${businessUrl}`,
                  title: detail.business.name,
                });
              } catch (e) {
                console.log('Share failed:', e);
              }
            }}
          >
            <Ionicons name="share-social" size={18} color="#4c6fff" />
            <Text style={styles.actionText}>{t("events.share")}</Text>
          </Pressable>
          {/* Call Business Buttons - only show if not owner */}
          {!detail.is_owner && (
            <>
              <Pressable
                style={styles.actionButton}
                onPress={async () => {
                  if (!sessionToken) {
                    Alert.alert(t("common.error"), t("auth.loginRequired"));
                    return;
                  }
                  try {
                    const response = await initiateCall(sessionToken, undefined, "voice", detail.business.business_id);
                    router.push({
                      pathname: "/call",
                      params: {
                        mode: "outgoing",
                        callId: response.call_id,
                        callType: "voice",
                        userName: detail.business.name,
                      },
                    });
                  } catch (error: any) {
                    Alert.alert(t("common.error"), error.message || t("calls.callFailed"));
                  }
                }}
              >
                <Ionicons name="call" size={18} color="#10b981" />
                <Text style={styles.actionText}>{t("calls.voice") || "Call"}</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={async () => {
                  if (!sessionToken) {
                    Alert.alert(t("common.error"), t("auth.loginRequired"));
                    return;
                  }
                  try {
                    const response = await initiateCall(sessionToken, undefined, "video", detail.business.business_id);
                    router.push({
                      pathname: "/call",
                      params: {
                        mode: "outgoing",
                        callId: response.call_id,
                        callType: "video",
                        userName: detail.business.name,
                      },
                    });
                  } catch (error: any) {
                    Alert.alert(t("common.error"), error.message || t("calls.callFailed"));
                  }
                }}
              >
                <Ionicons name="videocam" size={18} color="#8b5cf6" />
                <Text style={styles.actionText}>{t("calls.video") || "Video"}</Text>
              </Pressable>
            </>
          )}
          {/* Report Button - only show if not owner */}
          {!detail.is_owner && (
            <Pressable
              style={styles.actionButton}
              onPress={() => setReportModalVisible(true)}
            >
              <Ionicons name="flag" size={18} color="#ef4444" />
              <Text style={[styles.actionText, { color: "#ef4444" }]}>{t("userProfile.report")}</Text>
            </Pressable>
          )}
          {detail.is_owner ? (
            <Pressable style={styles.actionButton} onPress={openEditBusiness}>
              <Ionicons name="create" size={18} color="#4c6fff" />
              <Text style={styles.actionText}>{t("businessProfile.editProfile")}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("artistProfile.connections")}</Text>
          {/* Only show friend button if not viewing own business */}
          {!detail.is_owner && (
            <Pressable style={styles.primaryButton} onPress={handleToggleFriend}>
              <Text style={styles.primaryButtonText}>
                {isFriend ? t("artistProfile.friends") : t("artistProfile.makeFriends")}
              </Text>
            </Pressable>
          )}
          <Text style={styles.sectionLabel}>{t("artistProfile.commonFriends")}</Text>
          {friendList.length === 0 ? (
            <Text style={styles.emptyText}>{t("artistProfile.noCommonFriends")}</Text>
          ) : (
            <View style={styles.friendRow}>
              {friendList.map((friend) => (
                <View key={friend.user_id} style={styles.friendChip}>
                  <View style={styles.friendAvatar}>
                    {friend.profile_photo ? (
                      <Image
                        source={{ uri: friend.profile_photo }}
                        style={styles.friendAvatarImage}
                      />
                    ) : (
                      <Text style={styles.friendAvatarText}>
                        {friend.name?.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.friendName}>{friend.name}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <BusinessMap
          location={{
            latitude: detail.business.latitude,
            longitude: detail.business.longitude,
          }}
          markers={[
            {
              id: detail.business.business_id,
              title: detail.business.name,
              description: detail.business.address,
              latitude: detail.business.latitude,
              longitude: detail.business.longitude,
            },
          ]}
        />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("businessProfile.basicInfo")}</Text>
          {detail.business.phone ? (
            <Pressable 
              style={styles.contactRow} 
              onPress={() => Linking.openURL(`tel:${detail.business.phone}`)}
            >
              <Ionicons name="call-outline" size={18} color="#4c6fff" />
              <Text style={styles.contactLinkText}>{detail.business.phone}</Text>
              <Ionicons name="open-outline" size={14} color="#9ca3af" />
            </Pressable>
          ) : (
            <Text style={styles.infoText}>Phone: Not provided</Text>
          )}
          {detail.business.website ? (
            <Pressable 
              style={styles.contactRow} 
              onPress={() => {
                const url = detail.business.website?.startsWith("http") 
                  ? detail.business.website 
                  : `https://${detail.business.website}`;
                Linking.openURL(url);
              }}
            >
              <Ionicons name="globe-outline" size={18} color="#4c6fff" />
              <Text style={styles.contactLinkText}>{detail.business.website}</Text>
              <Ionicons name="open-outline" size={14} color="#9ca3af" />
            </Pressable>
          ) : (
            <Text style={styles.infoText}>Website: Not provided</Text>
          )}
          {detail.business.email ? (
            <Pressable 
              style={styles.contactRow} 
              onPress={() => Linking.openURL(`mailto:${detail.business.email}`)}
            >
              <Ionicons name="mail-outline" size={18} color="#4c6fff" />
              <Text style={styles.contactLinkText}>{detail.business.email}</Text>
              <Ionicons name="open-outline" size={14} color="#9ca3af" />
            </Pressable>
          ) : (
            <Text style={styles.infoText}>{t("businessProfile.email")}: {t("businessProfile.notProvided")}</Text>
          )}
          
          {/* Opening Hours Section */}
          <View style={styles.openingHoursSection}>
            <Text style={styles.openingHoursTitle}>
              <Ionicons name="time-outline" size={16} color="#4c6fff" /> {t("businessProfile.openingHours")}
            </Text>
            {formatOpeningHours(detail.business.opening_hours) ? (
              <Text style={styles.openingHoursText}>
                {formatOpeningHours(detail.business.opening_hours)}
              </Text>
            ) : (
              <Text style={styles.infoText}>{t("businessProfile.notProvided")}</Text>
            )}
          </View>
          
          <Text style={styles.infoText}>
            {t("businessProfile.social")}: {detail.business.social_links?.links || t("businessProfile.notProvided")}
          </Text>
          <Text style={styles.infoText}>
            {t("businessProfile.tags")}: {detail.business.tags?.join(", ") || t("businessProfile.notProvided")}
          </Text>
        </View>

        {/* Gallery Photos */}
        <View style={styles.card}>
          <View style={styles.galleryHeader}>
            <View style={styles.galleryTitleRow}>
              <Ionicons name="images" size={18} color="#4c6fff" />
              <Text style={styles.cardTitle}>{t("profile.galleryPhotos")}</Text>
            </View>
            {detail.is_owner && (
              <Pressable style={styles.addMediaButton} onPress={addGalleryImageDirect}>
                <Ionicons name="add" size={20} color="#4c6fff" />
              </Pressable>
            )}
          </View>
          {(detail.business.gallery_images?.length) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(detail.business.gallery_images || []).map((image, index) => (
                <Pressable 
                  key={`img-${index}`} 
                  style={styles.galleryItemWrapper}
                  onPress={() => openImageViewer(image)}
                >
                  <AdaptiveImage uri={image} style={styles.galleryImage} />
                  {detail.is_owner && (
                    <Pressable 
                      style={styles.galleryDeleteButton} 
                      onPress={() => deleteGalleryImage(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </Pressable>
                  )}
                  <View style={styles.zoomIndicator}>
                    <Ionicons name="expand" size={14} color="#fff" />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>{t("profile.noPhotos")}</Text>
          )}
        </View>

        {/* Gallery Videos */}
        <View style={styles.card}>
          <View style={styles.galleryHeader}>
            <View style={styles.galleryTitleRow}>
              <Ionicons name="videocam" size={18} color="#ef4444" />
              <Text style={styles.cardTitle}>{t("profile.galleryVideos")}</Text>
            </View>
            {detail.is_owner && (
              <Pressable style={styles.addMediaButton} onPress={addGalleryVideoDirect}>
                <Ionicons name="add" size={20} color="#ef4444" />
              </Pressable>
            )}
          </View>
          {(detail.business.gallery_videos?.length) ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(detail.business.gallery_videos || []).map((video, index) => (
                <Pressable 
                  key={`vid-${index}`} 
                  style={styles.galleryItemWrapper}
                  onPress={() => openVideoViewer(video)}
                >
                  <AdaptiveVideo uri={video} style={styles.galleryVideo} />
                  {detail.is_owner && (
                    <Pressable 
                      style={styles.galleryDeleteButton} 
                      onPress={() => deleteGalleryVideo(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </Pressable>
                  )}
                  <View style={styles.videoOverlayBadge}>
                    <Ionicons name="play-circle" size={32} color="#fff" />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>{t("profile.noVideos")}</Text>
          )}
        </View>

        {/* Fan Gallery Section */}
        <View style={styles.card}>
          <View style={styles.galleryHeader}>
            <View style={styles.galleryTitleRow}>
              <Ionicons name="people" size={18} color="#10b981" />
              <Text style={styles.cardTitle}>{t("business.fanGallery")}</Text>
            </View>
            <Text style={styles.galleryCount}>
              {fanGalleryPosts.length} {t("userProfile.photos")}
            </Text>
          </View>
          {fanGalleryPosts.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {fanGalleryPosts.map((post) => (
                <Pressable
                  key={post.post_id}
                  style={styles.galleryItemWrapper}
                  onPress={() => {
                    if (post.image_base64) {
                      openImageViewer(post.image_base64);
                    } else if (post.video_url) {
                      openVideoViewer(post.video_url);
                    }
                  }}
                >
                  {post.image_base64 ? (
                    <AdaptiveImage uri={post.image_base64} style={styles.galleryImage} />
                  ) : post.video_url ? (
                    <>
                      <AdaptiveVideo uri={post.video_url} style={styles.galleryVideo} />
                      <View style={styles.videoOverlayBadge}>
                        <Ionicons name="play-circle" size={32} color="#fff" />
                      </View>
                    </>
                  ) : null}
                  <View style={styles.fanPostAuthorBadge}>
                    {post.author.profile_photo ? (
                      <Image source={{ uri: post.author.profile_photo }} style={styles.fanPostAuthorImage} />
                    ) : (
                      <Text style={styles.fanPostAuthorText}>{post.author.name?.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.fanGalleryEmptyState}>
              <Ionicons name="camera-outline" size={32} color="#d1d5db" />
              <Text style={styles.emptyText}>{t("business.noFanGallery")}</Text>
              <Text style={styles.emptyHintText}>{t("business.fanGalleryHint") || "Photos from fans who tag this business will appear here"}</Text>
            </View>
          )}
        </View>

        {/* Stories Section */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>{t("business.activeStories")}</Text>
            {detail.is_owner ? (
              <Pressable style={styles.secondaryButton} onPress={openStoryPicker}>
                <Text style={styles.secondaryButtonText}>{t("business.publishStory")}</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(detail.stories || []).map((story, index) => (
              <Pressable
                key={story.story_id}
                onPress={() => openStoryViewer(index)}
              >
                <Image
                  source={{ uri: story.image_base64 }}
                  style={styles.storyThumb}
                />
              </Pressable>
            ))}
          </ScrollView>
          {detail.stories.length === 0 ? (
            <Text style={styles.emptyText}>{t("business.noStories")}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>{t("business.businessPosts")}</Text>
          </View>
          {detail.is_owner ? (
            <View style={styles.postComposer}>
              <TextInput
                placeholder={t("business.shareAnUpdate")}
                value={postText}
                onChangeText={setPostText}
                style={styles.postInput}
                multiline
              />
              {postImage ? (
                <AdaptiveImage
                  uri={postImage}
                  style={styles.postPreview}
                  ratio={postMediaRatio || undefined}
                />
              ) : null}
              {postVideoPreview ? (
                <AdaptiveVideo
                  uri={postVideoPreview}
                  style={styles.postVideo}
                  ratio={postMediaRatio || undefined}
                />
              ) : null}
              <View style={styles.postActions}>
                <Pressable style={styles.iconButton} onPress={pickPostImage}>
                  <Ionicons name="image-outline" size={18} color="#4c6fff" />
                  <Text style={styles.iconButtonText}>{t("common.photo")}</Text>
                </Pressable>
                <Pressable style={styles.iconButton} onPress={pickPostVideo}>
                  <Ionicons name="videocam-outline" size={18} color="#4c6fff" />
                  <Text style={styles.iconButtonText}>{t("common.video")}</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={handleCreateBusinessPost}>
                  <Text style={styles.primaryButtonText}>{t("common.post")}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {businessPosts.length === 0 ? (
            <Text style={styles.emptyText}>{t("home.noContent")}</Text>
          ) : (
            businessPosts.map((post) => (
              <View key={post.post_id} style={styles.postCard}>
                <View style={styles.postHeaderRow}>
                  <View style={styles.postAvatar}>
                    {post.actor_avatar || post.author.profile_photo ? (
                      <Image
                        source={{
                          uri: (post.actor_avatar || post.author.profile_photo) as string,
                        }}
                        style={styles.postAvatarImage}
                      />
                    ) : (
                      <Text style={styles.postAvatarText}>
                        {(post.actor_name || post.author.name)
                          ?.charAt(0)
                          .toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.postAuthorText}>
                      {post.actor_name || post.author.name}
                    </Text>
                    <Text style={styles.postMetaText}>
                      {new Date(post.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.postTitle}>{post.text}</Text>
                {post.image_base64 ? (
                  <AdaptiveImage
                    uri={post.image_base64}
                    style={styles.postPreview}
                    ratio={post.media_ratio || undefined}
                  />
                ) : null}
                {post.video_url ? (
                  <AdaptiveVideo
                    uri={post.video_url}
                    style={styles.postVideo}
                    ratio={post.media_ratio || undefined}
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
                    <Text style={styles.footerText}>{post.likes_count} Likes</Text>
                  </Pressable>
                  <Pressable
                    style={styles.footerItem}
                    onPress={() => openComments(post)}
                  >
                    <Ionicons name="chatbubble-outline" size={16} color="#6b7280" />
                    <Text style={styles.footerText}>{post.comments_count} Comments</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Featured events</Text>
            {canCreateEvent ? (
              <Pressable style={styles.secondaryButton} onPress={openNewEvent}>
                <Text style={styles.secondaryButtonText}>Create event</Text>
              </Pressable>
            ) : null}
          </View>
          {detail.events.length === 0 ? (
            <Text style={styles.emptyText}>No events yet.</Text>
          ) : (
            detail.events.map((event) => (
              <Pressable 
                key={event.event_id} 
                style={styles.eventCard}
                onPress={() => router.push(`/event/${event.event_id}`)}
              >
                {event.image_base64 ? (
                  <Image source={{ uri: event.image_base64 }} style={styles.eventImage} />
                ) : null}
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventMeta}>
                    {event.start_time.split("T")[0]} · {event.location || ""}
                  </Text>
                  <View style={styles.eventButtonRow}>
                    <Pressable
                      style={styles.eventChatButton}
                      onPress={(e) => { e.stopPropagation(); openEventChat(event); }}
                    >
                      <Ionicons name="chatbubble-ellipses" size={16} color="#4c6fff" />
                      <Text style={styles.eventChatText}>Chat</Text>
                    </Pressable>
                    <Pressable
                      style={styles.whatsappButton}
                      onPress={(e) => { e.stopPropagation(); shareEventToWhatsApp(event); }}
                    >
                      <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      <Text style={styles.whatsappButtonText}>{t("events.share")}</Text>
                    </Pressable>
                  </View>
                </View>
                {detail.is_owner ? (
                  <View style={styles.eventActions}>
                    <Pressable
                      style={styles.eventActionButton}
                      onPress={(e) => { e.stopPropagation(); openEditEvent(event); }}
                    >
                      <Ionicons name="create-outline" size={18} color="#4c6fff" />
                    </Pressable>
                    <Pressable onPress={(e) => { e.stopPropagation(); handleDeleteEvent(event.event_id); }}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={eventModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingEventId ? "Edit event" : "Create event"}
            </Text>
            <Pressable onPress={() => setEventModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput
              placeholder="Event title"
              value={form.title}
              onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
              style={styles.input}
            />
            <TextInput
              placeholder="Description"
              value={form.description}
              onChangeText={(value) =>
                setForm((prev) => ({ ...prev, description: value }))
              }
              style={[styles.input, styles.textArea]}
              multiline
            />
            <TextInput
              placeholder="Date (YYYY-MM-DD)"
              value={form.date}
              onChangeText={(value) => setForm((prev) => ({ ...prev, date: value }))}
              style={styles.input}
            />
            <View style={styles.quickRow}>
              {[
                { label: "Today", offset: 0 },
                { label: "Tomorrow", offset: 1 },
              ].map((option) => (
                <Pressable
                  key={option.label}
                  style={styles.quickChip}
                  onPress={() => {
                    const date = new Date();
                    date.setDate(date.getDate() + option.offset);
                    const value = date.toISOString().split("T")[0];
                    setForm((prev) => ({ ...prev, date: value }));
                  }}
                >
                  <Text style={styles.quickText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              placeholder="Time (HH:MM)"
              value={form.time}
              onChangeText={(value) => setForm((prev) => ({ ...prev, time: value }))}
              style={styles.input}
            />
            <View style={styles.quickRow}>
              {["18:00", "19:00", "20:00"].map((time) => (
                <Pressable
                  key={time}
                  style={styles.quickChip}
                  onPress={() => setForm((prev) => ({ ...prev, time }))}
                >
                  <Text style={styles.quickText}>{time}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              placeholder="Location"
              value={addressQuery}
              onChangeText={(value) => {
                setAddressQuery(value);
                setForm((prev) => ({ ...prev, location: value }));
              }}
              style={styles.input}
            />
            {suggestions.length ? (
              <View style={styles.suggestionBox}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.place_id}
                    style={styles.suggestionItem}
                    onPress={() => handlePlaceSelect(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion.description}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>Event photo</Text>
            {imagePreview ? (
              <Image source={{ uri: imagePreview }} style={styles.eventImagePreview} />
            ) : null}
            <Pressable style={styles.secondaryButton} onPress={handlePickEventImage}>
              <Text style={styles.secondaryButtonText}>Upload photo</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={saveEvent}>
              <Text style={styles.primaryButtonText}>
                {editingEventId ? "Update event" : "Save event"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={commentModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Comments</Text>
            <Pressable onPress={() => setCommentModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.commentHint}>
              Posting as {activeIdentity?.name || "User"}
            </Text>
            {commentLoading ? (
              <ActivityIndicator color="#4c6fff" />
            ) : (
              comments.map((comment) => (
                <View key={comment.comment_id} style={styles.commentRow}>
                  <View style={styles.commentAvatar}>
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
                  </View>
                  <View style={styles.commentBody}>
                    <Text style={styles.commentAuthor}>
                      {comment.actor_name || comment.author?.name}
                    </Text>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    {comment.user_id === user?.user_id ? (
                      <View style={styles.commentActions}>
                        <Pressable
                          onPress={() => handleEditComment(comment)}
                          style={styles.commentActionButton}
                        >
                          <Text style={styles.commentActionText}>Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteComment(comment)}
                          style={styles.commentActionButton}
                        >
                          <Text style={styles.commentActionText}>Delete</Text>
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
              placeholder="Add a comment"
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

      <Modal visible={eventChatModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {eventChatEvent ? eventChatEvent.title : "Event chat"}
            </Text>
            <Pressable onPress={() => setEventChatModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.chatBody}>
            {eventChatMessages.length === 0 ? (
              <Text style={styles.emptyText}>No messages yet.</Text>
            ) : (
              eventChatMessages.map((message) => (
                <View key={message.message_id} style={styles.chatBubble}>
                  <Text style={styles.chatAuthor}>
                    {message.author?.name || "User"}
                  </Text>
                  <Text style={styles.chatText}>{message.text}</Text>
                </View>
              ))
            )}
          </ScrollView>
          <View style={styles.chatInputRow}>
            <TextInput
              placeholder="Type a message"
              value={eventChatText}
              onChangeText={setEventChatText}
              style={styles.chatInput}
            />
            <Pressable style={styles.chatSendButton} onPress={sendEventChat}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={editBusinessModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit business profile</Text>
            <Pressable onPress={() => setEditBusinessModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput
              placeholder="Business name"
              value={businessForm.name}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, name: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Description"
              value={businessForm.description}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, description: value }))
              }
              style={[styles.input, styles.textArea]}
              multiline
            />
            <TextInput
              placeholder="Phone"
              value={businessForm.phone}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, phone: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Website"
              value={businessForm.website}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, website: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Email"
              value={businessForm.email}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, email: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Social links"
              value={businessForm.social_links}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, social_links: value }))
              }
              style={styles.input}
            />
            <Text style={styles.hintText}>
              Opening hours can be managed in the Business Dashboard
            </Text>
            <TextInput
              placeholder="Tags (comma separated)"
              value={businessForm.tags}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, tags: value }))
              }
              style={styles.input}
            />
            <Pressable
              style={styles.secondaryButton}
              onPress={() => pickBusinessImage("logo")}
            >
              <Text style={styles.secondaryButtonText}>Update logo</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => pickBusinessImage("cover")}
            >
              <Text style={styles.secondaryButtonText}>Update cover</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleUpdateBusiness}>
              <Text style={styles.primaryButtonText}>Save changes</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <UploadProgressModal visible={showUploadProgress} progress={uploadProgress} />

      {/* Story Viewer Modal */}
      <Modal 
        visible={storyViewerVisible} 
        animationType="fade"
        transparent={true}
        onRequestClose={() => setStoryViewerVisible(false)}
      >
        <View style={styles.storyViewerOverlay}>
          <Pressable 
            style={styles.storyViewerClose}
            onPress={() => setStoryViewerVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          
          {detail?.stories && detail.stories[currentStoryIndex] && (
            <Image
              source={{ uri: detail.stories[currentStoryIndex].image_base64 }}
              style={styles.storyViewerImage}
              resizeMode="contain"
            />
          )}
          
          <View style={styles.storyViewerNav}>
            <Pressable 
              style={styles.storyNavButton}
              onPress={() => navigateStory('prev')}
            >
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </Pressable>
            <Text style={styles.storyCounter}>
              {currentStoryIndex + 1} / {detail?.stories?.length || 0}
            </Text>
            <Pressable 
              style={styles.storyNavButton}
              onPress={() => navigateStory('next')}
            >
              <Ionicons name="chevron-forward" size={32} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal 
        visible={imageViewerVisible} 
        animationType="fade"
        transparent={true}
        onRequestClose={() => setImageViewerVisible(false)}
      >
        <View style={styles.viewerOverlay}>
          <Pressable 
            style={styles.viewerCloseButton}
            onPress={() => setImageViewerVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* Video Viewer Modal */}
      <Modal 
        visible={videoViewerVisible} 
        animationType="fade"
        transparent={true}
        onRequestClose={() => setVideoViewerVisible(false)}
      >
        <View style={styles.viewerOverlay}>
          <Pressable 
            style={styles.viewerCloseButton}
            onPress={() => setVideoViewerVisible(false)}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedVideo && (
            <View style={styles.viewerVideoContainer}>
              <AdaptiveVideo
                uri={selectedVideo}
                style={styles.viewerVideo}
                autoPlay={true}
                showMuteButton={true}
                isLooping={true}
              />
            </View>
          )}
        </View>
      </Modal>

      {/* Report Business Modal */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>{t('businessProfile.reportBusiness') || "Report Business"}</Text>
              <Pressable onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            <Text style={styles.reportModalDescription}>
              {t('businessProfile.reportDescription') || "Please describe why you are reporting this business. Our team will review your report."}
            </Text>
            <TextInput
              style={styles.reportTextInput}
              placeholder={t('userProfile.reportPlaceholder') || "Describe the issue..."}
              placeholderTextColor="#999"
              value={reportReason}
              onChangeText={setReportReason}
              multiline
              numberOfLines={4}
            />
            <Pressable
              style={[styles.reportSubmitButton, !reportReason.trim() && styles.reportSubmitButtonDisabled]}
              onPress={handleReportBusiness}
              disabled={!reportReason.trim() || reportLoading}
            >
              {reportLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.reportSubmitButtonText}>{t('userProfile.submitReport') || "Submit Report"}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fb",
  },
  content: {
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  hintText: {
    fontSize: 12,
    color: "#9ca3af",
    fontStyle: "italic",
    marginBottom: 12,
    marginTop: -8,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  backText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 4,
  },
  header: {
    marginBottom: 16,
  },
  coverSection: {
    marginBottom: 16,
  },
  coverImage: {
    width: "100%",
    height: 160,
    borderRadius: 16,
  },
  coverPlaceholder: {
    width: "100%",
    height: 160,
    borderRadius: 16,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholderText: {
    color: "#6b7280",
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    bottom: -20,
    left: 20,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  logoImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  headerInfo: {
    marginTop: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  meta: {
    color: "#6b7280",
    marginTop: 4,
  },
  address: {
    color: "#4c6fff",
    marginTop: 4,
  },
  descriptionText: {
    color: "#6b7280",
    marginTop: 8,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  actionText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 6,
  },
  infoText: {
    color: "#4b5563",
    marginBottom: 6,
  },
  openingHoursSection: {
    marginTop: 12,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  openingHoursTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  openingHoursText: {
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  contactLinkText: {
    flex: 1,
    marginLeft: 10,
    color: "#4c6fff",
    fontSize: 14,
  },
  galleryImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: "#f3f4f6",
  },
  galleryVideo: {
    width: 120,
    borderRadius: 12,
    marginRight: 10,
    maxHeight: 160,
  },
  mediaActions: {
    flexDirection: "row",
    marginTop: 12,
  },
  storyThumb: {
    width: 80,
    height: 120,
    borderRadius: 12,
    marginRight: 10,
  },
  postComposer: {
    marginBottom: 16,
  },
  postInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    textAlignVertical: "top",
  },
  postPreview: {
    width: "100%",
    borderRadius: 16,
    marginTop: 12,
  },
  postVideo: {
    width: "100%",
    borderRadius: 16,
    marginTop: 12,
  },
  postCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  postHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  postAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  postAvatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  postAvatarText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  postAuthorText: {
    fontWeight: "600",
    color: "#111827",
  },
  postMetaText: {
    color: "#9ca3af",
    fontSize: 12,
  },
  postTitle: {
    color: "#111827",
    fontWeight: "600",
    marginBottom: 8,
  },
  postFooter: {
    flexDirection: "row",
    marginTop: 8,
  },
  footerItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  footerText: {
    color: "#6b7280",
    marginLeft: 6,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  emptyText: {
    color: "#9ca3af",
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  eventMeta: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
  },
  eventActions: {
    flexDirection: "row",
  },
  eventActionButton: {
    marginRight: 12,
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
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  quickRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
    marginRight: 8,
  },
  quickText: {
    color: "#4c6fff",
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
    overflow: "hidden",
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  suggestionText: {
    color: "#111827",
  },
  sectionLabel: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  eventImagePreview: {
    width: "100%",
    height: 160,
    borderRadius: 16,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  friendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  friendChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  friendAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  friendAvatarImage: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  friendAvatarText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  friendName: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "600",
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 6,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
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
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#4c6fff",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
  },
  retryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  galleryScroll: {
    marginVertical: 8,
  },
  galleryItemWrapper: {
    position: "relative",
    marginRight: 10,
  },
  galleryDeleteButton: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  logoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  eventButtonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  eventChatButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  eventChatText: {
    color: "#4c6fff",
    fontSize: 13,
    fontWeight: "600",
  },
  whatsappButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  whatsappButtonText: {
    color: "#25D366",
    fontSize: 13,
    fontWeight: "600",
  },
  chatBody: {
    padding: 16,
    flex: 1,
  },
  chatBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: "80%",
    backgroundColor: "#f3f4f6",
  },
  chatAuthor: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4c6fff",
    marginBottom: 4,
  },
  chatText: {
    fontSize: 14,
    color: "#111827",
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    fontSize: 14,
  },
  chatSendButton: {
    backgroundColor: "#4c6fff",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  // Gallery Header Styles
  galleryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  galleryTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  galleryCount: {
    fontSize: 13,
    color: "#9ca3af",
  },
  addMediaButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomIndicator: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 10,
    padding: 4,
  },
  videoOverlayBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  // Story Viewer Styles
  storyViewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  storyViewerClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 8,
  },
  storyViewerImage: {
    width: "90%",
    height: "70%",
  },
  storyViewerNav: {
    position: "absolute",
    bottom: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 30,
  },
  storyNavButton: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 25,
    padding: 10,
  },
  storyCounter: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Media Viewer Styles
  viewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerCloseButton: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 8,
  },
  viewerImage: {
    width: "95%",
    height: "80%",
  },
  viewerVideoContainer: {
    width: "95%",
    height: "60%",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerVideo: {
    width: "100%",
    height: "100%",
  },
  // Fan Gallery Styles
  fanPostAuthorBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  fanPostAuthorImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  fanPostAuthorText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4c6fff",
  },
  fanGalleryEmptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyHintText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 4,
  },
  // Report Modal Styles
  reportModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  reportModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  reportModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  reportModalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  reportModalDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },
  reportTextInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#1f2937",
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  reportSubmitButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  reportSubmitButtonDisabled: {
    backgroundColor: "#fca5a5",
  },
  reportSubmitButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});

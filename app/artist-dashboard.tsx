import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import {
  createEvent,
  createPost,
  createStory,
  deleteEvent,
  getArtistDetail,
  getMyArtist,
  updateArtist,
  updateEvent,
  getArtistFanGallery,
  hideArtistFanGalleryPost,
  uploadMedia,
  getArtistAnalytics,
  updateArtistTheme,
  ArtistAnalytics,
  Artist,
  EventItem,
  Post,
  UploadProgress,
  ProfileTheme,
} from "../lib/api";
import AdaptiveImage from "../components/AdaptiveImage";
import AdaptiveVideo from "../components/AdaptiveVideo";
import PlacesAutocompleteInput from "../components/PlacesAutocompleteInput";
import UploadProgressModal from "../components/UploadProgressModal";
import VideoGalleryUpload from "../components/VideoGalleryUpload";
import InlineThemeBar from "../components/InlineThemeBar";

// Import refactored components
import {
  PhotoGallerySection,
  YouTubeGallerySection,
  ArtistInfoSection,
  ArtistFanGallerySection,
  ArtistEventsSection,
} from "../components/artist";
import { StoriesSection } from "../components/business";

// Dashboard analytics components
import { AnalyticsDashboard } from "../components/dashboard";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ArtistDashboard() {
  const { t } = useTranslation();
  const { sessionToken, activeIdentity, setActiveIdentity } = useAuth();
  const { router, safeGoBackToProfile } = useSafeNavigation();
  
  // Core state
  const [artist, setArtist] = useState<Artist | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [stories, setStories] = useState<any[]>([]);
  
  // Edit modal state
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    bio: "",
    genres: "",
    socials: {} as Record<string, string>,
    town: "",
    address: "",
    profile_photo: "",
    cover_photo: "",
  });
  const [youtubeUrl, setYoutubeUrl] = useState("");
  
  // Post creation state
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideo, setPostVideo] = useState<string | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);
  const [postMediaRatio, setPostMediaRatio] = useState<number | null>(null);
  
  // Gallery state
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryVideos, setGalleryVideos] = useState<string[]>([]);
  const [newYoutubeLink, setNewYoutubeLink] = useState("");
  
  // Theme state
  const [currentTheme, setCurrentTheme] = useState<ProfileTheme | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);
  
  // Event modal state
  const [eventModal, setEventModal] = useState(false);
  const [eventEditing, setEventEditing] = useState<EventItem | null>(null);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    start_time: "",
    location: "",
    image_base64: "",
    video_url: "",
  });
  const [eventVideoPreview, setEventVideoPreview] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [eventTime, setEventTime] = useState<Date>(new Date());
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  const [showEventTimePicker, setShowEventTimePicker] = useState(false);
  
  // Upload progress
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // Viewer state
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<"overview" | "analytics" | "content">("overview");
  
  // Analytics state
  const [analytics, setAnalytics] = useState<ArtistAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const MAX_VIDEO_SIZE_MB = 300;
  const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

  // Load artist data
  const loadArtist = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const me = await getMyArtist(sessionToken);
      if (!me) {
        setLoading(false);
        return;
      }
      setArtist(me);
      setGalleryImages(me.gallery_images || []);
      setGalleryVideos(me.video_urls || []);
      setCurrentTheme(me.theme || null);
      const detail = await getArtistDetail(sessionToken, me.artist_id);
      setEvents(detail.events || []);
      setStories((detail as any).stories || []);
      
      // Load analytics
      loadAnalytics(me.artist_id);
      
      try {
        const fanPosts = await getArtistFanGallery(sessionToken, me.artist_id);
        setTaggedPosts(fanPosts);
      } catch (e) {
        console.log("Failed to load fan gallery:", e);
      }
    } catch (error) {
      console.error("Failed to load artist:", error);
    }
    setLoading(false);
  }, [sessionToken]);

  // Theme handlers
  const handleThemeChange = (newTheme: ProfileTheme) => {
    setCurrentTheme(newTheme);
  };

  const saveTheme = async () => {
    if (!sessionToken || !artist) return;
    setSavingTheme(true);
    try {
      await updateArtistTheme(sessionToken, artist.artist_id, currentTheme || {});
      Alert.alert(
        t('theme.success') || 'Success',
        t('theme.themeUpdated') || 'Theme saved!'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save theme');
    }
    setSavingTheme(false);
  };

  // Load analytics data
  const loadAnalytics = async (artistId: string) => {
    if (!sessionToken) return;
    setAnalyticsLoading(true);
    try {
      const data = await getArtistAnalytics(sessionToken, artistId);
      setAnalytics(data);
    } catch (e) {
      console.log("Failed to load analytics:", e);
    }
    setAnalyticsLoading(false);
  };

  useEffect(() => {
    loadArtist();
  }, [loadArtist]);

  // Edit profile handlers
  const openEdit = () => {
    if (!artist) return;
    setForm({
      name: artist.name || "",
      bio: artist.bio || "",
      genres: artist.genres?.join(", ") || "",
      socials: artist.socials || {},
      town: artist.town || "",
      address: artist.address || "",
      profile_photo: artist.profile_photo || "",
      cover_photo: artist.cover_photo || "",
    });
    setYoutubeUrl("");
    setEditModal(true);
  };

  const pickImage = async (target: "profile" | "cover") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setForm((prev) => ({ ...prev, [target === "profile" ? "profile_photo" : "cover_photo"]: uri }));
    }
  };

  const saveArtist = async () => {
    if (!sessionToken || !artist) return;
    const socialsMap: Record<string, string> = form.socials || {};
    const updated = await updateArtist(sessionToken, artist.artist_id, {
      name: form.name || undefined,
      bio: form.bio || undefined,
      genres: form.genres ? form.genres.split(",").map((item) => item.trim()) : undefined,
      socials: Object.keys(socialsMap).length ? socialsMap : undefined,
      town: form.town || undefined,
      address: form.address || undefined,
      profile_photo: form.profile_photo || undefined,
      cover_photo: form.cover_photo || undefined,
      gallery_images: galleryImages,
      video_urls: galleryVideos,
    });
    setArtist(updated);
    if (activeIdentity?.type === "artist" && activeIdentity.id === updated.artist_id) {
      await setActiveIdentity({
        type: "artist",
        id: updated.artist_id,
        name: updated.name,
        avatar: updated.profile_photo || null,
      });
    }
    setEditModal(false);
    Alert.alert(t("common.success"), t("artist.profileUpdated"));
  };

  // Post handlers
  const pickPostImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const asset = result.assets[0];
      const uri = `data:image/jpeg;base64,${asset.base64}`;
      setPostMediaRatio(asset.width && asset.height ? asset.width / asset.height : null);
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
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(t("common.error"), t("home.videoTooLarge") || `Video must be under ${MAX_VIDEO_SIZE_MB}MB`);
        return;
      }
      setPostMediaRatio(asset.width && asset.height ? asset.width / asset.height : null);
      setPostVideoPreview(asset.uri);
      setPostImage(null);
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const uploaded = await uploadMedia(sessionToken, asset.uri, "video", setUploadProgress);
          setPostVideo(uploaded);
          setTimeout(() => { setShowUploadProgress(false); setUploadProgress(null); }, 1000);
        } catch (error) {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
        }
      }
    }
  };

  const handleCreatePost = async () => {
    if (!sessionToken || !artist) return;
    if (!postText.trim() && !postImage && !postVideo) return;
    await createPost(
      sessionToken,
      postText.trim() || t("business.shareUpdate"),
      postImage,
      postVideo,
      undefined,
      { type: "artist", id: artist.artist_id },
      postMediaRatio || undefined
    );
    setPostText("");
    setPostImage(null);
    setPostVideo(null);
    setPostVideoPreview(null);
    setPostMediaRatio(null);
    Alert.alert(t("common.success"), t("business.postCreated"));
  };

  // Story handlers
  const handleAddStory = async (useCamera?: boolean) => {
    if (!sessionToken || !artist) return;
    
    const picker = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({
      mediaTypes: ImagePicker.MediaTypeOptions.All, // Allow both images and videos
      quality: 0.8,
      videoMaxDuration: 60,
    });
    
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      const mediaType = asset.type === "video" ? "video" : "image";
      
      // Navigate to the media editor for full editing (text, music, filters)
      router.push({
        pathname: "/media-editor",
        params: { 
          uri: encodeURIComponent(asset.uri), 
          type: mediaType 
        },
      });
    }
  };

  const openStoryPicker = () => {
    Alert.alert(t("business.createStory"), t("business.chooseSource"), [
      { text: t("business.camera"), onPress: () => handleAddStory(true) },
      { text: t("business.gallery"), onPress: () => handleAddStory(false) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  };

  const openStoryViewer = (index: number) => {
    setCurrentStoryIndex(index);
    setStoryViewerVisible(true);
  };

  const navigateStory = (direction: 'prev' | 'next') => {
    if (direction === 'next' && currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
    } else if (direction === 'prev' && currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else {
      setStoryViewerVisible(false);
    }
  };

  // Gallery handlers
  const addGalleryImage = async () => {
    if (!sessionToken || !artist) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const newImages = [...galleryImages, uri];
      setGalleryImages(newImages);
      await updateArtist(sessionToken, artist.artist_id, { gallery_images: newImages });
      Alert.alert(t("common.success"), t("artist.photoAdded"));
    }
  };

  const deleteGalleryImage = async (index: number) => {
    if (!sessionToken || !artist) return;
    Alert.alert(t("common.delete"), t("artist.deletePhotoConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          const newImages = galleryImages.filter((_, i) => i !== index);
          setGalleryImages(newImages);
          await updateArtist(sessionToken, artist.artist_id, { gallery_images: newImages });
        },
      },
    ]);
  };

  const addYoutubeLink = async () => {
    if (!sessionToken || !artist || !newYoutubeLink) return;
    if (!newYoutubeLink.includes('youtube.com') && !newYoutubeLink.includes('youtu.be')) {
      Alert.alert(t("common.error"), t("artist.invalidYoutubeUrl"));
      return;
    }
    const newVideos = [...galleryVideos, newYoutubeLink];
    setGalleryVideos(newVideos);
    setNewYoutubeLink("");
    await updateArtist(sessionToken, artist.artist_id, { video_urls: newVideos });
    Alert.alert(t("common.success"), t("artist.youtubeAdded"));
  };

  const deleteYoutubeLink = async (index: number) => {
    if (!sessionToken || !artist) return;
    Alert.alert(t("common.delete"), t("artist.deleteYoutubeConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          const youtubeVideos = galleryVideos.filter(v => v.includes('youtube') || v.includes('youtu.be'));
          const uploadedVideos = galleryVideos.filter(v => !v.includes('youtube') && !v.includes('youtu.be'));
          const newYoutubeVideos = youtubeVideos.filter((_, i) => i !== index);
          const newVideos = [...uploadedVideos, ...newYoutubeVideos];
          setGalleryVideos(newVideos);
          await updateArtist(sessionToken, artist.artist_id, { video_urls: newVideos });
        },
      },
    ]);
  };

  // Media viewer handlers
  const openImageViewer = (uri: string) => {
    setSelectedImage(uri);
    setImageViewerVisible(true);
  };

  const openVideoViewer = (uri: string) => {
    setSelectedVideo(uri);
    setVideoViewerVisible(true);
  };

  // Event handlers
  const openEventModal = (event?: EventItem) => {
    if (event) {
      setEventEditing(event);
      const existingDate = new Date(event.start_time);
      setEventDate(existingDate);
      setEventTime(existingDate);
      setEventForm({
        title: event.title,
        description: event.description || "",
        start_time: event.start_time,
        location: event.location || "",
        image_base64: event.image_base64 || "",
        video_url: event.video_url || "",
      });
      setEventVideoPreview(event.video_url || null);
    } else {
      setEventEditing(null);
      setEventDate(new Date());
      setEventTime(new Date());
      setEventForm({ title: "", description: "", start_time: "", location: "", image_base64: "", video_url: "" });
      setEventVideoPreview(null);
    }
    setEventModal(true);
  };

  const handleEventDateChange = (_: any, selectedDate?: Date) => {
    setShowEventDatePicker(Platform.OS === "ios");
    if (selectedDate) setEventDate(selectedDate);
  };

  const handleEventTimeChange = (_: any, selectedTime?: Date) => {
    setShowEventTimePicker(Platform.OS === "ios");
    if (selectedTime) setEventTime(selectedTime);
  };

  const pickEventImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setEventForm((prev) => ({ ...prev, image_base64: uri }));
    }
  };

  const pickEventVideo = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
      videoMaxDuration: 60,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(t("common.error"), t("home.videoTooLarge") || `Video must be under ${MAX_VIDEO_SIZE_MB}MB`);
        return;
      }
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "preparing", progress: 0 });
        const uploaded = await uploadMedia(sessionToken, asset.uri, "video", setUploadProgress);
        setEventVideoPreview(asset.uri);
        setEventForm((prev) => ({ ...prev, video_url: uploaded }));
        setTimeout(() => { setShowUploadProgress(false); setUploadProgress(null); }, 1000);
      } catch (error) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
      }
    }
  };

  const handleSaveEvent = async () => {
    if (!sessionToken || !artist) return;
    const start_time = new Date(eventDate);
    start_time.setHours(eventTime.getHours(), eventTime.getMinutes(), 0, 0);

    if (eventEditing) {
      const updated = await updateEvent(sessionToken, eventEditing.event_id, {
        title: eventForm.title || eventEditing.title,
        description: eventForm.description || undefined,
        image_base64: eventForm.image_base64 || undefined,
        video_url: eventForm.video_url || undefined,
        start_time: start_time.toISOString(),
        location: eventForm.location || undefined,
      });
      setEvents((prev) => prev.map((e) => (e.event_id === updated.event_id ? updated : e)));
      Alert.alert(t("common.success"), t("artist.eventUpdated"));
    } else {
      const created = await createEvent(sessionToken, {
        artist_id: artist.artist_id,
        title: eventForm.title || t("events.newEvent") || "New Event",
        description: eventForm.description || undefined,
        image_base64: eventForm.image_base64 || "",
        video_url: eventForm.video_url || undefined,
        start_time: start_time.toISOString(),
        location: eventForm.location || undefined,
      });
      setEvents((prev) => [created, ...prev]);
      Alert.alert(t("common.success"), t("artist.eventCreated"));
    }
    setEventModal(false);
    setEventVideoPreview(null);
  };

  const handleDeleteEvent = async (eventId: string) => {
    Alert.alert(t("common.delete"), t("business.deleteEventConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          if (!sessionToken) return;
          await deleteEvent(sessionToken, eventId);
          setEvents((prev) => prev.filter((e) => e.event_id !== eventId));
        },
      },
    ]);
  };

  const shareEventToWhatsApp = async (event: EventItem) => {
    const eventDate = new Date(event.start_time).toLocaleDateString();
    const eventTime = new Date(event.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const location = event.location || "";
    const eventUrl = `${BACKEND_URL?.replace('/api', '')}/event/${event.event_id}`;
    const message = `${t("events.invitationMessage", { 
      title: event.title, 
      organizer: artist?.name || "",
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

  // Fan gallery handler
  const handleHideFanPost = async (postId: string) => {
    if (!sessionToken || !artist) return;
    Alert.alert(t("artist.hideFanPost"), t("artist.hideFanPostConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.hide"),
        style: "destructive",
        onPress: async () => {
          await hideArtistFanGalleryPost(sessionToken, artist.artist_id, postId);
          setTaggedPosts((prev) => prev.filter((p) => p.post_id !== postId));
        },
      },
    ]);
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#4c6fff" />
      </SafeAreaView>
    );
  }

  // No artist state
  if (!artist) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("artist.dashboard")}</Text>
          <Text style={styles.emptyText}>{t("artist.createFirst")}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/profile")}>
            <Text style={styles.primaryButtonText}>{t("common.goToProfile")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <UploadProgressModal visible={showUploadProgress} progress={uploadProgress} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Back Button */}
        <Pressable style={styles.backButton} onPress={safeGoBackToProfile}>
          <Ionicons name="chevron-back" size={20} color="#4c6fff" />
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </Pressable>
        
        <Text style={styles.title}>{t("artist.dashboard")}</Text>
        <Text style={styles.subtitle}>{artist.name}</Text>

        {/* Tab Navigation */}
        <View style={styles.tabContainer} testID="artist-dashboard-tabs" data-testid="artist-dashboard-tabs">
          <Pressable 
            style={[styles.tab, activeTab === "overview" && styles.tabActive]}
            onPress={() => setActiveTab("overview")}
            testID="artist-tab-overview"
            accessibilityLabel="artist-tab-overview"
          >
            <Ionicons name="grid-outline" size={18} color={activeTab === "overview" ? "#4c6fff" : "#6b7280"} />
            <Text style={[styles.tabText, activeTab === "overview" && styles.tabTextActive]}>{t("common.overview")}</Text>
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "analytics" && styles.tabActive]}
            onPress={() => setActiveTab("analytics")}
            testID="artist-tab-analytics"
            accessibilityLabel="artist-tab-analytics"
          >
            <Ionicons name="analytics-outline" size={18} color={activeTab === "analytics" ? "#4c6fff" : "#6b7280"} />
            <Text style={[styles.tabText, activeTab === "analytics" && styles.tabTextActive]}>{t("common.analytics")}</Text>
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "content" && styles.tabActive]}
            onPress={() => setActiveTab("content")}
            testID="artist-tab-content"
            accessibilityLabel="artist-tab-content"
          >
            <Ionicons name="create-outline" size={18} color={activeTab === "content" ? "#4c6fff" : "#6b7280"} />
            <Text style={[styles.tabText, activeTab === "content" && styles.tabTextActive]}>{t("common.content")}</Text>
          </Pressable>
        </View>

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <View style={styles.tabContent}>
            {analyticsLoading ? (
              <View style={styles.analyticsLoading}>
                <ActivityIndicator color="#4c6fff" />
                <Text style={styles.loadingText}>Loading analytics...</Text>
              </View>
            ) : analytics ? (
              <AnalyticsDashboard
                type="artist"
                profileViews={analytics.total_profile_views}
                followers={analytics.total_followers}
                totalEvents={analytics.total_events}
                totalAttendees={analytics.total_event_attendees}
                engagementRate={analytics.engagement_rate}
                topEvents={analytics.top_events}
                growthData={analytics.growth_data}
                onEventPress={(eventId) => router.push(`/event/${eventId}`)}
                onRefresh={() => artist && loadAnalytics(artist.artist_id)}
                isLoading={analyticsLoading}
              />
            ) : (
              <View style={styles.analyticsEmpty}>
                <Ionicons name="analytics" size={48} color="#d1d5db" />
                <Text style={styles.emptyText}>No analytics data yet</Text>
                <Text style={styles.emptySubtext}>Create events and content to start tracking</Text>
              </View>
            )}
          </View>
        )}

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <>
            {/* Profile Management */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("business.profileManagement")}</Text>
              <Pressable style={styles.secondaryButton} onPress={openEdit}>
                <Ionicons name="create-outline" size={18} color="#4c6fff" />
                <Text style={styles.secondaryButtonText}>{t("business.editInfo")}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => router.push(`/artist/${artist.artist_id}`)}>
                <Ionicons name="eye-outline" size={18} color="#4c6fff" />
                <Text style={styles.secondaryButtonText}>{t("business.openPublicProfile")}</Text>
              </Pressable>
            </View>

            {/* Inline Theme Editor */}
            <InlineThemeBar
              currentTheme={currentTheme}
              onThemeChange={handleThemeChange}
              onSave={saveTheme}
              saving={savingTheme}
              showPreview={true}
            />

            {/* Artist Info Section */}
            <ArtistInfoSection
              name={artist.name}
              bio={artist.bio}
              genres={artist.genres}
              town={artist.town}
              socials={artist.socials}
            />

            {/* Events Section */}
            <ArtistEventsSection
              events={events}
              onAddEvent={() => openEventModal()}
              onEditEvent={openEventModal}
              onDeleteEvent={handleDeleteEvent}
              onShareEvent={shareEventToWhatsApp}
            />

            {/* Fan Gallery */}
            <ArtistFanGallerySection
              posts={taggedPosts}
              onViewMedia={(uri, type) => {
                if (type === 'image') {
                  openImageViewer(uri);
                } else {
                  openVideoViewer(uri);
                }
              }}
              onHidePost={handleHideFanPost}
            />
          </>
        )}

        {/* Content Tab */}
        {activeTab === "content" && (
          <>
            {/* Content Creation */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("business.contentCreation")}</Text>
              <TextInput
                placeholder={t("business.shareAnUpdate")}
                value={postText}
                onChangeText={setPostText}
                style={styles.input}
                multiline
              />
              {postImage && <AdaptiveImage uri={postImage} style={styles.postPreview} ratio={postMediaRatio || undefined} />}
              {postVideoPreview && <AdaptiveVideo uri={postVideoPreview} style={styles.postPreview} ratio={postMediaRatio || undefined} />}
              <View style={styles.postActionsRow}>
                <Pressable style={styles.iconButton} onPress={pickPostImage}>
                  <Ionicons name="image-outline" size={18} color="#4c6fff" />
                  <Text style={styles.iconButtonText}>{t("common.photo")}</Text>
                </Pressable>
                <Pressable style={styles.iconButton} onPress={pickPostVideo}>
                  <Ionicons name="videocam-outline" size={18} color="#4c6fff" />
                  <Text style={styles.iconButtonText}>{t("common.video")}</Text>
                </Pressable>
              </View>
              <Pressable style={styles.primaryButton} onPress={handleCreatePost}>
                <Text style={styles.primaryButtonText}>{t("common.post")}</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={openStoryPicker}>
                <Ionicons name="add-circle-outline" size={18} color="#4c6fff" />
                <Text style={styles.secondaryButtonText}>{t("business.publishStory")}</Text>
              </Pressable>
            </View>

            {/* Stories Section - Using shared component */}
            <StoriesSection stories={stories} onViewStory={openStoryViewer} />

            {/* Photos Gallery - Using component */}
            <PhotoGallerySection
              images={galleryImages}
              onViewImage={openImageViewer}
              onDeleteImage={deleteGalleryImage}
              onAddImage={addGalleryImage}
            />

            {/* Uploaded Videos - Using new VideoGalleryUpload */}
            <VideoGalleryUpload
              videos={galleryVideos}
              onVideosChange={async (newVideos) => {
                if (sessionToken && artist) {
                  try {
                    await updateArtist(sessionToken, artist.artist_id, { video_urls: newVideos });
                    setGalleryVideos(newVideos);
                  } catch (error) {
                    console.error("[VideoGallery] Failed to update artist:", error);
                  }
                }
              }}
              sessionToken={sessionToken || ""}
              title={t("artistProfile.uploadedVideos") || "Videos"}
              emptyText={t("artistProfile.noVideos") || "No videos yet"}
            />

            {/* YouTube Links - Using component */}
            <YouTubeGallerySection
              videos={artist.youtube_links || []}
              newYoutubeLink={newYoutubeLink}
              onLinkChange={setNewYoutubeLink}
              onAddLink={addYoutubeLink}
              onDeleteLink={deleteYoutubeLink}
            />
          </>
        )}
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setEditModal(false)}>
              <Ionicons name="close" size={24} color="#4c6fff" />
            </Pressable>
            <Text style={styles.modalTitle}>{t("business.editInfo")}</Text>
            <Pressable onPress={saveArtist}>
              <Text style={styles.saveButton}>{t("common.save")}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.inputLabel}>{t("artist.name")}</Text>
            <TextInput value={form.name} onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))} style={styles.input} placeholder={t("artist.name")} />
            
            <Text style={styles.inputLabel}>{t("artist.bio")}</Text>
            <TextInput value={form.bio} onChangeText={(v) => setForm((prev) => ({ ...prev, bio: v }))} style={[styles.input, styles.textArea]} placeholder={t("artist.bio")} multiline />
            
            <Text style={styles.inputLabel}>{t("artist.genres")}</Text>
            <TextInput value={form.genres} onChangeText={(v) => setForm((prev) => ({ ...prev, genres: v }))} style={styles.input} placeholder={t("artist.genresHint")} />
            
            <Text style={styles.inputLabel}>{t("artist.socialLinks")}</Text>
            <View style={styles.socialInputGroup}>
              <View style={styles.socialInputRow}>
                <Ionicons name="logo-instagram" size={20} color="#E4405F" />
                <TextInput value={form.socials.instagram || ""} onChangeText={(v) => setForm((prev) => ({ ...prev, socials: { ...prev.socials, instagram: v } }))} style={[styles.input, { flex: 1, marginLeft: 8 }]} placeholder="Instagram URL" />
              </View>
              <View style={styles.socialInputRow}>
                <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                <TextInput value={form.socials.youtube || ""} onChangeText={(v) => setForm((prev) => ({ ...prev, socials: { ...prev.socials, youtube: v } }))} style={[styles.input, { flex: 1, marginLeft: 8 }]} placeholder="YouTube Channel URL" />
              </View>
              <View style={styles.socialInputRow}>
                <Ionicons name="cloud" size={20} color="#FF5500" />
                <TextInput value={form.socials.soundcloud || ""} onChangeText={(v) => setForm((prev) => ({ ...prev, socials: { ...prev.socials, soundcloud: v } }))} style={[styles.input, { flex: 1, marginLeft: 8 }]} placeholder="SoundCloud URL" />
              </View>
            </View>

            <Text style={styles.inputLabel}>{t("artist.town")}</Text>
            <PlacesAutocompleteInput value={form.town} onChangeText={(v) => setForm((prev) => ({ ...prev, town: v }))} style={styles.input} placeholder={t("artist.town")} />
            
            <Text style={styles.inputLabel}>{t("artist.profilePhoto")}</Text>
            {form.profile_photo ? (
              <Image source={{ uri: form.profile_photo }} style={styles.editImagePreview} />
            ) : (
              <View style={styles.imagePlaceholder}><Ionicons name="person-outline" size={40} color="#9ca3af" /></View>
            )}
            <Pressable style={styles.secondaryButton} onPress={() => pickImage("profile")}>
              <Ionicons name="camera-outline" size={18} color="#4c6fff" />
              <Text style={styles.secondaryButtonText}>{t("artist.uploadProfilePhoto")}</Text>
            </Pressable>
            
            <Text style={styles.inputLabel}>{t("artist.coverPhoto")}</Text>
            {form.cover_photo ? (
              <Image source={{ uri: form.cover_photo }} style={styles.editCoverPreview} />
            ) : (
              <View style={[styles.imagePlaceholder, { height: 120 }]}><Ionicons name="image-outline" size={40} color="#9ca3af" /></View>
            )}
            <Pressable style={styles.secondaryButton} onPress={() => pickImage("cover")}>
              <Ionicons name="camera-outline" size={18} color="#4c6fff" />
              <Text style={styles.secondaryButtonText}>{t("artist.uploadCoverPhoto")}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Event Modal */}
      <Modal visible={eventModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setEventModal(false)}>
              <Ionicons name="close" size={24} color="#4c6fff" />
            </Pressable>
            <Text style={styles.modalTitle}>{eventEditing ? t("business.editEvent") : t("business.addEvent")}</Text>
            <Pressable onPress={handleSaveEvent}>
              <Text style={styles.saveButton}>{t("common.save")}</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.inputLabel}>{t("artist.eventTitle")}</Text>
            <TextInput value={eventForm.title} onChangeText={(v) => setEventForm((prev) => ({ ...prev, title: v }))} style={styles.input} placeholder={t("artist.eventTitle")} />
            
            <Text style={styles.inputLabel}>{t("artist.description")}</Text>
            <TextInput value={eventForm.description} onChangeText={(v) => setEventForm((prev) => ({ ...prev, description: v }))} style={[styles.input, styles.textArea]} placeholder={t("artist.description")} multiline />
            
            <Text style={styles.inputLabel}>{t("artist.eventDate")}</Text>
            <Pressable style={styles.datePickerButton} onPress={() => setShowEventDatePicker(true)}>
              <Ionicons name="calendar-outline" size={20} color="#4c6fff" />
              <Text style={styles.datePickerText}>{eventDate.toLocaleDateString()}</Text>
            </Pressable>
            {showEventDatePicker && (
              <DateTimePicker value={eventDate} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={handleEventDateChange} minimumDate={new Date()} />
            )}
            
            <Text style={styles.inputLabel}>{t("artist.eventTime")}</Text>
            <Pressable style={styles.datePickerButton} onPress={() => setShowEventTimePicker(true)}>
              <Ionicons name="time-outline" size={20} color="#4c6fff" />
              <Text style={styles.datePickerText}>{eventTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
            </Pressable>
            {showEventTimePicker && (
              <DateTimePicker value={eventTime} mode="time" display={Platform.OS === "ios" ? "spinner" : "default"} onChange={handleEventTimeChange} />
            )}
            
            <Text style={styles.inputLabel}>{t("artist.location")}</Text>
            <PlacesAutocompleteInput value={eventForm.location} onChangeText={(v) => setEventForm((prev) => ({ ...prev, location: v }))} style={styles.input} placeholder={t("artist.location")} />
            
            <Text style={styles.inputLabel}>{t("artist.eventImage")}</Text>
            {eventForm.image_base64 ? (
              <Image source={{ uri: eventForm.image_base64 }} style={styles.editCoverPreview} />
            ) : (
              <View style={[styles.imagePlaceholder, { height: 120 }]}><Ionicons name="image-outline" size={40} color="#9ca3af" /></View>
            )}
            <Pressable style={styles.secondaryButton} onPress={pickEventImage}>
              <Ionicons name="camera-outline" size={18} color="#4c6fff" />
              <Text style={styles.secondaryButtonText}>{t("artist.uploadEventPhoto")}</Text>
            </Pressable>
            
            <Text style={styles.inputLabel}>{t("artist.eventVideo") || "Event Video"}</Text>
            {eventVideoPreview ? (
              <View style={styles.videoPreviewContainer}>
                <AdaptiveVideo uri={eventVideoPreview} style={styles.editCoverPreview} />
                <Pressable style={styles.removeVideoButton} onPress={() => { setEventVideoPreview(null); setEventForm((prev) => ({ ...prev, video_url: "" })); }}>
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                </Pressable>
              </View>
            ) : (
              <View style={[styles.imagePlaceholder, { height: 120 }]}><Ionicons name="videocam-outline" size={40} color="#9ca3af" /></View>
            )}
            <Pressable style={styles.secondaryButton} onPress={pickEventVideo}>
              <Ionicons name="videocam-outline" size={18} color="#4c6fff" />
              <Text style={styles.secondaryButtonText}>{t("artist.uploadEventVideo") || "Upload Event Video"}</Text>
            </Pressable>
            
            <Pressable style={styles.primaryButton} onPress={handleSaveEvent}>
              <Text style={styles.primaryButtonText}>{eventEditing ? t("business.saveEvent") : t("business.publishEvent")}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Story Viewer Modal */}
      <Modal visible={storyViewerVisible} animationType="fade" transparent onRequestClose={() => setStoryViewerVisible(false)}>
        <View style={styles.storyViewerOverlay}>
          <Pressable style={styles.storyViewerClose} onPress={() => setStoryViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {stories[currentStoryIndex] && (
            <Image source={{ uri: stories[currentStoryIndex].image_base64 }} style={styles.storyViewerImage} resizeMode="contain" />
          )}
          <View style={styles.storyViewerNav}>
            <Pressable style={styles.storyNavButton} onPress={() => navigateStory('prev')}>
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </Pressable>
            <Text style={styles.storyCounter}>{currentStoryIndex + 1} / {stories.length}</Text>
            <Pressable style={styles.storyNavButton} onPress={() => navigateStory('next')}>
              <Ionicons name="chevron-forward" size={32} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal visible={imageViewerVisible} animationType="fade" transparent onRequestClose={() => setImageViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <Pressable style={styles.viewerCloseButton} onPress={() => setImageViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedImage && <Image source={{ uri: selectedImage }} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>

      {/* Video Viewer Modal */}
      <Modal visible={videoViewerVisible} animationType="fade" transparent onRequestClose={() => setVideoViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <Pressable style={styles.viewerCloseButton} onPress={() => setVideoViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedVideo && (
            <View style={styles.viewerVideoContainer}>
              <AdaptiveVideo uri={selectedVideo} style={styles.viewerVideo} autoPlay showMuteButton isLooping />
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f9fafb" },
  content: { padding: 16, paddingBottom: 100 },
  backButton: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backButtonText: { color: "#4c6fff", fontWeight: "600", marginLeft: 4 },
  title: { fontSize: 24, fontWeight: "bold", color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#6b7280", marginBottom: 20 },
  // Tab Navigation
  tabContainer: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 16, padding: 4, marginBottom: 16 },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, gap: 6 },
  tabActive: { backgroundColor: "#f0f4ff" },
  tabText: { fontSize: 13, fontWeight: "500", color: "#6b7280" },
  tabTextActive: { color: "#4c6fff" },
  tabContent: { marginBottom: 16 },
  // Analytics
  analyticsLoading: { alignItems: "center", paddingVertical: 40 },
  loadingText: { color: "#6b7280", marginTop: 12 },
  analyticsEmpty: { alignItems: "center", paddingVertical: 40, backgroundColor: "#fff", borderRadius: 16 },
  emptySubtext: { color: "#9ca3af", marginTop: 4, fontSize: 13 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#111827", marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, fontSize: 15, backgroundColor: "#fff" },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#4c6fff", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#f3f4f6", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 10, gap: 8 },
  secondaryButtonText: { color: "#4c6fff", fontWeight: "600" },
  iconButton: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#f3f4f6", gap: 6 },
  iconButtonText: { color: "#4c6fff", fontSize: 14, fontWeight: "500" },
  postActionsRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 12 },
  postPreview: { width: "100%", height: 200, borderRadius: 12, marginBottom: 12, backgroundColor: "#f3f4f6" },
  emptyText: { color: "#9ca3af", fontSize: 14, textAlign: "center", paddingVertical: 12 },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  modalTitle: { fontSize: 18, fontWeight: "600", color: "#111827" },
  modalContent: { padding: 16, paddingBottom: 40 },
  saveButton: { color: "#4c6fff", fontWeight: "600", fontSize: 16 },
  inputLabel: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 6, marginTop: 8 },
  datePickerButton: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12, gap: 10 },
  datePickerText: { fontSize: 15, color: "#111827" },
  editImagePreview: { width: 100, height: 100, borderRadius: 50, marginBottom: 12, alignSelf: "center" },
  editCoverPreview: { width: "100%", height: 120, borderRadius: 12, marginBottom: 12 },
  imagePlaceholder: { width: "100%", height: 100, backgroundColor: "#f3f4f6", borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  socialInputGroup: { marginBottom: 16 },
  socialInputRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  videoPreviewContainer: { position: "relative", width: "100%", marginBottom: 12 },
  removeVideoButton: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 12, padding: 2 },
  // Story Viewer
  storyViewerOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.95)", justifyContent: "center", alignItems: "center" },
  storyViewerClose: { position: "absolute", top: 50, right: 20, zIndex: 10, backgroundColor: "rgba(255, 255, 255, 0.15)", borderRadius: 20, padding: 8 },
  storyViewerImage: { width: "90%", height: "70%" },
  storyViewerNav: { position: "absolute", bottom: 60, flexDirection: "row", alignItems: "center", gap: 30 },
  storyNavButton: { backgroundColor: "rgba(255, 255, 255, 0.15)", borderRadius: 25, padding: 10 },
  storyCounter: { color: "#fff", fontSize: 16, fontWeight: "600" },
  // Media Viewer
  viewerOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.95)", justifyContent: "center", alignItems: "center" },
  viewerCloseButton: { position: "absolute", top: 50, right: 20, zIndex: 10, backgroundColor: "rgba(255, 255, 255, 0.15)", borderRadius: 20, padding: 8 },
  viewerImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.8 },
  viewerVideoContainer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.6, justifyContent: "center", alignItems: "center" },
  viewerVideo: { width: "100%", height: "100%" },
});

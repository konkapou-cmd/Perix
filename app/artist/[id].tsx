import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
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
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import BusinessMap from "../../components/BusinessMap";
import {
  ArtistDetail,
  createBookingRequest,
  getCommonFriends,
  getArtistDetail,
  getArtistFanPosts,
  Post,
  ProfileTheme,
  toggleFriend,
  updateArtist,
  uploadMedia,
  UploadProgress,
  EventItem,
  reportArtist,
} from "../../lib/api";
import AdaptiveImage from "../../components/AdaptiveImage";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import UploadProgressModal from "../../components/UploadProgressModal";
import { useAuth } from "../../context/AuthContext";
import { useSafeNavigation } from "../../hooks/useSafeNavigation";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function ArtistDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { sessionToken, user } = useAuth();
  const { safeGoBack, router } = useSafeNavigation();
  const [artistDetail, setArtistDetail] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingForm, setBookingForm] = useState({
    eventDate: "",
    message: "",
    email: user?.email || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [friendList, setFriendList] = useState<
    { user_id: string; name: string; profile_photo?: string | null }[]
  >([]);
  const [isFriend, setIsFriend] = useState(false);
  const [taggedPosts, setTaggedPosts] = useState<Post[]>([]);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // Viewer State
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [videoViewerVisible, setVideoViewerVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  
  // Report State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  // Get theme colors from artist profile (with defaults)
  const artistTheme = useMemo(() => {
    const theme = artistDetail?.artist?.theme;
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
  }, [artistDetail?.artist?.theme]);

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
    const stories = artistDetail?.stories || [];
    if (direction === 'next' && currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
    } else if (direction === 'prev' && currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else {
      setStoryViewerVisible(false);
    }
  };

  const getYoutubeVideoId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/);
    return match ? match[1] : null;
  };

  const deleteYoutubeVideo = async (index: number) => {
    if (!sessionToken || !artistDetail) return;
    try {
      const youtubeVideos = (artistDetail.artist.video_urls || []).filter(v => v.includes('youtube') || v.includes('youtu.be'));
      const nonYoutubeVideos = (artistDetail.artist.video_urls || []).filter(v => !v.includes('youtube') && !v.includes('youtu.be'));
      youtubeVideos.splice(index, 1);
      const newVideoUrls = [...nonYoutubeVideos, ...youtubeVideos];
      await updateArtist(sessionToken, artistDetail.artist.artist_id, { video_urls: newVideoUrls });
      loadArtist();
    } catch (e) {
      console.error("Failed to delete YouTube video:", e);
    }
  };

  const isOwner = artistDetail?.artist.owner_id === user?.user_id;

  const loadArtist = useCallback(async () => {
    if (!sessionToken || !id) return;
    setLoading(true);
    try {
      const detail = await getArtistDetail(sessionToken, id);
      setArtistDetail(detail);
      
      if (detail.artist.owner_id) {
        try {
          const friendsData = await getCommonFriends(sessionToken, detail.artist.owner_id);
          setFriendList(friendsData.common);
          setIsFriend(friendsData.is_friend);
        } catch (e) {
          console.log("Friends data fetch failed:", e);
        }
        
        try {
          const fanPosts = await getArtistFanPosts(sessionToken, id);
          setTaggedPosts(fanPosts);
        } catch (e) {
          console.log("Fan posts fetch failed:", e);
        }
      }
    } catch (error) {
      console.error("Failed to load artist detail:", error);
      setArtistDetail(null);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, id]);

  useEffect(() => {
    loadArtist();
  }, [loadArtist]);

  const handleBookingRequest = async () => {
    if (!sessionToken || !artistDetail || !bookingForm.message) return;
    setSubmitting(true);
    try {
      await createBookingRequest(sessionToken, artistDetail.artist.artist_id, {
        event_date: bookingForm.eventDate || undefined,
        message: bookingForm.message,
        contact_email: bookingForm.email || undefined,
      });
      Alert.alert(t('common.success'), t('artistProfile.bookingRequestSent'));
      setBookingForm({ eventDate: "", message: "", email: bookingForm.email });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFriend = async () => {
    if (!sessionToken || !artistDetail?.artist.owner_id) return;
    const result = await toggleFriend(sessionToken, artistDetail.artist.owner_id);
    setIsFriend(result.is_friend);
    const friendsData = await getCommonFriends(sessionToken, artistDetail.artist.owner_id);
    setFriendList(friendsData.common);
  };

  // Handle report artist
  const handleReportArtist = async () => {
    if (!sessionToken || !id || !reportReason.trim()) return;
    setReportLoading(true);
    try {
      await reportArtist(sessionToken, id as string, reportReason.trim());
      setReportModalVisible(false);
      setReportReason("");
      Alert.alert(
        t("userProfile.reportSubmitted") || "Report Submitted",
        t("artistProfile.reportMessage") || "Thank you for your report. Our team will review it shortly.",
        [{ text: t("common.ok"), onPress: () => safeGoBack() }]
      );
    } catch (error: any) {
      console.error("Failed to report artist:", error);
      Alert.alert(t("common.error"), error.message || t("common.error"));
    } finally {
      setReportLoading(false);
    }
  };

  const shareEventToWhatsApp = async (event: EventItem) => {
    const eventDate = new Date(event.start_time).toLocaleDateString();
    const eventTime = new Date(event.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const location = event.location || "";
    // Use /share/ prefix for public deep links
    const eventUrl = `${BACKEND_URL?.replace('/api', '')}/share/event/${event.event_id}`;
    const message = `${t("events.invitationMessage", { 
      title: event.title, 
      organizer: artistDetail?.artist.name || "",
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

  // Owner upload functions
  const uploadCoverPhotoDirect = async () => {
    if (!sessionToken || !artistDetail || !isOwner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      try {
        const updated = await updateArtist(sessionToken, artistDetail.artist.artist_id, { cover_photo: uri });
        setArtistDetail((prev) => (prev ? { ...prev, artist: updated } : prev));
      } catch (error) {
        Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
      }
    }
  };

  const uploadProfilePhotoDirect = async () => {
    if (!sessionToken || !artistDetail || !isOwner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      try {
        const updated = await updateArtist(sessionToken, artistDetail.artist.artist_id, { profile_photo: uri });
        setArtistDetail((prev) => (prev ? { ...prev, artist: updated } : prev));
      } catch (error) {
        Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
      }
    }
  };

  const addGalleryImageDirect = async () => {
    if (!sessionToken || !artistDetail || !isOwner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      try {
        const newImages = [...(artistDetail.artist.gallery_images || []), uri];
        const updated = await updateArtist(sessionToken, artistDetail.artist.artist_id, { gallery_images: newImages });
        setArtistDetail((prev) => (prev ? { ...prev, artist: updated } : prev));
      } catch (error) {
        Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
      }
    }
  };

  const addGalleryVideoDirect = async () => {
    if (!sessionToken || !artistDetail || !isOwner) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "preparing", progress: 0 });
        const uploaded = await uploadMedia(sessionToken, result.assets[0].uri, "video", (progress) => {
          setUploadProgress(progress);
        });
        const newVideos = [...(artistDetail.artist.video_urls || []), uploaded];
        const updated = await updateArtist(sessionToken, artistDetail.artist.artist_id, { video_urls: newVideos });
        setArtistDetail((prev) => (prev ? { ...prev, artist: updated } : prev));
        setTimeout(() => {
          setShowUploadProgress(false);
          setUploadProgress(null);
        }, 1000);
      } catch (error) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
      }
    }
  };

  const deleteGalleryImage = (index: number) => {
    if (!sessionToken || !artistDetail || !isOwner) return;
    Alert.alert(t("common.delete"), t("businessProfile.deleteImageConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            const newImages = (artistDetail.artist.gallery_images || []).filter((_, i) => i !== index);
            const updated = await updateArtist(sessionToken, artistDetail.artist.artist_id, { gallery_images: newImages });
            setArtistDetail((prev) => (prev ? { ...prev, artist: updated } : prev));
          } catch (error) {
            Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
          }
        },
      },
    ]);
  };

  const deleteGalleryVideo = (index: number) => {
    if (!sessionToken || !artistDetail || !isOwner) return;
    Alert.alert(t("common.delete"), t("businessProfile.deleteVideoConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            const nonYtVideos = (artistDetail.artist.video_urls || []).filter(v => !v.includes('youtube') && !v.includes('youtu.be'));
            const newVideos = nonYtVideos.filter((_, i) => i !== index);
            const ytVideos = (artistDetail.artist.video_urls || []).filter(v => v.includes('youtube') || v.includes('youtu.be'));
            const updated = await updateArtist(sessionToken, artistDetail.artist.artist_id, { video_urls: [...newVideos, ...ytVideos] });
            setArtistDetail((prev) => (prev ? { ...prev, artist: updated } : prev));
          } catch (error) {
            Alert.alert(t("common.error"), t("business.pleaseTryAgain"));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4c6fff" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (!artistDetail) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Pressable style={styles.backButton} onPress={safeGoBack}>
          <Ionicons name="chevron-back" size={20} color="#4c6fff" />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>
        <View style={styles.errorContent}>
          <View style={styles.errorIconContainer}>
            <Ionicons name="alert-circle-outline" size={56} color="#ef4444" />
          </View>
          <Text style={styles.errorTitle}>{t('artistProfile.notFound')}</Text>
          <Text style={styles.errorSubtitle}>{t('common.tryAgainLater')}</Text>
          <Pressable style={styles.retryButton} onPress={() => { setLoading(true); loadArtist(); }}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { artist, events } = artistDetail;
  const uploadedVideos = (artist.video_urls || []).filter(v => !v.includes('youtube') && !v.includes('youtu.be'));
  const youtubeVideos = (artist.video_urls || []).filter(v => v.includes('youtube') || v.includes('youtu.be'));

  return (
    <SafeAreaView style={[
      styles.container,
      artistTheme.hasCustomTheme && { backgroundColor: artistTheme.backgroundColor }
    ]}>
      {/* Theme Gradient Background */}
      {artistTheme.useGradient && artistTheme.gradientStart && artistTheme.gradientEnd && (
        <LinearGradient
          colors={[artistTheme.gradientStart, artistTheme.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
      )}
      
      <UploadProgressModal visible={showUploadProgress} progress={uploadProgress} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Hero Section with Cover */}
        <View style={styles.heroSection}>
          {isOwner ? (
            <Pressable onPress={uploadCoverPhotoDirect} style={styles.coverContainer}>
              {artist.cover_photo ? (
                <Image source={{ uri: artist.cover_photo }} style={styles.coverImage} />
              ) : (
                <View style={[styles.coverPlaceholder, artistTheme.hasCustomTheme && { backgroundColor: artistTheme.primaryColor }]}>
                  <Ionicons name="camera-outline" size={32} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.coverPlaceholderText}>{t("businessProfile.tapToAddCover")}</Text>
                </View>
              )}
              <View style={styles.coverOverlay} />
            </Pressable>
          ) : artist.cover_photo ? (
            <View style={styles.coverContainer}>
              <Image source={{ uri: artist.cover_photo }} style={styles.coverImage} />
              <View style={styles.coverOverlay} />
            </View>
          ) : (
            <View style={styles.coverContainer}>
              <View style={[styles.coverPlaceholder, { backgroundColor: artistTheme.hasCustomTheme ? artistTheme.primaryColor : '#4c6fff' }]}>
                <Ionicons name="musical-notes" size={48} color="rgba(255,255,255,0.3)" />
              </View>
              <View style={styles.coverOverlay} />
            </View>
          )}
          
          {/* Back Button on Hero */}
          <Pressable style={styles.heroBackButton} onPress={safeGoBack}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          
          {/* Profile Info Overlay */}
          <View style={styles.profileOverlay}>
            {isOwner ? (
              <Pressable style={[styles.avatarContainer, artistTheme.hasCustomTheme && { borderColor: artistTheme.primaryColor }]} onPress={uploadProfilePhotoDirect}>
                {artist.profile_photo || artist.gallery_images?.[0] ? (
                  <Image source={{ uri: artist.profile_photo || artist.gallery_images?.[0] }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarPlaceholder, artistTheme.hasCustomTheme && { backgroundColor: artistTheme.cardColor }]}>
                    <Ionicons name="camera-outline" size={24} color={artistTheme.primaryColor} />
                  </View>
                )}
                <View style={[styles.avatarEditBadge, artistTheme.hasCustomTheme && { backgroundColor: artistTheme.primaryColor }]}>
                  <Ionicons name="camera" size={12} color="#fff" />
                </View>
              </Pressable>
            ) : (
              <View style={styles.avatarContainer}>
                {artist.profile_photo || artist.gallery_images?.[0] ? (
                  <Image source={{ uri: artist.profile_photo || artist.gallery_images?.[0] }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="musical-notes" size={28} color="#4c6fff" />
                  </View>
                )}
              </View>
            )}
            <Text style={styles.artistName}>{artist.name}</Text>
            {artist.town && (
              <View style={styles.locationBadge}>
                <Ionicons name="location" size={14} color="#6b7280" />
                <Text style={styles.locationText}>{artist.town}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          
          {/* Bio Section */}
          {artist.bio && (
            <View style={styles.bioSection}>
              <Text style={styles.bioText}>{artist.bio}</Text>
            </View>
          )}

          {/* Genres */}
          {artist.genres.length > 0 && (
            <View style={styles.genresSection}>
              {artist.genres.map((genre) => (
                <View key={genre} style={styles.genreChip}>
                  <Ionicons name="musical-note" size={12} color="#4c6fff" />
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Quick Actions */}
          <View style={styles.quickActionsRow}>
            {artist.owner_id !== user?.user_id && (
              <Pressable 
                style={[styles.actionButton, isFriend && styles.actionButtonActive]} 
                onPress={handleToggleFriend}
              >
                <Ionicons name={isFriend ? "people" : "person-add"} size={18} color={isFriend ? "#fff" : "#4c6fff"} />
                <Text style={[styles.actionButtonText, isFriend && styles.actionButtonTextActive]}>
                  {isFriend ? t('artistProfile.friends') : t('artistProfile.makeFriends')}
                </Text>
              </Pressable>
            )}
            {/* Share Profile Button */}
            <Pressable 
              style={styles.socialButton}
              onPress={async () => {
                try {
                  // Use /share/ prefix for public deep links
                  const artistUrl = `${BACKEND_URL?.replace('/api', '')}/share/artist/${artist.artist_id}`;
                  await Share.share({
                    message: `${t('artistProfile.checkOutArtist', { name: artist.name })} - Perix\n\n${artistUrl}`,
                    title: artist.name,
                  });
                } catch (e) {
                  console.log('Share failed:', e);
                }
              }}
            >
              <Ionicons name="share-social" size={20} color="#4c6fff" />
            </Pressable>
            {artist.socials?.instagram && (
              <Pressable 
                style={styles.socialButton}
                onPress={() => Linking.openURL(artist.socials.instagram.startsWith('http') ? artist.socials.instagram : `https://${artist.socials.instagram}`)}
              >
                <Ionicons name="logo-instagram" size={20} color="#E1306C" />
              </Pressable>
            )}
            {artist.socials?.youtube && (
              <Pressable 
                style={styles.socialButton}
                onPress={() => Linking.openURL(artist.socials.youtube.startsWith('http') ? artist.socials.youtube : `https://${artist.socials.youtube}`)}
              >
                <Ionicons name="logo-youtube" size={20} color="#FF0000" />
              </Pressable>
            )}
            {artist.socials?.soundcloud && (
              <Pressable 
                style={styles.socialButton}
                onPress={() => Linking.openURL(artist.socials.soundcloud.startsWith('http') ? artist.socials.soundcloud : `https://${artist.socials.soundcloud}`)}
              >
                <Ionicons name="cloud" size={20} color="#FF5500" />
              </Pressable>
            )}
            {/* Report Artist Button - only show if not owner */}
            {user?.user_id !== artist.owner_id && (
              <Pressable 
                style={styles.reportButton}
                onPress={() => setReportModalVisible(true)}
              >
                <Ionicons name="flag" size={20} color="#ef4444" />
              </Pressable>
            )}
          </View>

          {/* Stories Section */}
          {(artistDetail?.stories || []).length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="time" size={20} color="#8b5cf6" />
                  <Text style={styles.sectionTitle}>{t("business.activeStories")}</Text>
                </View>
                <Text style={styles.sectionCount}>{artistDetail?.stories?.length || 0}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesScroll}>
                {(artistDetail?.stories || []).map((story, index) => (
                  <Pressable key={story.story_id} onPress={() => openStoryViewer(index)} style={styles.storyItem}>
                    <View style={styles.storyRing}>
                      <Image source={{ uri: story.image_base64 }} style={styles.storyImage} />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Location - City Text */}
          {(artist.town || artist.city) && (
            <View style={styles.section}>
              <View style={styles.locationTextContainer}>
                <Ionicons name="location" size={22} color="#10b981" />
                <Text style={styles.locationTextEnhanced}>
                  {artist.town || artist.city}
                </Text>
                <Text style={styles.locationRadius}>
                  {t('artistProfile.serviceArea') || '(+25km radius)'}
                </Text>
              </View>
            </View>
          )}

          {/* EVENTS - Moved up right after Location */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar" size={20} color="#f59e0b" />
                <Text style={styles.sectionTitle}>{t('artistProfile.upcomingEvents')}</Text>
              </View>
              <Text style={styles.sectionCount}>{events.length}</Text>
            </View>
            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>{t('artistProfile.noUpcomingEvents')}</Text>
              </View>
            ) : (
              <View style={styles.eventsList}>
                {events.map((event) => (
                  <Pressable 
                    key={event.event_id} 
                    style={styles.eventCard}
                    onPress={() => router.push(`/event/${event.event_id}`)}
                  >
                    {event.image_base64 && (
                      <Image source={{ uri: event.image_base64 }} style={styles.eventImage} />
                    )}
                    <View style={styles.eventContent}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      <View style={styles.eventMeta}>
                        <Ionicons name="calendar-outline" size={14} color="#6b7280" />
                        <Text style={styles.eventMetaText}>
                          {new Date(event.start_time).toLocaleDateString()} · {new Date(event.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>
                      {event.location && (
                        <View style={styles.eventMeta}>
                          <Ionicons name="location-outline" size={14} color="#6b7280" />
                          <Text style={styles.eventMetaText}>{event.location}</Text>
                        </View>
                      )}
                    </View>
                    <Pressable 
                      style={styles.shareButton} 
                      onPress={(e) => { e.stopPropagation(); shareEventToWhatsApp(event); }}
                    >
                      <Ionicons name="share-social" size={18} color="#4c6fff" />
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Photos Gallery */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="images" size={20} color="#4c6fff" />
                <Text style={styles.sectionTitle}>{t('artistProfile.photos') || 'Photos'}</Text>
              </View>
              <Text style={styles.sectionCount}>{artist.gallery_images?.length || 0}</Text>
            </View>
            {(artist.gallery_images?.length || 0) > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
                {artist.gallery_images?.map((image, index) => (
                  <Pressable key={`img-${index}`} style={styles.galleryItem} onPress={() => openImageViewer(image)}>
                    <Image source={{ uri: image }} style={styles.galleryImage} />
                    {isOwner && (
                      <Pressable style={styles.deleteButton} onPress={(e) => { e.stopPropagation(); deleteGalleryImage(index); }}>
                        <Ionicons name="close" size={16} color="#fff" />
                      </Pressable>
                    )}
                    <View style={styles.zoomBadge}>
                      <Ionicons name="expand" size={12} color="#fff" />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>{t('artistProfile.noPhotos') || 'No photos yet'}</Text>
              </View>
            )}
            {isOwner && (
              <Pressable style={styles.addButton} onPress={addGalleryImageDirect}>
                <Ionicons name="add" size={18} color="#4c6fff" />
                <Text style={styles.addButtonText}>{t("businessProfile.addPhoto")}</Text>
              </Pressable>
            )}
          </View>

          {/* Videos Gallery */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="videocam" size={20} color="#ef4444" />
                <Text style={styles.sectionTitle}>{t('artistProfile.uploadedVideos') || 'Videos'}</Text>
              </View>
              <Text style={styles.sectionCount}>{uploadedVideos.length}</Text>
            </View>
            {uploadedVideos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
                {uploadedVideos.map((video, index) => (
                  <Pressable key={`vid-${index}`} style={styles.galleryItem} onPress={() => openVideoViewer(video)}>
                    <AdaptiveVideo uri={video} style={styles.galleryImage} />
                    <View style={styles.playOverlay}>
                      <Ionicons name="play-circle" size={36} color="#fff" />
                    </View>
                    {isOwner && (
                      <Pressable style={styles.deleteButton} onPress={(e) => { e.stopPropagation(); deleteGalleryVideo(index); }}>
                        <Ionicons name="close" size={16} color="#fff" />
                      </Pressable>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="videocam-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>{t('artistProfile.noVideos') || 'No videos yet'}</Text>
              </View>
            )}
            {isOwner && (
              <Pressable style={styles.addButton} onPress={addGalleryVideoDirect}>
                <Ionicons name="add" size={18} color="#4c6fff" />
                <Text style={styles.addButtonText}>{t("businessProfile.addVideo")}</Text>
              </Pressable>
            )}
          </View>

          {/* YouTube Videos */}
          {youtubeVideos.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                  <Text style={styles.sectionTitle}>YouTube</Text>
                </View>
                <Text style={styles.sectionCount}>{youtubeVideos.length}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
                {youtubeVideos.map((link, index) => {
                  const videoId = getYoutubeVideoId(link);
                  return (
                    <Pressable key={`yt-${index}`} style={styles.youtubeItem} onPress={() => Linking.openURL(link)}>
                      <Image source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }} style={styles.youtubeThumbnail} />
                      <View style={styles.youtubePlayOverlay}>
                        <Ionicons name="logo-youtube" size={40} color="#FF0000" />
                      </View>
                      {isOwner && (
                        <Pressable style={styles.deleteButton} onPress={(e) => { e.stopPropagation(); deleteYoutubeVideo(index); }}>
                          <Ionicons name="close" size={16} color="#fff" />
                        </Pressable>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Fan Gallery */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="people" size={20} color="#10b981" />
                <Text style={styles.sectionTitle}>{t('artistProfile.fanGallery')}</Text>
              </View>
              <Text style={styles.sectionCount}>{taggedPosts.length}</Text>
            </View>
            {taggedPosts.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryScroll}>
                {taggedPosts.map((post) => (
                  <Pressable 
                    key={post.post_id} 
                    style={styles.fanGalleryItem}
                    onPress={() => {
                      if (post.image_base64) openImageViewer(post.image_base64);
                      else if (post.video_url) openVideoViewer(post.video_url);
                    }}
                  >
                    {post.image_base64 ? (
                      <AdaptiveImage uri={post.image_base64} style={styles.galleryImage} />
                    ) : post.video_url ? (
                      <>
                        <AdaptiveVideo uri={post.video_url} style={styles.galleryImage} />
                        <View style={styles.playOverlay}>
                          <Ionicons name="play-circle" size={32} color="#fff" />
                        </View>
                      </>
                    ) : null}
                    <View style={styles.fanAuthorBadge}>
                      {post.author.profile_photo ? (
                        <Image source={{ uri: post.author.profile_photo }} style={styles.fanAuthorImage} />
                      ) : (
                        <Text style={styles.fanAuthorInitial}>{post.author.name?.charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color="#d1d5db" />
                <Text style={styles.emptyText}>{t('artistProfile.noFanGallery')}</Text>
              </View>
            )}
          </View>

          {/* Common Friends */}
          {friendList.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="heart" size={20} color="#ec4899" />
                  <Text style={styles.sectionTitle}>{t('artistProfile.commonFriends')}</Text>
                </View>
                <Text style={styles.sectionCount}>{friendList.length}</Text>
              </View>
              <View style={styles.friendsGrid}>
                {friendList.map((friend) => (
                  <View key={friend.user_id} style={styles.friendChip}>
                    {friend.profile_photo ? (
                      <Image source={{ uri: friend.profile_photo }} style={styles.friendAvatar} />
                    ) : (
                      <View style={styles.friendAvatarPlaceholder}>
                        <Text style={styles.friendInitial}>{friend.name?.charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={styles.friendName} numberOfLines={1}>{friend.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Booking Request */}
          {!isOwner && (
            <View style={styles.bookingSection}>
              <View style={styles.bookingHeader}>
                <Ionicons name="mail" size={24} color="#4c6fff" />
                <Text style={styles.bookingTitle}>{t('artistProfile.bookingRequest')}</Text>
              </View>
              <Text style={styles.bookingSubtitle}>{t('artistProfile.bookingDescription') || 'Interested in booking? Send a message!'}</Text>
              <TextInput
                placeholder={t('artistProfile.eventDateFormat')}
                value={bookingForm.eventDate}
                onChangeText={(value) => setBookingForm((prev) => ({ ...prev, eventDate: value }))}
                style={styles.input}
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                placeholder={t('artistProfile.message')}
                value={bookingForm.message}
                onChangeText={(value) => setBookingForm((prev) => ({ ...prev, message: value }))}
                style={[styles.input, styles.textArea]}
                multiline
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                placeholder={t('artistProfile.contactEmail')}
                value={bookingForm.email}
                onChangeText={(value) => setBookingForm((prev) => ({ ...prev, email: value }))}
                style={styles.input}
                keyboardType="email-address"
                placeholderTextColor="#9ca3af"
              />
              <Pressable
                style={[styles.submitButton, submitting && styles.buttonDisabled]}
                onPress={handleBookingRequest}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={styles.submitButtonText}>{t('artistProfile.sendRequest')}</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Story Viewer Modal */}
      <Modal visible={storyViewerVisible} animationType="fade" transparent onRequestClose={() => setStoryViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <Pressable style={styles.viewerClose} onPress={() => setStoryViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {artistDetail?.stories && artistDetail.stories[currentStoryIndex] && (
            <Image source={{ uri: artistDetail.stories[currentStoryIndex].image_base64 }} style={styles.viewerImage} resizeMode="contain" />
          )}
          <View style={styles.viewerNav}>
            <Pressable style={styles.navButton} onPress={() => navigateStory('prev')}>
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </Pressable>
            <Text style={styles.viewerCounter}>{currentStoryIndex + 1} / {artistDetail?.stories?.length || 0}</Text>
            <Pressable style={styles.navButton} onPress={() => navigateStory('next')}>
              <Ionicons name="chevron-forward" size={32} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Image Viewer Modal */}
      <Modal visible={imageViewerVisible} animationType="fade" transparent onRequestClose={() => setImageViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <Pressable style={styles.viewerClose} onPress={() => setImageViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedImage && <Image source={{ uri: selectedImage }} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>

      {/* Video Viewer Modal */}
      <Modal visible={videoViewerVisible} animationType="fade" transparent onRequestClose={() => setVideoViewerVisible(false)}>
        <View style={styles.viewerOverlay}>
          <Pressable style={styles.viewerClose} onPress={() => setVideoViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {selectedVideo && (
            <View style={styles.viewerVideoContainer}>
              <AdaptiveVideo uri={selectedVideo} style={styles.viewerVideo} autoPlay showMuteButton isLooping />
            </View>
          )}
        </View>
      </Modal>

      {/* Report Artist Modal */}
      <Modal
        visible={reportModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalContent}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>{t('artistProfile.reportArtist') || "Report Artist"}</Text>
              <Pressable onPress={() => setReportModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            <Text style={styles.reportModalDescription}>
              {t('artistProfile.reportDescription') || "Please describe why you are reporting this artist. Our team will review your report."}
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
              onPress={handleReportArtist}
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
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: { paddingBottom: 40 },
  
  // Loading & Error States
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
  loadingText: { marginTop: 12, color: "#6b7280", fontSize: 14 },
  errorContainer: { flex: 1, backgroundColor: "#f8fafc", padding: 20 },
  errorContent: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorIconContainer: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#fef2f2", justifyContent: "center", alignItems: "center", marginBottom: 20 },
  errorTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 8 },
  errorSubtitle: { fontSize: 14, color: "#6b7280", marginBottom: 24 },
  retryButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#4c6fff", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, gap: 8 },
  retryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  backButton: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backText: { color: "#4c6fff", fontWeight: "600", marginLeft: 4 },

  // Hero Section
  heroSection: { position: "relative", marginBottom: 60 },
  coverContainer: { height: 220, position: "relative" },
  coverImage: { width: "100%", height: "100%" },
  coverPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#e5e7eb" },
  coverPlaceholderText: { color: "#9ca3af", marginTop: 8, fontSize: 14 },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.2)" },
  heroBackButton: { position: "absolute", top: 16, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", zIndex: 10 },
  
  // Profile Overlay
  profileOverlay: { position: "absolute", bottom: -50, left: 0, right: 0, alignItems: "center" },
  avatarContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, overflow: "hidden", borderWidth: 4, borderColor: "#fff" },
  avatarImage: { width: "100%", height: "100%" },
  avatarPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#eef2ff" },
  avatarEditBadge: { position: "absolute", bottom: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: "#4c6fff", justifyContent: "center", alignItems: "center", borderWidth: 2, borderColor: "#fff" },
  artistName: { fontSize: 24, fontWeight: "800", color: "#111827", marginTop: 12, textAlign: "center" },
  locationBadge: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  locationText: { color: "#6b7280", fontSize: 14 },

  // Main Content
  mainContent: { paddingHorizontal: 20, paddingTop: 16 },

  // Bio
  bioSection: { marginBottom: 16 },
  bioText: { fontSize: 15, color: "#374151", lineHeight: 22, textAlign: "center" },

  // Genres
  genresSection: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 20 },
  genreChip: { flexDirection: "row", alignItems: "center", backgroundColor: "#eef2ff", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, gap: 6 },
  genreText: { color: "#4c6fff", fontSize: 13, fontWeight: "600" },

  // Quick Actions
  quickActionsRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 24 },
  actionButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, gap: 8, borderWidth: 1.5, borderColor: "#4c6fff", shadowColor: "#4c6fff", shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  actionButtonActive: { backgroundColor: "#4c6fff", borderColor: "#4c6fff" },
  actionButtonText: { color: "#4c6fff", fontWeight: "700", fontSize: 14 },
  actionButtonTextActive: { color: "#fff" },
  socialButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },

  // Sections
  section: { backgroundColor: "#fff", borderRadius: 20, padding: 20, marginBottom: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  sectionCount: { fontSize: 14, color: "#9ca3af", fontWeight: "600" },

  // Empty States
  emptyState: { alignItems: "center", paddingVertical: 24 },
  emptyText: { color: "#9ca3af", fontSize: 14, marginTop: 8 },

  // Stories
  storiesScroll: { marginBottom: 8 },
  storyItem: { marginRight: 12 },
  storyRing: { width: 72, height: 72, borderRadius: 36, padding: 3, backgroundColor: "transparent", borderWidth: 2, borderColor: "#8b5cf6" },
  storyImage: { width: "100%", height: "100%", borderRadius: 34 },

  // Map
  mapContainer: { height: 180, borderRadius: 12, overflow: "hidden" },

  // Events
  eventsList: { gap: 12 },
  eventCard: { flexDirection: "row", backgroundColor: "#f8fafc", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#f1f5f9" },
  eventImage: { width: 80, height: 80 },
  eventContent: { flex: 1, padding: 12, justifyContent: "center" },
  eventTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 4 },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  eventMetaText: { color: "#6b7280", fontSize: 12 },
  shareButton: { width: 44, justifyContent: "center", alignItems: "center" },

  // Gallery
  galleryScroll: { marginBottom: 12 },
  galleryItem: { width: 120, height: 120, borderRadius: 16, marginRight: 10, overflow: "hidden", position: "relative" },
  galleryImage: { width: "100%", height: "100%" },
  deleteButton: { position: "absolute", top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.9)", justifyContent: "center", alignItems: "center" },
  zoomBadge: { position: "absolute", bottom: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  playOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  addButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: "#f1f5f9", gap: 6 },
  addButtonText: { color: "#4c6fff", fontWeight: "600", fontSize: 14 },

  // YouTube
  youtubeItem: { width: 180, height: 100, borderRadius: 12, marginRight: 10, overflow: "hidden", position: "relative" },
  youtubeThumbnail: { width: "100%", height: "100%" },
  youtubePlayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "center", alignItems: "center" },

  // Fan Gallery
  fanGalleryItem: { width: 120, height: 120, borderRadius: 16, marginRight: 10, overflow: "hidden", position: "relative" },
  fanAuthorBadge: { position: "absolute", bottom: 8, left: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  fanAuthorImage: { width: 24, height: 24, borderRadius: 12 },
  fanAuthorInitial: { fontSize: 12, fontWeight: "700", color: "#4c6fff" },

  // Friends
  friendsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  friendChip: { flexDirection: "row", alignItems: "center", backgroundColor: "#f8fafc", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, gap: 8 },
  friendAvatar: { width: 28, height: 28, borderRadius: 14 },
  friendAvatarPlaceholder: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#eef2ff", justifyContent: "center", alignItems: "center" },
  friendInitial: { fontSize: 12, fontWeight: "700", color: "#4c6fff" },
  friendName: { fontSize: 13, fontWeight: "600", color: "#374151", maxWidth: 100 },

  // Booking Section
  bookingSection: { backgroundColor: "#fff", borderRadius: 20, padding: 24, marginBottom: 16, shadowColor: "#4c6fff", shadowOpacity: 0.1, shadowRadius: 20, elevation: 4 },
  bookingHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  bookingTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  bookingSubtitle: { color: "#6b7280", fontSize: 14, marginBottom: 20 },
  input: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12, fontSize: 15, color: "#111827" },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  submitButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4c6fff", paddingVertical: 16, borderRadius: 14, gap: 10, shadowColor: "#4c6fff", shadowOpacity: 0.4, shadowRadius: 12, elevation: 4 },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },

  // Viewer Modals
  viewerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  viewerClose: { position: "absolute", top: 50, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  viewerImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.75 },
  viewerNav: { position: "absolute", bottom: 60, flexDirection: "row", alignItems: "center", gap: 30 },
  navButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  viewerCounter: { color: "#fff", fontSize: 16, fontWeight: "600" },
  viewerVideoContainer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.6, justifyContent: "center", alignItems: "center" },
  viewerVideo: { width: "100%", height: "100%" },

  // Report Button & Modal Styles
  reportButton: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", backgroundColor: "#fff", borderWidth: 1, borderColor: "#fecaca" },
  reportModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  reportModalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 400 },
  reportModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  reportModalTitle: { fontSize: 18, fontWeight: "700", color: "#1f2937" },
  reportModalDescription: { fontSize: 14, color: "#666", marginBottom: 16, lineHeight: 20 },
  reportTextInput: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, fontSize: 15, color: "#1f2937", minHeight: 100, textAlignVertical: "top", marginBottom: 16 },
  reportSubmitButton: { backgroundColor: "#ef4444", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  reportSubmitButtonDisabled: { backgroundColor: "#fca5a5" },
  reportSubmitButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },

  // Location Text Styles
  locationTextContainer: { flexDirection: "row", alignItems: "center", backgroundColor: "#f0fdf4", paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginHorizontal: 16, gap: 8 },
  locationTextEnhanced: { fontSize: 16, fontWeight: "600", color: "#166534", flex: 1 },
  locationRadius: { fontSize: 13, color: "#15803d" },
});

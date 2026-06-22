import { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Linking,
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
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../lib/designTokens";
import { formatDate, formatTime } from "../lib/formatDate";
import BusinessMap from "../components/BusinessMap";
import AdaptiveImage from "../components/AdaptiveImage";
import DropdownSearch from "../components/DropdownSearch";
import PlacesAutocompleteInput from "../components/PlacesAutocompleteInput";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "../context/LocationContext";
import { useMapBounds } from "../context/MapBoundsContext";
import {
  ActivityItem,
  ChatMessage,
  createActivity,
  deleteActivity,
  getActivities,
  getActivityMessages,
  rsvpActivity,
  sendActivityMessage,
  updateActivity,
  ACTIVITY_THEMES,
  joinActivityByCode,
  getMyBusinesses,
  Business,
  isUpcomingActivity,
  uploadMedia,
} from "../lib/api";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ActivitiesScreen() {
  const { t } = useTranslation();
  const { sessionToken, activeIdentity } = useAuth();
  const { location: globalLocation, radiusKm } = useLocation();
  const { mapBounds, isMapInitialized, setMapBounds, refreshKey: mapRefreshKey } = useMapBounds();
  const params = useLocalSearchParams();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'attending' | 'mine'>('all');
  const [viewMode] = useState<'activities'>('activities');
  
  useEffect(() => {
    if (params.create === 'true') {
      setCreateModal(true);
    }
  }, [params.create]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editActivity, setEditActivity] = useState<ActivityItem | null>(null);
  const [chatModal, setChatModal] = useState(false);
  const [chatActivity, setChatActivity] = useState<ActivityItem | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(
      null
    );
    const [mapCenter, setMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);
    const [localMapBounds, setLocalMapBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number; centerLat: number; centerLng: number } | null>(null);
     const [activityImages, setActivityImages] = useState<string[]>([]);
    // Join by code state
   const [joinCodeInput, setJoinCodeInput] = useState("");
   const [joiningByCode, setJoiningByCode] = useState(false);
   // Business tagging state
   const [myBusinesses, setMyBusinesses] = useState<Business[]>([]);
   const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
   const [showBusinessPicker, setShowBusinessPicker] = useState(false);
     const [form, setForm] = useState({
      title: "",
      description: "",
      date: "",
      time: "",
      location: "",
      latitude: null as number | null,
      longitude: null as number | null,
      maxAttendees: "",
      inviteEmails: "",
      isPrivate: false,
      accessCode: "",
      password: "",
      theme: "" as string,
      customTheme: "",
      gallery_images: [] as string[],
      gallery_videos: [] as string[],
    });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const googleKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Load activities in current map area (debounced)
  const loadActivitiesInArea = useCallback(async (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    if (!sessionToken) return;
    try {
      const activitiesData = await getActivities(sessionToken, bounds);
      const filteredActivities = activitiesData.filter(isUpcomingActivity);
      
      setActivities(filteredActivities);
    } catch (error) {
      console.log("Error loading activities:", error);
    }
  }, [sessionToken]);

  const onRefresh = useCallback(async () => {
    if (!sessionToken) return;
    setRefreshing(true);
    try {
      const activitiesData = await getActivities(sessionToken, mapBounds || undefined);
      const filteredActivities = activitiesData.filter(isUpcomingActivity);
      
      setActivities(filteredActivities);
    } catch (error) {
      console.log("Error refreshing:", error);
    }
    setRefreshing(false);
  }, [sessionToken, mapBounds]);

  // Debounced load when local map bounds change (silent, no loading spinner)
  useEffect(() => {
    if (!localMapBounds) return;
    const timer = setTimeout(() => {
      loadActivitiesInArea(localMapBounds);
    }, 500);
    return () => clearTimeout(timer);
  }, [localMapBounds, loadActivitiesInArea]);

  // Initial load on mount
  useEffect(() => {
    if (sessionToken && localMapBounds) {
      loadActivitiesInArea(localMapBounds);
    }
  }, [sessionToken, localMapBounds]);

  // Sync with global location from context and initialize map bounds
  useEffect(() => {
    if (globalLocation) {
      setLocation({
        latitude: globalLocation.latitude,
        longitude: globalLocation.longitude,
      });
      // Initialize map center if not set
      if (!mapCenter) {
        setMapCenter({
          latitude: globalLocation.latitude,
          longitude: globalLocation.longitude,
        });
      }
      // Initialize localMapBounds if not set
      if (!localMapBounds && globalLocation) {
        const latDelta = 0.09;
        const lngDelta = 0.09;
        setLocalMapBounds({
          minLat: globalLocation.latitude - latDelta / 2,
          maxLat: globalLocation.latitude + latDelta / 2,
          minLng: globalLocation.longitude - lngDelta / 2,
          maxLng: globalLocation.longitude + lngDelta / 2,
          centerLat: globalLocation.latitude,
          centerLng: globalLocation.longitude,
        });
      }
    }
  }, [globalLocation]);

  // Fallback: Load location if no global location
  useEffect(() => {
    if (globalLocation) return; // Skip if global location is available
    const loadLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const position = await Location.getCurrentPositionAsync({});
      const newLoc = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setLocation(newLoc);
      if (!mapCenter) {
        setMapCenter(newLoc);
      }
    };
    loadLocation();
  }, [globalLocation]);

  // Load user's businesses when create modal opens
  useEffect(() => {
    if (createModal && sessionToken) {
      getMyBusinesses(sessionToken)
        .then((biz) => {
          setMyBusinesses(biz);
        })
        .catch(console.log);
    }
  }, [createModal, sessionToken]);

     const handleCreate = async () => {
     if (!sessionToken) { Alert.alert(t('common.error'), t('auth.signInRequired') || 'Please sign in first'); return; }
     if (!form.title) { Alert.alert(t('common.error'), t('activities.titleRequired') || 'Please enter a title'); return; }
     if (!form.date) { Alert.alert(t('common.error'), t('activities.dateRequired') || 'Please select a date'); return; }
     if (!form.time) { Alert.alert(t('common.error'), t('activities.timeRequired') || 'Please select a time'); return; }

       const newActivity = await createActivity(sessionToken, {
          title: form.title,
          description: form.description || undefined,
          date: form.date,
          time: form.time,
          location: form.location || "",
          cover_image_url: activityImages[0] || undefined,
          image_urls: activityImages,
          video_url: undefined,
          latitude: form.latitude ?? null,
          longitude: form.longitude ?? null,
          max_attendees: form.maxAttendees ? Number(form.maxAttendees) : undefined,
          invite_emails: form.inviteEmails ? form.inviteEmails.split(",").map((e: string) => e.trim()).filter(Boolean) : [],
          is_private: form.isPrivate,
          password: form.isPrivate ? (form.password || undefined) : undefined,
          theme: form.theme || undefined,
          custom_theme: form.customTheme || undefined,
          tagged_business_id: selectedBusinessId || undefined,
          gallery_images: form.gallery_images,
          gallery_videos: form.gallery_videos,
        });
      setActivities([newActivity, ...activities]);

     // Reset form
     setForm({
       title: "",
       description: "",
       date: "",
       time: "",
       location: "",
       latitude: null,
       longitude: null,
       maxAttendees: "",
       inviteEmails: "",
       isPrivate: false,
        accessCode: "",
        password: "",
         theme: "",
        customTheme: "",
         gallery_images: [],
         gallery_videos: [],
       });
       setActivityImages([]);
       setSelectedBusinessId(null);
       setCreateModal(false);
   };

   const openEditActivity = (activity: ActivityItem) => {
     setEditActivity(activity);
     setForm({
       title: activity.title,
       description: activity.description || "",
       date: activity.date,
       time: activity.time,
       location: activity.location || "",
       latitude: activity.latitude || null,
       longitude: activity.longitude || null,
       maxAttendees: activity.max_attendees ? String(activity.max_attendees) : "",
       inviteEmails: "",
        isPrivate: activity.is_private || false,
        accessCode: activity.invitation_code || "",
        password: (activity as any).password || "",
        theme: activity.theme || "",
       customTheme: activity.custom_theme || "",
        gallery_images: activity.gallery_images || [],
        gallery_videos: (activity as any).gallery_videos || [],
      });
     setActivityImages((activity as any).image_urls || (activity as any).cover_image_url ? [(activity as any).cover_image_url || (activity as any).image_urls?.[0]] : []);
     setSelectedBusinessId(activity.tagged_business?.business_id || null);
     setEditModal(true);
   };

   const handleUpdateActivity = async () => {
     if (!sessionToken || !editActivity) return;
  const updated = await updateActivity(sessionToken, editActivity.activity_id, {
          title: form.title || undefined,
          description: form.description || undefined,
          date: form.date || undefined,
          time: form.time || undefined,
          location: form.location || undefined,
          cover_image_url: activityImages[0] || undefined,
          image_urls: activityImages,
          video_url: undefined,
          latitude: form.latitude || undefined,
          longitude: form.longitude || undefined,
          max_attendees: form.maxAttendees ? Number(form.maxAttendees) : undefined,
          is_private: form.isPrivate || undefined,
          password: form.isPrivate ? (form.password || undefined) : undefined,
          gallery_images: form.gallery_images.length > 0 ? form.gallery_images : undefined,
          gallery_videos: form.gallery_videos.length > 0 ? form.gallery_videos : undefined,
       });
     setActivities((prev) =>
       prev.map((item) => (item.activity_id === updated.activity_id ? updated : item))
     );
     setEditModal(false);
   };

  const handleDeleteActivity = async (activityId: string) => {
    if (!sessionToken) return;
    await deleteActivity(sessionToken, activityId);
    setActivities((prev) => prev.filter((item) => item.activity_id !== activityId));
  };

  // Join activity by invitation code
  const handleJoinByCode = async () => {
    if (!sessionToken || !joinCodeInput.trim() || joiningByCode) return;
    
    setJoiningByCode(true);
    try {
      const activity = await joinActivityByCode(sessionToken, joinCodeInput.trim().toUpperCase());
      // Add to activities list if not already there
      setActivities((prev) => {
        const exists = prev.some(a => a.activity_id === activity.activity_id);
        if (exists) {
          return prev.map(a => a.activity_id === activity.activity_id ? activity : a);
        }
        return [activity, ...prev];
      });
      setJoinCodeInput("");
      // Navigate to activity detail
      router.push(`/activity/${activity.activity_id}`);
    } catch (error: any) {
      Alert.alert(
        t("common.error") || "Error",
        error.message || t("activities.invalidCode") || "Invalid invitation code"
      );
    } finally {
      setJoiningByCode(false);
    }
  };

  // WhatsApp share for activities
  const shareActivityToWhatsApp = async (activity: ActivityItem) => {
    const activityDate = activity.start_time ? formatDate(activity.start_time) : "";
    const activityTime = activity.start_time ? formatTime(activity.start_time) : "";
    const location = activity.location || "";
    
    // Use /share/ prefix for public deep links
    const activityUrl = `${BACKEND_URL?.replace('/api', '')}/share/activity/${activity.activity_id}`;
    
    const message = `${t("activities.invitationMessage", { 
      title: activity.title, 
      organizer: activity.creator?.name || "",
      date: activityDate,
      time: activityTime,
      location 
    })}\n\n${t("activities.joinHere")}: ${activityUrl}`;
    
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

  const openChat = async (activity: ActivityItem) => {
    if (!sessionToken) return;
    setChatActivity(activity);
    const messages = await getActivityMessages(sessionToken, activity.activity_id);
    setChatMessages(messages);
    setChatModal(true);
  };

  const sendChatMessage = async () => {
    if (!sessionToken || !chatActivity || !chatText.trim()) return;
    try {
      const message = await sendActivityMessage(
        sessionToken,
        chatActivity.activity_id,
        chatText.trim()
      );
      setChatMessages((prev) => [...prev, message]);
      setChatText("");
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.errorSending'));
    }
  };

    const pickActivityImages = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets) {
        const newUris = result.assets.map(a => a.uri).filter(Boolean);
        for (const uri of newUris) {
          try {
            const url = await uploadMedia(sessionToken!, uri, "image");
            setActivityImages(prev => [...prev, url].slice(0, 6));
          } catch (e) {
            console.warn("Image upload failed:", e);
          }
        }
      }
    };

    const pickGalleryImages = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets) {
        const newUris = result.assets.map(a => a.uri).filter(Boolean);
        for (const uri of newUris) {
          try {
            const url = await uploadMedia(sessionToken!, uri, "image");
            setForm(prev => ({ ...prev, gallery_images: [...prev.gallery_images, url].slice(0, 20) }));
          } catch (e) {
            console.warn("Gallery upload failed:", e);
          }
        }
      }
    };

    const handleRsvp = async (activity: ActivityItem, status: string) => {
    if (!sessionToken) return;
    const updated = await rsvpActivity(sessionToken, activity.activity_id, status);
    setActivities((prev) =>
      prev.map((item) => (item.activity_id === updated.activity_id ? updated : item))
    );
  };

  // Add router for navigation to event details
  const router = require('expo-router').useRouter();

  // Show prompt to interact with map first if map is not initialized
  if (!isMapInitialized) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t("activities.title")}</Text>
            <Text style={styles.subtitle}>{t("activities.subtitle")}</Text>
          </View>
        </View>
        <View style={styles.mapPromptContainer}>
          <View style={styles.mapPromptCard}>
            <View style={styles.mapPromptIconContainer}>
              <Ionicons name="map" size={48} color={COLORS.primaryDark} />
            </View>
            <Text style={styles.mapPromptTitle}>{t('home.setLocationTitle', { defaultValue: 'Set Your Area' })}</Text>
            <Text style={styles.mapPromptText}>
              {t('home.setLocationDescription', { defaultValue: 'To see events and activities, please first set your location area on the map.' })}
            </Text>
            <Pressable 
              style={styles.mapPromptButton}
              onPress={() => router.navigate('/(tabs)/locator' as any)}
              data-testid="go-to-map-btn-activities"
            >
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.mapPromptButtonText}>{t('home.goToMap', { defaultValue: 'Go to Map' })}</Text>
            </Pressable>
          </View>
          
          {/* Join by Code - Available even without location */}
          <View style={styles.joinByCodeSectionAlt}>
            <Text style={styles.joinByCodeLabel}>{t("activities.haveInvitation") || "Have an invitation code?"}</Text>
            <View style={styles.joinByCodeContainer}>
              <Ionicons name="key-outline" size={18} color="#6b7280" />
              <TextInput
                style={styles.joinByCodeInput}
                placeholder={t("activities.enterInvitationCode") || "Enter code"}
                placeholderTextColor="#9ca3af"
                value={joinCodeInput}
                onChangeText={setJoinCodeInput}
                autoCapitalize="characters"
                maxLength={8}
              />
              <Pressable 
                style={[styles.joinByCodeButton, (!joinCodeInput.trim() || joiningByCode) && styles.joinByCodeButtonDisabled]}
                onPress={handleJoinByCode}
                disabled={!joinCodeInput.trim() || joiningByCode}
              >
                {joiningByCode ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.joinByCodeButtonText}>{t("activities.join") || "Join"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
       <View style={styles.header}>
        <View style={styles.headerText}>
           <Text style={styles.title}>
             {t("activities.title") || "Activities"}
           </Text>
           <Text style={styles.subtitle}>
             {t("activities.subtitle") || "Join local activities"}
           </Text>
         </View>
         <Pressable style={styles.primaryButton} onPress={() => setCreateModal(true)}>
           <Ionicons name="add" size={24} color="#fff" />
         </Pressable>
       </View>

        {/* Segmented Control - Activities only */}
        <View style={styles.segmentedControl}>
          <Pressable 
            style={[styles.segmentButton, styles.segmentButtonActive]}
          >
            <Ionicons 
              name="people" 
              size={18} 
              color="#fff"
            />
            <Text style={[styles.segmentText, styles.segmentTextActive]}>
              {t("activities.title") || "Activities"}
            </Text>
          </Pressable>
        </View>

      {/* Filter Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            {t("activities.all") || "All"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'attending' && styles.tabActive]}
          onPress={() => setActiveTab('attending')}
        >
          <Text style={[styles.tabText, activeTab === 'attending' && styles.tabTextActive]}>
            {t("activities.attending") || "Attending"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'mine' && styles.tabActive]}
          onPress={() => setActiveTab('mine')}
        >
          <Text style={[styles.tabText, activeTab === 'mine' && styles.tabTextActive]}>
            {t("activities.mine") || "My Activities"}
          </Text>
        </Pressable>
      </View>

      {/* Join by Invitation Code Section */}
      <View style={styles.joinByCodeSection}>
        <View style={styles.joinByCodeContainer}>
          <Ionicons name="key-outline" size={18} color="#6b7280" />
          <TextInput
            style={styles.joinByCodeInput}
            placeholder={t("activities.enterInvitationCode") || "Enter invitation code"}
            placeholderTextColor="#9ca3af"
            value={joinCodeInput}
            onChangeText={setJoinCodeInput}
            autoCapitalize="characters"
            maxLength={8}
          />
          <Pressable 
            style={[styles.joinByCodeButton, (!joinCodeInput.trim() || joiningByCode) && styles.joinByCodeButtonDisabled]}
            onPress={handleJoinByCode}
            disabled={!joinCodeInput.trim() || joiningByCode}
          >
            {joiningByCode ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.joinByCodeButtonText}>{t("activities.join") || "Join"}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primaryDark} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primaryDark]}
              tintColor={COLORS.primaryDark}
            />
          }
        >
          {/* Map showing all activities */}
          {(location || activities.length > 0) && (
            <View style={styles.mapSection}>
              <BusinessMap
                key="activities-map"
                location={mapCenter || location || { latitude: 52.52, longitude: 13.405 }}
                showUserLocation={!!location}
                height={280}
                onRegionChangeComplete={(bounds) => {
                  // Just update local map center - no global context update
                  const newCenterLat = (bounds.minLat + bounds.maxLat) / 2;
                  const newCenterLng = (bounds.minLng + bounds.maxLng) / 2;
                  setMapCenter({ latitude: newCenterLat, longitude: newCenterLng });
                  // Store bounds locally for content loading
                  setLocalMapBounds({
                    ...bounds,
                    centerLat: newCenterLat,
                    centerLng: newCenterLng,
                  });
                }}
                markers={activities
                  .filter(isUpcomingActivity)
                  .filter((activity) => activity.latitude && activity.longitude)
                  .filter((activity) => {
                    if (activity.is_private && !activity.is_creator && activity.my_status !== 'going' && activity.my_status !== 'invited') return false;
                    if (activeTab === 'attending') return activity.my_status === 'going';
                    if (activeTab === 'mine') return activity.is_creator;
                    return true;
                  })
                  .map((activity) => ({
                    id: activity.activity_id,
                    latitude: activity.latitude!,
                    longitude: activity.longitude!,
                    title: activity.is_private ? "🔒 " + activity.title : activity.title,
                    description: activity.location || activity.date,
                    pinColor: activity.is_private ? "#9ca3af" : COLORS.primaryDark,
                  }))}
              />
            </View>
          )}

          {/* Activities Section - Airbnb style */}
          {activities.length > 0 && (
          <View style={styles.listSection}>
            {activities.length > 0 && (
              <Text style={styles.sectionTitle}>
                {activeTab === 'all' ? t("activities.activities") : activeTab === 'attending' ? (t("activities.attending") || "Attending") : (t("activities.mine") || "My Activities")}
              </Text>
            )}
            {activities.filter((activity) => {
              if (activity.is_private && !activity.is_creator && activity.my_status !== 'going' && activity.my_status !== 'invited') return false;
              if (activeTab === 'attending') return activity.my_status === 'going';
              if (activeTab === 'mine') return activity.is_creator;
              return true;
            }).map((activity) => (
              <Pressable 
                key={activity.activity_id} 
                style={[styles.airbnbCard, activity.is_private && { opacity: 0.9, backgroundColor: COLORS.surfaceSoft }]}
                onPress={() => router.push(`/activity/${activity.activity_id}`)}
              >
                <View style={styles.airbnbImageContainer}>
                  {(activity.gallery_images?.[0] || activity.cover_image_url || activity.image_urls?.[0]) ? (
                    <AdaptiveImage 
                      uri={activity.gallery_images?.[0] ?? activity.cover_image_url ?? activity.image_urls?.[0] ?? ""} 
                      style={styles.airbnbImage}
                      fallbackColor="#10b981"
                    />
                  ) : (
                    <View style={styles.airbnbImagePlaceholder}>
                      <Ionicons name={activity.is_private ? "lock-closed" : "people"} size={24} color="#10b981" />
                    </View>
                  )}
                  <View style={[styles.airbnbBadge, styles.activityBadgeColor, activity.is_private && { backgroundColor: '#4b5563' }]}>
                    <Text style={[styles.airbnbBadgeText, styles.activityBadgeTextColor, activity.is_private && { color: '#ffffff' }]}>
                      {activity.is_private ? 'Private' : t("activities.activities")}
                    </Text>
                  </View>
                </View>
                <View style={styles.airbnbContent}>
                  <Text style={styles.airbnbTitle} numberOfLines={1}>
                    {activity.is_private && "🔒 "}
                    {activity.title}
                  </Text>
                  <Text style={styles.airbnbMeta}>
                    <Ionicons name="calendar-outline" size={12} color="#6b7280" /> {activity.date} · {activity.time}
                  </Text>
                  {activity.location && (
                    <Text style={styles.airbnbLocation} numberOfLines={1}>
                      <Ionicons name="location-outline" size={12} color="#6b7280" /> {activity.location}
                    </Text>
                  )}
                  {/* Activity action buttons */}
                  <View style={styles.airbnbActions}>
                    <Pressable style={styles.airbnbActionBtn} onPress={() => openChat(activity)}>
                      <Ionicons name="chatbubble-outline" size={14} color={COLORS.primaryDark} />
                    </Pressable>
                    {activity.is_creator && (
                      <>
                        <Pressable style={styles.airbnbActionBtn} onPress={() => openEditActivity(activity)}>
                          <Ionicons name="create-outline" size={14} color={COLORS.primaryDark} />
                        </Pressable>
                        <Pressable style={styles.airbnbActionBtn} onPress={() => handleDeleteActivity(activity.activity_id)}>
                          <Ionicons name="trash-outline" size={14} color="#ef4444" />
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
          )}
        </ScrollView>
      )}

      <Modal visible={createModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
             <View style={styles.modalHeader}>
               <Text style={styles.modalTitle}>
                 {t('activities.createActivity')}
               </Text>
               <Pressable onPress={() => setCreateModal(false)}>
                 <Ionicons name="close" size={22} color={COLORS.textPrimary} />
               </Pressable>
             </View>
            <ScrollView 
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <TextInput
                placeholder={t('activities.activityTitle')}
                value={form.title}
                onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
                style={styles.input}
              />
              <TextInput
                placeholder={t('activities.description', 'Description')}
                value={form.description}
                onChangeText={(value) =>
                  setForm((prev) => ({ ...prev, description: value }))
                }
                style={[styles.input, styles.textArea]}
                multiline
              />
              <Text style={styles.fieldLabel}>{t('activities.activityDate')}</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.pickerText}>
                  {form.date || t('activities.activityDate')}
                </Text>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (date) {
                      setSelectedDate(date);
                      const pad = (n: number) => n.toString().padStart(2, "0");
                      const value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
                      setForm((prev) => ({ ...prev, date: value }));
                    }
                  }}
                />
              )}
              <Text style={styles.fieldLabel}>{t('activities.activityTime')}</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={18} color={COLORS.primaryDark} />
                <Text style={styles.pickerText}>
                  {form.time || t('activities.activityTime')}
                </Text>
              </Pressable>
              {showTimePicker && (
                <DateTimePicker
                  value={selectedTime}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    setShowTimePicker(Platform.OS === "ios");
                    if (date) {
                      setSelectedTime(date);
                      const hours = date.getHours().toString().padStart(2, "0");
                      const mins = date.getMinutes().toString().padStart(2, "0");
                      setForm((prev) => ({ ...prev, time: `${hours}:${mins}` }));
                    }
                  }}
                />
              )}
              <PlacesAutocompleteInput
                value={form.location || ""}
                onChangeText={(value) => setForm((prev) => ({ ...prev, location: value }))}
                onSelectPlace={(address, lat, lng) => setForm((prev) => ({ ...prev, location: address, latitude: lat, longitude: lng }))}
                placeholder={t('activities.location')}
                style={styles.input}
                nearLat={mapBounds?.centerLat ?? location?.latitude ?? undefined}
                nearLng={mapBounds?.centerLng ?? location?.longitude ?? undefined}
              />
              <View style={styles.imageGrid}>
                {activityImages.map((img, idx) => (
                  <View key={idx} style={styles.imageGridItem}>
                    <AdaptiveImage uri={img} style={styles.gridImage} />
                    <Pressable style={styles.removeImageBtn} onPress={() => setActivityImages(prev => prev.filter((_, i) => i !== idx))}>
                      <Ionicons name="close-circle" size={22} color="#ef4444" />
                    </Pressable>
                  </View>
                ))}
                {activityImages.length < 6 && (
                  <Pressable style={styles.addImageBtn} onPress={pickActivityImages}>
                    <Ionicons name="add" size={28} color={COLORS.primaryDark} />
                    <Text style={styles.addImageText}>Add Photo</Text>
                  </Pressable>
                )}
              </View>

              <Text style={styles.fieldLabel}>Gallery Images</Text>
              <View style={styles.imageGrid}>
                {form.gallery_images.map((img, idx) => (
                  <View key={`gal-${idx}`} style={styles.imageGridItem}>
                    <AdaptiveImage uri={img} style={styles.gridImage} />
                    <Pressable style={styles.removeImageBtn} onPress={() => setForm(prev => ({ ...prev, gallery_images: prev.gallery_images.filter((_: string, i: number) => i !== idx) }))}>
                      <Ionicons name="close-circle" size={22} color="#ef4444" />
                    </Pressable>
                  </View>
                ))}
                {form.gallery_images.length < 20 && (
                  <Pressable style={styles.addImageBtn} onPress={pickGalleryImages}>
                    <Ionicons name="add" size={28} color={COLORS.primaryDark} />
                    <Text style={styles.addImageText}>Gallery</Text>
                  </Pressable>
                )}
              </View>

              <TextInput
                placeholder={t('activities.maxAttendees')}
                value={form.maxAttendees}
                onChangeText={(value) =>
                  setForm((prev) => ({ ...prev, maxAttendees: value }))
                }
                keyboardType="numeric"
                style={styles.input}
              />
              
              {/* Theme Selection */}
              <Text style={styles.fieldLabel}>{t('activities.activityType') || 'Activity Type'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeScroll}>
                {Object.entries(ACTIVITY_THEMES).map(([key, theme]) => (
                  <Pressable
                    key={key}
                    style={[
                      styles.themeChip,
                      form.theme === key && { backgroundColor: theme.color, borderColor: theme.color }
                    ]}
                    onPress={() => setForm((prev) => ({ ...prev, theme: key }))}
                  >
                    <Text style={styles.themeEmoji}>{theme.emoji}</Text>
                    <Text style={[
                      styles.themeChipText,
                      form.theme === key && { color: '#fff' }
                    ]}>{theme.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              
              {/* Custom Theme Input */}
              {form.theme === 'custom' && (
                <TextInput
                  placeholder={t('activities.customTheme') || 'Enter your custom theme'}
                  value={form.customTheme}
                  onChangeText={(value) =>
                    setForm((prev) => ({ ...prev, customTheme: value }))
                  }
                  style={styles.input}
                />
              )}
              
               {/* Private Activity Toggle */}
               <Pressable 
                 style={styles.privateToggle}
                 onPress={() => setForm((prev) => ({ ...prev, isPrivate: !prev.isPrivate }))}
               >
                 <View style={styles.privateToggleLeft}>
                   <Ionicons 
                     name={form.isPrivate ? "lock-closed" : "lock-open-outline"} 
                     size={20} 
                     color={form.isPrivate ? "#FF6B6B" : "#6b7280"} 
                   />
                   <View>
                     <Text style={styles.privateToggleLabel}>
                       {t('activities.privateActivity') || 'Private Activity'}
                     </Text>
                     <Text style={styles.privateToggleHint}>
                       {form.isPrivate 
                         ? (t('activities.onlyInvitedCanJoin') || 'Only people with invitation code can join')
                         : (t('activities.anyoneCanJoin') || 'Anyone can see and join')
                       }
                     </Text>
                   </View>
                 </View>
                 <View style={[styles.toggleSwitch, form.isPrivate && styles.toggleSwitchActive]}>
                   <View style={[styles.toggleKnob, form.isPrivate && styles.toggleKnobActive]} />
                 </View>
               </Pressable>

                {/* Access Code for Private Events/Activities */}
                {form.isPrivate && (
                  <>
                    <TextInput
                      placeholder={t('activities.accessCode') || 'Enter invitation code (optional)'}
                      value={form.accessCode}
                      onChangeText={(value) =>
                        setForm((prev) => ({ ...prev, accessCode: value.toUpperCase().slice(0, 8) }))
                      }
                      maxLength={8}
                      autoCapitalize="characters"
                      style={styles.input}
                    />
                    <TextInput
                      placeholder={t('business.passwordPlaceholder') || 'Set an access password'}
                      value={form.password}
                      onChangeText={(value) =>
                        setForm((prev) => ({ ...prev, password: value }))
                      }
                      secureTextEntry
                      style={styles.input}
                    />
                  </>
                )}

              {/* Business/Venue Selection */}
              {myBusinesses.length > 0 && (
                <DropdownSearch
                  items={myBusinesses.map(b => ({ id: b.business_id, name: b.name, logo: b.logo_image }))}
                  selectedId={selectedBusinessId}
                  onSelect={setSelectedBusinessId}
                  label={t('activities.tagVenue') || 'Tag a Venue (Optional)'}
                  placeholder="Select a venue..."
                />
              )}

              <TextInput
                placeholder={t('activities.inviteEmails')}
                value={form.inviteEmails}
                onChangeText={(value) =>
                  setForm((prev) => ({ ...prev, inviteEmails: value }))
                }
                style={styles.input}
              />
              <Pressable style={styles.createButton} onPress={handleCreate}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.createButtonText}>{t('activities.create')}</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <Modal visible={editModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('activities.editActivity')}</Text>
            <Pressable onPress={() => setEditModal(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput
              placeholder={t('activities.activityTitle')}
              value={form.title}
              onChangeText={(value) => setForm((prev) => ({ ...prev, title: value }))}
              style={styles.input}
            />
            <TextInput
              placeholder={t('activities.description')}
              value={form.description}
              onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))}
              style={[styles.input, styles.textArea]}
              multiline
            />
            <View style={styles.row}>
              <TextInput
                placeholder={t('activities.date')}
                value={form.date}
                onChangeText={(value) => setForm((prev) => ({ ...prev, date: value }))}
                style={[styles.input, styles.flexInput]}
              />
              <TextInput
                placeholder={t('activities.time')}
                value={form.time}
                onChangeText={(value) => setForm((prev) => ({ ...prev, time: value }))}
                style={[styles.input, styles.flexInput]}
              />
            </View>
            <PlacesAutocompleteInput
              value={form.location}
              onChangeText={(value) => setForm((prev) => ({ ...prev, location: value }))}
              onSelectPlace={(address, lat, lng) => setForm((prev) => ({ ...prev, location: address, latitude: lat, longitude: lng }))}
              placeholder={t('activities.location')}
              style={styles.input}
              nearLat={mapBounds?.centerLat ?? location?.latitude ?? undefined}
              nearLng={mapBounds?.centerLng ?? location?.longitude ?? undefined}
            />
            <Pressable style={styles.saveChangesButton} onPress={handleUpdateActivity}>
              <Text style={styles.saveChangesButtonText}>{t('activities.saveChanges')}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={chatModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {chatActivity ? chatActivity.title : t('activities.chat')}
            </Text>
            <Pressable onPress={() => setChatModal(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.chatBody}>
            {chatMessages.length === 0 ? (
              <Text style={styles.emptyText}>{t('activities.noMessages')}</Text>
            ) : (
              chatMessages.map((message) => (
                <View key={message.message_id} style={styles.chatBubble}>
                  <Text style={styles.chatAuthor}>
                    {message.author?.name || t('profile.user')}
                  </Text>
                  <Text style={styles.chatText}>{message.text}</Text>
                </View>
              ))
            )}
          </ScrollView>
          <View style={styles.chatInputRow}>
            <TextInput
              placeholder={t('activities.typeMessage')}
              value={chatText}
              onChangeText={setChatText}
              style={styles.chatInput}
            />
            <Pressable style={styles.chatSendButton} onPress={sendChatMessage}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  mapPromptContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    alignItems: "center",
  },
  mapPromptCard: {
    backgroundColor: COLORS.background,
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: "100%",
    shadowColor: COLORS.primaryDark,
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
    color: COLORS.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  mapPromptText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  mapPromptButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    gap: 10,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  mapPromptButtonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: "700",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  headerText: {
    flex: 1,
    flexShrink: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.primary,
  },
  subtitle: {
    color: COLORS.textMuted,
    marginTop: 4,
    fontSize: 13,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  primaryButtonText: {
    display: "none",
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.background,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
    marginTop: 8,
    marginBottom: 12,
  },
  eventBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  eventBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.primary,
  },
  activityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  activityBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.success,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    padding: 24,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textDisabled,
  },
  // Map section
  mapSection: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: "hidden",
  },
  listSection: {
    marginBottom: 16,
  },
  // Airbnb-style cards
  airbnbCard: {
    flexDirection: "row",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  airbnbImageContainer: {
    width: 100,
    height: 100,
    position: "relative",
  },
  airbnbImage: {
    width: "100%",
    height: "100%",
  },
  airbnbImagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  airbnbBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  airbnbBadgeText: {
    fontSize: 9,
    fontWeight: "600",
    color: COLORS.primary,
  },
  activityBadgeColor: {
    backgroundColor: "#ecfdf5",
  },
  activityBadgeTextColor: {
    color: COLORS.success,
  },
  airbnbContent: {
    flex: 1,
    padding: 10,
    justifyContent: "center",
  },
  airbnbTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 4,
  },
  airbnbMeta: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  airbnbLocation: {
    fontSize: 11,
    color: COLORS.textDisabled,
  },
  airbnbActions: {
    flexDirection: "row",
    marginTop: 6,
    gap: 8,
  },
  airbnbActionBtn: {
    padding: 4,
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontWeight: "700",
    fontSize: 18,
    color: COLORS.primary,
    marginBottom: 8,
  },
  cardMeta: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  cardLocation: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 8,
  },
  cardDescription: {
    marginTop: 10,
    color: "#4b5563",
    lineHeight: 20,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  mapButtonText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 14,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 12,
  },
  imageGridItem: {
    position: "relative",
    width: "31%",
    aspectRatio: 1,
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
  },
  removeImageBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: COLORS.background,
    borderRadius: 11,
  },
  addImageBtn: {
    width: "31%",
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryLight,
  },
  addImageText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  activityImage: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    marginVertical: 12,
  },
  statusRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  statusText: {
    fontWeight: "600",
    color: COLORS.primary,
    marginBottom: 10,
    fontSize: 14,
  },
  rsvpRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  rsvpButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#eef2ff",
    marginRight: 10,
    marginBottom: 6,
  },
  rsvpText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  whatsappButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  whatsappButtonSmall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  whatsappButtonText: {
    color: "#25D366",
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 13,
  },
  actionText: {
    color: COLORS.primary,
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 13,
  },
  actionRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    flexWrap: "wrap",
    gap: 8,
  },
  actionButtonsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  creatorActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconAction: {
    padding: 10,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primary,
  },
  modalBody: {
    padding: 20,
    paddingBottom: 40,
  },
  chatBody: {
    padding: 20,
  },
  chatBubble: {
    backgroundColor: "#f3f4f6",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  chatAuthor: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  chatText: {
    color: COLORS.primary,
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  chatSendButton: {
    backgroundColor: COLORS.primary,
    padding: 10,
    borderRadius: 12,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#eef2ff",
    borderRadius: 8,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  themeFilterContainer: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  themeOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  themeOptionSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  themeOptionText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  themeOptionTextSelected: {
    fontWeight: "600",
    color: COLORS.primary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  suggestionBox: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  suggestionText: {
    color: COLORS.primary,
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
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonText: {
    color: COLORS.background,
    fontWeight: "700",
    fontSize: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  fieldHint: {
    fontSize: 12,
    color: COLORS.textDisabled,
    marginBottom: 8,
    marginTop: -4,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 10,
  },
  pickerText: {
    color: COLORS.primary,
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  flexInput: {
    flex: 1,
  },
  // Theme selection styles
  themeScroll: {
    marginBottom: 16,
    marginLeft: -4,
  },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    backgroundColor: COLORS.background,
  },
  themeEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  themeChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
  // Private toggle styles
  privateToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.surfaceSoft,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  privateToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  privateToggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  privateToggleHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    backgroundColor: "#d1d5db",
    borderRadius: 14,
    padding: 2,
  },
  toggleSwitchActive: {
    backgroundColor: "#FF6B6B",
  },
  toggleKnob: {
    width: 24,
    height: 24,
    backgroundColor: COLORS.background,
    borderRadius: 12,
  },
  toggleKnobActive: {
    transform: [{ translateX: 20 }],
  },
  // Join by Code styles
  joinByCodeSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  joinByCodeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 10,
  },
  joinByCodeInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.primary,
    letterSpacing: 2,
    paddingVertical: 10,
  },
  joinByCodeButton: {
    backgroundColor: COLORS.success,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  joinByCodeButtonDisabled: {
    opacity: 0.5,
  },
  joinByCodeButtonText: {
    color: COLORS.background,
    fontWeight: "600",
    fontSize: 14,
  },
  // Alternative join by code section for map prompt view
  joinByCodeSectionAlt: {
    marginTop: 32,
    width: "100%",
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 20,
  },
  joinByCodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 12,
    textAlign: "center",
  },
  // Business selection styles
  businessScroll: {
    marginBottom: 16,
  },
  businessChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
    backgroundColor: COLORS.background,
    gap: 8,
  },
  businessChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  businessChipLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  businessChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.textSecondary,
  },
   businessChipTextSelected: {
     color: COLORS.background,
   },
  // Segmented Control Styles
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "transparent",
    gap: 6,
  },
  segmentButtonActive: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textMuted,
  },
  segmentTextActive: {
    color: COLORS.background,
  },
  // Video preview styles
  videoPreviewContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  videoPreviewText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
    marginLeft: 12,
  },
  removeVideoButton: {
    padding: 8,
  },
  airbnbTheme: {
    fontSize: 12,
    color: "#8b5cf6",
    marginTop: 4,
  },
  saveChangesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: 16,
  },
  saveChangesButtonText: {
    color: COLORS.background,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.bold,
  },
});
import { useCallback, useEffect, useState } from "react";
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
import BusinessMap from "../../components/BusinessMap";
import AdaptiveImage from "../../components/AdaptiveImage";
import { useAuth } from "../../context/AuthContext";
import { useLocation } from "../../context/LocationContext";
import { useMapBounds } from "../../context/MapBoundsContext";
import {
  ActivityItem,
  ChatMessage,
  createActivity,
  deleteActivity,
  getActivities,
  getActivityMessages,
  getEvents,
  EventItem,
  rsvpActivity,
  sendActivityMessage,
  updateActivity,
  ACTIVITY_THEMES,
  joinActivityByCode,
  getMyBusinesses,
  Business,
} from "../../lib/api";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ActivitiesScreen() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const { location: globalLocation, radiusKm } = useLocation();
  const { mapBounds, isMapInitialized, setMapBounds, refreshKey: mapRefreshKey } = useMapBounds();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'activities' | 'events'>('all');
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
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { description: string; place_id: string }[]
  >([]);
  const [activityImage, setActivityImage] = useState<string | null>(null);
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
    theme: "" as string,
    customTheme: "",
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const googleKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  const loadActivities = useCallback(async () => {
    if (!sessionToken) return;
    // Only load if map is initialized
    if (!isMapInitialized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [activitiesData, eventsData] = await Promise.all([
        getActivities(sessionToken),
        getEvents(sessionToken),
      ]);
      // Filter activities/events based on map bounds
      const filteredActivities = mapBounds ? activitiesData.filter((activity) => {
        if (!activity.latitude || !activity.longitude) return true; // Keep items without location
        return activity.latitude >= mapBounds.minLat && 
               activity.latitude <= mapBounds.maxLat &&
               activity.longitude >= mapBounds.minLng && 
               activity.longitude <= mapBounds.maxLng;
      }) : activitiesData;
      
      const filteredEvents = mapBounds ? eventsData.filter((event) => {
        const lat = event.business?.latitude || event.artist?.latitude;
        const lng = event.business?.longitude || event.artist?.longitude;
        if (!lat || !lng) return true; // Keep items without location
        return lat >= mapBounds.minLat && 
               lat <= mapBounds.maxLat &&
               lng >= mapBounds.minLng && 
               lng <= mapBounds.maxLng;
      }) : eventsData;
      
      setActivities(filteredActivities);
      setEvents(filteredEvents);
    } catch (error) {
      console.log("Error loading activities/events:", error);
    }
    setLoading(false);
  }, [sessionToken, isMapInitialized, mapBounds]);

  const onRefresh = useCallback(async () => {
    if (!sessionToken || !isMapInitialized) return;
    setRefreshing(true);
    try {
      const [activitiesData, eventsData] = await Promise.all([
        getActivities(sessionToken),
        getEvents(sessionToken),
      ]);
      // Filter activities/events based on map bounds
      const filteredActivities = mapBounds ? activitiesData.filter((activity) => {
        if (!activity.latitude || !activity.longitude) return true;
        return activity.latitude >= mapBounds.minLat && 
               activity.latitude <= mapBounds.maxLat &&
               activity.longitude >= mapBounds.minLng && 
               activity.longitude <= mapBounds.maxLng;
      }) : activitiesData;
      
      const filteredEvents = mapBounds ? eventsData.filter((event) => {
        const lat = event.business?.latitude || event.artist?.latitude;
        const lng = event.business?.longitude || event.artist?.longitude;
        if (!lat || !lng) return true;
        return lat >= mapBounds.minLat && 
               lat <= mapBounds.maxLat &&
               lng >= mapBounds.minLng && 
               lng <= mapBounds.maxLng;
      }) : eventsData;
      
      setActivities(filteredActivities);
      setEvents(filteredEvents);
    } catch (error) {
      console.log("Error refreshing:", error);
    }
    setRefreshing(false);
  }, [sessionToken, isMapInitialized, mapBounds]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities, mapRefreshKey]);

  // Sync with global location from context
  useEffect(() => {
    if (globalLocation) {
      setLocation({
        latitude: globalLocation.latitude,
        longitude: globalLocation.longitude,
      });
    }
  }, [globalLocation]);

  // Fallback: Load location if no global location
  useEffect(() => {
    if (globalLocation) return; // Skip if global location is available
    const loadLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const position = await Location.getCurrentPositionAsync({});
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    };
    loadLocation();
  }, [globalLocation]);

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

  // Load user's businesses when create modal opens
  useEffect(() => {
    if (createModal && sessionToken) {
      getMyBusinesses(sessionToken)
        .then(setMyBusinesses)
        .catch(console.log);
    }
  }, [createModal, sessionToken]);

  const handleCreate = async () => {
    if (!sessionToken || !form.title || !form.date || !form.time) return;
    const inviteEmails = form.inviteEmails
      ? form.inviteEmails.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
    const newActivity = await createActivity(sessionToken, {
      title: form.title,
      description: form.description || undefined,
      date: form.date,
      time: form.time,
      location: form.location || undefined,
      image_base64: activityImage || undefined,
      latitude: form.latitude,
      longitude: form.longitude,
      max_attendees: form.maxAttendees ? Number(form.maxAttendees) : undefined,
      invite_emails: inviteEmails,
      is_private: form.isPrivate,
      theme: form.theme || undefined,
      custom_theme: form.customTheme || undefined,
      tagged_business_id: selectedBusinessId || undefined,
    });
    setActivities([newActivity, ...activities]);
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
      theme: "",
      customTheme: "",
    });
    setActivityImage(null);
    setAddressQuery("");
    setSuggestions([]);
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
      theme: activity.theme || "",
      customTheme: activity.custom_theme || "",
    });
    setActivityImage(activity.image_base64 || null);
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
      image_base64: activityImage || undefined,
      latitude: form.latitude || undefined,
      longitude: form.longitude || undefined,
      max_attendees: form.maxAttendees ? Number(form.maxAttendees) : undefined,
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
    const activityDate = activity.start_time 
      ? new Date(activity.start_time).toLocaleDateString() 
      : "";
    const activityTime = activity.start_time 
      ? new Date(activity.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) 
      : "";
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
    const message = await sendActivityMessage(
      sessionToken,
      chatActivity.activity_id,
      chatText.trim()
    );
    setChatMessages((prev) => [...prev, message]);
    setChatText("");
  };

  const pickActivityImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setActivityImage(uri);
    }
  };

  const handleRsvp = async (activity: ActivityItem, status: string) => {
    if (!sessionToken) return;
    const updated = await rsvpActivity(sessionToken, activity.activity_id, status);
    setActivities((prev) =>
      prev.map((item) => (item.activity_id === updated.activity_id ? updated : item))
    );
  };

  const handlePlaceSelect = async (suggestion: {
    description: string;
    place_id: string;
  }) => {
    setAddressQuery(suggestion.description);
    setSuggestions([]);
    setForm((prev) => ({ ...prev, location: suggestion.description }));
    if (!googleKey) return;
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      suggestion.place_id
    )}&key=${googleKey}`;
    const response = await fetch(url);
    const data = await response.json();
    const location = data.result?.geometry?.location;
    if (location) {
      setForm((prev) => ({
        ...prev,
        latitude: location.lat,
        longitude: location.lng,
        location: data.result.formatted_address || suggestion.description,
      }));
    }
  };

  // Add router for navigation to event details
  const router = require('expo-router').useRouter();

  // Show prompt to interact with map first if map is not initialized
  if (!isMapInitialized) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t("activities.title")}</Text>
            <Text style={styles.subtitle}>{t("activities.subtitle")}</Text>
          </View>
        </View>
        <View style={styles.mapPromptContainer}>
          <View style={styles.mapPromptCard}>
            <View style={styles.mapPromptIconContainer}>
              <Ionicons name="map" size={48} color="#4c6fff" />
            </View>
            <Text style={styles.mapPromptTitle}>{t('home.setLocationTitle', { defaultValue: 'Set Your Area' })}</Text>
            <Text style={styles.mapPromptText}>
              {t('home.setLocationDescription', { defaultValue: 'To see events and activities, please first set your location area on the map.' })}
            </Text>
            <Pressable 
              style={styles.mapPromptButton}
              onPress={() => router.push('/(tabs)/locator')}
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t("activities.title")}</Text>
          <Text style={styles.subtitle}>{t("activities.subtitle")}</Text>
        </View>
        <Pressable style={styles.primaryButton} onPress={() => setCreateModal(true)}>
          <Ionicons name="add" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === 'all' && styles.tabActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            {t("activities.all")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'events' && styles.tabActive]}
          onPress={() => setActiveTab('events')}
        >
          <Text style={[styles.tabText, activeTab === 'events' && styles.tabTextActive]}>
            {t("home.events")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'activities' && styles.tabActive]}
          onPress={() => setActiveTab('activities')}
        >
          <Text style={[styles.tabText, activeTab === 'activities' && styles.tabTextActive]}>
            {t("activities.activities")}
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
          <ActivityIndicator color="#4c6fff" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#4c6fff"]}
              tintColor="#4c6fff"
            />
          }
        >
          {/* Map showing all events/activities */}
          {(location || events.length > 0 || activities.length > 0) && (
            <View style={styles.mapSection}>
              <BusinessMap
                location={location || { latitude: 52.52, longitude: 13.405 }}
                showUserLocation={!!location}
                height={280}
                onRegionChange={(bounds) => {
                  // Update local mapBounds state to trigger re-filtering
                  setMapBounds({
                    ...bounds,
                    centerLat: (bounds.minLat + bounds.maxLat) / 2,
                    centerLng: (bounds.minLng + bounds.maxLng) / 2,
                  });
                }}
                markers={[
                  ...(activeTab === 'all' || activeTab === 'activities' ? activities
                    .filter((activity) => activity.latitude && activity.longitude)
                    .map((activity) => ({
                      id: activity.activity_id,
                      latitude: activity.latitude!,
                      longitude: activity.longitude!,
                      title: activity.title,
                      description: activity.location || activity.date,
                      pinColor: "#10b981", // Green for activities
                    })) : []),
                  ...(activeTab === 'all' || activeTab === 'events' ? events
                    .filter((event) => (event.business?.latitude || event.artist?.latitude))
                    .map((event) => ({
                      id: event.event_id,
                      latitude: event.business?.latitude || event.artist?.latitude || 52.52,
                      longitude: event.business?.longitude || event.artist?.longitude || 13.405,
                      title: event.title,
                      description: event.business?.name || event.artist?.name || event.start_time.split("T")[0],
                      pinColor: "#4c6fff", // Blue for events
                    })) : []),
                ]}
              />
            </View>
          )}

          {/* Events Section - Airbnb style */}
          {(activeTab === 'all' || activeTab === 'events') && (
            <View style={styles.listSection}>
              {activeTab === 'all' && events.length > 0 && (
                <Text style={styles.sectionTitle}>{t("home.events")}</Text>
              )}
              {events.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>{t("home.noEvents")}</Text>
                </View>
              ) : (
                events.map((event) => (
                  <Pressable
                    key={event.event_id}
                    style={styles.airbnbCard}
                    onPress={() => router.push(`/event/${event.event_id}`)}
                  >
                    <View style={styles.airbnbImageContainer}>
                      {event.image_base64 ? (
                        <RNImage 
                          source={{ uri: event.image_base64 }} 
                          style={styles.airbnbImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.airbnbImagePlaceholder}>
                          <Ionicons name="calendar" size={24} color="#4c6fff" />
                        </View>
                      )}
                      <View style={styles.airbnbBadge}>
                        <Text style={styles.airbnbBadgeText}>{t("home.events")}</Text>
                      </View>
                    </View>
                    <View style={styles.airbnbContent}>
                      <Text style={styles.airbnbTitle} numberOfLines={1}>{event.title}</Text>
                      <Text style={styles.airbnbMeta}>
                        <Ionicons name="calendar-outline" size={12} color="#6b7280" /> {event.start_time.split("T")[0]}
                      </Text>
                      <Text style={styles.airbnbLocation} numberOfLines={1}>
                        <Ionicons name="location-outline" size={12} color="#6b7280" /> {event.location || event.business?.address || event.business?.name || ""}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          )}

          {/* Activities Section - Airbnb style */}
          {(activeTab === 'all' || activeTab === 'activities') && (
            <View style={styles.listSection}>
              {activeTab === 'all' && activities.length > 0 && (
                <Text style={styles.sectionTitle}>{t("activities.activities")}</Text>
              )}
              {activities.length === 0 && activeTab === 'activities' ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>{t("activities.noActivities")}</Text>
                </View>
              ) : (
                activities.map((activity) => (
                  <Pressable 
                    key={activity.activity_id} 
                    style={styles.airbnbCard}
                    onPress={() => router.push(`/activity/${activity.activity_id}`)}
                  >
                    <View style={styles.airbnbImageContainer}>
                      {activity.image_base64 ? (
                        <RNImage 
                          source={{ uri: activity.image_base64 }} 
                          style={styles.airbnbImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.airbnbImagePlaceholder}>
                          <Ionicons name="people" size={24} color="#10b981" />
                        </View>
                      )}
                      <View style={[styles.airbnbBadge, styles.activityBadgeColor]}>
                        <Text style={[styles.airbnbBadgeText, styles.activityBadgeTextColor]}>{t("activities.activities")}</Text>
                      </View>
                    </View>
                    <View style={styles.airbnbContent}>
                      <Text style={styles.airbnbTitle} numberOfLines={1}>{activity.title}</Text>
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
                          <Ionicons name="chatbubble-outline" size={14} color="#4c6fff" />
                        </Pressable>
                        {activity.is_creator && (
                          <>
                            <Pressable style={styles.airbnbActionBtn} onPress={() => openEditActivity(activity)}>
                              <Ionicons name="create-outline" size={14} color="#4c6fff" />
                            </Pressable>
                            <Pressable style={styles.airbnbActionBtn} onPress={() => handleDeleteActivity(activity.activity_id)}>
                              <Ionicons name="trash-outline" size={14} color="#ef4444" />
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                  </Pressable>
                ))
              )}
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
              <Text style={styles.modalTitle}>{t('activities.createActivity')}</Text>
              <Pressable onPress={() => setCreateModal(false)}>
                <Ionicons name="close" size={22} color="#111827" />
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
                placeholder={t('activities.description')}
                value={form.description}
                onChangeText={(value) =>
                  setForm((prev) => ({ ...prev, description: value }))
                }
                style={[styles.input, styles.textArea]}
                multiline
              />
              <Text style={styles.fieldLabel}>{t('activities.date')}</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={18} color="#4c6fff" />
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
                      const value = date.toISOString().split("T")[0];
                      setForm((prev) => ({ ...prev, date: value }));
                    }
                  }}
                />
              )}
              <Text style={styles.fieldLabel}>{t('activities.time')}</Text>
              <Pressable
                style={styles.pickerButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={18} color="#4c6fff" />
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
              <TextInput
                placeholder={t('activities.location')}
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
              {activityImage ? (
                <AdaptiveImage uri={activityImage} style={styles.activityImage} />
              ) : null}
              <Pressable style={styles.secondaryButton} onPress={pickActivityImage}>
                <Ionicons name="image-outline" size={18} color="#4c6fff" />
                <Text style={styles.secondaryButtonText}>{t('activities.uploadImage')}</Text>
              </Pressable>
              <TextInput
                placeholder={t('activities.maxAttendees')}
                value={form.maxAttendees}
                onChangeText={(value) =>
                  setForm((prev) => ({ ...prev, maxAttendees: value }))
                }
                keyboardType="numeric"
                style={styles.input}
              />
              
              {/* Activity Theme Selection */}
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
                    color={form.isPrivate ? "#8b5cf6" : "#6b7280"} 
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

              {/* Business/Venue Selection */}
              {myBusinesses.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>{t('activities.tagVenue') || 'Tag a Venue (Optional)'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.businessScroll}>
                    <Pressable
                      style={[
                        styles.businessChip,
                        !selectedBusinessId && styles.businessChipSelected
                      ]}
                      onPress={() => setSelectedBusinessId(null)}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={!selectedBusinessId ? "#fff" : "#6b7280"} />
                      <Text style={[styles.businessChipText, !selectedBusinessId && styles.businessChipTextSelected]}>
                        {t('common.none') || 'None'}
                      </Text>
                    </Pressable>
                    {myBusinesses.map((business) => (
                      <Pressable
                        key={business.business_id}
                        style={[
                          styles.businessChip,
                          selectedBusinessId === business.business_id && styles.businessChipSelected
                        ]}
                        onPress={() => setSelectedBusinessId(business.business_id)}
                      >
                        {business.logo_image ? (
                          <RNImage source={{ uri: business.logo_image }} style={styles.businessChipLogo} />
                        ) : (
                          <Ionicons 
                            name="business" 
                            size={16} 
                            color={selectedBusinessId === business.business_id ? "#fff" : "#4c6fff"} 
                          />
                        )}
                        <Text style={[
                          styles.businessChipText, 
                          selectedBusinessId === business.business_id && styles.businessChipTextSelected
                        ]}>
                          {business.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
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
              <Ionicons name="close" size={22} color="#111827" />
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
            <TextInput
              placeholder={t('activities.location')}
              value={form.location}
              onChangeText={(value) => setForm((prev) => ({ ...prev, location: value }))}
              style={styles.input}
            />
            <Pressable style={styles.primaryButton} onPress={handleUpdateActivity}>
              <Text style={styles.primaryButtonText}>{t('activities.saveChanges')}</Text>
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
              <Ionicons name="close" size={22} color="#111827" />
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
    backgroundColor: "#f5f6fb",
  },
  // Map prompt styles
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
    color: "#111827",
  },
  subtitle: {
    color: "#6b7280",
    marginTop: 4,
    fontSize: 13,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4c6fff",
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
    backgroundColor: "#e5e7eb",
  },
  tabActive: {
    backgroundColor: "#4c6fff",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  tabTextActive: {
    color: "#fff",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
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
    color: "#4c6fff",
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
    color: "#10b981",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    padding: 24,
    backgroundColor: "#fff",
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: {
    color: "#9ca3af",
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
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
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
    color: "#4c6fff",
  },
  activityBadgeColor: {
    backgroundColor: "#ecfdf5",
  },
  activityBadgeTextColor: {
    color: "#10b981",
  },
  airbnbContent: {
    flex: 1,
    padding: 10,
    justifyContent: "center",
  },
  airbnbTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  airbnbMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  airbnbLocation: {
    fontSize: 11,
    color: "#9ca3af",
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
    backgroundColor: "#fff",
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
    color: "#111827",
    marginBottom: 8,
  },
  cardMeta: {
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  cardLocation: {
    color: "#4c6fff",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 8,
  },
  cardDescription: {
    marginTop: 10,
    color: "#4b5563",
    lineHeight: 20,
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
    color: "#111827",
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
    color: "#4c6fff",
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
    color: "#4c6fff",
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
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    marginLeft: 8,
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
    color: "#6b7280",
    marginBottom: 4,
  },
  chatText: {
    color: "#111827",
  },
  chatInputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  chatSendButton: {
    backgroundColor: "#4c6fff",
    padding: 10,
    borderRadius: 12,
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
    minHeight: 80,
    textAlignVertical: "top",
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
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  secondaryButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4c6fff",
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
    shadowColor: "#4c6fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 10,
  },
  pickerText: {
    color: "#111827",
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
    borderColor: "#e5e7eb",
    marginRight: 8,
    backgroundColor: "#fff",
  },
  themeEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  themeChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  // Private toggle styles
  privateToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9fafb",
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
    color: "#111827",
  },
  privateToggleHint: {
    fontSize: 12,
    color: "#6b7280",
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
    backgroundColor: "#8b5cf6",
  },
  toggleKnob: {
    width: 24,
    height: 24,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  toggleKnobActive: {
    transform: [{ translateX: 20 }],
  },
  // Join by Code styles
  joinByCodeSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  joinByCodeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 10,
  },
  joinByCodeInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    letterSpacing: 2,
    paddingVertical: 10,
  },
  joinByCodeButton: {
    backgroundColor: "#10b981",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  joinByCodeButtonDisabled: {
    opacity: 0.5,
  },
  joinByCodeButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  // Alternative join by code section for map prompt view
  joinByCodeSectionAlt: {
    marginTop: 32,
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  joinByCodeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
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
    borderColor: "#e5e7eb",
    marginRight: 10,
    backgroundColor: "#fff",
    gap: 8,
  },
  businessChipSelected: {
    backgroundColor: "#4c6fff",
    borderColor: "#4c6fff",
  },
  businessChipLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  businessChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  businessChipTextSelected: {
    color: "#fff",
  },
});

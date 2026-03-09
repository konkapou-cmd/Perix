import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import AdaptiveVideo from "../components/AdaptiveVideo";
import AdaptiveImage from "../components/AdaptiveImage";
import {
  createPost,
  createStory,
  createEvent,
  deleteEvent,
  getBusinessDetail,
  getMyBusinesses,
  updateEvent,
  updateBusiness,
  updateBusinessTheme,
  getCategoryTree,
  getBusinessFanGallery,
  hideBusinessFanGalleryPost,
  getEventThemes,
  BusinessDetail,
  EventItem,
  CategoryGroup,
  Post,
  uploadMedia,
  UploadProgress,
  ProfileTheme,
  Job,
  getMyJobs,
  createJob,
  deleteJob,
  getBusinessAnalytics,
  BusinessAnalytics,
} from "../lib/api";
import InlineThemeBar from "../components/InlineThemeBar";
import { useAuth } from "../context/AuthContext";
import LocationPickerMap from "../components/LocationPickerMap";
import UploadProgressModal from "../components/UploadProgressModal";
import PlacesAutocompleteInput from "../components/PlacesAutocompleteInput";
import VideoGalleryUpload from "../components/VideoGalleryUpload";

// Import refactored components
import {
  ProfileSection,
  CategorySection,
  PostCreationSection,
  StoriesSection,
  EventsSection,
  JobsSection,
  ContactInfoSection,
  FanGallerySection,
  LocationSection,
  OpeningHoursSection,
  OpeningHoursModal,
  JobModal,
  DayHours,
  defaultDayHours,
} from "../components/business";

// Dashboard analytics components
import { AnalyticsDashboard } from "../components/dashboard";

// Days of the week
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function BusinessDashboard() {
  const { t } = useTranslation();
  const { sessionToken, activeIdentity, setActiveIdentity } = useAuth();
  const { safeGoBackToProfile, router } = useSafeNavigation();
  
  // Core state
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Edit modal state
  const [editModal, setEditModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    phone: "",
    website: "",
    email: "",
    tags: "",
    logo_image: "",
    cover_image: "",
  });
  
  // Post creation state
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideo, setPostVideo] = useState<string | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);
  const [postMediaRatio, setPostMediaRatio] = useState<number | null>(null);
  
  // Event state
  const [eventModal, setEventModal] = useState(false);
  const [eventEditing, setEventEditing] = useState<EventItem | null>(null);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    start_time: "",
    location: "",
    image_base64: "",
    video_url: "",
    theme: "",
  });
  const [eventVideoPreview, setEventVideoPreview] = useState<string | null>(null);
  const [eventThemes, setEventThemes] = useState<{slug: string; label: string}[]>([]);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [eventTime, setEventTime] = useState<Date>(new Date());
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  const [showEventTimePicker, setShowEventTimePicker] = useState(false);
  
  // Media gallery state
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryVideos, setGalleryVideos] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaViewerModal, setMediaViewerModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; type: 'image' | 'video'; index: number } | null>(null);
  
  // Opening hours state
  const [hoursModal, setHoursModal] = useState(false);
  const [openingHours, setOpeningHours] = useState<Record<string, DayHours>>(() => {
    const initial: Record<string, DayHours> = {};
    DAYS.forEach((day) => { initial[day] = defaultDayHours(); });
    return initial;
  });
  
  // Location state
  const [locationModal, setLocationModal] = useState(false);
  const [businessLocation, setBusinessLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
  } | null>(null);
  const [locationSearchText, setLocationSearchText] = useState("");
  const [updatingLocation, setUpdatingLocation] = useState(false);
  
  // Category state
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryTree, setCategoryTree] = useState<CategoryGroup[]>([]);
  const [selectedRootCategory, setSelectedRootCategory] = useState<string>("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("");
  const [savingCategory, setSavingCategory] = useState(false);
  
  // Story viewer state
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  
  // Fan gallery state
  const [fanGalleryPosts, setFanGalleryPosts] = useState<Post[]>([]);
  
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  
  // Job state
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobModal, setJobModal] = useState(false);
  const [jobForm, setJobForm] = useState({ title: "", description: "", cover_image: "" });
  const [savingJob, setSavingJob] = useState(false);
  
  // Tab navigation state
  const [activeTab, setActiveTab] = useState<"overview" | "analytics" | "content">("overview");
  
  // Analytics state
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  
  // Theme state
  const [currentTheme, setCurrentTheme] = useState<ProfileTheme | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);
  
  const MAX_VIDEO_SIZE_MB = 300;
  const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

  const getThemeLabel = (slug: string) => {
    const translationKey = `events.themes.${slug}`;
    const translated = t(translationKey);
    if (translated && translated !== translationKey) return translated;
    return eventThemes.find(theme => theme.slug === slug)?.label || slug;
  };

  // Load analytics data
  const loadAnalytics = async (businessId: string) => {
    if (!sessionToken) return;
    setAnalyticsLoading(true);
    try {
      const data = await getBusinessAnalytics(sessionToken, businessId);
      setAnalytics(data);
    } catch (e) {
      console.log("Failed to load analytics:", e);
    }
    setAnalyticsLoading(false);
  };

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      if (!sessionToken) return;
      setLoading(true);
      
      try {
        const categories = await getCategoryTree(sessionToken);
        setCategoryTree(categories);
      } catch (e) { console.log("Failed to load categories:", e); }
      
      try {
        const themes = await getEventThemes();
        setEventThemes(themes);
      } catch (e) { console.log("Failed to load event themes:", e); }
      
      const businesses = await getMyBusinesses(sessionToken);
      if (!businesses.length) {
        setDetail(null);
        setLoading(false);
        return;
      }
      
      const data = await getBusinessDetail(sessionToken, businesses[0].business_id);
      setDetail(data);
      setGalleryImages(data.business.gallery_images || []);
      setGalleryVideos(data.business.gallery_videos || []);
      setCurrentTheme(data.business.theme || null);
      
      // Load analytics
      loadAnalytics(businesses[0].business_id);
      
      try {
        const fanPosts = await getBusinessFanGallery(sessionToken, businesses[0].business_id);
        setFanGalleryPosts(fanPosts);
      } catch (e) { console.log("Failed to load fan gallery:", e); }
      
      try {
        const myJobs = await getMyJobs(sessionToken);
        setJobs(myJobs);
      } catch (e) { console.log("Failed to load jobs:", e); }
      
      if (data.business.latitude && data.business.longitude) {
        setBusinessLocation({
          latitude: data.business.latitude,
          longitude: data.business.longitude,
          address: data.business.address || "",
        });
      }
      
      setSelectedRootCategory(data.business.root_category || "");
      setSelectedSubcategory(data.business.subcategory || "");
      
      if (data.business.opening_hours?.schedule) {
        try {
          const schedule = (data.business.opening_hours as any).schedule as Record<string, DayHours>;
          const loaded: Record<string, DayHours> = {};
          DAYS.forEach((day) => {
            loaded[day] = schedule[day] || defaultDayHours();
          });
          setOpeningHours(loaded);
        } catch (e) { /* Keep default hours */ }
      }
      setLoading(false);
    };
    load();
  }, [sessionToken]);

  // Theme handlers
  const handleThemeChange = (newTheme: ProfileTheme) => {
    setCurrentTheme(newTheme);
  };

  const saveTheme = async () => {
    if (!sessionToken || !detail) return;
    setSavingTheme(true);
    try {
      await updateBusinessTheme(sessionToken, detail.business.business_id, currentTheme || {});
      Alert.alert(
        t('theme.success') || 'Success',
        t('theme.themeUpdated') || 'Theme saved!'
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save theme');
    }
    setSavingTheme(false);
  };

  // Edit handlers
  const openEdit = () => {
    if (!detail) return;
    setForm({
      name: detail.business.name || "",
      description: detail.business.description || "",
      phone: detail.business.phone || "",
      website: detail.business.website || "",
      email: detail.business.email || "",
      tags: detail.business.tags?.join(", ") || "",
      logo_image: detail.business.logo_image || "",
      cover_image: detail.business.cover_image || "",
    });
    setEditModal(true);
  };

  const pickImage = async (target: "logo" | "cover") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setForm((prev) => ({ ...prev, [target === "logo" ? "logo_image" : "cover_image"]: uri }));
    }
  };

  const saveBusiness = async () => {
    if (!sessionToken || !detail) return;
    const updated = await updateBusiness(sessionToken, detail.business.business_id, {
      name: form.name || undefined,
      description: form.description || undefined,
      phone: form.phone || undefined,
      website: form.website || undefined,
      email: form.email || undefined,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      logo_image: form.logo_image || undefined,
      cover_image: form.cover_image || undefined,
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
    setEditModal(false);
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
          setPostVideo(null);
        }
      }
    }
  };

  const handleCreatePost = async () => {
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
    setDetail((prev) => (prev ? { ...prev, posts: [newPost, ...prev.posts] } : prev));
    setPostText("");
    setPostImage(null);
    setPostVideo(null);
    setPostVideoPreview(null);
    setPostMediaRatio(null);
  };

  // Story handlers
  const handleAddStory = async (useCamera?: boolean) => {
    if (!sessionToken || !detail) return;
    
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
    const stories = detail?.stories || [];
    if (direction === 'next' && currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex(currentStoryIndex + 1);
    } else if (direction === 'prev' && currentStoryIndex > 0) {
      setCurrentStoryIndex(currentStoryIndex - 1);
    } else {
      setStoryViewerVisible(false);
    }
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
        theme: event.theme || "",
      });
      setEventVideoPreview(event.video_url || null);
    } else {
      setEventEditing(null);
      const now = new Date();
      setEventDate(now);
      setEventTime(now);
      setEventForm({ title: "", description: "", start_time: "", location: "", image_base64: "", video_url: "", theme: "" });
      setEventVideoPreview(null);
    }
    setEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!sessionToken || !detail) return;
    if (eventEditing) {
      const updated = await updateEvent(sessionToken, eventEditing.event_id, {
        title: eventForm.title || eventEditing.title,
        description: eventForm.description || undefined,
        image_base64: eventForm.image_base64 || undefined,
        video_url: eventForm.video_url || undefined,
        start_time: eventForm.start_time || eventEditing.start_time,
        end_time: undefined,
        location: eventForm.location || undefined,
        theme: eventForm.theme || undefined,
      });
      setDetail((prev) =>
        prev ? { ...prev, events: prev.events.map((item) => item.event_id === updated.event_id ? updated : item) } : prev
      );
    } else {
      const created = await createEvent(sessionToken, {
        business_id: detail.business.business_id,
        title: eventForm.title || t('events.newEvent') || "New Event",
        description: eventForm.description || undefined,
        image_base64: eventForm.image_base64 || "",
        video_url: eventForm.video_url || undefined,
        start_time: eventForm.start_time || new Date().toISOString(),
        end_time: undefined,
        location: eventForm.location || undefined,
        theme: eventForm.theme || undefined,
      });
      setDetail((prev) => prev ? { ...prev, events: [created, ...prev.events] } : prev);
    }
    setEventModal(false);
    setEventVideoPreview(null);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!sessionToken) return;
    await deleteEvent(sessionToken, eventId);
    setDetail((prev) => prev ? { ...prev, events: prev.events.filter((evt) => evt.event_id !== eventId) } : prev);
  };

  // Gallery handlers
  const handleAddGalleryPhoto = async () => {
    if (!sessionToken || !detail) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      setUploadingMedia(true);
      try {
        const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const newImages = [...galleryImages, uri];
        await updateBusiness(sessionToken, detail.business.business_id, { gallery_images: newImages });
        setGalleryImages(newImages);
        setDetail((prev) => prev ? { ...prev, business: { ...prev.business, gallery_images: newImages } } : prev);
      } catch (error) {
        Alert.alert(t("business.uploadFailed"), t("business.pleaseTryAgain"));
      }
      setUploadingMedia(false);
    }
  };

  const handleAddGalleryVideo = async () => {
    if (!sessionToken || !detail) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.7,
      videoMaxDuration: 120,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(t("common.error"), t("home.videoTooLarge") || `Video must be under ${MAX_VIDEO_SIZE_MB}MB`);
        return;
      }
      setUploadingMedia(true);
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "preparing", progress: 0 });
        
        // Step 1: Upload to Cloudinary
        console.log("[VideoUpload] Starting upload to Cloudinary...");
        const uploaded = await uploadMedia(sessionToken, asset.uri, "video", setUploadProgress);
        console.log("[VideoUpload] Cloudinary URL received:", uploaded);
        
        if (!uploaded) {
          throw new Error("Upload returned empty URL");
        }
        
        // Step 2: Update business with new video URL
        const newVideos = [...galleryVideos, uploaded];
        console.log("[VideoUpload] Updating business with videos:", newVideos.length);
        
        const updatedBusiness = await updateBusiness(sessionToken, detail.business.business_id, { gallery_videos: newVideos });
        console.log("[VideoUpload] Business updated, gallery_videos count:", updatedBusiness?.gallery_videos?.length);
        
        // Step 3: Update local state
        setGalleryVideos(newVideos);
        setDetail((prev) => prev ? { ...prev, business: { ...prev.business, gallery_videos: newVideos } } : prev);
        setTimeout(() => { setShowUploadProgress(false); setUploadProgress(null); }, 1000);
        Alert.alert(t("common.success"), t("business.videoUploadSuccess"));
      } catch (error: any) {
        console.error("[VideoUpload] Error:", error);
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("business.uploadFailed"), `${error?.message || "Unknown error"}`);
      }
      setUploadingMedia(false);
    }
  };

  const handleDeleteGalleryImage = async (index: number) => {
    if (!sessionToken || !detail) return;
    const newImages = galleryImages.filter((_, i) => i !== index);
    await updateBusiness(sessionToken, detail.business.business_id, { gallery_images: newImages });
    setGalleryImages(newImages);
  };

  const handleDeleteGalleryVideo = async (index: number) => {
    if (!sessionToken || !detail) return;
    const newVideos = galleryVideos.filter((_, i) => i !== index);
    await updateBusiness(sessionToken, detail.business.business_id, { gallery_videos: newVideos });
    setGalleryVideos(newVideos);
  };

  const openMediaViewer = (uri: string, type: 'image' | 'video', index: number) => {
    setSelectedMedia({ uri, type, index });
    setMediaViewerModal(true);
  };

  const deleteMediaFromViewer = async () => {
    if (!selectedMedia || !sessionToken || !detail) return;
    Alert.alert(t("business.confirmDelete"), "", [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("business.deleteMedia"),
        style: "destructive",
        onPress: async () => {
          if (selectedMedia.type === 'image') {
            await handleDeleteGalleryImage(selectedMedia.index);
          } else {
            await handleDeleteGalleryVideo(selectedMedia.index);
          }
          setMediaViewerModal(false);
          setSelectedMedia(null);
          Alert.alert(t("common.success"), t("business.mediaDeleted"));
        },
      },
    ]);
  };

  // Fan gallery handler
  const handleHideFanPost = async (postId: string) => {
    if (!sessionToken || !detail) return;
    try {
      await hideBusinessFanGalleryPost(sessionToken, detail.business.business_id, postId);
      setFanGalleryPosts((prev) => prev.filter((p) => p.post_id !== postId));
    } catch (error) {
      Alert.alert(t("common.error"), t("common.error"));
    }
  };

  // Opening hours handlers
  const saveOpeningHours = async () => {
    if (!sessionToken || !detail) return;
    try {
      await updateBusiness(sessionToken, detail.business.business_id, {
        opening_hours: { schedule: openingHours } as any,
      });
      setDetail((prev) =>
        prev ? { ...prev, business: { ...prev.business, opening_hours: { schedule: openingHours } } } as any : prev
      );
      setHoursModal(false);
      Alert.alert(t("common.success"), t("business.hoursSaved"));
    } catch (error) {
      Alert.alert(t("common.error"), t("business.failedSaveHours"));
    }
  };

  // Job handlers
  const handleCreateJob = async () => {
    if (!sessionToken || !detail || !jobForm.title.trim() || !jobForm.description.trim()) {
      Alert.alert(t("common.error"), t("common.fillAllFields"));
      return;
    }
    setSavingJob(true);
    try {
      const newJob = await createJob(sessionToken, {
        title: jobForm.title,
        description: jobForm.description,
        cover_image: jobForm.cover_image || undefined,
        root_category: detail.business.root_category || "",
        subcategory: detail.business.subcategory || "",
      });
      setJobs([newJob, ...jobs]);
      setJobModal(false);
      setJobForm({ title: "", description: "", cover_image: "" });
      Alert.alert(t("common.success"), t("jobs.createJob"));
    } catch (error) {
      Alert.alert(t("common.error"), String(error));
    }
    setSavingJob(false);
  };

  const handleDeleteJob = async (jobId: string) => {
    Alert.alert(t("jobs.deleteJob"), t("jobs.confirmDeleteJob"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          if (!sessionToken) return;
          try {
            await deleteJob(sessionToken, jobId);
            setJobs(jobs.filter((j) => j.job_id !== jobId));
            Alert.alert(t("common.success"), t("jobs.jobDeleted"));
          } catch (error) {
            Alert.alert(t("common.error"), String(error));
          }
        },
      },
    ]);
  };

  // Category handlers
  const openCategoryModal = () => {
    if (detail) {
      setSelectedRootCategory(detail.business.root_category || "");
      setSelectedSubcategory(detail.business.subcategory || "");
    }
    setCategoryModal(true);
  };

  const getSubcategories = () => {
    if (!selectedRootCategory) return [];
    const root = categoryTree.find((c) => c.slug === selectedRootCategory);
    return root?.subcategories || [];
  };

  const saveCategory = async () => {
    if (!sessionToken || !detail || !selectedSubcategory) {
      Alert.alert(t("common.error"), t("business.selectCategorySubcategory"));
      return;
    }
    setSavingCategory(true);
    try {
      await updateBusiness(sessionToken, detail.business.business_id, {
        root_category: selectedRootCategory,
        subcategory: selectedSubcategory,
      } as any);
      setDetail((prev) =>
        prev ? { ...prev, business: { ...prev.business, root_category: selectedRootCategory, subcategory: selectedSubcategory } } : prev
      );
      setCategoryModal(false);
      Alert.alert(t("common.success"), t("business.categoryUpdated"));
    } catch (error: any) {
      Alert.alert(t("common.error"), error?.message || t("business.failedUpdateCategory"));
    }
    setSavingCategory(false);
  };

  // Location handlers
  const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
    try {
      const result = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      if (result && result.length > 0) {
        const loc = result[0];
        return [loc.street, loc.city, loc.region, loc.country].filter(Boolean).join(", ");
      }
      return "";
    } catch (e) {
      return "";
    }
  };

  const handleGetCurrentLocation = async () => {
    try {
      setUpdatingLocation(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("business.permissionDenied"), t("business.locationPermissionRequired"));
        setUpdatingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const address = await reverseGeocode(location.coords.latitude, location.coords.longitude);
      setBusinessLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: address || "",
      });
      setLocationSearchText(address || "");
      setUpdatingLocation(false);
    } catch (error) {
      Alert.alert(t("common.error"), t("business.failedGetLocation"));
      setUpdatingLocation(false);
    }
  };

  const handleSaveLocation = async () => {
    if (!sessionToken || !detail || !businessLocation) return;
    try {
      setUpdatingLocation(true);
      await updateBusiness(sessionToken, detail.business.business_id, {
        latitude: businessLocation.latitude,
        longitude: businessLocation.longitude,
        address: businessLocation.address || locationSearchText,
      });
      setDetail((prev) =>
        prev ? { ...prev, business: { ...prev.business, latitude: businessLocation.latitude, longitude: businessLocation.longitude, address: businessLocation.address || locationSearchText } } : prev
      );
      setLocationModal(false);
      Alert.alert(t("common.success"), t("business.locationUpdated"));
    } catch (error) {
      Alert.alert(t("common.error"), t("business.failedUpdateLocation"));
    }
    setUpdatingLocation(false);
  };

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color="#4c6fff" />
      </SafeAreaView>
    );
  }

  // No business state
  if (!detail) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.emptyText}>No business profile yet.</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push("/profile")}>
          <Text style={styles.primaryButtonText}>Create one in Profile</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Back Button */}
        <Pressable style={styles.backButton} onPress={safeGoBackToProfile}>
          <Ionicons name="chevron-back" size={20} color="#4c6fff" />
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </Pressable>
        
        <Text style={styles.title}>Business Dashboard</Text>
        <Text style={styles.subtitle}>{detail.business.name}</Text>

        {/* Tab Navigation */}
        <View style={styles.tabContainer} testID="business-dashboard-tabs" data-testid="business-dashboard-tabs">
          <Pressable 
            style={[styles.tab, activeTab === "overview" && styles.tabActive]}
            onPress={() => setActiveTab("overview")}
            testID="business-tab-overview"
            accessibilityLabel="business-tab-overview"
          >
            <Ionicons name="grid-outline" size={18} color={activeTab === "overview" ? "#4c6fff" : "#6b7280"} />
            <Text style={[styles.tabText, activeTab === "overview" && styles.tabTextActive]}>{t("common.overview")}</Text>
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "analytics" && styles.tabActive]}
            onPress={() => setActiveTab("analytics")}
            testID="business-tab-analytics"
            accessibilityLabel="business-tab-analytics"
          >
            <Ionicons name="analytics-outline" size={18} color={activeTab === "analytics" ? "#4c6fff" : "#6b7280"} />
            <Text style={[styles.tabText, activeTab === "analytics" && styles.tabTextActive]}>{t("common.analytics")}</Text>
          </Pressable>
          <Pressable 
            style={[styles.tab, activeTab === "content" && styles.tabActive]}
            onPress={() => setActiveTab("content")}
            testID="business-tab-content"
            accessibilityLabel="business-tab-content"
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
                type="business"
                profileViews={analytics.total_profile_views}
                followers={analytics.total_followers}
                totalEvents={analytics.total_events}
                totalAttendees={analytics.total_event_attendees}
                totalActivities={analytics.total_activities}
                engagementRate={analytics.engagement_rate}
                topEvents={analytics.top_events}
                growthData={analytics.growth_data}
                onEventPress={(eventId) => router.push(`/event/${eventId}`)}
                onRefresh={() => detail && loadAnalytics(detail.business.business_id)}
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
            <ProfileSection
              businessName={detail.business.name}
              onEdit={openEdit}
              onOpenPublicProfile={() => router.push(`/business/${detail.business.business_id}`)}
            />

            {/* Inline Theme Editor */}
            <InlineThemeBar
              currentTheme={currentTheme}
              onThemeChange={handleThemeChange}
              onSave={saveTheme}
              saving={savingTheme}
              showPreview={true}
            />

            <CategorySection
              rootCategory={detail.business.root_category}
              subcategory={detail.business.subcategory}
              onChangeCategory={openCategoryModal}
            />

            <EventsSection
              events={detail.events}
              onAddEvent={() => openEventModal()}
              onEditEvent={openEventModal}
              onDeleteEvent={handleDeleteEvent}
            />

            <JobsSection
              jobs={jobs}
              onAddJob={() => setJobModal(true)}
              onDeleteJob={handleDeleteJob}
            />

            <ContactInfoSection
              phone={detail.business.phone}
              website={detail.business.website}
              email={detail.business.email}
            />

            <FanGallerySection
              posts={fanGalleryPosts}
              onViewMedia={openMediaViewer}
              onHidePost={handleHideFanPost}
            />

            <LocationSection
              location={businessLocation}
              onSetLocation={() => setLocationModal(true)}
            />

            <OpeningHoursSection
              openingHours={openingHours}
              onEditHours={() => setHoursModal(true)}
            />
          </>
        )}

        {/* Content Tab */}
        {activeTab === "content" && (
          <>
            <PostCreationSection
              postText={postText}
              postImage={postImage}
              postVideoPreview={postVideoPreview}
              postMediaRatio={postMediaRatio}
              onTextChange={setPostText}
              onPickImage={pickPostImage}
              onPickVideo={pickPostVideo}
              onCreatePost={handleCreatePost}
              onCreateStory={openStoryPicker}
            />

            <StoriesSection
              stories={detail.stories || []}
              onViewStory={openStoryViewer}
            />

            {/* Media Gallery - inline since it has unique interaction patterns */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t("business.mediaBranding")}</Text>
              <View style={styles.mediaActions}>
                <Pressable style={styles.mediaButton} onPress={handleAddGalleryPhoto} disabled={uploadingMedia}>
                  <Ionicons name="image-outline" size={18} color="#4c6fff" />
                  <Text style={styles.mediaButtonText}>{t("business.addPhoto")}</Text>
                </Pressable>
                <Pressable style={styles.mediaButton} onPress={handleAddGalleryVideo} disabled={uploadingMedia}>
                  <Ionicons name="videocam-outline" size={18} color="#4c6fff" />
                  <Text style={styles.mediaButtonText}>{t("business.addVideo")}</Text>
                </Pressable>
              </View>
              {uploadingMedia && (
                <View style={styles.uploadingRow}>
                  <ActivityIndicator size="small" color="#4c6fff" />
                  <Text style={styles.uploadingText}>{t("business.uploading")}</Text>
                </View>
              )}
              {galleryImages.length > 0 && (
                <View style={styles.gallerySection}>
                  <Text style={styles.galleryLabel}>{t("business.photos")} ({galleryImages.length})</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {galleryImages.map((img, idx) => (
                      <View key={idx} style={styles.galleryItemWrapper}>
                        <Pressable onPress={() => openMediaViewer(img, 'image', idx)}>
                          <Image source={{ uri: img }} style={styles.galleryImage} />
                        </Pressable>
                        <Pressable style={styles.deleteGalleryBtn} onPress={() => handleDeleteGalleryImage(idx)}>
                          <Ionicons name="close-circle" size={22} color="#ef4444" />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
              
              {/* Video Gallery using new component */}
              <VideoGalleryUpload
                videos={galleryVideos}
                onVideosChange={async (newVideos) => {
                  if (sessionToken && detail) {
                    try {
                      await updateBusiness(sessionToken, detail.business.business_id, { gallery_videos: newVideos });
                      setGalleryVideos(newVideos);
                      setDetail((prev) => prev ? { ...prev, business: { ...prev.business, gallery_videos: newVideos } } : prev);
                    } catch (error) {
                      console.error("[VideoGallery] Failed to update business:", error);
                    }
                  }
                }}
                sessionToken={sessionToken || ""}
                title={t("business.videos") || "Videos"}
                emptyText={t("business.noVideos") || "No videos yet"}
              />
              
              {galleryImages.length === 0 && galleryVideos.length === 0 && !uploadingMedia && (
                <Text style={styles.emptyText}>{t("business.noMedia")}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Edit Business Modal */}
      <Modal visible={editModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("business.editInfo")}</Text>
            <Pressable onPress={() => setEditModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput placeholder={t("business.name")} value={form.name} onChangeText={(value) => setForm((prev) => ({ ...prev, name: value }))} style={styles.input} />
            <TextInput placeholder={t("profile.description")} value={form.description} onChangeText={(value) => setForm((prev) => ({ ...prev, description: value }))} style={[styles.input, styles.textArea]} multiline />
            <TextInput placeholder={t("business.phone")} value={form.phone} onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))} style={styles.input} />
            <TextInput placeholder={t("business.website")} value={form.website} onChangeText={(value) => setForm((prev) => ({ ...prev, website: value }))} style={styles.input} />
            <TextInput placeholder={t("auth.email")} value={form.email} onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))} style={styles.input} />
            <TextInput placeholder={t("business.tags")} value={form.tags} onChangeText={(value) => setForm((prev) => ({ ...prev, tags: value }))} style={styles.input} />
            <Pressable style={styles.secondaryButton} onPress={() => pickImage("logo")}><Text style={styles.secondaryButtonText}>{t("business.updateLogo")}</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => pickImage("cover")}><Text style={styles.secondaryButtonText}>{t("business.updateCover")}</Text></Pressable>
            <Pressable style={styles.primaryButton} onPress={saveBusiness}><Text style={styles.primaryButtonText}>{t("business.saveChanges")}</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Opening Hours Modal */}
      <OpeningHoursModal
        visible={hoursModal}
        onClose={() => setHoursModal(false)}
        openingHours={openingHours}
        onHoursChange={setOpeningHours}
        onSave={saveOpeningHours}
      />

      {/* Location Modal */}
      <Modal visible={locationModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("business.setBusinessLocation")}</Text>
            <Pressable onPress={() => setLocationModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.locationModalHint}>{t("business.locationModalHint")}</Text>
            <Pressable style={[styles.primaryButton, { marginBottom: 16 }]} onPress={handleGetCurrentLocation} disabled={updatingLocation}>
              {updatingLocation ? <ActivityIndicator size="small" color="#fff" /> : (
                <>
                  <Ionicons name="locate-outline" size={18} color="#fff" />
                  <Text style={[styles.primaryButtonText, { marginLeft: 8 }]}>{t("business.useCurrentLocation")}</Text>
                </>
              )}
            </Pressable>
            <TextInput placeholder={t("business.addressOptional")} value={locationSearchText} onChangeText={setLocationSearchText} style={styles.input} />
            <LocationPickerMap
              location={businessLocation}
              onLocationChange={(newLoc) => {
                setBusinessLocation({ latitude: newLoc.latitude, longitude: newLoc.longitude, address: newLoc.address || businessLocation?.address || locationSearchText || "" });
                if (newLoc.address) setLocationSearchText(newLoc.address);
              }}
            />
            {businessLocation && (
              <View style={styles.locationPreview}>
                <Text style={styles.locationPreviewTitle}>{t("business.currentLocation")}</Text>
                <Text style={styles.locationPreviewCoords}>{t("business.lat")}: {businessLocation.latitude.toFixed(6)}</Text>
                <Text style={styles.locationPreviewCoords}>{t("business.lon")}: {businessLocation.longitude.toFixed(6)}</Text>
                {businessLocation.address && <Text style={styles.locationPreviewAddress}>{businessLocation.address}</Text>}
              </View>
            )}
            <Pressable style={[styles.primaryButton, { marginTop: 16 }]} onPress={handleSaveLocation} disabled={!businessLocation || updatingLocation}>
              {updatingLocation ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>{t("business.saveLocation")}</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Category Modal */}
      <Modal visible={categoryModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("business.changeCategoryTitle")}</Text>
            <Pressable onPress={() => setCategoryModal(false)}><Ionicons name="close" size={22} color="#111827" /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.categoryModalHint}>{t("business.categoryModalHint")}</Text>
            <Text style={styles.pickerLabel}>{t("business.rootCategory")}</Text>
            <View style={styles.categoryPickerContainer}>
              {categoryTree.map((cat) => (
                <Pressable key={cat.slug} style={[styles.categoryChip, selectedRootCategory === cat.slug && styles.categoryChipSelected]} onPress={() => { setSelectedRootCategory(cat.slug); setSelectedSubcategory(""); }}>
                  <Text style={[styles.categoryChipText, selectedRootCategory === cat.slug && styles.categoryChipTextSelected]}>{cat.slug}</Text>
                </Pressable>
              ))}
            </View>
            {selectedRootCategory && (
              <>
                <Text style={[styles.pickerLabel, { marginTop: 20 }]}>{t("business.subcategory")}</Text>
                <View style={styles.categoryPickerContainer}>
                  {getSubcategories().map((sub) => (
                    <Pressable key={sub.slug} style={[styles.categoryChip, selectedSubcategory === sub.slug && styles.categoryChipSelected]} onPress={() => setSelectedSubcategory(sub.slug)}>
                      <Text style={[styles.categoryChipText, selectedSubcategory === sub.slug && styles.categoryChipTextSelected]}>{sub.slug}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
            <Pressable style={[styles.primaryButton, { marginTop: 24 }]} onPress={saveCategory} disabled={!selectedSubcategory || savingCategory}>
              {savingCategory ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>{t("business.saveCategory")}</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Media Viewer Modal */}
      <Modal visible={mediaViewerModal} animationType="fade" transparent>
        <View style={styles.mediaViewerOverlay}>
          <Pressable style={styles.mediaViewerCloseArea} onPress={() => { setMediaViewerModal(false); setSelectedMedia(null); }}>
            <View style={styles.mediaViewerHeader}>
              <Pressable onPress={() => { setMediaViewerModal(false); setSelectedMedia(null); }} style={styles.mediaViewerCloseBtn}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </View>
          </Pressable>
          <View style={styles.mediaViewerContent}>
            {selectedMedia?.type === 'image' && <Image source={{ uri: selectedMedia.uri }} style={styles.mediaViewerImage} resizeMode="contain" />}
            {selectedMedia?.type === 'video' && <AdaptiveVideo source={{ uri: selectedMedia.uri }} style={styles.mediaViewerVideo} useNativeControls resizeMode="contain" />}
          </View>
          <View style={styles.mediaViewerActions}>
            <Pressable style={styles.mediaViewerDeleteBtn} onPress={deleteMediaFromViewer}>
              <Ionicons name="trash-outline" size={22} color="#fff" />
              <Text style={styles.mediaViewerDeleteText}>{t("business.deleteMedia")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Job Modal */}
      <JobModal
        visible={jobModal}
        onClose={() => setJobModal(false)}
        jobForm={jobForm}
        onFormChange={setJobForm}
        onSave={handleCreateJob}
        isSaving={savingJob}
      />

      {/* Story Viewer Modal */}
      <Modal visible={storyViewerVisible} animationType="fade" transparent onRequestClose={() => setStoryViewerVisible(false)}>
        <View style={styles.storyViewerOverlay}>
          <Pressable style={styles.storyViewerClose} onPress={() => setStoryViewerVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {detail?.stories && detail.stories[currentStoryIndex] && (
            <Image source={{ uri: detail.stories[currentStoryIndex].image_base64 }} style={styles.storyViewerImage} resizeMode="contain" />
          )}
          <View style={styles.storyViewerNav}>
            <Pressable style={styles.storyNavButton} onPress={() => navigateStory('prev')}>
              <Ionicons name="chevron-back" size={32} color="#fff" />
            </Pressable>
            <Text style={styles.storyCounter}>{currentStoryIndex + 1} / {detail?.stories?.length || 0}</Text>
            <Pressable style={styles.storyNavButton} onPress={() => navigateStory('next')}>
              <Ionicons name="chevron-forward" size={32} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Modal>

      <UploadProgressModal visible={showUploadProgress} progress={uploadProgress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f6fb" },
  content: { padding: 20, paddingBottom: 100 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  backButton: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  backButtonText: { color: "#4c6fff", fontWeight: "600", marginLeft: 4 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  subtitle: { color: "#6b7280", marginTop: 4, marginBottom: 12 },
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
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontWeight: "600", color: "#111827", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#4c6fff", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#e5e7eb", paddingVertical: 10, borderRadius: 12, alignItems: "center", marginTop: 8, flexDirection: "row", justifyContent: "center" },
  secondaryButtonText: { color: "#4c6fff", fontWeight: "600" },
  emptyText: { color: "#9ca3af", marginBottom: 12 },
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  modalTitle: { fontSize: 18, fontWeight: "600", color: "#111827" },
  modalBody: { padding: 20 },
  // Media Gallery
  mediaActions: { flexDirection: "row", marginBottom: 12, gap: 10 },
  mediaButton: { 
    flex: 1, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  mediaButtonText: { 
    color: "#4c6fff", 
    fontWeight: "600",
    fontSize: 14,
  },
  uploadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  uploadingText: { marginLeft: 8, color: "#6b7280" },
  gallerySection: { marginTop: 12 },
  galleryLabel: { color: "#6b7280", fontSize: 13, marginBottom: 8 },
  galleryItemWrapper: { position: "relative", marginRight: 12 },
  galleryImage: { width: 100, height: 100, borderRadius: 12, backgroundColor: "#e5e7eb" },
  videoThumbnail: { width: 100, height: 100, borderRadius: 12, backgroundColor: "#374151", justifyContent: "center", alignItems: "center" },
  deleteGalleryBtn: { position: "absolute", top: -8, right: -8, backgroundColor: "#fff", borderRadius: 12 },
  // Location
  locationModalHint: { fontSize: 14, color: "#6b7280", marginBottom: 20, lineHeight: 20 },
  locationPreview: { backgroundColor: "#f3f4f6", borderRadius: 12, padding: 16, marginTop: 12 },
  locationPreviewTitle: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 },
  locationPreviewCoords: { fontSize: 13, color: "#6b7280", marginBottom: 2 },
  locationPreviewAddress: { fontSize: 14, color: "#374151", marginTop: 8 },
  // Category
  categoryModalHint: { fontSize: 14, color: "#6b7280", marginBottom: 20, lineHeight: 20 },
  pickerLabel: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8, marginTop: 8 },
  categoryPickerContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: "#f3f4f6", marginBottom: 4 },
  categoryChipSelected: { backgroundColor: "#4c6fff" },
  categoryChipText: { fontSize: 13, color: "#374151", fontWeight: "500" },
  categoryChipTextSelected: { color: "#fff" },
  // Media Viewer
  mediaViewerOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.95)", justifyContent: "space-between" },
  mediaViewerCloseArea: { flex: 1 },
  mediaViewerHeader: { flexDirection: "row", justifyContent: "flex-end", padding: 16, paddingTop: 48 },
  mediaViewerCloseBtn: { padding: 8 },
  mediaViewerContent: { flex: 3, justifyContent: "center", alignItems: "center" },
  mediaViewerImage: { width: "100%", height: "100%" },
  mediaViewerVideo: { width: "100%", height: "100%" },
  mediaViewerActions: { padding: 20, paddingBottom: 40, alignItems: "center" },
  mediaViewerDeleteBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#ef4444", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, gap: 8 },
  mediaViewerDeleteText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  // Story Viewer
  storyViewerOverlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.95)", justifyContent: "center", alignItems: "center" },
  storyViewerClose: { position: "absolute", top: 50, right: 20, zIndex: 10, backgroundColor: "rgba(255, 255, 255, 0.15)", borderRadius: 20, padding: 8 },
  storyViewerImage: { width: "90%", height: "70%" },
  storyViewerNav: { position: "absolute", bottom: 60, flexDirection: "row", alignItems: "center", gap: 30 },
  storyNavButton: { backgroundColor: "rgba(255, 255, 255, 0.15)", borderRadius: 25, padding: 10 },
  storyCounter: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

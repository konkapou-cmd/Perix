import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
  Modal,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

import { useAuth } from "../../context/AuthContext";
import { SkeletonBox } from "../../components/shared";
import { COLORS } from "../../lib/designTokens";
import {
  Business,
  CategoryGroup,
  EventItem,
  Post,
  Job,
  createBusiness,
  getCategoryTree,
  getMyBusinesses,
  getMyFriends,
  getBusinesses,
  updateProfileGallery,
  updateProfileMedia,
  updateProfileInfo,
  uploadMedia,
  uploadVideoMux,
  uploadImageToCloudinary,
  UploadProgress,
  MAX_VIDEO_SIZE_BYTES,
  deleteBusiness,
  deleteUserAccount,
  User,
  checkAdminStatus,
  updateGalleryCaption,
  GalleryItem,
  getBusinessDetail,
  BusinessDetail,
  updateBusiness,
  updateBusinessGallery,
  createPost,
  updatePost,
  deletePost,
  updateBusinessTheme,
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  createEvent,
  updateEvent,
  getEventThemes,
  deleteEvent,
  deleteJob,
  createJob,
  createRental,
  deleteRental,
  updateUserSlug,
  updateBusinessSlug,
  getPosts,
  updateProfileTheme,
  getUserPublicProfile,
  ActivityItem,
} from "../../lib/api";
import UploadProgressSheet from "../../components/UploadProgressSheet";
import ThemeCustomizer from "../../components/ThemeCustomizer";
import { LanguagePicker } from "../../components/LanguagePicker";
import { IdentityDropdown } from "../../components/profile/IdentityDropdown";

// Optional toggle to easily revert background color change for the profile switcher

const TAGGING_ENABLED = true;
import { UserProfilePremium } from "../../components/profile/UserProfilePremium";
import { BusinessProfilePremium } from "../../components/profile/BusinessProfilePremium";
import { EventModal } from "../../components/business";
import { JobModal } from "../../components/business";
import { RentalModal } from "../../components/business";
import ActivityModal from "../../components/business/ActivityModal";
import { useMapBounds } from "../../context/MapBoundsContext";
import OpeningHoursModal from "../../components/business/OpeningHoursModal";
import SocialLinksModal from "../../components/SocialLinksModal";
import PlacesAutocompleteInput from "../../components/PlacesAutocompleteInput";

const FALLBACK_CATEGORY_TREE: CategoryGroup[] = [
  {
    name: "🟢 Sports & Wellness",
    slug: "sports-wellness",
    subcategories: [
      { name: "Gyms", slug: "gyms", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Team Sports", slug: "team-sports", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Racket Sports", slug: "racket-sports", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Martial Arts", slug: "martial-arts", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Swimming", slug: "swimming", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Crossfit Functional", slug: "crossfit-functional", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Extreme Sports", slug: "extreme-sports", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Dance", slug: "dance", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Personal Training", slug: "personal-training", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Wellness Rehabilitation", slug: "wellness-rehabilitation", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "👕 Fashion & Retail",
    slug: "fashion-retail",
    subcategories: [
      { name: "Casual Wear", slug: "casual-wear", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Formal Wear", slug: "formal-wear", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Sportswear", slug: "sportswear", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Footwear", slug: "footwear", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Accessories", slug: "accessories", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Childrens Clothing", slug: "childrens-clothing", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Vintage Thrift", slug: "vintage-thrift", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Tailoring Custom", slug: "tailoring-custom", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Bags Leather Goods", slug: "bags-leather-goods", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "🎭 Entertainment",
    slug: "entertainment",
    subcategories: [
      { name: "Cinema", slug: "cinema", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Theatre", slug: "theatre", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Bowling", slug: "bowling", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Escape Rooms", slug: "escape-rooms", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Vr Gaming", slug: "vr-gaming", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Stand Up Comedy", slug: "stand-up-comedy", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Indoor Playgrounds", slug: "indoor-playgrounds", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Arcade", slug: "arcade", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Event Venues", slug: "event-venues", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Exhibitions Cultural", slug: "exhibitions-cultural", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "🍸 Bars & Nightlife",
    slug: "bars-nightlife",
    subcategories: [
      { name: "Cocktail Bars", slug: "cocktail-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Wine Bars", slug: "wine-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Beer Bars", slug: "beer-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Rock Bars", slug: "rock-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Jazz Bars", slug: "jazz-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Clubs Dj", slug: "clubs-dj", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Live Folk Music", slug: "live-folk-music", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Sports Bars", slug: "sports-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Activity Bars", slug: "activity-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Rooftop Bars", slug: "rooftop-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Beach Bars", slug: "beach-bars", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "After Hours", slug: "after-hours", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "🏢 Professional Services",
    slug: "professional-services",
    subcategories: [
      { name: "Law Firms", slug: "law-firms", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Accounting", slug: "accounting", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Real Estate", slug: "real-estate", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Travel Agencies", slug: "travel-agencies", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Insurance", slug: "insurance", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Consulting", slug: "consulting", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Marketing Digital", slug: "marketing-digital", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "It Services", slug: "it-services", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Translation Services", slug: "translation-services", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "💄 Beauty & Personal Care",
    slug: "beauty-care",
    subcategories: [
      { name: "Hair Salons", slug: "hair-salons", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Barbershops", slug: "barbershops", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Nail Salons", slug: "nail-salons", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Spas", slug: "spas", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Dermatology Laser", slug: "dermatology-laser", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Makeup Services", slug: "makeup-services", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Facial Body Treatments", slug: "facial-body-treatments", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Tanning Salons", slug: "tanning-salons", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "🎓 Education & Creativity",
    slug: "education-creativity",
    subcategories: [
      { name: "Tutoring", slug: "tutoring", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Language Schools", slug: "language-schools", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Music Schools", slug: "music-schools", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Dance Schools", slug: "dance-schools", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Art Workshops", slug: "art-workshops", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "🍽️ Restaurants",
    slug: "restaurants",
    subcategories: [
      { name: "Italian", slug: "italian", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Asian", slug: "asian", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Greek", slug: "greek", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Balkan", slug: "balkan", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "German", slug: "german", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "African", slug: "african", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "American", slug: "american", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
      { name: "Arabic", slug: "arabic", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: false, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings"] },
    ],
  },
  {
    name: "🏠 Rental & Real Estate",
    slug: "rental-real-estate",
    subcategories: [
      { name: "Apartments", slug: "apartments", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: true, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings", "rentals"] },
      { name: "Houses", slug: "houses", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: true, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings", "rentals"] },
      { name: "Studios", slug: "studios", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: true, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings", "rentals"] },
      { name: "Rooms", slug: "rooms", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: true, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings", "rentals"] },
      { name: "Commercial Spaces", slug: "commercial-spaces", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: true, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings", "rentals"] },
      { name: "Vacation Rentals", slug: "vacation-rentals", modules: { events: true, tickets: true, jobs: true, bookings: true, rentals: true, gym: false, salon: false }, tools: ["events", "tickets", "jobs", "bookings", "rentals"] },
    ],
  },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, logout, sessionToken, activeIdentity, setActiveIdentity, refreshUser } = useAuth();
  const { clearMapBounds } = useMapBounds();
  const insets = useSafeAreaInsets();
  const googleKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  // -- GLOBAL USER STATE --
  const [isAdmin, setIsAdmin] = useState(false);
  const [friends, setFriends] = useState<User[]>([]);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  // Tagging: inline @ mention autocomplete
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCursorPosition, setMentionCursorPosition] = useState(0);
  const [pendingMentionIds, setPendingMentionIds] = useState<string[]>([]);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagUserDraft, setTagUserDraft] = useState<string>("");
  const [tagBusinessDraft, setTagBusinessDraft] = useState<string>("");

  // -- UPLOADING STATE --
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | { phase: "preparing" | "uploading" | "processing" | "complete"; progress: number } | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadContext, setUploadContext] = useState<'post' | 'gallery' | 'avatar' | 'cover' | 'video'>('post');
  const [refreshing, setRefreshing] = useState(false);

  // -- SHARED MODAL STATE --
  const [editModalVisible, setEditModalVisible] = useState(false);

  // -- USER EDIT MODAL STATE --
  const [userEditModalVisible, setUserEditModalVisible] = useState(false);
  const [userEditForm, setUserEditForm] = useState({ name: "", bio: "", location: "", latitude: null as number | null, longitude: null as number | null });

  // -- BUSINESS EDIT MODAL STATE --
  const [bizEditModalVisible, setBizEditModalVisible] = useState(false);
  const [bizEditForm, setBizEditForm] = useState({ name: "", description: "", phone: "", website: "", email: "", tags: "", address: "", latitude: null as number | null, longitude: null as number | null, opening_hours: null as Record<string, { enabled: boolean; periods: { open: string; close: string }[] }> | null, root_category: "", subcategory: "" });
  const [bizLogoNew, setBizLogoNew] = useState<string | null>(null);
  const [bizCoverNew, setBizCoverNew] = useState<string | null>(null);
  const [bizSaving, setBizSaving] = useState(false);
  const [bizCategoryModalVisible, setBizCategoryModalVisible] = useState(false);
  const [bizSubcategoryModalVisible, setBizSubcategoryModalVisible] = useState(false);

  // -- ARTIST EDIT MODAL STATE --
  const userEditScrollRef = useRef<ScrollView>(null);
  const bizEditScrollRef = useRef<ScrollView>(null);

  // ---------------------------------------------------------------------------
  // 1. DATA FETCHING (All Profiles)
  // ---------------------------------------------------------------------------
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [allMapBusinesses, setAllMapBusinesses] = useState<Business[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryGroup[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [pickerRoot, setPickerRoot] = useState("");
  const [pickerSub, setPickerSub] = useState("");
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [eventEditing, setEventEditing] = useState<EventItem | null>(null);
  const [eventForm, setEventForm] = useState<{title: string; description: string; start_time: string; location: string; latitude?: number | null; longitude?: number | null; cover_image_url?: string; image_urls: string[]; video_url?: string; theme: string; gallery_images: string[]; gallery_videos: string[]; is_private: boolean; password: string}>({ title: "", description: "", start_time: "", location: "", latitude: null, longitude: null, cover_image_url: undefined, image_urls: [], video_url: undefined, theme: "", gallery_images: [], gallery_videos: [], is_private: false, password: "" });
  const [eventVideoPreview, setEventVideoPreview] = useState<string | null>(null);
  const [eventThemes, setEventThemes] = useState<{slug: string; label: string; color?: string; emoji?: string; gradient?: [string, string]}[]>([]);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [eventDate, setEventDate] = useState<Date>(new Date());
  const [eventTime, setEventTime] = useState<Date>(new Date());
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  const [showEventTimePicker, setShowEventTimePicker] = useState(false);
  const [jobModalVisible, setJobModalVisible] = useState(false);
  const [jobForm, setJobForm] = useState<{title: string; description: string; cover_image: string; job_type: string; requirements: string; salary_range: string; work_location: string; expires_at: string}>({ title: "", description: "", cover_image: "", job_type: "", requirements: "", salary_range: "", work_location: "", expires_at: "" });
  const [jobSaving, setJobSaving] = useState(false);

  const [rentalModalVisible, setRentalModalVisible] = useState(false);
  const [rentalForm, setRentalForm] = useState<{title: string; description: string; cover_image: string; rent_price: string; rooms_size: string; address: string; latitude: number | null; longitude: number | null; available_from: string; deposit: string; property_type: string; gallery_images: string[]}>({ title: "", description: "", cover_image: "", rent_price: "", rooms_size: "", address: "", latitude: null, longitude: null, available_from: "", deposit: "", property_type: "", gallery_images: [] });
  const [rentalSaving, setRentalSaving] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  const [themedAlertVisible, setThemedAlertVisible] = useState(false);
  const [themedAlertMessage, setThemedAlertMessage] = useState("");
  const [activityEditing, setActivityEditing] = useState<ActivityItem | null>(null);
  const [activityForm, setActivityForm] = useState<{title: string; description: string; date: string; time: string; location: string; latitude?: number | null; longitude?: number | null; cover_image_url?: string; image_urls: string[]; video_url?: string; max_attendees?: number | null; is_private: boolean; theme: string; password: string; gallery_images: string[]; gallery_videos: string[]}>({ title: "", description: "", date: "", time: "", location: "", latitude: null, longitude: null, cover_image_url: undefined, image_urls: [], video_url: undefined, max_attendees: undefined, is_private: false, theme: "", password: "", gallery_images: [], gallery_videos: [] });
  const [activityDate, setActivityDate] = useState<Date>(new Date());
  const [activityTime, setActivityTime] = useState<Date>(new Date());
  const [showActivityDatePicker, setShowActivityDatePicker] = useState(false);
  const [showActivityTimePicker, setShowActivityTimePicker] = useState(false);

  useEffect(() => {
    if (eventEditing?.start_time) {
      try {
        const d = new Date(eventEditing.start_time);
        if (!isNaN(d.getTime())) {
          setEventDate(d);
          setEventTime(d);
        }
      } catch {}
    }
  }, [eventEditing]);

  useEffect(() => {
    if (activityEditing?.date && activityEditing?.time) {
      try {
        const d = new Date(`${activityEditing.date}T${activityEditing.time}`);
        if (!isNaN(d.getTime())) {
          setActivityDate(d);
          setActivityTime(d);
        }
      } catch {}
    }
  }, [activityEditing]);

  const loadData = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const adminRes = await checkAdminStatus(sessionToken);
      setIsAdmin(adminRes.is_admin);

      const [friendRes, bizRes, catRes] = await Promise.all([
        getMyFriends(sessionToken),
        getMyBusinesses(sessionToken),
        getCategoryTree(sessionToken),
      ]);
      
      setFriends(friendRes);
      setBusinesses(bizRes);
      setCategoryTree(catRes && catRes.length > 0 ? catRes : FALLBACK_CATEGORY_TREE);
    } catch (e) {
      console.log("Failed to load initial profile data:", e);
      setCategoryTree(FALLBACK_CATEGORY_TREE);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load ALL businesses for tagging (appear on map)
  const loadTaggingBusinesses = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const allBiz = await getBusinesses(sessionToken);
      setAllMapBusinesses(allBiz || []);
    } catch (e) {
      console.log("Failed to load all businesses for tagging:", e);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadTaggingBusinesses();
  }, [loadTaggingBusinesses]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshUser(), loadData()]);
    if (activeIdentity?.type === "business") {
      await loadBusinessFullData(activeIdentity.id);
    }
    setRefreshing(false);
  };

  const identities = useMemo(() => {
    const ids = [];
    if (user) {
      ids.push({
        type: "user" as const,
        id: user.user_id,
        name: user.name,
        avatar: user.profile_photo || user.picture
      });
    }
    if (businesses.length > 0) {
      ids.push({
        type: "business" as const,
        id: businesses[0].business_id,
        name: businesses[0].name,
        avatar: businesses[0].logo_image
      });
    }
    return ids;
  }, [user, businesses]);

  useEffect(() => {
    if (!activeIdentity && identities.length > 0) {
      setActiveIdentity(identities[0]);
    }
  }, [identities, activeIdentity, setActiveIdentity]);


  // ---------------------------------------------------------------------------
  // 2. USER VIEW STATE & HANDLERS
  // ---------------------------------------------------------------------------
  const [galleryImages, setGalleryImages] = useState<string[]>(user?.gallery_images || []);
  const [galleryVideos, setGalleryVideos] = useState<string[]>(user?.gallery_videos || []);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>(user?.gallery_items || []);
  const [videoItems, setVideoItems] = useState<GalleryItem[]>(user?.video_items || []);
  
  const [displayName, setDisplayName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [location, setLocation] = useState(user?.location || "");
  const [slug, setSlug] = useState((user as any)?.slug || "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(user?.profile_photo || user?.picture || null);
  const [coverPhoto, setCoverPhoto] = useState(user?.cover_photo || null);

  useEffect(() => {
    setGalleryImages(user?.gallery_images || []);
    setGalleryVideos(user?.gallery_videos || []);
    setGalleryItems(user?.gallery_items || []);
    setVideoItems(user?.video_items || []);
    setProfilePhoto(user?.profile_photo || user?.picture || null);
    setCoverPhoto(user?.cover_photo || null);
    setDisplayName(user?.name || "");
    setBio(user?.bio || "");
    setLocation(user?.location || "");
    setSlug((user as any)?.slug || "");
  }, [user]);

  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [userActivities, setUserActivities] = useState<any[]>([]);

  const loadUserActivities = async () => {
    if (!sessionToken || !user) return;
    try {
      const activities = await getActivities(sessionToken);
      const userActivitiesList = activities.filter((a: any) => a.creator_id === user.user_id);
      setUserActivities(userActivitiesList);
    } catch (e) {
      console.log("Failed to load user activities:", e);
    }
  };

  const loadUserProfile = async () => {
    if (!sessionToken || !user) return;
    try {
      // Use getUserPublicProfile to get the same data as the public profile page
      // This ensures consistency between private and public views
      const data = await getUserPublicProfile(sessionToken, user.user_id);
      setUserPosts(data.posts || []);
    } catch (e) {
      // silently fail
    }
  };

  useEffect(() => {
    if (activeIdentity?.type === "user") {
      loadUserProfile();
      loadUserActivities();
    }
  }, [activeIdentity, sessionToken, user]);

  const handlePickPostImage = async () => {
    if (!sessionToken) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.permissionRequired") || "Permission Required", t("home.mediaPermissionMessage") || "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setPostImage(uri);
      setPostVideo(null);
      setPostVideoPreview(null);
    }
  };

  const handlePickPostVideo = async () => {
    if (!sessionToken) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.permissionRequired") || "Permission Required", t("home.mediaPermissionMessage") || "Please allow access to your photo library.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 0.5,
    });
    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_VIDEO_SIZE_BYTES) {
        Alert.alert(t("common.error"), t("home.videoTooLarge") || "Video must be under 300MB.");
        return;
      }
      setPostVideoPreview(asset.uri);
      setPostImage(null);
      if (sessionToken) {
        try {
          setShowUploadProgress(true);
          setUploadContext('video');
          setUploadProgress({ phase: "preparing", progress: 0 });
          const muxResult = await uploadVideoMux(sessionToken, asset.uri, undefined, (progress) => {
            setUploadProgress(progress);
          });
          setPostVideo(muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : ""));
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

  useEffect(() => {
    if (eventModalVisible && eventThemes.length === 0) {
      getEventThemes().then(themes => {
        setEventThemes(themes.map(t => ({ slug: t.slug || t.label?.toLowerCase().replace(/\s+/g, '-') || '', label: t.label || '', color: t.color, emoji: t.emoji, gradient: t.gradient })));
      }).catch((e) => console.warn("Failed to load event themes:", e));
    }
  }, [eventModalVisible]);



  const handleSaveEvent = async () => {
    if (!sessionToken) return;
    if (!eventForm.title.trim()) {
      Alert.alert(t("common.error") || "Error", t("events.titleRequired") || "Title is required");
      return;
    }
    const pad = (n: number) => n.toString().padStart(2, "0");
    const localDateStr = `${eventDate.getFullYear()}-${pad(eventDate.getMonth() + 1)}-${pad(eventDate.getDate())}`;
    const localTimeStr = `${pad(eventTime.getHours())}:${pad(eventTime.getMinutes())}:${pad(eventTime.getSeconds())}`;
    const startISO = new Date(`${localDateStr}T${localTimeStr}`).toISOString();
    try {
      if (eventEditing?.event_id) {
        console.log("[handleSaveEvent] Updating event:", eventEditing.event_id);
        await updateEvent(sessionToken, eventEditing.event_id, {
          title: eventForm.title,
          description: eventForm.description || null,
          cover_image_url: eventForm.cover_image_url || null,
          image_urls: eventForm.image_urls,
          video_url: eventForm.video_url || null,
          start_time: startISO,
          location: eventForm.location || null,
          latitude: eventForm.latitude,
          longitude: eventForm.longitude,
          theme: eventForm.theme || null,
          gallery_images: eventForm.gallery_images,
          gallery_videos: eventForm.gallery_videos,
          is_private: eventForm.is_private,
          password: eventForm.is_private ? (eventForm.password || null) : null,
        });
      } else {
        const payload: any = {
          title: eventForm.title,
          description: eventForm.description || null,
          cover_image_url: eventForm.cover_image_url || null,
          image_urls: eventForm.image_urls,
          video_url: eventForm.video_url || null,
          start_time: startISO,
          location: eventForm.location || null,
          latitude: eventForm.latitude,
          longitude: eventForm.longitude,
          theme: eventForm.theme || null,
          gallery_images: eventForm.gallery_images,
          gallery_videos: eventForm.gallery_videos,
          is_private: eventForm.is_private,
          password: eventForm.is_private ? (eventForm.password || null) : null,
        };
        if (activeIdentity?.type === "business") payload.business_id = activeIdentity.id;
        console.log("[handleSaveEvent] Creating event, payload:", JSON.stringify({ ...payload, image_urls: payload.image_urls?.length, gallery_images: payload.gallery_images?.length, gallery_videos: payload.gallery_videos?.length }));
        await createEvent(sessionToken, payload);
      }
      setEventModalVisible(false);
      setEventEditing(null);
      setEventForm({ title: "", description: "", start_time: "", location: "", latitude: null, longitude: null, cover_image_url: undefined, image_urls: [], video_url: "", theme: "", gallery_images: [], gallery_videos: [], is_private: false, password: "" });
      if (activeIdentity?.type === "business") loadBusinessProfile();
    } catch (e) {
      console.error("[handleSaveEvent] Error:", (e as Error)?.message, "Status:", (e as any)?.status, "eventEditing:", eventEditing?.event_id);
      Alert.alert(t("common.error") || "Error", (e as Error)?.message || t("events.saveFailed") || "Failed to save event");
    }
  };

  const handleSaveActivity = async () => {
    if (!sessionToken) return;
    if (!activityForm.title.trim()) {
      Alert.alert(t("common.error") || "Error", t("activities.titleRequired") || "Title is required");
      return;
    }
    try {
      if (activityEditing) {
        await updateActivity(sessionToken, activityEditing.activity_id, {
          title: activityForm.title,
          description: activityForm.description || undefined,
          date: activityForm.date,
          time: activityForm.time,
          location: activityForm.location || undefined,
          cover_image_url: activityForm.cover_image_url || undefined,
          image_urls: activityForm.image_urls,
          video_url: activityForm.video_url || undefined,
          latitude: activityForm.latitude,
          longitude: activityForm.longitude,
          max_attendees: activityForm.max_attendees,
          is_private: activityForm.is_private,
          password: activityForm.is_private ? (activityForm.password || undefined) : undefined,
          theme: activityForm.theme || undefined,
          gallery_images: activityForm.gallery_images,
          gallery_videos: activityForm.gallery_videos,
        });
      } else {
        await createActivity(sessionToken, {
          title: activityForm.title,
          description: activityForm.description || undefined,
          date: activityForm.date,
          time: activityForm.time,
          location: activityForm.location || "",
          cover_image_url: activityForm.cover_image_url || undefined,
          image_urls: activityForm.image_urls,
          video_url: activityForm.video_url || undefined,
          latitude: activityForm.latitude ?? null,
          longitude: activityForm.longitude ?? null,
          max_attendees: activityForm.max_attendees,
          is_private: activityForm.is_private,
          password: activityForm.is_private ? (activityForm.password || undefined) : undefined,
          theme: activityForm.theme || undefined,
          gallery_images: activityForm.gallery_images,
          gallery_videos: activityForm.gallery_videos,
        });
      }
      setActivityModalVisible(false);
      setActivityEditing(null);
      setActivityForm({ title: "", description: "", date: "", time: "", location: "", latitude: null, longitude: null, cover_image_url: undefined, image_urls: [], video_url: undefined, max_attendees: undefined, is_private: false, theme: "", password: "", gallery_images: [], gallery_videos: [] });
      Alert.alert(t("common.success") || "Success", t("common.confirm") || "Activity saved successfully");
      loadUserActivities();
    } catch (e) {
      Alert.alert(t("common.error") || "Error", (e as Error)?.message || t("activities.saveFailed") || "Failed to save activity");
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!sessionToken) return;
    Alert.alert(
      t("activities.deleteActivity") || "Delete Activity",
      t("activities.confirmDelete") || "Are you sure you want to delete this activity?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await deleteActivity(sessionToken, activityId);
            loadUserProfile();
          },
        },
      ]
    );
  };

  const handleUpdateProfilePhoto = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const updated = await updateProfileMedia(sessionToken, { profile_photo: uri });
      setProfilePhoto(updated.profile_photo || null);
      refreshUser();
    }
  };

  const handleUpdateCoverPhoto = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const updated = await updateProfileMedia(sessionToken, { cover_photo: uri });
      setCoverPhoto(updated.cover_photo || null);
      refreshUser();
    }
  };

  const handleSaveProfileInfo = async () => {
    if (!sessionToken) return;
    setSavingInfo(true);
    try {
      const updated = await updateProfileInfo(sessionToken, {
        name: displayName || undefined,
        bio: bio || undefined,
        location: location || undefined,
      });
      setDisplayName(updated.name || "");
      setBio(updated.bio || "");
      setLocation(updated.location || "");
      await refreshUser();
      setEditModalVisible(false);
      Alert.alert(t('common.success'), t('profile.profileUpdated'));
    } catch (error) {
      Alert.alert(t('common.error'), t('profile.updateFailed'));
    } finally {
      setSavingInfo(false);
    }
   };

  // -- USER EDIT HANDLERS --
  const openUserEdit = () => {
    setUserEditForm({ 
      name: displayName, 
      bio, 
      location,
      latitude: user?.latitude ?? null,
      longitude: user?.longitude ?? null,
    });
    setUserEditModalVisible(true);
  };

  const handleSaveUserInfo = async () => {
    if (!sessionToken) return;
    
    if (userEditForm.latitude && userEditForm.longitude) {
      console.log("Saving location:", userEditForm.latitude, userEditForm.longitude);
    }
    
    setSavingInfo(true);
    try {
      const updatePayload: { name?: string; bio?: string; location?: string; latitude?: number; longitude?: number } = {
        name: userEditForm.name || undefined,
        bio: userEditForm.bio || undefined,
        location: userEditForm.location || undefined,
      };
      
      if (userEditForm.latitude != null && userEditForm.latitude !== 0) {
        updatePayload.latitude = userEditForm.latitude;
      }
      if (userEditForm.longitude != null && userEditForm.longitude !== 0) {
        updatePayload.longitude = userEditForm.longitude;
      }
      
      console.log("Update payload:", JSON.stringify(updatePayload));
      
      const updated = await updateProfileInfo(sessionToken, updatePayload);
      console.log("Updated user:", updated.latitude, updated.longitude);
      setDisplayName(updated.name || "");
      setBio(updated.bio || "");
      setLocation(updated.location || "");
      await refreshUser();
      setUserEditModalVisible(false);
      Alert.alert(t('common.success'), t('profile.profileUpdated'));
    } catch (error) {
      console.log("Save error:", error);
      Alert.alert(t('common.error'), t('profile.updateFailed'));
    } finally {
      setSavingInfo(false);
    }
  };

  // -- BUSINESS EDIT HANDLERS --
  const openBizEdit = () => {
    if (!businessDetail) return;
    const b = businessDetail.business;
    setBizEditForm({
      name: b.name || "",
      description: b.description || "",
      phone: b.phone || "",
      website: b.website || "",
      email: b.email || "",
      tags: Array.isArray(b.tags) ? b.tags.join(", ") : (b.tags as any) || "",
      address: b.address || "",
      latitude: b.latitude ?? null,
      longitude: b.longitude ?? null,
      opening_hours: businessOpeningHours,
      root_category: b.root_category || "",
      subcategory: b.subcategory || "",
    });
    setBizLogoNew(null);
    setBizCoverNew(null);
    setBizEditModalVisible(true);
  };

  const pickBizImage = async (type: "logo" | "cover") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (type === "logo") setBizLogoNew(uri);
      else setBizCoverNew(uri);
    }
  };

  const handleSaveBusinessInfo = async () => {
    if (!sessionToken || !businessDetail) return;
    setBizSaving(true);
    try {
      const payload: any = {
        name: bizEditForm.name || undefined,
        description: bizEditForm.description || undefined,
        phone: bizEditForm.phone || undefined,
        website: bizEditForm.website || undefined,
        email: bizEditForm.email || undefined,
        tags: bizEditForm.tags ? bizEditForm.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      };
      if (bizEditForm.address) payload.address = bizEditForm.address;
      if (bizEditForm.latitude != null) payload.latitude = bizEditForm.latitude;
      if (bizEditForm.longitude != null) payload.longitude = bizEditForm.longitude;
      if (bizEditForm.opening_hours) payload.opening_hours = bizEditForm.opening_hours;
      if (bizEditForm.root_category) payload.root_category = bizEditForm.root_category;
      if (bizEditForm.subcategory) payload.subcategory = bizEditForm.subcategory;
      if (bizLogoNew) payload.logo_image = bizLogoNew;
      if (bizCoverNew) payload.cover_image = bizCoverNew;
      await updateBusiness(sessionToken, businessDetail.business.business_id, payload);
      await loadBusinessFullData(businessDetail.business.business_id);
      setBizEditModalVisible(false);
      Alert.alert(t('common.success'), t('profile.profileUpdated'));
    } catch (error) {
      Alert.alert(t('common.error'), t('profile.updateFailed'));
    } finally {
      setBizSaving(false);
    }
  };

  const handleUpdateBusinessSlug = async (newSlug: string) => {
    if (!sessionToken || !businessDetail) return;
    try {
      await updateBusinessSlug(sessionToken, businessDetail.business.business_id, newSlug);
      if (sessionToken) {
        const detail = await getBusinessDetail(sessionToken, businessDetail.business.business_id);
        setBusinessDetail(detail);
      }
    } catch (e) {
      Alert.alert(t('common.error'), 'Failed to update slug');
    }
  };

const handleUpdateSlug = async (newSlug: string) => {
    if (!sessionToken || !user) return;
    try {
      await updateUserSlug(sessionToken, user.user_id, newSlug);
      setSlug(newSlug);
    } catch (e) {
      Alert.alert(t('common.error'), 'Failed to update slug');
    }
  };

    const handleLogout = useCallback(async () => {
      Alert.alert(
        t('profile.logout'),
        t('common.confirm') + '?',
        [
          {
            text: t('common.cancel'),
            onPress: () => {},
            style: 'cancel'
          },
          {
            text: t('profile.logout'),
            onPress: async () => {
              try {
                await clearMapBounds();
                await logout();
              } catch (error) {
                Alert.alert(t('common.error'), 'Failed to logout');
              }
            },
            style: 'destructive'
          }
        ]
      );
    }, [logout, clearMapBounds, t]);

   const handleAddPhoto = async () => {
    if (!sessionToken) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t("common.permissionDenied", "Permission Denied"), t("profile.galleryAccessRequired", "Gallery access required"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setShowUploadProgress(true);
        setUploadContext('gallery');
        setUploadProgress({ phase: "uploading", progress: 30 });
        let uploadedUrl = "";
        if (result.assets[0].base64) {
          uploadedUrl = await uploadImageToCloudinary(sessionToken, `data:image/jpeg;base64,${result.assets[0].base64}`);
        } else {
          uploadedUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image");
        }
        if (uploadedUrl) {
          const updated = await updateProfileGallery(sessionToken, { images: [uploadedUrl] });
          setGalleryImages(updated.gallery_images || []);
          setGalleryItems(updated.gallery_items || []);
          setShowUploadProgress(false);
          setUploadProgress(null);
          refreshUser();
        }
      }
    } catch (e: any) {
      setShowUploadProgress(false);
      setUploadProgress(null);
      Alert.alert(t("common.error", "Error"), e.message);
    }
  };

  const handleAddVideo = async () => {
    if (!sessionToken) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t("common.permissionDenied", "Permission Denied"), t("profile.galleryAccessRequired", "Gallery access required"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setShowUploadProgress(true);
        setUploadContext('gallery');
        setUploadProgress({ phase: "preparing", progress: 0 });
        const contentRef = user ? `gallery:user:${user.user_id}` : "video";
        const muxResult = await uploadVideoMux(sessionToken, result.assets[0].uri, contentRef, (progress) => {
          setUploadProgress(progress);
        });
        const uploadedUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : "");
        if (uploadedUrl) {
          setUploadProgress({ phase: "processing", progress: 90 });
          const updated = await updateProfileGallery(sessionToken, { videos: [uploadedUrl] });
          setGalleryVideos(updated.gallery_videos || []);
          setVideoItems(updated.video_items || []);
          setShowUploadProgress(false);
          setUploadProgress(null);
          refreshUser();
        } else {
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(t("common.error", "Error"), "Video upload failed: no playback URL received. Please try again.");
        }
      }
    } catch (e: any) {
      setShowUploadProgress(false);
      setUploadProgress(null);
      Alert.alert(t("common.error", "Error"), e.message);
    }
  };

  const handleDeleteGalleryItem = async (type: "image" | "video", index: number) => {
    if (!sessionToken) return;
    Alert.alert(t("profile.deleteItem"), t("profile.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          if (type === "image") {
            const updated = await updateProfileGallery(sessionToken, { remove_images: [galleryImages[index]] });
            setGalleryImages(updated.gallery_images || []);
            setGalleryItems(updated.gallery_items || []);
          } else {
            const updated = await updateProfileGallery(sessionToken, { remove_videos: [galleryVideos[index]] });
            setGalleryVideos(updated.gallery_videos || []);
            setVideoItems(updated.video_items || []);
          }
          refreshUser();
        }
      }
    ]);
  };


  // ---------------------------------------------------------------------------
  // 3. BUSINESS VIEW STATE & HANDLERS
  // ---------------------------------------------------------------------------
  const [businessDetail, setBusinessDetail] = useState<BusinessDetail | null>(null);
  const [bizEvents, setBizEvents] = useState<EventItem[]>([]);
  const [bizPosts, setBizPosts] = useState<Post[]>([]);
  const [bizJobs, setBizJobs] = useState<Job[]>([]);
  const [bizAnalytics, setBizAnalytics] = useState<any>(null);

  // Business editing state
  const [hoursModalVisible, setHoursModalVisible] = useState(false);
  const [socialLinksModalVisible, setSocialLinksModalVisible] = useState(false);
  const [businessOpeningHours, setBusinessOpeningHours] = useState<Record<string, { enabled: boolean; periods: { open: string; close: string }[] }>>({});
  const [businessSocialLinks, setBusinessSocialLinks] = useState<Record<string, string>>({});
  const [bizGalleryImages, setBizGalleryImages] = useState<string[]>([]);
  const [bizGalleryVideos, setBizGalleryVideos] = useState<string[]>([]);

  // Shared generic media for unified components
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [postVideo, setPostVideo] = useState<string | null>(null);
  const [postVideoPreview, setPostVideoPreview] = useState<string | null>(null);

  const loadBusinessFullData = async (bizId: string) => {
    if (!sessionToken) return;
    try {
      const data = await getBusinessDetail(sessionToken, bizId);
      setBusinessDetail(data);
      setBizEvents(data.events || []);
      setBizPosts(data.posts || []);
      setBizJobs(data.jobs || []);
      // Load business editing state
      setBusinessOpeningHours(data.business.opening_hours || {} as any);
      setBusinessSocialLinks(data.business.social_links || {});
      setBizGalleryImages(data.business.gallery_images || []);
      setBizGalleryVideos(data.business.gallery_videos || []);
    } catch (e) {
    }
  };

  useEffect(() => {
    if (activeIdentity?.type === "business") {
      loadBusinessFullData(activeIdentity.id);
    }
  }, [activeIdentity, sessionToken]);

  const loadBusinessProfile = () => {
    if (activeIdentity?.type === "business") loadBusinessFullData(activeIdentity.id);
  };

  // Business hours handlers
  const handleSaveBusinessHours = async () => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    try {
      await updateBusiness(sessionToken, activeIdentity.id, { opening_hours: businessOpeningHours as any });
      setHoursModalVisible(false);
      Alert.alert(t("common.success", "Success"), t("common.savedSuccessfully") || "Saved successfully");
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("business.failedSaveHours", "Failed to save hours"));
    }
  };

  // Business social links handlers
  const handleSaveBusinessSocialLinks = async () => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    try {
      await updateBusiness(sessionToken, activeIdentity.id, { social_links: businessSocialLinks });
      setSocialLinksModalVisible(false);
      Alert.alert(t("common.success", "Success"), t("common.savedSuccessfully") || "Saved successfully");
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("business.failedSaveSocialLinks", "Failed to save social links"));
    }
  };

  // Business gallery handlers
  const handleAddBusinessGalleryPhoto = async () => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "uploading", progress: 30 });
        const imageUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image", (progress) => {
          setUploadProgress({ phase: "uploading", progress: 30 + progress.progress * 0.6 });
        });
        setUploadProgress({ phase: "processing", progress: 95 });
        await updateBusinessGallery(sessionToken, activeIdentity.id, { images: [imageUrl] });
        setBizGalleryImages(prev => [...prev, imageUrl]);
        setShowUploadProgress(false);
        setUploadProgress(null);
      } catch (e) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("common.error", "Error"), t("business.failedUploadImage", "Failed to upload image"));
      }
    }
  };

  const handleAddBusinessGalleryVideo = async () => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "preparing", progress: 0 });
        const contentRef = `gallery:business:${activeIdentity.id}`;
        const muxResult = await uploadVideoMux(sessionToken, result.assets[0].uri, contentRef, (progress) => {
          setUploadProgress(progress);
        });
        const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : "");
        if (!videoUrl) {
          throw new Error("Video upload failed: no playback URL received. Please try again.");
        }
        setUploadProgress({ phase: "processing", progress: 90 });
        await updateBusinessGallery(sessionToken, activeIdentity.id, { videos: [videoUrl] });
        setBizGalleryVideos(prev => [...prev, videoUrl]);
        setShowUploadProgress(false);
        setUploadProgress(null);
      } catch (e) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("common.error", "Error"), t("business.failedUploadVideo", "Failed to upload video"));
      }
    }
  };

  const handleDeleteBusinessGalleryImage = async (index: number) => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    const imageToRemove = bizGalleryImages[index];
    try {
      await updateBusinessGallery(sessionToken, activeIdentity.id, { remove_images: [imageToRemove] });
      setBizGalleryImages(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("business.failedDeleteImage", "Failed to delete image"));
    }
  };

  const handleDeleteBusinessGalleryVideo = async (index: number) => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    const videoToRemove = bizGalleryVideos[index];
    try {
      await updateBusinessGallery(sessionToken, activeIdentity.id, { remove_videos: [videoToRemove] });
      setBizGalleryVideos(prev => prev.filter((_, i) => i !== index));
    } catch (e) {
      Alert.alert(t("common.error", "Error"), t("business.failedDeleteVideo", "Failed to delete video"));
    }
  };

  const handleUpdateBusinessLogo = async () => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "uploading", progress: 30 });
        const imageUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image", (progress) => {
          setUploadProgress({ phase: "uploading", progress: 30 + progress.progress * 0.6 });
        });
        setUploadProgress({ phase: "processing", progress: 95 });
        await updateBusiness(sessionToken, activeIdentity.id, { logo_image: imageUrl });
        await loadBusinessFullData(activeIdentity.id);
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("common.success", "Success"), t("business.logoUpdated", "Logo updated successfully"));
      } catch (e) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("common.error", "Error"), t("business.failedUpdateLogo", "Failed to update logo"));
      }
    }
  };

  const handleUpdateBusinessCover = async () => {
    if (!sessionToken || !activeIdentity || activeIdentity.type !== "business") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      try {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "uploading", progress: 30 });
        const imageUrl = await uploadMedia(sessionToken, result.assets[0].uri, "image", (progress) => {
          setUploadProgress({ phase: "uploading", progress: 30 + progress.progress * 0.6 });
        });
        setUploadProgress({ phase: "processing", progress: 95 });
        await updateBusiness(sessionToken, activeIdentity.id, { cover_image: imageUrl });
        await loadBusinessFullData(activeIdentity.id);
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("common.success", "Success"), t("business.coverUpdated", "Cover image updated successfully"));
      } catch (e) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        Alert.alert(t("common.error", "Error"), t("business.failedUpdateCover", "Failed to update cover image"));
      }
    }
  };

  const handleCreatePost = async (eventOrText?: any) => {
    if (!sessionToken) return;
     
     // Determine actor identity - use activeIdentity or fallback to user
     let actorIdentity = activeIdentity;
     if (!actorIdentity && user) {
       actorIdentity = {
         type: "user",
         id: user.user_id,
         name: user.name,
         avatar: user.profile_photo || user.picture || null,
       };
      }
      
      if (!actorIdentity) {
       Alert.alert(t("common.error", "Error"), t("profile.identityError", "Unable to determine profile identity"));
       return;
     }
     
      const text = typeof eventOrText === 'string' ? eventOrText : postText;
     if (!text.trim() && !postImage && !postVideo) {
          Alert.alert(t("common.error", "Error"), t("profile.emptyPost", "Please add some content or media to post"));
         return;
     }

try {
        // Only show upload progress if there's actual media to upload
        const hasMedia = !!postImage || !!postVideo;
        
        if (hasMedia) {
          setShowUploadProgress(true);
          setUploadContext(postVideo ? 'video' : 'post');
          setUploadProgress({ phase: "preparing", progress: 0 });
        }
   
         let uploadedImageUrl = undefined;
         let uploadedVideoUrl = undefined;
         let muxUploadId = undefined;
    
          if (postImage) {
            if (hasMedia) setUploadProgress({ phase: "uploading", progress: 30 });
            uploadedImageUrl = await uploadImageToCloudinary(sessionToken, postImage);
          }
if (postVideo) {
             setUploadContext('video');
             if (hasMedia) setUploadProgress({ phase: "uploading", progress: 60 });
             const muxResult = await uploadVideoMux(sessionToken, postVideo, undefined, (progress) => {
               setUploadProgress(progress);
             });
             uploadedVideoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : "");
             muxUploadId = muxResult.mux_upload_id;
           }
   
        if (hasMedia) setUploadProgress({ phase: "processing", progress: 90 });
 
        // Build tagging payload from inline @ mentions
        const tagUserArray = pendingMentionIds.filter(id => 
          allMentionables.find(m => m.id === id && m.type === 'user')
        );
        const tagBusinessArray = pendingMentionIds.filter(id => 
          allMentionables.find(m => m.id === id && m.type === 'business')
        );
        const firstBusinessId = tagBusinessArray.length > 0 ? tagBusinessArray[0] : null;

        const newPost = await createPost(
            sessionToken,
            text,
            null, // image_base64
            null, // video_base64
            null, // business_id
            { type: actorIdentity.type, id: actorIdentity.id }, // actor
            null, // media_ratio
            tagUserArray, // tagged_user_ids
            firstBusinessId, // tagged_business_id (MVP: first selection)
            uploadedImageUrl, // image_url
            uploadedVideoUrl,  // video_url
            null,              // youtube_link
            null,              // soundcloud_url
            muxUploadId        // mux_upload_id
          );

        if (actorIdentity.type === 'business') {
          setBizPosts([newPost, ...bizPosts]);
        } else if (actorIdentity.type === 'user') {
          setUserPosts([newPost, ...userPosts]);
        }
 
setPostText("");
        setPostImage(null);
         setPostVideo(null);
         setPostVideoPreview(null);
         if (hasMedia) {
           setShowUploadProgress(false);
           setUploadProgress(null);
         }
         setPendingMentionIds([]);

        // SYNC TO GALLERY - Add media to gallery
        if (actorIdentity.type === 'business') {
          if (uploadedImageUrl) {
            try {
              await updateBusinessGallery(sessionToken, actorIdentity.id, { images: [uploadedImageUrl] });
            } catch (e) {
              console.log("Failed to add image to business gallery:", e);
            }
          }
          if (uploadedVideoUrl) {
            try {
              await updateBusinessGallery(sessionToken, actorIdentity.id, { videos: [uploadedVideoUrl] });
            } catch (e) {
              console.log("Failed to add video to business gallery:", e);
            }
          }
        } else {
          if (uploadedImageUrl) {
            try {
              await updateProfileGallery(sessionToken, { images: [uploadedImageUrl] });
            } catch (e) {
              console.log("Failed to add image to user gallery:", e);
            }
          }
          if (uploadedVideoUrl) {
            try {
              await updateProfileGallery(sessionToken, { videos: [uploadedVideoUrl] });
            } catch (e) {
              console.log("Failed to add video to user gallery:", e);
            }
          }
        }

        // Refresh to get updated gallery
        if (actorIdentity.type === 'business') {
          loadBusinessProfile();
        } else {
          loadUserProfile();
        }

        Alert.alert(t("common.success", "Success"), t("profile.postCreated", "Post created successfully!"));
        setTagUserDraft("");
        setTagBusinessDraft("");
      } catch (error) {
        setShowUploadProgress(false);
        setUploadProgress(null);
        console.error("Failed to create post:", error);
         Alert.alert(t("common.error", "Error"), t("profile.failedCreatePost", "Failed to create post. Please try again."));
      }
   }

  // ---------------------------------------------------------------------------
  // POST DELETE HANDLER - Also removes media from gallery
  // ---------------------------------------------------------------------------
  const handleDeletePost = async (post: Post) => {
    if (!sessionToken) return;

    try {
      // Remove media from gallery first - based on post's actor_type
      const isBusinessPost = post.actor_type === 'business';
      const targetId = isBusinessPost ? post.actor_id : user?.user_id;

      if (isBusinessPost && post.actor_id) {
        if (post.image_url) {
          try {
            await updateBusinessGallery(sessionToken, post.actor_id, { remove_images: [post.image_url] });
          } catch (e) {
            console.log("Failed to remove image from business gallery:", e);
          }
        }
        if (post.video_url) {
          try {
            await updateBusinessGallery(sessionToken, post.actor_id, { remove_videos: [post.video_url] });
          } catch (e) {
            console.log("Failed to remove video from business gallery:", e);
          }
        }
      } else {
        if (post.image_url) {
          try {
            await updateProfileGallery(sessionToken, { remove_images: [post.image_url] });
          } catch (e) {
            console.log("Failed to remove image from user gallery:", e);
          }
        }
        if (post.video_url) {
          try {
            await updateProfileGallery(sessionToken, { remove_videos: [post.video_url] });
          } catch (e) {
            console.log("Failed to remove video from user gallery:", e);
          }
        }
      }

      // Delete the post
      await deletePost(sessionToken, post.post_id);

      // Update local state
      if (activeIdentity?.type === 'business') {
        setBizPosts(bizPosts.filter(p => p.post_id !== post.post_id));
        loadBusinessProfile();
      } else {
        setUserPosts(userPosts.filter(p => p.post_id !== post.post_id));
        loadUserProfile();
      }
    } catch (error) {
      console.error("Failed to delete post:", error);
       Alert.alert(t("common.error", "Error"), t("profile.failedDeletePost", "Failed to delete post. Please try again."));
    }
  };

  // ---------------------------------------------------------------------------
  // POST EDIT HANDLER - Updates text (media changes require backend support)
  // ---------------------------------------------------------------------------
  const handleEditPost = async (updatedPost: Post) => {
    if (!sessionToken) return;

    try {
      // Update post text only (backend doesn't support updating media URLs directly)
      await updatePost(
        sessionToken,
        updatedPost.post_id,
        { text: updatedPost.text || null }
      );

      // Update local state
      if (activeIdentity?.type === 'business') {
        setBizPosts(bizPosts.map(p => p.post_id === updatedPost.post_id ? updatedPost : p));
        loadBusinessProfile();
      } else {
        setUserPosts(userPosts.map(p => p.post_id === updatedPost.post_id ? updatedPost : p));
        loadUserProfile();
      }
    } catch (error) {
      console.error("Failed to edit post:", error);
       Alert.alert(t("common.error", "Error"), t("profile.failedEditPost", "Failed to edit post. Please try again."));
    }
  };


  // ---------------------------------------------------------------------------
  // DELETE HANDLERS
  // ---------------------------------------------------------------------------
  const doDeleteBusiness = (businessId: string) => {
    Alert.alert(t('profile.deleteBusiness'), t('profile.deleteBusinessConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
           if (!sessionToken) return;
           await deleteBusiness(sessionToken, businessId);
           setBusinesses(businesses.filter(b => b.business_id !== businessId));
           setActiveIdentity(identities.find(i => i.type === 'user') || identities[0]);
           refreshUser();
        }
      }
    ]);
  }

  const doDeleteUserAccount = () => {
    Alert.alert(t('profile.deleteAccount'), t('profile.deleteAccountConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
           if (!sessionToken) return;
           await deleteUserAccount(sessionToken);
           logout();
        }
      }
    ]);
  }


  const handleCreateNewBusiness = async () => {
    if (!sessionToken || !user || !pickerRoot || !pickerSub) return;
    try {
      const latitude = user.latitude || 0;
      const longitude = user.longitude || 0;
      const created = await createBusiness(sessionToken, {
        name: user.name + " Business",
        description: "",
        address: user.location || "Not set",
        latitude,
        longitude,
        root_category: pickerRoot,
        subcategory: pickerSub,
      });
      setBusinesses(prev => [...prev, created]);
      setActiveIdentity({ type: "business", id: created.business_id, name: created.name, avatar: created.logo_image });
      setShowCategoryPicker(false);
      setPickerRoot("");
      setPickerSub("");
      refreshUser();
    } catch (e: any) {
      Alert.alert(t("common.error", "Error"), e.message || t("business.failedCreate", "Failed to create business profile"));
    }
  };

  const identityPicker = (
    <IdentityDropdown
      businesses={businesses}
      onSelectIdentity={(type, id, name, avatar) => setActiveIdentity({ type, id, name, avatar })}
      onCreateBusiness={() => { setPickerRoot(""); setPickerSub(""); setShowCategoryPicker(true); }}
    />
  );

  const openTagModal = () => {
    // Insert @ for inline tagging
    setPostText(postText + "@");
    setShowMentionSuggestions(true);
    setMentionQuery("");
    setMentionCursorPosition(postText.length + 1);
  };

  const editTagModal = (userIds: string[], businessIds: string[]) => {
    setTagUserDraft(userIds.join(", "));
    setTagBusinessDraft(businessIds.join(", "));
    setTagModalVisible(true);
  };

  const userChips = tagUserDraft ? tagUserDraft.split(',').map((s) => s.trim()).filter((s) => s) : [];
  const bizChips = tagBusinessDraft ? tagBusinessDraft.split(',').map((s) => s.trim()).filter((s) => s) : [];
  const totalTags = userChips.length + bizChips.length;
  const tagLimit = 5;

  const getFriendName = (id: string) => friends.find(f => f.user_id === id)?.name || friends.find(f => f.user_id === id)?.user_id || id;
  const getBizName = (id: string) => businesses.find(b => b.business_id === id)?.name || id;

  // Inline @ mention autocomplete - combine friends and ALL map businesses for dropdown
  const allMentionables = useMemo(() => {
    const friendItems = friends.map(f => ({ id: f.user_id, name: f.name || f.user_id, type: 'user' as const, avatar: f.profile_photo || f.picture }));
    const bizItems = allMapBusinesses.map(b => ({ id: b.business_id, name: b.name, type: 'business' as const, avatar: b.logo_image }));
    return [...friendItems, ...bizItems];
  }, [friends, allMapBusinesses]);

  const filteredSuggestions = useMemo(() => {
    if (!mentionQuery) return allMentionables.slice(0, 10);
    const search = mentionQuery.toLowerCase();
    return allMentionables.filter(item => 
      (item.name || "").toLowerCase().includes(search)
    ).slice(0, 10);
  }, [allMentionables, mentionQuery]);

  const handleTextChange = (text: string) => {
    setPostText(text);
    // Detect @ mentions
    const atIndex = text.lastIndexOf('@');
    if (atIndex >= 0) {
      // Check if @ is at start or preceded by space
      const prevChar = text[atIndex - 1];
      if (atIndex === 0 || prevChar === ' ' || prevChar === '\n') {
        // Extract query after @
        const query = text.slice(atIndex + 1);
        // Only show if query doesn't contain spaces (still typing name)
        if (!query.includes(' ') && !query.includes('\n')) {
          setMentionQuery(query);
          setMentionCursorPosition(atIndex);
          setShowMentionSuggestions(true);
          return;
        }
      }
    }
    setShowMentionSuggestions(false);
    setMentionQuery("");
  };

  const selectMention = (item: { id: string; name: string; type: 'user' | 'business' }) => {
    // Build new text with @id replaced by @name format
    const text = postText;
    const before = text.slice(0, mentionCursorPosition);
    const after = text.slice(mentionCursorPosition + mentionQuery.length + 1); // +1 to include the @
    const newText = `${before}@${item.name}${after}`;
    setPostText(newText);
    setShowMentionSuggestions(false);
    setMentionQuery("");
    // Track tagged IDs
    setPendingMentionIds(prev => [...prev.filter(id => id !== item.id), item.id]);
  };

  const closeTagModal = () => {
    // Deduplicate: keep only unique IDs, removing any that appear in both lists
    const uniqueUserChips = userChips.filter(id => !bizChips.includes(id));
    const uniqueBizChips = bizChips.filter(id => !userChips.includes(id));
    setTagUserDraft(uniqueUserChips.join(", "));
    setTagBusinessDraft(uniqueBizChips.join(", "));
    setTagModalVisible(false);
  };

  const clearTagDraft = () => {
    setTagUserDraft("");
    setTagBusinessDraft("");
    setTagModalVisible(false);
  };

  const TagModal = () => {
    if (!tagModalVisible) return null;
    return (
      <View style={styles.tagHelperBanner}>
        <Text style={styles.tagHelperText}>
          💡 Type @ in the text box to tag friends & businesses
        </Text>
        <Pressable onPress={() => setTagModalVisible(false)}>
          <Ionicons name="close" size={16} color="#6b7280" />
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={{ flex: 1 }}>
        {!user && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.backgroundPage }}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}
        {activeIdentity?.type === 'user' && user !== null && (
        <UserProfilePremium
          user={user as User}
          friends={friends}
          galleryImages={galleryImages}
          galleryVideos={galleryVideos}
          galleryItems={galleryItems}
          displayName={displayName}
          bio={bio}
          location={location}
          setDisplayName={setDisplayName}
          setBio={setBio}
          setLocation={setLocation}
          sessionToken={sessionToken || ""}
          themeModalVisible={themeModalVisible}
          setThemeModalVisible={setThemeModalVisible}
          identityPicker={identityPicker}
            setInviteModalVisible={setInviteModalVisible}
            savingInfo={savingInfo}
            handleSaveProfileInfo={handleSaveProfileInfo}
            handleAddPhoto={handleAddPhoto}
            handleAddVideo={handleAddVideo}
             openCaptionEdit={() => {}}
             getCaptionForUrl={() => ""}
          refreshUser={refreshUser}
            handleUpdateProfileGallery={() => {}}
            handleDeleteGalleryItem={handleDeleteGalleryItem}
              handleUpdateProfilePhoto={handleUpdateProfilePhoto}
              handleUpdateCoverPhoto={handleUpdateCoverPhoto}
              languageModalVisible={languageModalVisible}
              setLanguageModalVisible={setLanguageModalVisible}
              handleLogout={handleLogout}
                refreshing={refreshing}
               onEditProfile={openUserEdit}
                 userPosts={userPosts}
                 userActivities={userActivities}
                 openActivityModal={(activity) => {
                   setActivityEditing(activity || null);
                   setActivityModalVisible(true);
                 }}
                 handleEditActivity={(activity) => {
                   setActivityEditing(activity);
                   setActivityModalVisible(true);
                 }}
                 handleDeleteActivity={handleDeleteActivity}
postText={postText}
                 setPostText={handleTextChange}
                 postImage={postImage}
                 postVideo={postVideo}
                 postVideoPreview={postVideoPreview}
                 pickPostImage={handlePickPostImage}
                 pickPostVideo={handlePickPostVideo}
                 onDiscardMedia={() => { setPostImage(null); setPostVideo(null); setPostVideoPreview(null); }}
handleCreatePost={handleCreatePost}
                  onDeletePost={handleDeletePost}
                  onEditPost={handleEditPost}
                  onRefreshPosts={loadUserProfile}
                  currentUserId={user?.user_id}
                   isOwnProfile={Boolean(activeIdentity?.type === 'user')}
                   businesses={businesses}
                   avatarUri={user?.profile_photo || user?.picture || null}
                 showMentionSuggestions={showMentionSuggestions}
                 mentionSuggestions={filteredSuggestions}
                 onSelectMention={selectMention}
                 pendingMentionIds={pendingMentionIds}
                  onOpenTagModal={TAGGING_ENABLED ? openTagModal : undefined}
                  onEditTags={TAGGING_ENABLED ? editTagModal : undefined}
                  onCreateStory={() => router.push("/camera")}
               />
             )}

        {activeIdentity?.type === 'business' && businessDetail && (
           <BusinessProfilePremium
              business={businessDetail}
              sessionToken={sessionToken || ""}
              refreshing={refreshing}
              onRefresh={onRefresh}
              categoryTree={categoryTree}
              events={bizEvents}
              openCategoryModal={() => {}}
              openEventModal={(event) => {
                setEventEditing(event || null);
                setEventModalVisible(true);
              }}
              handleEditEvent={(event) => {
                setEventEditing(event);
                setEventModalVisible(true);
              }}
              handleDeleteEvent={(eventId) => {
                Alert.alert(
                  t("events.deleteEvent") || "Delete Event",
                  t("events.confirmDelete") || "Are you sure you want to delete this event?",
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    {
                      text: t("common.delete"),
                      style: "destructive",
                      onPress: async () => {
                        if (!sessionToken) return;
                        await deleteEvent(sessionToken, eventId);
                        loadBusinessProfile();
                      },
                    },
                  ]
                );
              }}
postText={postText}
               setPostText={handleTextChange}
               postImage={postImage}
               postVideo={postVideo}
               postVideoPreview={postVideoPreview}
                pickPostImage={handlePickPostImage}
                pickPostVideo={handlePickPostVideo}
                onDiscardMedia={() => { setPostImage(null); setPostVideo(null); setPostVideoPreview(null); }}
               handleCreatePost={handleCreatePost}
                showMentionSuggestions={showMentionSuggestions}
                mentionSuggestions={filteredSuggestions}
                onSelectMention={selectMention}
                pendingMentionIds={pendingMentionIds}
                jobs={bizJobs}
               openJobModal={() => setJobModalVisible(true)}
               handleDeleteJob={(jobId) => {
                 Alert.alert(
                   t("jobs.deleteJob") || "Delete Job",
                   t("jobs.confirmDelete") || "Are you sure you want to delete this job?",
                   [
                     { text: t("common.cancel"), style: "cancel" },
                     {
                       text: t("common.delete"),
                       style: "destructive",
                       onPress: async () => {
                         if (!sessionToken) return;
                         await deleteJob(sessionToken, jobId);
                         loadBusinessProfile();
                       },
                     },
                   ]
                 );
               }}
               rentals={businessDetail?.rentals || []}
               openRentalModal={() => setRentalModalVisible(true)}
               handleDeleteRental={(rentalId) => {
                 Alert.alert(
                   t("rentals.deleteRental") || "Delete Rental",
                   t("rentals.confirmDelete") || "Are you sure you want to delete this rental?",
                   [
                     { text: t("common.cancel"), style: "cancel" },
                     {
                       text: t("common.delete"),
                       style: "destructive",
                       onPress: async () => {
                         if (!sessionToken) return;
                         await deleteRental(sessionToken, rentalId);
                         loadBusinessProfile();
                       },
                     },
                   ]
                 );
               }}
              slug={(businessDetail as any)?.business?.slug || ''}
              onUpdateSlug={handleUpdateBusinessSlug}
              fanGalleryPosts={[]}
              handleHideFanPost={() => {}}
              openingHours={businessOpeningHours}
              openHoursModal={undefined}
              openLocationModal={undefined}
              socialLinks={businessSocialLinks}
              openSocialLinksModal={() => setSocialLinksModalVisible(true)}
              galleryImages={bizGalleryImages}
              galleryVideos={bizGalleryVideos}
              handleAddGalleryPhoto={handleAddBusinessGalleryPhoto}
              handleAddGalleryVideo={handleAddBusinessGalleryVideo}
              handleDeleteGalleryImage={handleDeleteBusinessGalleryImage}
              handleDeleteGalleryVideo={handleDeleteBusinessGalleryVideo}
               openMediaViewer={() => {}}
               onUpdateLogo={handleUpdateBusinessLogo}
               onUpdateCover={handleUpdateBusinessCover}
               analytics={bizAnalytics}
               analyticsLoading={false}
               loadAnalytics={() => {}}
               themeModalVisible={themeModalVisible}
               setThemeModalVisible={setThemeModalVisible}
               onEditProfile={openBizEdit}
               businessPosts={bizPosts}
onDeletePost={handleDeletePost}
                 onEditPost={handleEditPost}
                 onRefreshPosts={loadBusinessProfile}
currentUserId={businessDetail?.business?.business_id}
                isOwnProfile={activeIdentity?.type === 'business'}
                 identityPicker={identityPicker}
                 onOpenTagModal={TAGGING_ENABLED ? openTagModal : undefined}
                 onEditTags={TAGGING_ENABLED ? editTagModal : undefined}
                 onCreateStory={() => router.push("/camera")}
               />
            )}
      </View>
      <UploadProgressSheet visible={showUploadProgress} progress={uploadProgress} context={uploadContext} mode="inline" onDismiss={() => { setShowUploadProgress(false); setUploadProgress(null); }} />
      <Modal visible={themedAlertVisible} transparent animationType="fade">
        <View style={styles.themedAlertOverlay}>
          <View style={styles.themedAlertContainer}>
            <Text style={styles.themedAlertMessage}>{themedAlertMessage}</Text>
            <Pressable style={styles.themedAlertButton} onPress={() => setThemedAlertVisible(false)}>
              <Text style={styles.themedAlertButtonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ThemeCustomizer
        visible={themeModalVisible}
        onClose={() => setThemeModalVisible(false)}
        sessionToken={sessionToken || ""}
        currentTheme={activeIdentity?.type === 'business' ? businessDetail?.business?.theme : user?.theme}
        onThemeUpdated={onRefresh}
        saveThemeOverride={async (theme) => {
          if (!sessionToken) return;
          if (activeIdentity?.type === 'business' && activeIdentity.id) {
            await updateBusinessTheme(sessionToken, activeIdentity.id, theme);
          } else {
            await updateProfileTheme(sessionToken, theme);
          }
         }}
       />
       <LanguagePicker
          visible={languageModalVisible}
          onClose={() => setLanguageModalVisible(false)}
        />
        <OpeningHoursModal
          visible={hoursModalVisible}
          onClose={() => setHoursModalVisible(false)}
          openingHours={businessOpeningHours}
          onHoursChange={setBusinessOpeningHours}
          onSave={handleSaveBusinessHours}
        />
        <SocialLinksModal
          visible={socialLinksModalVisible}
          onClose={() => setSocialLinksModalVisible(false)}
          socials={businessSocialLinks}
          onSocialsChange={setBusinessSocialLinks}
          youtubeUrl=""
          onYoutubeUrlChange={() => {}}
          onSave={handleSaveBusinessSocialLinks}
        />
        <EventModal
          visible={eventModalVisible}
          onClose={() => { setEventModalVisible(false); setEventEditing(null); }}
          eventForm={eventForm}
          onFormChange={setEventForm}
          eventEditing={eventEditing}
          eventThemes={eventThemes}
          eventDate={eventDate}
          eventTime={eventTime}
          showEventDatePicker={showEventDatePicker}
          showEventTimePicker={showEventTimePicker}
          showThemePicker={showThemePicker}
          onShowDatePicker={setShowEventDatePicker}
          onShowTimePicker={setShowEventTimePicker}
          onShowThemePicker={setShowThemePicker}
          onDateChange={(_, date) => { if (date) { setEventDate(date); setShowEventDatePicker(false); } }}
          onTimeChange={(_, time) => { if (time) { setEventTime(time); setShowEventTimePicker(false); } }}
          onSave={handleSaveEvent}
          sessionToken={sessionToken || undefined}
          nearLat={businessDetail?.business.latitude ?? user?.latitude ?? undefined}
          nearLng={businessDetail?.business.longitude ?? user?.longitude ?? undefined}
        />
        <ActivityModal
          visible={activityModalVisible}
          onClose={() => { setActivityModalVisible(false); setActivityEditing(null); }}
          activityForm={activityForm}
          onFormChange={setActivityForm}
          activityEditing={activityEditing}
          activityDate={activityDate}
          activityTime={activityTime}
          showActivityDatePicker={showActivityDatePicker}
          showActivityTimePicker={showActivityTimePicker}
          onShowDatePicker={setShowActivityDatePicker}
          onShowTimePicker={setShowActivityTimePicker}
          onDateChange={(_, date) => { if (date) { setActivityDate(date); setShowActivityDatePicker(false); const pad = (n: number) => n.toString().padStart(2, "0"); setActivityForm(prev => ({ ...prev, date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` })); } }}
          onTimeChange={(_, time) => { if (time) { setActivityTime(time); setShowActivityTimePicker(false); const hours = time.getHours().toString().padStart(2, "0"); const mins = time.getMinutes().toString().padStart(2, "0"); setActivityForm(prev => ({ ...prev, time: `${hours}:${mins}` })); } }}
          onSave={handleSaveActivity}
          sessionToken={sessionToken || undefined}
          nearLat={businessDetail?.business.latitude ?? user?.latitude ?? undefined}
          nearLng={businessDetail?.business.longitude ?? user?.longitude ?? undefined}
        />
        <JobModal
          visible={jobModalVisible}
          onClose={() => { setJobModalVisible(false); setJobForm({ title: "", description: "", cover_image: "", job_type: "", requirements: "", salary_range: "", work_location: "", expires_at: "" }); }}
          jobForm={jobForm}
          onFormChange={setJobForm}
          onSave={async () => {
            if (!sessionToken || !jobForm.title.trim()) return;
            setJobSaving(true);
            try {
              const businessId = activeIdentity?.id;
              await createJob(sessionToken, {
                title: jobForm.title,
                description: jobForm.description,
                cover_image: jobForm.cover_image || undefined,
                root_category: businessDetail?.business.root_category || "other",
                subcategory: businessDetail?.business.subcategory || "",
                job_type: jobForm.job_type || undefined,
                requirements: jobForm.requirements || undefined,
                salary_range: jobForm.salary_range || undefined,
                work_location: jobForm.work_location || undefined,
                expires_at: jobForm.expires_at || undefined,
              });
              setJobModalVisible(false);
              setJobForm({ title: "", description: "", cover_image: "", job_type: "", requirements: "", salary_range: "", work_location: "", expires_at: "" });
              loadBusinessProfile();
            } catch (error) {
              console.error("Failed to create job:", error);
            }
            setJobSaving(false);
          }}
          isSaving={jobSaving}
          nearLat={businessDetail?.business.latitude ?? user?.latitude ?? undefined}
          nearLng={businessDetail?.business.longitude ?? user?.longitude ?? undefined}
          businessAddress={businessDetail?.business.address ?? undefined}
        />
        <RentalModal
          visible={rentalModalVisible}
          onClose={() => { setRentalModalVisible(false); setRentalForm({ title: "", description: "", cover_image: "", rent_price: "", rooms_size: "", address: "", latitude: null, longitude: null, available_from: "", deposit: "", property_type: "", gallery_images: [] }); }}
          rentalForm={rentalForm}
          onFormChange={setRentalForm}
          onSave={async () => {
            if (!sessionToken || !rentalForm.title.trim()) return;
            setRentalSaving(true);
            try {
              let coverImageUrl: string | undefined;
              if (rentalForm.cover_image && rentalForm.cover_image.startsWith("data:")) {
                try {
                  coverImageUrl = await uploadImageToCloudinary(sessionToken, rentalForm.cover_image);
                } catch (e) {
                  console.error("[Rental] Cover image upload failed:", e);
                }
              } else if (rentalForm.cover_image) {
                coverImageUrl = rentalForm.cover_image;
              }
              const uploadedGallery: string[] = [];
              for (const img of rentalForm.gallery_images) {
                if (img.startsWith("data:")) {
                  try {
                    const url = await uploadImageToCloudinary(sessionToken, img);
                    uploadedGallery.push(url);
                  } catch (e) {
                    console.error("[Rental] Gallery image upload failed:", e);
                  }
                } else {
                  uploadedGallery.push(img);
                }
              }
              await createRental(sessionToken, {
                title: rentalForm.title,
                description: rentalForm.description,
                cover_image: coverImageUrl || undefined,
                rent_price: rentalForm.rent_price || undefined,
                rooms_size: rentalForm.rooms_size || undefined,
                address: rentalForm.address || undefined,
                latitude: rentalForm.latitude,
                longitude: rentalForm.longitude,
                available_from: rentalForm.available_from || undefined,
                deposit: rentalForm.deposit || undefined,
                property_type: rentalForm.property_type || undefined,
                gallery_images: uploadedGallery,
              });
              setRentalModalVisible(false);
              setRentalForm({ title: "", description: "", cover_image: "", rent_price: "", rooms_size: "", address: "", latitude: null, longitude: null, available_from: "", deposit: "", property_type: "", gallery_images: [] });
              loadBusinessProfile();
            } catch (error) {
              console.error("Failed to create rental:", error);
              Alert.alert(t("common.error") || "Error", "Failed to create rental. Make sure your business is in the Real Estate category.");
            }
            setRentalSaving(false);
          }}
          isSaving={rentalSaving}
          nearLat={businessDetail?.business.latitude ?? user?.latitude ?? undefined}
          nearLng={businessDetail?.business.longitude ?? user?.longitude ?? undefined}
        />

      {/* User Edit Profile Modal */}
      <Modal visible={userEditModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("profile.editProfile", "Edit Profile")}</Text>
            <Pressable onPress={() => setUserEditModalVisible(false)}>
              <Ionicons name="close" size={24} color="#000000" />
            </Pressable>
          </View>
          <ScrollView ref={userEditScrollRef} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.inputLabel}>{t("profile.name", "Name")}</Text>
            <TextInput
              style={styles.input}
              value={userEditForm.name}
              onChangeText={(text) => setUserEditForm((prev) => ({ ...prev, name: text }))}
              placeholder={t("profile.name", "Name")}
            />
            <Text style={styles.inputLabel}>{t("profile.bio", "Bio")}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={userEditForm.bio}
              onChangeText={(text) => setUserEditForm((prev) => ({ ...prev, bio: text }))}
              placeholder={t("profile.bio", "Bio")}
              multiline
              numberOfLines={4}
            />
            <Text style={styles.inputLabel}>{t("profile.location", "Location")}</Text>
            <PlacesAutocompleteInput
              value={userEditForm.location}
              onChangeText={(text) => setUserEditForm((prev) => ({ ...prev, location: text }))}
              onSelectPlace={(address, lat, lng) => {
                setUserEditForm((prev) => ({ ...prev, location: address, latitude: lat, longitude: lng }));
              }}
              onSuggestionsVisible={(visible) => {
                if (visible) {
                  setTimeout(() => {
                    userEditScrollRef.current?.scrollTo({ y: 280, animated: true });
                  }, 100);
                }
              }}
              placeholder={t("profile.location", "Location")}
              style={styles.input}
              nearLat={user?.latitude ?? businessDetail?.business.latitude ?? undefined}
              nearLng={user?.longitude ?? businessDetail?.business.longitude ?? undefined}
            />
            {userEditForm.latitude && userEditForm.longitude && (
              <Text style={{ color: '#000000', fontSize: 12, marginTop: 4 }}>
                📍 {userEditForm.latitude?.toFixed(4)}, {userEditForm.longitude?.toFixed(4)}
              </Text>
            )}
            <Pressable
              style={[styles.primaryButton, { marginTop: 8 }]}
              onPress={handleSaveUserInfo}
              disabled={savingInfo}
            >
              {savingInfo ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>{t("common.save", "Save")}</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Business Edit Profile Modal */}
      <Modal visible={bizEditModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("business.editInfo", "Edit Business")}</Text>
            <Pressable onPress={() => setBizEditModalVisible(false)}>
              <Ionicons name="close" size={24} color="#000000" />
            </Pressable>
          </View>
          <ScrollView ref={bizEditScrollRef} contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.inputLabel}>{t("business.name", "Business Name")}</Text>
            <TextInput style={styles.input} value={bizEditForm.name} onChangeText={(text) => setBizEditForm((prev) => ({ ...prev, name: text }))} placeholder={t("business.name", "Business Name")} />
            <Text style={styles.inputLabel}>{t("profile.description", "Description")}</Text>
            <TextInput style={[styles.input, styles.textArea]} value={bizEditForm.description} onChangeText={(text) => setBizEditForm((prev) => ({ ...prev, description: text }))} placeholder={t("profile.description", "Description")} multiline numberOfLines={4} />
            <Text style={styles.inputLabel}>{t("business.category", "Category")}</Text>
            <Pressable style={styles.pickerButton} onPress={() => setBizCategoryModalVisible(true)}>
              <Text style={styles.pickerButtonText}>
                {bizEditForm.root_category ? (categoryTree.find(g => g.slug === bizEditForm.root_category)?.name || bizEditForm.root_category) : t("business.selectCategory", "Select Category")}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </Pressable>
            <Text style={styles.inputLabel}>{t("business.subcategory", "Subcategory")}</Text>
            <Pressable style={styles.pickerButton} onPress={() => {
              if (!bizEditForm.root_category) {
                setThemedAlertMessage(t("business.selectCategoryFirst", "Please select a category first"));
                setThemedAlertVisible(true);
                return;
              }
              setBizSubcategoryModalVisible(true);
            }}>
              <Text style={styles.pickerButtonText}>
                {bizEditForm.subcategory ? (categoryTree.find(g => g.slug === bizEditForm.root_category)?.subcategories.find(s => s.slug === bizEditForm.subcategory)?.name || bizEditForm.subcategory) : t("business.selectSubcategory", "Select Subcategory")}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#6b7280" />
            </Pressable>
            <Text style={styles.inputLabel}>{t("business.phone", "Phone")}</Text>
            <TextInput style={styles.input} value={bizEditForm.phone} onChangeText={(text) => setBizEditForm((prev) => ({ ...prev, phone: text }))} placeholder={t("business.phone", "Phone")} keyboardType="phone-pad" />
            <Text style={styles.inputLabel}>{t("business.website", "Website")}</Text>
            <TextInput style={styles.input} value={bizEditForm.website} onChangeText={(text) => setBizEditForm((prev) => ({ ...prev, website: text }))} placeholder={t("business.website", "Website")} keyboardType="url" autoCapitalize="none" />
            <Text style={styles.inputLabel}>{t("auth.email", "Email")}</Text>
            <TextInput style={styles.input} value={bizEditForm.email} onChangeText={(text) => setBizEditForm((prev) => ({ ...prev, email: text }))} placeholder={t("auth.email", "Email")} keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.inputLabel}>{t("business.tags", "Tags")}</Text>
            <TextInput style={styles.input} value={bizEditForm.tags} onChangeText={(text) => setBizEditForm((prev) => ({ ...prev, tags: text }))} placeholder={t("business.tagsHint", "Tags (comma separated)")} />
            <Text style={styles.inputLabel}>{t("business.address", "Address")}</Text>
            <PlacesAutocompleteInput
              value={bizEditForm.address}
              onChangeText={(text) => setBizEditForm((prev) => ({ ...prev, address: text }))}
              onSelectPlace={(address, lat, lng) => {
                setBizEditForm((prev) => ({ ...prev, address, latitude: lat, longitude: lng }));
              }}
              onSuggestionsVisible={(visible) => {
                if (visible) {
                  setTimeout(() => {
                    bizEditScrollRef.current?.scrollTo({ y: 380, animated: true });
                  }, 100);
                }
              }}
              placeholder={t("business.address", "Address")}
              style={styles.input}
              nearLat={bizEditForm.latitude ?? businessDetail?.business.latitude ?? undefined}
              nearLng={bizEditForm.longitude ?? businessDetail?.business.longitude ?? undefined}
            />
            {bizEditForm.latitude && bizEditForm.longitude ? (
              <Text style={{ color: '#000000', fontSize: 12, marginTop: 4, marginBottom: 12 }}>
                📍 {bizEditForm.latitude?.toFixed(4)}, {bizEditForm.longitude?.toFixed(4)}
              </Text>
            ) : null}
            
            <Text style={styles.inputLabel}>{t("business.openingHours", "Opening Hours")}</Text>
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => {
              const dayKey = day.toLowerCase();
              const dayHours = bizEditForm.opening_hours?.[dayKey] || { enabled: true, periods: [{ open: "09:00", close: "18:00" }] };
              return (
                <View key={day} style={styles.dayRowEdit}>
                  <View style={styles.dayHeaderEdit}>
                    <Pressable onPress={() => {
                      const newHours = { ...bizEditForm.opening_hours };
                      newHours[dayKey] = { ...dayHours, enabled: !dayHours.enabled };
                      setBizEditForm({ ...bizEditForm, opening_hours: newHours });
                    }}>
                      <Ionicons name={dayHours.enabled ? "checkbox" : "square-outline"} size={22} color={dayHours.enabled ? "#000000" : "#9ca3af"} />
                    </Pressable>
                    <Text style={styles.dayNameEdit}>{day}</Text>
                  </View>
                  {dayHours.enabled && (
                    <View style={styles.periodRowEdit}>
                      <TextInput
                        style={styles.timeInputSmall}
                        value={dayHours.periods[0]?.open || "09:00"}
                        onChangeText={(text) => {
                          const newHours = { ...bizEditForm.opening_hours };
                          newHours[dayKey] = { ...dayHours, periods: [{ ...dayHours.periods[0], open: text }] };
                          setBizEditForm({ ...bizEditForm, opening_hours: newHours });
                        }}
                        placeholder="09:00"
                      />
                      <Text style={styles.timeSeparatorEdit}>-</Text>
                      <TextInput
                        style={styles.timeInputSmall}
                        value={dayHours.periods[0]?.close || "18:00"}
                        onChangeText={(text) => {
                          const newHours = { ...bizEditForm.opening_hours };
                          newHours[dayKey] = { ...dayHours, periods: [{ ...dayHours.periods[0], close: text }] };
                          setBizEditForm({ ...bizEditForm, opening_hours: newHours });
                        }}
                        placeholder="18:00"
                      />
                    </View>
                  )}
                </View>
              );
            })}
            
            <Pressable
              style={[styles.primaryButton, { marginTop: 16 }]}
              onPress={handleSaveBusinessInfo}
              disabled={bizSaving}
            >
              {bizSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>{t("business.saveChanges", "Save Changes")}</Text>}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Category Selection Modal */}
      <Modal visible={bizCategoryModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("business.selectCategory", "Select Category")}</Text>
            <Pressable onPress={() => setBizCategoryModalVisible(false)}>
              <Ionicons name="close" size={24} color="#000000" />
            </Pressable>
          </View>
          <ScrollView>
            {categoryTree.map((category) => (
              <Pressable
                key={category.slug}
                style={styles.modalItem}
                onPress={() => {
                  setBizEditForm(prev => ({ ...prev, root_category: category.slug, subcategory: "" }));
                  setBizCategoryModalVisible(false);
                }}
              >
                <Text style={styles.modalItemText}>{category.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Subcategory Selection Modal */}
      <Modal visible={bizSubcategoryModalVisible} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("business.selectSubcategory", "Select Subcategory")}</Text>
            <Pressable onPress={() => setBizSubcategoryModalVisible(false)}>
              <Ionicons name="close" size={24} color="#000000" />
            </Pressable>
          </View>
          <ScrollView>
            {categoryTree.find(g => g.slug === bizEditForm.root_category)?.subcategories.map((sub) => (
              <Pressable
                key={sub.slug}
                style={styles.modalItem}
                onPress={() => {
                  setBizEditForm(prev => ({ ...prev, subcategory: sub.slug }));
                  setBizSubcategoryModalVisible(false);
                }}
              >
                <Text style={styles.modalItemText}>{sub.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={showCategoryPicker} animationType="slide" onRequestClose={() => setShowCategoryPicker(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
            <Pressable onPress={() => setShowCategoryPicker(false)}>
              <Ionicons name="close" size={28} color="#374151" />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>{t("business.chooseCategory", "Choose Category")}</Text>
            <View style={{ width: 28 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            <Text style={{ fontSize: 14, color: "#6b7280", marginBottom: 16 }}>{t("business.selectRootHint", "Select a business category")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {categoryTree.map((cat) => (
                <Pressable
                  key={cat.slug}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: pickerRoot === cat.slug ? "#111827" : "#f3f4f6", borderWidth: 1, borderColor: pickerRoot === cat.slug ? "#111827" : "#e5e7eb" }}
                  onPress={() => { setPickerRoot(cat.slug); setPickerSub(""); }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: pickerRoot === cat.slug ? "#fff" : "#374151" }}>{cat.name}</Text>
                </Pressable>
              ))}
            </View>
            {pickerRoot && categoryTree.find(g => g.slug === pickerRoot) && (
              <>
                <Text style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>{t("business.selectSubHint", "Select a subcategory")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {categoryTree.find(g => g.slug === pickerRoot)!.subcategories.map((sub) => (
                    <Pressable
                      key={sub.slug}
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: pickerSub === sub.slug ? "#111827" : "#f3f4f6", borderWidth: 1, borderColor: pickerSub === sub.slug ? "#111827" : "#e5e7eb" }}
                      onPress={() => setPickerSub(sub.slug)}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "500", color: pickerSub === sub.slug ? "#fff" : "#374151" }}>{sub.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 16 + insets.bottom, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb" }}>
            <Pressable
              style={{ backgroundColor: pickerRoot && pickerSub ? "#111827" : "#d1d5db", borderRadius: 14, paddingVertical: 16, alignItems: "center" }}
              disabled={!pickerRoot || !pickerSub}
              onPress={handleCreateNewBusiness}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: pickerRoot && pickerSub ? "#fff" : "#9ca3af" }}>{t("business.createBusiness", "Create Business")}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <TagModal />
      </SafeAreaView>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  tagHelperBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f3f4f6",
    padding: 12,
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  tagHelperText: {
    color: "#6b7280",
    fontSize: 13,
  },
  tagButton: {
    position: "absolute",
    right: 16,
    top: 8,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fef2f2",
    alignItems: "center",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#000000",
    alignItems: "center",
  },
  tagHint: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  tagWarning: {
    fontSize: 12,
    color: "#ef4444",
    marginBottom: 4,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  bizChip: {
    backgroundColor: "#dcfce7",
  },
  chipText: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
    flex: 1,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 6,
    marginTop: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    marginBottom: 6,
  },
  friendsPickerSection: {
    marginBottom: 8,
  },
  friendsScroll: {
    marginBottom: 4,
  },
  friendChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 6,
    gap: 4,
    maxWidth: 120,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  friendChipSelected: {
    backgroundColor: "#e0e7ff",
    borderColor: "#6366f1",
  },
  friendChipAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  friendChipName: {
    fontSize: 11,
    color: "#374151",
    fontWeight: "500",
    maxWidth: 80,
  },
  bizChipSelected: {
    backgroundColor: "#dcfce7",
    borderColor: "#22c55e",
  },
  duplicateHint: {
    fontSize: 8,
    color: "#ef4444",
    marginLeft: 2,
  },
  themedAlertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  themedAlertContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
  },
  themedAlertMessage: {
    fontSize: 16,
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  themedAlertButton: {
    backgroundColor: "#111827",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  },
  themedAlertButtonText: {
    color: "#fff",
    fontSize: 16,
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
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: "#000000",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#000000",
    fontWeight: "600",
  },
  editImagePreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 8,
    alignSelf: "center",
  },
  editCoverPreview: {
    width: "100%",
    height: 120,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "center",
  },
  imagePlaceholder: {
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  dayRowEdit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  dayHeaderEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayNameEdit: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  periodRowEdit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeInputSmall: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 70,
    textAlign: "center",
    fontSize: 13,
  },
  timeSeparatorEdit: {
    color: "#6b7280",
    fontSize: 14,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f3f4f6",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  pickerButtonText: {
    fontSize: 15,
    color: "#111827",
    flex: 1,
  },
  modalItem: {
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
  },
  modalItemText: {
    color: "#111827",
    fontSize: 16,
  },
});

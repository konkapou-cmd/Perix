import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
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
import BusinessMap from "../../components/BusinessMap";
import { SkeletonBox, EmptyState } from "../../components/shared";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import LocatorCard from "../../components/locator/LocatorCard";
import LocatorHeader from "../../components/locator/LocatorHeader";
import ProgressivePicker from "../../components/navigation/ProgressivePicker";
import LocatorSidebar, { SIDEBAR_WIDTH } from "../../components/locator/LocatorSidebar";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { CalendarList } from "react-native-calendars";
import { useAuth } from "../../context/AuthContext";
import { useMapBounds } from "../../context/MapBoundsContext";
import { getThemeColors, getThemeStyles, applyThemeToText } from "../../hooks/useThemeStyles";
import {
  Business,
  createBusiness,
  CategoryGroup,
  createSubscription,
  getCategoryTree,
  getNearbyBusinesses,
  getSubscriptionPlans,
  getSubscriptionStatus,
  SubscriptionPlans,
  EventItem,
  getEvents,
  ActivityItem,
  getActivities,
  Rental,
  getRentals,
  Job,
  getJobs,
} from "../../lib/api";
import { apiRequest } from "../../lib/api/core";
import { useLocation } from "../../context/LocationContext";
import { translateCategory } from "../../lib/categoryTranslation";
import { isUpcomingEvent, isUpcomingActivity, EVENT_THEMES } from "../../lib/api/events";
import { ACTIVITY_CATEGORIES, ACTIVITY_TYPES } from "../../lib/api";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORY_ICONS: Record<string, string> = {
  food: "restaurant",
  drinks: "wine",
  music: "musical-notes",
  nightlife: "moon",
  sports: "fitness",
  beauty: "cut",
  health: "heart",
  education: "school",
  shopping: "bag-handle",
  technology: "hardware-chip",
  automotive: "car",
  realestate: "home",
  "rental-real-estate": "home",
  professional: "briefcase",
  pets: "paw",
  travel: "airplane",
  arts: "color-palette",
  community: "people",
  entertainment: "film",
  fashion: "shirt",
  home: "home-outline",
  other: "grid",
};

const itemWidth = (Dimensions.get("window").width - 48) / 3;

type TabType = "events" | "activities" | "businesses" | "rentals" | "jobs";

interface DateFilter {
  startDate: string | null;
  endDate: string | null;
}

export default function LocatorScreen() {
  const { t } = useTranslation();
  const { sessionToken, user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { setMapBounds: setGlobalMapBounds, mapBounds, refreshKey } = useMapBounds();
  const { location: contextLocation, setManualLocation, radiusKm } = useLocation();
  const router = useRouter();
  const [categoryTree, setCategoryTree] = useState<CategoryGroup[]>([]);
  const [selectedRoot, setSelectedRoot] = useState("All");
  const [selectedSubcategory, setSelectedSubcategory] = useState("All");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryModal, setCategoryModal] = useState(false);
  const [subcategoryModal, setSubcategoryModal] = useState(false);
  const [categoryTarget, setCategoryTarget] = useState<"filter" | "form">("filter");
  const [subcategoryTarget, setSubcategoryTarget] = useState<"filter" | "form">("filter");
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    root_category: "",
    subcategory: "",
    address: "",
    description: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { description: string; place_id: string }[]
  >([]);
  const [suggesting, setSuggesting] = useState(false);
  const [subscriptionModal, setSubscriptionModal] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlans | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionSession, setSubscriptionSession] = useState<
    { subscription_id: string; approval_url: string; status: string } | null
  >(null);

  const [activeTab, setActiveTab] = useState<TabType>("businesses");
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [locationSearchSuggestions, setLocationSearchSuggestions] = useState<
    { description: string; place_id: string; lat: number | null; lng: number | null }[]
  >([]);
  const [showLocationSearch, setShowLocationSearch] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Date filter state
  const [dateFilter, setDateFilter] = useState<DateFilter>({ startDate: null, endDate: null });
  const [pendingDateFilter, setPendingDateFilter] = useState<DateFilter>({ startDate: null, endDate: null });
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Theme filters for events and activities
  const [eventThemeFilter, setEventThemeFilter] = useState<string | null>(null);
  const [pendingEventThemeFilter, setPendingEventThemeFilter] = useState<string | null>(null);
  const [activityCategoryFilter, setActivityCategoryFilter] = useState<string | null>(null);
  const [rentalTypeFilter, setRentalTypeFilter] = useState<string | null>(null);
  const [jobTypeFilter, setJobTypeFilter] = useState<string | null>(null);

  // Rental subcategory chips from category tree
  const rentalSubcategoryChips = useMemo(() => {
    const rentalRoot = categoryTree.find((cat) => cat.slug === "rentals");
    if (!rentalRoot) return [];
    const subs = rentalRoot.groups?.flatMap(g => g.subcategories) ?? [];
    return subs.map(sub => ({ key: sub.slug, label: translateCategory(sub.slug, t) }));
  }, [categoryTree, t]);

  // Tab-specific search queries
  const [eventSearchQuery, setEventSearchQuery] = useState("");
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [businessSearchQuery, setBusinessSearchQuery] = useState("");

  // Apply filter states
  const [hasPendingFilters, setHasPendingFilters] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"nearest" | "date" | "name">("nearest");
  const [locationName, setLocationName] = useState<string | null>(null);

  const haversineDistance = (lat1: number, lon1: number, lat2?: number | null, lon2?: number | null): number | null => {
    if (lat2 == null || lon2 == null) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getDistance = (lat?: number | null, lng?: number | null): number | null => {
    if (!contextLocation || lat == null || lng == null) return null;
    return haversineDistance(contextLocation.latitude, contextLocation.longitude, lat, lng);
  };

  const formatDistance = (km: number): string => {
    if (km < 1) return `${Math.round(km * 1000)}m`;
    if (km < 100) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
  };

  const isBusinessOpen = (business: Business): boolean | null => {
    const openingHours = business.opening_hours as { schedule?: Record<string, { enabled: boolean; periods: { open: string; close: string }[] }> } | undefined;
    if (!openingHours?.schedule) return null;
    const now = new Date();
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const currentDay = days[now.getDay()];
    const daySchedule = openingHours.schedule[currentDay];
    if (!daySchedule || !daySchedule.enabled) return false;
    const currentTime = now.getHours() * 60 + now.getMinutes();
    for (const period of daySchedule.periods) {
      const [openHour, openMin] = period.open.split(":").map(Number);
      const [closeHour, closeMin] = period.close.split(":").map(Number);
      if (currentTime >= openHour*60+openMin && currentTime <= closeHour*60+closeMin) return true;
    }
    return false;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (sessionToken && mapBounds) {
      const centerLat = mapBounds.centerLat;
      const centerLng = mapBounds.centerLng;
      try {
        await loadBusinesses(centerLat, centerLng, mapBounds);
        if (activeTab === "events") await loadEvents(mapBounds);
        if (activeTab === "activities") await loadActivities(mapBounds);
      } catch (e) { console.warn("Refresh failed:", e); }
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (params.tab && ["events", "activities", "businesses"].includes(params.tab)) {
      setActiveTab(params.tab as TabType);
    }
  }, [params.tab]);
   
   // Helper: check if date is within filter range
   const isDateInRange = (dateStr: string | null | undefined, range: DateFilter): boolean => {
     if (!dateStr) return true;
     if (!range.startDate && !range.endDate) return true;
     const date = new Date(dateStr);
     if (range.startDate && date < new Date(range.startDate)) return false;
     if (range.endDate && date > new Date(range.endDate)) return false;
     return true;
   };

   // Helper: calculate date range with +-2 days
   const calculateDateRange = (selectedDateStr: string): { startDate: string; endDate: string } => {
     const baseDate = new Date(selectedDateStr);
     const startDate = new Date(baseDate);
     startDate.setDate(startDate.getDate() - 2);
     const endDate = new Date(baseDate);
     endDate.setDate(endDate.getDate() + 2);
     return {
       startDate: startDate.toISOString().split("T")[0],
       endDate: endDate.toISOString().split("T")[0],
     };
   };

   // Helper: get "This Week" range
   const getThisWeekRange = (): DateFilter => {
     const now = new Date();
     const weekFromNow = new Date(now);
     weekFromNow.setDate(weekFromNow.getDate() + 7);
     return {
       startDate: now.toISOString().split("T")[0],
       endDate: weekFromNow.toISOString().split("T")[0],
     };
   };

   const visibleBusinesses = useMemo(() => {
     let result = businesses;
     // Filter by map bounds
     if (mapBounds) {
       result = result.filter(b => {
         if (b.latitude == null || b.longitude == null) return true;
         return b.latitude >= mapBounds.minLat && 
                b.latitude <= mapBounds.maxLat && 
                b.longitude >= mapBounds.minLng && 
                b.longitude <= mapBounds.maxLng;
       });
     }
     // Filter by search query
     if (businessSearchQuery.trim()) {
       const query = businessSearchQuery.toLowerCase();
       result = result.filter(b => b.name.toLowerCase().includes(query));
     }
     return result;
   }, [businesses, mapBounds, businessSearchQuery]);

   const visibleEvents = useMemo(() => {
     let result = events;
     // Filter by map bounds
     if (mapBounds) {
       result = result.filter(e => {
         if (e.latitude == null || e.longitude == null) return true;
         return e.latitude >= mapBounds.minLat && 
                e.latitude <= mapBounds.maxLat && 
                e.longitude >= mapBounds.minLng && 
                e.longitude <= mapBounds.maxLng;
       });
     }
     // Filter by upcoming (default this week)
     const effectiveDateFilter = dateFilter.startDate || dateFilter.endDate ? dateFilter : getThisWeekRange();
     result = result.filter(e => {
       const eventDate = e.start_time?.split("T")[0];
       return isDateInRange(eventDate, effectiveDateFilter);
     });
     // Filter by theme
     if (eventThemeFilter) {
       result = result.filter(e => e.theme === eventThemeFilter);
     }
     // Filter by search query
     if (eventSearchQuery.trim()) {
       const query = eventSearchQuery.toLowerCase();
       result = result.filter(e => e.title.toLowerCase().includes(query));
     }
     return result;
   }, [events, mapBounds, dateFilter, eventThemeFilter, eventSearchQuery]);

   const visibleActivities = useMemo(() => {
     let result = activities;
     // Filter by map bounds
     if (mapBounds) {
       result = result.filter(a => {
         if (a.latitude == null || a.longitude == null) return true;
         return a.latitude >= mapBounds.minLat && 
                a.latitude <= mapBounds.maxLat && 
                a.longitude >= mapBounds.minLng && 
                a.longitude <= mapBounds.maxLng;
       });
     }
     // Filter by upcoming (default this week)
     const effectiveDateFilter = dateFilter.startDate || dateFilter.endDate ? dateFilter : getThisWeekRange();
     result = result.filter(a => {
       const activityDate = a.date;
       return isDateInRange(activityDate, effectiveDateFilter);
      });
      // Filter by category
      if (activityCategoryFilter) {
        const matchingTypeKeys = Object.entries(ACTIVITY_TYPES)
          .filter(([_, t]) => t.category === activityCategoryFilter)
          .map(([key]) => key);
        result = result.filter(a => matchingTypeKeys.includes(a.theme));
      }
     // Filter by search query
     if (activitySearchQuery.trim()) {
       const query = activitySearchQuery.toLowerCase();
       result = result.filter(a => a.title.toLowerCase().includes(query));
     }
     return result;
   }, [activities, mapBounds, dateFilter, activityCategoryFilter, activitySearchQuery]);
  
  const googleKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const selectedRootGroup = useMemo(
    () => categoryTree.find((category) => category.slug === selectedRoot),
    [categoryTree, selectedRoot]
  );
  const selectedSubLabel = useMemo(() => {
    if (selectedSubcategory === "All") return t('locator.allSubcategories');
    return translateCategory(selectedSubcategory, t);
  }, [selectedSubcategory, t]);

  const businessSubcategories = useMemo(() => {
    if (!selectedRootGroup) return [] as any[];
    return selectedRootGroup.groups
      ? selectedRootGroup.groups.flatMap((g: any) => g.subcategories)
      : (selectedRootGroup.subcategories ?? []);
  }, [selectedRootGroup]);

  const filteredRentals = useMemo(() =>
    rentalTypeFilter ? rentals.filter(r => r.subcategory === rentalTypeFilter) : rentals,
    [rentals, rentalTypeFilter]
  );

  const filteredJobs = useMemo(() =>
    jobTypeFilter ? jobs.filter(j => j.root_category === jobTypeFilter) : jobs,
    [jobs, jobTypeFilter]
  );
  const selectedRootLabel = useMemo(() => {
    if (selectedRoot === "All") return t('locator.allCategories');
    return translateCategory(selectedRoot, t);
  }, [selectedRoot, t]);
  const formRootGroup = useMemo(
    () => categoryTree.find((category) => category.slug === form.root_category),
    [categoryTree, form.root_category]
  );
  const formSubLabel = useMemo(() => {
    if (!form.subcategory) return t('locator.selectSubcategory');
    return translateCategory(form.subcategory, t);
  }, [form.subcategory, t]);

  const formatSubscriptionStatus = (business: Business) => {
    if (business.subscription_status === "trial" && business.trial_expires_at) {
      const diff = new Date(business.trial_expires_at).getTime() - Date.now();
      const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      return `${t('locator.trial')} (${days} ${t('locator.daysLeft')})`;
    }
    if (business.subscription_status === "active") return t('locator.active');
    return t('locator.inactive');
  };

  const loadCategories = useCallback(async () => {
    if (!sessionToken) return;
    const data = await getCategoryTree(sessionToken);
    setCategoryTree(data);
  }, [sessionToken]);

  const loadBusinesses = useCallback(async (centerLat: number, centerLng: number, bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    if (!sessionToken) return;
    const data = await getNearbyBusinesses(
      sessionToken,
      centerLat,
      centerLng,
      selectedRoot !== "All" ? selectedRoot : undefined,
      selectedSubcategory !== "All" ? selectedSubcategory : undefined,
      bounds
    );
    setBusinesses(data);
  }, [sessionToken, selectedRoot, selectedSubcategory]);

  const loadEvents = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    if (!sessionToken) return;
    const data = await getEvents(sessionToken, undefined, undefined, bounds, {
      startAfter: dateFilter.startDate || undefined,
      startBefore: dateFilter.endDate || undefined,
      theme: eventThemeFilter || undefined,
    });
    setEvents(data);
  }, [sessionToken, dateFilter, eventThemeFilter]);

  const loadActivities = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    if (!sessionToken) return;
    const data = await getActivities(sessionToken, bounds, {
      date: dateFilter.startDate || undefined,
      category: activityCategoryFilter || undefined,
    });
    setActivities(data);
  }, [sessionToken, dateFilter, activityCategoryFilter]);

  const loadRentals = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }, subcategoryFilter?: string | null) => {
    if (!sessionToken) return;
    const data = await getRentals(sessionToken, bounds, { subcategory: subcategoryFilter || undefined });
    setRentals(data.rentals);
  }, [sessionToken]);

  const loadJobs = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    if (!sessionToken) return;
    const data = await getJobs(sessionToken, bounds);
    setJobs(data.jobs);
  }, [sessionToken]);

  const handleMapRegionChange = useCallback((bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLng = (bounds.minLng + bounds.maxLng) / 2;

    setGlobalMapBounds({
      minLat: bounds.minLat,
      maxLat: bounds.maxLat,
      minLng: bounds.minLng,
      maxLng: bounds.maxLng,
      centerLat,
      centerLng,
    });
  }, [setGlobalMapBounds, sessionToken, radiusKm]);

  useEffect(() => {
    if (!mapBounds || !sessionToken) return;
    const timer = setTimeout(() => {
      loadBusinesses(mapBounds.centerLat, mapBounds.centerLng, mapBounds);
      if (activeTab === "businesses" && selectedRoot === "rental-real-estate") {
        loadRentals(mapBounds, rentalTypeFilter);
      }
      if (activeTab === "rentals") {
        loadRentals(mapBounds, rentalTypeFilter);
      }
      if (activeTab === "jobs") {
        loadJobs(mapBounds);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [mapBounds, sessionToken, refreshKey, selectedRoot, selectedSubcategory, activeTab, rentalTypeFilter]);

  useEffect(() => {
    if (!mapBounds || !sessionToken) return;
    if (activeTab !== "events" && activeTab !== "activities") return;
    const timer = setTimeout(() => {
      if (activeTab === "events") {
        loadEvents(mapBounds);
      } else if (activeTab === "activities") {
        loadActivities(mapBounds);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [mapBounds, sessionToken, activeTab, refreshKey, dateFilter, loadEvents, loadActivities]);



  useEffect(() => {
    if (!sessionToken) return;
    setLoading(true);
    loadCategories().finally(() => setLoading(false));
  }, [loadCategories, sessionToken]);

  // Reverse geocode location name from coordinates
  useEffect(() => {
    if (!contextLocation) return;
    const reverseGeocode = async () => {
      try {
        const result = await Location.reverseGeocodeAsync({
          latitude: contextLocation.latitude,
          longitude: contextLocation.longitude,
        });
        if (result && result.length > 0) {
          const place = result[0];
          const name = place.city || place.subregion || place.region || place.country || null;
          if (name) setLocationName(name);
        }
      } catch {}
    };
    reverseGeocode();
  }, [contextLocation]);

  // Don't auto-request location on mount - wait for user to tap the map
  // Location will only be set when user explicitly taps the disabled map overlay
  // This ensures content doesn't appear until user enables location manually

  const fetchSuggestions = async (query: string) => {
    if (!googleKey || query.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      setSuggesting(true);
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        query
      )}&key=${googleKey}`;
      const response = await fetch(url);
      const data = await response.json();
      setSuggestions(data.predictions || []);
    } catch (error) {
      setSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  };

  const fetchLocationSearchSuggestions = async (query: string) => {
    if (!sessionToken || query.length < 3) {
      setLocationSearchSuggestions([]);
      return;
    }
    try {
      const data = await apiRequest<{ predictions: { place_id: string; description: string; lat: number | null; lng: number | null }[] }>(
        `/places/autocomplete?input=${encodeURIComponent(query)}`, "GET", sessionToken
      );
      setLocationSearchSuggestions(data.predictions || []);
    } catch (error) {
      setLocationSearchSuggestions([]);
    }
  };

  const handleLocationSearchSelect = (suggestion: {
    description: string;
    place_id: string;
    lat: number | null;
    lng: number | null;
  }) => {
    setLocationSearchQuery("");
    setLocationSearchSuggestions([]);
    setShowLocationSearch(false);
    if (suggestion.lat != null && suggestion.lng != null) {
      setManualLocation(suggestion.lat, suggestion.lng, suggestion.description.split(",")[0]);
    }
  };

  const loadSubscriptionPlans = useCallback(async () => {
    if (!sessionToken) return;
    const plans = await getSubscriptionPlans(sessionToken);
    setSubscriptionPlans(plans);
  }, [sessionToken]);

    useEffect(() => {
      if (subscriptionModal && sessionToken) {
        loadSubscriptionPlans();
      }
    }, [subscriptionModal, sessionToken, loadSubscriptionPlans]);

  // WhatsApp share for business
  const shareBusinessToWhatsApp = async (business: Business) => {
    const businessUrl = `${BACKEND_URL?.replace('/api', '')}/business/${business.business_id}`;
    
    const message = `${t("locator.shareBusinessMessage", { 
      name: business.name, 
      category: translateCategory(business.category, t),
      address: business.address
    })}\n\n${t("locator.viewHere")}: ${businessUrl}`;
    
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

  const handleAddBusiness = async () => {
     if (!sessionToken || !contextLocation) return;
     if (!form.name || !form.root_category || !form.subcategory || !form.address) return;
     const latitude = form.latitude ?? contextLocation.latitude;
     const longitude = form.longitude ?? contextLocation.longitude;
    const newBusiness = await createBusiness(sessionToken, {
      name: form.name,
      root_category: form.root_category,
      subcategory: form.subcategory,
      description: form.description,
      address: form.address,
      latitude,
      longitude,
    });
    setBusinesses([newBusiness, ...businesses]);
    setForm({
      name: "",
      root_category: "",
      subcategory: "",
      address: "",
      description: "",
      latitude: null,
      longitude: null,
    });
    setAddressQuery("");
    setSuggestions([]);
    setAddModal(false);
  };

  const handlePlaceSelect = async (suggestion: {
    description: string;
    place_id: string;
  }) => {
    setAddressQuery(suggestion.description);
    setSuggestions([]);
    setForm((prev) => ({ ...prev, address: suggestion.description }));
    if (!googleKey) return;
    try {
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
          address: data.result.formatted_address || suggestion.description,
        }));
      }
    } catch (error) {
      return;
    }
  };

  const handleCreateSubscription = async () => {
    if (!sessionToken || !selectedBusiness) return;
    try {
      setSubscriptionLoading(true);
      const session = await createSubscription(sessionToken, {
        business_id: selectedBusiness.business_id,
        plan_type: selectedPlan,
      });
      setSubscriptionSession(session);
      if (session.approval_url) {
        await WebBrowser.openBrowserAsync(session.approval_url);
      }
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleCheckSubscription = async () => {
    if (!sessionToken || !subscriptionSession) return;
    await getSubscriptionStatus(sessionToken, subscriptionSession.subscription_id);
    await loadBusinesses(mapBounds!.centerLat, mapBounds!.centerLng);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.backgroundPage }} edges={['top']}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <SkeletonBox width="100%" height={40} style={{ marginHorizontal: 16, marginTop: 8 }} />
          <SkeletonBox width="100%" height={44} borderRadius={12} style={{ marginHorizontal: 16, marginTop: 8 }} />
          <SkeletonBox width="100%" height={200} borderRadius={12} style={{ marginHorizontal: 16, marginTop: 12 }} />
          <SkeletonBox width={100} height={18} style={{ marginHorizontal: 16, marginTop: 16 }} />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ backgroundColor: COLORS.background, borderRadius: 8, padding: 14, marginHorizontal: 16, marginBottom: 12 }}>
              <View style={{ flexDirection: "row" }}>
                <SkeletonBox width={56} height={56} borderRadius={12} />
                <View style={{ marginLeft: 12, justifyContent: "center", gap: 6 }}>
                  <SkeletonBox width={120} height={12} />
                  <SkeletonBox width={100} height={12} />
                  <SkeletonBox width={80} height={12} />
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Bar */}
      <View style={styles.searchBarSection}>
        <View style={styles.searchInputContainer}>
          {Platform.OS !== "web" && (
            <Pressable onPress={() => setSidebarOpen(true)} style={{ paddingRight: 4 }}>
              <Ionicons name="menu" size={20} color={COLORS.primary} />
            </Pressable>
          )}
          <Ionicons name="search" size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === "businesses" ? t('business.searchBusinesses') : activeTab === "events" ? t('events.searchEvents') : t('activities.searchActivities')}
            placeholderTextColor={COLORS.textDisabled}
            value={activeTab === "businesses" ? businessSearchQuery : activeTab === "events" ? eventSearchQuery : activitySearchQuery}
            onChangeText={activeTab === "businesses" ? setBusinessSearchQuery : activeTab === "events" ? setEventSearchQuery : setActivitySearchQuery}
          />
          {(businessSearchQuery || eventSearchQuery || activitySearchQuery) ? (
            <Pressable onPress={() => { setBusinessSearchQuery(""); setEventSearchQuery(""); setActivitySearchQuery(""); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
            </Pressable>
          ) : null}
          <Pressable
            style={styles.locationSearchBtn}
            onPress={() => setShowLocationSearch(true)}
          >
            <Ionicons name="location-outline" size={18} color={COLORS.primary} />
          </Pressable>
        </View>
        {/* Location search */}
        {showLocationSearch && (
          <View style={styles.locationSearchDropdown}>
            <View style={styles.locationSearchBar}>
              <Ionicons name="search" size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.locationSearchInput}
                placeholder={t("locator.searchLocation") || "Search location..."}
                placeholderTextColor={COLORS.textDisabled}
                value={locationSearchQuery}
                onChangeText={(text) => {
                  setLocationSearchQuery(text);
                  fetchLocationSearchSuggestions(text);
                }}
                autoFocus
              />
              <Pressable onPress={() => { setShowLocationSearch(false); setLocationSearchQuery(""); setLocationSearchSuggestions([]); }}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </Pressable>
            </View>
            {locationSearchSuggestions.length > 0 && (
              <View style={styles.locationSearchResults}>
                <ScrollView nestedScrollEnabled>
                  {locationSearchSuggestions.map((s) => (
                    <Pressable
                      key={s.place_id}
                      style={styles.locationSearchItem}
                      onPress={() => handleLocationSearchSelect(s)}
                    >
                      <Ionicons name="location" size={16} color={COLORS.primary} />
                      <Text style={styles.locationSearchItemText} numberOfLines={1}>{s.description}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Sidebar + Content */}
      <View style={styles.sidebarLayout}>
        {Platform.OS === "web" || sidebarOpen ? (
          <LocatorSidebar
            categories={categoryTree}
            selectedRoot={selectedRoot}
            selectedSubcategory={selectedSubcategory}
            onSelectRoot={(slug) => { setSelectedRoot(slug); setSelectedSubcategory("All"); }}
            onSelectSubcategory={setSelectedSubcategory}
            onClose={Platform.OS !== "web" ? () => setSidebarOpen(false) : undefined}
          />
        ) : null}
        {Platform.OS !== "web" && sidebarOpen && (
          <Pressable style={styles.sidebarOverlay} onPress={() => setSidebarOpen(false)} />
        )}

        <View style={styles.sidebarContent}>
          {/* Map Section */}
          <View style={styles.mapSection}>
        <BusinessMap
          location={contextLocation || { latitude: mapBounds?.centerLat || 52.52, longitude: mapBounds?.centerLng || 13.405 }}
          businesses={activeTab === "businesses" ? businesses : []}
          events={activeTab === "events" ? events : []}
          activities={activeTab === "activities" ? activities : []}
          rentals={activeTab === "businesses" ? rentals : []}
          showUserLocation
          onRegionChangeComplete={handleMapRegionChange}
          onMarkerPress={(id) => {
            if (activeTab === "businesses") {
              const rental = rentals.find(r => r.rental_id === id);
              if (rental) { router.push(`/service/${rental.service_id || id}` as any); return; }
              router.push(`/business/${id}` as any); return;
            }
            if (activeTab === "events") { router.push(`/event/${id}` as any); return; }
            if (activeTab === "activities") { router.push(`/activity/${id}` as any); return; }
          }}
          disabled={!contextLocation}
          disabledHint="Tap to enable location"
          onMapPress={contextLocation ? undefined : (() => {
            Location.requestForegroundPermissionsAsync().then(({ status }) => {
              if (status === 'granted') {
                Location.getCurrentPositionAsync({}).then((loc) => {
                  setManualLocation(loc.coords.latitude, loc.coords.longitude);
                });
              }
            });
          }) as any}
        />
        {/* Recenter FAB */}
        <Pressable
          style={styles.recenterFab}
          onPress={() => {
            if (contextLocation) {
              setManualLocation(contextLocation.latitude, contextLocation.longitude);
            } else {
              Location.requestForegroundPermissionsAsync().then(({ status }) => {
                if (status === 'granted') {
                  Location.getCurrentPositionAsync({}).then((loc) => {
                    setManualLocation(loc.coords.latitude, loc.coords.longitude);
                  });
                }
              });
            }
          }}
        >
          <Ionicons name="locate" size={22} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* Segment Tabs */}
      <LocatorHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        locationName={locationName}
        t={t}
      />

      {/* Filter Picker Rows */}
      {activeTab === "businesses" && (
        <>
          <ProgressivePicker
            label={t("common.filter", "Filter")}
            value={selectedRoot === "All" ? "All" : selectedRoot}
            options={[
              { key: "All", label: t("common.all", "Alle Kategorien") },
              ...categoryTree.map((cat) => ({ key: cat.slug, label: translateCategory(cat.slug, t), icon: (CATEGORY_ICONS[cat.slug] || "grid") as any })),
            ]}
            onChange={(key) => { setSelectedRoot(key); setSelectedSubcategory("All"); }}
            primaryColor={COLORS.primary}
            borderColor={COLORS.border ?? "#e5e7eb"}
          />
          {selectedRoot !== "All" && businessSubcategories.length > 0 && (
            <ProgressivePicker
              label={t("common.subcategory", "Kategorie")}
              value={selectedSubcategory === "All" ? "All" : selectedSubcategory}
              options={[
                { key: "All", label: t("common.allSubcategories", "Alle Unterkategorien") },
                ...businessSubcategories.map((sub: any) => ({ key: sub.slug, label: translateCategory(sub.slug, t) })),
              ]}
              onChange={(key) => setSelectedSubcategory(key === "All" ? "All" : key)}
              primaryColor={COLORS.primary}
              borderColor={COLORS.border ?? "#e5e7eb"}
            />
          )}
        </>
      )}
      {activeTab === "events" && (
        <>
          <ProgressivePicker
            label={t("common.filter", "Filter")}
            value={eventThemeFilter ?? "All"}
            options={[
              { key: "All", label: t("common.allThemes", "Alle Themen") },
              ...Object.entries(EVENT_THEMES).map(([key, theme]: [string, any]) => ({ key, label: theme.label })),
            ]}
            onChange={(key) => setEventThemeFilter(key === "All" ? null : key)}
            primaryColor={COLORS.primary}
            borderColor={COLORS.border ?? "#e5e7eb"}
          />
          <ProgressivePicker
            label={t("common.date", "Datum")}
            value={dateFilter.startDate ?? "this-week"}
            displayValue={dateFilter.startDate ? `${dateFilter.startDate} → ${dateFilter.endDate || "..."}` : t("common.thisWeek", "Diese Woche")}
            onPressOverride={() => setShowCalendar(true)}
            options={[{ key: "this-week" as any, label: t("common.thisWeek", "Diese Woche") }]}
            onChange={() => {}}
            primaryColor={COLORS.primary}
            borderColor={COLORS.border ?? "#e5e7eb"}
          />
        </>
      )}
      {activeTab === "activities" && (
        <>
          <ProgressivePicker
            label={t("common.filter", "Filter")}
            value={activityCategoryFilter ?? "All"}
            options={[
              { key: "All", label: t("common.allCategories", "Alle Kategorien") },
              ...Object.entries(ACTIVITY_CATEGORIES).map(([key, cat]: [string, any]) => ({ key, label: cat.label })),
            ]}
            onChange={(key) => setActivityCategoryFilter(key === "All" ? null : key)}
            primaryColor={COLORS.primary}
            borderColor={COLORS.border ?? "#e5e7eb"}
          />
          <ProgressivePicker
            label={t("common.date", "Datum")}
            value={dateFilter.startDate ?? "this-week"}
            displayValue={dateFilter.startDate ? `${dateFilter.startDate} → ${dateFilter.endDate || "..."}` : t("common.thisWeek", "Diese Woche")}
            onPressOverride={() => setShowCalendar(true)}
            options={[{ key: "this-week" as any, label: t("common.thisWeek", "Diese Woche") }]}
            onChange={() => {}}
            primaryColor={COLORS.primary}
            borderColor={COLORS.border ?? "#e5e7eb"}
          />
        </>
      )}
      {activeTab === "rentals" && (
        <ProgressivePicker
          label={t("common.filter", "Filter")}
          value={rentalTypeFilter ?? "All"}
          options={[
            { key: "All", label: t("common.allTypes", "Alle Typen") },
            ...rentalSubcategoryChips.map((c: any) => ({ key: c.key, label: c.label })),
          ]}
          onChange={(key) => setRentalTypeFilter(key === "All" ? null : key)}
          primaryColor={COLORS.primary}
          borderColor={COLORS.border ?? "#e5e7eb"}
        />
      )}
      {activeTab === "jobs" && (
        <ProgressivePicker
          label={t("common.filter", "Filter")}
          value={jobTypeFilter ?? "All"}
          options={[
            { key: "All", label: t("common.allCategories", "Alle Kategorien") },
            ...categoryTree.map((cat) => ({ key: cat.slug, label: translateCategory(cat.slug, t) })),
          ]}
          onChange={(key) => setJobTypeFilter(key === "All" ? null : key)}
          primaryColor={COLORS.primary}
          borderColor={COLORS.border ?? "#e5e7eb"}
        />
      )}

      {/* Card List */}
      <ScrollView
        style={styles.cardScrollView}
        contentContainerStyle={styles.cardScrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Business List */}
        {activeTab === "businesses" && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{visibleBusinesses.length} {t('tabs.businesses')}</Text>
            {visibleBusinesses.length === 0 && (
              <EmptyState icon="storefront" message={t('business.noBusinesses')} size="default" muted />
            )}
            {visibleBusinesses.map((business) => {
              const isOpen = isBusinessOpen(business);
              const dist = getDistance(business.latitude, business.longitude);
              return (
                <LocatorCard
                  key={business.business_id}
                  type="business"
                  data={business}
                  distance={dist !== null ? formatDistance(dist) : null}
                  isOpen={isOpen}
                  onPress={() => router.push(`/business/${business.business_id}`)}
                />
              );
            })}
          </View>
        )}

        {/* Event List */}
        {activeTab === "events" && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{visibleEvents.length} {t('tabs.events')}</Text>
            {visibleEvents.length === 0 && (
              <EmptyState icon="calendar" message={t('events.noEvents')} size="default" muted />
            )}
            {visibleEvents.map((event) => {
              const dist = getDistance(event.business?.latitude, event.business?.longitude);
              return (
                <LocatorCard
                  key={event.event_id}
                  type="event"
                  data={event}
                  distance={dist !== null ? formatDistance(dist) : null}
                  onPress={() => router.push(`/event/${event.event_id}`)}
                />
              );
            })}
          </View>
        )}

        {/* Activity List */}
        {activeTab === "activities" && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{visibleActivities.length} {t('tabs.activities')}</Text>
            {visibleActivities.length === 0 && (
              <EmptyState icon="people" message={t('activities.noActivities')} size="default" muted />
            )}
            {visibleActivities.map((activity) => {
              const dist = getDistance(activity.latitude, activity.longitude);
              return (
                <LocatorCard
                  key={activity.activity_id}
                  type="activity"
                  data={activity}
                  distance={dist !== null ? formatDistance(dist) : null}
                  onPress={() => router.push(`/activity/${activity.activity_id}`)}
                />
              );
            })}
          </View>
        )}

        {/* Rental List */}
        {activeTab === "rentals" && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{filteredRentals.length} {t('tabs.rentals')}</Text>
            {filteredRentals.length === 0 && (
              <EmptyState icon="home-outline" message={t('rentals.noRentals', "Keine Mietangebote gefunden")} size="default" muted />
            )}
            {filteredRentals.map((rental) => {
              const dist = getDistance(rental.latitude, rental.longitude);
              return (
                <LocatorCard
                  key={rental.rental_id}
                  type="business"
                  data={{
                    business_id: rental.rental_id,
                    name: rental.title,
                    root_category: rental.root_category || "Rental",
                    subcategory: rental.subcategory || "Real Estate",
                    address: rental.address,
                    latitude: rental.latitude,
                    longitude: rental.longitude,
                    cover_image: rental.cover_image || (rental.gallery_images?.[0]),
                    logo_image: rental.business_logo,
                    profile_photo: rental.cover_image,
                    description: rental.description,
                  } as any}
                  distance={dist !== null ? formatDistance(dist) : null}
                  isOpen={null}
                  onPress={() => router.push(`/service/${rental.service_id || rental.rental_id}` as any)}
                />
              );
            })}
          </View>
        )}

        {/* Job List */}
        {activeTab === "jobs" && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{filteredJobs.length} {t('tabs.jobs')}</Text>
            {filteredJobs.length === 0 && (
              <EmptyState icon="briefcase-outline" message={t('jobs.noJobs', "Keine Stellenanzeigen gefunden")} size="default" muted />
            )}
            {filteredJobs.map((job) => {
              const dist = getDistance(job.latitude, job.longitude);
              return (
                <LocatorCard
                  key={job.job_id}
                  type="business"
                  data={{
                    business_id: job.job_id,
                    name: job.title,
                    root_category: "Jobs",
                    subcategory: job.job_type || t("jobs.fullTime", "Vollzeit"),
                    address: job.location,
                    latitude: job.latitude,
                    longitude: job.longitude,
                    cover_image: job.cover_image,
                    logo_image: job.business_logo,
                    profile_photo: job.cover_image,
                    description: job.description,
                  } as any}
                  distance={dist !== null ? formatDistance(dist) : null}
                  isOpen={null}
                  onPress={() => router.push(`/job/${job.job_id}` as any)}
                />
              );
            })}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Calendar Modal */}
      <Modal visible={showCalendar} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.backgroundPage }}>
          <View style={styles.calendarModalHeader}>
            <View style={styles.calendarHeaderContent}>
              <View style={styles.calendarHeaderIcon}>
                <Ionicons name="calendar" size={24} color={COLORS.background} />
              </View>
              <View>
                <Text style={styles.calendarModalTitle}>{t('home.eventsCalendar') || 'Select Dates'}</Text>
                <Text style={styles.calendarModalSubtitle}>
                  {pendingDateFilter.startDate || t('common.selectDateRange') || 'Choose a date range'}
                </Text>
              </View>
            </View>
            <Pressable style={styles.calendarCloseButton} onPress={() => setShowCalendar(false)}>
              <Ionicons name="close" size={24} color={COLORS.background} />
            </Pressable>
          </View>
          <View style={styles.calendarBody}>
            <CalendarList
              onDayPress={(day: any) => {
                if (!pendingDateFilter.startDate) {
                  setPendingDateFilter({ startDate: day.dateString, endDate: null });
                } else if (!pendingDateFilter.endDate) {
                  const start = pendingDateFilter.startDate;
                  const end = day.dateString;
                  if (end < start) {
                    setPendingDateFilter({ startDate: end, endDate: start });
                  } else {
                    setPendingDateFilter({ startDate: start, endDate: end });
                  }
                } else {
                  setPendingDateFilter({ startDate: day.dateString, endDate: null });
                }
              }}
              markedDates={{
                ...(pendingDateFilter.startDate ? { [pendingDateFilter.startDate]: { selected: true, color: COLORS.primary } } : {}),
                ...(pendingDateFilter.endDate ? { [pendingDateFilter.endDate]: { selected: true, color: COLORS.primary } } : {}),
              }}
            />
          </View>
          <View style={styles.calendarFooter}>
            <Pressable style={styles.calendarActionButton} onPress={() => {
              setDateFilter({ startDate: null, endDate: null });
              setPendingDateFilter({ startDate: null, endDate: null });
              setShowCalendar(false);
            }}>
              <Text style={styles.calendarActionButtonText}>{t("common.reset", "Zurücksetzen")}</Text>
            </Pressable>
            <Pressable style={[styles.calendarActionButton, styles.calendarApplyButton]} onPress={() => {
              setDateFilter(pendingDateFilter);
              setShowCalendar(false);
            }}>
              <Text style={[styles.calendarActionButtonText, styles.calendarApplyButtonText]}>Apply</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={categoryModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('locator.selectCategory')}</Text>
            <Pressable onPress={() => setCategoryModal(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView>
            {categoryTarget === "filter" ? (
              <Pressable
                style={styles.modalItem}
                onPress={() => {
                  setSelectedRoot("All");
                  setSelectedSubcategory("All");
                  setCategoryModal(false);
                }}
              >
                <Text style={styles.modalItemText}>{t('locator.allCategories')}</Text>
              </Pressable>
            ) : null}
            {categoryTree.map((category) => (
              <Pressable
                key={category.slug}
                style={styles.modalItem}
                onPress={() => {
                  if (categoryTarget === "filter") {
                    setSelectedRoot(category.slug);
                    setSelectedSubcategory("All");
                  } else {
                    setForm((prev) => ({
                      ...prev,
                      root_category: category.slug,
                      subcategory: "",
                    }));
                  }
                  setCategoryModal(false);
                }}
              >
                <Text style={styles.modalItemText}>{translateCategory(category.slug, t)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={subcategoryModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('locator.selectSubcategory')}</Text>
            <Pressable onPress={() => setSubcategoryModal(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView>
            {subcategoryTarget === "filter" && selectedRoot !== "All" ? (
              <Pressable
                style={styles.modalItem}
                onPress={() => {
                  setSelectedSubcategory("All");
                  setSubcategoryModal(false);
                }}
              >
                <Text style={styles.modalItemText}>{t('locator.allSubcategories')}</Text>
              </Pressable>
            ) : null}
            {((): any[] => {
              const group = subcategoryTarget === "filter" ? selectedRootGroup : formRootGroup;
              if (!group) return [];
              if (group.groups) return group.groups.flatMap(g => g.subcategories);
              return group.subcategories || [];
            })().map((subcategory) => (
              <Pressable
                key={subcategory.slug}
                style={styles.modalItem}
                onPress={() => {
                  if (subcategoryTarget === "filter") {
                    setSelectedSubcategory(subcategory.slug);
                  } else {
                    setForm((prev) => ({ ...prev, subcategory: subcategory.slug }));
                  }
                  setSubcategoryModal(false);
                }}
              >
                <Text style={styles.modalItemText}>{translateCategory(subcategory.slug, t)}</Text>
              </Pressable>
            ))}
            {(
              (subcategoryTarget === "filter"
                ? selectedRootGroup?.subcategories
                : formRootGroup?.subcategories) || []
            ).length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{t('locator.selectCategoryFirst') || t('common.selectFirst')}</Text>
                <Pressable 
                  style={styles.emptyBackButton}
                  onPress={() => setSubcategoryModal(false)}
                >
                  <Text style={styles.emptyBackButtonText}>{t('common.back') || "Back"}</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={addModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('locator.addBusiness')}</Text>
            <Pressable onPress={() => setAddModal(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <TextInput
              placeholder={t('locator.businessName')}
              value={form.name}
              onChangeText={(value) => setForm({ ...form, name: value })}
              style={styles.input}
            />
            <Pressable
              style={styles.selector}
              onPress={() => {
                setCategoryTarget("form");
                setCategoryModal(true);
              }}
            >
              <Text style={styles.selectorText}>
                {formRootGroup ? translateCategory(formRootGroup.slug, t) : t('locator.selectCategory')}
              </Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.textGray} />
            </Pressable>
            <Pressable
              style={styles.selector}
              onPress={() => {
                setSubcategoryTarget("form");
                setSubcategoryModal(true);
              }}
            >
              <Text style={styles.selectorText}>{formSubLabel}</Text>
              <Ionicons name="chevron-down" size={18} color={COLORS.textGray} />
            </Pressable>
            <TextInput
              placeholder={t('locator.address')}
              value={addressQuery}
              onChangeText={(value) => {
                setAddressQuery(value);
                setForm((prev) => ({ ...prev, address: value }));
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
            {form.subcategory ? (
              <View style={styles.moduleRow}>
                {(formRootGroup?.subcategories?.find(
                  (sub) => sub.slug === form.subcategory
                )?.tools || []).map((tool) => (
                  <View key={tool} style={styles.moduleChip}>
                    <Text style={styles.moduleChipText}>{tool}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <TextInput
              placeholder={t('locator.descriptionOptional')}
              value={form.description}
              onChangeText={(value) => setForm({ ...form, description: value })}
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
              multiline
            />
            <Pressable style={styles.primaryButton} onPress={handleAddBusiness}>
              <Text style={styles.primaryButtonText}>{t('locator.saveBusiness')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={subscriptionModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('locator.businessSubscription')}</Text>
            <Pressable onPress={() => setSubscriptionModal(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.businessName}>{selectedBusiness?.name}</Text>
            <Text style={styles.modalSubtitle}>
              {t('locator.trialInfo')}
            </Text>
            {subscriptionPlans ? (
              <View style={styles.planRow}>
                <Pressable
                  style={[
                    styles.planCard,
                    selectedPlan === "monthly" && styles.planCardActive,
                  ]}
                  onPress={() => setSelectedPlan("monthly")}
                >
                  <Text style={styles.planTitle}>{t('locator.monthly')}</Text>
                  <Text style={styles.planPrice}>${subscriptionPlans.monthly_price}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.planCard,
                    selectedPlan === "yearly" && styles.planCardActive,
                  ]}
                  onPress={() => setSelectedPlan("yearly")}
                >
                  <Text style={styles.planTitle}>{t('locator.yearly')}</Text>
                  <Text style={styles.planPrice}>${subscriptionPlans.yearly_price}</Text>
                </Pressable>
              </View>
            ) : (
              <ActivityIndicator color={COLORS.primaryDark} />
            )}
            <Pressable
              style={[styles.primaryButton, subscriptionLoading && styles.buttonDisabled]}
              onPress={handleCreateSubscription}
              disabled={subscriptionLoading}
            >
              <Text style={styles.primaryButtonText}>
                {subscriptionSession ? t('locator.openPayPalAgain') : t('locator.continueToPayPal')}
              </Text>
            </Pressable>
            {subscriptionSession ? (
              <Pressable style={styles.secondaryButton} onPress={handleCheckSubscription}>
                <Text style={styles.secondaryButtonText}>{t('locator.checkStatus')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  sidebarLayout: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
    overflow: "hidden",
  },
  sidebarContent: {
    flex: 1,
  },
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 99,
    // @ts-ignore
    cursor: "pointer",
  },

  // Tab Styles
  tabContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    marginBottom: 8,
  },
  tabScroll: {
    gap: 10,
  },
  tab: {
    borderRadius: 8,
    backgroundColor: COLORS.surfaceGray,
  },
  tabActive: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  tabText: {
    fontSize: Platform.OS === "web" ? 15 : 14,
    fontWeight: "600",
    color: COLORS.textGray,
  },
  tabTextActive: {
    color: COLORS.textPrimary,
  },
  
  // Search Styles
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: "#2B075F",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: Platform.OS === "web" ? 16 : 15,
    color: COLORS.textPrimary,
  },
  
  // Filter Row Styles
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.background,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: "#2B075F",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dateButtonText: {
    flex: 1,
    fontSize: Platform.OS === "web" ? 14 : 13,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  thisWeekButton: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryDark,
  },
  thisWeekButtonText: {
    fontSize: Platform.OS === "web" ? 14 : 13,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  clearButton: {
    padding: 4,
  },
  
  // Theme Filter Styles
  themeFilterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  themeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.surfaceGray,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
  },
  themeChipActive: {
    backgroundColor: COLORS.textPrimary,
    borderColor: COLORS.textPrimary,
  },
  themeChipEmoji: {
    fontSize: 14,
  },
  themeChipText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  themeChipTextActive: {
    color: COLORS.textLight,
  },
  
  // Category Filter Styles
  categoryFilterContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  categoryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: COLORS.background,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
  },
  categoryButtonText: {
    fontSize: Platform.OS === "web" ? 14 : 13,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  
  // Marker Toggle Styles
  markerToggles: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 16,
  },
  markerToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
  },
  markerToggleActive: {
    borderColor: COLORS.primaryDark,
    backgroundColor: COLORS.primaryLight,
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  markerToggleText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    fontWeight: "600",
    color: COLORS.textGray,
  },
  markerToggleTextActive: {
    color: COLORS.primaryDark,
  },
  
  // Calendar Modal Styles
  calendarModalContainer: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  calendarModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  calendarHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  calendarHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarModalTitle: {
    fontSize: Platform.OS === "web" ? 20 : 18,
    fontWeight: "700",
    color: COLORS.background,
  },
  calendarModalSubtitle: {
    fontSize: Platform.OS === "web" ? 14 : 13,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
  },
  calendarCloseButton: {
    padding: 4,
  },
  calendarBody: {
    flex: 1,
    backgroundColor: COLORS.background,
    marginTop: 8,
  },
  calendarList: {
    borderRadius: 12,
  },
  calendarFooter: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderGray,
  },
  calendarActionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.surfaceGray,
  },
  calendarApplyButton: {
    backgroundColor: COLORS.primaryDark,
  },
  calendarActionButtonText: {
    fontSize: Platform.OS === "web" ? 16 : 15,
    fontWeight: "600",
    color: COLORS.textDark,
  },
  calendarApplyButtonText: {
    color: COLORS.background,
  },
  
  // Legacy styles (kept for compatibility)
  header: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 6,
    color: COLORS.textGray,
  },
  dateFilterContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  dateFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primaryTintDark,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
  },
  dateFilterText: {
    color: COLORS.primaryDark,
    fontSize: Platform.OS === "web" ? 14 : 13,
    fontWeight: "600",
    flex: 1,
  },
  clearDateFilter: {
    padding: 4,
  },
  datePickerRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  dateInputContainer: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    color: COLORS.textGray,
    marginBottom: 4,
  },
  dateInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: Platform.OS === "web" ? 15 : 14,
  },
  actions: {
    flexDirection: "column",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    backgroundColor: COLORS.primaryTintDark,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  filterText: {
    color: COLORS.primaryDark,
    fontWeight: "600",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: COLORS.background,
    fontWeight: "600",
  },
  helperChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryTintDark,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  helperText: {
    color: COLORS.primaryDark,
    fontWeight: "600",
    marginLeft: 6,
  },
  webNotice: {
    height: 200,
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  webNoticeText: {
    color: COLORS.textPrimary,
    fontWeight: "600",
    fontSize: Platform.OS === "web" ? 18 : 16,
    marginTop: 8,
  },
  webNoticeSubtext: {
    color: COLORS.textPlaceholder,
    fontSize: Platform.OS === "web" ? 14 : 13,
  },
  list: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  listTitle: {
    fontSize: Platform.OS === "web" ? 18 : 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textPlaceholder,
    marginBottom: 12,
  },
  emptyBackButton: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyBackButtonText: {
    color: COLORS.background,
    fontWeight: "600",
  },
  businessCard: {
    backgroundColor: COLORS.background,
    padding: 14,
    marginBottom: 12,
    borderRadius: 8,
  },
  businessCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  businessPhoto: {
    width: Platform.OS === "web" ? 64 : 56,
    height: Platform.OS === "web" ? 64 : 56,
    marginRight: 12,
  },
  businessPhotoPlaceholder: {
    width: Platform.OS === "web" ? 64 : 56,
    height: Platform.OS === "web" ? 64 : 56,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  businessPhotoText: {
    color: COLORS.background,
    fontSize: Platform.OS === "web" ? 24 : 20,
    fontWeight: "700",
  },
  businessActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 10,
    gap: 10,
  },
  whatsappShareButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.statusOpenBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  businessIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryTintDark,
    alignItems: "center",
    justifyContent: "center",
  },
  businessName: {
    fontWeight: "600",
    color: COLORS.textPrimary,
    fontSize: Platform.OS === "web" ? 16 : 14,
  },
  businessCategory: {
    color: COLORS.primaryDark,
    fontSize: Platform.OS === "web" ? 13 : 12,
  },
  businessAddress: {
    color: COLORS.textGray,
    fontSize: Platform.OS === "web" ? 13 : 12,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  modalItem: {
    padding: 14,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    marginBottom: 8,
  },
  modalItemText: {
    color: COLORS.textPrimary,
  },
  moduleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  moduleChip: {
    backgroundColor: COLORS.primaryTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 6,
    marginTop: 6,
  },
  moduleChipText: {
    color: COLORS.indigoText,
    fontSize: 11,
    fontWeight: "600",
  },
  subscriptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  subscriptionText: {
    color: COLORS.textGray,
    fontSize: 12,
  },
  subscriptionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primaryTintDark,
  },
  subscriptionButtonText: {
    color: COLORS.primaryDark,
    fontSize: 12,
    fontWeight: "600",
  },
  suggestionBox: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    marginBottom: 12,
    overflow: "hidden",
  },
  suggestionItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceGray,
  },
  suggestionText: {
    color: COLORS.textPrimary,
  },
  modalBody: {
    padding: 20,
  },
  modalSubtitle: {
    color: COLORS.textGray,
    marginBottom: 12,
  },
  planRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  planCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
  },
  planCardActive: {
    borderColor: COLORS.primaryDark,
    backgroundColor: COLORS.primaryTintDark,
  },
  planTitle: {
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  planPrice: {
    marginTop: 6,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  secondaryButton: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: COLORS.primaryDark,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: COLORS.background,
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    borderRadius: 12,
    marginBottom: 12,
  },
  selectorText: {
    color: COLORS.textGray,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Location Header Styles
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    shadowColor: "#2B075F",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  refreshLocationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryTintDark,
    alignItems: "center",
    justifyContent: "center",
  },
  locationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primaryTintDark,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: COLORS.textPlaceholder,
  },
  locationName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  locationRadiusBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  locationRadiusText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.success,
  },
  // Location Modal Styles
  liveLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 16,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.liveGreenBorder,
  },
  liveLocationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  liveLocationText: {
    flex: 1,
  },
  liveLocationTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  liveLocationSubtitle: {
    fontSize: 13,
    color: COLORS.textGray,
    marginTop: 2,
  },
  locationSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surfaceGray,
    borderRadius: 12,
    height: 48,
  },
  locationSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  locationResults: {
    flex: 1,
    marginTop: 8,
  },
  locationSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceGray,
  },
  locationSuggestionText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  currentLocationInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.primaryTintDark,
    borderRadius: 8,
  },
  currentLocationText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: COLORS.primaryDark,
  },
  addressSearchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  // View Toggle Styles
  viewToggle: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.primaryTintDark,
    borderRadius: 12,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 6,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.primaryDark,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  toggleTextActive: {
    color: COLORS.background,
  },
  // Artist Search Styles
  artistSearchContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  citySearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    shadowColor: "#2B075F",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  citySearchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: COLORS.textPrimary,
    paddingVertical: 12,
  },
  searchButton: {
    padding: 4,
  },
  nearMeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  nearMeButtonText: {
    color: COLORS.background,
    fontSize: 15,
    fontWeight: "600",
  },
  searchHint: {
    fontSize: 12,
    color: COLORS.textPlaceholder,
    marginTop: 8,
    textAlign: "center",
  },
  searchResultsContainer: {
    flex: 1,
    marginTop: 16,
  },
  searchResultsHeader: {
    marginBottom: 16,
  },
  searchResultsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  searchResultsSubtitle: {
    fontSize: 14,
    color: COLORS.textGray,
    marginTop: 4,
  },
  searchSection: {
    marginBottom: 20,
  },
  searchSectionTitle: {
    fontSize: Platform.OS === "web" ? 18 : 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  artistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    padding: 14,
    marginBottom: 10,
  },
  artistPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  artistPhotoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  artistPhotoText: {
    color: COLORS.background,
    fontSize: 20,
    fontWeight: "700",
  },
  artistInfo: {
    flex: 1,
    marginLeft: 12,
  },
  artistName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  artistTown: {
    fontSize: 13,
    color: COLORS.textGray,
    marginTop: 2,
  },
  genresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 4,
  },
  genreChip: {
    backgroundColor: COLORS.primaryTintDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  genreChipText: {
    fontSize: 11,
    color: COLORS.primaryDark,
    fontWeight: "500",
  },
  distanceBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.success,
  },
  postCard: {
    backgroundColor: COLORS.background,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  postAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  postAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginLeft: 10,
  },
  postText: {
    fontSize: 14,
    color: COLORS.textDark,
    lineHeight: 20,
  },
  postStats: {
    flexDirection: "row",
    marginTop: 10,
    gap: 16,
  },
  postStat: {
    fontSize: 12,
    color: COLORS.textGray,
  },
  noResults: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textDark,
    marginTop: 12,
  },
  noResultsHint: {
    fontSize: 14,
    color: COLORS.textPlaceholder,
    marginTop: 4,
  },
  eventCard: {
    backgroundColor: COLORS.background,
    padding: 14,
    marginBottom: 12,
    borderRadius: 8,
  },
  eventCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eventPhoto: {
    width: 64,
    height: 64,
  },
  eventPhotoPlaceholder: {
    width: 64,
    height: 64,
    backgroundColor: COLORS.accentCoral,
    alignItems: "center",
    justifyContent: "center",
  },
  eventTitle: {
    fontWeight: "600",
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  eventDate: {
    color: COLORS.textGray,
    fontSize: 13,
    marginTop: 2,
  },
  eventBusiness: {
    color: COLORS.primaryDark,
    fontSize: 12,
    marginTop: 2,
  },
  eventActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  attendeesBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.primaryTintDark,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  attendeesText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primaryDark,
  },
  activityCard: {
    backgroundColor: COLORS.background,
    padding: 14,
    marginBottom: 12,
    borderRadius: 8,
  },
  activityCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activityPhoto: {
    width: 64,
    height: 64,
  },
  activityPhotoPlaceholder: {
    width: 64,
    height: 64,
    backgroundColor: COLORS.accentViolet,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTitle: {
    fontWeight: "600",
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  activityDate: {
    color: COLORS.textGray,
    fontSize: 13,
    marginTop: 2,
  },
  activityLocation: {
    color: COLORS.primaryDark,
    fontSize: 12,
    marginTop: 2,
  },
  activityActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 10,
  },
  rsvpBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rsvpText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.success,
  },
  artistCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mapSection: {
    height: Platform.OS === "web" ? "40%" : "33%",
    width: "100%",
  },
  recenterFab: {
    position: "absolute",
    right: SPACING.small,
    bottom: SPACING.small,
    width: Platform.OS === "web" ? 48 : 44,
    height: Platform.OS === "web" ? 48 : 44,
    borderRadius: Platform.OS === "web" ? 24 : 22,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.medium,
    zIndex: 10,
  },
  locationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundPage,
    alignSelf: "flex-start",
  },
  locationChipText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  tabScrollContent: {
    gap: 8,
    paddingHorizontal: 16,
  },
  sortRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  sortChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  sortChipText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  sortChipTextActive: {
    color: COLORS.background,
    fontWeight: "600",
  },
  clearDateButton: {
    padding: 4,
  },
  dateFilterButtonText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    fontWeight: "500",
    color: COLORS.primary,
    flex: 1,
  },
  categoryChipSection: {
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  categoryGridItem: {
    width: itemWidth,
    height: 80,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.borderGray,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryGridItemSelected: {
    borderColor: COLORS.textPrimary,
    backgroundColor: "rgba(17,24,39,0.05)",
  },
  categoryGridIcon: {
    marginBottom: 4,
  },
  categoryGridLabel: {
    fontSize: 12,
    color: COLORS.textDark,
  },
  categoryGridLabelSelected: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  categoryChipContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  categoryChipTextActive: {
    color: COLORS.background,
    fontWeight: "600",
  },
  subChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundPage,
  },
  subChipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  subChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.textMuted,
  },
  subChipTextActive: {
    color: COLORS.primary,
    fontWeight: "600",
  },
  businessMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  businessInfo: {
    flex: 1,
  },
  eventInfo: {
    flex: 1,
  },
  eventLocation: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  eventMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  activityInfo: {
    flex: 1,
  },
  activityMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  openBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  openBadgeOpen: {
    backgroundColor: COLORS.statusOpenBg,
  },
  openBadgeClosed: {
    backgroundColor: COLORS.statusClosedBg,
  },
  openBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  openBadgeTextOpen: {
    color: COLORS.statusOpenText,
  },
  openBadgeTextClosed: {
    color: COLORS.statusClosedText,
  },
  searchBarSection: {
    paddingHorizontal: SPACING.small,
    paddingTop: SPACING.small,
    paddingBottom: SPACING.tiny,
    backgroundColor: COLORS.background,
  },
  locationSearchDropdown: {
    marginTop: SPACING.tiny,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.subtle,
  },
  locationSearchBtn: {
    padding: SPACING.tiny,
    marginLeft: SPACING.tiny,
  },
  locationSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
    gap: SPACING.small,
  },
  locationSearchResults: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  locationSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.small,
  },
  locationSearchItemText: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  cardScrollView: {
    flex: 1,
  },
  cardScrollContent: {
    paddingBottom: SPACING.small,
  },
});

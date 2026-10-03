import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import DatePickerModal from "../../components/shared/DatePickerModal";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { entityRoutes, pushEntityRoute, getRentalNavigationId, showInvalidEntityAlert } from "../../lib/navigation/entityRoutes";
import LocatorCard from "../../components/locator/LocatorCard";
import LocatorHeader from "../../components/locator/LocatorHeader";
import ProgressivePicker from "../../components/navigation/ProgressivePicker";
import LocatorSidebar, { SIDEBAR_WIDTH } from "../../components/locator/LocatorSidebar";
import * as Location from "expo-location";
import { getCurrentPositionWithPermission } from "../../lib/locationPermission";
import { getLiveVehicles, LiveVehicle, searchBusStops, getBusesServing, ServingBus, createTaxiRequest, myTaxiRequests, cancelTaxiRequest, getTaxiPricing, getBusNetwork, BusNetwork, TaxiRequest, TaxiPricing } from "../../lib/api/mobility";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useMapBounds } from "../../context/MapBoundsContext";
import { getThemeColors, getThemeStyles, applyThemeToText } from "../../hooks/useThemeStyles";
import { useResponsiveLayout } from "../../hooks/useResponsiveLayout";
import {
  Business,
  createBusiness,
  CategoryGroup,
  getCategoryTree,
  getNearbyBusinesses,
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
import { translateCategory, translateJobType } from "../../lib/categoryTranslation";
import { CATEGORY_ICONS, subcategoryIcon, CATEGORY_COLORS, subcategoryColor } from "../../lib/categoryIcons";
import { sortCategoriesByLabel } from "../../lib/categoryTranslation";
import { isUpcomingEvent, isUpcomingActivity, EVENT_THEMES } from "../../lib/api/events";
import { formatDate } from "../../lib/formatDate";
import { isBusinessOpen } from "../../lib/openingHours";
import { ACTIVITY_CATEGORIES, ACTIVITY_TYPES, APP_URL } from "../../lib/api";
   import { toLocalISODate, addDays } from "../../lib/booking/dateRange";

const itemWidth = (Dimensions.get("window").width - 48) / 3;

type TabType = "hotels" | "businesses" | "events" | "activities" | "rentals" | "jobs" | "mobility";

interface DateFilter {
  startDate: string | null;
  endDate: string | null;
}

export default function LocatorScreen() {
  const { t, i18n } = useTranslation();
  const { isDesktop } = useResponsiveLayout();
  const { sessionToken, user, activeIdentity } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; root_category?: string }>();
  const { setMapBounds: setGlobalMapBounds, mapBounds, refreshKey } = useMapBounds();
  const { location: contextLocation, livePosition, setManualLocation, radiusKm } = useLocation();
  const [locateFocus, setLocateFocus] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locateToken, setLocateToken] = useState(0);
  const [locating, setLocating] = useState(false);
  const [mobilityMode, setMobilityMode] = useState<"bus" | "tram" | "taxi">("bus");
  const [liveVehicles, setLiveVehicles] = useState<LiveVehicle[]>([]);
  const [busQuery, setBusQuery] = useState("");
  const [busSuggestions, setBusSuggestions] = useState<any[]>([]);
  const [selectedStop, setSelectedStop] = useState<{ stop_id: string; name: string } | null>(null);
  const [servingBuses, setServingBuses] = useState<ServingBus[]>([]);
  const [taxiDestAddress, setTaxiDestAddress] = useState("");
  const [taxiDestLat, setTaxiDestLat] = useState<number | null>(null);
  const [taxiDestLng, setTaxiDestLng] = useState<number | null>(null);
  const [taxiDestSuggestions, setTaxiDestSuggestions] = useState<any[]>([]);
  const [taxiPricing, setTaxiPricingState] = useState<TaxiPricing | null>(null);
  const [myTaxiReq, setMyTaxiReq] = useState<TaxiRequest | null>(null);
  const [taxiRequesting, setTaxiRequesting] = useState(false);
  const [transitNetwork, setTransitNetwork] = useState<BusNetwork | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
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
    access_code: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { description: string; place_id: string }[]
  >([]);
  const [suggesting, setSuggesting] = useState(false);

  const [activeTab, setActiveTab] = useState<TabType>("businesses");
  const [businessAvailabilityFilter, setBusinessAvailabilityFilter] = useState<"all" | "open_now">("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Date filter state
  const [dateFilter, setDateFilter] = useState<DateFilter>({ startDate: null, endDate: null });
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
  const [rentalSearchQuery, setRentalSearchQuery] = useState("");
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [hotelSearchQuery, setHotelSearchQuery] = useState("");

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
    if (params.tab && ["hotels", "events", "activities", "businesses", "rentals", "jobs", "mobility"].includes(params.tab)) {
      setActiveTab(params.tab as TabType);
    }
    if (params.root_category) {
      setSelectedRoot(params.root_category);
    }
  }, [params.tab, params.root_category]);
   
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
     const nowLocal = toLocalISODate(new Date());
     return {
       startDate: nowLocal,
       endDate: addDays(nowLocal, 7),
     };
   };

  const visibleBusinesses = useMemo(() => {
    let result = businesses;
    // Filter by search query
    if (businessSearchQuery.trim()) {
      const query = businessSearchQuery.toLowerCase();
      result = result.filter(b => b.name.toLowerCase().includes(query));
    }
    return result;
  }, [businesses, businessSearchQuery]);

  const visibleHotels = useMemo(() => {
    let result = visibleBusinesses.filter(b => b.root_category === "local-hotels");
    if (hotelSearchQuery.trim()) {
      const query = hotelSearchQuery.toLowerCase();
      result = result.filter(h => h.name.toLowerCase().includes(query) || (h.address || "").toLowerCase().includes(query));
    }
    return result;
  }, [visibleBusinesses, hotelSearchQuery]);

   const visibleEvents = useMemo(() => {
     let result = events;
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
   }, [events, dateFilter, eventThemeFilter, eventSearchQuery]);

   const visibleActivities = useMemo(() => {
     let result = activities;
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
        result = result.filter(a => matchingTypeKeys.includes(a.theme ?? ""));
      }
     // Filter by search query
     if (activitySearchQuery.trim()) {
       const query = activitySearchQuery.toLowerCase();
       result = result.filter(a => a.title.toLowerCase().includes(query));
     }
     return result;
   }, [activities, dateFilter, activityCategoryFilter, activitySearchQuery]);
  
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

  const filteredRentals = useMemo(() => {
    let result = rentalTypeFilter ? rentals.filter(r => r.subcategory === rentalTypeFilter) : rentals;
    if (rentalSearchQuery.trim()) {
      const query = rentalSearchQuery.toLowerCase();
      result = result.filter(r =>
        (r.title || "").toLowerCase().includes(query) ||
        (r.address || "").toLowerCase().includes(query) ||
        (r.description || "").toLowerCase().includes(query)
      );
    }
    return result;
  }, [rentals, rentalTypeFilter, rentalSearchQuery]);

  const filteredJobs = useMemo(() => {
    let result = jobTypeFilter ? jobs.filter(j => j.root_category === jobTypeFilter) : jobs;
    if (jobSearchQuery.trim()) {
      const query = jobSearchQuery.toLowerCase();
      result = result.filter(j =>
        (j.title || "").toLowerCase().includes(query) ||
        (j.business_name || "").toLowerCase().includes(query) ||
        (j.location || "").toLowerCase().includes(query)
      );
    }
    return result;
  }, [jobs, jobTypeFilter, jobSearchQuery]);
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
    // Payments removed — all businesses are active.
    return t('locator.active');
  };

  const loadCategories = useCallback(async () => {
    const data = await getCategoryTree(sessionToken ?? "");
    setCategoryTree(data);
  }, [sessionToken]);

  const loadBusinesses = useCallback(async (centerLat: number, centerLng: number, bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }, openNow?: boolean, loadId?: number) => {
    const data = await getNearbyBusinesses(sessionToken ?? "",
      centerLat,
      centerLng,
      selectedRoot !== "All" ? selectedRoot : undefined,
      selectedSubcategory !== "All" ? selectedSubcategory : undefined,
      bounds,
    );
    if (loadId !== undefined && loadIdRef.current !== loadId) return;
    const filterOpen = openNow ?? businessAvailabilityFilter === "open_now";
    setBusinesses(filterOpen ? data.filter(isBusinessOpen) : data);
  }, [sessionToken, selectedRoot, selectedSubcategory, businessAvailabilityFilter]);

  const loadEvents = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }, loadId?: number) => {
    const data = await getEvents(sessionToken ?? "", undefined, undefined, bounds, {
      startAfter: dateFilter.startDate || undefined,
      startBefore: dateFilter.endDate || undefined,
      theme: eventThemeFilter || undefined,
    });
    if (loadId !== undefined && loadIdRef.current !== loadId) return;
    setEvents(data);
  }, [sessionToken, dateFilter, eventThemeFilter]);

  const loadActivities = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }, loadId?: number) => {
    const data = await getActivities(sessionToken ?? "", bounds, {
      date: dateFilter.startDate || undefined,
      category: activityCategoryFilter || undefined,
    });
    if (loadId !== undefined && loadIdRef.current !== loadId) return;
    setActivities(data);
  }, [sessionToken, dateFilter, activityCategoryFilter]);

  const loadRentals = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }, subcategoryFilter?: string | null, loadId?: number) => {
    const data = await getRentals(sessionToken ?? "", bounds, { subcategory: subcategoryFilter || undefined });
    if (loadId !== undefined && loadIdRef.current !== loadId) return;
    setRentals(data.rentals);
  }, [sessionToken]);

  const loadJobs = useCallback(async (bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }, loadId?: number) => {
    const data = await getJobs(
      sessionToken ?? "",
      bounds,
      selectedRoot !== "All"
        ? { rootCategory: selectedRoot, subcategory: selectedSubcategory !== "All" ? selectedSubcategory : undefined }
        : undefined
    );
    if (loadId !== undefined && loadIdRef.current !== loadId) return;
    setJobs(data.jobs);
  }, [sessionToken, selectedRoot, selectedSubcategory]);

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

  // "Locate me": use the device's exact GPS position (not the searched
  // city/point) and fly the map there.
  const handleLocateMe = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      // Safety timeout: never leave the button spinning forever (some
      // browsers hang the prompt / GPS indefinitely).
      const loc = await Promise.race([
        getCurrentPositionWithPermission(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
      ]);
      if (loc) {
        setLocateFocus({ latitude: loc.latitude, longitude: loc.longitude });
        setLocateToken((t) => t + 1);
        setManualLocation(loc.latitude, loc.longitude);
        const d = 0.02;
        setGlobalMapBounds({
          minLat: loc.latitude - d / 2,
          maxLat: loc.latitude + d / 2,
          minLng: loc.longitude - d / 2,
          maxLng: loc.longitude + d / 2,
          centerLat: loc.latitude,
          centerLng: loc.longitude,
        });
      } else if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(t("common.error") + "\n\n" + (t("locator.locationDenied") || "Location permission denied"));
      } else {
        Alert.alert(t("common.error"), t("locator.locationDenied") || "Location permission denied");
      }
    } catch (e) {
      console.warn("locate me failed:", e);
    } finally {
      setLocating(false);
    }
  }, [locating, setManualLocation, setGlobalMapBounds, t]);

  // Live mobility vehicles (buses/taxis) - polled while the Mobility tab
  // is open. The WebSocket channel integration can replace polling later.
  useEffect(() => {
    if (activeTab !== "mobility") return;
    let cancelled = false;
    const load = () => {
      getLiveVehicles(sessionToken)
        .then((vehicles) => {
          if (!cancelled) setLiveVehicles(vehicles || []);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab, sessionToken]);

  // Active transit network -> thin route lines on the map
  useEffect(() => {
    if (activeTab !== "mobility") return;
    let cancelled = false;
    getBusNetwork(sessionToken)
      .then((net) => {
        if (!cancelled) setTransitNetwork(net);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, sessionToken]);

  // Tram: deep red, Bus: dark blue. A selected line is highlighted while
  // the others fade out.
  const transitLines = useMemo(() => {
    if (!transitNetwork) return [];
    return transitNetwork.routes.map((r) => ({
      routeNumber: r.route_number,
      color: r.mode === "tram" ? "#8B0000" : "#1E3A8A",
      opacity: selectedLine ? (r.route_number === selectedLine ? 0.9 : 0.07) : 0.45,
      weight: selectedLine === r.route_number ? 3 : 2,
      points:
        Array.isArray((r as any).shape) && (r as any).shape.length > 2
          ? (r as any).shape.map((p: any) => ({ latitude: p[0], longitude: p[1] }))
          : r.stops.map((s) => ({ latitude: s.lat, longitude: s.lng })),
    }));
  }, [transitNetwork, selectedLine]);

  const selectedRoute = useMemo(() => {
    if (!transitNetwork || !selectedLine) return null;
    return transitNetwork.routes.find((r) => r.route_number === selectedLine) || null;
  }, [transitNetwork, selectedLine]);

  // Bus destination search (debounced)
  useEffect(() => {
    if (activeTab !== "mobility" || (mobilityMode !== "bus" && mobilityMode !== "tram") || busQuery.trim().length < 2) {
      setBusSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      searchBusStops(sessionToken, busQuery.trim())
        .then((res) => {
          if (!cancelled) setBusSuggestions(res || []);
        })
        .catch(() => {});
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, mobilityMode, busQuery, sessionToken]);

  // Refresh the serving-bus list while a destination is selected
  useEffect(() => {
    if (activeTab !== "mobility" || (mobilityMode !== "bus" && mobilityMode !== "tram") || !selectedStop) return;
    let cancelled = false;
    const load = () => {
      getBusesServing(
        sessionToken,
        selectedStop.stop_id,
        contextLocation?.latitude ?? null,
        contextLocation?.longitude ?? null
      )
        .then((res) => {
          if (!cancelled) setServingBuses(res || []);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab, mobilityMode, selectedStop, sessionToken, contextLocation?.latitude, contextLocation?.longitude]);

  // Taxi mode: load pricing and poll my active request
  useEffect(() => {
    if (activeTab !== "mobility" || mobilityMode !== "taxi" || !sessionToken) return;
    let cancelled = false;
    getTaxiPricing(sessionToken)
      .then((p) => {
        if (!cancelled) setTaxiPricingState(p);
      })
      .catch(() => {});
    const loadMine = () => {
      myTaxiRequests(sessionToken)
        .then((list) => {
          if (cancelled) return;
          const active = list.find((r) => r.status === "requested" || r.status === "accepted");
          setMyTaxiReq(active || null);
        })
        .catch(() => {});
    };
    loadMine();
    const interval = setInterval(loadMine, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab, mobilityMode, sessionToken]);

  // Taxi destination suggestions (Google autocomplete)
  useEffect(() => {
    if (activeTab !== "mobility" || mobilityMode !== "taxi" || taxiDestAddress.trim().length < 3) {
      setTaxiDestSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          taxiDestAddress.trim()
        )}&key=${googleKey}&language=${encodeURIComponent(i18n.language || "en")}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled) setTaxiDestSuggestions(data.predictions || []);
      } catch {
        if (!cancelled) setTaxiDestSuggestions([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeTab, mobilityMode, taxiDestAddress, googleKey, i18n.language]);

  const selectTaxiDestination = async (suggestion: { description: string; place_id: string }) => {
    setTaxiDestAddress(suggestion.description);
    setTaxiDestSuggestions([]);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
        suggestion.place_id
      )}&key=${googleKey}&language=${encodeURIComponent(i18n.language || "en")}`;
      const res = await fetch(url);
      const data = await res.json();
      const loc = data.result?.geometry?.location;
      if (loc) {
        setTaxiDestLat(loc.lat);
        setTaxiDestLng(loc.lng);
      }
    } catch {}
  };

  const submitTaxiRequest = async () => {
    if (
      !sessionToken ||
      taxiRequesting ||
      contextLocation == null ||
      taxiDestLat == null ||
      taxiDestLng == null
    ) {
      return;
    }
    setTaxiRequesting(true);
    try {
      const req = await createTaxiRequest(sessionToken, {
        pickup_address: locationName || undefined,
        pickup_lat: contextLocation.latitude,
        pickup_lng: contextLocation.longitude,
        destination_address: taxiDestAddress || undefined,
        destination_lat: taxiDestLat,
        destination_lng: taxiDestLng,
      });
      setMyTaxiReq(req);
    } catch (e) {
      console.warn("taxi request failed:", e);
    } finally {
      setTaxiRequesting(false);
    }
  };

  const cancelMyTaxiReq = async () => {
    if (!sessionToken || !myTaxiReq) return;
    try {
      await cancelTaxiRequest(sessionToken, myTaxiReq.request_id);
      setMyTaxiReq({ ...myTaxiReq, status: "cancelled" });
    } catch (e) {
      console.warn("cancel failed:", e);
    }
  };

  const taxiEstimate = useMemo(() => {
    if (
      contextLocation == null ||
      taxiDestLat == null ||
      taxiDestLng == null ||
      !taxiPricing
    ) {
      return null;
    }
    const R = 6371;
    const dLat = ((taxiDestLat - contextLocation.latitude) * Math.PI) / 180;
    const dLng = ((taxiDestLng - contextLocation.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((contextLocation.latitude * Math.PI) / 180) *
        Math.cos((taxiDestLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const straight = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const roadKm = straight * 1.3;
    const duration = Math.max(3, Math.round((roadKm / 25) * 60));
    const fare = Math.max(taxiPricing.minimum, taxiPricing.base_fare + roadKm * taxiPricing.per_km);
    return { distanceKm: roadKm, durationMin: duration, fareMin: fare, fareMax: fare * 1.15 };
  }, [contextLocation, taxiDestLat, taxiDestLng, taxiPricing]);

  const requestIdRef = useRef(0);
  const loadIdRef = useRef(0);

  useEffect(() => {
    if (!mapBounds) return;
    // Mobility doesn't load business/event data - it polls live vehicles.
    if (activeTab === "mobility") return;
    const currentRequestId = ++requestIdRef.current;
    const loadId = ++loadIdRef.current;
    const timer = setTimeout(() => {
      if (currentRequestId !== requestIdRef.current) return;
      loadBusinesses(mapBounds.centerLat, mapBounds.centerLng, mapBounds, undefined, loadId);
      if (activeTab === "businesses" && selectedRoot === "rental-real-estate") {
        loadRentals(mapBounds, rentalTypeFilter, loadId);
      }
      if (activeTab === "rentals") {
        loadRentals(mapBounds, rentalTypeFilter, loadId);
      }
      if (activeTab === "jobs") {
        loadJobs(mapBounds, loadId);
      }
      if (activeTab === "events") {
        loadEvents(mapBounds, loadId);
      }
      if (activeTab === "activities") {
        loadActivities(mapBounds, loadId);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mapBounds, sessionToken, refreshKey, selectedRoot, selectedSubcategory, activeTab, rentalTypeFilter, dateFilter, loadEvents, loadActivities, loadJobs, loadRentals]);



  useEffect(() => {
    setLoading(true);
    loadCategories().finally(() => setLoading(false));
  }, [loadCategories]);

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

  useEffect(() => {
    if (!mapBounds) return;
    // Immediately reload when the availability filter changes (both directions)
    loadBusinesses(mapBounds.centerLat, mapBounds.centerLng, mapBounds);
    // While "Open now" is active, keep refreshing periodically since open state changes over time
    if (businessAvailabilityFilter !== "open_now") return;
    const interval = setInterval(() => {
      loadBusinesses(mapBounds.centerLat, mapBounds.centerLng, mapBounds);
    }, 60000);
    return () => clearInterval(interval);
  }, [businessAvailabilityFilter, mapBounds, loadBusinesses]);

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
      )}&key=${googleKey}&language=${encodeURIComponent(i18n.language || "en")}`;
      const response = await fetch(url);
      const data = await response.json();
      setSuggestions(data.predictions || []);
    } catch (error) {
      setSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  };

  // WhatsApp share for business
  const shareBusinessToWhatsApp = async (business: Business) => {
    const businessUrl = `${APP_URL}/share/business/${(business as any).slug || business.business_id}`;
    
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
     if (form.access_code.trim().toLowerCase() !== "perix pro") {
       if (Platform.OS === "web" && typeof window !== "undefined") {
         window.alert(t("business.accessCodeInvalid", "Invalid access code. The business access code is required to create a business profile."));
       } else {
         Alert.alert(t("common.error", "Error"), t("business.accessCodeInvalid", "Invalid access code. The business access code is required to create a business profile."));
       }
       return;
     }
     const latitude = form.latitude ?? contextLocation.latitude;
     const longitude = form.longitude ?? contextLocation.longitude;
    const newBusiness = await createBusiness(sessionToken, {
      name: form.name,
      root_category: form.root_category,
      subcategory: form.subcategory,
      description: form.description,
      address: form.address,
      access_code: form.access_code.trim(),
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
      access_code: "",
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
      )}&key=${googleKey}&language=${encodeURIComponent(i18n.language || "en")}`;
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

  const pickerAccent =
    activeTab === "events" || activeTab === "activities" ? "#FF9F1C"
      : activeTab === "businesses" || activeTab === "jobs" ? "#264348"
        : "#59ABE3";

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Bar */}
      <View style={styles.searchBarSection}>
        <View style={styles.searchInputContainer}>
          {!isDesktop && (
            <Pressable onPress={() => setSidebarOpen(true)} style={{ paddingRight: 4 }}>
              <Ionicons name="menu" size={20} color="#264348" />
            </Pressable>
          )}
          <Ionicons name="search" size={18} color="#264348" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === "businesses" ? t('business.searchBusinesses')
              : activeTab === "events" ? t('events.searchEvents')
              : activeTab === "activities" ? t('activities.searchActivities')
              : activeTab === "rentals" ? t('rentals.searchRentals', "Search rentals...")
              : activeTab === "jobs" ? t('jobs.searchJobs', "Search jobs...")
              : t('home.searchHotels', "Search hotels...")
            }
            placeholderTextColor="#264348"
            value={
              activeTab === "businesses" ? businessSearchQuery
              : activeTab === "events" ? eventSearchQuery
              : activeTab === "activities" ? activitySearchQuery
              : activeTab === "rentals" ? rentalSearchQuery
              : activeTab === "jobs" ? jobSearchQuery
              : hotelSearchQuery
            }
            onChangeText={
              activeTab === "businesses" ? setBusinessSearchQuery
              : activeTab === "events" ? setEventSearchQuery
              : activeTab === "activities" ? setActivitySearchQuery
              : activeTab === "rentals" ? setRentalSearchQuery
              : activeTab === "jobs" ? setJobSearchQuery
              : setHotelSearchQuery
            }
          />
          {(businessSearchQuery || eventSearchQuery || activitySearchQuery || rentalSearchQuery || jobSearchQuery || hotelSearchQuery) ? (
            <Pressable onPress={() => { setBusinessSearchQuery(""); setEventSearchQuery(""); setActivitySearchQuery(""); setRentalSearchQuery(""); setJobSearchQuery(""); setHotelSearchQuery(""); }}>
              <Ionicons name="close-circle" size={18} color="#264348" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Sidebar + Content */}
      <View style={styles.sidebarLayout}>
        {isDesktop || sidebarOpen ? (
          <LocatorSidebar
            categories={categoryTree}
            selectedRoot={selectedRoot}
            selectedSubcategory={selectedSubcategory}
            onSelectRoot={(slug) => {
              setSelectedRoot(slug);
              setSelectedSubcategory("All");
              // Switching the category switches the visible content type so
              // results always match the selected category.
              if (slug === "local-hotels") {
                setActiveTab("hotels");
              } else if (slug === "rentals" || slug === "rental-real-estate") {
                setActiveTab("rentals");
              } else if (slug !== "All") {
                setActiveTab("businesses");
              }
            }}
            onSelectSubcategory={setSelectedSubcategory}
            onClose={!isDesktop ? () => setSidebarOpen(false) : undefined}
          />
        ) : null}
        {!isDesktop && sidebarOpen && (
          <Pressable style={styles.sidebarOverlay} onPress={() => setSidebarOpen(false)} />
        )}

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#264348" />}
        >
          {/* Map Section */}
          <View style={styles.mapSection}>
        <BusinessMap
          initialRegion={{
            latitude: mapBounds?.centerLat ?? contextLocation?.latitude ?? 52.52,
            longitude: mapBounds?.centerLng ?? contextLocation?.longitude ?? 13.405,
            latitudeDelta: mapBounds ? (mapBounds.maxLat - mapBounds.minLat) : 0.05,
            longitudeDelta: mapBounds ? (mapBounds.maxLng - mapBounds.minLng) : 0.05,
          }}
          pinLocation={locateFocus ?? (livePosition ? { latitude: livePosition.latitude, longitude: livePosition.longitude } : null)}
          userPinImage={activeIdentity?.type === "business" ? (activeIdentity as any).avatar || undefined : (user?.profile_photo || user?.picture || undefined)}
          focusRegion={locateFocus ? { latitude: locateFocus.latitude, longitude: locateFocus.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 } : undefined}
          focusToken={locateToken || undefined}
          businesses={activeTab === "businesses" ? visibleBusinesses : activeTab === "hotels" ? visibleHotels : []}
          events={activeTab === "events" ? events : []}
          activities={activeTab === "activities" ? activities : []}
          rentals={
            activeTab === "rentals" ||
            (activeTab === "businesses" && selectedRoot === "rental-real-estate")
              ? rentals
              : []
          }
          jobs={activeTab === "jobs" ? jobs : []}
          extraMarkers={
            activeTab === "mobility"
              ? liveVehicles
                  .filter((v) => v.mode === mobilityMode && v.latitude != null && v.longitude != null)
                  .map((v) => {
                    return {
                      id: v.vehicle_id,
                      latitude: v.latitude!,
                      longitude: v.longitude!,
                      title:
                        v.mode !== "taxi"
                          ? `${v.route_number || v.fleet_number} → ${v.route_direction || ""}`
                          : v.name,
                      description: v.estimated ? "Estimated" : v.status,
                      type: (v.mode === "taxi" ? "taxi" : "bus") as "bus" | "taxi",
                      pinColor: v.mode === "bus" ? "#1E3A8A" : v.mode === "tram" ? "#8B0000" : "#FFC400",
                      heading: v.heading ?? null,
                      estimated: v.estimated ?? false,
                    };
                  })
              : undefined
          }
          transitLines={activeTab === "mobility" && (mobilityMode === "bus" || mobilityMode === "tram") ? transitLines : undefined}
          onTransitLineClick={(routeNumber) => {
            setSelectedLine((prev) => (prev === routeNumber ? null : routeNumber));
          }}
          showUserLocation
          onRegionChangeComplete={handleMapRegionChange}
          onMarkerPress={(id) => {
            if (activeTab === "mobility") return;
            if (activeTab === "businesses") {
              const rental = rentals.find(r => r.rental_id === id);
              if (rental) {
                const navId = getRentalNavigationId(rental as any) as any;
                const route = (rental as any).source_type === "owner" ? entityRoutes.listing(navId) : entityRoutes.rental(navId);
                pushEntityRoute(router, route, () => showInvalidEntityAlert(t)); return;
              }
              router.push(`/business/${id}` as any); return;
            }
            if (activeTab === "rentals") {
              const rental = rentals.find(r => r.rental_id === id);
              if (rental && (rental as any).source_type === "owner") {
                pushEntityRoute(router, entityRoutes.listing((rental as any).listing_id || id), () => showInvalidEntityAlert(t)); return;
              }
              pushEntityRoute(router, entityRoutes.rental(id), () => showInvalidEntityAlert(t)); return;
            }
            if (activeTab === "jobs") { pushEntityRoute(router, entityRoutes.job(id), () => showInvalidEntityAlert(t)); return; }
            if (activeTab === "events") { router.push(`/event/${id}` as any); return; }
            if (activeTab === "activities") { router.push(`/activity/${id}` as any); return; }
          }}
        />
        <Pressable style={styles.locateMeButton} onPress={handleLocateMe} disabled={locating}>
          <Ionicons name={locating ? "hourglass-outline" : "locate"} size={20} color="#096BFF" />
        </Pressable>
      </View>

      {/* Segment Tabs */}
      <LocatorHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        locationName={locationName}
        t={t}
      />

      {/* Mobility: Bus/Taxi live view */}
      {activeTab === "mobility" && (
        <View style={styles.mobilityPanel}>
          <View style={styles.mobilityToggle}>
            <Pressable
              style={[styles.mobilityToggleOption, mobilityMode === "bus" && styles.mobilityToggleOptionActive]}
              onPress={() => setMobilityMode("bus")}
            >
              <Ionicons name="bus" size={16} color={mobilityMode === "bus" ? "#fff" : "#264348"} />
              <Text style={[styles.mobilityToggleText, mobilityMode === "bus" && styles.mobilityToggleTextActive]}>
                {t("mobility.bus", "Bus")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.mobilityToggleOption, mobilityMode === "tram" && styles.mobilityToggleOptionActive]}
              onPress={() => setMobilityMode("tram")}
            >
              <Ionicons name="train" size={16} color={mobilityMode === "tram" ? "#fff" : "#264348"} />
              <Text style={[styles.mobilityToggleText, mobilityMode === "tram" && styles.mobilityToggleTextActive]}>
                {t("mobility.tram", "Tram")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.mobilityToggleOption, mobilityMode === "taxi" && styles.mobilityToggleOptionActive]}
              onPress={() => setMobilityMode("taxi")}
            >
              <Ionicons name="car" size={16} color={mobilityMode === "taxi" ? "#fff" : "#264348"} />
              <Text style={[styles.mobilityToggleText, mobilityMode === "taxi" && styles.mobilityToggleTextActive]}>
                {t("mobility.taxi", "Taxi")}
              </Text>
            </Pressable>
          </View>

          {selectedRoute && (mobilityMode === "bus" || mobilityMode === "tram") && (
            <View style={styles.linePanel}>
              <View style={styles.linePanelHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linePanelTitle}>
                    {selectedRoute.route_number} · {selectedRoute.name}
                  </Text>
                  <Text style={styles.linePanelHint}>
                    {t("mobility.lineStopsHint", "Tap a stop to see live arrivals")}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedLine(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={22} color="#264348" />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {selectedRoute.stops.map((s, i) => (
                  <Pressable
                    key={`${s.stop_id}-${i}`}
                    style={styles.lineStopRow}
                    onPress={() => {
                      setSelectedStop({ stop_id: s.stop_id, name: s.name });
                      setBusQuery(s.name);
                      setBusSuggestions([]);
                    }}
                  >
                    <View style={styles.lineStopNum}>
                      <Text style={styles.lineStopNumText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.lineStopName} numberOfLines={1}>{s.name}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {(mobilityMode === "bus" || mobilityMode === "tram") && (
            <View style={styles.busSearchWrap}>
              <View style={styles.busSearchBar}>
                <Ionicons name="search" size={16} color="#264348" />
                <TextInput
                  style={styles.busSearchInput}
                  value={busQuery}
                  onChangeText={(text) => {
                    setBusQuery(text);
                    if (selectedStop) {
                      setSelectedStop(null);
                      setServingBuses([]);
                    }
                  }}
                  placeholder={t("mobility.whereToGo", "Where do you want to go?")}
                  placeholderTextColor="#9CA3AF"
                />
                {selectedStop ? (
                  <Pressable
                    onPress={() => {
                      setSelectedStop(null);
                      setServingBuses([]);
                      setBusQuery("");
                    }}
                  >
                    <Ionicons name="close-circle" size={16} color="#264348" />
                  </Pressable>
                ) : null}
              </View>
              {busSuggestions.length > 0 && !selectedStop && (
                <View style={styles.busSuggestions}>
                  {busSuggestions.map((s) => (
                    <Pressable
                      key={s.stop_id}
                      style={styles.busSuggestionRow}
                      onPress={() => {
                        setSelectedStop({ stop_id: s.stop_id, name: s.name });
                        setBusQuery(s.name);
                        setBusSuggestions([]);
                      }}
                    >
                      <Ionicons name="location-outline" size={14} color="#59ABE3" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.busSuggestionName}>{s.name}</Text>
                        <Text style={styles.busSuggestionRoutes}>
                          {s.routes.map((r: any) => r.route_number).join(", ")}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {selectedStop && (mobilityMode === "bus" || mobilityMode === "tram") ? (
            <View>
              <Text style={styles.mobilityHeading}>
                {t("mobility.toward", "Buses going toward")} {selectedStop.name}
              </Text>
              {servingBuses.length === 0 ? (
                <Text style={styles.mobilityEmptyText}>
                  {t("mobility.noBusesServing", "No live buses on this route right now")}
                </Text>
              ) : (
                servingBuses.map((b) => (
                  <View key={b.vehicle_id} style={styles.mobilityRow}>
                    <View style={[styles.mobilityRowIcon, { backgroundColor: "#59ABE3" }]}>
                      <Ionicons name="bus" size={16} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mobilityRowTitle}>
                        {b.route_number} → {b.route_direction}
                      </Text>
                      <Text style={styles.mobilityRowSub}>
                        {b.distance_to_bus_m != null
                          ? `${b.distance_to_bus_m < 1000 ? b.distance_to_bus_m + " m" : (b.distance_to_bus_m / 1000).toFixed(1) + " km"} · `
                          : ""}
                        {t("mobility.eta", "Arrives ~{{n}} min", { n: b.eta_minutes })}
                        {b.delay_minutes > 0 ? ` · ${t("mobility.delay", "+{{n}} min", { n: b.delay_minutes })}` : ""}
                        {" · "}
                        {t("mobility.estimated", "Estimated")}
                      </Text>
                    </View>
                    <Text style={styles.mobilityEta}>{b.eta_minutes}′</Text>
                  </View>
                ))
              )}
            </View>
          ) : (
            <>
          {mobilityMode === "taxi" && (
            <View style={styles.taxiCard}>
              <View style={styles.taxiRow}>
                <Ionicons name="person" size={16} color="#22C55E" />
                <Text style={styles.taxiField} numberOfLines={1}>
                  {t("mobility.taxiPickup", "Pickup")}: {locationName || t("mobility.taxiMyLocation", "My location")}
                </Text>
              </View>
              <View style={styles.taxiRow}>
                <Ionicons name="navigate" size={16} color="#EF4444" />
                <TextInput
                  style={styles.taxiInput}
                  value={taxiDestAddress}
                  onChangeText={(text) => {
                    setTaxiDestAddress(text);
                    setTaxiDestLat(null);
                    setTaxiDestLng(null);
                  }}
                  placeholder={t("mobility.taxiDestination", "Where to?")}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              {taxiDestSuggestions.length > 0 && (
                <View style={styles.busSuggestions}>
                  {taxiDestSuggestions.map((s) => (
                    <Pressable
                      key={s.place_id}
                      style={styles.busSuggestionRow}
                      onPress={() => selectTaxiDestination(s)}
                    >
                      <Ionicons name="location-outline" size={14} color="#FFC400" />
                      <Text style={styles.busSuggestionName} numberOfLines={1}>
                        {s.description}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {taxiEstimate && (
                <Text style={styles.taxiEstimate}>
                  {t("mobility.taxiApprox", "Approx.")} {taxiEstimate.distanceKm.toFixed(1)} km · ~{taxiEstimate.durationMin} min ·{" "}
                  {taxiPricing?.currency === "EUR" ? "€" : ""}
                  {taxiEstimate.fareMin.toFixed(0)}–{taxiEstimate.fareMax.toFixed(0)}
                </Text>
              )}
              <Text style={styles.taxiHint}>
                {t("mobility.taxiNoPayment", "No payment through Perix - the final fare is set by the taxi meter / operator tariff.")}
              </Text>
              <Pressable
                style={[styles.taxiRequestButton, (taxiRequesting || taxiDestLat == null) && { opacity: 0.6 }]}
                onPress={submitTaxiRequest}
                disabled={taxiRequesting || taxiDestLat == null}
              >
                {taxiRequesting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.taxiRequestButtonText}>{t("mobility.taxiRequest", "Request taxi")}</Text>
                )}
              </Pressable>
            </View>
          )}

          {myTaxiReq && (
            <View style={[styles.taxiCard, styles.taxiStatusCard]}>
              <Text style={styles.taxiStatusTitle}>
                {myTaxiReq.status === "requested"
                  ? t("mobility.taxiRequested", "Request sent - waiting for confirmation...")
                  : myTaxiReq.status === "accepted"
                  ? t("mobility.taxiAccepted", "Taxi confirmed ✓")
                  : myTaxiReq.status === "declined"
                  ? t("mobility.taxiDeclined", "The company could not accept your request")
                  : t("mobility.taxiCancelled", "Request cancelled")}
              </Text>
              {myTaxiReq.status === "accepted" && (
                <Text style={styles.taxiStatusSub}>
                  🚕 {t("mobility.taxiArriving", "Taxi arriving in ~{{n}} min", { n: myTaxiReq.vehicle_eta_minutes ?? "…" })}
                  {myTaxiReq.vehicle_distance_m != null
                    ? ` · ${myTaxiReq.vehicle_distance_m < 1000 ? myTaxiReq.vehicle_distance_m + " m" : (myTaxiReq.vehicle_distance_m / 1000).toFixed(1) + " km"}`
                    : ""}
                </Text>
              )}
              {(myTaxiReq.status === "requested" || myTaxiReq.status === "accepted") && (
                <Pressable style={styles.taxiCancelButton} onPress={cancelMyTaxiReq}>
                  <Text style={styles.taxiCancelButtonText}>{t("common.cancel", "Cancel")}</Text>
                </Pressable>
              )}
            </View>
          )}

          {liveVehicles.filter((v) => v.mode === mobilityMode).length === 0 ? (
            <View style={styles.mobilityEmpty}>
              <Ionicons
                name={mobilityMode === "bus" ? "bus-outline" : mobilityMode === "tram" ? "train-outline" : "car-outline"}
                size={32}
                color="#9ca3af"
              />
              <Text style={styles.mobilityEmptyText}>
                {t("mobility.noVehicles", "No live vehicles right now")}
              </Text>
            </View>
          ) : (
            liveVehicles
              .filter((v) => v.mode === mobilityMode)
              .map((v) => {
                const dist =
                  contextLocation && v.latitude != null && v.longitude != null
                    ? haversineDistance(contextLocation.latitude, contextLocation.longitude, v.latitude, v.longitude)
                    : null;
                const color = v.mode === "bus" ? "#59ABE3" : v.mode === "tram" ? "#7B3FF2" : "#FFC400";
                const icon = v.mode === "bus" ? "bus" : v.mode === "tram" ? "train" : "car";
                return (
                  <View key={v.vehicle_id} style={styles.mobilityRow}>
                    <View style={[styles.mobilityRowIcon, { backgroundColor: v.estimated ? "#C8CBD1" : color }]}>
                      <Ionicons name={icon as any} size={16} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mobilityRowTitle}>
                        {v.mode !== "taxi"
                          ? `${v.route_number || v.fleet_number} → ${v.route_direction || ""}`
                          : v.name}
                      </Text>
                      <Text style={styles.mobilityRowSub}>
                        {dist != null
                          ? `${dist < 1 ? Math.round(dist * 1000) + " m" : dist.toFixed(1) + " km"} · `
                          : ""}
                        {v.estimated
                          ? t("mobility.estimated", "Estimated")
                          : t("mobility.status." + v.status, v.status)}
                      </Text>
                    </View>
                  </View>
                );
              })
          )}
            </>
          )}
        </View>
      )}

      {/* Filter Picker Rows */}
      {activeTab === "businesses" && (
        <>
          <ProgressivePicker
            label={t("common.filter", "Filter")}
            value={selectedRoot === "All" ? "All" : selectedRoot}
            options={[
              { key: "All", label: t("common.all", "Alle Kategorien") },
              ...sortCategoriesByLabel(categoryTree, t).map((cat) => ({ key: cat.slug, label: translateCategory(cat.slug, t), icon: (CATEGORY_ICONS[cat.slug] || "grid") as any, iconColor: CATEGORY_COLORS[cat.slug] })),
            ]}
            onChange={(key) => { setSelectedRoot(key); setSelectedSubcategory("All"); }}
            primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
          />
          {selectedRoot !== "All" && businessSubcategories.length > 0 && (
            <ProgressivePicker
              label={t("common.subcategory", "Kategorie")}
              value={selectedSubcategory === "All" ? "All" : selectedSubcategory}
              options={[
                { key: "All", label: t("common.allSubcategories", "Alle Unterkategorien") },
                ...sortCategoriesByLabel(businessSubcategories, t).map((sub: any) => ({ key: sub.slug, label: translateCategory(sub.slug, t), icon: (subcategoryIcon(sub.slug) || "grid") as any, iconColor: subcategoryColor(sub.slug, selectedRoot) })),
              ]}
              onChange={(key) => setSelectedSubcategory(key === "All" ? "All" : key)}
              primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
            />
          )}
          <View style={styles.openNowToggle}>
            <Pressable
              style={[styles.openNowBtn, businessAvailabilityFilter === "all" && styles.openNowBtnActive]}
              onPress={() => setBusinessAvailabilityFilter("all")}
            >
              <Text style={[styles.openNowText, businessAvailabilityFilter === "all" && styles.openNowTextActive]}>
                {t("common.all", "All")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.openNowBtn, businessAvailabilityFilter === "open_now" && styles.openNowBtnActive]}
              onPress={() => setBusinessAvailabilityFilter("open_now")}
            >
              <Text style={[styles.openNowText, businessAvailabilityFilter === "open_now" && styles.openNowTextActive]}>
                {t("common.openNow", "Open now")}
              </Text>
            </Pressable>
          </View>
        </>
      )}
      {activeTab === "hotels" && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
          <Text style={{ fontSize: 13, color: "#264348" }}>
            {t("home.hotels", "Local Hotels")} — {visibleHotels.length} {t("tabs.hotels", "Hotels")}
          </Text>
        </View>
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
            primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
          />
          <ProgressivePicker
            label={t("common.date", "Datum")}
            value={dateFilter.startDate ?? "this-week"}
            displayValue={dateFilter.startDate ? `${formatDate(dateFilter.startDate)} → ${dateFilter.endDate ? formatDate(dateFilter.endDate) : "..."}` : t("common.thisWeek", "Diese Woche")}
            onPressOverride={() => setShowCalendar(true)}
            options={[{ key: "this-week" as any, label: t("common.thisWeek", "Diese Woche") }]}
            onChange={() => {}}
            primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
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
              ...Object.entries(ACTIVITY_CATEGORIES).map(([key, cat]: [string, any]) => ({ key, label: t(`activities.themes.categories.${key}`, cat.label) as string })),
            ]}
            onChange={(key) => setActivityCategoryFilter(key === "All" ? null : key)}
            primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
          />
          <ProgressivePicker
            label={t("common.date", "Datum")}
            value={dateFilter.startDate ?? "this-week"}
            displayValue={dateFilter.startDate ? `${formatDate(dateFilter.startDate)} → ${dateFilter.endDate ? formatDate(dateFilter.endDate) : "..."}` : t("common.thisWeek", "Diese Woche")}
            onPressOverride={() => setShowCalendar(true)}
            options={[{ key: "this-week" as any, label: t("common.thisWeek", "Diese Woche") }]}
            onChange={() => {}}
            primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
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
          primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
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
          primaryColor={pickerAccent}
            mutedColor="#264348"
            textColor="#264348"
            borderColor="rgba(38,67,72,0.25)"
        />
      )}

      {/* Card List */}
      <View style={styles.listContainer}>
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

        {/* Hotel List */}
        {activeTab === "hotels" && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>{visibleHotels.length} {t("tabs.hotels", "Hotels")}</Text>
            {visibleHotels.length === 0 ? (
              <EmptyState icon="bed" message={t("home.noHotels", "No hotels nearby")} size="default" muted />
            ) : visibleHotels.map((business) => {
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
                    cover_image: rental.cover_image,
                    logo_image: rental.business_logo,
                    profile_photo: rental.cover_image,
                    description: rental.description,
                  } as any}
                  videoUrl={(rental as any).video_url || undefined}
                  distance={dist !== null ? formatDistance(dist) : null}
                  isOpen={null}
                  onPress={() => {
                    const navId = getRentalNavigationId(rental as any) as any;
                    const route = (rental as any).source_type === "owner" ? entityRoutes.listing(navId) : entityRoutes.rental(navId);
                    pushEntityRoute(router, route, () => showInvalidEntityAlert(t));
                  }}
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
                    subcategory: translateJobType(job.job_type, t) || t("jobs.fullTime", "Vollzeit"),
                    address: job.location,
                    latitude: job.latitude,
                    longitude: job.longitude,
                    cover_image: job.cover_image,
                    logo_image: job.business_logo,
                    profile_photo: job.cover_image,
                    description: job.description,
                  } as any}
                  videoUrl={job.video_url || undefined}
                  distance={dist !== null ? formatDistance(dist) : null}
                  isOpen={null}
                  onPress={() => pushEntityRoute(router, entityRoutes.job(job.job_id), () => showInvalidEntityAlert(t))}
                />
              );
            })}
          </View>
        )}

        <View style={{ height: 110 }} />
      </View>
      </ScrollView>

      {/* Calendar Modal */}
      <DatePickerModal
        visible={showCalendar}
        onClose={() => setShowCalendar(false)}
        mode="range"
        value={{ startDate: dateFilter.startDate, endDate: dateFilter.endDate }}
        onApply={(v) => setDateFilter(v)}
        onReset={() => { setDateFilter({ startDate: null, endDate: null }); }}
        title={t("home.eventsCalendar", "Select Dates")}
        accentColor="#FF9F1C"
      />

      <Modal visible={categoryModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('locator.selectCategory')}</Text>
            <Pressable onPress={() => setCategoryModal(false)}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
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
            <TextInput
              style={styles.input}
              value={form.access_code}
              onChangeText={(v) => setForm((prev) => ({ ...prev, access_code: v }))}
              placeholder={t("business.accessCodeLabel", "Business access code")}
              placeholderTextColor="#9ca3af"
            />
            <Pressable style={styles.primaryButton} onPress={handleAddBusiness}>
              <Text style={styles.primaryButtonText}>{t('locator.saveBusiness')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      
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
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: SIDEBAR_WIDTH,
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
    color: "#264348",
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
    color: "#264348",
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
    color: "#264348",
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
    width: "100%",
    position: "relative",
  },
  mobilityPanel: { paddingHorizontal: 16, paddingBottom: 12 },
  mobilityToggle: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
  },
  mobilityToggleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  mobilityToggleOptionActive: { backgroundColor: "#264348" },
  mobilityToggleText: { fontSize: 14, fontWeight: "600", color: "#264348" },
  mobilityToggleTextActive: { color: "#fff" },
  mobilityEmpty: { alignItems: "center", paddingVertical: 28, gap: 8 },
  mobilityEmptyText: { fontSize: 14, color: "#6b7280" },
  mobilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    padding: 12,
    marginBottom: 8,
  },
  mobilityRowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  mobilityRowTitle: { fontSize: 15, fontWeight: "700", color: "#264348" },
  mobilityRowSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  mobilityEta: { fontSize: 18, fontWeight: "800", color: "#59ABE3" },
  mobilityHeading: { fontSize: 14, fontWeight: "700", color: "#264348", marginBottom: 8 },
  busSearchWrap: { marginBottom: 10 },
  busSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    paddingHorizontal: 12,
    height: 44,
  },
  busSearchInput: { flex: 1, fontSize: 15, color: "#264348" },
  busSuggestions: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    marginTop: 6,
    overflow: "hidden",
  },
  busSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E7EAF0",
  },
  busSuggestionName: { fontSize: 14, fontWeight: "600", color: "#264348" },
  busSuggestionRoutes: { fontSize: 12, color: "#59ABE3", marginTop: 1 },
  linePanel: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    padding: 12,
    marginBottom: 10,
    maxHeight: 260,
  },
  linePanelHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  linePanelTitle: { fontSize: 15, fontWeight: "700", color: "#264348" },
  linePanelHint: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  lineStopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E7EAF0",
  },
  lineStopNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EAF5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  lineStopNumText: { fontSize: 11, fontWeight: "700", color: "#264348" },
  lineStopName: { flex: 1, fontSize: 14, color: "#264348" },
  taxiCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E7EAF0",
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  taxiRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  taxiField: { flex: 1, fontSize: 14, color: "#264348", fontWeight: "600" },
  taxiInput: { flex: 1, fontSize: 14, color: "#264348" },
  taxiEstimate: { fontSize: 15, fontWeight: "700", color: "#264348" },
  taxiHint: { fontSize: 11, color: "#9CA3AF", lineHeight: 15 },
  taxiRequestButton: {
    backgroundColor: "#FFC400",
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  taxiRequestButtonText: { color: "#264348", fontSize: 15, fontWeight: "800" },
  taxiStatusCard: { backgroundColor: "#EAF5FF", borderColor: "#BFDFF7" },
  taxiStatusTitle: { fontSize: 15, fontWeight: "700", color: "#264348" },
  taxiStatusSub: { fontSize: 14, color: "#264348", marginTop: 2 },
  taxiCancelButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 6,
  },
  taxiCancelButtonText: { color: "#EF4444", fontSize: 13, fontWeight: "700" },
  locateMeButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 20,
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
    borderColor: "rgba(38,67,72,0.25)",
    backgroundColor: "transparent",
  },
  sortChipActive: {
    backgroundColor: "#59ABE3",
    borderColor: "#59ABE3",
  },
  sortChipText: {
    fontSize: Platform.OS === "web" ? 13 : 12,
    fontWeight: "500",
    color: "#264348",
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
    borderColor: "rgba(38,67,72,0.25)",
    backgroundColor: "transparent",
  },
  categoryChipActive: {
    backgroundColor: "#59ABE3",
    borderColor: "#59ABE3",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#264348",
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
    borderColor: "rgba(38,67,72,0.25)",
    backgroundColor: "transparent",
  },
  subChipActive: {
    backgroundColor: "rgba(89,171,227,0.15)",
    borderColor: "#59ABE3",
  },
  subChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#264348",
  },
  subChipTextActive: {
    color: "#59ABE3",
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
    color: "#264348",
    flexShrink: 1,
  },
  listContainer: {
    paddingBottom: SPACING.small,
  },
  openNowToggle: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  openNowBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.25)",
    backgroundColor: "transparent",
  },
  openNowBtnActive: {
    backgroundColor: "#264348",
    borderColor: "#264348",
  },
  openNowText: {
    fontSize: FONT_SIZES.small,
    color: "#264348",
    fontWeight: "600",
  },
  openNowTextActive: {
    color: "#fff",
  },
});

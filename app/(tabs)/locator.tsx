import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import BusinessMap from "../../components/BusinessMap";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useMapBounds } from "../../context/MapBoundsContext";
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
  searchNearby,
  GeospatialSearchResponse,
  ArtistSearchResult,
  PostSearchResult,
} from "../../lib/api";
import { translateCategory } from "../../lib/categoryTranslation";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

export default function LocatorScreen() {
  const { t } = useTranslation();
  const { sessionToken, user } = useAuth();
  const { setMapBounds: setGlobalMapBounds, isMapInitialized } = useMapBounds();
  const router = useRouter();
  const [categoryTree, setCategoryTree] = useState<CategoryGroup[]>([]);
  const [selectedRoot, setSelectedRoot] = useState("All");
  const [selectedSubcategory, setSelectedSubcategory] = useState("All");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
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
  const [mapBounds, setMapBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlans | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("monthly");
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionSession, setSubscriptionSession] = useState<
    { subscription_id: string; approval_url: string; status: string } | null
  >(null);
  
  // Artist/City Search State
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [citySearchResults, setCitySearchResults] = useState<GeospatialSearchResponse | null>(null);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [showArtistSearch, setShowArtistSearch] = useState(false);
  
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

  const loadBusinesses = useCallback(async () => {
    if (!sessionToken || !location) return;
    const data = await getNearbyBusinesses(
      sessionToken,
      location.latitude,
      location.longitude,
      selectedRoot !== "All" ? selectedRoot : undefined,
      selectedSubcategory !== "All" ? selectedSubcategory : undefined,
      mapBounds
    );
    setBusinesses(data);
  }, [sessionToken, location, selectedRoot, selectedSubcategory, mapBounds]);

  const handleMapRegionChange = useCallback((bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    setMapBounds(bounds);
    // Update global map bounds for filtering content across the app
    setGlobalMapBounds({
      minLat: bounds.minLat,
      maxLat: bounds.maxLat,
      minLng: bounds.minLng,
      maxLng: bounds.maxLng,
      centerLat: (bounds.minLat + bounds.maxLat) / 2,
      centerLng: (bounds.minLng + bounds.maxLng) / 2,
    });
  }, [setGlobalMapBounds]);

  // Search artists and posts by city (25km radius)
  const handleCitySearch = useCallback(async () => {
    if (!sessionToken || !citySearchQuery.trim()) return;
    try {
      setCitySearchLoading(true);
      const results = await searchNearby(sessionToken, citySearchQuery.trim(), undefined, undefined, 25);
      setCitySearchResults(results);
    } catch (error) {
      console.error("City search failed:", error);
      setCitySearchResults(null);
    } finally {
      setCitySearchLoading(false);
    }
  }, [sessionToken, citySearchQuery]);

  // Search artists near user's current GPS location
  const handleNearMeSearch = useCallback(async () => {
    if (!sessionToken || !location) return;
    try {
      setCitySearchLoading(true);
      const results = await searchNearby(
        sessionToken, 
        undefined, 
        location.latitude, 
        location.longitude, 
        25
      );
      setCitySearchResults(results);
    } catch (error) {
      console.error("Near me search failed:", error);
      setCitySearchResults(null);
    } finally {
      setCitySearchLoading(false);
    }
  }, [sessionToken, location]);

  // Auto-search when artist search tab is opened and location is available
  useEffect(() => {
    if (showArtistSearch && location && sessionToken && !citySearchResults) {
      handleNearMeSearch();
    }
  }, [showArtistSearch, location, sessionToken]);

  // Debounced load businesses when map bounds change
  useEffect(() => {
    if (!mapBounds || !location || !sessionToken) return;
    const timer = setTimeout(() => {
      loadBusinesses();
    }, 500); // Debounce 500ms
    return () => clearTimeout(timer);
  }, [mapBounds]);

  useEffect(() => {
    if (!sessionToken) return;
    setLoading(true);
    loadCategories().finally(() => setLoading(false));
  }, [loadCategories, sessionToken]);

  // Request location on mount
  useEffect(() => {
    if (!sessionToken) return;
    const setupLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoading(false);
        return;
      }
      const current = await Location.getCurrentPositionAsync({});
      const lat = current.coords.latitude;
      const lng = current.coords.longitude;
      setLocation({ latitude: lat, longitude: lng });
      
      // Set initial map bounds based on location with default zoom level
      const defaultDelta = 0.02; // Matches BusinessMap's initial delta
      setGlobalMapBounds({
        minLat: lat - defaultDelta / 2,
        maxLat: lat + defaultDelta / 2,
        minLng: lng - defaultDelta / 2,
        maxLng: lng + defaultDelta / 2,
        centerLat: lat,
        centerLng: lng,
      });
      
      setLoading(false);
    };
    setupLocation();
  }, [sessionToken, setGlobalMapBounds]);

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

  const loadSubscriptionPlans = useCallback(async () => {
    if (!sessionToken) return;
    const plans = await getSubscriptionPlans(sessionToken);
    setSubscriptionPlans(plans);
  }, [sessionToken]);

  useEffect(() => {
    if (location && sessionToken) {
      loadBusinesses();
    }
  }, [location, loadBusinesses, sessionToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(addressQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [addressQuery, googleKey]);

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
    if (!sessionToken || !location) return;
    if (!form.name || !form.root_category || !form.subcategory || !form.address) return;
    const latitude = form.latitude ?? location.latitude;
    const longitude = form.longitude ?? location.longitude;
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
    await loadBusinesses();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color="#4c6fff" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('locator.title')}</Text>
        <Text style={styles.subtitle}>{t('locator.subtitle')}</Text>
      </View>

      {/* Simple Location Header */}
      <View style={styles.locationHeader}>
        <View style={styles.locationIconContainer}>
          <Ionicons name="navigate" size={20} color="#4c6fff" />
        </View>
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>{t('locator.yourLocation')}</Text>
          <Text style={styles.locationName} numberOfLines={1}>
            {location 
              ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
              : t('locator.loading')}
          </Text>
        </View>
        <Pressable 
          style={styles.refreshLocationButton}
          onPress={async () => {
            setLoading(true);
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === "granted") {
              const current = await Location.getCurrentPositionAsync({});
              setLocation({
                latitude: current.coords.latitude,
                longitude: current.coords.longitude,
              });
            }
            setLoading(false);
          }}
        >
          <Ionicons name="refresh" size={18} color="#4c6fff" />
        </Pressable>
      </View>

      {/* View Toggle: Map vs Artist Search */}
      <View style={styles.viewToggle}>
        <Pressable
          style={[styles.toggleButton, !showArtistSearch && styles.toggleButtonActive]}
          onPress={() => setShowArtistSearch(false)}
        >
          <Ionicons name="map-outline" size={16} color={!showArtistSearch ? "#fff" : "#4c6fff"} />
          <Text style={[styles.toggleText, !showArtistSearch && styles.toggleTextActive]}>
            {t('locator.mapView', 'Map')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, showArtistSearch && styles.toggleButtonActive]}
          onPress={() => setShowArtistSearch(true)}
        >
          <Ionicons name="people-outline" size={16} color={showArtistSearch ? "#fff" : "#4c6fff"} />
          <Text style={[styles.toggleText, showArtistSearch && styles.toggleTextActive]}>
            {t('locator.artistSearch', 'Find Artists')}
          </Text>
        </Pressable>
      </View>

      {/* Artist Search by City */}
      {showArtistSearch ? (
        <View style={styles.artistSearchContainer}>
          <View style={styles.citySearchBox}>
            <Ionicons name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.citySearchInput}
              placeholder={t('locator.searchCityPlaceholder', 'Enter city name...')}
              placeholderTextColor="#9ca3af"
              value={citySearchQuery}
              onChangeText={setCitySearchQuery}
              onSubmitEditing={handleCitySearch}
              returnKeyType="search"
            />
            {citySearchLoading ? (
              <ActivityIndicator size="small" color="#4c6fff" />
            ) : (
              <Pressable onPress={handleCitySearch} style={styles.searchButton}>
                <Ionicons name="arrow-forward-circle" size={28} color="#4c6fff" />
              </Pressable>
            )}
          </View>
          
          {/* Near Me Button */}
          <Pressable 
            style={styles.nearMeButton}
            onPress={handleNearMeSearch}
            disabled={!location || citySearchLoading}
          >
            <Ionicons name="locate" size={18} color="#fff" />
            <Text style={styles.nearMeButtonText}>
              {t('locator.nearMe', 'Near Me')}
            </Text>
          </Pressable>
          
          <Text style={styles.searchHint}>
            {t('locator.searchHint', 'Search artists and their posts within 25km of a city')}
          </Text>

          {citySearchResults && (
            <ScrollView style={styles.searchResultsContainer} contentContainerStyle={{ paddingBottom: 100 }}>
              {/* Search Results Header */}
              <View style={styles.searchResultsHeader}>
                <Text style={styles.searchResultsTitle}>
                  {citySearchResults.city}
                </Text>
                <Text style={styles.searchResultsSubtitle}>
                  {citySearchResults.total_artists} {t('locator.artists', 'artists')} · {citySearchResults.total_posts} {t('locator.posts', 'posts')}
                </Text>
              </View>

              {/* Artists Section */}
              {citySearchResults.artists.length > 0 && (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>
                    <Ionicons name="person" size={16} color="#4c6fff" /> {t('locator.artistsNearby', 'Artists Nearby')}
                  </Text>
                  {citySearchResults.artists.map((artist) => (
                    <Pressable
                      key={artist.artist_id}
                      style={styles.artistCard}
                      onPress={() => router.push(`/artist/${artist.artist_id}`)}
                    >
                      {artist.profile_photo ? (
                        <Image source={{ uri: artist.profile_photo }} style={styles.artistPhoto} />
                      ) : (
                        <View style={styles.artistPhotoPlaceholder}>
                          <Text style={styles.artistPhotoText}>{artist.name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={styles.artistInfo}>
                        <Text style={styles.artistName}>{artist.name}</Text>
                        {artist.town && (
                          <Text style={styles.artistTown}>
                            <Ionicons name="location-outline" size={12} color="#6b7280" /> {artist.town}
                          </Text>
                        )}
                        {artist.genres && artist.genres.length > 0 && (
                          <View style={styles.genresRow}>
                            {artist.genres.slice(0, 3).map((genre, idx) => (
                              <View key={idx} style={styles.genreChip}>
                                <Text style={styles.genreChipText}>{genre}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      {artist.distance_km !== null && artist.distance_km !== undefined && (
                        <View style={styles.distanceBadge}>
                          <Text style={styles.distanceText}>{artist.distance_km} km</Text>
                        </View>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Posts Section */}
              {citySearchResults.posts.length > 0 && (
                <View style={styles.searchSection}>
                  <Text style={styles.searchSectionTitle}>
                    <Ionicons name="images" size={16} color="#4c6fff" /> {t('locator.postsFromArtists', 'Posts from Artists')}
                  </Text>
                  {citySearchResults.posts.map((post) => (
                    <Pressable
                      key={post.post_id}
                      style={styles.postCard}
                      onPress={() => router.push(`/post/${post.post_id}`)}
                    >
                      <View style={styles.postHeader}>
                        {post.actor_avatar ? (
                          <Image source={{ uri: post.actor_avatar }} style={styles.postAvatar} />
                        ) : (
                          <View style={styles.postAvatarPlaceholder}>
                            <Ionicons name="person" size={16} color="#fff" />
                          </View>
                        )}
                        <Text style={styles.postAuthor}>{post.actor_name || 'Artist'}</Text>
                      </View>
                      <Text style={styles.postText} numberOfLines={2}>{post.text}</Text>
                      <View style={styles.postStats}>
                        <Text style={styles.postStat}>
                          <Ionicons name="heart" size={12} color="#ef4444" /> {post.likes_count}
                        </Text>
                        <Text style={styles.postStat}>
                          <Ionicons name="chatbubble" size={12} color="#6b7280" /> {post.comments_count}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* No Results */}
              {citySearchResults.artists.length === 0 && citySearchResults.posts.length === 0 && (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={48} color="#9ca3af" />
                  <Text style={styles.noResultsText}>
                    {t('locator.noArtistsFound', 'No artists found in this area')}
                  </Text>
                  <Text style={styles.noResultsHint}>
                    {t('locator.tryAnotherCity', 'Try searching for another city')}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      ) : (
        <>
          {/* Original Map View Content */}

      <View style={styles.actions}>
        <Pressable
          style={styles.filterButton}
          onPress={() => {
            setCategoryTarget("filter");
            setCategoryModal(true);
          }}
        >
          <Text style={styles.filterText}>{t('locator.category')}: {selectedRootLabel}</Text>
          <Ionicons name="chevron-down" size={16} color="#4c6fff" />
        </Pressable>
        <Pressable
          style={styles.filterButton}
          onPress={() => {
            setSubcategoryTarget("filter");
            setSubcategoryModal(true);
          }}
        >
          <Text style={styles.filterText}>{t('locator.subcategory')}: {selectedSubLabel}</Text>
          <Ionicons name="chevron-down" size={16} color="#4c6fff" />
        </Pressable>
      </View>

      {location ? (
        <BusinessMap 
          location={location} 
          businesses={businesses} 
          showUserLocation
          onRegionChange={handleMapRegionChange}
        />
      ) : (
        <Pressable
          style={styles.webNotice}
          onPress={async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === "granted") {
              const current = await Location.getCurrentPositionAsync({});
              setLocation({
                latitude: current.coords.latitude,
                longitude: current.coords.longitude,
              });
            }
          }}
        >
          <Ionicons name="location" size={32} color="#4c6fff" />
          <Text style={styles.webNoticeText}>{t('locator.tapToEnableLocation')}</Text>
          <Text style={styles.webNoticeSubtext}>{t('locator.viewNearbyBusinesses')}</Text>
        </Pressable>
      )}

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={styles.listTitle}>{t('locator.nearbyBusinesses')}</Text>
        {businesses.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t('locator.noBusinesses')}</Text>
          </View>
        ) : (
          businesses.map((business) => (
            <View key={business.business_id} style={styles.businessCard}>
              <Pressable
                style={styles.businessCardContent}
                onPress={() => router.push(`/business/${business.business_id}`)}
              >
                {business.logo_image || business.profile_photo ? (
                  <Image
                    source={{ uri: (business.logo_image || business.profile_photo) as string }}
                    style={styles.businessPhoto}
                  />
                ) : (
                  <View style={styles.businessPhotoPlaceholder}>
                    <Text style={styles.businessPhotoText}>
                      {business.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.businessName}>{business.name}</Text>
                  <Text style={styles.businessCategory}>
                    {translateCategory(business.category, t)} · {translateCategory(business.root_category, t)}
                  </Text>
                  <Text style={styles.businessAddress}>{business.address}</Text>
                </View>
              </Pressable>
              <View style={styles.businessActions}>
                <Pressable
                  style={styles.whatsappShareButton}
                  onPress={() => shareBusinessToWhatsApp(business)}
                >
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                </Pressable>
                {business.owner_id === user?.user_id ? (
                  <Pressable
                    style={styles.subscriptionButton}
                    onPress={() => {
                      setSelectedBusiness(business);
                      setSubscriptionModal(true);
                      setSubscriptionSession(null);
                      setSelectedPlan("monthly");
                    }}
                  >
                    <Text style={styles.subscriptionButtonText}>{t('locator.manage')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
        </>
      )}

      <Modal visible={categoryModal} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('locator.selectCategory')}</Text>
            <Pressable onPress={() => setCategoryModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
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
              <Ionicons name="close" size={22} color="#111827" />
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
            {(
              (subcategoryTarget === "filter"
                ? selectedRootGroup?.subcategories
                : formRootGroup?.subcategories) || []
            ).map((subcategory) => (
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
              <Ionicons name="close" size={22} color="#111827" />
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
              <Ionicons name="chevron-down" size={18} color="#6b7280" />
            </Pressable>
            <Pressable
              style={styles.selector}
              onPress={() => {
                setSubcategoryTarget("form");
                setSubcategoryModal(true);
              }}
            >
              <Text style={styles.selectorText}>{formSubLabel}</Text>
              <Ionicons name="chevron-down" size={18} color="#6b7280" />
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
                {(formRootGroup?.subcategories.find(
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
              <Ionicons name="close" size={22} color="#111827" />
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
              <ActivityIndicator color="#4c6fff" />
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
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    color: "#6b7280",
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
    backgroundColor: "#eef2ff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  filterText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#4c6fff",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  helperChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  helperText: {
    color: "#4c6fff",
    fontWeight: "600",
    marginLeft: 6,
  },
  webNotice: {
    height: 200,
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  webNoticeText: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 16,
    marginTop: 8,
  },
  webNoticeSubtext: {
    color: "#9ca3af",
    fontSize: 13,
  },
  list: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
  emptyBackButton: {
    backgroundColor: "#4c6fff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyBackButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  businessCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
  },
  businessCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  businessPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
  },
  businessPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#4c6fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  businessPhotoText: {
    color: "#fff",
    fontSize: 20,
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
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  businessIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  businessName: {
    fontWeight: "600",
    color: "#111827",
  },
  businessCategory: {
    color: "#4c6fff",
    fontSize: 12,
  },
  businessAddress: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f6fb",
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
    color: "#111827",
  },
  modalItem: {
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
  },
  modalItemText: {
    color: "#111827",
  },
  moduleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  moduleChip: {
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginRight: 6,
    marginTop: 6,
  },
  moduleChipText: {
    color: "#3730a3",
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
    color: "#6b7280",
    fontSize: 12,
  },
  subscriptionButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
  },
  subscriptionButtonText: {
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
  modalBody: {
    padding: 20,
  },
  modalSubtitle: {
    color: "#6b7280",
    marginBottom: 12,
  },
  planRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  planCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
  },
  planCardActive: {
    borderColor: "#4c6fff",
    backgroundColor: "#eef2ff",
  },
  planTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  planPrice: {
    marginTop: 6,
    fontSize: 16,
    color: "#111827",
  },
  secondaryButton: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    marginBottom: 12,
  },
  selectorText: {
    color: "#6b7280",
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
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  refreshLocationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  locationIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: "#9ca3af",
  },
  locationName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginTop: 2,
  },
  locationRadiusBadge: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  locationRadiusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10b981",
  },
  // Location Modal Styles
  liveLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    padding: 16,
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  liveLocationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#10b981",
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
    color: "#111827",
  },
  liveLocationSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  locationSearchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    paddingHorizontal: 12,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    height: 48,
  },
  locationSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#111827",
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
    borderBottomColor: "#f3f4f6",
  },
  locationSuggestionText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: "#111827",
  },
  currentLocationInfo: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: "#eef2ff",
    borderRadius: 8,
  },
  currentLocationText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: "#4c6fff",
  },
  // View Toggle Styles
  viewToggle: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#eef2ff",
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
    backgroundColor: "#4c6fff",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4c6fff",
  },
  toggleTextActive: {
    color: "#fff",
  },
  // Artist Search Styles
  artistSearchContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  citySearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  citySearchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: "#111827",
    paddingVertical: 12,
  },
  searchButton: {
    padding: 4,
  },
  nearMeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  nearMeButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  searchHint: {
    fontSize: 12,
    color: "#9ca3af",
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
    color: "#111827",
  },
  searchResultsSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  searchSection: {
    marginBottom: 20,
  },
  searchSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  artistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    backgroundColor: "#4c6fff",
    alignItems: "center",
    justifyContent: "center",
  },
  artistPhotoText: {
    color: "#fff",
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
    color: "#111827",
  },
  artistTown: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  genresRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 4,
  },
  genreChip: {
    backgroundColor: "#eef2ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  genreChipText: {
    fontSize: 11,
    color: "#4c6fff",
    fontWeight: "500",
  },
  distanceBadge: {
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#10b981",
  },
  postCard: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    backgroundColor: "#4c6fff",
    alignItems: "center",
    justifyContent: "center",
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginLeft: 10,
  },
  postText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  postStats: {
    flexDirection: "row",
    marginTop: 10,
    gap: 16,
  },
  postStat: {
    fontSize: 12,
    color: "#6b7280",
  },
  noResults: {
    alignItems: "center",
    paddingVertical: 40,
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginTop: 12,
  },
  noResultsHint: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
});

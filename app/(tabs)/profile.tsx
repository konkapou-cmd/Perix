import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import i18n, { LANGUAGES } from "../../i18n";
import AdaptiveVideo from "../../components/AdaptiveVideo";
import Constants from "expo-constants";
import { useAuth } from "../../context/AuthContext";
import {
  Artist,
  Business,
  CategoryGroup,
  createBusiness,
  createArtist,
  getBusinessCategories,
  getMyArtist,
  getMyBusinesses,
  getMyFriends,
  updateProfileGallery,
  updateProfileMedia,
  updateProfileInfo,
  uploadMedia,
  uploadImageToCloudinary,
  UploadProgress,
  deleteBusiness,
  deleteArtist,
  deleteUserAccount,
  User,
  checkAdminStatus,
  updateGalleryCaption,
  GalleryItem,
} from "../../lib/api";
import UploadProgressModal from "../../components/UploadProgressModal";
import { translateCategory } from "../../lib/categoryTranslation";
import { InviteFriendsModal } from "../../components/InviteFriendsModal";
import VideoGalleryUpload from "../../components/VideoGalleryUpload";
import ThemeCustomizer from "../../components/ThemeCustomizer";

type CategoryOption = { slug: string; name: string; enabled_modules?: any };

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout, sessionToken, activeIdentity, setActiveIdentity, refreshUser } = useAuth();
  const router = useRouter();
  const googleKey =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [galleryImages, setGalleryImages] = useState<string[]>(
    user?.gallery_images || []
  );
  const [galleryVideos, setGalleryVideos] = useState<string[]>(
    user?.gallery_videos || []
  );
  const [friends, setFriends] = useState<User[]>([]);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(
    user?.profile_photo || user?.picture || null
  );
  const [coverPhoto, setCoverPhoto] = useState<string | null>(
    user?.cover_photo || null
  );
  const [displayName, setDisplayName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [location, setLocation] = useState(user?.location || "");
  const [locationSuggestions, setLocationSuggestions] = useState<
    { description: string; place_id: string }[]
  >([]);
  const [savingInfo, setSavingInfo] = useState(false);
  const [artistProfile, setArtistProfile] = useState<Artist | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryGroup[]>([]);
  const [businessModal, setBusinessModal] = useState(false);
  const [businessForm, setBusinessForm] = useState({
    name: "",
    description: "",
    address: "",
    root_category: "",
    subcategory: "",
    latitude: null as number | null,
    longitude: null as number | null,
  });
  const [businessAddressQuery, setBusinessAddressQuery] = useState("");
  const [businessSuggestions, setBusinessSuggestions] = useState<
    { description: string; place_id: string }[]
  >([]);
  const selectedRootGroup = useMemo(
    () => categoryTree.find((group) => group.slug === businessForm.root_category),
    [categoryTree, businessForm.root_category]
  );
  const [artistModal, setArtistModal] = useState(false);
  const [artistForm, setArtistForm] = useState({
    name: "",
    bio: "",
    genres: "",
    town: "",
    address: "",
    socials: "",
    gallery: [] as string[],
    fanGallery: [] as string[],
    videoUrls: "",
    profilePhoto: "",
    coverPhoto: "",
  });
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  
  // Caption editing state
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>(user?.gallery_items || []);
  const [videoItems, setVideoItems] = useState<GalleryItem[]>(user?.video_items || []);
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<{ url: string; caption: string; type: "image" | "video" } | null>(null);

  useEffect(() => {
    setGalleryImages(user?.gallery_images || []);
    setGalleryVideos(user?.gallery_videos || []);
    setGalleryItems(user?.gallery_items || []);
    setVideoItems(user?.video_items || []);
    setProfilePhoto(user?.profile_photo || null);
    setCoverPhoto(user?.cover_photo || null);
    setDisplayName(user?.name || "");
    setBio(user?.bio || "");
    setLocation(user?.location || "");
  }, [user]);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!sessionToken) return;
      try {
        const result = await checkAdminStatus(sessionToken);
        setIsAdmin(result.is_admin);
      } catch (e) {
        console.log("Admin check failed:", e);
      }
    };
    checkAdmin();
  }, [sessionToken]);

  useEffect(() => {
    const loadFriends = async () => {
      if (!sessionToken) return;
      const data = await getMyFriends(sessionToken);
      setFriends(data);
    };
    loadFriends();
  }, [sessionToken]);

  useEffect(() => {
    const loadArtist = async () => {
      if (!sessionToken) return;
      const data = await getMyArtist(sessionToken);
      setArtistProfile(data);
    };
    loadArtist();
  }, [sessionToken]);

  useEffect(() => {
    const loadBusinesses = async () => {
      if (!sessionToken) return;
      const [biz, categories] = await Promise.all([
        getMyBusinesses(sessionToken),
        getBusinessCategories(sessionToken),
      ]);
      setBusinesses(biz);
      setCategoryTree(categories.categories || []);
    };
    loadBusinesses();
  }, [sessionToken]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!googleKey || businessAddressQuery.length < 3) {
        setBusinessSuggestions([]);
        return;
      }
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        businessAddressQuery
      )}&key=${googleKey}`;
      const response = await fetch(url);
      const data = await response.json();
      setBusinessSuggestions(data.predictions || []);
    }, 400);
    return () => clearTimeout(timer);
  }, [businessAddressQuery, googleKey]);

  // User location autocomplete
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!googleKey || location.length < 3) {
        setLocationSuggestions([]);
        return;
      }
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        location
      )}&types=(cities)&key=${googleKey}`;
      const response = await fetch(url);
      const data = await response.json();
      setLocationSuggestions(data.predictions || []);
    }, 400);
    return () => clearTimeout(timer);
  }, [location, googleKey]);

  const handleLocationSelect = (suggestion: { description: string; place_id: string }) => {
    setLocation(suggestion.description);
    setLocationSuggestions([]);
  };

  const handleAddPhoto = async () => {
    if (!sessionToken) return;
    
    try {
      // Request permission first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t("business.permissionDenied") || "Permission Denied",
          t("profile.galleryPermissionRequired") || "Gallery access is required to add photos."
        );
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.7,
      });
      
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        try {
          // Show loading indicator
          setShowUploadProgress(true);
          setUploadProgress({ phase: "uploading", progress: 30 });
          
          // Use base64 with uploadImageToCloudinary if available
          let uploadedUrl: string;
          if (asset.base64) {
            const base64Uri = `data:image/jpeg;base64,${asset.base64}`;
            uploadedUrl = await uploadImageToCloudinary(sessionToken, base64Uri);
          } else {
            // Fallback to file URI upload
            uploadedUrl = await uploadMedia(sessionToken, asset.uri, "image");
          }
          setUploadProgress({ phase: "finalizing", progress: 80 });
          
          if (uploadedUrl) {
            // Then save the cloudinary URL to gallery
            const updated = await updateProfileGallery(sessionToken, { images: [uploadedUrl] });
            setGalleryImages(updated.gallery_images || []);
            setGalleryVideos(updated.gallery_videos || []);
            setGalleryItems(updated.gallery_items || []);
            
            setShowUploadProgress(false);
            setUploadProgress(null);
            Alert.alert(t("common.success") || "Success", t("profile.photoAddedSuccess") || "Photo added successfully!");
          } else {
            throw new Error("No URL returned from upload");
          }
        } catch (uploadError: any) {
          console.log("Upload error:", uploadError);
          setShowUploadProgress(false);
          setUploadProgress(null);
          Alert.alert(
            t("profile.uploadFailed") || "Upload Failed", 
            uploadError?.message || t("profile.pleaseTryAgain") || "Please try again."
          );
        }
      }
    } catch (error: any) {
      console.log("handleAddPhoto error:", error);
      setShowUploadProgress(false);
      setUploadProgress(null);
      Alert.alert(t("common.error") || "Error", error?.message || t("profile.pleaseTryAgain"));
    }
  };

  const handleAddVideo = async () => {
    if (!sessionToken) return;
    
    try {
      // Request permission first
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t("business.permissionDenied") || "Permission Denied",
          "Gallery access is required to add videos."
        );
        return;
      }
      
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
          
          if (uploaded) {
            const updated = await updateProfileGallery(sessionToken, {
              videos: [uploaded],
            });
            setGalleryImages(updated.gallery_images || []);
            setGalleryVideos(updated.gallery_videos || []);
            setVideoItems(updated.video_items || []);
            setTimeout(() => {
              setShowUploadProgress(false);
              setUploadProgress(null);
              Alert.alert(t("common.success") || "Success", "Video added successfully!");
            }, 1000);
          }
        } catch (error) {
          setShowUploadProgress(false);
          setUploadProgress(null);
          console.log("Video upload error:", error);
          Alert.alert(t("profile.uploadFailed"), t("profile.pleaseTryAgain"));
        }
      }
    } catch (error) {
      setShowUploadProgress(false);
      setUploadProgress(null);
      console.log("handleAddVideo error:", error);
      Alert.alert(t("common.error") || "Error", t("profile.pleaseTryAgain"));
    }
  };

  const handleDeleteGalleryItem = async (type: "image" | "video", index: number) => {
    if (!sessionToken) return;
    
    Alert.alert(
      t("profile.deleteItem"),
      t("profile.deleteConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              if (type === "image") {
                const newImages = galleryImages.filter((_, i) => i !== index);
                const updated = await updateProfileGallery(sessionToken, {
                  images: [],
                  remove_images: [galleryImages[index]],
                });
                setGalleryImages(updated.gallery_images || newImages);
                setGalleryItems(updated.gallery_items || []);
              } else {
                const newVideos = galleryVideos.filter((_, i) => i !== index);
                const updated = await updateProfileGallery(sessionToken, {
                  videos: [],
                  remove_videos: [galleryVideos[index]],
                });
                setGalleryVideos(updated.gallery_videos || newVideos);
                setVideoItems(updated.video_items || []);
              }
            } catch (error) {
              Alert.alert(t("common.error"), t("profile.deleteFailed"));
            }
          },
        },
      ]
    );
  };

  // Get caption for a gallery item
  const getCaptionForUrl = (url: string, type: "image" | "video"): string => {
    const items = type === "image" ? galleryItems : videoItems;
    const item = items.find(i => i.url === url);
    return item?.caption || "";
  };

  // Open caption edit modal
  const openCaptionEdit = (url: string, type: "image" | "video") => {
    const currentCaption = getCaptionForUrl(url, type);
    setEditingItem({ url, caption: currentCaption, type });
    setCaptionModalVisible(true);
  };

  // Save caption
  const handleSaveCaption = async () => {
    if (!sessionToken || !editingItem) return;
    
    try {
      const updated = await updateGalleryCaption(
        sessionToken,
        editingItem.url,
        editingItem.caption,
        editingItem.type
      );
      setGalleryItems(updated.gallery_items || []);
      setVideoItems(updated.video_items || []);
      setCaptionModalVisible(false);
      setEditingItem(null);
      Alert.alert(t("common.success"), t("profile.captionSaved") || "Caption saved!");
    } catch (error) {
      Alert.alert(t("common.error"), t("profile.captionSaveFailed") || "Failed to save caption");
    }
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

  const handleUpdateProfilePhoto = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const updated = await updateProfileMedia(sessionToken, {
        profile_photo: uri,
      });
      setProfilePhoto(updated.profile_photo || null);
    }
  };

  const handleUpdateCoverPhoto = async () => {
    if (!sessionToken) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const updated = await updateProfileMedia(sessionToken, {
        cover_photo: uri,
      });
      setCoverPhoto(updated.cover_photo || null);
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
      if (activeIdentity?.type === "user") {
        await setActiveIdentity({
          type: "user",
          id: updated.user_id,
          name: updated.name,
          avatar: updated.profile_photo || updated.picture || null,
        });
      }
      // Refresh user context to persist changes globally
      await refreshUser();
      Alert.alert(t('common.success'), t('profile.profileUpdated'));
    } catch (error) {
      Alert.alert(t('common.error'), t('profile.updateFailed'));
    } finally {
      setSavingInfo(false);
    }
  };


  const handleSelectIdentity = async (
    type: "user" | "business" | "artist",
    id: string,
    name: string,
    avatar?: string | null
  ) => {
    await setActiveIdentity({ type, id, name, avatar: avatar || null });
  };

  const handleBusinessPlaceSelect = async (suggestion: {
    description: string;
    place_id: string;
  }) => {
    setBusinessAddressQuery(suggestion.description);
    setBusinessSuggestions([]);
    setBusinessForm((prev) => ({ ...prev, address: suggestion.description }));
    if (!googleKey) return;
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      suggestion.place_id
    )}&key=${googleKey}`;
    const response = await fetch(url);
    const data = await response.json();
    const location = data.result?.geometry?.location;
    if (location) {
      setBusinessForm((prev) => ({
        ...prev,
        latitude: location.lat,
        longitude: location.lng,
        address: data.result.formatted_address || suggestion.description,
      }));
    }
  };

  const handleCreateBusiness = async () => {
    if (
      !sessionToken ||
      !businessForm.name ||
      !businessForm.root_category ||
      !businessForm.subcategory ||
      !businessForm.address ||
      businessForm.latitude === null ||
      businessForm.longitude === null
    )
      return;
    const newBusiness = await createBusiness(sessionToken, {
      name: businessForm.name,
      root_category: businessForm.root_category,
      subcategory: businessForm.subcategory,
      address: businessForm.address,
      description: businessForm.description || undefined,
      latitude: businessForm.latitude,
      longitude: businessForm.longitude,
    });
    setBusinesses([newBusiness]);
    setBusinessModal(false);
  };

  const handlePickArtistImage = async (
    target: "gallery" | "fan" | "profile" | "cover"
  ) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setArtistForm((prev) => {
        if (target === "profile") {
          return { ...prev, profilePhoto: uri };
        }
        if (target === "cover") {
          return { ...prev, coverPhoto: uri };
        }
        if (target === "gallery") {
          return { ...prev, gallery: [...prev.gallery, uri] };
        }
        return { ...prev, fanGallery: [...prev.fanGallery, uri] };
      });
    }
  };

  const handleCreateArtist = async () => {
    if (!sessionToken || !artistForm.name) return;
    const newArtist = await createArtist(sessionToken, {
      name: artistForm.name,
      bio: artistForm.bio || undefined,
      genres: artistForm.genres
        ? artistForm.genres.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
      socials: artistForm.socials ? { links: artistForm.socials } : {},
      town: artistForm.town || undefined,
      address: artistForm.address || undefined,
      gallery_images: artistForm.gallery,
      fan_gallery: artistForm.fanGallery,
      video_urls: artistForm.videoUrls
        ? artistForm.videoUrls.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
      profile_photo: artistForm.profilePhoto || undefined,
      cover_photo: artistForm.coverPhoto || undefined,
    });
    setArtistProfile(newArtist);
    setArtistModal(false);
  };

  // Delete handlers
  const handleDeleteBusiness = (businessId: string) => {
    Alert.alert(
      t('profile.deleteBusiness'),
      t('profile.deleteBusinessConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!sessionToken) return;
            try {
              await deleteBusiness(sessionToken, businessId);
              setBusinesses(businesses.filter(b => b.business_id !== businessId));
              Alert.alert(t('common.success'), t('profile.deleteBusinessSuccess'));
            } catch (error) {
              Alert.alert(t('common.error'), String(error));
            }
          },
        },
      ]
    );
  };

  const handleDeleteArtist = () => {
    if (!artistProfile) return;
    Alert.alert(
      t('profile.deleteArtist'),
      t('profile.deleteArtistConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!sessionToken) return;
            try {
              await deleteArtist(sessionToken, artistProfile.artist_id);
              setArtistProfile(null);
              Alert.alert(t('common.success'), t('profile.deleteArtistSuccess'));
            } catch (error) {
              Alert.alert(t('common.error'), String(error));
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteAccountConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!sessionToken) return;
            try {
              await deleteUserAccount(sessionToken);
              Alert.alert(t('common.success'), t('profile.deleteAccountSuccess'));
              logout();
            } catch (error) {
              Alert.alert(t('common.error'), String(error));
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Premium Header with Cover Photo */}
        <View style={styles.heroSection}>
          {/* Cover Photo with Gradient Overlay */}
          <View style={styles.coverWrapper}>
            {coverPhoto ? (
              <Image source={{ uri: coverPhoto }} style={styles.coverPhoto} />
            ) : (
              <LinearGradient
                colors={["#6366f1", "#8b5cf6", "#a855f7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.coverGradient}
              />
            )}
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.4)"]}
              style={styles.coverOverlay}
            />
            <Pressable style={styles.coverEditButton} onPress={handleUpdateCoverPhoto}>
              <Ionicons name="camera" size={18} color="#fff" />
            </Pressable>
          </View>

          {/* Profile Avatar - Overlapping Cover */}
          <View style={styles.avatarContainer}>
            <Pressable style={styles.avatarWrapper} onPress={handleUpdateProfilePhoto}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
              ) : (
                <LinearGradient
                  colors={["#4c6fff", "#8b5cf6"]}
                  style={styles.avatarPlaceholder}
                >
                  <Text style={styles.avatarText}>{user?.name?.charAt(0) || "M"}</Text>
                </LinearGradient>
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={12} color="#fff" />
              </View>
            </Pressable>
          </View>

          {/* User Info */}
          <View style={styles.userInfoSection}>
            <Text style={styles.userName}>{user?.name || "Member"}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            {user?.location && (
              <View style={styles.locationBadge}>
                <Ionicons name="location" size={14} color="#6b7280" />
                <Text style={styles.locationText}>{user.location}</Text>
              </View>
            )}
          </View>

          {/* Quick Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{friends.length}</Text>
              <Text style={styles.statLabel}>{t('profile.friends')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{galleryImages.length + galleryVideos.length}</Text>
              <Text style={styles.statLabel}>{t('profile.media') || "Media"}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{businesses.length + (artistProfile ? 1 : 0)}</Text>
              <Text style={styles.statLabel}>{t('profile.profiles') || "Profiles"}</Text>
            </View>
          </View>

          {/* View Profile Button */}
          {user?.user_id && (
            <Pressable
              style={styles.viewProfileButton}
              onPress={() => router.push(`/user/${user.user_id}`)}
              data-testid="view-public-profile-btn"
            >
              <Ionicons name="eye-outline" size={18} color="#4c6fff" />
              <Text style={styles.viewProfileButtonText}>{t('profile.viewPublicProfile')}</Text>
            </Pressable>
          )}
        </View>

        {/* 4. Personal Information */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('profile.personalInfo')}</Text>
          <TextInput
            placeholder={t('profile.displayName')}
            value={displayName}
            onChangeText={setDisplayName}
            style={styles.input}
          />
          <TextInput
            placeholder={t('profile.shortBio')}
            value={bio}
            onChangeText={setBio}
            style={[styles.input, styles.textArea]}
            multiline
          />
          <TextInput
            placeholder={t('profile.locationSearch')}
            value={location}
            onChangeText={setLocation}
            style={styles.input}
          />
          {locationSuggestions.length > 0 && (
            <View style={styles.suggestionBox}>
              {locationSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.place_id}
                  style={styles.suggestionItem}
                  onPress={() => handleLocationSelect(suggestion)}
                >
                  <Text style={styles.suggestionText}>{suggestion.description}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Pressable
            style={styles.primaryButton}
            onPress={handleSaveProfileInfo}
            disabled={savingInfo}
          >
            <Text style={styles.primaryButtonText}>
              {savingInfo ? t('profile.saving') : t('common.save')}
            </Text>
          </Pressable>
        </View>

        {/* 5. Friends Carousel */}
        <View style={styles.card}>
          <View style={styles.friendsHeader}>
            <Text style={styles.cardTitle}>{t('profile.friends')}</Text>
            <Pressable 
              style={styles.inviteFriendsButton}
              onPress={() => setInviteModalVisible(true)}
              data-testid="invite-friends-btn"
            >
              <Ionicons name="person-add" size={16} color="#4c6fff" />
              <Text style={styles.inviteFriendsText}>{t('profile.inviteFriends') || 'Invite'}</Text>
            </Pressable>
          </View>
          {friends.length === 0 ? (
            <Text style={styles.emptyText}>{t('profile.noFriends')}</Text>
          ) : (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.friendsCarousel}
            >
              {friends.map((friend) => (
                <Pressable 
                  key={friend.user_id} 
                  style={styles.friendCard}
                  onPress={() => router.push(`/user/${friend.user_id}`)}
                >
                  <View style={styles.friendAvatarLarge}>
                    {(friend.profile_photo || friend.picture) ? (
                      <Image
                        source={{ uri: friend.profile_photo || friend.picture || '' }}
                        style={styles.friendAvatarLargeImage}
                      />
                    ) : (
                      <Text style={styles.friendAvatarLargeText}>
                        {friend.name?.charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.friendCardName} numberOfLines={1}>{friend.name}</Text>
                  <View style={styles.seeProfileBadge}>
                    <Ionicons name="eye-outline" size={12} color="#4c6fff" />
                    <Text style={styles.seeProfileText}>{t('profile.seeProfile')}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* 6. Gallery Photos */}
        <View style={styles.card}>
          <View style={styles.galleryHeader}>
            <View style={styles.galleryTitleRow}>
              <Ionicons name="images" size={18} color="#4c6fff" />
              <Text style={styles.cardTitle}>{t('profile.galleryPhotos')}</Text>
            </View>
            <Pressable style={styles.addMediaButton} onPress={handleAddPhoto}>
              <Ionicons name="add" size={20} color="#4c6fff" />
            </Pressable>
          </View>
          {galleryImages.length === 0 ? (
            <Text style={styles.emptyText}>{t('profile.noPhotos')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {galleryImages.map((image, index) => (
                <View key={`img-${index}`} style={styles.galleryItemContainer}>
                  <Image source={{ uri: image }} style={styles.galleryItem} />
                  <View style={styles.galleryItemOverlay}>
                    <Pressable
                      style={styles.galleryCaptionButton}
                      onPress={() => openCaptionEdit(image, "image")}
                    >
                      <Ionicons name="text" size={16} color="#fff" />
                    </Pressable>
                    <Pressable
                      style={styles.galleryDeleteButton}
                      onPress={() => handleDeleteGalleryItem("image", index)}
                    >
                      <Ionicons name="trash" size={16} color="#fff" />
                    </Pressable>
                  </View>
                  {getCaptionForUrl(image, "image") ? (
                    <Text style={styles.galleryCaption} numberOfLines={1}>
                      {getCaptionForUrl(image, "image")}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* 7. Gallery Videos - Using VideoGalleryUpload with captions */}
        <View style={styles.card}>
          <VideoGalleryUpload
            videos={galleryVideos}
            onVideosChange={async (newVideos) => {
              if (sessionToken && user) {
                try {
                  // Extract just the URLs for the API call
                  const videoUrls = Array.isArray(newVideos) && newVideos.length > 0 
                    ? (typeof newVideos[0] === 'string' ? newVideos : newVideos.map((v: any) => v.url))
                    : [];
                  await updateProfileGallery(sessionToken, { videos: videoUrls as string[] });
                  setGalleryVideos(videoUrls as string[]);
                  refreshUser();
                } catch (error) {
                  console.error("[VideoGallery] Failed to update profile:", error);
                }
              }
            }}
            sessionToken={sessionToken || ""}
            title={t('profile.galleryVideos') || "Videos"}
            emptyText={t('profile.noVideos') || "No videos yet"}
            enableCaptions={true}
            onCaptionChange={async (url, caption) => {
              if (sessionToken) {
                await updateGalleryCaption(sessionToken, url, caption, "video");
                refreshUser();
              }
            }}
          />
        </View>

        {/* 8. Available Jobs Button */}
        <View style={styles.jobsButtonContainer}>
          <Pressable
            style={styles.jobsButton}
            onPress={() => router.push("/jobs")}
            data-testid="available-jobs-btn"
          >
            <LinearGradient
              colors={["#4c6fff", "#6366f1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.jobsButtonGradient}
            >
              <View style={styles.jobsIconContainer}>
                <Ionicons name="briefcase" size={22} color="#fff" />
              </View>
              <Text style={styles.jobsButtonText}>{t("jobs.title")}</Text>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>
        </View>

        {/* 9. Post As Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('profile.postAs')}</Text>
          <View style={styles.identityRow}>
            {/* User identity */}
            <Pressable
              style={[
                styles.identityChip,
                activeIdentity?.type === "user" ? styles.identityChipActive : null,
              ]}
              onPress={() =>
                user &&
                handleSelectIdentity(
                  "user",
                  user.user_id,
                  user.name,
                  user.profile_photo || user.picture
                )
              }
            >
              <Text style={[styles.identityText, activeIdentity?.type === "user" ? styles.identityTextActive : null]}>{t('profile.user')}</Text>
            </Pressable>
            
            {/* Business identity - show if user has a business */}
            {businesses.length > 0 && (
              <Pressable
                style={[
                  styles.identityChip,
                  activeIdentity?.type === "business" ? styles.identityChipActive : null,
                ]}
                onPress={() =>
                  handleSelectIdentity(
                    "business",
                    businesses[0].business_id,
                    businesses[0].name,
                    businesses[0].logo_image || undefined
                  )
                }
              >
                <Text style={[styles.identityText, activeIdentity?.type === "business" ? styles.identityTextActive : null]}>{t('profile.business')}</Text>
              </Pressable>
            )}
            
            {/* Artist identity - show if user has an artist profile */}
            {artistProfile && (
              <Pressable
                style={[
                  styles.identityChip,
                  activeIdentity?.type === "artist" ? styles.identityChipActive : null,
                ]}
                onPress={() =>
                  handleSelectIdentity(
                    "artist",
                    artistProfile.artist_id,
                    artistProfile.name,
                    artistProfile.profile_photo || undefined
                  )
                }
              >
                <Text style={[styles.identityText, activeIdentity?.type === "artist" ? styles.identityTextActive : null]}>{t('profile.artist')}</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.identityHint}>
            {t('profile.identityHint')}
          </Text>
        </View>

        {/* 10. Business Profile */}
        <View style={styles.card}>
          <View style={styles.profileSectionHeader}>
            <Ionicons name="business" size={20} color="#10b981" />
            <Text style={styles.cardTitle}>{t('profile.business')}</Text>
          </View>
          {businesses.length ? (
            <View style={styles.businessActionsContainer}>
              <Text style={styles.artistName}>{businesses[0].name}</Text>
              <Text style={styles.artistMeta}>
                {translateCategory(businesses[0].root_category, t)} · {translateCategory(businesses[0].subcategory, t)}
              </Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push(`/business/${businesses[0].business_id}`)}
              >
                <Ionicons name="pencil-outline" size={16} color="#4c6fff" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit>{t('profile.editProfile')}</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push("/business-dashboard")}
              >
                <Ionicons name="bar-chart-outline" size={16} color="#4c6fff" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit>{t('profile.businessDashboard')}</Text>
              </Pressable>
              <Pressable
                style={styles.subscriptionButton}
                onPress={() => router.push("/subscription")}
              >
                <Ionicons name="card-outline" size={18} color="#4c6fff" />
                <Text style={styles.subscriptionButtonText} numberOfLines={1} adjustsFontSizeToFit>{t('profile.manageSubscription')}</Text>
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => handleDeleteBusiness(businesses[0].business_id)}
                data-testid="delete-business-btn"
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={styles.deleteButtonText}>{t('profile.deleteBusiness')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setBusinessModal(true)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#4c6fff" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>{t('profile.createBusiness')}</Text>
            </Pressable>
          )}
        </View>

        {/* 11. Artist Profile */}
        <View style={styles.card}>
          <View style={styles.profileSectionHeader}>
            <Ionicons name="musical-notes" size={20} color="#8b5cf6" />
            <Text style={styles.cardTitle}>{t('profile.artist')}</Text>
          </View>
          {artistProfile ? (
            <View>
              <Text style={styles.artistName}>{artistProfile.name}</Text>
              <Text style={styles.artistMeta}>
                {artistProfile.genres?.join(", ") || ""}
              </Text>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push(`/artist/${artistProfile.artist_id}`)}
              >
                <Ionicons name="pencil-outline" size={16} color="#4c6fff" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit>{t('profile.editProfile')}</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push("/artist-dashboard")}
              >
                <Ionicons name="musical-notes-outline" size={16} color="#4c6fff" style={{ marginRight: 8 }} />
                <Text style={styles.secondaryButtonText} numberOfLines={1} adjustsFontSizeToFit>{t('profile.artistDashboard')}</Text>
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={handleDeleteArtist}
                data-testid="delete-artist-btn"
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
                <Text style={styles.deleteButtonText} numberOfLines={1} adjustsFontSizeToFit>{t('profile.deleteArtist')}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setArtistModal(true)}
            >
              <Ionicons name="add-circle-outline" size={16} color="#4c6fff" style={{ marginRight: 8 }} />
              <Text style={styles.secondaryButtonText}>{t('profile.createArtist')}</Text>
            </Pressable>
          )}
        </View>

        {/* 12. Admin Dashboard (only for admins) */}
        {isAdmin && (
          <View style={styles.adminButtonContainer}>
            <Pressable 
              style={styles.adminButton} 
              onPress={() => router.push("/admin-dashboard")}
            >
              <LinearGradient
                colors={["#10b981", "#059669"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.adminButtonGradient}
              >
                <View style={styles.adminIconContainer}>
                  <Ionicons name="shield-checkmark" size={20} color="#fff" />
                </View>
                <Text style={styles.adminButtonText}>{t("profile.adminDashboard") || "Admin Dashboard"}</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
              </LinearGradient>
            </Pressable>
          </View>
        )}

        {/* 13. Language Selector */}
        <View style={styles.languageCard}>
          <View style={styles.languageHeader}>
            <Ionicons name="language" size={20} color="#4c6fff" />
            <Text style={styles.languageTitle}>{t("profile.language") || "Language"}</Text>
          </View>
          <Pressable 
            style={styles.languageDropdown}
            onPress={() => setLanguageModalVisible(true)}
          >
            <Text style={styles.languageDropdownText}>
              {LANGUAGES.find(l => l.code === i18n.language)?.nativeName || "English"}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#4c6fff" />
          </Pressable>
        </View>

        {/* Language Selection Modal */}
        <Modal visible={languageModalVisible} transparent animationType="fade">
          <Pressable style={styles.languageModalOverlay} onPress={() => setLanguageModalVisible(false)}>
            <View style={styles.languageModalContent}>
              <Text style={styles.languageModalTitle}>{t("auth.selectLanguage")}</Text>
              {LANGUAGES.map((lang) => (
                <Pressable
                  key={lang.code}
                  style={[
                    styles.languageOption,
                    i18n.language === lang.code && styles.languageOptionActive
                  ]}
                  onPress={() => {
                    i18n.changeLanguage(lang.code);
                    setLanguageModalVisible(false);
                  }}
                >
                  <Text style={[
                    styles.languageOptionText,
                    i18n.language === lang.code && styles.languageOptionTextActive
                  ]}>
                    {lang.nativeName}
                  </Text>
                  {i18n.language === lang.code && (
                    <Ionicons name="checkmark" size={20} color="#4c6fff" />
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>

        {/* 14. Theme Customization */}
        <View style={styles.languageCard}>
          <View style={styles.languageHeader}>
            <Ionicons name="color-palette" size={20} color="#4c6fff" />
            <Text style={styles.languageTitle}>{t("theme.profileTheme") || "Profile Theme"}</Text>
          </View>
          <Pressable 
            style={styles.languageDropdown}
            onPress={() => setThemeModalVisible(true)}
          >
            <Text style={styles.languageDropdownText}>
              {t("theme.customize") || "Customize Colors"}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#4c6fff" />
          </Pressable>
        </View>

        {/* Theme Customizer Modal */}
        <ThemeCustomizer
          visible={themeModalVisible}
          onClose={() => setThemeModalVisible(false)}
          currentTheme={user?.theme}
          sessionToken={sessionToken || ''}
          onThemeUpdated={() => refreshUser?.()}
        />

        {/* 15. More Options */}
        <View style={styles.moreOptionsCard}>
          <Text style={styles.moreOptionsTitle}>{t("profile.more") || "More"}</Text>
          
          <Pressable
            style={styles.moreOptionItem}
            onPress={() => router.push("/promoter")}
          >
            <View style={styles.moreOptionIcon}>
              <Ionicons name="megaphone" size={20} color="#4c6fff" />
            </View>
            <View style={styles.moreOptionContent}>
              <Text style={styles.moreOptionText}>{t("profile.promoterProgram") || "Promoter Program"}</Text>
              <Text style={styles.moreOptionHint}>{t("profile.promoterHint") || "Earn by referring businesses"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6b7280" />
          </Pressable>
          
          <Pressable
            style={styles.moreOptionItem}
            onPress={() => router.push("/privacy-policy")}
          >
            <View style={styles.moreOptionIcon}>
              <Ionicons name="shield-checkmark" size={20} color="#10b981" />
            </View>
            <View style={styles.moreOptionContent}>
              <Text style={styles.moreOptionText}>{t("profile.privacyPolicy") || "Privacy Policy"}</Text>
              <Text style={styles.moreOptionHint}>{t("profile.privacyHint") || "Your data & rights"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6b7280" />
          </Pressable>
        </View>

        {/* 16. Logout */}
        <View style={styles.logoutButtonContainer}>
          <Pressable style={styles.logoutButton} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            <Text style={styles.logoutText}>{t("profile.logout")}</Text>
          </Pressable>
        </View>

        {/* 13. Delete Account */}
        <View style={styles.dangerCardContainer}>
          <View style={styles.dangerCard}>
            <View style={styles.dangerHeader}>
              <View style={styles.dangerIconContainer}>
                <Ionicons name="warning" size={20} color="#ef4444" />
              </View>
              <Text style={styles.dangerTitle}>{t('profile.dangerZone')}</Text>
            </View>
            <Text style={styles.dangerDescription}>
              {t('profile.dangerZoneDescription') || "This action cannot be undone. All your data will be permanently deleted."}
            </Text>
            <Pressable
              style={styles.deleteAccountButton}
              onPress={handleDeleteAccount}
              data-testid="delete-account-btn"
            >
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
              <Text style={styles.deleteAccountText}>{t('profile.deleteAccount')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Modal visible={artistModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create artist profile</Text>
            <Pressable onPress={() => setArtistModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput
              placeholder="Artist name"
              value={artistForm.name}
              onChangeText={(value) =>
                setArtistForm((prev) => ({ ...prev, name: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Bio"
              value={artistForm.bio}
              onChangeText={(value) =>
                setArtistForm((prev) => ({ ...prev, bio: value }))
              }
              style={[styles.input, styles.textArea]}
              multiline
            />
            <TextInput
              placeholder="Genres (comma separated)"
              value={artistForm.genres}
              onChangeText={(value) =>
                setArtistForm((prev) => ({ ...prev, genres: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Town"
              value={artistForm.town}
              onChangeText={(value) =>
                setArtistForm((prev) => ({ ...prev, town: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Address"
              value={artistForm.address}
              onChangeText={(value) =>
                setArtistForm((prev) => ({ ...prev, address: value }))
              }
              style={styles.input}
            />
            <TextInput
              placeholder="Social links"
              value={artistForm.socials}
              onChangeText={(value) =>
                setArtistForm((prev) => ({ ...prev, socials: value }))
              }
              style={styles.input}
            />
            {artistForm.profilePhoto ? (
              <Image source={{ uri: artistForm.profilePhoto }} style={styles.mediaPreview} />
            ) : null}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => handlePickArtistImage("profile")}
            >
              <Text style={styles.secondaryButtonText}>Upload profile photo</Text>
            </Pressable>
            {artistForm.coverPhoto ? (
              <Image source={{ uri: artistForm.coverPhoto }} style={styles.mediaPreview} />
            ) : null}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => handlePickArtistImage("cover")}
            >
              <Text style={styles.secondaryButtonText}>Upload cover photo</Text>
            </Pressable>
            <TextInput
              placeholder="Video URLs (comma separated)"
              value={artistForm.videoUrls}
              onChangeText={(value) =>
                setArtistForm((prev) => ({ ...prev, videoUrls: value }))
              }
              style={styles.input}
            />
            <Pressable
              style={styles.secondaryButton}
              onPress={() => handlePickArtistImage("gallery")}
            >
              <Text style={styles.secondaryButtonText}>Add gallery photo</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleCreateArtist}>
              <Text style={styles.primaryButtonText}>Save artist</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={businessModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('profile.createBusiness')}</Text>
            <Pressable onPress={() => setBusinessModal(false)}>
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput
              placeholder={t('business.name')}
              value={businessForm.name}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, name: value }))
              }
              style={styles.input}
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              placeholder={t('business.description')}
              value={businessForm.description}
              onChangeText={(value) =>
                setBusinessForm((prev) => ({ ...prev, description: value }))
              }
              style={[styles.input, styles.textArea]}
              multiline
              placeholderTextColor="#9ca3af"
            />
            <Text style={styles.sectionLabel}>{t('business.rootCategory')}</Text>
            <View style={styles.choiceWrap}>
              {categoryTree.map((category) => (
                <Pressable
                  key={category.slug}
                  style={[
                    styles.choiceChip,
                    businessForm.root_category === category.slug && styles.choiceChipSelected
                  ]}
                  onPress={() =>
                    setBusinessForm((prev) => ({
                      ...prev,
                      root_category: category.slug,
                      subcategory: "",
                    }))
                  }
                >
                  <Text style={[
                    styles.choiceText,
                    businessForm.root_category === category.slug && styles.choiceTextSelected
                  ]}>{translateCategory(category.slug, t)}</Text>
                </Pressable>
              ))}
            </View>
            {businessForm.root_category ? (
              <>
                <Text style={styles.sectionLabel}>{t('business.subcategory')}</Text>
                <View style={styles.choiceWrap}>
                  {(selectedRootGroup?.subcategories || []).map((subcategory) => (
                    <Pressable
                      key={subcategory.slug}
                      style={[
                        styles.choiceChip,
                        businessForm.subcategory === subcategory.slug && styles.choiceChipSelected
                      ]}
                      onPress={() =>
                        setBusinessForm((prev) => ({
                          ...prev,
                          subcategory: subcategory.slug,
                        }))
                      }
                    >
                      <Text style={[
                        styles.choiceText,
                        businessForm.subcategory === subcategory.slug && styles.choiceTextSelected
                      ]}>{translateCategory(subcategory.slug, t)}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.hintText}>{t('business.selectFirst')}</Text>
            )}
            <Text style={styles.sectionLabel}>{t('business.address')}</Text>
            <TextInput
              placeholder={t('business.searchAddress')}
              value={businessAddressQuery}
              onChangeText={(value) => {
                setBusinessAddressQuery(value);
                setBusinessForm((prev) => ({ ...prev, address: value }))
              }}
              style={styles.input}
              placeholderTextColor="#9ca3af"
            />
            {businessSuggestions.length ? (
              <View style={styles.suggestionBox}>
                {businessSuggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.place_id}
                    style={styles.suggestionItem}
                    onPress={() => handleBusinessPlaceSelect(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion.description}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Pressable 
              style={[
                styles.primaryButton,
                (!businessForm.name || !businessForm.root_category || !businessForm.subcategory || !businessForm.address) && styles.primaryButtonDisabled
              ]} 
              onPress={handleCreateBusiness}
              disabled={!businessForm.name || !businessForm.root_category || !businessForm.subcategory || !businessForm.address}
            >
              <Text style={styles.primaryButtonText}>{t('profile.createBusiness')}</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Caption Edit Modal */}
      <Modal visible={captionModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.captionModalOverlay}
        >
          <View style={styles.captionModalContent}>
            <View style={styles.captionModalHeader}>
              <Text style={styles.captionModalTitle}>
                {t("profile.editCaption") || "Edit Caption"}
              </Text>
              <Pressable onPress={() => {
                setCaptionModalVisible(false);
                setEditingItem(null);
              }}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </Pressable>
            </View>
            <TextInput
              style={styles.captionInput}
              placeholder={t("profile.captionPlaceholder") || "Enter caption..."}
              placeholderTextColor="#9ca3af"
              value={editingItem?.caption || ""}
              onChangeText={(text) => setEditingItem(prev => prev ? {...prev, caption: text} : null)}
              multiline
              maxLength={200}
            />
            <View style={styles.captionModalButtons}>
              <Pressable
                style={[styles.captionButton, styles.captionCancelButton]}
                onPress={() => {
                  setCaptionModalVisible(false);
                  setEditingItem(null);
                }}
              >
                <Text style={styles.captionCancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.captionButton, styles.captionSaveButton]}
                onPress={handleSaveCaption}
              >
                <Text style={styles.captionSaveText}>{t("common.save")}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <UploadProgressModal visible={showUploadProgress} progress={uploadProgress} />
      
      {/* Invite Friends Modal */}
      <InviteFriendsModal
        visible={inviteModalVisible}
        onClose={() => setInviteModalVisible(false)}
        inviteCode={user?.referral_code}
        userName={user?.name}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    paddingBottom: 40,
  },
  // Premium Hero Section
  heroSection: {
    backgroundColor: "#fff",
    paddingBottom: 24,
    marginBottom: 16,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  coverWrapper: {
    position: "relative",
    height: 160,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: "hidden",
  },
  coverPhoto: {
    width: "100%",
    height: "100%",
  },
  coverGradient: {
    width: "100%",
    height: "100%",
  },
  coverOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  coverEditButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarContainer: {
    alignItems: "center",
    marginTop: -50,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#fff",
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 36,
    fontWeight: "700",
    color: "#fff",
  },
  avatarEditBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4c6fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  userInfoSection: {
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 20,
  },
  userName: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
  },
  userEmail: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  locationBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: "#6b7280",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    paddingHorizontal: 40,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  statLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#e5e7eb",
  },
  viewProfileButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#f0f4ff",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginTop: 20,
    gap: 8,
  },
  viewProfileButtonText: {
    color: "#4c6fff",
    fontWeight: "700",
    fontSize: 14,
  },
  // Cards Section
  sectionContainer: {
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    overflow: "hidden",
  },
  name: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  email: {
    marginTop: 4,
    color: "#6b7280",
  },
  coverPlaceholder: {
    width: "100%",
    height: 140,
    borderRadius: 16,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholderText: {
    color: "#6b7280",
  },
  coverButton: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#4c6fff",
  },
  coverButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  profileActions: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
  },
  galleryActions: {
    flexDirection: "row",
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 10,
  },
  secondaryButtonSpacing: {
    marginRight: 10,
  },
  secondaryButtonText: {
    color: "#4c6fff",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  subscriptionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4c6fff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  subscriptionButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 8,
  },
  identityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  identityChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#d1d5db",
    marginRight: 10,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },
  identityChipActive: {
    backgroundColor: "#4c6fff",
    borderColor: "#4c6fff",
  },
  identityText: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 14,
  },
  identityTextActive: {
    color: "#fff",
  },
  identityHint: {
    color: "#6b7280",
    fontSize: 12,
  },
  friendsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inviteFriendsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76, 111, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  inviteFriendsText: {
    color: "#4c6fff",
    fontSize: 12,
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
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  galleryItemContainer: {
    width: 120,
    marginRight: 10,
    position: "relative",
  },
  galleryItem: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  galleryVideo: {
    width: "100%",
    borderRadius: 12,
    maxHeight: 220,
  },
  galleryDeleteButton: {
    padding: 6,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    borderRadius: 6,
  },
  galleryItemOverlay: {
    position: "absolute",
    top: 4,
    right: 4,
    flexDirection: "row",
    gap: 4,
  },
  galleryCaptionButton: {
    padding: 6,
    backgroundColor: "rgba(76, 111, 255, 0.9)",
    borderRadius: 6,
  },
  galleryCaption: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
    paddingHorizontal: 2,
  },
  captionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  captionModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  captionModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  captionModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  captionInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#111827",
    minHeight: 80,
    textAlignVertical: "top",
  },
  captionModalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    gap: 12,
  },
  captionButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  captionCancelButton: {
    backgroundColor: "#f3f4f6",
  },
  captionCancelText: {
    color: "#6b7280",
    fontWeight: "600",
  },
  captionSaveButton: {
    backgroundColor: "#4c6fff",
  },
  captionSaveText: {
    color: "#fff",
    fontWeight: "600",
  },
  artistName: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  artistMeta: {
    color: "#6b7280",
    marginBottom: 10,
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
  sectionLabel: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  choiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  choiceChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
    marginRight: 8,
    marginBottom: 8,
  },
  choiceText: {
    color: "#4c6fff",
    fontSize: 12,
    fontWeight: "600",
  },
  choiceChipSelected: {
    backgroundColor: "#4c6fff",
    borderColor: "#4c6fff",
  },
  choiceTextSelected: {
    color: "#fff",
  },
  hintText: {
    color: "#9ca3af",
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 12,
  },
  primaryButtonDisabled: {
    backgroundColor: "#9ca3af",
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
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  rowText: {
    color: "#6b7280",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#fee2e2",
  },
  logoutText: {
    color: "#ef4444",
    fontWeight: "700",
    fontSize: 15,
  },
  logoutButtonContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  // More Options Section
  moreOptionsCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  moreOptionsTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  moreOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  moreOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  moreOptionContent: {
    flex: 1,
  },
  moreOptionText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  moreOptionHint: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  deleteButtonText: {
    color: "#ef4444",
    fontWeight: "600",
    fontSize: 13,
    marginLeft: 6,
    letterSpacing: 0.2,
  },
  adminButtonContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  adminButton: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  adminButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  adminIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  adminButtonText: {
    flex: 1,
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.3,
  },
  businessActionsContainer: {
    width: "100%",
  },
  // Language picker styles
  languageCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  languageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  languageTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 12,
  },
  languageDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f0f4ff",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4c6fff",
  },
  languageDropdownText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4c6fff",
  },
  languageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  languageModalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 320,
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },
  languageOptionActive: {
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#4c6fff",
  },
  languageOptionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
  },
  languageOptionTextActive: {
    color: "#4c6fff",
    fontWeight: "600",
  },
  languageButtons: {
    flexDirection: "row",
    gap: 8,
  },
  languageButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  languageButtonActive: {
    backgroundColor: "#4c6fff",
    borderColor: "#4c6fff",
  },
  languageButtonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  languageButtonTextActive: {
    color: "#fff",
  },
  dangerCardContainer: {
    paddingHorizontal: 16,
    marginBottom: 24,
    marginTop: 8,
  },
  dangerCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: "#fecaca",
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  dangerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  dangerIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#fef2f2",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#991b1b",
  },
  dangerDescription: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  deleteAccountButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    height: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fecaca",
  },
  deleteAccountText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 14,
  },
  jobsButtonContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  jobsButton: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#4c6fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  jobsButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  jobsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  jobsButtonText: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  mediaPreview: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginBottom: 10,
  },
  emptyText: {
    color: "#9ca3af",
    textAlign: "center",
    paddingVertical: 24,
    fontSize: 14,
  },
  // Friends Carousel Styles
  friendsCarousel: {
    paddingVertical: 8,
  },
  friendCard: {
    alignItems: "center",
    marginRight: 16,
    width: 80,
  },
  friendAvatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  friendAvatarLargeImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  friendAvatarLargeText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#4c6fff",
  },
  friendCardName: {
    fontSize: 12,
    fontWeight: "500",
    color: "#111827",
    textAlign: "center",
    marginBottom: 4,
  },
  seeProfileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeProfileText: {
    fontSize: 10,
    color: "#4c6fff",
    fontWeight: "500",
  },
  // Gallery Section Styles
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
  addMediaButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  // Profile Section Header
  profileSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
});

import React, { useState, useRef, useEffect } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Camera } from "expo-camera";
import { useAuth } from "../context/AuthContext";
import { updateProfile, uploadImageToCloudinary } from "../lib/api";

const { width, height } = Dimensions.get("window");

type OnboardingStep = "features" | "permissions" | "profile" | "complete";

interface FeatureSlide {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  color: string;
  gradient: [string, string];
}

interface Permission {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  granted: boolean;
  optional: boolean;
}

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken, user, refreshUser } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("features");
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  
  // Permission states
  const [permissions, setPermissions] = useState<Permission[]>([
    { id: "camera", name: "Camera", description: "Take photos and videos for stories", icon: "camera", granted: false, optional: false },
    { id: "location", name: "Location", description: "Find events and friends near you", icon: "location", granted: false, optional: false },
    { id: "notifications", name: "Notifications", description: "Stay updated on events and messages", icon: "notifications", granted: false, optional: true },
  ]);
  const [permissionLoading, setPermissionLoading] = useState<string | null>(null);
  
  // Profile setup states
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [locationText, setLocationText] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const featureSlides: FeatureSlide[] = [
    {
      id: "welcome",
      icon: "sparkles",
      title: t("onboarding.welcomeTitle") || "Welcome to Perix",
      description: t("onboarding.welcomeDesc") || "Your city's social hub. Discover events, connect with friends, and share your experiences.",
      color: "#4c6fff",
      gradient: ["#4c6fff", "#6366f1"],
    },
    {
      id: "discover",
      icon: "compass",
      title: t("onboarding.discoverTitle") || "Discover Your City",
      description: t("onboarding.discoverDesc") || "Find the best events, artists, and businesses near you. Explore what's happening in your neighborhood.",
      color: "#8b5cf6",
      gradient: ["#8b5cf6", "#a855f7"],
    },
    {
      id: "connect",
      icon: "people",
      title: t("onboarding.connectTitle") || "Connect with Friends",
      description: t("onboarding.connectDesc") || "Add friends, join activities, and share moments. Build your social circle and never miss a gathering.",
      color: "#ec4899",
      gradient: ["#ec4899", "#f472b6"],
    },
    {
      id: "events",
      icon: "calendar",
      title: t("onboarding.eventsTitle") || "Events & Activities",
      description: t("onboarding.eventsDesc") || "Create or join events, plan activities with friends, and RSVP to parties and concerts.",
      color: "#f59e0b",
      gradient: ["#f59e0b", "#fbbf24"],
    },
    {
      id: "stories",
      icon: "camera",
      title: t("onboarding.storiesTitle") || "Share Your Story",
      description: t("onboarding.storiesDesc") || "Post stories with music, filters, and movable text. Make your content stand out.",
      color: "#10b981",
      gradient: ["#10b981", "#34d399"],
    },
    {
      id: "calls",
      icon: "videocam",
      title: t("onboarding.callsTitle") || "Stay in Touch",
      description: t("onboarding.callsDesc") || "Voice and video calls with friends. Message anyone, anytime. All in one place.",
      color: "#ef4444",
      gradient: ["#ef4444", "#f87171"],
    },
  ];

  const handleFeatureScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / width);
    setCurrentSlide(index);
  };

  const goToNextSlide = () => {
    if (currentSlide < featureSlides.length - 1) {
      scrollViewRef.current?.scrollTo({
        x: (currentSlide + 1) * width,
        animated: true,
      });
    } else {
      setCurrentStep("permissions");
    }
  };

  const goToPrevSlide = () => {
    if (currentSlide > 0) {
      scrollViewRef.current?.scrollTo({
        x: (currentSlide - 1) * width,
        animated: true,
      });
    }
  };

  // Request permission
  const requestPermission = async (permId: string) => {
    setPermissionLoading(permId);
    let granted = false;
    
    try {
      switch (permId) {
        case "camera":
          const cameraResult = await Camera.requestCameraPermissionsAsync();
          granted = cameraResult.status === "granted";
          break;
        case "location":
          const locationResult = await Location.requestForegroundPermissionsAsync();
          granted = locationResult.status === "granted";
          break;
        case "notifications":
          const notifResult = await Notifications.requestPermissionsAsync();
          granted = notifResult.status === "granted";
          break;
      }
      
      setPermissions(perms => 
        perms.map(p => p.id === permId ? { ...p, granted } : p)
      );
    } catch (e) {
      console.log("Permission request failed:", e);
    }
    
    setPermissionLoading(null);
  };

  // Check all permissions
  const checkAllPermissions = async () => {
    try {
      const cameraStatus = await Camera.getCameraPermissionsAsync();
      const locationStatus = await Location.getForegroundPermissionsAsync();
      const notifStatus = await Notifications.getPermissionsAsync();
      
      setPermissions(perms => perms.map(p => {
        if (p.id === "camera") return { ...p, granted: cameraStatus.status === "granted" };
        if (p.id === "location") return { ...p, granted: locationStatus.status === "granted" };
        if (p.id === "notifications") return { ...p, granted: notifStatus.status === "granted" };
        return p;
      }));
    } catch (e) {
      console.log("Permission check failed:", e);
    }
  };

  useEffect(() => {
    if (currentStep === "permissions") {
      checkAllPermissions();
    }
  }, [currentStep]);

  // Profile photo picker
  const pickProfilePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets?.[0]?.uri) {
        setUploadingPhoto(true);
        try {
          if (sessionToken) {
            const uploadedUrl = await uploadImageToCloudinary(sessionToken, result.assets[0].uri);
            setProfilePhoto(uploadedUrl);
          } else {
            setProfilePhoto(result.assets[0].uri);
          }
        } catch (e) {
          setProfilePhoto(result.assets[0].uri);
        }
        setUploadingPhoto(false);
      }
    } catch (e) {
      console.log("Image picker error:", e);
    }
  };

  // Save profile
  const saveProfile = async () => {
    if (!sessionToken) {
      setCurrentStep("complete");
      return;
    }
    
    setSavingProfile(true);
    try {
      await updateProfile(sessionToken, {
        profile_photo: profilePhoto || undefined,
        bio: bio.trim() || undefined,
        location: locationText.trim() || undefined,
      });
      await refreshUser?.();
    } catch (e) {
      console.log("Profile save failed:", e);
    }
    setSavingProfile(false);
    setCurrentStep("complete");
  };

  // Complete onboarding
  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem("@onboarding_complete", "true");
    } catch (e) {
      console.log("Failed to save onboarding status");
    }
    router.replace("/(tabs)/home");
  };

  const skipOnboarding = async () => {
    try {
      await AsyncStorage.setItem("@onboarding_complete", "true");
    } catch (e) {
      console.log("Failed to save onboarding status");
    }
    router.replace("/(tabs)/home");
  };

  const currentFeature = featureSlides[currentSlide];
  const requiredPermissionsGranted = permissions.filter(p => !p.optional).every(p => p.granted);

  // Render Features Step
  const renderFeaturesStep = () => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ width: 60 }} />
        <View style={styles.pagination}>
          {featureSlides.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentSlide === index && { 
                  backgroundColor: currentFeature.color,
                  width: 24,
                },
              ]}
            />
          ))}
        </View>
        <Pressable style={styles.skipButton} onPress={skipOnboarding}>
          <Text style={styles.skipText}>{t("onboarding.skip") || "Skip"}</Text>
        </Pressable>
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false, listener: handleFeatureScroll }
        )}
        scrollEventThrottle={16}
      >
        {featureSlides.map((slide) => (
          <View key={slide.id} style={styles.slide}>
            <View style={styles.iconContainer}>
              <LinearGradient colors={slide.gradient} style={styles.iconGradient}>
                <Ionicons name={slide.icon} size={64} color="#fff" />
              </LinearGradient>
              <View style={[styles.decorCircle, styles.decorCircle1, { backgroundColor: `${slide.color}20` }]} />
              <View style={[styles.decorCircle, styles.decorCircle2, { backgroundColor: `${slide.color}15` }]} />
              <View style={[styles.decorCircle, styles.decorCircle3, { backgroundColor: `${slide.color}10` }]} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: slide.color }]}>{slide.title}</Text>
              <Text style={styles.description}>{slide.description}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Navigation */}
      <View style={styles.footer}>
        {currentSlide > 0 ? (
          <Pressable style={styles.prevButton} onPress={goToPrevSlide}>
            <Ionicons name="chevron-back" size={24} color="#6b7280" />
          </Pressable>
        ) : (
          <View style={{ width: 56 }} />
        )}
        <Pressable style={styles.nextButton} onPress={goToNextSlide}>
          <LinearGradient colors={currentFeature.gradient} style={styles.nextButtonGradient}>
            <Text style={styles.nextButtonText}>
              {currentSlide === featureSlides.length - 1 ? (t("onboarding.continue") || "Continue") : (t("onboarding.next") || "Next")}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
    </>
  );

  // Render Permissions Step
  const renderPermissionsStep = () => (
    <>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t("onboarding.permissionsTitle") || "Enable Permissions"}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding.permissionsDesc") || "These help Perix work better for you"}</Text>
      </View>
      
      <ScrollView style={styles.permissionsContainer} contentContainerStyle={styles.permissionsContent}>
        {permissions.map((perm) => (
          <Pressable
            key={perm.id}
            style={[styles.permissionCard, perm.granted && styles.permissionCardGranted]}
            onPress={() => !perm.granted && requestPermission(perm.id)}
            disabled={perm.granted || permissionLoading === perm.id}
          >
            <View style={[styles.permissionIconBg, perm.granted && styles.permissionIconBgGranted]}>
              <Ionicons 
                name={perm.granted ? "checkmark" : perm.icon} 
                size={24} 
                color={perm.granted ? "#fff" : "#4c6fff"} 
              />
            </View>
            <View style={styles.permissionInfo}>
              <View style={styles.permissionHeader}>
                <Text style={styles.permissionName}>{perm.name}</Text>
                {perm.optional && <Text style={styles.optionalBadge}>Optional</Text>}
              </View>
              <Text style={styles.permissionDesc}>{perm.description}</Text>
            </View>
            {permissionLoading === perm.id ? (
              <ActivityIndicator size="small" color="#4c6fff" />
            ) : !perm.granted && (
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            )}
          </Pressable>
        ))}
      </ScrollView>
      
      <View style={styles.footer}>
        <Pressable style={styles.prevButton} onPress={() => setCurrentStep("features")}>
          <Ionicons name="chevron-back" size={24} color="#6b7280" />
        </Pressable>
        <Pressable 
          style={[styles.nextButton, !requiredPermissionsGranted && styles.buttonDisabled]} 
          onPress={() => setCurrentStep("profile")}
        >
          <LinearGradient 
            colors={requiredPermissionsGranted ? ["#4c6fff", "#6366f1"] : ["#9ca3af", "#9ca3af"]} 
            style={styles.nextButtonGradient}
          >
            <Text style={styles.nextButtonText}>{t("onboarding.continue") || "Continue"}</Text>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
    </>
  );

  // Render Profile Setup Step
  const renderProfileStep = () => (
    <>
      <View style={styles.stepHeader}>
        <Text style={styles.stepTitle}>{t("onboarding.profileTitle") || "Set Up Your Profile"}</Text>
        <Text style={styles.stepSubtitle}>{t("onboarding.profileDesc") || "Help others find and recognize you"}</Text>
      </View>
      
      <ScrollView style={styles.profileContainer} contentContainerStyle={styles.profileContent}>
        {/* Profile Photo */}
        <Pressable style={styles.photoPickerContainer} onPress={pickProfilePhoto} disabled={uploadingPhoto}>
          <View style={styles.photoPicker}>
            {uploadingPhoto ? (
              <ActivityIndicator size="large" color="#4c6fff" />
            ) : profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.profilePhotoPreview} />
            ) : (
              <>
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera" size={40} color="#9ca3af" />
                </View>
                <Text style={styles.photoPickerText}>{t("onboarding.addPhoto") || "Add Photo"}</Text>
              </>
            )}
          </View>
          {profilePhoto && (
            <Pressable style={styles.changePhotoButton} onPress={pickProfilePhoto}>
              <Ionicons name="pencil" size={16} color="#4c6fff" />
              <Text style={styles.changePhotoText}>{t("onboarding.changePhoto") || "Change"}</Text>
            </Pressable>
          )}
        </Pressable>
        
        {/* Bio */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t("onboarding.bio") || "Bio"}</Text>
          <TextInput
            style={styles.bioInput}
            placeholder={t("onboarding.bioPlaceholder") || "Tell us a bit about yourself..."}
            placeholderTextColor="#9ca3af"
            value={bio}
            onChangeText={setBio}
            multiline
            maxLength={150}
          />
          <Text style={styles.charCount}>{bio.length}/150</Text>
        </View>
        
        {/* Location */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t("onboarding.location") || "Location"}</Text>
          <TextInput
            style={styles.textInput}
            placeholder={t("onboarding.locationPlaceholder") || "Your city or neighborhood"}
            placeholderTextColor="#9ca3af"
            value={locationText}
            onChangeText={setLocationText}
          />
        </View>
        
        <Text style={styles.skipProfileText}>
          {t("onboarding.skipProfileHint") || "You can always update these later in your profile settings"}
        </Text>
      </ScrollView>
      
      <View style={styles.footer}>
        <Pressable style={styles.prevButton} onPress={() => setCurrentStep("permissions")}>
          <Ionicons name="chevron-back" size={24} color="#6b7280" />
        </Pressable>
        <View style={styles.footerButtons}>
          <Pressable style={styles.skipProfileButton} onPress={() => setCurrentStep("complete")}>
            <Text style={styles.skipProfileButtonText}>{t("onboarding.skipForNow") || "Skip for now"}</Text>
          </Pressable>
          <Pressable style={styles.nextButton} onPress={saveProfile} disabled={savingProfile}>
            <LinearGradient colors={["#4c6fff", "#6366f1"]} style={styles.nextButtonGradient}>
              {savingProfile ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.nextButtonText}>{t("onboarding.saveProfile") || "Save"}</Text>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </>
  );

  // Render Complete Step
  const renderCompleteStep = () => (
    <View style={styles.completeContainer}>
      <LinearGradient colors={["#4c6fff", "#8b5cf6"]} style={styles.completeIconBg}>
        <Ionicons name="checkmark-circle" size={80} color="#fff" />
      </LinearGradient>
      
      <Text style={styles.completeTitle}>{t("onboarding.allSetTitle") || "You're All Set!"}</Text>
      <Text style={styles.completeDesc}>
        {t("onboarding.allSetDesc") || "Welcome to Perix! Start exploring events, connecting with friends, and sharing your experiences."}
      </Text>
      
      <View style={styles.tipCard}>
        <Ionicons name="bulb" size={24} color="#f59e0b" />
        <Text style={styles.tipText}>
          {t("onboarding.tip") || "Tip: Tap the + button on the home screen to create your first story!"}
        </Text>
      </View>
      
      <Pressable style={styles.getStartedButton} onPress={completeOnboarding}>
        <LinearGradient colors={["#4c6fff", "#6366f1"]} style={styles.getStartedGradient}>
          <Text style={styles.getStartedText}>{t("onboarding.getStarted") || "Get Started"}</Text>
          <Ionicons name="arrow-forward" size={22} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {currentStep === "features" && renderFeaturesStep()}
      {currentStep === "permissions" && renderPermissionsStep()}
      {currentStep === "profile" && renderProfileStep()}
      {currentStep === "complete" && renderCompleteStep()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: "#6b7280",
    fontSize: 16,
    fontWeight: "600",
  },
  slide: {
    width,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  iconContainer: {
    position: "relative",
    marginBottom: 48,
  },
  iconGradient: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  decorCircle: {
    position: "absolute",
    borderRadius: 1000,
  },
  decorCircle1: {
    width: 200,
    height: 200,
    top: -30,
    left: -30,
    zIndex: 1,
  },
  decorCircle2: {
    width: 260,
    height: 260,
    top: -60,
    left: -60,
    zIndex: 0,
  },
  decorCircle3: {
    width: 320,
    height: 320,
    top: -90,
    left: -90,
    zIndex: -1,
  },
  textContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 26,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  footerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  prevButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  nextButton: {
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#4c6fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  nextButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 8,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  // Step Header
  stepHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: "#6b7280",
    lineHeight: 24,
  },
  // Permissions
  permissionsContainer: {
    flex: 1,
  },
  permissionsContent: {
    paddingHorizontal: 24,
    gap: 12,
  },
  permissionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  permissionCardGranted: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  permissionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  permissionIconBgGranted: {
    backgroundColor: "#10b981",
  },
  permissionInfo: {
    flex: 1,
  },
  permissionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  permissionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  optionalBadge: {
    fontSize: 11,
    color: "#6b7280",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  permissionDesc: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 4,
  },
  // Profile Setup
  profileContainer: {
    flex: 1,
  },
  profileContent: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  photoPickerContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  photoPicker: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  photoPickerText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  profilePhotoPreview: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  changePhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 4,
  },
  changePhotoText: {
    fontSize: 14,
    color: "#4c6fff",
    fontWeight: "600",
  },
  inputGroup: {
    width: "100%",
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
  },
  bioInput: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#111827",
    minHeight: 100,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "right",
    marginTop: 4,
  },
  skipProfileText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 8,
  },
  skipProfileButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  skipProfileButtonText: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "600",
  },
  // Complete
  completeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  completeIconBg: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  completeTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  completeDesc: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 32,
  },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffbeb",
    borderRadius: 16,
    padding: 16,
    marginBottom: 40,
    gap: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: "#92400e",
    lineHeight: 22,
  },
  getStartedButton: {
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#4c6fff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  getStartedGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 40,
    gap: 12,
  },
  getStartedText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});

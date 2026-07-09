import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "../lib/designTokens";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { updateProfileInfo, updateProfileMedia, uploadImageToCloudinary } from "../lib/api";
import CityAutocompleteInput from "../components/CityAutocompleteInput";

type OnboardingStep = "permissions" | "profile" | "complete";

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
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("permissions");

  const [permissions, setPermissions] = useState<Permission[]>([
    { id: "camera", name: "Camera", description: t("onboarding.cameraDesc") || "Take photos and videos for stories", icon: "camera", granted: false, optional: false },
    { id: "location", name: "Location", description: t("onboarding.locationDesc") || "Find events and friends near you", icon: "location", granted: false, optional: false },
    { id: "notifications", name: "Notifications", description: t("onboarding.notifDesc") || "Stay updated on events and messages", icon: "notifications", granted: false, optional: true },
  ]);
  const [permissionLoading, setPermissionLoading] = useState<string | null>(null);

  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [locationText, setLocationText] = useState("");
  const [cityLat, setCityLat] = useState<number | undefined>(undefined);
  const [cityLng, setCityLng] = useState<number | undefined>(undefined);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    checkAllPermissions();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("@onboarding_city").then((c) => { if (c) setLocationText(c); });
  }, []);

  const handleCitySelect = (cityName: string, lat: number, lng: number) => {
    setCityLat(lat || undefined);
    setCityLng(lng || undefined);
  };

  const requestPermission = async (permId: string) => {
    setPermissionLoading(permId);
    let granted = false;
    try {
      switch (permId) {
        case "camera": {
          const r = await ImagePicker.requestCameraPermissionsAsync();
          granted = r.status === "granted";
          break;
        }
        case "location": {
          const r = await Location.requestForegroundPermissionsAsync();
          granted = r.status === "granted";
          break;
        }
        case "notifications": {
          const r = await Notifications.requestPermissionsAsync();
          granted = r.status === "granted";
          break;
        }
      }
      setPermissions((p) => p.map((x) => (x.id === permId ? { ...x, granted } : x)));
    } catch (e) {
      console.log("Permission request failed:", e);
    }
    setPermissionLoading(null);
  };

  const checkAllPermissions = async () => {
    try {
      const cam = await ImagePicker.getCameraPermissionsAsync();
      const loc = await Location.getForegroundPermissionsAsync();
      const notif = await Notifications.getPermissionsAsync();
      setPermissions((p) =>
        p.map((x) => {
          if (x.id === "camera") return { ...x, granted: cam.status === "granted" };
          if (x.id === "location") return { ...x, granted: loc.status === "granted" };
          if (x.id === "notifications") return { ...x, granted: notif.status === "granted" };
          return x;
        })
      );
    } catch (e) {
      console.log("Permission check failed:", e);
    }
  };

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
        } catch {
          setProfilePhoto(result.assets[0].uri);
        }
        setUploadingPhoto(false);
      }
    } catch (e) {
      console.log("Image picker error:", e);
    }
  };

  const saveProfile = async () => {
    if (!sessionToken) {
      setCurrentStep("complete");
      return;
    }
    setSavingProfile(true);
    try {
      if (profilePhoto) {
        await updateProfileMedia(sessionToken, { profile_photo: profilePhoto });
      }
      await updateProfileInfo(sessionToken, {
        bio: bio.trim() || undefined,
        location: locationText.trim() || undefined,
        latitude: cityLat,
        longitude: cityLng,
      });
      await refreshUser?.();
    } catch (e) {
      console.log("Profile save failed:", e);
    }
    setSavingProfile(false);
    setCurrentStep("complete");
  };

  const completeOnboarding = async () => {
    await AsyncStorage.removeItem("@onboarding_city");
    await AsyncStorage.setItem("@onboarding_complete", "true");
    router.replace("/(tabs)/home");
  };

  const skipOnboarding = async () => {
    await AsyncStorage.removeItem("@onboarding_city");
    await AsyncStorage.setItem("@onboarding_complete", "true");
    router.replace("/(tabs)/home");
  };

  const requiredGranted = permissions.filter((p) => !p.optional).every((p) => p.granted);

  // Auto-complete when all required permissions are granted
  useEffect(() => {
    if (requiredGranted) {
      const timer = setTimeout(() => completeOnboarding(), 800);
      return () => clearTimeout(timer);
    }
  }, [requiredGranted]);

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.inner}>
          {currentStep === "permissions" && (
            <>
              <View style={s.stepHeader}>
                <Text style={s.stepTitle}>{t("onboarding.permissionsTitle") || "Enable Permissions"}</Text>
                <Text style={s.stepSubtitle}>{t("onboarding.permissionsDesc") || "These help Perix work better for you"}</Text>
              </View>

              <View style={s.cardList}>
                {permissions.map((perm) => (
                  <Pressable
                    key={perm.id}
                    style={[s.card, perm.granted && s.cardGranted]}
                    onPress={() => !perm.granted && requestPermission(perm.id)}
                    disabled={perm.granted || permissionLoading === perm.id}
                  >
                    <View style={[s.cardIconBg, perm.granted && s.cardIconBgGranted]}>
                      <Ionicons name={perm.granted ? "checkmark" : perm.icon} size={22} color={perm.granted ? "#fff" : COLORS.textPrimary} />
                    </View>
                    <View style={s.cardInfo}>
                      <View style={s.cardHeader}>
                        <Text style={s.cardName}>{perm.name}</Text>
                        {perm.optional && <Text style={s.optionalBadge}>Optional</Text>}
                      </View>
                      <Text style={s.cardDesc}>{perm.description}</Text>
                    </View>
                    {permissionLoading === perm.id ? (
                      <ActivityIndicator size="small" color={COLORS.textPrimary} />
                    ) : !perm.granted ? (
                      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <View style={s.footer}>
                <Pressable onPress={skipOnboarding}>
                  <Text style={s.skipText}>{t("onboarding.skip") || "Skip"}</Text>
                </Pressable>
                <Pressable style={[s.primaryBtn, !requiredGranted && s.btnDisabled]} onPress={() => completeOnboarding()}>
                  <LinearGradient colors={requiredGranted ? [COLORS.primaryDark, "#FFD700"] : ["#9ca3af", "#9ca3af"]} style={s.primaryBtnInner}>
                    <Text style={s.primaryBtnText}>{t("onboarding.continue") || "Continue"}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#fff" />
                  </LinearGradient>
                </Pressable>
              </View>
            </>
          )}

          {currentStep === "profile" && (
            <>
              <View style={s.stepHeader}>
                <Text style={s.stepTitle}>{t("onboarding.profileTitle") || "Set Up Your Profile"}</Text>
                <Text style={s.stepSubtitle}>{t("onboarding.profileDesc") || "Help others find and recognize you"}</Text>
              </View>

              <View style={s.profileContent}>
                {user?.name && (
                  <Text style={s.nameDisplay}>{user.name}</Text>
                )}
                <Pressable style={s.photoWrap} onPress={pickProfilePhoto} disabled={uploadingPhoto}>
                  <View style={s.photoCircle}>
                    {uploadingPhoto ? (
                      <ActivityIndicator size="large" color={COLORS.textPrimary} />
                    ) : profilePhoto ? (
                      <Image source={{ uri: profilePhoto }} style={s.photoImg} />
                    ) : (
                      <Ionicons name="camera-outline" size={40} color="#9ca3af" />
                    )}
                  </View>
                  <Text style={s.photoLabel}>
                    {profilePhoto ? (t("onboarding.changePhoto") || "Change") : (t("onboarding.addPhoto") || "Add Photo")}
                  </Text>
                </Pressable>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>{t("onboarding.bio") || "Bio"}</Text>
                  <TextInput
                    style={s.input}
                    placeholder={t("onboarding.bioPlaceholder") || "Tell us a bit about yourself..."}
                    placeholderTextColor="#9ca3af"
                    value={bio}
                    onChangeText={setBio}
                    multiline
                    maxLength={150}
                  />
                  <Text style={s.charCount}>{bio.length}/150</Text>
                </View>

                <View style={s.inputGroup}>
                  <Text style={s.inputLabel}>{t("onboarding.location") || "Location"}</Text>
                  <CityAutocompleteInput
                    value={locationText}
                    onChangeText={setLocationText}
                    onSelectCity={handleCitySelect}
                    placeholder={t("onboarding.locationPlaceholder") || "Your city or neighborhood"}
                  />
                </View>

                <Text style={s.hint}>{t("onboarding.skipProfileHint") || "You can update these later in your profile settings"}</Text>
              </View>

              <View style={s.footer}>
                <Pressable onPress={() => setCurrentStep("permissions")}>
                  <Ionicons name="chevron-back" size={24} color="#6b7280" />
                </Pressable>
                <View style={s.footerRight}>
                  <Pressable onPress={() => setCurrentStep("complete")}>
                    <Text style={s.skipText}>{t("onboarding.skipForNow") || "Skip for now"}</Text>
                  </Pressable>
                  <Pressable style={s.primaryBtn} onPress={saveProfile} disabled={savingProfile}>
                    <LinearGradient colors={[COLORS.primaryDark, "#FFD700"]} style={s.primaryBtnInner}>
                      {savingProfile ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Text style={s.primaryBtnText}>{t("onboarding.saveProfile") || "Save"}</Text>
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                </View>
              </View>
            </>
          )}

          {currentStep === "complete" && (
            <View style={s.completeWrap}>
              <LinearGradient colors={[COLORS.primaryDark, "#FFD700"]} style={s.completeIcon}>
                <Ionicons name="checkmark-circle" size={72} color="#fff" />
              </LinearGradient>
              <Text style={s.completeTitle}>{t("onboarding.allSetTitle") || "You're All Set!"}</Text>
              <Text style={s.completeDesc}>{t("onboarding.allSetDesc") || "Start exploring events, connecting with friends, and sharing your experiences."}</Text>

              <View style={s.tipCard}>
                <Ionicons name="bulb" size={22} color="#f59e0b" />
                <Text style={s.tipText}>{t("onboarding.tip") || "Tip: Tap the + button on the home screen to create your first post!"}</Text>
              </View>

              <Pressable style={s.getStartedBtn} onPress={completeOnboarding}>
                <LinearGradient colors={[COLORS.primaryDark, "#FFD700"]} style={s.primaryBtnInner}>
                  <Text style={s.primaryBtnText}>{t("onboarding.getStarted") || "Get Started"}</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </LinearGradient>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  scroll: { flexGrow: 1 },
  inner: { flex: 1, paddingHorizontal: 24, paddingVertical: 24 },

  // Step header
  stepHeader: { marginBottom: 24 },
  stepTitle: { fontSize: 24, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 8 },
  stepSubtitle: { fontSize: 15, color: "#6b7280", lineHeight: 22 },

  // Cards (permissions)
  cardList: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardGranted: { borderColor: "#10b981", backgroundColor: COLORS.primaryLight },
  cardIconBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardIconBgGranted: { backgroundColor: "#10b981" },
  cardInfo: { flex: 1 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardName: { fontSize: 15, fontWeight: "600", color: COLORS.textPrimary },
  optionalBadge: {
    fontSize: 10,
    color: "#6b7280",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  cardDesc: { fontSize: 13, color: "#6b7280", marginTop: 3 },

  // Profile
  profileContent: { flex: 1, alignItems: "center" },
  nameDisplay: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 16 },
  photoWrap: { alignItems: "center", marginBottom: 24 },
  photoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImg: { width: 120, height: 120, borderRadius: 60 },
  photoLabel: { marginTop: 10, fontSize: 14, fontWeight: "600", color: COLORS.textPrimary },

  inputGroup: { width: "100%", marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.select({ ios: 14, android: 12 }),
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  charCount: { fontSize: 11, color: "#9ca3af", textAlign: "right", marginTop: 4 },
  hint: { fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 8 },

  // Footer buttons
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 16,
    marginTop: "auto",
  },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  skipText: { fontSize: 15, color: "#6b7280", fontWeight: "600" },
  primaryBtn: { borderRadius: 28, overflow: "hidden" },
  primaryBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 28,
    gap: 6,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },

  // Complete
  completeWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  completeIcon: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  completeTitle: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 12, textAlign: "center" },
  completeDesc: { fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 24, marginBottom: 28 },
  tipCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
    gap: 12,
  },
  tipText: { flex: 1, fontSize: 13, color: "#374151", lineHeight: 20 },
  getStartedBtn: { borderRadius: 28, overflow: "hidden" },
});

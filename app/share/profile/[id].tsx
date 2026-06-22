import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../context/AuthContext";
import { COLORS } from "../../../lib/designTokens";
import Constants from "expo-constants";

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || "https://api.perixapp.com";
const API_BASE = `${BACKEND_URL}/api`;

// App store links (placeholder until real links are available)
const APP_STORE_LINK = "https://apps.apple.com/app/perix"; // Placeholder
const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.perix.app"; // Placeholder

interface UserData {
  user_id: string;
  display_name: string;
  profile_image?: string;
  bio?: string;
  location?: string;
  friend_count?: number;
  post_count?: number;
}

export default function ShareUserPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user: currentUser, sessionToken } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserPreview();
  }, [id]);

  const fetchUserPreview = async () => {
    if (!id) {
      setError("Invalid profile link");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/preview/user/${id}`);
      if (response.ok) {
        const data = await response.json();
        setUserData(data);
      } else if (response.status === 404) {
        setError("User not found");
      } else {
        setError("Unable to load profile");
      }
    } catch (e) {
      console.error("Error fetching user:", e);
      setError("Unable to load profile");
    }
    setLoading(false);
  };

  const handleOpenInApp = () => {
    if (currentUser && sessionToken) {
      router.push(`/user/${id}`);
    } else {
      const deepLink = `perix://user/${id}`;
      Linking.canOpenURL(deepLink).then((supported) => {
        if (supported) {
          Linking.openURL(deepLink);
        } else {
          router.push("/login");
        }
      });
    }
  };

  const handleDownloadApp = () => {
    // Open app store link based on platform
    if (Platform.OS === "web") {
      // On web, show both store options or a landing page
      Linking.openURL(APP_STORE_LINK).catch(() => {
        // Fallback to login page if link fails
        router.push("/login");
      });
    } else if (Platform.OS === "ios") {
      Linking.openURL(APP_STORE_LINK);
    } else {
      Linking.openURL(PLAY_STORE_LINK);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
      </View>
    );
  }

  if (error || !userData) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>{error || "Profile not found"}</Text>
          <Text style={styles.errorText}>
            This profile may have been removed or is not available.
          </Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/login")}>
            <Text style={styles.primaryButtonText}>Open Perix</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Image source={require("../../../assets/images/prx-logo.jpg")} style={styles.logo} />
        <Text style={styles.brandName}>Perix</Text>
      </View>

      <View style={styles.previewCard}>
        <View style={styles.profileHeader}>
          {userData.profile_image ? (
            <Image source={{ uri: userData.profile_image }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
              <Ionicons name="person" size={40} color="#9ca3af" />
            </View>
          )}
          
          <Text style={styles.displayName}>{userData.display_name}</Text>
          
          {userData.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color="#6b7280" />
              <Text style={styles.locationText}>{userData.location}</Text>
            </View>
          )}
        </View>
        
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userData.post_count || 0}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{userData.friend_count || 0}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
        </View>
        
        {userData.bio && (
          <View style={styles.bioContainer}>
            <Text style={styles.bio} numberOfLines={4}>{userData.bio}</Text>
          </View>
        )}
      </View>

      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Connect with {userData.display_name} on Perix</Text>
        <Text style={styles.ctaText}>
          Join Perix to connect with friends and discover your city.
        </Text>
        
        <Pressable style={styles.primaryButton} onPress={handleOpenInApp}>
          <Ionicons name="open" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>
            {currentUser ? "View Profile" : "Open in Perix"}
          </Text>
        </Pressable>
        
        {!currentUser && Platform.OS === "web" && (
          <Pressable style={styles.secondaryButton} onPress={handleDownloadApp}>
            <Text style={styles.secondaryButtonText}>Get the Perix App</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2025 Perix. All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 24, paddingTop: 20 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  brandName: { fontSize: 24, fontWeight: "700", color: COLORS.primaryDark, marginLeft: 10 },
  errorCard: { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center", margin: 20 },
  errorTitle: { fontSize: 18, fontWeight: "600", color: "#111827", marginTop: 16, marginBottom: 8 },
  errorText: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24 },
  previewCard: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  profileHeader: { alignItems: "center", padding: 24, paddingBottom: 16 },
  profileImage: { width: 100, height: 100, borderRadius: 50, marginBottom: 16 },
  profileImagePlaceholder: { backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  displayName: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 8 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 14, color: "#6b7280" },
  statsRow: { flexDirection: "row", justifyContent: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  statItem: { alignItems: "center", paddingHorizontal: 32 },
  statValue: { fontSize: 20, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  statDivider: { width: 1, backgroundColor: "#e5e7eb" },
  bioContainer: { padding: 20, paddingTop: 0 },
  bio: { fontSize: 14, color: "#374151", lineHeight: 22, textAlign: "center" },
  ctaSection: { marginTop: 24, alignItems: "center" },
  ctaTitle: { fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 8, textAlign: "center" },
  ctaText: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 20 },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primaryDark, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, gap: 8, width: "100%", maxWidth: 300 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 24 },
  secondaryButtonText: { color: COLORS.primaryDark, fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 40, alignItems: "center" },
  footerText: { fontSize: 12, color: "#9ca3af" },
});

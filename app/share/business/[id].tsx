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
import Constants from "expo-constants";

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || "https://api.perixapp.com";
const API_BASE = `${BACKEND_URL}/api`;

// App store links (placeholder until real links are available)
const APP_STORE_LINK = "https://apps.apple.com/app/perix"; // Placeholder
const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.perix.app"; // Placeholder

interface BusinessData {
  business_id: string;
  name: string;
  profile_image?: string;
  cover_image?: string;
  description?: string;
  address?: string;
  category?: string;
  subcategory?: string;
  follower_count?: number;
}

export default function ShareBusinessPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, sessionToken } = useAuth();
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBusinessPreview();
  }, [id]);

  const fetchBusinessPreview = async () => {
    if (!id) {
      setError("Invalid business link");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/preview/business/${id}`);
      if (response.ok) {
        const data = await response.json();
        setBusiness(data);
      } else if (response.status === 404) {
        setError("Business not found");
      } else {
        setError("Unable to load business");
      }
    } catch (e) {
      console.error("Error fetching business:", e);
      setError("Unable to load business");
    }
    setLoading(false);
  };

  const handleOpenInApp = () => {
    if (user && sessionToken) {
      router.push(`/business/${id}`);
    } else {
      const deepLink = `perix://business/${id}`;
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
    if (Platform.OS === "web") {
      Linking.openURL(APP_STORE_LINK).catch(() => {
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
        <ActivityIndicator size="large" color="#4c6fff" />
      </View>
    );
  }

  if (error || !business) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>{error || "Business not found"}</Text>
          <Text style={styles.errorText}>
            This business profile may have been removed or is not available.
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
        {business.cover_image && (
          <Image source={{ uri: business.cover_image }} style={styles.coverImage} />
        )}
        
        <View style={styles.profileHeader}>
          {business.profile_image ? (
            <Image source={{ uri: business.profile_image }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
              <Ionicons name="business" size={40} color="#9ca3af" />
            </View>
          )}
          
          <Text style={styles.businessName}>{business.name}</Text>
          
          {business.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{business.category}</Text>
            </View>
          )}
          
          {business.address && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color="#6b7280" />
              <Text style={styles.locationText} numberOfLines={2}>{business.address}</Text>
            </View>
          )}
        </View>

        {business.follower_count !== undefined && business.follower_count > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{business.follower_count}</Text>
              <Text style={styles.statLabel}>Favorites</Text>
            </View>
          </View>
        )}
        
        {business.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.description} numberOfLines={4}>{business.description}</Text>
          </View>
        )}
      </View>

      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Discover {business.name} on Perix</Text>
        <Text style={styles.ctaText}>
          Find local businesses, events, and connect with your community.
        </Text>
        
        <Pressable style={styles.primaryButton} onPress={handleOpenInApp}>
          <Ionicons name="open" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>
            {user ? "View Business" : "Open in Perix"}
          </Text>
        </Pressable>
        
        {!user && Platform.OS === "web" && (
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
  container: { flex: 1, backgroundColor: "#f5f6fb" },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 24, paddingTop: 20 },
  logo: { width: 40, height: 40, borderRadius: 10 },
  brandName: { fontSize: 24, fontWeight: "700", color: "#4c6fff", marginLeft: 10 },
  errorCard: { backgroundColor: "#fff", borderRadius: 16, padding: 32, alignItems: "center", margin: 20 },
  errorTitle: { fontSize: 18, fontWeight: "600", color: "#111827", marginTop: 16, marginBottom: 8 },
  errorText: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 24 },
  previewCard: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  coverImage: { width: "100%", height: 150, backgroundColor: "#4c6fff" },
  profileHeader: { alignItems: "center", padding: 20, paddingBottom: 16, marginTop: -50 },
  profileImage: { width: 100, height: 100, borderRadius: 16, borderWidth: 4, borderColor: "#fff", backgroundColor: "#fff" },
  profileImagePlaceholder: { backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  businessName: { fontSize: 22, fontWeight: "700", color: "#111827", marginTop: 12, marginBottom: 8 },
  categoryBadge: { backgroundColor: "#f0f4ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 8 },
  categoryText: { fontSize: 12, fontWeight: "600", color: "#4c6fff" },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 20 },
  locationText: { fontSize: 14, color: "#6b7280", textAlign: "center" },
  statsRow: { flexDirection: "row", justifyContent: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  statItem: { alignItems: "center", paddingHorizontal: 32 },
  statValue: { fontSize: 20, fontWeight: "700", color: "#111827" },
  statLabel: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  descriptionContainer: { padding: 20, paddingTop: 0 },
  description: { fontSize: 14, color: "#374151", lineHeight: 22, textAlign: "center" },
  ctaSection: { marginTop: 24, alignItems: "center" },
  ctaTitle: { fontSize: 18, fontWeight: "600", color: "#111827", marginBottom: 8, textAlign: "center" },
  ctaText: { fontSize: 14, color: "#6b7280", textAlign: "center", marginBottom: 20 },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#4c6fff", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, gap: 8, width: "100%", maxWidth: 300 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondaryButton: { marginTop: 12, paddingVertical: 12, paddingHorizontal: 24 },
  secondaryButtonText: { color: "#4c6fff", fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 40, alignItems: "center" },
  footerText: { fontSize: 12, color: "#9ca3af" },
});

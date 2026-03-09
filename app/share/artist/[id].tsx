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

interface ArtistData {
  artist_id: string;
  name: string;
  profile_image?: string;
  cover_image?: string;
  bio?: string;
  genres?: string[];
  town?: string;
  follower_count?: number;
}

export default function ShareArtistPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, sessionToken } = useAuth();
  const [artist, setArtist] = useState<ArtistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArtistPreview();
  }, [id]);

  const fetchArtistPreview = async () => {
    if (!id) {
      setError("Invalid artist link");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/preview/artist/${id}`);
      if (response.ok) {
        const data = await response.json();
        setArtist(data);
      } else if (response.status === 404) {
        setError("Artist not found");
      } else {
        setError("Unable to load artist");
      }
    } catch (e) {
      console.error("Error fetching artist:", e);
      setError("Unable to load artist");
    }
    setLoading(false);
  };

  const handleOpenInApp = () => {
    if (user && sessionToken) {
      router.push(`/artist/${id}`);
    } else {
      const deepLink = `perix://artist/${id}`;
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

  if (error || !artist) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>{error || "Artist not found"}</Text>
          <Text style={styles.errorText}>
            This artist profile may have been removed or is not available.
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
        {artist.cover_image && (
          <Image source={{ uri: artist.cover_image }} style={styles.coverImage} />
        )}
        
        <View style={styles.profileHeader}>
          {artist.profile_image ? (
            <Image source={{ uri: artist.profile_image }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
              <Ionicons name="musical-notes" size={40} color="#9ca3af" />
            </View>
          )}
          
          <Text style={styles.artistName}>{artist.name}</Text>
          
          {artist.town && (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color="#6b7280" />
              <Text style={styles.locationText}>{artist.town}</Text>
            </View>
          )}
        </View>

        {artist.genres && artist.genres.length > 0 && (
          <View style={styles.genresContainer}>
            {artist.genres.slice(0, 4).map((genre, index) => (
              <View key={index} style={styles.genreBadge}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}
        
        {artist.bio && (
          <View style={styles.bioContainer}>
            <Text style={styles.bio} numberOfLines={4}>{artist.bio}</Text>
          </View>
        )}
      </View>

      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Follow {artist.name} on Perix</Text>
        <Text style={styles.ctaText}>
          Discover music, events, and connect with your favorite artists.
        </Text>
        
        <Pressable style={styles.primaryButton} onPress={handleOpenInApp}>
          <Ionicons name="open" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>
            {user ? "View Artist" : "Open in Perix"}
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
  coverImage: { width: "100%", height: 150, backgroundColor: "#7c3aed" },
  profileHeader: { alignItems: "center", padding: 20, paddingBottom: 16, marginTop: -50 },
  profileImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: "#fff" },
  profileImagePlaceholder: { backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  artistName: { fontSize: 22, fontWeight: "700", color: "#111827", marginTop: 12, marginBottom: 8 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontSize: 14, color: "#6b7280" },
  genresContainer: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  genreBadge: { backgroundColor: "#f3e8ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  genreText: { fontSize: 12, fontWeight: "600", color: "#7c3aed" },
  bioContainer: { padding: 20, paddingTop: 0 },
  bio: { fontSize: 14, color: "#374151", lineHeight: 22, textAlign: "center" },
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

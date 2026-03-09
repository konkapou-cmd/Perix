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

interface EventData {
  event_id: string;
  title: string;
  description?: string;
  location?: string;
  date?: string;
  cover_image?: string;
  theme?: string;
  organizer_name?: string;
  attendee_count?: number;
}

export default function ShareEventPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, sessionToken } = useAuth();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEventPreview();
  }, [id]);

  const fetchEventPreview = async () => {
    if (!id) {
      setError("Invalid event link");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/preview/event/${id}`);
      if (response.ok) {
        const data = await response.json();
        setEvent(data);
      } else if (response.status === 404) {
        setError("Event not found");
      } else {
        setError("Unable to load event");
      }
    } catch (e) {
      console.error("Error fetching event:", e);
      setError("Unable to load event");
    }
    setLoading(false);
  };

  const handleOpenInApp = () => {
    if (user && sessionToken) {
      router.push(`/event/${id}`);
    } else {
      const deepLink = `perix://event/${id}`;
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
        <ActivityIndicator size="large" color="#4c6fff" />
      </View>
    );
  }

  if (error || !event) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>{error || "Event not found"}</Text>
          <Text style={styles.errorText}>
            This event may have been removed or is no longer available.
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
        {event.cover_image && (
          <Image source={{ uri: event.cover_image }} style={styles.coverImage} />
        )}
        
        <View style={styles.cardContent}>
          {event.theme && (
            <View style={styles.themeBadge}>
              <Text style={styles.themeBadgeText}>{event.theme}</Text>
            </View>
          )}
          
          <Text style={styles.eventTitle}>{event.title}</Text>
          
          {event.organizer_name && (
            <View style={styles.infoRow}>
              <Ionicons name="person" size={16} color="#6b7280" />
              <Text style={styles.infoText}>Organized by {event.organizer_name}</Text>
            </View>
          )}
          
          {event.date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={16} color="#6b7280" />
              <Text style={styles.infoText}>
                {new Date(event.date).toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          )}
          
          {event.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{event.location}</Text>
            </View>
          )}
          
          {event.attendee_count !== undefined && (
            <View style={styles.infoRow}>
              <Ionicons name="people" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{event.attendee_count} attending</Text>
            </View>
          )}
          
          {event.description && (
            <Text style={styles.description} numberOfLines={4}>
              {event.description}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Join this event on Perix</Text>
        <Text style={styles.ctaText}>
          Discover events in your city and connect with your community.
        </Text>
        
        <Pressable style={styles.primaryButton} onPress={handleOpenInApp}>
          <Ionicons name="open" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>
            {user ? "View Event" : "Open in Perix"}
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
  coverImage: { width: "100%", height: 200, backgroundColor: "#e5e7eb" },
  cardContent: { padding: 20 },
  themeBadge: { backgroundColor: "#f0f4ff", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start", marginBottom: 12 },
  themeBadgeText: { fontSize: 12, fontWeight: "600", color: "#4c6fff" },
  eventTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 10 },
  infoText: { fontSize: 14, color: "#6b7280", flex: 1 },
  description: { fontSize: 14, color: "#374151", lineHeight: 22, marginTop: 12 },
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

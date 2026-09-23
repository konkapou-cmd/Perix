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

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || "http://10.208.154.177:8000";
const API_BASE = `${BACKEND_URL}/api`;

// App store links (placeholder until real links are available)
const APP_STORE_LINK = "https://apps.apple.com/app/perix"; // Placeholder
const PLAY_STORE_LINK = "https://play.google.com/store/apps/details?id=com.perix.app"; // Placeholder

interface ActivityData {
  activity_id: string;
  title: string;
  description?: string;
  location?: string;
  date?: string;
  cover_image?: string;
  is_private: boolean;
  creator_name?: string;
  participant_count?: number;
}

export default function ShareActivityPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, sessionToken } = useAuth();
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchActivityPreview();
  }, [id]);

  const fetchActivityPreview = async () => {
    if (!id) {
      setError("Invalid activity link");
      setLoading(false);
      return;
    }

    try {
      // Try to fetch public activity preview
      const response = await fetch(`${API_BASE}/preview/activity/${id}`);
      if (response.ok) {
        const data = await response.json();
        setActivity(data);
      } else if (response.status === 404) {
        setError("Activity not found");
      } else if (response.status === 403) {
        setError("This is a private activity");
      } else {
        setError("Unable to load activity");
      }
    } catch (e) {
      console.error("Error fetching activity:", e);
      setError("Unable to load activity");
    }
    setLoading(false);
  };

  const handleOpenInApp = () => {
    if (user && sessionToken) {
      // User is logged in, navigate to the activity
      router.push(`/activity/${id}`);
    } else {
      // Try to open in app via deep link
      const deepLink = `perix://activity/${id}`;
      Linking.canOpenURL(deepLink).then((supported) => {
        if (supported) {
          Linking.openURL(deepLink);
        } else {
          // App not installed, go to login
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

  if (error || !activity) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>{error || "Activity not found"}</Text>
          <Text style={styles.errorText}>
            This activity may have been removed or you don&apos;t have permission to view it.
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
      {/* Header */}
      <View style={styles.header}>
        <Image source={require("../../../assets/images/prx-logo.jpg")} style={styles.logo} />
        <Text style={styles.brandName}>Perix</Text>
      </View>

      {/* Activity Preview Card */}
      <View style={styles.previewCard}>
        {activity.cover_image && (
          <Image source={{ uri: activity.cover_image }} style={styles.coverImage} />
        )}
        
        <View style={styles.cardContent}>
          <Text style={styles.activityTitle}>{activity.title}</Text>
          
          {activity.creator_name && (
            <View style={styles.infoRow}>
              <Ionicons name="person" size={16} color="#6b7280" />
              <Text style={styles.infoText}>Hosted by {activity.creator_name}</Text>
            </View>
          )}
          
          {activity.date && (
            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={16} color="#6b7280" />
              <Text style={styles.infoText}>
                {new Date(activity.date).toLocaleDateString(undefined, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </Text>
            </View>
          )}
          
          {activity.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{activity.location}</Text>
            </View>
          )}
          
          {activity.participant_count !== undefined && (
            <View style={styles.infoRow}>
              <Ionicons name="people" size={16} color="#6b7280" />
              <Text style={styles.infoText}>{activity.participant_count} participants</Text>
            </View>
          )}
          
          {activity.description && (
            <Text style={styles.description} numberOfLines={4}>
              {activity.description}
            </Text>
          )}
          
          {activity.is_private && (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={14} color="#f59e0b" />
              <Text style={styles.privateBadgeText}>Private Activity</Text>
            </View>
          )}
        </View>
      </View>

      {/* CTA Section */}
      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Join this activity on Perix</Text>
        <Text style={styles.ctaText}>
          Connect with your city, discover events, and meet new people.
        </Text>
        
        <Pressable style={styles.primaryButton} onPress={handleOpenInApp}>
          <Ionicons name="open" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>
            {user ? "View Activity" : "Open in Perix"}
          </Text>
        </Pressable>
        
        {!user && Platform.OS === "web" && (
          <Pressable style={styles.secondaryButton} onPress={handleDownloadApp}>
            <Text style={styles.secondaryButtonText}>Get the Perix App</Text>
          </Pressable>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2025 Perix. All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    paddingTop: 20,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  brandName: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.primaryDark,
    marginLeft: 10,
  },
  errorCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    margin: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 24,
  },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  coverImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#e5e7eb",
  },
  cardContent: {
    padding: 20,
  },
  activityTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  infoText: {
    fontSize: 14,
    color: "#6b7280",
    flex: 1,
  },
  description: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 22,
    marginTop: 12,
  },
  privateBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fef3c7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 16,
    gap: 6,
  },
  privateBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400e",
  },
  ctaSection: {
    marginTop: 24,
    alignItems: "center",
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  ctaText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 20,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryDark,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    width: "100%",
    maxWidth: 300,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  secondaryButtonText: {
    color: COLORS.primaryDark,
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    marginTop: 40,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#9ca3af",
  },
});

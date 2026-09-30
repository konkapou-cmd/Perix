import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { COLORS } from "../../lib/designTokens";
import { BACKEND_URL, APP_URL } from "../../lib/api/core";

const API_BASE = `${BACKEND_URL}/api`;

interface PreviewData {
  type?: string;
  id?: string;
  name?: string;
  description?: string;
  image?: string | null;
  address?: string;
  category?: string;
}

export default function ShareItemPage() {
  const params = useLocalSearchParams<{ type?: string; id?: string }>();
  const { user, sessionToken } = useAuth();
  const type = params.type || "";
  const id = params.id || "";
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!type || !id) {
      setError("Invalid link");
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/preview/generic/${encodeURIComponent(type)}/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch(() => {
        if (!cancelled) setError("Not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  const handleOpenInApp = () => {
    if (user && sessionToken) {
      router.push(`/${type}/${id}` as any);
    } else {
      const deepLink = `perix://${type}/${id}`;
      Linking.canOpenURL(deepLink)
        .then((supported) => {
          if (supported) {
            Linking.openURL(deepLink);
          } else {
            router.push("/login");
          }
        })
        .catch(() => router.push("/login"));
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Ionicons name="alert-circle" size={48} color="#ef4444" />
          <Text style={styles.title}>{error || "Not found"}</Text>
          <Text style={styles.subtitle}>This content may have been removed or is not available.</Text>
          <Pressable style={styles.button} onPress={() => router.push("/login")}>
            <Text style={styles.buttonText}>Open Perix</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {data.image ? (
          <Image source={{ uri: data.image }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="storefront" size={48} color="#9ca3af" />
          </View>
        )}
        <Text style={styles.title}>{data.name}</Text>
        {data.category ? <Text style={styles.category}>{data.category}</Text> : null}
        {data.description ? <Text style={styles.subtitle} numberOfLines={3}>{data.description}</Text> : null}
        {data.address ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color="#6b7280" />
            <Text style={styles.metaText} numberOfLines={1}>{data.address}</Text>
          </View>
        ) : null}
        <Pressable style={styles.button} onPress={handleOpenInApp}>
          <Text style={styles.buttonText}>{user && sessionToken ? "Open in Perix" : "Open Perix"}</Text>
        </Pressable>
        <Text style={styles.hint}>{APP_URL}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    ...(Platform.OS === "web" ? { minHeight: "100vh" as any } : {}),
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E7EAF0",
    shadowColor: "#0A143C",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 3,
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    marginBottom: 16,
    backgroundColor: "#F3F4F6",
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#070A2E",
    textAlign: "center",
    marginBottom: 4,
  },
  category: {
    fontSize: 13,
    color: "#096BFF",
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "capitalize",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  metaText: {
    fontSize: 13,
    color: "#6B7280",
    maxWidth: 280,
  },
  button: {
    backgroundColor: "#096BFF",
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 4,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
  hint: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 14,
  },
});

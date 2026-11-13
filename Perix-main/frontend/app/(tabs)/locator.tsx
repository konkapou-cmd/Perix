import React from "react";
import { ActivityIndicator } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../context/AuthContext";

/** Bookmarks remain safe; Locator is not a public or separately linked page. */
export default function RetiredLocatorRoute() {
  const { user, sessionToken, loading } = useAuth();
  const params = useLocalSearchParams<{ tab?: string; root_category?: string }>();
  if (loading) return <ActivityIndicator />;
  if (!user || !sessionToken) return <Redirect href="/login" />;
  return <Redirect href={{ pathname: "/(tabs)/home", params: {
    ...(typeof params.tab === "string" ? { tab: params.tab } : {}),
    ...(typeof params.root_category === "string" ? { root_category: params.root_category } : {}),
  } }} />;
}

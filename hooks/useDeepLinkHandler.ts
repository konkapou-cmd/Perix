/**
 * Deep Link Handler Hook
 * Handles incoming deep links to navigate users to the correct screen
 * 
 * Supported deep links:
 * - perix://user/{id} - Navigate to user profile
 * - perix://event/{id} - Navigate to event detail
 * - perix://activity/{id} - Navigate to activity detail
 * - perix://artist/{id} - Navigate to artist profile
 * - perix://business/{id} - Navigate to business profile
 * - perix://post/{id} - Navigate to post detail
 * - perix://referral/{code} - Apply referral code
 */

import { useEffect, useCallback, useRef } from "react";
import { Linking, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as ExpoLinking from "expo-linking";
import { useAuth } from "../context/AuthContext";
import { applyReferralCode } from "../lib/api";

interface DeepLinkRoute {
  type: string;
  id: string;
}

export function useDeepLinkHandler() {
  const router = useRouter();
  const { sessionToken, user } = useAuth();
  const processedLinks = useRef<Set<string>>(new Set());
  const pendingDeepLink = useRef<string | null>(null);

  // Parse deep link URL
  const parseDeepLink = useCallback((url: string): DeepLinkRoute | null => {
    try {
      // Handle perix:// scheme
      if (url.startsWith("perix://")) {
        const path = url.replace("perix://", "");
        const parts = path.split("/").filter(Boolean);
        
        if (parts.length >= 2) {
          return { type: parts[0], id: parts[1] };
        } else if (parts.length === 1) {
          // Handle perix://referral/CODE format or just perix://CODE
          if (parts[0].length > 0) {
            return { type: "referral", id: parts[0] };
          }
        }
      }
      
      // Handle https://perixapp.com/ URLs
      if (url.includes("perixapp.com") || url.includes("app.perixapp.com")) {
        const parsed = ExpoLinking.parse(url);
        const pathParts = (parsed.path || "").split("/").filter(Boolean);
        
        if (pathParts.length >= 2) {
          return { type: pathParts[0], id: pathParts[1] };
        }
      }
      
      return null;
    } catch (error) {
      console.error("[DeepLink] Failed to parse URL:", error);
      return null;
    }
  }, []);

  // Navigate to the appropriate screen
  const navigateToRoute = useCallback(async (route: DeepLinkRoute) => {
    console.log("[DeepLink] Navigating to:", route.type, route.id);

    switch (route.type) {
      case "user":
      case "profile":
        router.push(`/user/${route.id}`);
        break;

      case "event":
        router.push(`/event/${route.id}`);
        break;

      case "activity":
        router.push(`/activity/${route.id}`);
        break;

      case "business":
        router.push(`/business/${route.id}`);
        break;

      case "post":
        router.push(`/post/${route.id}`);
        break;

      case "referral":
        // Handle referral code
        if (sessionToken) {
          try {
            const result = await applyReferralCode(sessionToken, route.id);
            if (result.success) {
              Alert.alert(
                "Referral Applied!",
                `You were referred by ${result.referrer_name}. Welcome to Perix!`
              );
            }
          } catch (error: any) {
            // Don't show error if already referred
            if (!error.message?.includes("already")) {
              console.log("[DeepLink] Referral error:", error.message);
            }
          }
        } else {
          // Store referral code for after login
          pendingDeepLink.current = `perix://referral/${route.id}`;
        }
        break;

      default:
        console.log("[DeepLink] Unknown route type:", route.type);
    }
  }, [router, sessionToken]);

  // Handle incoming deep link
  const handleDeepLink = useCallback(async (url: string) => {
    // Prevent duplicate handling
    if (processedLinks.current.has(url)) {
      console.log("[DeepLink] Already processed:", url);
      return;
    }

    console.log("[DeepLink] Handling URL:", url);
    processedLinks.current.add(url);

    // Clear after 5 seconds to allow re-handling if needed
    setTimeout(() => {
      processedLinks.current.delete(url);
    }, 5000);

    const route = parseDeepLink(url);
    if (route) {
      // For non-referral routes, check if user is authenticated
      if (route.type !== "referral" && !user) {
        // Store for after login
        pendingDeepLink.current = url;
        console.log("[DeepLink] Stored pending link for after auth");
        return;
      }

      await navigateToRoute(route);
    }
  }, [parseDeepLink, navigateToRoute, user]);

  // Process pending deep link after login
  useEffect(() => {
    if (user && sessionToken && pendingDeepLink.current) {
      const pending = pendingDeepLink.current;
      pendingDeepLink.current = null;
      
      // Small delay to ensure navigation is ready
      setTimeout(() => {
        handleDeepLink(pending);
      }, 500);
    }
  }, [user, sessionToken, handleDeepLink]);

  // Listen for deep links
  useEffect(() => {
    // Handle initial URL (app opened from deep link)
    const handleInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          console.log("[DeepLink] Initial URL:", initialUrl);
          handleDeepLink(initialUrl);
        }
      } catch (error) {
        console.error("[DeepLink] Failed to get initial URL:", error);
      }
    };

    handleInitialURL();

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener("url", (event) => {
      console.log("[DeepLink] URL event:", event.url);
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleDeepLink]);

  return {
    handleDeepLink,
    parseDeepLink,
  };
}

export default useDeepLinkHandler;

import { useRouter, useSegments, usePathname } from "expo-router";
import { useCallback, useRef, useEffect } from "react";
import { GestureResponderEvent } from "react-native";

/**
 * Custom hook for safe navigation that handles the back button issue.
 * - If there's history, goes back to the previous screen
 * - If no history, navigates to a fallback route (default: home)
 * - Tracks navigation history to always know where to go back
 */
export function useSafeNavigation() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const navigationHistory = useRef<string[]>([]);

  // Track navigation history
  useEffect(() => {
    const currentPath = pathname;
    const history = navigationHistory.current;
    
    // Don't add duplicate consecutive entries
    if (history.length === 0 || history[history.length - 1] !== currentPath) {
      history.push(currentPath);
      // Keep history limited to prevent memory issues
      if (history.length > 50) {
        history.shift();
      }
    }
  }, [pathname]);

  const safeGoBack = useCallback((fallbackRouteOrEvent?: string | GestureResponderEvent) => {
    // Handle both direct calls and Pressable onPress events
    const fallbackRoute = typeof fallbackRouteOrEvent === "string" ? fallbackRouteOrEvent : "/(tabs)/home";
    
    try {
      // First try the router's canGoBack
      if (router.canGoBack()) {
        router.back();
        return;
      }
      
      // Check our own history
      const history = navigationHistory.current;
      if (history.length > 1) {
        // Remove current page from history
        history.pop();
        // Get previous page
        const previousPath = history[history.length - 1];
        if (previousPath && previousPath !== pathname) {
          router.replace(previousPath as any);
          return;
        }
      }
      
      // Fallback to default route
      router.replace(fallbackRoute as any);
    } catch (error) {
      // Ultimate fallback
      router.replace(fallbackRoute as any);
    }
  }, [router, pathname]);

  const safeGoBackToMessages = useCallback((_event?: GestureResponderEvent) => {
    safeGoBack("/(tabs)/messages");
  }, [safeGoBack]);

  const safeGoBackToProfile = useCallback((_event?: GestureResponderEvent) => {
    safeGoBack("/(tabs)/profile");
  }, [safeGoBack]);

  const safeGoBackToHome = useCallback((_event?: GestureResponderEvent) => {
    safeGoBack("/(tabs)/home");
  }, [safeGoBack]);

  return {
    safeGoBack,
    safeGoBackToMessages,
    safeGoBackToProfile,
    safeGoBackToHome,
    router,
    segments,
    pathname,
    navigationHistory: navigationHistory.current,
  };
}

export default useSafeNavigation;

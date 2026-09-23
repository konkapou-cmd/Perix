import { useRouter, useSegments, usePathname } from "expo-router";
import { useCallback, useRef, useEffect } from "react";
import { GestureResponderEvent } from "react-native";

/**
 * Custom hook for safe navigation that handles the back button.
 * - If the Stack has history, goes back to the previous screen
 * - If no Stack history, navigates to a fallback route
 */
export function useSafeNavigation() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  const safeGoBack = useCallback((fallbackRouteOrEvent?: string | GestureResponderEvent) => {
    const fallbackRoute = typeof fallbackRouteOrEvent === "string" ? fallbackRouteOrEvent : "/(tabs)/home";
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {}
    try {
      router.navigate(fallbackRoute as any);
    } catch {}
  }, [router]);

  const safeGoBackToMessages = useCallback((_event?: GestureResponderEvent) => {
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {}
    try {
      router.navigate("/(tabs)/messages" as any);
    } catch {}
  }, [router]);

  const safeGoBackToProfile = useCallback((_event?: GestureResponderEvent) => {
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {}
    try {
      router.navigate("/(tabs)/profile" as any);
    } catch {}
  }, [router]);

  const safeGoBackToHome = useCallback((_event?: GestureResponderEvent) => {
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }
    } catch {}
    try {
      router.navigate("/(tabs)/home" as any);
    } catch {}
  }, [router]);

  return {
    safeGoBack,
    safeGoBackToMessages,
    safeGoBackToProfile,
    safeGoBackToHome,
    router,
    segments,
    pathname,
  };
}

export default useSafeNavigation;

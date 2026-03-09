import { useEffect, useRef, useCallback } from "react";
import { Slot, useRouter, usePathname, useSegments, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { I18nextProvider } from "react-i18next";
import { Platform, BackHandler, ToastAndroid, View, Text, LogBox } from "react-native";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { NotificationProvider } from "../context/NotificationContext";
import { BadgeProvider } from "../context/BadgeContext";
import { LocationProvider } from "../context/LocationContext";
import { MapBoundsProvider } from "../context/MapBoundsContext";
import { 
  initializeNotificationChannels, 
  requestNotificationPermissions,
  getPushToken 
} from "../lib/notifications";
import { registerPushToken } from "../lib/api";
import { useDeepLinkHandler } from "../hooks/useDeepLinkHandler";
import i18n from "../i18n";

// Ignore specific warnings that can cause issues
LogBox.ignoreLogs([
  'Non-serializable values were found in the navigation state',
  'Require cycle:',
]);

// Component that handles Android hardware back button - Improved Global Handler
function BackButtonHandler() {
  const routerNav = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const lastBackPress = useRef(0);
  
  // Memoized handler to prevent unnecessary re-renders
  const handleBackPress = useCallback(() => {
    console.log('[BackHandler] Path:', pathname, 'Segments:', segments);
    
    // Get current path for analysis
    const currentPath = pathname || '';
    
    // Define main tab routes (where double-tap to exit should work)
    const mainTabRoutes = [
      '/(tabs)/home',
      '/home',
      '/(tabs)/profile',
      '/profile', 
      '/(tabs)/messages',
      '/messages',
      '/(tabs)/locator',
      '/locator',
      '/search',
      '/(tabs)/activities',
      '/activities'
    ];
    
    // Check if we're on the home tab specifically
    const isOnHomeTab = currentPath === '/(tabs)/home' || 
                        currentPath === '/home' || 
                        currentPath.endsWith('/home') ||
                        (segments.length === 2 && segments[0] === '(tabs)' && segments[1] === 'home');
    
    // Check if we're on locator/search tab (should go to home on back)
    const isOnLocatorTab = currentPath === '/(tabs)/locator' ||
                           currentPath === '/locator' ||
                           currentPath === '/search' ||
                           currentPath.includes('locator') ||
                           (segments.length === 2 && segments[0] === '(tabs)' && segments[1] === 'locator');
    
    // Check if we're on any main tab (not a nested screen)
    const isOnMainTab = mainTabRoutes.some(route => 
      currentPath === route || currentPath.endsWith(route.split('/').pop() || '')
    ) || (segments.length === 2 && segments[0] === '(tabs)');
    
    // Check if we're in a modal or editor screen (should close/go back)
    const isModalScreen = 
      currentPath.includes('/media-editor') ||
      currentPath.includes('/camera') ||
      currentPath.includes('/story-') ||
      currentPath.includes('/create-') ||
      currentPath.includes('/edit-') ||
      currentPath.includes('/new-');
    
    // Check if we're on a nested/detail screen
    const isNestedScreen = 
      currentPath.includes('/business/') ||
      currentPath.includes('/artist/') ||
      currentPath.includes('/user/') ||
      currentPath.includes('/post/') ||
      currentPath.includes('/event/') ||
      currentPath.includes('/activity/') ||
      currentPath.includes('/messages/') ||
      currentPath.includes('/camera') ||
      currentPath.includes('/media-editor') ||
      currentPath.includes('/call') ||
      currentPath.includes('/incoming-call') ||
      currentPath.includes('-dashboard') ||
      currentPath.includes('/subscription') ||
      currentPath.includes('/jobs') ||
      currentPath.includes('/call-history') ||
      currentPath.includes('/profile/') ||
      currentPath.includes('/invite') ||
      currentPath.includes('/friend') ||
      currentPath.includes('/settings') ||
      currentPath.includes('/notifications') ||
      currentPath.includes('/onboarding');
    
    console.log('[BackHandler] isOnHomeTab:', isOnHomeTab, 'isOnMainTab:', isOnMainTab, 'isNestedScreen:', isNestedScreen, 'isModalScreen:', isModalScreen, 'isOnLocatorTab:', isOnLocatorTab);
    
    // MODAL/EDITOR SCREENS: Always try to go back first
    if (isModalScreen) {
      console.log('[BackHandler] Modal/Editor screen - going back');
      if (routerNav.canGoBack()) {
        routerNav.back();
      } else {
        routerNav.replace('/(tabs)/home');
      }
      return true;
    }
    
    // HOME TAB: Double-tap to exit
    if (isOnHomeTab) {
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        console.log('[BackHandler] Double tap - allowing exit');
        return false; // Allow default behavior (exit app)
      }
      lastBackPress.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true; // Prevent exit, show toast
    }
    
    // LOCATOR/SEARCH TAB: Navigate to home
    if (isOnLocatorTab) {
      console.log('[BackHandler] Locator/Search tab - navigating to home');
      routerNav.replace('/(tabs)/home');
      return true;
    }
    
    // OTHER MAIN TABS: Navigate to home
    if (isOnMainTab && !isNestedScreen) {
      console.log('[BackHandler] Main tab - navigating to home');
      routerNav.replace('/(tabs)/home');
      return true;
    }
    
    // NESTED SCREENS: Try to go back naturally first, fallback to smart navigation
    if (isNestedScreen) {
      // Check if router can go back
      if (routerNav.canGoBack()) {
        console.log('[BackHandler] Nested screen - using router.back()');
        routerNav.back();
        return true;
      }
      
      // Fallback: Navigate based on screen type
      if (currentPath.includes('/messages/')) {
        console.log('[BackHandler] Messages chat - going to messages list');
        routerNav.replace('/(tabs)/messages');
        return true;
      }
      
      if (currentPath.includes('-dashboard') || 
          currentPath.includes('/subscription') || 
          currentPath.includes('/jobs') ||
          currentPath.includes('/settings')) {
        console.log('[BackHandler] Profile sub-screen - going to profile');
        routerNav.replace('/(tabs)/profile');
        return true;
      }
      
      // Default fallback for nested screens: go to home
      console.log('[BackHandler] Nested screen fallback - going to home');
      routerNav.replace('/(tabs)/home');
      return true;
    }
    
    // AUTH SCREENS: Allow default behavior or go to login
    if (currentPath.includes('/login') || currentPath.includes('/register')) {
      console.log('[BackHandler] Auth screen - allowing default');
      return false;
    }
    
    // CATCH-ALL: Try router.back() first, then fallback to home
    if (routerNav.canGoBack()) {
      console.log('[BackHandler] Catch-all - using router.back()');
      routerNav.back();
      return true;
    }
    
    console.log('[BackHandler] Catch-all fallback - going to home');
    routerNav.replace('/(tabs)/home');
    return true;
  }, [pathname, segments, routerNav]);
  
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    
    return () => backHandler.remove();
  }, [handleBackPress]);
  
  return null;
}

// Component that handles deep links for navigation
function DeepLinkHandler() {
  // Initialize deep link handler - it handles everything internally
  useDeepLinkHandler();
  return null;
}

// Component that handles push notification registration after auth
function PushNotificationManager() {
  const { user, sessionToken } = useAuth();
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !sessionToken) return;

    // Register push token when user is authenticated
    const registerToken = async () => {
      try {
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          console.log("[Push] Permission denied");
          return;
        }

        const pushToken = await getPushToken();
        if (pushToken && pushToken !== registeredToken.current) {
          const platform = Platform.OS as "ios" | "android" | "web";
          await registerPushToken(sessionToken, pushToken, platform);
          registeredToken.current = pushToken;
          console.log("[Push] Token registered:", pushToken.substring(0, 30) + "...");
        }
      } catch (error) {
        console.error("[Push] Failed to register token:", error);
      }
    };

    registerToken();

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        console.log("[Push] Received notification:", data?.type);
        
        // Handle incoming call notification in foreground
        if (data?.type === "incoming_call") {
          router.push({
            pathname: "/incoming-call",
            params: {
              callId: data.callId as string,
              callerId: data.callerId as string,
              callerName: data.callerName as string,
              callerPhoto: (data.callerPhoto as string) || "",
              callType: data.callType as string,
            },
          });
        }
      }
    );

    // Listen for notification taps (background/killed)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        console.log("[Push] Notification tapped:", data?.type);

        if (!data?.type) return;

        switch (data.type) {
          case "incoming_call":
            router.push({
              pathname: "/incoming-call",
              params: {
                callId: data.callId as string,
                callerId: data.callerId as string,
                callerName: data.callerName as string,
                callerPhoto: (data.callerPhoto as string) || "",
                callType: data.callType as string,
              },
            });
            break;

          case "new_message":
            router.push({
              pathname: "/(tabs)/messages",
            });
            break;

          case "activity":
            router.push({
              pathname: "/(tabs)/messages",
            });
            break;
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [user, sessionToken]);

  return null;
}

export default function RootLayout() {
  // Initialize notification channels on app start
  useEffect(() => {
    try {
      initializeNotificationChannels();
    } catch (error) {
      console.error('Error initializing notifications:', error);
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
        <AuthProvider>
          <LocationProvider>
            <MapBoundsProvider>
              <BadgeProvider>
                <NotificationProvider>
                  <BackButtonHandler />
                  <DeepLinkHandler />
                  <PushNotificationManager />
                  <Slot />
                </NotificationProvider>
              </BadgeProvider>
            </MapBoundsProvider>
          </LocationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}

import { useEffect, useRef } from "react";
import { Stack, usePathname, useSegments, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { I18nextProvider } from "react-i18next";
import { Platform, BackHandler, ToastAndroid, View, Text, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import "../lib/suppressExpoNotifError";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { NotificationProvider } from "../context/NotificationContext";
import { BadgeProvider } from "../context/BadgeContext";
import { SocketProvider } from "../context/SocketContext";
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

function AuthGuard() {
  const { user, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)" || segments[0] === "onboarding";
    if (!user && !inAuthGroup) {
      router.replace("/login");
    } else if (user && inAuthGroup) {
      router.replace("/(tabs)/home");
    }
  }, [user, loading]);

  return null;
}

// Component that handles Android hardware back button
// With root <Stack>: React Navigation handles back for pushed screens.
// This only handles edge cases when the Stack can't go back further.
function BackButtonHandler() {
  const pathname = usePathname();
  const segments = useSegments();
  const lastBackPress = useRef(0);
    
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      // If the Stack has screens to pop, let React Navigation handle it
      if (router.canGoBack()) {
        return false;
      }
      
      // We're at the root of the Stack — check which tab we're on
      const currentPath = pathname || '';
      const isOnHomeTab = 
        currentPath === '/(tabs)/home' || 
        currentPath === '/home' || 
        currentPath.endsWith('/home') ||
        (segments.length === 2 && segments[0] === '(tabs)' && segments[1] === 'home');
      
      if (isOnHomeTab) {
        const now = Date.now();
        if (now - lastBackPress.current < 2000) {
          return false;
        }
        lastBackPress.current = now;
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        return true;
      }
      
      // On a non-home tab at the root — navigate to home tab first
      router.navigate('/(tabs)/home' as any);
      return true;
    });
    
    return () => handler.remove();
  }, [pathname, segments]);
    
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
            router.navigate("/(tabs)/messages" as any);
            break;

          case "activity":
            router.push({
              pathname: "/activities",
            });
            break;

          case "event":
            if (data.eventId) {
              router.push(`/event/${data.eventId}`);
            }
            break;

          case "like":
          case "comment":
            if (data.postId) {
              router.push(`/post/${data.postId}`);
            }
            break;

          case "friend_request":
            router.push("/friend-requests");
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
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
          <LocationProvider>
            <MapBoundsProvider>
              <BadgeProvider>
                <SocketProvider>
                  <NotificationProvider>
                    <StatusBar style="dark" />
                    <AuthGuard />
                    <BackButtonHandler />
                    <DeepLinkHandler />
                    <PushNotificationManager />
                    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
                      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
                      <Stack.Screen name="call" options={{ gestureEnabled: false }} />
                      <Stack.Screen name="incoming-call" options={{ gestureEnabled: false }} />
                    </Stack>
                  </NotificationProvider>
                </SocketProvider>
              </BadgeProvider>
            </MapBoundsProvider>
          </LocationProvider>
          </AuthProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}

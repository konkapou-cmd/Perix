import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Platform, LogBox } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useAuth } from "./AuthContext";
import { initializeNotificationChannels, dismissAllNotifications } from "../lib/notifications";

// Suppress Expo Go notification warning (will work in production builds)
LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications",
  "expo-notifications:",
  "VirtualizedLists should never be nested",
]);

const API_BASE =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL;

// NOTE: setNotificationHandler is configured in lib/notifications.ts
// Do NOT add another setNotificationHandler here to avoid conflicts

type NotificationContextType = {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  registerForPushNotifications: () => Promise<void>;
  showLocalNotification: (title: string, body: string, data?: Record<string, unknown>) => Promise<void>;
  clearAll: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType>({
  expoPushToken: null,
  notification: null,
  registerForPushNotifications: async () => {},
  showLocalNotification: async () => {},
  clearAll: async () => {},
});

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { sessionToken, user } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.EventSubscription | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription | undefined>(undefined);

  const registerForPushNotifications = async () => {
    if (!Device.isDevice) {
      console.log("[Notifications] Must use physical device for push notifications");
      return;
    }

    try {
      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not granted
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("[Notifications] Permission not granted");
        return;
      }

      // Get Expo push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      let tokenData;
      try {
        tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: projectId || undefined,
        });
      } catch (e: any) {
        if (e?.message?.includes("Expo Go") || e?.message?.includes("development build")) {
          console.log("[Notifications] Push tokens not available in Expo Go — local notifications still work");
          return;
        }
        console.error("[Notifications] Error getting push token:", e);
        return;
      }
      const token = tokenData.data;
      console.log("[Notifications] Expo push token:", token);
      setExpoPushToken(token);

      // Register token with backend
      if (sessionToken && token) {
        await registerTokenWithBackend(token);
      }

      // Initialize notification channels from centralized config
      // This uses lib/notifications.ts which has proper lock screen settings
      await initializeNotificationChannels();
      
    } catch (error) {
      console.error("[Notifications] Error registering:", error);
    }
  };

  const registerTokenWithBackend = async (token: string) => {
    if (!sessionToken || !API_BASE) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/notifications/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ push_token: token, platform: Platform.OS }),
      });
      
      if (response.ok) {
        console.log("[Notifications] Token registered with backend");
      } else {
        console.error("[Notifications] Failed to register token:", await response.text());
      }
    } catch (error) {
      console.error("[Notifications] Error registering token:", error);
    }
  };

  // Show local notification (for foreground message alerts)
  const showLocalNotification = async (
    title: string, 
    body: string, 
    data?: Record<string, unknown>
  ) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: "default",
          data: data || {},
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.error("[Notifications] Error showing local notification:", error);
    }
  };

  // Clear all delivered notifications
  const clearAll = async () => {
    try {
      await dismissAllNotifications();
    } catch (error) {
      console.error("[Notifications] Error clearing all notifications:", error);
    }
  };

  // Register for notifications when user logs in
  useEffect(() => {
    if (sessionToken && user) {
      registerForPushNotifications();
    }
  }, [sessionToken, user]);

  // Re-register token when it changes
  useEffect(() => {
    if (expoPushToken && sessionToken) {
      registerTokenWithBackend(expoPushToken);
    }
  }, [expoPushToken, sessionToken]);

  // Set up notification listeners
  useEffect(() => {
    // Listener for when a notification is received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log("[Notifications] Received:", notification);
      setNotification(notification);
    });

    // Listener for when user taps on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log("[Notifications] Response:", response);
      const data = response.notification.request.content.data;
      
      // Handle navigation based on notification type
      if (data?.type === "message") {
        // Navigate to messages
        console.log("[Notifications] Navigate to messages for user:", data.from_user_id);
      } else if (data?.type === "activity") {
        // Navigate to activities
        console.log("[Notifications] Navigate to activity:", data.activity_id);
      } else if (data?.type === "event") {
        // Navigate to event
        console.log("[Notifications] Navigate to event:", data.event_id);
      }
    });

    return () => {
      if (notificationListener.current) {
        try {
          notificationListener.current.remove();
        } catch (e) {
          // Ignore cleanup errors on web
        }
      }
      if (responseListener.current) {
        try {
          responseListener.current.remove();
        } catch (e) {
          // Ignore cleanup errors on web
        }
      }
    };
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        expoPushToken,
        notification,
        registerForPushNotifications,
        showLocalNotification,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

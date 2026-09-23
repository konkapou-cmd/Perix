import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Configure notification handler with error handling
try {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      };
    },
  });
} catch (error) {
  console.warn("Failed to set notification handler:", error);
}

// Notification channel IDs for Android
export const CHANNEL_MESSAGES = "messages";
export const CHANNEL_ACTIVITIES = "activities";
export const CHANNEL_SOCIAL = "social";
export const CHANNEL_EVENTS = "events";

// Initialize notification channels (Android only)
export async function initializeNotificationChannels() {
  if (Platform.OS !== "android") return;
  
  try {
    // Messages channel - HIGH priority with lock screen visibility
    await Notifications.setNotificationChannelAsync(CHANNEL_MESSAGES, {
      name: "Messages",
      description: "New message notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#16a34a",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Activities channel - DEFAULT priority
    await Notifications.setNotificationChannelAsync(CHANNEL_ACTIVITIES, {
      name: "Activities",
      description: "Likes, comments, and friend requests",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 100],
      lightColor: "#f59e0b",
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    
    // Social channel - HIGH priority for friend requests
    await Notifications.setNotificationChannelAsync(CHANNEL_SOCIAL, {
      name: "Social",
      description: "Friend requests and social notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
      enableVibrate: true,
      enableLights: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // Events channel - DEFAULT priority for event reminders
    await Notifications.setNotificationChannelAsync(CHANNEL_EVENTS, {
      name: "Events",
      description: "Event reminders and notifications",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 200, 100, 200],
      lightColor: "#ec4899",
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    
    console.log("[Notifications] Android channels initialized with lock screen visibility");
  } catch (error) {
    console.warn("[Notifications] Failed to initialize channels:", error);
  }
}

// Request notification permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === "granted";
}

// Get push notification token
export async function getPushToken(): Promise<string | null> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn("No EAS project ID found");
      return null;
    }
    
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    
    return tokenData.data;
  } catch (error) {
    console.error("Failed to get push token:", error);
    return null;
  }
}

// Schedule a local notification for new message
// Shows on locked screen with sender info visible
export async function showNewMessageNotification(
  senderName: string,
  senderId: string,
  conversationId: string,
  messagePreview: string
): Promise<string> {
  const content: Notifications.NotificationContentInput = {
    title: senderName,
    body: messagePreview,
    data: {
      type: "new_message",
      senderId,
      conversationId,
      senderName,
    },
    sound: true,
    badge: 1,
  };
  
  const notificationId = await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
  
  return notificationId;
}

// Schedule a local notification for activity (like, comment, friend request)
// Shows on locked screen with activity details visible
export async function showActivityNotification(
  title: string,
  body: string,
  activityType: "like" | "comment" | "friend_request",
  relatedId?: string
): Promise<string> {
  const content: Notifications.NotificationContentInput = {
    title,
    body,
    data: {
      type: "activity",
      activityType,
      relatedId,
    },
    sound: true,
  };
  
  const notificationId = await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
  
  return notificationId;
}

// Dismiss a specific notification
export async function dismissNotification(notificationId: string) {
  await Notifications.dismissNotificationAsync(notificationId);
}

// Dismiss all notifications
export async function dismissAllNotifications() {
  await Notifications.dismissAllNotificationsAsync();
}

// Set up notification response listener
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Set up notification received listener (foreground)
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

// Cancel all scheduled notifications
export async function cancelAllScheduledNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

// Get badge count
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

// Set badge count
export async function setBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}

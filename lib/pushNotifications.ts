import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { router } from "expo-router";

// Types for notification data
export interface CallNotificationData {
  type: "incoming_call";
  callId: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  callType: "video" | "voice";
}

export interface MessageNotificationData {
  type: "new_message";
  conversationId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  messagePreview: string;
}

export interface ActivityNotificationData {
  type: "activity";
  activityType: "like" | "comment" | "friend_request" | "friend_accepted";
  actorId: string;
  actorName: string;
  actorPhoto?: string;
  postId?: string;
  message: string;
}

export type NotificationData = CallNotificationData | MessageNotificationData | ActivityNotificationData;

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as NotificationData;
    
    // For incoming calls, always show with high priority
    if (data?.type === "incoming_call") {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      };
    }
    
    // For messages and activities
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    };
  },
});

// Notification channel IDs for Android
export const CHANNELS = {
  CALLS: "calls",
  MESSAGES: "messages",
  ACTIVITIES: "activities",
} as const;

// Initialize notification channels (Android only)
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android") return;

  // Calls channel - highest priority with custom ringtone
  await Notifications.setNotificationChannelAsync(CHANNELS.CALLS, {
    name: "Incoming Calls",
    description: "Notifications for incoming voice and video calls",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default", // In production, use custom ringtone
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: "#22c55e",
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  // Messages channel - high priority
  await Notifications.setNotificationChannelAsync(CHANNELS.MESSAGES, {
    name: "Messages",
    description: "Notifications for new messages",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#4c6fff",
    enableVibrate: true,
    enableLights: true,
    showBadge: true,
  });

  // Activities channel - default priority
  await Notifications.setNotificationChannelAsync(CHANNELS.ACTIVITIES, {
    name: "Activities",
    description: "Notifications for likes, comments, and friend requests",
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: "default",
    vibrationPattern: [0, 100],
    lightColor: "#f59e0b",
    enableVibrate: true,
    showBadge: true,
  });

  console.log("[Push] Notification channels created");
}

// Request notification permissions
export async function requestPushPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  
  if (existingStatus === "granted") {
    return true;
  }
  
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// Get Expo push token
export async function getExpoPushToken(): Promise<string | null> {
  try {
    // Check permissions first
    const hasPermission = await requestPushPermissions();
    if (!hasPermission) {
      console.warn("[Push] Permission not granted");
      return null;
    }

    // Get project ID from app config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn("[Push] No EAS project ID found");
      return null;
    }

    // Get the push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    console.log("[Push] Token obtained:", tokenData.data.substring(0, 30) + "...");
    return tokenData.data;
  } catch (error) {
    console.error("[Push] Failed to get push token:", error);
    return null;
  }
}

// Handle notification response (when user taps notification)
export function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as NotificationData;
  
  if (!data?.type) return;

  switch (data.type) {
    case "incoming_call":
      // Navigate to call screen
      router.push({
        pathname: "/call",
        params: {
          mode: "incoming",
          callId: data.callId,
          callType: data.callType,
          userId: data.callerId,
          userName: data.callerName,
          userPhoto: data.callerPhoto || "",
        },
      });
      break;

    case "new_message":
      // Navigate to conversation
      router.push({
        pathname: "/chat",
        params: {
          recipientId: data.senderId,
          recipientName: data.senderName,
        },
      });
      break;

    case "activity":
      if (data.activityType === "friend_request" || data.activityType === "friend_accepted") {
        // Navigate to user profile
        router.push({
          pathname: `/user/${data.actorId}`,
        });
      } else if (data.postId) {
        // Navigate to the post detail page
        router.push({
          pathname: `/post/${data.postId}`,
        });
      } else {
        // Default to activities tab
        router.push("/(tabs)/activities");
      }
      break;
  }
}

// Set up notification listeners
export function setupNotificationListeners(): () => void {
  // Handle notification taps
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse
  );

  // Handle foreground notifications (optional - for custom handling)
  const notificationSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const data = notification.request.content.data as NotificationData;
      console.log("[Push] Received notification:", data?.type);
      
      // For incoming calls in foreground, you might want to show a custom UI
      if (data?.type === "incoming_call") {
        // Could show an in-app call UI here
        console.log("[Push] Incoming call from:", data.callerName);
      }
    }
  );

  // Return cleanup function
  return () => {
    responseSubscription.remove();
    notificationSubscription.remove();
  };
}

// Show local notification for incoming call
// Configured for lock screen visibility with MAX priority
export async function showIncomingCallNotification(
  callId: string,
  callerName: string,
  callerId: string,
  callerPhoto: string | undefined,
  callType: "video" | "voice"
): Promise<string> {
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: callType === "video" ? "📹 Incoming Video Call" : "📞 Incoming Call",
      body: `${callerName} is calling...`,
      data: {
        type: "incoming_call",
        callId,
        callerId,
        callerName,
        callerPhoto,
        callType,
      } as CallNotificationData,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      categoryIdentifier: "incoming_call",
      // Sticky keeps notification visible until user acts
      sticky: true,
    },
    trigger: null, // Show immediately
  });

  return notificationId;
}

// Show local notification for new message
export async function showMessageNotification(
  conversationId: string,
  senderId: string,
  senderName: string,
  senderPhoto: string | undefined,
  messagePreview: string
): Promise<string> {
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: senderName,
      body: messagePreview.length > 100 ? messagePreview.substring(0, 97) + "..." : messagePreview,
      data: {
        type: "new_message",
        conversationId,
        senderId,
        senderName,
        senderPhoto,
        messagePreview,
      } as MessageNotificationData,
      sound: true,
      badge: 1,
    },
    trigger: null,
  });

  return notificationId;
}

// Show local notification for activity (like, comment, friend request)
export async function showActivityNotification(
  activityType: "like" | "comment" | "friend_request" | "friend_accepted",
  actorId: string,
  actorName: string,
  actorPhoto: string | undefined,
  message: string,
  postId?: string
): Promise<string> {
  let title = "";
  switch (activityType) {
    case "like":
      title = "❤️ New Like";
      break;
    case "comment":
      title = "💬 New Comment";
      break;
    case "friend_request":
      title = "👋 Friend Request";
      break;
    case "friend_accepted":
      title = "🎉 Friend Accepted";
      break;
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body: message,
      data: {
        type: "activity",
        activityType,
        actorId,
        actorName,
        actorPhoto,
        postId,
        message,
      } as ActivityNotificationData,
      sound: true,
    },
    trigger: null,
  });

  return notificationId;
}

// Cancel a specific notification
export async function cancelNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

// Cancel all notifications
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}

// Set badge count
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

// Get badge count
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

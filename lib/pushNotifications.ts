import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

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
      } as unknown as Record<string, unknown>,
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
      } as unknown as Record<string, unknown>,
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
      } as unknown as Record<string, unknown>,
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

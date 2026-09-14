import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Platform } from "react-native";
import { useAuth } from "./AuthContext";
import { useSocketEvent } from "./SocketContext";
import { getUnreadMessageCount, getActivityFeed, getPendingRequestCount } from "../lib/api";
import { fetchWebBadge, updateIconBadge, attachServiceWorkerBadgeHandler } from "../lib/webPush";

type BadgeContextType = {
  unreadMessageCount: number;
  activityCount: number;
  friendRequestCount: number;
  totalBadgeCount: number;
  refreshUnreadCount: () => Promise<void>;
  decrementUnreadCount: (count?: number) => void;
  clearActivityCount: () => void;
};

const BadgeContext = createContext<BadgeContextType>({
  unreadMessageCount: 0,
  activityCount: 0,
  friendRequestCount: 0,
  totalBadgeCount: 0,
  refreshUnreadCount: async () => {},
  decrementUnreadCount: () => {},
  clearActivityCount: () => {},
});

export const useBadge = () => useContext(BadgeContext);

export function BadgeProvider({ children }: { children: ReactNode }) {
  const { sessionToken, user } = useAuth();
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [activityCount, setActivityCount] = useState(0);
  const [friendRequestCount, setFriendRequestCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!sessionToken) {
      setUnreadMessageCount(0);
      setActivityCount(0);
      setFriendRequestCount(0);
      return;
    }
    try {
      // Fetch message count, activity count and pending friend requests
      const [messageResult, activityResult, requestResult] = await Promise.all([
        getUnreadMessageCount(sessionToken),
        getActivityFeed(sessionToken, 10),
        getPendingRequestCount(sessionToken).catch(() => ({ pending_count: 0 })),
      ]);
      setUnreadMessageCount(messageResult.unread_count);
      setActivityCount(activityResult.unread_count);
      setFriendRequestCount(requestResult.pending_count || 0);
    } catch (error) {
      console.error("[Badge] Failed to fetch counts:", error);
    }
  }, [sessionToken]);

  const decrementUnreadCount = useCallback((count: number = 1) => {
    setUnreadMessageCount((prev) => Math.max(0, prev - count));
  }, []);

  const clearActivityCount = useCallback(() => {
    setActivityCount(0);
  }, []);

  // Total badge count combines messages, activities and friend requests
  const totalBadgeCount = unreadMessageCount + activityCount + friendRequestCount;

  // Fetch unread count when user logs in
  useEffect(() => {
    if (sessionToken && user) {
      refreshUnreadCount();
    } else {
      setUnreadMessageCount(0);
      setFriendRequestCount(0);
    }
  }, [sessionToken, user, refreshUnreadCount]);

  // Refresh unread count periodically (fallback every 30s, WS-driven when connected)
  useSocketEvent("unread_count", useCallback((data: any) => {
    if (typeof data?.count === "number") {
      setUnreadMessageCount(data.count);
    }
  }, []));

  useSocketEvent("new_message", useCallback(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]));

  useSocketEvent("notification", useCallback((data: any) => {
    const type = data?.notification?.type;
    if (type === "friend_request" || type === "friend") {
      refreshUnreadCount();
    }
  }, [refreshUnreadCount]));

  useEffect(() => {
    if (!sessionToken) return;
    
    const interval = setInterval(() => {
      refreshUnreadCount();
    }, 30000);

    return () => clearInterval(interval);
  }, [sessionToken, refreshUnreadCount]);

  // ─── PWA icon badge (web only) ─────────────────────────────────────────
  // Icon badge = unread messages + pending bookings (from the backend).
  // Android launchers may show a dot instead of the exact number.
  const [webBadgeCount, setWebBadgeCount] = useState(0);
  const refreshWebBadge = useCallback(async () => {
    if (Platform.OS !== "web" || !sessionToken) return;
    const total = await fetchWebBadge(sessionToken);
    setWebBadgeCount(total);
  }, [sessionToken]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    attachServiceWorkerBadgeHandler((count) => {
      if (typeof count === "number") {
        setWebBadgeCount(count);
      } else {
        void refreshWebBadge();
      }
    });
  }, [refreshWebBadge]);

  useEffect(() => {
    if (Platform.OS !== "web" || !sessionToken) {
      if (Platform.OS === "web") void updateIconBadge(0);
      return;
    }
    refreshWebBadge();
    const interval = setInterval(() => {
      void refreshWebBadge();
    }, 30000);
    return () => clearInterval(interval);
  }, [sessionToken, refreshWebBadge]);

  // Keep the installed-app icon badge in sync with the backend count.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    void updateIconBadge(webBadgeCount);
  }, [webBadgeCount]);

  // Re-sync when the tab becomes visible again (frozen tabs miss timers).
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshWebBadge();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshWebBadge]);

  return (
    <BadgeContext.Provider
      value={{
        unreadMessageCount,
        activityCount,
        friendRequestCount,
        totalBadgeCount,
        refreshUnreadCount,
        decrementUnreadCount,
        clearActivityCount,
      }}
    >
      {children}
    </BadgeContext.Provider>
  );
}

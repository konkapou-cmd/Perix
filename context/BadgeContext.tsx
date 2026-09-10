import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useSocketEvent } from "./SocketContext";
import { getUnreadMessageCount, getActivityFeed, getPendingRequestCount } from "../lib/api";

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

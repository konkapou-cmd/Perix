import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useSocketEvent } from "./SocketContext";
import { getUnreadMessageCount, getActivityFeed } from "../lib/api";

type BadgeContextType = {
  unreadMessageCount: number;
  activityCount: number;
  totalBadgeCount: number;
  refreshUnreadCount: () => Promise<void>;
  decrementUnreadCount: (count?: number) => void;
  clearActivityCount: () => void;
};

const BadgeContext = createContext<BadgeContextType>({
  unreadMessageCount: 0,
  activityCount: 0,
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

  const refreshUnreadCount = useCallback(async () => {
    if (!sessionToken) {
      setUnreadMessageCount(0);
      setActivityCount(0);
      return;
    }
    try {
      // Fetch both message count and activity count
      const [messageResult, activityResult] = await Promise.all([
        getUnreadMessageCount(sessionToken),
        getActivityFeed(sessionToken, 10)
      ]);
      setUnreadMessageCount(messageResult.unread_count);
      setActivityCount(activityResult.unread_count);
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

  // Total badge count combines messages and activities
  const totalBadgeCount = unreadMessageCount + activityCount;

  // Fetch unread count when user logs in
  useEffect(() => {
    if (sessionToken && user) {
      refreshUnreadCount();
    } else {
      setUnreadMessageCount(0);
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

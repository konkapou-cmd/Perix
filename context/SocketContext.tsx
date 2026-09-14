import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { AppState, Platform } from "react-native";
import { useAuth } from "./AuthContext";
import Constants from "expo-constants";

const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "";

type WSListener = (data: any) => void;

type SocketContextType = {
  connected: boolean;
  on: (event: string, listener: WSListener) => void;
  off: (event: string, listener: WSListener) => void;
  send: (data: any) => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  reconnect: () => void;
};

const SocketContext = createContext<SocketContextType>({
  connected: false,
  on: () => {},
  off: () => {},
  send: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  reconnect: () => {},
});

export const useSocket = () => useContext(SocketContext);

export const useSocketEvent = (event: string, handler: (data: any) => void) => {
  const { on, off } = useSocket();
  useEffect(() => {
    on(event, handler);
    return () => off(event, handler);
  }, [event, handler, on, off]);
};

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { sessionToken, user } = useAuth();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<WSListener>>>(new Map());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdogIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongRef = useRef(0);
  const activeSubscriptionsRef = useRef<Set<string>>(new Set());

  const getWsUrl = useCallback(() => {
    if (!BACKEND_URL) return "";
    const base = BACKEND_URL.replace("http", "ws");
    return `${base}/api/ws?token=${sessionToken}`;
  }, [sessionToken]);

  const notifyListeners = useCallback((event: string, data: any) => {
    const listeners = listenersRef.current.get(event);
    if (listeners) {
      listeners.forEach((fn) => {
        try { fn(data); } catch (e) { console.warn("[WS] Listener error:", e); }
      });
    }
  }, []);

  const sendRaw = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const resubscribeAll = useCallback(() => {
    const subs = activeSubscriptionsRef.current;
    if (subs.size > 0) {
      subs.forEach((channel) => {
        sendRaw({ type: "subscribe", channel });
      });
    }
  }, [sendRaw]);

  const connect = useCallback(() => {
    const url = getWsUrl();
    if (!url || !sessionToken) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        lastPongRef.current = Date.now();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
        // Pong watchdog: a frozen mobile tab can leave the socket looking
        // OPEN while it is actually dead. If no pong arrives for 60s, force
        // a close so the reconnect path kicks in.
        watchdogIntervalRef.current = setInterval(() => {
          const current = wsRef.current;
          if (
            current &&
            current.readyState === WebSocket.OPEN &&
            Date.now() - lastPongRef.current > 60000
          ) {
            console.warn("[WS] pong watchdog timeout — forcing reconnect");
            try { current.close(); } catch {}
          }
        }, 15000);
        resubscribeAll();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const msgType = data.type;
          if (msgType === "pong") {
            lastPongRef.current = Date.now();
            return;
          }
          if (msgType) {
            notifyListeners(msgType, data);
          }
        } catch (e) { console.warn("[WS] Message parse error:", e); }
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (sessionToken) connect();
        }, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) { console.warn("[WS] Connection error:", e); }
  }, [getWsUrl, sessionToken, notifyListeners, resubscribeAll]);

  useEffect(() => {
    if (sessionToken && user) {
      connect();
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (watchdogIntervalRef.current) clearInterval(watchdogIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [sessionToken, user, connect]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch {}
      wsRef.current = null;
    }
    if (sessionToken) connect();
  }, [sessionToken, connect]);

  // Resume handling: after a backgrounded/frozen tab or app comes back to
  // the foreground, force a reconnect if the socket is stale or missing.
  useEffect(() => {
    const onResume = () => {
      const ws = wsRef.current;
      const stale =
        !ws ||
        ws.readyState !== WebSocket.OPEN ||
        Date.now() - lastPongRef.current > 30000;
      if (stale) {
        reconnect();
      }
    };
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible") onResume();
      };
      window.addEventListener("online", onResume);
      window.addEventListener("pageshow", onResume);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        window.removeEventListener("online", onResume);
        window.removeEventListener("pageshow", onResume);
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") onResume();
    });
    return () => sub.remove();
  }, [reconnect]);

  const on = useCallback((event: string, listener: WSListener) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(listener);
  }, []);

  const off = useCallback((event: string, listener: WSListener) => {
    const listeners = listenersRef.current.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }, []);

  const subscribe = useCallback((channel: string) => {
    activeSubscriptionsRef.current.add(channel);
    sendRaw({ type: "subscribe", channel });
  }, [sendRaw]);

  const unsubscribe = useCallback((channel: string) => {
    activeSubscriptionsRef.current.delete(channel);
    sendRaw({ type: "unsubscribe", channel });
  }, [sendRaw]);

  return (
    <SocketContext.Provider value={{ connected, on, off, send: sendRaw, subscribe, unsubscribe, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
}

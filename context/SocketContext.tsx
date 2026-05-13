import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
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
};

const SocketContext = createContext<SocketContextType>({
  connected: false,
  on: () => {},
  off: () => {},
  send: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
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
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);
        resubscribeAll();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const msgType = data.type;
          if (msgType) {
            notifyListeners(msgType, data);
          }
        } catch (e) { console.warn("[WS] Message parse error:", e); }
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
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
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [sessionToken, user, connect]);

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
    <SocketContext.Provider value={{ connected, on, off, send: sendRaw, subscribe, unsubscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

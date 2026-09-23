import Constants from "expo-constants";
import { API_BASE } from "./api/core";

export const VAPID_PUBLIC_KEY =
  (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_VAPID_PUBLIC_KEY ||
  process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ||
  "BHiFoYBuhNN-oEo_gXWwAt4RClJrNVZUIzGvb36Nf52iuaHAwI0c7QyrKGvdkxKhgXY7imBnjXma-nreQtf4ZvE";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  if (swRegistration) return swRegistration;
  try {
    swRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return swRegistration;
  } catch (e) {
    console.warn("[WebPush] SW registration failed:", e);
    return null;
  }
}

export async function ensureWebPushSubscription(
  sessionToken: string
): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;

  if (Notification.permission === "denied") return null;

  let registration: ServiceWorkerRegistration | null = null;
  try {
    registration = await registerServiceWorker();
  } catch {}
  if (!registration) return null;

  try {
    let permission: NotificationPermission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") return null;
  } catch (e) {
    console.warn("[WebPush] Permission request failed:", e);
    return null;
  }

  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      await reportSubscription(sessionToken, existing);
      return existing;
    }
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as BufferSource,
    });
    await reportSubscription(sessionToken, subscription);
    return subscription;
  } catch (e) {
    console.warn("[WebPush] subscribe failed:", e);
    return null;
  }
}

async function reportSubscription(sessionToken: string, subscription: PushSubscription) {
  try {
    const res = await fetch(`${API_BASE}/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!res.ok) console.warn("[WebPush] subscribe report failed:", res.status);
  } catch (e) {
    console.warn("[WebPush] subscribe report error:", e);
  }
}

export async function updateIconBadge(count: number): Promise<void> {
  const nav = navigator as any;
  if (!("setAppBadge" in nav)) return;
  try {
    if (count > 0) {
      await nav.setAppBadge(count);
    } else {
      await nav.clearAppBadge();
    }
  } catch (e) {
    // Badge API is best-effort (Android may show a dot instead of a number).
  }
}

export async function fetchWebBadge(sessionToken: string): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/push/badge`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data?.total === "number" ? data.total : 0;
  } catch {
    return 0;
  }
}

let swMessageHandlerAttached = false;

export function attachServiceWorkerBadgeHandler(onBadge: (count: number | null) => void): void {
  if (swMessageHandlerAttached || !isWebPushSupported()) return;
  swMessageHandlerAttached = true;
  navigator.serviceWorker.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg && msg.type === "push-received") {
      onBadge(typeof msg.badge === "number" ? msg.badge : null);
    }
  });
}

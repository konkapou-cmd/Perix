/* Perix service worker — web push + icon badge.
 * Push payloads from the backend include: { title, body, badge, data }.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function broadcastToClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    try {
      client.postMessage(message);
    } catch (e) {}
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {}

  const title = payload.title || "Perix";
  const body = payload.body || "";
  const badge = typeof payload.badge === "number" ? payload.badge : null;

  // Keep any open window's icon badge in sync (Badging API is window-only).
  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, {
          body,
          icon: "/pwa/icon-192.png",
          badge: "/pwa/icon-192.png",
          tag: payload.tag || "perix-notification",
          renotify: true,
          data: payload.data || {},
        });
      } catch (e) {}
      await broadcastToClients({ type: "push-received", badge, data: payload.data || {} });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const url = target || "/";
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

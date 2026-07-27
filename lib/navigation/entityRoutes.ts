import type { Href, Router } from "expo-router";
import { Alert, Platform } from "react-native";

type RouteId = string | string[] | null | undefined;

export const normalizeId = (value: RouteId): string | null => {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();

  if (!normalized || normalized === "undefined" || normalized === "null") {
    return null;
  }

  return normalized;
};

export const entityRoutes = {
  service(value: RouteId): Href | null {
    const id = normalizeId(value);
    if (!id) return null;
    return { pathname: "/service/[id]", params: { id } };
  },

  rental(value: RouteId): Href | null {
    const id = normalizeId(value);
    if (!id) return null;
    return { pathname: "/rental/[id]", params: { id } };
  },

  listing(value: RouteId): Href | null {
    const id = normalizeId(value);
    if (!id) return null;
    return { pathname: "/listing/[id]", params: { id } };
  },

  job(value: RouteId): Href | null {
    const id = normalizeId(value);
    if (!id) return null;
    return { pathname: "/job/[id]", params: { id } };
  },
};

export const getRentalNavigationId = (rental: {
  rental_id?: string | null;
  listing_id?: string | null;
  service_id?: string | null;
  source_type?: string | null;
}): string | null | undefined => {
  if ((rental as any).source_type === "owner") {
    return rental.listing_id || rental.rental_id;
  }
  return rental.rental_id || rental.service_id;
};

export const pushEntityRoute = (
  router: Router,
  route: Href | null,
  onInvalid: () => void,
) => {
  if (!route) {
    onInvalid();
    return;
  }
  router.push(route as any);
};

export const showInvalidEntityAlert = (t: (key: string, fb?: string) => string) => {
  Alert.alert(
    t("common.error", "Fehler"),
    t("common.unavailable", "Dieser Eintrag kann nicht geöffnet werden."),
  );
};

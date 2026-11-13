import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import BusinessMap from "../../components/BusinessMap";
import LocatorCard from "../locator/LocatorCard";
import { MapBounds } from "../../context/MapBoundsContext";
import { Business, EventItem, ActivityItem, Rental, Service } from "../../lib/api";
import { Listing } from "../../lib/api/listings";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { entityRoutes, pushEntityRoute, getRentalNavigationId, showInvalidEntityAlert } from "../../lib/navigation/entityRoutes";
import { MAP_PAGE_GUTTER } from "../../lib/city/mapLayout";

interface MapSectionProps {
  mapBounds: MapBounds;
  businesses: Business[];
  hotels?: Business[];
  events: EventItem[];
  activities: ActivityItem[];
  rentals: Rental[];
  jobs: any[];
  services: Service[];
  products?: Listing[];
  ownerHomes?: Listing[];
  userLocation?: { latitude: number; longitude: number } | null;
  userPinImage?: string | null;
  userPinName?: string | null;
  pinLocation?: { latitude: number; longitude: number } | null;
  manualOrigin?: { latitude: number; longitude: number; name?: string } | null;
  onRegionChange: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onRecenter?: (lat?: number, lng?: number) => void;
  recentering?: boolean;
  focusToken?: number;
}

export function MapSection({ mapBounds, businesses, hotels, events, activities, rentals, jobs, services, products, ownerHomes, userLocation, userPinImage, userPinName, pinLocation, manualOrigin, onRegionChange, onRecenter, recentering, focusToken }: MapSectionProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const allBusinesses = useMemo(() => {
    if (!hotels || hotels.length === 0) return businesses;
    const bizIds = new Set(businesses.map(b => b.business_id));
    return [...businesses, ...hotels.filter(h => !bizIds.has(h.business_id))];
  }, [businesses, hotels]);

  const productMarkers = useMemo(() =>
    (products || []).filter(l => l.latitude != null && l.longitude != null).map(l => ({
      id: l.listing_id,
      latitude: l.latitude!,
      longitude: l.longitude!,
      title: l.title,
      pinColor: COLORS.pinProduct,
      type: "product" as const,
    })), [products]);

  const homeMarkers = useMemo(() => {
    const existingRentalIds = new Set(
      rentals.map((r) => getRentalNavigationId(r as any)).filter(Boolean) as string[],
    );
    return (ownerHomes || []).filter(h => h.latitude != null && h.longitude != null && !existingRentalIds.has(h.listing_id)).map(l => ({
      id: l.listing_id,
      latitude: l.latitude!,
      longitude: l.longitude!,
      title: l.title,
      pinColor: COLORS.pinHome,
      type: "rental" as const,
    }));
  }, [ownerHomes, rentals]);

  const extraMarkers = useMemo(() => [...productMarkers, ...homeMarkers,...(manualOrigin ? [{id:"home-user-origin",
    latitude:manualOrigin.latitude,longitude:manualOrigin.longitude,title:manualOrigin.name || t("mobility.manualLocation","Entered location"),pinColor:COLORS.primary}] : [])], [productMarkers, homeMarkers, manualOrigin, t]);

  const handleMarkerPress = (id: string) => {
    // Card first, like /app: the first tap selects and shows the card below
    // the map; tapping the selected pin (or the card) opens the detail page.
    if (selectedId === id) { navigateToEntity(id); return; }
    setSelectedId(id);
  };

  const navigateToEntity = (id: string) => {
    const all = [...allBusinesses, ...(hotels || [])];
    const biz = all.find(b => b.business_id === id);
    if (biz) { router.push(`/business/${id}` as any); return; }
    const ev = events.find(e => e.event_id === id);
    if (ev) { router.push(`/event/${id}` as any); return; }
    const act = activities.find(a => a.activity_id === id);
    if (act) { router.push(`/activity/${id}` as any); return; }
    const rental = rentals.find(r => r.rental_id === id);
    if (rental) {
      const navId = getRentalNavigationId(rental as any) as any;
      const route = (rental as any).source_type === "owner" ? entityRoutes.listing(navId) : entityRoutes.rental(navId);
      pushEntityRoute(router, route, () => showInvalidEntityAlert(t));
      return;
    }
    const service = services.find(s => s.service_id === id);
    if (service) { pushEntityRoute(router, entityRoutes.service(id), () => showInvalidEntityAlert(t)); return; }
    const job = jobs.find(j => j.job_id === id);
    if (job) { pushEntityRoute(router, entityRoutes.job(id), () => showInvalidEntityAlert(t)); return; }
    const prod = (products || []).find(p => p.listing_id === id);
    if (prod) { pushEntityRoute(router, entityRoutes.listing(id), () => showInvalidEntityAlert(t)); return; }
    const home = (ownerHomes || []).find(h => h.listing_id === id);
    if (home) { pushEntityRoute(router, entityRoutes.listing(id), () => showInvalidEntityAlert(t)); return; }
  };

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const all = [...allBusinesses, ...(hotels || [])];
    const biz = all.find(b => b.business_id === selectedId);
    if (biz) return { kind: "business" as const, data: biz };
    const ev = events.find(e => e.event_id === selectedId);
    if (ev) return { kind: "event" as const, data: ev };
    const act = activities.find(a => a.activity_id === selectedId);
    if (act) return { kind: "activity" as const, data: act };
    const rental = rentals.find(r => r.rental_id === selectedId);
    if (rental) return { kind: "rental" as const, data: rental };
    const service = services.find(s => s.service_id === selectedId);
    if (service) return { kind: "service" as const, data: service };
    const job = jobs.find(j => j.job_id === selectedId);
    if (job) return { kind: "job" as const, data: job };
    const prod = (products || []).find(p => p.listing_id === selectedId);
    if (prod) return { kind: "listing" as const, data: prod };
    const home = (ownerHomes || []).find(h => h.listing_id === selectedId);
    if (home) return { kind: "listing" as const, data: home };
    return null;
  }, [selectedId, allBusinesses, hotels, events, activities, rentals, services, jobs, products, ownerHomes]);

  const selectedTitle = !selected ? "" : selected.kind === "business" ? selected.data.name
    : selected.kind === "event" || selected.kind === "activity" ? selected.data.title
    : selected.kind === "rental" ? selected.data.title
    : selected.kind === "service" ? selected.data.name
    : selected.kind === "job" ? (selected.data as { title?: string }).title || ""
    : selected.data.title;
  const selectedSubtitle = !selected ? "" : selected.kind === "rental"
    ? selected.data.address || selected.data.description || ""
    : selected.kind === "service" ? selected.data.address || ""
    : selected.kind === "listing" ? (selected.data.address || (selected.data as { public_location_label?: string }).public_location_label || "")
    : "";

  // Both platforms use Home's shared LocationContext request/pin update.
  const handleRecenter = () => {onRecenter?.();};

  return (
    <View style={styles.container}>
      <View style={styles.mapWrapper}>
        <BusinessMap
          horizontalInset={0}
          // Both platforms move the camera only on explicit focus/recenter;
          // GPS updates the pin without pulling an explored base back home.
          location={undefined}
          showUserLocation={!!pinLocation}
          userPinImage={userPinImage ?? undefined}
          userPinName={userPinName}
          pinLocation={pinLocation}
          initialRegion={{
            latitude: mapBounds.centerLat,
            longitude: mapBounds.centerLng,
            latitudeDelta: mapBounds.maxLat - mapBounds.minLat,
            longitudeDelta: mapBounds.maxLng - mapBounds.minLng,
          }}
          focusRegion={{
            latitude: mapBounds.centerLat,
            longitude: mapBounds.centerLng,
            latitudeDelta: mapBounds.maxLat - mapBounds.minLat,
            longitudeDelta: mapBounds.maxLng - mapBounds.minLng,
          }}
          focusToken={focusToken}
          businesses={allBusinesses}
          events={events}
          activities={activities}
          rentals={rentals}
          services={services}
          jobs={jobs}
          onRegionChangeComplete={(bounds: any) => {
            onRegionChange({ minLat: bounds.minLat, maxLat: bounds.maxLat, minLng: bounds.minLng, maxLng: bounds.maxLng });
          }}
          onMarkerPress={handleMarkerPress}
          extraMarkers={extraMarkers}
          disabled={false}
        />
        <Pressable style={styles.recenterButton} onPress={handleRecenter} disabled={recentering}>
          {recentering ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="locate" size={22} color={COLORS.primary} />
          )}
        </Pressable>
      </View>
      {selected && selectedId && (
        <View style={styles.selectedCard} testID="home-map-selected-card">
          <Pressable testID="home-map-selected-close" accessibilityRole="button"
            accessibilityLabel={t("common.close", "Close")} onPress={() => setSelectedId(null)} style={styles.selectedClose}>
            <Ionicons name="close" size={18} color={COLORS.textGray} />
          </Pressable>
          {selected.kind === "business" ? (
            <LocatorCard type="business" data={selected.data} distance={null} isOpen={null} onPress={() => navigateToEntity(selectedId)} />
          ) : selected.kind === "event" ? (
            <LocatorCard type="event" data={selected.data} distance={null} onPress={() => navigateToEntity(selectedId)} />
          ) : selected.kind === "activity" ? (
            <LocatorCard type="activity" data={selected.data} distance={null} onPress={() => navigateToEntity(selectedId)} />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => navigateToEntity(selectedId)} style={styles.selectedGeneric}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedTitle} numberOfLines={1}>{selectedTitle}</Text>
                {!!selectedSubtitle && <Text style={styles.selectedSubtitle} numberOfLines={2}>{selectedSubtitle}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal:MAP_PAGE_GUTTER,
    marginBottom: 12,
    backgroundColor: COLORS.background,
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 12,
  },
  mapWrapper: {
    paddingHorizontal: 0,
    position: "relative",
  },
  recenterButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  selectedCard: {
    marginTop: 8,
    position: "relative",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
  },
  selectedClose: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  selectedGeneric: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
  },
  selectedTitle: { fontSize: FONT_SIZES.bodySmall, fontWeight: FONT_WEIGHTS.semibold, color: COLORS.textPrimary },
  selectedSubtitle: { fontSize: FONT_SIZES.small, color: COLORS.textMuted, marginTop: 2 },
});

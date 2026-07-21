import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import BusinessMap from "../../components/BusinessMap";
import { MapBounds } from "../../context/MapBoundsContext";
import { Business, EventItem, ActivityItem, Rental, Service } from "../../lib/api";
import { Listing } from "../../lib/api/listings";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { entityRoutes, pushEntityRoute, getRentalNavigationId } from "../../lib/navigation/entityRoutes";

interface MapSectionProps {
  mapBounds: MapBounds;
  businesses: Business[];
  events: EventItem[];
  activities: ActivityItem[];
  rentals: Rental[];
  jobs: any[];
  services: Service[];
  products?: Listing[];
  ownerHomes?: Listing[];
  onRegionChange: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onRecenter?: (lat: number, lng: number) => void;
}

export function MapSection({ mapBounds, businesses, events, activities, rentals, jobs, services, products, ownerHomes, onRegionChange, onRecenter }: MapSectionProps) {
  const router = useRouter();

  const productMarkers = useMemo(() =>
    (products || []).filter(l => l.latitude != null && l.longitude != null).map(l => ({
      id: l.listing_id,
      latitude: l.latitude!,
      longitude: l.longitude!,
      title: l.title,
      pinColor: COLORS.success,
      type: "product" as const,
    })), [products]);

  const homeMarkers = useMemo(() =>
    (ownerHomes || []).filter(l => l.latitude != null && l.longitude != null).map(l => ({
      id: l.listing_id,
      latitude: l.latitude!,
      longitude: l.longitude!,
      title: l.title,
      pinColor: COLORS.rentalsAccent,
      type: "rental" as const,
    })), [ownerHomes]);

  const handleMarkerPress = (id: string) => {
    const biz = businesses.find(b => b.business_id === id);
    if (biz) { router.push(`/business/${id}` as any); return; }
    const ev = events.find(e => e.event_id === id);
    if (ev) { router.push(`/event/${id}` as any); return; }
    const act = activities.find(a => a.activity_id === id);
    if (act) { router.push(`/activity/${id}` as any); return; }
    const rental = rentals.find(r => r.rental_id === id);
    if (rental) { pushEntityRoute(router, entityRoutes.rental(getRentalNavigationId(rental as any)), () => {}); return; }
    const service = services.find(s => s.service_id === id);
    if (service) { pushEntityRoute(router, entityRoutes.service(id), () => {}); return; }
    const job = jobs.find(j => j.job_id === id);
    if (job) { pushEntityRoute(router, entityRoutes.job(id), () => {}); return; }
    const prod = (products || []).find(p => p.listing_id === id);
    if (prod) { pushEntityRoute(router, entityRoutes.listing(id), () => {}); return; }
    const home = (ownerHomes || []).find(h => h.listing_id === id);
    if (home) { pushEntityRoute(router, entityRoutes.rental(id), () => {}); return; }
  };

  const handleRecenter = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({});
      onRecenter?.(loc.coords.latitude, loc.coords.longitude);
    } catch (e) {
      console.warn("Recenter failed:", e);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapWrapper}>
        <BusinessMap
          location={{ latitude: mapBounds.centerLat, longitude: mapBounds.centerLng }}
          businesses={businesses}
          events={events}
          activities={activities}
          rentals={rentals}
          services={services}
          jobs={jobs}
          onRegionChangeComplete={(bounds: any) => {
            onRegionChange({ minLat: bounds.minLat, maxLat: bounds.maxLat, minLng: bounds.minLng, maxLng: bounds.maxLng });
          }}
          onMarkerPress={handleMarkerPress}
          markers={[...productMarkers, ...homeMarkers]}
          disabled={false}
        />
        <Pressable style={styles.recenterButton} onPress={handleRecenter}>
          <Ionicons name="locate" size={22} color={COLORS.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
});

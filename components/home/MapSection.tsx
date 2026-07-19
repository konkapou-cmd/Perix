import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import BusinessMap from "../../components/BusinessMap";
import { MapBounds } from "../../context/MapBoundsContext";
import { Business, EventItem, ActivityItem, Rental, Service } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

interface MapSectionProps {
  mapBounds: MapBounds;
  businesses: Business[];
  events: EventItem[];
  activities: ActivityItem[];
  rentals: Rental[];
  jobs: any[];
  services: Service[];
  onRegionChange: (bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => void;
  onRecenter?: (lat: number, lng: number) => void;
}

export function MapSection({ mapBounds, businesses, events, activities, rentals, jobs, services, onRegionChange, onRecenter }: MapSectionProps) {
  const router = useRouter();

  const handleMarkerPress = (id: string) => {
    const biz = businesses.find(b => b.business_id === id);
    if (biz) { router.push(`/business/${id}` as any); return; }
    const ev = events.find(e => e.event_id === id);
    if (ev) { router.push(`/event/${id}` as any); return; }
    const act = activities.find(a => a.activity_id === id);
    if (act) { router.push(`/activity/${id}` as any); return; }
    const rental = rentals.find(r => r.rental_id === id);
    if (rental) { router.push(`/service/${rental.service_id || id}` as any); return; }
    const job = jobs.find(j => j.job_id === id);
    if (job) { router.push(`/job/${id}` as any); return; }
    const service = services.find(s => s.service_id === id);
    if (service) { router.push(`/service/${id}` as any); return; }
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

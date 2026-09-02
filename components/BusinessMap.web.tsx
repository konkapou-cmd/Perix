import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Platform, Pressable, Modal, Image as RNImage, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental, Job, Service } from "../lib/api";
import { formatEventDate } from "../lib/formatDate";
import { translateCategory } from "../lib/categoryTranslation";
import { COLORS } from "../lib/designTokens";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  pinColor?: string;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product";
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  location: { latitude: number; longitude: number };
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  focusRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  focusToken?: number;
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  jobs?: Job[];
  services?: Service[];
  markers?: MapMarker[];
  extraMarkers?: MapMarker[];
  showUserLocation?: boolean;
  onRegionChange?: (bounds: MapBounds) => void;
  onRegionChangeComplete?: (bounds: MapBounds) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  height?: number;
  disabled?: boolean;
  disabledHint?: string;
  staticMode?: boolean;
};

const googleKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GEO_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GEO_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

let googleScriptLoaded = false;
let googleScriptPromise: Promise<void> | null = null;

function loadGoogleScript() {
  if (googleScriptLoaded) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).google?.maps) { googleScriptLoaded = true; resolve(); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleKey}&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => { googleScriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Google Maps script load failed"));
    document.head.appendChild(script);
  });
  return googleScriptPromise;
}

export default function BusinessMap({
  location,
  initialRegion,
  focusRegion,
  focusToken,
  businesses = [],
  events = [],
  activities = [],
  artists = [],
  rentals = [],
  jobs = [],
  services = [],
  markers,
  extraMarkers,
  showUserLocation,
  onRegionChange,
  onRegionChangeComplete,
  onMarkerPress,
  onMapPress,
  height = 300,
  disabled = false,
  disabledHint = "Tap to enable location",
  staticMode = false,
}: Props) {
  const { t } = useTranslation();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const enablingRef = useRef(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const lastBoundsRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLocationRef = useRef<string>("");
  const router = useRouter();

  const generatedMarkers: MapMarker[] = [
    ...businesses.map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      description: business.category,
      pinColor: business.root_category === "hotels" ? COLORS.pinHotel : COLORS.pinBusiness,
    })),
    ...events
      .filter(e => e.latitude != null && e.longitude != null)
      .map((event) => ({
        id: event.event_id,
        latitude: event.latitude!,
        longitude: event.longitude!,
        title: event.title,
        description: event.location || formatEventDate(event.start_time),
        pinColor: COLORS.pinEvent,
      })),
    ...activities
      .filter(a => a.latitude != null && a.longitude != null)
      .map((activity) => ({
        id: activity.activity_id,
        latitude: activity.latitude!,
        longitude: activity.longitude!,
        title: activity.title,
        description: activity.location || `${formatEventDate(activity.date)} ${activity.time || ''}`,
        pinColor: COLORS.pinActivity,
      })),
    ...artists
      .filter(a => a.latitude != null && a.longitude != null)
      .map((artist) => ({
        id: artist.artist_id,
        latitude: artist.latitude!,
        longitude: artist.longitude!,
        title: artist.name,
        description: artist.town || artist.genres?.join(", ") || "",
        pinColor: COLORS.pinClosed,
      })),
    ...rentals
      .filter(r => r.latitude != null && r.longitude != null)
      .map((rental) => ({
        id: rental.rental_id,
        latitude: rental.latitude!,
        longitude: rental.longitude!,
        title: rental.title,
        description: rental.rent_price || rental.address || "",
        pinColor: COLORS.pinRental,
      })),
    ...jobs
      .filter(j => j.latitude != null && j.longitude != null)
      .map((job) => ({
        id: job.job_id,
        latitude: job.latitude!,
        longitude: job.longitude!,
        title: job.title,
        description: job.work_location || "",
        pinColor: COLORS.pinJob,
      })),
    ...services
      .filter(s => s.latitude != null && s.longitude != null && s.root_category !== "rentals" && s.root_category !== "rental-real-estate")
      .map((service) => ({
        id: service.service_id,
        latitude: service.latitude!,
        longitude: service.longitude!,
        title: service.name,
        description: service.address || "",
        pinColor: COLORS.pinService,
      })),
  ];

  const allMarkers: MapMarker[] = markers ?? [
    ...generatedMarkers,
    ...(extraMarkers ?? []),
  ];

  // Init map
  useEffect(() => {
    if (!mapDivRef.current || mapReady || mapError) return;
    loadGoogleScript()
      .then(() => {
        if (!mapDivRef.current) return;
        const google = (window as any).google;
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: location.latitude, lng: location.longitude },
          zoom: 14,
          disableDefaultUI: staticMode,
          zoomControl: !staticMode,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: !staticMode,
          gestureHandling: staticMode ? "none" : "greedy",
          styles: [
            { elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#5C7A99' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#EDF4FB' }] },
            { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#DCE8F4' }] },
            { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#7C97B3' }] },
            { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#5C7A99' }] },
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#C8E2F4' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#EDF4FB' }] },
            { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#7C97B3' }] },
            { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E2EEF9' }] },
            { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#4A6B8C' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#59ABE3' }] },
            { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#FFFFFF' }] },
          ],
        });

        map.addListener("bounds_changed", () => {
          const bounds = map.getBounds();
          if (!bounds) return;
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          const key = `${sw.lat()},${ne.lat()},${sw.lng()},${ne.lng()}`;
          if (key === lastBoundsRef.current) return;
          lastBoundsRef.current = key;
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onRegionChangeComplete?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
          }, 500);
          onRegionChange?.({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
        });

        map.addListener("click", (e: any) => {
          onMapPress?.(e.latLng.lat(), e.latLng.lng());
        });

        mapRef.current = map;
        setMapReady(true);
      })
      .catch(() => setMapError(true));
    return () => { mapRef.current = null; };
  }, [location.latitude, location.longitude]);

  // Sync markers
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const google = (window as any).google;
    markersRef.current.forEach((m: any) => m.setMap(null));
    markersRef.current = [];
    allMarkers.forEach((data) => {
      const pinColor = data.pinColor ?? COLORS.success;
      const marker = new google.maps.Marker({
        position: { lat: data.latitude, lng: data.longitude },
        map: mapRef.current,
        title: data.title,
        icon: {
          path: "M12 0C7.03 0 3 4.03 3 9c0 6.4 9 15 9 15s9-8.6 9-15C21 4.03 16.97 0 12 0zM12 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8z",
          fillColor: pinColor,
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1.6,
          scale: 1.6,
          anchor: new google.maps.Point(12, 24),
          fillRule: "evenodd",
        },
      });
      marker.addListener("click", () => {
        const biz = businesses.find((b) => b.business_id === data.id);
        if (biz) setSelectedBusiness(biz);
        onMarkerPress?.(data.id);
      });
      markersRef.current.push(marker);
    });
  }, [allMarkers, mapReady, businesses]);

  // Fly to location
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    if (key === prevLocationRef.current) return;
    prevLocationRef.current = key;
    mapRef.current.panTo({ lat: location.latitude, lng: location.longitude });
  }, [location, mapReady]);

  // Fly to explicitly focused region (e.g. search selection / recenter)
  useEffect(() => {
    if (!mapRef.current || !mapReady || !focusToken || !focusRegion) return;
    mapRef.current.panTo({ lat: focusRegion.latitude, lng: focusRegion.longitude });
    mapRef.current.setZoom(14);
  }, [focusToken, mapReady]);

  if (disabled) {
    return (
      <View style={[s.wrap, { height }]}>
        <Pressable
          style={s.disabledOverlay}
          onPress={async () => {
            if (!onMapPress || enablingRef.current) return;
            enablingRef.current = true;
            setEnabling(true);
            try {
              const granted = await new Promise<boolean>((resolve) => {
                if (!navigator?.geolocation) {
                  resolve(false);
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  () => resolve(true),
                  () => resolve(false),
                  { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
                );
              });
              if (granted) {
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    onMapPress(pos.coords.latitude, pos.coords.longitude);
                  },
                  () => {},
                  { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
                );
              }
            } catch (e) {
              console.error("Web geolocation failed:", e);
            } finally {
              enablingRef.current = false;
              setEnabling(false);
            }
          }}
        >
          {enabling ? (
            <ActivityIndicator size="large" color="#59ABE3" />
          ) : (
            <Ionicons name="location" size={40} color={COLORS.pinClosed} />
          )}
          <Text style={s.disabledText}>{enabling ? "…" : disabledHint}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.wrap, { height }]}>
      {!mapReady && !mapError && (
        <View style={s.loading}><ActivityIndicator size="large" color="#000" /></View>
      )}
      {mapError && (
        <View style={s.loading}><Ionicons name="alert-circle" size={32} color="#ef4444" /><Text style={s.errorText}>{t("map.loadFailed", "Karte konnte nicht geladen werden")}</Text></View>
      )}
      <View
        ref={mapDivRef as any}
        style={{ flex: 1, borderRadius: 12 }}
      />

      <Modal visible={!!selectedBusiness} transparent animationType="fade" onRequestClose={() => setSelectedBusiness(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelectedBusiness(null)}>
          <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
            <Pressable style={s.cardClose} onPress={() => setSelectedBusiness(null)}>
              <Ionicons name="close" size={20} color={COLORS.textGray} />
            </Pressable>
            <View style={s.cardHead}>
              {selectedBusiness?.logo_image || selectedBusiness?.profile_photo ? (
                <RNImage source={{ uri: (selectedBusiness?.logo_image || selectedBusiness?.profile_photo) as string }} style={s.cardLogo} />
              ) : (
                <View style={s.cardLogoPl}><Text style={s.cardLogoT}>{selectedBusiness?.name?.charAt(0).toUpperCase() || "?"}</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.cardName}>{selectedBusiness?.name}</Text>
                <Text style={s.cardCat}>{translateCategory(selectedBusiness?.subcategory || selectedBusiness?.category || selectedBusiness?.root_category, t)}</Text>
              </View>
            </View>
            {selectedBusiness?.address && (
              <View style={s.cardAddr}>
                <Ionicons name="location-outline" size={14} color={COLORS.textGray} />
                <Text style={s.cardAddrText}>{selectedBusiness.address}</Text>
              </View>
            )}
            {selectedBusiness?.description && (
              <Text style={s.cardDesc} numberOfLines={3}>{selectedBusiness.description}</Text>
            )}
            <View style={s.cardActions}>
              <Pressable style={s.cardBtn2} onPress={() => { if (selectedBusiness) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${selectedBusiness.latitude},${selectedBusiness.longitude}&travelmode=driving`); }}>
                <Ionicons name="navigate-outline" size={18} color={COLORS.pinClosed} />
                <Text style={s.cardBtn2T}>Directions</Text>
              </Pressable>
              <Pressable style={s.cardBtn1} onPress={() => { if (selectedBusiness) { router.push(`/business/${selectedBusiness.business_id}`); setSelectedBusiness(null); } }}>
                <Text style={s.cardBtn1T}>View Business</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, borderRadius: 16, backgroundColor: "#fff", overflow: "hidden" },
  disabledOverlay: { flex: 1, backgroundColor: COLORS.borderGray, justifyContent: "center", alignItems: "center", gap: 12 },
  disabledText: { fontSize: 15, color: COLORS.textGray, fontWeight: "500" },
  loading: { ...StyleSheet.absoluteFillObject as any, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6", zIndex: 10 },
  errorText: { color: "#ef4444", fontSize: 13, marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 340 },
  cardClose: { position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  cardLogo: { width: 52, height: 52, borderRadius: 26 },
  cardLogoPl: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.pinClosed, alignItems: "center", justifyContent: "center" },
  cardLogoT: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  cardName: { fontSize: 18, fontWeight: "700", color: "#111827" },
  cardCat: { fontSize: 13, color: COLORS.pinClosed, marginTop: 2 },
  cardAddr: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  cardAddrText: { fontSize: 13, color: COLORS.textGray, flex: 1 },
  cardDesc: { fontSize: 14, color: COLORS.textDark, lineHeight: 20, marginBottom: 16 },
  cardActions: { flexDirection: "row", gap: 10 },
  cardBtn1: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.pinClosed },
  cardBtn1T: { fontSize: 14, fontWeight: "600", color: "#fff" },
  cardBtn2: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.primaryTintDark },
  cardBtn2T: { fontSize: 14, fontWeight: "600", color: COLORS.pinClosed },
});

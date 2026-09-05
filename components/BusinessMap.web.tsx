import { useCallback, useEffect, useRef, useState, useMemo } from "react";
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
  pinInnerColor?: string;
  type?: "business" | "event" | "activity" | "artist" | "job" | "rental" | "service" | "product";
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  location?: { latitude: number; longitude: number };
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
  if (googleScriptLoaded && (window as any).google?.maps?.Map) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;
  googleScriptPromise = new Promise<void>((resolve, reject) => {
    if ((window as any).google?.maps?.Map) { googleScriptLoaded = true; resolve(); return; }
    const script = document.createElement("script");
    // Classic (non-async) loader: everything loads in one script, so
    // `google.maps.Map` is available on onload — avoids the async bootstrap
    // chunks that Brave/ad-blockers intercept (causing "Map is not a constructor").
    script.src = `https://maps.googleapis.com/maps/api/js?key=${googleKey}`;
    script.async = true;
    script.onload = () => {
      if (!(window as any).google?.maps?.Map) {
        reject(new Error("Google Maps API not available"));
        googleScriptPromise = null;
        return;
      }
      googleScriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      googleScriptPromise = null;
      reject(new Error("Google Maps script load failed"));
    };
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
  const mapReadyRef = useRef(false);
  const [mapError, setMapError] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const enablingRef = useRef(false);
  const centerLat = location?.latitude ?? initialRegion?.latitude ?? 52.52;
  const centerLng = location?.longitude ?? initialRegion?.longitude ?? 13.405;
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const lastBoundsRef = useRef<string>("");
  const prevCenterRef = useRef<string>("");
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

  const groupedMarkers = useMemo(() => {
    const groups = new Map<string, MapMarker[]>();
    allMarkers.forEach((m) => {
      const key = `${m.latitude.toFixed(5)}_${m.longitude.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    });
    return Array.from(groups.entries()).map(([key, items]) => {
      const uniqueColors: string[] = [];
      items.forEach((i) => {
        if (i.pinColor && !uniqueColors.includes(i.pinColor)) uniqueColors.push(i.pinColor);
        if (i.pinInnerColor && !uniqueColors.includes(i.pinInnerColor)) uniqueColors.push(i.pinInnerColor);
      });
      return {
        key,
        items,
        latitude: items[0].latitude,
        longitude: items[0].longitude,
        count: items.length,
        pinColor: items.length === 1 ? items[0].pinColor ?? COLORS.pinClosed : "#264348",
        pinInnerColor: items.length === 1 ? items[0].pinInnerColor : undefined,
        memberColors: items.length > 1 ? uniqueColors.slice(0, 4) : [],
        type: items[0].type,
      };
    });
  }, [allMarkers]);

  const [zoomLevel, setZoomLevel] = useState(14);
  const [selectedGroup, setSelectedGroup] = useState<MapMarker[] | null>(null);

  // Init map — runs once per map div lifetime (disabled toggles or unmount)
  useEffect(() => {
    if (!mapDivRef.current || mapError) return;
    if (mapRef.current) return; // map already alive for this div
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const google = (window as any).google;
        const map = new google.maps.Map(mapDivRef.current, {
          center: { lat: centerLat, lng: centerLng },
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

        map.addListener("zoom_changed", () => {
          setZoomLevel(map.getZoom() || 14);
        });

        if (cancelled) return;
        mapRef.current = map;
        mapReadyRef.current = true;
        setMapReady(true);
        console.log("[WebMap] initialized zoom=" + map.getZoom());
      })
      .catch((e) => { console.error("[WebMap] init failed", e); setMapError(true); });
    return () => {
      cancelled = true;
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, [disabled, mapError]);

  // Sync markers — DOM-based pins (OverlayView) for pixel-perfect app-style rendering
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) {
      console.log("[WebMap] markers skipped (mapRef=" + !!mapRef.current + " ready=" + mapReadyRef.current + ")");
      return;
    }
    const google = (window as any).google;

    // remove previous overlays
    markersRef.current.forEach((ov: any) => {
      try { ov.setMap(null); ov.remove && ov.remove(); } catch (e) {}
    });
    markersRef.current = [];

    const zoomScale = Math.max(0.8, Math.min(1.7, zoomLevel / 12));

    console.log("[WebMap] markers: groups=" + groupedMarkers.length + " zoomScale=" + zoomScale.toFixed(2));

    groupedMarkers.forEach((group) => {
      const isGroup = group.count > 1;
      const baseSize = (isGroup
        ? (group.count < 3 ? 26 : group.count < 10 ? 30 : group.count < 30 ? 34 : 40)
        : 22) * zoomScale;
      const sizePx = Math.round(baseSize);
      const innerSize = Math.round(Math.max(6, 8 * zoomScale));
      const fontSize = Math.min(17, (group.count >= 100 ? 9 : group.count >= 10 ? 10.5 : 12) * zoomScale);
      const pinColor = group.pinColor || "#264348";

      // Container div (positioned by OverlayView)
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.cursor = "pointer";
      container.style.userSelect = "none";

      const pin = document.createElement("div");
      pin.style.width = sizePx + "px";
      pin.style.height = sizePx + "px";
      pin.style.borderRadius = "50%";
      pin.style.backgroundColor = pinColor;
      pin.style.border = "2px solid #ffffff";
      pin.style.boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
      pin.style.display = "flex";
      pin.style.alignItems = "center";
      pin.style.justifyContent = "center";
      pin.style.position = "relative";
      pin.style.transform = "translate(-50%, -50%)";
      pin.style.boxSizing = "border-box";
      container.appendChild(pin);

      if (isGroup) {
        const countText = document.createElement("div");
        countText.textContent = String(group.count);
        countText.style.color = "#ffffff";
        countText.style.fontWeight = "700";
        countText.style.fontFamily = "Arial, sans-serif";
        countText.style.fontSize = fontSize + "px";
        countText.style.lineHeight = "1";
        pin.appendChild(countText);

        group.memberColors.slice(0, 4).forEach((c, i) => {
          const dot = document.createElement("div");
          const dotSize = Math.round(Math.max(4, 5 * zoomScale));
          dot.style.position = "absolute";
          dot.style.width = dotSize + "px";
          dot.style.height = dotSize + "px";
          dot.style.borderRadius = "50%";
          dot.style.backgroundColor = c;
          dot.style.border = "1px solid #fff";
          const angle = (i / Math.min(group.memberColors.length, 4)) * Math.PI * 2;
          const r = sizePx / 2 + 3;
          dot.style.left = sizePx / 2 + Math.cos(angle) * r - dotSize / 2 + "px";
          dot.style.top = sizePx / 2 + Math.sin(angle) * r - dotSize / 2 + "px";
          pin.appendChild(dot);
        });
      } else if (group.pinInnerColor) {
        const inner = document.createElement("div");
        inner.style.width = innerSize + "px";
        inner.style.height = innerSize + "px";
        inner.style.borderRadius = "50%";
        inner.style.backgroundColor = group.pinInnerColor;
        pin.appendChild(inner);
      }

      class PinOverlay extends google.maps.OverlayView {
        div: HTMLDivElement;
        pos: { lat: number; lng: number };
        constructor(div: HTMLDivElement, pos: { lat: number; lng: number }) {
          super();
          this.div = div;
          this.pos = pos;
        }
        onAdd(this: any) {
          this.getPanes().overlayMouseTarget.appendChild(this.div);
        }
        draw(this: any) {
          const overlayProjection = this.getProjection();
          const point = overlayProjection.fromLatLngToDivPixel(new google.maps.LatLng(this.pos.lat, this.pos.lng));
          if (point) {
            this.div.style.left = point.x + "px";
            this.div.style.top = point.y + "px";
          }
        }
        onRemove(this: any) {
          if (this.div.parentNode) this.div.parentNode.removeChild(this.div);
        }
      }

      const overlay = new PinOverlay(container, { lat: group.latitude, lng: group.longitude });
      overlay.setMap(mapRef.current);

      container.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isGroup) {
          setSelectedGroup(group.items);
          return;
        }
        const biz = businesses.find((b) => b.business_id === group.items[0].id);
        if (biz) setSelectedBusiness(biz);
        onMarkerPress?.(group.items[0].id);
      });

      markersRef.current.push(overlay);
    });
  }, [groupedMarkers, mapReady, businesses, zoomLevel]);

  // Fly to location
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current || !location) return;
    const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    if (key === prevLocationRef.current) return;
    prevLocationRef.current = key;
    mapRef.current.panTo({ lat: location.latitude, lng: location.longitude });
  }, [location, mapReady]);

  // Pan when the initialRegion-based center changes (e.g. home map bounds updates)
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current) return;
    if (location) return;
    const key = `${centerLat.toFixed(4)},${centerLng.toFixed(4)}`;
    if (key === prevCenterRef.current) return;
    prevCenterRef.current = key;
    mapRef.current.panTo({ lat: centerLat, lng: centerLng });
  }, [centerLat, centerLng, location, mapReady]);

  // Fly to explicitly focused region (e.g. search selection / recenter)
  useEffect(() => {
    if (!mapRef.current || !mapReadyRef.current || !focusToken || !focusRegion) return;
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

      <Modal visible={!!selectedGroup} transparent animationType="slide" onRequestClose={() => setSelectedGroup(null)}>
        <Pressable style={s.sheetOverlay} onPress={() => setSelectedGroup(null)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{t("map.itemsAtLocation", "{{count}} items at this location", { count: selectedGroup ? selectedGroup.length : 0 })}</Text>
            <View style={s.sheetList}>
              {(selectedGroup || []).map((item) => (
                <Pressable
                  key={item.id}
                  style={s.sheetItem}
                  onPress={() => { setSelectedGroup(null); onMarkerPress?.(item.id); }}
                >
                  <View style={[s.sheetDot, { backgroundColor: item.pinColor || COLORS.pinClosed }]} />
                  <View style={s.sheetItemInfo}>
                    <Text style={s.sheetItemName} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.sheetItemType} numberOfLines={1}>{t(`map.types.${item.type || "item"}`, item.type || "item")}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textGray} />
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
  wrap: { marginHorizontal: 16, borderRadius: 12, backgroundColor: "#ffffff", overflow: "hidden" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, maxHeight: "60%", overflow: "hidden" },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "#d1d5db", alignSelf: "center", marginTop: 10 },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#264348", paddingHorizontal: 20, marginTop: 14, marginBottom: 8 },
  sheetList: { maxHeight: 360 },
  sheetItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 20, gap: 12 },
  sheetDot: { width: 14, height: 14, borderRadius: 7 },
  sheetItemInfo: { flex: 1 },
  sheetItemName: { fontSize: 15, fontWeight: "600", color: "#264348" },
  sheetItemType: { fontSize: 12, color: "rgba(38,67,72,0.65)", marginTop: 1 },
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

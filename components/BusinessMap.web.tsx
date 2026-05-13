import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View, Platform, Pressable, Modal, Image as RNImage, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { Business, EventItem, ActivityItem, ArtistSearchResult, Rental } from "../lib/api";
import Constants from "expo-constants";
import { useRouter } from "expo-router";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
};

type MapBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  location: { latitude: number; longitude: number };
  businesses?: Business[];
  events?: EventItem[];
  activities?: ActivityItem[];
  artists?: ArtistSearchResult[];
  rentals?: Rental[];
  markers?: MapMarker[];
  showUserLocation?: boolean;
  onRegionChange?: (bounds: MapBounds) => void;
  onRegionChangeComplete?: (bounds: MapBounds) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: (latitude: number, longitude: number) => void;
  height?: number;
  disabled?: boolean;
  disabledHint?: string;
};

const googleKey =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GEO_KEY ||
  Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GEO_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  "";

export default function BusinessMap({
  location,
  businesses = [],
  events = [],
  activities = [],
  artists = [],
  rentals = [],
  markers,
  showUserLocation,
  onRegionChange,
  onRegionChangeComplete,
  onMarkerPress,
  onMapPress,
  height = 300,
  disabled = false,
  disabledHint = "Tap to enable location",
}: Props) {
  const webViewRef = useRef<WebView>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const lastBoundsRef = useRef<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLocationRef = useRef<string>("");
  const router = useRouter();

  const allMarkers: MapMarker[] = markers ?? [
    ...businesses.map((business) => ({
      id: business.business_id,
      latitude: business.latitude,
      longitude: business.longitude,
      title: business.name,
      description: business.category,
    })),
    ...events
      .filter(e => e.latitude != null && e.longitude != null)
      .map((event) => ({
        id: event.event_id,
        latitude: event.latitude!,
        longitude: event.longitude!,
        title: event.title,
        description: event.location || new Date(event.start_time).toLocaleDateString(),
      })),
    ...activities
      .filter(a => a.latitude != null && a.longitude != null)
      .map((activity) => ({
        id: activity.activity_id,
        latitude: activity.latitude!,
        longitude: activity.longitude!,
        title: activity.title,
        description: activity.location || `${activity.date} ${activity.time || ''}`,
      })),
    ...artists
      .filter(a => a.latitude != null && a.longitude != null)
      .map((artist) => ({
        id: artist.artist_id,
        latitude: artist.latitude!,
        longitude: artist.longitude!,
        title: artist.name,
        description: artist.town || artist.genres?.join(", ") || "",
      })),
    ...rentals
      .filter(r => r.latitude != null && r.longitude != null)
      .map((rental) => ({
        id: rental.rental_id,
        latitude: rental.latitude!,
        longitude: rental.longitude!,
        title: rental.title,
        description: rental.rent_price || rental.address || "",
      })),
  ];

  const mapMarkers = allMarkers;

  const getMarkerColor = (isOpen?: boolean) => {
    return isOpen ? "#10b981" : "#ef4444";
  };

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === "bounds_change") {
        const boundsKey = `${data.bounds.minLat},${data.bounds.maxLat},${data.bounds.minLng},${data.bounds.maxLng}`;
        if (boundsKey === lastBoundsRef.current) return;
        lastBoundsRef.current = boundsKey;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          onRegionChangeComplete?.(data.bounds);
        }, 500);
        onRegionChange?.(data.bounds);
      } else if (data.type === "marker_click") {
        const business = businesses.find((b) => b.business_id === data.id);
        if (business) {
          setSelectedBusiness(business);
          onMarkerPress?.(data.id);
        }
      } else if (data.type === "map_click") {
        onMapPress?.(data.lat, data.lng);
      } else if (data.type === "map_ready") {
        setMapReady(true);
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }, [businesses, onRegionChange, onRegionChangeComplete, onMarkerPress, onMapPress]);

  const sendMarkersToMap = useCallback(() => {
    if (!webViewRef.current || !mapReady) return;
    
    const markersData = mapMarkers.map((m) => ({
      id: m.id,
      lat: m.latitude,
      lng: m.longitude,
      title: m.title || "",
      description: m.description || "",
      color: getMarkerColor(),
    }));

    webViewRef.current.injectJavaScript(`
      updateMarkers(${JSON.stringify(markersData)});
      true;
    `);
  }, [mapMarkers, mapReady]);

  useEffect(() => {
    if (mapReady) {
      sendMarkersToMap();
    }
  }, [mapMarkers, mapReady, sendMarkersToMap]);

  useEffect(() => {
    if (!mapReady || !webViewRef.current || !location) return;
    const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    if (key === prevLocationRef.current) return;
    prevLocationRef.current = key;
    webViewRef.current.injectJavaScript(`flyTo(${location.latitude}, ${location.longitude}, 14); true;`);
  }, [location, mapReady]);

  if (disabled) {
    return (
      <Pressable
        style={[styles.wrapper, { height }]}
        onPress={() => onMapPress?.(location.latitude, location.longitude)}
      >
        <View style={styles.disabledOverlay}>
          <View style={styles.disabledContent}>
            <Ionicons name="location" size={40} color="#000000" />
            <Text style={styles.disabledText}>{disabledHint}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #map { height: 100%; width: 100%; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        
        #info-window {
          display: none;
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          border-radius: 16px;
          padding: 16px;
          min-width: 280px;
          max-width: 90%;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          z-index: 1000;
        }
        #info-window.show { display: block; }
        .info-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .info-logo {
          width: 44px;
          height: 44px;
          border-radius: 22px;
          object-fit: cover;
        }
        .info-logo-placeholder {
          width: 44px;
          height: 44px;
          border-radius: 22px;
          background: #000000;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 18px;
          font-weight: bold;
        }
        .info-title {
          font-size: 16px;
          font-weight: 600;
          color: #111827;
          flex: 1;
        }
        .info-category {
          font-size: 12px;
          color: #000000;
          margin-top: 2px;
        }
        .info-address {
          font-size: 13px;
          color: #6b7280;
          margin-bottom: 12px;
        }
        .info-actions {
          display: flex;
          gap: 8px;
        }
        .info-btn {
          flex: 1;
          padding: 10px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          text-align: center;
          cursor: pointer;
          border: none;
        }
        .info-btn-primary {
          background: #000000;
          color: white;
        }
        .info-btn-secondary {
          background: #eef2ff;
          color: #000000;
        }
        .close-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 14px;
          background: #f3f4f6;
          border: none;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          color: #9ca3af;
        }
        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e5e7eb;
          border-top-color: #000000;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 10px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        #loading-overlay { display: block; }
        #loading-overlay.hidden { display: none; }
      </style>
    </head>
    <body>
      <div id="loading-overlay" class="loading">
        <div class="loading-spinner"></div>
        <div>Loading map...</div>
      </div>
      <div id="map"></div>
      <div id="info-window">
        <button class="close-btn" onclick="hideInfoWindow()">×</button>
        <div class="info-header">
          <div class="info-logo-placeholder" id="info-logo-placeholder"></div>
          <img class="info-logo" id="info-logo" style="display:none" />
          <div>
            <div class="info-title" id="info-title"></div>
            <div class="info-category" id="info-category"></div>
          </div>
        </div>
        <div class="info-address" id="info-address"></div>
        <div class="info-actions">
          <button class="info-btn info-btn-secondary" id="info-directions" onclick="getDirections()">Directions</button>
          <button class="info-btn info-btn-primary" id="info-view" onclick="viewBusiness()">View</button>
        </div>
      </div>

      <script>
        let map;
        let markers = [];
        let currentInfo = null;
        let businessesData = {};

        function initMap() {
          const center = { lat: ${location.latitude}, lng: ${location.longitude} };
          
          map = new google.maps.Map(document.getElementById('map'), {
            center: center,
            zoom: 14,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            gestureHandling: 'greedy',
            styles: [
              {
                featureType: 'poi',
                elementType: 'labels',
                stylers: [{ visibility: 'off' }]
              }
            ]
          });

          map.addListener('bounds_changed', () => {
            const bounds = map.getBounds();
            if (!bounds) return;
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'bounds_change',
              bounds: {
                minLat: sw.lat(),
                maxLat: ne.lat(),
                minLng: sw.lng(),
                maxLng: ne.lng()
              }
            }));
          });

          map.addListener('click', (e) => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'map_click',
              lat: e.latLng.lat(),
              lng: e.latLng.lng()
            }));
          });

          document.getElementById('loading-overlay').classList.add('hidden');
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'map_ready' }));
        }

        function updateMarkers(markersData) {
          markers.forEach(m => m.setMap(null));
          markers = [];
          businessesData = {};
          
          markersData.forEach(data => {
            businessesData[data.id] = data;
            
            const marker = new google.maps.Marker({
              position: { lat: data.lat, lng: data.lng },
              map: map,
              title: data.title,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: data.color || '#10b981',
                fillOpacity: 1,
                strokeColor: 'white',
                strokeWeight: 2
              }
            });

            marker.addListener('click', () => {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'marker_click',
                id: data.id
              }));
            });

            markers.push(marker);
          });
        }

        function showInfoWindow(id) {
          const data = businessesData[id];
          if (!data) return;
          
          document.getElementById('info-title').textContent = data.title;
          document.getElementById('info-category').textContent = data.description;
          document.getElementById('info-address').textContent = data.address || '';
          document.getElementById('info-logo').style.display = data.logo ? 'block' : 'none';
          document.getElementById('info-logo').src = data.logo || '';
          document.getElementById('info-logo-placeholder').textContent = data.title ? data.title.charAt(0).toUpperCase() : '?';
          document.getElementById('info-logo-placeholder').style.display = data.logo ? 'none' : 'flex';
          document.getElementById('info-window').classList.add('show');
          currentInfo = data;
        }

        function hideInfoWindow() {
          document.getElementById('info-window').classList.remove('show');
          currentInfo = null;
        }

        function viewBusiness() {
          if (currentInfo) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'view_business',
              id: currentInfo.id
            }));
          }
          hideInfoWindow();
        }

        function getDirections() {
          if (currentInfo) {
            const url = 'https://www.google.com/maps/dir/?api=1&destination=' + 
              currentInfo.lat + ',' + currentInfo.lng + '&travelmode=driving';
            window.open(url, '_blank');
          }
        }

        function flyTo(lat, lng, zoom) {
          if (map) {
            map.panTo({ lat, lng });
            if (zoom) map.setZoom(zoom);
          }
        }

        window.updateMarkers = updateMarkers;
        window.showInfoWindow = showInfoWindow;
        window.hideInfoWindow = hideInfoWindow;
        window.flyTo = flyTo;
      </script>
      <script async defer
        src="https://maps.googleapis.com/maps/api/js?key=${googleKey}&callback=initMap"
        onError="document.getElementById('loading-overlay').innerHTML = '<div style=\\'color:#ef4444\\'>Failed to load Google Maps.<br>Check API key.</div>'">
      </script>
    </body>
    </html>
  `;

  return (
    <View style={[styles.wrapper, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={{ borderRadius: 12 }}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={handleMessage}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
      />

      <Modal
        visible={!!selectedBusiness}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBusiness(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedBusiness(null)}>
          <Pressable style={styles.businessCard} onPress={(e) => e.stopPropagation()}>
            <Pressable style={styles.cardClose} onPress={() => setSelectedBusiness(null)}>
              <Ionicons name="close" size={20} color="#6b7280" />
            </Pressable>
            
            <View style={styles.cardHeader}>
              {selectedBusiness?.logo_image || selectedBusiness?.profile_photo ? (
                <RNImage
                  source={{ uri: (selectedBusiness?.logo_image || selectedBusiness?.profile_photo) as string }}
                  style={styles.cardLogo}
                />
              ) : (
                <View style={styles.cardLogoPlaceholder}>
                  <Text style={styles.cardLogoText}>
                    {selectedBusiness?.name?.charAt(0).toUpperCase() || "?"}
                  </Text>
                </View>
              )}
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{selectedBusiness?.name}</Text>
                <Text style={styles.cardCategory}>
                  {selectedBusiness?.category || selectedBusiness?.root_category}
                </Text>
              </View>
            </View>

            {selectedBusiness?.address && (
              <View style={styles.cardAddress}>
                <Ionicons name="location-outline" size={14} color="#6b7280" />
                <Text style={styles.cardAddressText}>{selectedBusiness.address}</Text>
              </View>
            )}

            {selectedBusiness?.description && (
              <Text style={styles.cardDescription} numberOfLines={3}>
                {selectedBusiness.description}
              </Text>
            )}

            <View style={styles.cardActions}>
              <Pressable
                style={styles.cardActionSecondary}
                onPress={() => {
                  if (selectedBusiness) {
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedBusiness.latitude},${selectedBusiness.longitude}&travelmode=driving`;
                    Linking.openURL(url);
                  }
                }}
              >
                <Ionicons name="navigate-outline" size={18} color="#000000" />
                <Text style={styles.cardActionSecondaryText}>Directions</Text>
              </Pressable>
              <Pressable
                style={styles.cardActionPrimary}
                onPress={() => {
                  if (selectedBusiness) {
                    router.push(`/business/${selectedBusiness.business_id}`);
                    setSelectedBusiness(null);
                  }
                }}
              >
                <Text style={styles.cardActionPrimaryText}>View Business</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  disabledOverlay: {
    flex: 1,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
  },
  disabledContent: {
    alignItems: "center",
    gap: 12,
  },
  disabledText: {
    fontSize: 15,
    color: "#6b7280",
    fontWeight: "500",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  businessCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 340,
  },
  cardClose: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 14,
  },
  cardLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  cardLogoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  cardLogoText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  cardCategory: {
    fontSize: 13,
    color: "#000000",
    marginTop: 2,
  },
  cardAddress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  cardAddressText: {
    fontSize: 13,
    color: "#6b7280",
    flex: 1,
  },
  cardDescription: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 16,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
  },
  cardActionSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
  },
  cardActionSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#000000",
  },
  cardActionPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#000000",
  },
  cardActionPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});

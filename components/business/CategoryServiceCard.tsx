import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Service } from "../../lib/api";
import { COLORS, BORDER_RADIUS, CATEGORY_SERVICE_TYPES, getServiceTypeConfig, getBookingMode, BookingMode } from "../../lib/designTokens";
import { formatPrice, formatDuration } from "../../lib/serviceFormat";
import { FIELD_REGISTRY } from "../../lib/fieldRegistry";
import AdaptiveImage from "../AdaptiveImage";

function MediaWithOverlay({ service, style, placeholderIcon }: { service: Service; style: any; placeholderIcon: string }) {
  const imageUri = service.cover_image_url || service.image_urls?.[0] || service.gallery_images?.[0];
  const galleryCount = (service.gallery_images?.length || 0) + (service.image_urls?.length || 0) - 1;
  return (
    <View style={styles.mediaWrapper}>
      {imageUri ? (
        <AdaptiveImage uri={imageUri} style={style} borderRadius={0} />
      ) : (
        <View style={[style, { backgroundColor: COLORS.border, alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name={placeholderIcon as any} size={28} color={COLORS.textMuted} />
        </View>
      )}
      {service.video_url && (
        <View style={styles.videoOverlay}>
          <Ionicons name="play-circle" size={32} color="#fff" />
        </View>
      )}
      {galleryCount > 0 && (
        <View style={styles.galleryBadge}>
          <Text style={styles.galleryBadgeText}>{galleryCount + 1}</Text>
        </View>
      )}
    </View>
  );
}

type Props = {
  service: Service;
  rootCategory: string;
  onPress?: (service: Service) => void;
  cardWidth?: number | string;
};

function getTypeIcon(type: string): string {
  const defs = CATEGORY_SERVICE_TYPES;
  for (const cat of Object.keys(defs)) {
    const found = defs[cat].find((t) => t.type === type);
    if (found) return found.icon;
  }
  return "help-circle";
}

export default function CategoryServiceCard({ service, rootCategory, onPress, cardWidth = "100%" }: Props) {
  const isRental = rootCategory === "rentals" || rootCategory === "rental-real-estate";
  const isAuto = rootCategory === "automotive";
  const isFood = rootCategory === "food-dining";
  const isProfessional = rootCategory === "professional-services";

  const getFieldsForType = (): string[] => {
    const types = CATEGORY_SERVICE_TYPES[rootCategory] || [];
    const match = types.find((t) => t.type === service.type);
    return match?.fields || [];
  };

  const serviceField = (name: string): any => (service as any)[name];
  const hasCardField = (name: string): boolean => {
    const val = serviceField(name);
    if (val === null || val === undefined) return false;
    if (typeof val === "string" && val === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    const config = FIELD_REGISTRY[name];
    return config?.showOnCard === true;
  };

  const renderCardField = (fieldName: string) => {
    const config = FIELD_REGISTRY[fieldName];
    if (!config) return null;
    const value = serviceField(fieldName);
    if (value === null || value === undefined) return null;

    if (config.displayFormat === "duration") {
      return <Text key={fieldName} style={styles.meta}>{formatDuration(Number(value))}</Text>;
    }

    switch (config.component) {
      case "chips": {
        const label = String(value).charAt(0).toUpperCase() + String(value).slice(1).replace(/_/g, " ");
        return (
          <View key={fieldName} style={styles.chipSmall}>
            <Text style={styles.chipSmallText}>{label}</Text>
          </View>
        );
      }
      case "chips-multi": {
        const arr = Array.isArray(value) ? value : [];
        if (arr.length === 0) return null;
        return (
          <View key={fieldName} style={styles.tagRow}>
            {arr.map((item: string) => (
              <Text key={item} style={styles.facilityTag}>{item.charAt(0).toUpperCase() + item.slice(1).replace(/_/g, " ")}</Text>
            ))}
          </View>
        );
      }
      case "toggle":
        return value ? (
          <Text key={fieldName} style={styles.meta}>
            <Ionicons name="checkmark-circle" size={12} color={COLORS.success} /> {String(value)}
          </Text>
        ) : null;
      case "number":
        if (fieldName === "mileage_km") {
          return <Text key={fieldName} style={styles.meta}>{Number(value).toLocaleString()} km</Text>;
        }
        if (fieldName === "calories") {
          return <Text key={fieldName} style={styles.meta}>{value} cal</Text>;
        }
        if (fieldName === "spice_level") {
          return <Text key={fieldName} style={styles.meta}>Spice: {value}/5</Text>;
        }
        if (fieldName === "capacity") {
          return <Text key={fieldName} style={styles.meta}>Cap: {value}</Text>;
        }
        if (fieldName === "max_guests") {
          return <Text key={fieldName} style={styles.meta}>Up to {value} guests</Text>;
        }
        if (fieldName === "deposit") {
          return <Text key={fieldName} style={styles.meta}>Kaution: {value}</Text>;
        }
        if (fieldName === "available_from") {
          return <Text key={fieldName} style={styles.meta}>Ab {String(value).split("-").reverse().join(".")}</Text>;
        }
        return <Text key={fieldName} style={styles.meta}>{value}</Text>;
      default:
        if (fieldName === "instructor" || fieldName === "specialist_name") {
          return <Text key={fieldName} style={styles.meta}><Ionicons name="person" size={12} /> {value}</Text>;
        }
        if (fieldName === "stock_status") {
          const statusStr = String(value).replace(/_/g, " ");
          const isInStock = String(value) === "in_stock";
          return (
            <View key={fieldName} style={[styles.stockBadge, { backgroundColor: isInStock ? COLORS.success + "20" : COLORS.warning + "20" }]}>
              <Text style={[styles.stockText, { color: isInStock ? COLORS.success : COLORS.warning }]}>{statusStr}</Text>
            </View>
          );
        }
        return <Text key={fieldName} style={styles.meta}>{String(value)}</Text>;
    }
  };

  const cardFields = getFieldsForType().filter((f) => hasCardField(f) && f !== "price");
  const showRentalLayout = isRental || isAuto;
  const showFoodLayout = isFood;
  const showProLayout = isProfessional;
  const typeIcon = getTypeIcon(service.type);

  const typeConfig = getServiceTypeConfig(rootCategory, service.type);
  const bookingMode: BookingMode = typeConfig ? getBookingMode(typeConfig) : "browse_only";
  const ctaLabel = bookingMode === "booking_slots" ? "Book" : bookingMode === "booking_request" ? "Request" : "View";
  const ctaColor = bookingMode === "booking_slots" ? COLORS.success : bookingMode === "booking_request" ? COLORS.primary : COLORS.textMuted;

  if (showRentalLayout) {
    return (
      <Pressable
        style={[styles.card, typeof cardWidth === "number" ? { width: cardWidth } : { width: cardWidth as any }]}
        onPress={() => onPress?.(service)}
      >
        <View style={styles.rentalRow}>
          <MediaWithOverlay service={service} style={styles.rentalImage} placeholderIcon={typeIcon} />
          <View style={styles.rentalInfo}>
            <Text style={styles.name} numberOfLines={1}>
              {isAuto && service.make ? `${service.make} ${service.model || ""}` : service.name}
            </Text>
            {service.description ? <Text style={styles.desc} numberOfLines={1}>{service.description}</Text> : null}
            {cardFields.map(renderCardField)}
            {service.price ? <Text style={styles.price}>{formatPrice(service.price)}{isRental ? "/night" : ""}</Text> : null}
          </View>
        </View>
      </Pressable>
    );
  }

  if (showProLayout) {
    return (
      <Pressable
        style={[styles.card, typeof cardWidth === "number" ? { width: cardWidth } : { width: cardWidth as any }]}
        onPress={() => onPress?.(service)}
      >
        <View style={styles.proRow}>
          <View style={styles.proIcon}>
            <Ionicons name={typeIcon as any} size={22} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{service.name}</Text>
            {service.description ? <Text style={styles.desc} numberOfLines={2}>{service.description}</Text> : null}
            {cardFields.map(renderCardField)}
          </View>
          {service.price ? <Text style={styles.price}>{formatPrice(service.price)}</Text> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.card, typeof cardWidth === "number" ? { width: cardWidth } : { width: cardWidth as any }]}
      onPress={() => onPress?.(service)}
    >
      <MediaWithOverlay
        service={service}
        style={showFoodLayout ? styles.menuImage : styles.serviceImage}
        placeholderIcon={showFoodLayout ? "restaurant" : typeIcon}
      />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{service.name}</Text>
        {service.description ? <Text style={styles.desc} numberOfLines={2}>{service.description}</Text> : null}
        {cardFields.map(renderCardField)}
        {service.price ? (
          <View style={styles.bottomRow}>
            <Text style={styles.price}>{formatPrice(service.price)}</Text>
            <View style={[styles.ctaPill, { backgroundColor: ctaColor + "20" }]}>
              <Text style={[styles.ctaText, { color: ctaColor }]}>{ctaLabel}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.ctaPill, { backgroundColor: ctaColor + "20", alignSelf: "flex-start", marginTop: 6 }]}>
            <Text style={[styles.ctaText, { color: ctaColor }]}>{ctaLabel}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: BORDER_RADIUS.lg, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  info: { padding: 10 },
  name: { fontSize: 14, fontWeight: "600", color: COLORS.textPrimary },
  desc: { fontSize: 12, color: COLORS.textMuted, marginTop: 4, lineHeight: 16 },
  meta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  price: { fontSize: 14, fontWeight: "700", color: COLORS.success, marginTop: 2 },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  tagRow: { flexDirection: "row", gap: 3, flexWrap: "wrap", marginTop: 4 },
  chipSmall: { backgroundColor: COLORS.primary + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: BORDER_RADIUS.full, alignSelf: "flex-start", marginTop: 4 },
  chipSmallText: { fontSize: 10, fontWeight: "600", color: COLORS.primary },
  // Food
  menuImage: { width: "100%", aspectRatio: 4 / 3 },
  dietaryPill: { backgroundColor: COLORS.success + "15", paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
  dietaryText: { fontSize: 9, fontWeight: "700", color: COLORS.success },
  // Service
  serviceImage: { width: "100%", aspectRatio: 1 },
  // Rental
  rentalRow: { flexDirection: "row" },
  rentalImage: { width: 120, height: 120 },
  rentalInfo: { flex: 1, padding: 10 },
  facilityTag: { fontSize: 10, color: COLORS.textMuted, backgroundColor: COLORS.backgroundPage, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  // Professional
  proRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  proIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: "center", justifyContent: "center" },
  // Retail stock
  stockBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start", marginTop: 4 },
  stockText: { fontSize: 10, fontWeight: "600" },
  // Video overlay
  mediaWrapper: { position: "relative" },
  videoOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  galleryBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  galleryBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  ctaPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  ctaText: {
    fontSize: 10,
    fontWeight: "700",
  },
});

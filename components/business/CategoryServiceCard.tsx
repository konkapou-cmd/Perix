import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { Service } from "../../lib/api";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES, FONT_WEIGHTS, SHADOWS } from "../../lib/designTokens";
import { getServiceCtaType, getServiceModuleIcon, getServiceFields, getServiceModuleLabel } from "../../lib/config/serviceModules";
import { formatPrice, formatDuration } from "../../lib/serviceFormat";
import { formatDate } from "../../lib/formatDate";
import { FIELD_REGISTRY } from "../../lib/fieldRegistry";
import { optionLabel } from "../../lib/categoryTranslation";
import AdaptiveImage from "../AdaptiveImage";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";

function MediaWithOverlay({ service, placeholderIcon }: { service: Service; placeholderIcon: string }) {
  const imageUri = service.cover_image_url || service.image_urls?.[0] || service.gallery_images?.[0];
  const hasVideo = !!service.video_url;
  const galleryCount = (service.gallery_images?.length || 0) + (service.image_urls?.length || 0) - 1;
  return (
    <View style={s.cardMedia}>
      {service.cover_image_url ? (
        <FocalImage uri={service.cover_image_url} focalPoint={service.cover_focal_point} borderRadius={0} showLoader={false} style={{ width: "100%", height: "100%" }} />
      ) : hasVideo ? (
        <AdaptiveVideo uri={service.video_url!} autoPlay style={{ width: "100%", height: "100%" }} isLooping initialMuted />
      ) : imageUri ? (
        <FocalImage uri={imageUri} focalPoint={service.cover_focal_point} borderRadius={0} showLoader={false} style={{ width: "100%", height: "100%" }} />
      ) : (
        <View style={s.imagePlaceholder}>
          <Ionicons name={placeholderIcon as any} size={32} color="#264348" />
        </View>
      )}
      {galleryCount > 0 && (
        <View style={s.galleryBadge}>
          <Text style={s.galleryBadgeText}>+{galleryCount}</Text>
        </View>
      )}
    </View>
  );
}

type Props = {
  service: Service;
  rootCategory: string;
  onPress?: (service: Service) => void;
  primaryColor?: string;
  textColor?: string;
  secondaryColor?: string;
  cardColor?: string;
};

function getTypeIcon(type: string): string {
  return getServiceModuleIcon(type);
}

export default function CategoryServiceCard({ service, rootCategory, onPress, primaryColor = COLORS.primary, textColor = COLORS.textPrimary, secondaryColor = COLORS.textSecondary, cardColor = COLORS.background }: Props) {
  const { t } = useTranslation();
  const getFieldsForType = (): string[] => {
    return getServiceFields(service.type);
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
      return <Text key={fieldName} style={s.meta}>{formatDuration(Number(value), t)}</Text>;
    }

    if (fieldName === "available_from") {
      const from = formatDate(String(value));
      const until = service.available_until ? formatDate(service.available_until) : null;
      return <Text key={fieldName} style={s.meta}>{until ? `${from} – ${until}` : `${t("services.fromDate", "From {{date}}", { date: from })}`}</Text>;
    }
    if (fieldName === "available_until") {
      return null; // rendered together with available_from above
    }

    switch (config.component) {
      case "chips": {
        const label = optionLabel(String(value), t);
        return (
          <View key={fieldName} style={s.chipSmall}>
            <Text style={s.chipSmallText}>{label}</Text>
          </View>
        );
      }
      case "chips-multi": {
        const arr = Array.isArray(value) ? value : [];
        if (arr.length === 0) return null;
        return (
          <View key={fieldName} style={s.tagRow}>
            {arr.map((item: string) => (
              <Text key={item} style={s.facilityTag}>{optionLabel(item, t)}</Text>
            ))}
          </View>
        );
      }
      case "toggle":
        return value ? (
          <Text key={fieldName} style={s.meta}>
            <Ionicons name="checkmark-circle" size={12} color={COLORS.success} /> {String(value)}
          </Text>
        ) : null;
      case "number":
        if (fieldName === "size_sqm" || fieldName === "room_size_sqm") {
          return <Text key={fieldName} style={s.meta}>{value} m²</Text>;
        }
        if (fieldName === "mileage_km") {
          return <Text key={fieldName} style={s.meta}>{Number(value).toLocaleString()} km</Text>;
        }
        if (fieldName === "calories") {
          return <Text key={fieldName} style={s.meta}>{value} {t("services.calShort", "cal")}</Text>;
        }
        if (fieldName === "spice_level") {
          return <Text key={fieldName} style={s.meta}>{t("services.spiceShort", "Spice")}: {value}/5</Text>;
        }
        if (fieldName === "capacity") {
          return <Text key={fieldName} style={s.meta}>{t("services.capShort", "Cap")}: {value}</Text>;
        }
        if (fieldName === "max_guests") {
          return <Text key={fieldName} style={s.meta}>{t("services.upToGuests", "Up to {{count}} guests", { count: value })}</Text>;
        }
        if (fieldName === "floor") {
          return <Text key={fieldName} style={s.meta}>{t("services.floorShort", "Floor")}: {value}</Text>;
        }
        if (fieldName === "deposit") {
          return <Text key={fieldName} style={s.meta}>{t("services.depositShort", "Deposit")}: {value}</Text>;
        }
        return <Text key={fieldName} style={s.meta}>{value}</Text>;
      default:
        if (fieldName === "instructor" || fieldName === "specialist_name") {
          return <Text key={fieldName} style={s.meta}><Ionicons name="person" size={12} /> {value}</Text>;
        }
        if (fieldName === "stock_status") {
          const statusStr = String(value).replace(/_/g, " ");
          const isInStock = String(value) === "in_stock";
          return (
            <View key={fieldName} style={[s.stockBadge, { backgroundColor: isInStock ? COLORS.success + "20" : COLORS.warning + "20" }]}>
              <Text style={[s.stockText, { color: isInStock ? COLORS.success : COLORS.warning }]}>{statusStr}</Text>
            </View>
          );
        }
        return <Text key={fieldName} style={s.meta}>{String(value)}</Text>;
    }
  };

  const cardFields = getFieldsForType().filter((f) => hasCardField(f) && f !== "price");
  const typeIcon = getTypeIcon(service.type);

  const ctaType = getServiceCtaType(service.type);
  const ctaLabel =
    ctaType === "booking" ? t("services.bookNow", "Book now")
    : ctaType === "reservation" ? t("services.reserve", "Reserve")
    : ctaType === "request_quote" ? t("services.requestQuote", "Request offer")
    : ctaType === "get_in_touch" ? t("services.contactCta", "Contact")
    : ctaType === "buy" ? t("services.buy", "Buy")
    : "";
  const ctaColor =
    ctaType === "booking" ? "#4ade80"
    : ctaType === "reservation" ? "#59ABE3"
    : ctaType === "request_quote" ? "#FF9F1C"
    : ctaType === "get_in_touch" ? "#264348"
    : ctaType === "buy" ? "#7B3FF2"
    : "#264348";

  const typeName = getServiceModuleLabel(service.type, (k: string, fb?: string) => t(k, fb ?? service.type));

  return (
    <Pressable style={[s.card, { backgroundColor: cardColor }]} onPress={() => onPress?.(service)}>
      <MediaWithOverlay service={service} placeholderIcon={typeIcon} />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.75)"]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.imageBadges}>
        <View style={[s.typeBadge, { backgroundColor: primaryColor }]}>
          <Ionicons name={typeIcon as any} size={10} color="#fff" />
          <Text style={s.typeBadgeText} numberOfLines={1}>{typeName}</Text>
        </View>
        {ctaType !== "browse_only" && (
          <View style={[s.ctaPill, { backgroundColor: ctaColor + "20" }]}>
            <Text style={[s.ctaText, { color: ctaColor }]} numberOfLines={1}>{ctaLabel}</Text>
          </View>
        )}
      </View>
      <View style={s.info}>
        <Text style={s.name} numberOfLines={1}>
          {service.name}
        </Text>
        {service.description ? <Text style={s.desc} numberOfLines={2}>{service.description}</Text> : null}
        {cardFields.map(renderCardField)}
        {service.price ? (
          <Text style={s.price}>{formatPrice(service.price)}{service.type === "hotel_room" ? " / night" : ""}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    width: "100%",
    height: 240,
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
    ...SHADOWS.subtle,
  },
  cardMedia: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#EDF4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  imageBadges: {
    position: "absolute",
    top: SPACING.small,
    left: SPACING.small,
    right: SPACING.small,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    flexShrink: 1,
    maxWidth: "55%",
  },
  typeBadgeText: {
    color: "#fff",
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    flexShrink: 1,
  },
  info: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
  },
  name: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
    marginBottom: SPACING.tiny,
    flexShrink: 1,
  },
  desc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
    lineHeight: 15,
  },
  meta: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    marginTop: 2,
    flexShrink: 1,
  },
  price: {
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: "#4ade80",
    marginTop: SPACING.tiny,
  },
  tagRow: {
    flexDirection: "row",
    gap: 3,
    flexWrap: "wrap",
    marginTop: 4,
  },
  chipSmall: {
    backgroundColor: COLORS.primary + "15",
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  chipSmallText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.primary,
  },
  facilityTag: {
    fontSize: FONT_SIZES.micro,
    color: COLORS.textMuted,
    backgroundColor: COLORS.backgroundPage,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    overflow: "hidden",
  },
  stockBadge: {
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  stockText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  videoOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  galleryBadge: {
    position: "absolute",
    top: SPACING.small,
    right: SPACING.small,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
  },
  galleryBadgeText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.bold as any,
    color: "#fff",
  },
  ctaPill: {
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
    flexShrink: 1,
    maxWidth: "55%",
  },
  ctaText: {
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.bold as any,
    flexShrink: 1,
  },
});

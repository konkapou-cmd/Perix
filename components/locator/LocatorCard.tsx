import React from "react";
import { Pressable, StyleSheet, Text, View, Image, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";
import { getThemeColors, getThemeStyles, applyThemeToText } from "../../hooks/useThemeStyles";
import type { Business, EventItem, ActivityItem } from "../../lib/api";
import { formatEventDate } from "../../lib/formatDate";

type BusinessCardProps = {
  type: "business";
  data: Business;
  distance: string | null;
  isOpen: boolean | null;
  onPress: () => void;
};

type EventCardProps = {
  type: "event";
  data: EventItem;
  distance: string | null;
  onPress: () => void;
};

type ActivityCardProps = {
  type: "activity";
  data: ActivityItem;
  distance: string | null;
  onPress: () => void;
};

type LocatorCardProps = BusinessCardProps | EventCardProps | ActivityCardProps;

export default function LocatorCard(props: LocatorCardProps) {
  if (props.type === "business") return <BusinessCard {...props} />;
  if (props.type === "event") return <EventCard {...props} />;
  return <ActivityCard {...props} />;
}

function BusinessCard({ data, distance, isOpen, onPress }: BusinessCardProps) {
  const { t } = useTranslation();
  const themeColors = getThemeColors(data.theme as any);
  const primaryColor = themeColors.primaryColor;
  const textColor = themeColors.textColor;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardRow}>
        {data.logo_image || data.profile_photo ? (
          <Image
            source={{ uri: (data.logo_image || data.profile_photo) as string }}
            style={styles.businessAvatar}
          />
        ) : (
          <View style={[styles.businessAvatarPlaceholder, { backgroundColor: primaryColor + "20" }]}>
            <Text style={[styles.avatarText, { color: primaryColor }]}>
              {(data.name || "B").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: primaryColor }]} numberOfLines={1}>
            {data.name}
          </Text>
          <Text style={[styles.cardSubtitle, { color: textColor }]} numberOfLines={1}>
            {data.subcategory} · {data.root_category || data.category}
          </Text>
          {data.address ? (
            <View style={styles.cardMetaRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.cardMetaText} numberOfLines={1}>{data.address}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardEnd}>
          {isOpen !== null && (
            <View style={[styles.statusPill, isOpen ? styles.statusOpen : styles.statusClosed]}>
              <View style={[styles.statusDot, isOpen ? styles.statusDotOpen : styles.statusDotClosed]} />
              <Text style={[styles.statusText, isOpen ? styles.statusTextOpen : styles.statusTextClosed]}>
                {isOpen ? t("common.open", "Geöffnet") : t("common.closed", "Geschlossen")}
              </Text>
            </View>
          )}
          {distance && <Text style={styles.distanceText}>{distance}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

function EventCard({ data, distance, onPress }: EventCardProps) {
  const themeColors = getThemeColors((data as any).profile_theme as any);
  const primaryColor = themeColors.primaryColor;
  const coverImage = data.cover_image_url || data.image_urls?.[0] || data.gallery_images?.[0];
  const formattedDate = formatEventDate(data.start_time);
  const businessName = data.business?.name || data.creator?.name || "";

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {coverImage ? (
        <View style={styles.eventImageContainer}>
          <Image source={{ uri: coverImage }} style={styles.eventCoverImage} resizeMode="cover" />
          <View style={[styles.dateBadge, { backgroundColor: primaryColor }]}>
            <Text style={styles.dateBadgeDay}>{formattedDate.split("/")[0]}</Text>
            <Text style={styles.dateBadgeMonth}>{`/${formattedDate.split("/")[1]}`}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.eventImageContainer, styles.eventImagePlaceholder, { backgroundColor: primaryColor + "15" }]}>
          <Ionicons name="calendar-outline" size={28} color={primaryColor} />
          <View style={[styles.dateBadge, { backgroundColor: primaryColor }]}>
            <Text style={styles.dateBadgeDay}>{formattedDate.split("/")[0]}</Text>
            <Text style={styles.dateBadgeMonth}>{`/${formattedDate.split("/")[1]}`}</Text>
          </View>
        </View>
      )}
      <View style={styles.eventCardBody}>
        <Text style={[styles.cardTitle, { color: primaryColor }]} numberOfLines={1}>
          {data.title}
        </Text>
        <View style={styles.eventMetaRow}>
          {businessName ? (
            <Text style={styles.eventMetaText} numberOfLines={1}>{businessName}</Text>
          ) : null}
          {data.location && (
            <Text style={styles.eventMetaText} numberOfLines={1}>
              {businessName ? " · " : ""}{data.location}
            </Text>
          )}
        </View>
        <View style={styles.eventBottomRow}>
          {(data.attendees_count ?? 0) > 0 && (
            <View style={[styles.attendeesChip, { backgroundColor: primaryColor + "15" }]}>
              <Ionicons name="people" size={12} color={primaryColor} />
              <Text style={[styles.attendeesText, { color: primaryColor }]}>{data.attendees_count ?? 0}</Text>
            </View>
          )}
          {distance && <Text style={styles.distanceText}>{distance}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

function ActivityCard({ data, distance, onPress }: ActivityCardProps) {
  const themeColors = getThemeColors((data as any).profile_theme as any);
  const primaryColor = themeColors.primaryColor;
  const coverImage = data.cover_image_url || data.image_urls?.[0];
  const timeStr = data.time || "";
  const dateStr = data.date || "";

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardRow}>
        {coverImage ? (
          <Image source={{ uri: coverImage }} style={styles.activityAvatar} />
        ) : (
          <View style={[styles.activityAvatarPlaceholder, { backgroundColor: COLORS.activityAccent + "15" }]}>
            <Ionicons name="people-outline" size={20} color={COLORS.activityAccent} />
          </View>
        )}
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: primaryColor }]} numberOfLines={1}>
            {data.title}
          </Text>
          <View style={styles.cardMetaRow}>
            <Ionicons name="calendar-outline" size={12} color={COLORS.textMuted} />
            <Text style={styles.cardMetaText}>
              {dateStr}{timeStr ? ` · ${timeStr}` : ""}
            </Text>
          </View>
          {data.location && (
            <View style={styles.cardMetaRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.cardMetaText} numberOfLines={1}>{data.location}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardEnd}>
          {(data as any).my_status ? (
            <View style={styles.rsvpPill}>
              <Ionicons name="checkmark-circle" size={12} color={COLORS.statusOpenText} />
              <Text style={styles.rsvpText}>{(data as any).my_status}</Text>
            </View>
          ) : (data as any).max_attendees ? (
            <Text style={styles.spotsText}>
              {(data as any).max_attendees - ((data as any).attendees_count || 0)} spots
            </Text>
          ) : null}
          {distance && <Text style={styles.distanceText}>{distance}</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.subtle,
    marginBottom: SPACING.small,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.std,
    gap: SPACING.small,
  },
  // Business
  businessAvatar: {
    width: Platform.OS === "web" ? 60 : 52,
    height: Platform.OS === "web" ? 60 : 52,
    borderRadius: BORDER_RADIUS.md,
  },
  businessAvatarPlaceholder: {
    width: Platform.OS === "web" ? 60 : 52,
    height: Platform.OS === "web" ? 60 : 52,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.h2 : FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  // Card body (shared by business & activity)
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.h4 : FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  cardSubtitle: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.caption : FONT_SIZES.small,
    marginTop: 1,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  cardMetaText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.caption : FONT_SIZES.small,
    color: COLORS.textMuted,
  },
  // Card end (right side badges)
  cardEnd: {
    alignItems: "flex-end",
    gap: SPACING.tiny,
  },
  // Status badges
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.small,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  statusOpen: {
    backgroundColor: COLORS.statusOpenBg,
  },
  statusClosed: {
    backgroundColor: COLORS.statusClosedBg,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotOpen: {
    backgroundColor: COLORS.statusOpenDot,
  },
  statusDotClosed: {
    backgroundColor: COLORS.danger,
  },
  statusText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.small : FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  statusTextOpen: {
    color: COLORS.statusOpenText,
  },
  statusTextClosed: {
    color: COLORS.statusClosedText,
  },
  distanceText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.small : FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.success,
  },
  // Event card
  eventImageContainer: {
    position: "relative",
    width: "100%",
    height: Platform.OS === "web" ? 160 : 120,
  },
  eventCoverImage: {
    width: "100%",
    height: Platform.OS === "web" ? 160 : 120,
  },
  eventImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  dateBadge: {
    position: "absolute",
    top: SPACING.small,
    left: SPACING.small,
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    alignItems: "center",
  },
  dateBadgeMonth: {
    color: COLORS.background,
    fontSize: Platform.OS === "web" ? 11 : 10,
    fontWeight: FONT_WEIGHTS.bold as any,
    letterSpacing: 0.5,
  },
  dateBadgeDay: {
    color: COLORS.background,
    fontSize: Platform.OS === "web" ? FONT_SIZES.h4 : FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.bold as any,
    lineHeight: 16,
  },
  eventCardBody: {
    padding: SPACING.small,
    gap: 2,
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventMetaText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.caption : FONT_SIZES.small,
    color: COLORS.textMuted,
  },
  eventBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.tiny,
  },
  attendeesChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  attendeesText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.small : FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  // Activity card
  activityAvatar: {
    width: Platform.OS === "web" ? 64 : 56,
    height: Platform.OS === "web" ? 64 : 56,
    borderRadius: BORDER_RADIUS.md,
  },
  activityAvatarPlaceholder: {
    width: Platform.OS === "web" ? 64 : 56,
    height: Platform.OS === "web" ? 64 : 56,
    borderRadius: BORDER_RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rsvpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: COLORS.statusOpenBg,
    paddingHorizontal: SPACING.small,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  rsvpText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.small : FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.statusOpenText,
  },
  spotsText: {
    fontSize: Platform.OS === "web" ? FONT_SIZES.small : FONT_SIZES.micro,
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHTS.medium as any,
  },
});

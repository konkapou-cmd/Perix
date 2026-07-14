import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";
import StatusBadge from "../ui/StatusBadge";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../../lib/designTokens";

type Props = {
  events: EventItem[];
  onAddEvent: () => void;
  onEditEvent: (event: EventItem) => void;
  onDeleteEvent: (eventId: string) => void;
  readOnly?: boolean;
  primaryColor?: string;
  cardColor?: string;
  textColor?: string;
  secondaryColor?: string;
};

function getThemeInfo(slug: string | null | undefined) {
  if (!slug) return DEFAULT_EVENT_THEME;
  return EVENT_THEMES[slug] || DEFAULT_EVENT_THEME;
}

export default function EventsSection({
  events,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  readOnly = false,
  primaryColor = COLORS.primary,
  cardColor = "#fff",
  textColor = COLORS.textPrimary,
  secondaryColor = COLORS.textSecondary,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={s.container}>
      <View style={s.sectionHeader}>
        <Text style={[s.cardTitle, { color: textColor }]}>{t("business.events")}</Text>
        {!readOnly && (
          <Pressable style={[s.addButton, { backgroundColor: primaryColor }]} onPress={onAddEvent}>
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={s.addButtonText}>{t("events.createEvent")}</Text>
          </Pressable>
        )}
      </View>

      {events.length === 0 ? (
        <EmptyState icon="calendar" message={t("business.noEvents")} subMessage={readOnly ? undefined : t("business.addFirstEvent")} />
      ) : (
        <View style={s.grid}>
          {events.map((event) => {
            const theme = getThemeInfo(event.theme);
            const imageUrl = event.cover_image_url || event.image_urls?.[0] || event.gallery_images?.[0];
            const hasVideo = !!event.video_url;

            return (
              <View key={event.event_id} style={[s.card, { backgroundColor: cardColor }]}>
                <Pressable
                  style={s.cardContent}
                  onPress={() => router.push(`/event/${event.event_id}`)}
                >
                  <View style={s.imageContainer}>
                    {event.cover_image_url ? (
                      <FocalImage uri={event.cover_image_url} focalPoint={event.cover_focal_point} style={s.image} showLoader={false} />
                    ) : hasVideo ? (
                      <AdaptiveVideo uri={event.video_url || ""} autoPlay style={s.image} isLooping initialMuted />
                    ) : imageUrl ? (
                      <FocalImage uri={imageUrl} focalPoint={event.cover_focal_point} style={s.image} showLoader={false} />
                    ) : (
                      <View style={[s.imagePlaceholder, { backgroundColor: `${theme.color}30` }]}>
                        <Text style={s.themeEmoji}>{theme.emoji}</Text>
                      </View>
                    )}
                    {event.is_private && (
                      <View style={s.privateBadge}>
                        <Ionicons name="lock-closed" size={12} color="#fff" />
                      </View>
                    )}
                    <StatusBadge
                      label={theme.label}
                      color={theme.color}
                      size="sm"
                    />
                    {event.is_attending && (
                      <StatusBadge
                        label={t("events.attending", "Du nimmst teil")}
                        variant="active"
                        size="sm"
                      />
                    )}
                  </View>
                  <View style={s.info}>
                    <Text style={[s.title, { color: textColor }]} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <View style={s.metaRow}>
                      <Ionicons name="calendar-outline" size={12} color={secondaryColor} />
                      <Text style={[s.metaText, { color: secondaryColor }]}>
                        {formatEventDate(event.start_time)}
                      </Text>
                    </View>
                    {event.location && (
                      <View style={s.metaRow}>
                        <Ionicons name="location-outline" size={12} color={secondaryColor} />
                        <Text style={[s.metaText, { color: secondaryColor }]} numberOfLines={1}>
                          {event.location}
                        </Text>
                      </View>
                    )}
                    {event.attendees_count != null && (
                      <StatusBadge
                        label={t("events.goingCount", "{{count}} dabei", { count: event.attendees_count })}
                        variant="default"
                        size="sm"
                      />
                    )}
                  </View>
                </Pressable>
                {!readOnly && (
                  <View style={s.actions}>
                    <Pressable style={s.actionBtn} onPress={() => onEditEvent(event)}>
                      <Ionicons name="create-outline" size={18} color={primaryColor} />
                    </Pressable>
                    <Pressable style={s.actionBtn} onPress={() => onDeleteEvent(event.event_id)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingTop: SPACING.small,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.small,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.section,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.small,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
    fontSize: FONT_SIZES.bodySmall,
  },
  grid: {
    gap: SPACING.small,
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    ...SHADOWS.subtle,
  },
  cardContent: {
    flex: 1,
  },
  imageContainer: {
    position: "relative",
    height: 140,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  themeEmoji: {
    fontSize: 36,
  },
  privateBadge: {
    position: "absolute",
    top: SPACING.small,
    right: SPACING.small,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
  },
  attendingBadge: {
    position: "absolute",
    bottom: SPACING.small,
    left: SPACING.small,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#10b981",
  },
  attendingText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  themeBadge: {
    position: "absolute",
    top: SPACING.small,
    left: SPACING.small,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.small,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  themeBadgeEmoji: {
    fontSize: FONT_SIZES.micro,
  },
  themeBadgeLabel: {
    color: "#fff",
    fontSize: FONT_SIZES.micro,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  info: {
    padding: SPACING.small,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: SPACING.tiny,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.tiny,
    marginBottom: 2,
  },
  metaText: {
    fontSize: FONT_SIZES.small,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.small,
    paddingVertical: SPACING.tiny,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.tiny,
  },
  statusText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.small,
    gap: SPACING.small,
    paddingBottom: SPACING.small,
  },
  actionBtn: {
    padding: SPACING.tiny,
  },
});

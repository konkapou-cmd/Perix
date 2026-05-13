import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { EventItem } from "../../lib/api";
import { EVENT_THEMES, DEFAULT_EVENT_THEME } from "../../lib/api/events";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";

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

function formatEventDate(startTime: string): string {
  try {
    const d = new Date(startTime);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return startTime.split("T")[0];
  }
}

function formatEventTime(startTime: string): string | null {
  try {
    const d = new Date(startTime);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
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
            <Text style={s.addButtonText}>{t("business.addEvent")}</Text>
          </Pressable>
        )}
      </View>

      {events.length === 0 ? (
        <View style={s.emptyState}>
          <View style={[s.emptyIcon, { backgroundColor: `${primaryColor}20` }]}>
            <Ionicons name="calendar" size={32} color={primaryColor} />
          </View>
          <Text style={[s.emptyTitle, { color: textColor }]}>{t("business.noEvents")}</Text>
          <Text style={[s.emptySubtitle, { color: secondaryColor }]}>
            {t("business.noEventsSubtitle", "Events you create will appear here")}
          </Text>
        </View>
      ) : (
        <View style={s.grid}>
          {events.map((event) => {
            const theme = getThemeInfo(event.theme);
            const imageUrl = event.cover_image_url || event.image_urls?.[0] || event.gallery_images?.[0];
            const showPrivate = event.is_private;

            return (
              <View key={event.event_id} style={[s.card, { backgroundColor: cardColor }]}>
                <Pressable
                  style={s.cardContent}
                  onPress={() => router.push(`/event/${event.event_id}`)}
                >
                  <View style={s.imageContainer}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={s.image} resizeMode="cover" />
                    ) : (
                      <View style={[s.imagePlaceholder, { backgroundColor: `${theme.color}30` }]}>
                        <Text style={s.themeEmoji}>{theme.emoji}</Text>
                      </View>
                    )}
                    {showPrivate && (
                      <View style={s.privateBadge}>
                        <Ionicons name="lock-closed" size={12} color="#fff" />
                      </View>
                    )}
                    <View style={[s.themeBadge, { backgroundColor: theme.color }]}>
                      <Text style={s.themeBadgeEmoji}>{theme.emoji}</Text>
                      <Text style={s.themeBadgeLabel}>{theme.label}</Text>
                    </View>
                    {event.is_attending && (
                      <View style={s.attendingBadge}>
                        <Ionicons name="checkmark-circle" size={10} color="#fff" />
                        <Text style={s.attendingText}>{t("events.attending", "Attending")}</Text>
                      </View>
                    )}
                    {event.is_creator && !event.is_attending && (
                      <View style={s.ownerBadge}>
                        <Ionicons name="star" size={10} color="#fff" />
                        <Text style={s.ownerText}>{t("events.yours", "Yours")}</Text>
                      </View>
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
                      {formatEventTime(event.start_time) && (
                        <>
                          <Text style={[s.metaText, { color: secondaryColor }]}> · </Text>
                          <Text style={[s.metaText, { color: secondaryColor }]}>
                            {formatEventTime(event.start_time)}
                          </Text>
                        </>
                      )}
                    </View>
                    {event.location && (
                      <View style={s.metaRow}>
                        <Ionicons name="location-outline" size={12} color={secondaryColor} />
                        <Text style={[s.metaText, { color: secondaryColor }]} numberOfLines={1}>
                          {event.location}
                        </Text>
                      </View>
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
    paddingTop: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.sm,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: FONT_WEIGHTS.semibold as any,
    fontSize: FONT_SIZES.bodySmall,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.huge,
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.bodySmall,
    textAlign: "center",
    lineHeight: 20,
  },
  grid: {
    gap: SPACING.md,
  },
  card: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  attendingBadge: {
    position: "absolute",
    bottom: SPACING.sm,
    left: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.md,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#10b981",
  },
  attendingText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  ownerBadge: {
    position: "absolute",
    bottom: SPACING.sm,
    left: SPACING.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: SPACING.md,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: "#f59e0b",
  },
  ownerText: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
  themeBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
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
    padding: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    marginBottom: SPACING.xs,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: 2,
  },
  metaText: {
    fontSize: FONT_SIZES.small,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  actionBtn: {
    padding: SPACING.xs,
  },
});
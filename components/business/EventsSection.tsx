import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { EventItem } from "../../lib/api";
import { EVENT_THEMES, DEFAULT_EVENT_THEME } from "../../lib/api/events";
import { COLORS, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";
import { formatEventDate } from "../../lib/formatDate";
import AdaptiveVideo from "../AdaptiveVideo";

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
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("business.events")}</Text>
      {events.length === 0 ? (
        <Text style={styles.emptyText}>{t("business.noEvents")}</Text>
      ) : (
        events.map((event) => {
          const theme = getThemeInfo(event.theme);
          const imageUrl = event.cover_image_url || event.image_urls?.[0] || event.gallery_images?.[0];
          const hasVideo = !!event.video_url;
          return (
            <Pressable key={event.event_id} style={styles.eventRow} onPress={() => router.push(`/event/${event.event_id}`)}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.thumb} />
              ) : hasVideo ? (
                <AdaptiveVideo uri={event.video_url || ""} style={styles.thumb} autoPlay={false} isLooping initialMuted />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Text style={styles.thumbEmoji}>{theme.emoji}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                <Text style={styles.eventMeta}>{formatEventDate(event.start_time)}</Text>
              </View>
              {!readOnly && (
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <Pressable style={styles.iconBtn} onPress={() => onEditEvent(event)}>
                    <Ionicons name="create-outline" size={18} color={COLORS.textPrimary} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => onDeleteEvent(event.event_id)}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>
              )}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles: Record<string, any> = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.textPrimary,
  },
  eventMeta: {
    fontSize: FONT_SIZES.small,
    color: "#9ca3af",
    marginTop: 2,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  thumbPlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbEmoji: {
    fontSize: 18,
  },
  iconBtn: {
    padding: 8,
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});
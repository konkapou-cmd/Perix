import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { EventItem } from "../../lib/api";

type Props = {
  events: EventItem[];
  onAddEvent: () => void;
  onEditEvent: (event: EventItem) => void;
  onDeleteEvent: (eventId: string) => void;
  getThemeLabel?: (slug: string) => string;
};

export default function EventsSection({
  events,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  getThemeLabel,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Text style={styles.cardTitle}>{t("business.events")}</Text>
        <Pressable style={styles.addEventButton} onPress={onAddEvent}>
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.addEventButtonText}>{t("business.addEvent")}</Text>
        </Pressable>
      </View>
      {events.length === 0 ? (
        <Text style={styles.emptyText}>{t("business.noEvents")}</Text>
      ) : (
        events.map((event) => (
          <View key={event.event_id} style={styles.eventRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventMeta}>
                {event.start_time.split("T")[0]} · {event.location || t("events.eventLocation")}
              </Text>
            </View>
            <Pressable style={styles.iconButton} onPress={() => onEditEvent(event)}>
              <Ionicons name="create-outline" size={18} color="#4c6fff" />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => onDeleteEvent(event.event_id)}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  addEventButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#4c6fff",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  addEventButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  eventTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  eventMeta: {
    color: "#9ca3af",
    fontSize: 12,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});

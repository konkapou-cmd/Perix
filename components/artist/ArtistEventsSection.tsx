import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { EventItem } from "../../lib/api";

type Props = {
  events: EventItem[];
  onAddEvent: () => void;
  onEditEvent: (event: EventItem) => void;
  onDeleteEvent: (eventId: string) => void;
  onShareEvent: (event: EventItem) => void;
  onViewEvent?: (eventId: string) => void;
};

export default function ArtistEventsSection({
  events,
  onAddEvent,
  onEditEvent,
  onDeleteEvent,
  onShareEvent,
  onViewEvent,
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
            <Pressable style={{ flex: 1 }} onPress={() => onViewEvent?.(event.event_id)}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventMeta}>
                {event.start_time.split("T")[0]} · {event.location || t("events.eventLocation")}
              </Text>
            </Pressable>
            <Pressable style={styles.whatsappIconButton} onPress={() => onShareEvent(event)}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </Pressable>
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  eventTitle: {
    fontWeight: "600",
    color: "#111827",
  },
  eventMeta: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    padding: 8,
  },
  whatsappIconButton: {
    padding: 8,
    marginRight: 4,
  },
  emptyText: {
    color: "#9ca3af",
    marginBottom: 12,
  },
});

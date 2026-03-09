import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface TopEvent {
  event_id: string;
  title: string;
  attendees: number;
  date?: string;
}

interface TopEventsSectionProps {
  events: TopEvent[];
  onEventPress?: (eventId: string) => void;
}

export const TopEventsSection: React.FC<TopEventsSectionProps> = ({
  events,
  onEventPress,
}) => {
  if (!events.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Top Events</Text>
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={40} color="#d1d5db" />
          <Text style={styles.emptyText}>No events yet</Text>
          <Text style={styles.emptySubtext}>Create events to see your top performers here</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Top Events by Attendance</Text>
      {events.map((event, index) => (
        <Pressable 
          key={event.event_id} 
          style={styles.eventRow}
          onPress={() => onEventPress?.(event.event_id)}
        >
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>#{index + 1}</Text>
          </View>
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
            {event.date && (
              <Text style={styles.eventDate}>
                {new Date(event.date).toLocaleDateString()}
              </Text>
            )}
          </View>
          <View style={styles.attendeesContainer}>
            <Ionicons name="people" size={14} color="#6b7280" />
            <Text style={styles.attendeesText}>{event.attendees}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rankText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  eventDate: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  attendeesContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  attendeesText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
  },
});

export default TopEventsSection;

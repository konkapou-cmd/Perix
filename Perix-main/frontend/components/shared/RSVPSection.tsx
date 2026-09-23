import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPACING } from "../../lib/designTokens";

type RSVPSectionProps = {
  accentColor?: string;
  isAttending?: boolean;
  hasReminder?: boolean;
  onAttend: () => void;
  onRemind?: () => void;
  attendingLabel?: string;
  remindLabel?: string;
};

export const RSVPSection = ({
  accentColor = "#59ABE3",
  isAttending = false,
  hasReminder = false,
  onAttend,
  onRemind,
  attendingLabel = "Zusagen",
  remindLabel = "Erinnern",
}: RSVPSectionProps) => (
  <View style={styles.section}>
    <Text style={styles.title}>Deine Antwort</Text>

    <View style={styles.buttons}>
      <Pressable style={[styles.primaryBtn, { backgroundColor: accentColor }]} onPress={onAttend}>
        <Ionicons
          name={isAttending ? "checkmark-circle" : "calendar-outline"}
          size={20}
          color="#fff"
          style={{ marginRight: SPACING.small }}
        />
        <Text style={styles.primaryText}>
          {isAttending ? "Teilnehmend" : attendingLabel}
        </Text>
      </Pressable>

      {onRemind && (
        <Pressable
          style={[styles.secondaryBtn, { borderColor: accentColor }]}
          onPress={onRemind}
        >
          <Ionicons
            name={hasReminder ? "alarm" : "alarm-outline"}
            size={20}
            color={accentColor}
            style={{ marginRight: SPACING.small }}
          />
          <Text style={[styles.secondaryText, { color: accentColor }]}>
            {hasReminder ? "Erinnert" : remindLabel}
          </Text>
        </Pressable>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.section,
    paddingHorizontal: SPACING.page,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#264348",
    marginBottom: SPACING.std,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.compact,
  },
  primaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1.5,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
});

export default RSVPSection;

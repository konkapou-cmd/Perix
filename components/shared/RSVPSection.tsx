import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from "../../lib/designTokens";

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
  accentColor = COLORS.primary,
  isAttending = false,
  hasReminder = false,
  onAttend,
  onRemind,
  attendingLabel = "Zusagen",
  remindLabel = "Erinnern",
}: RSVPSectionProps) => (
  <View style={styles.card}>
    <Text style={styles.title}>Deine Antwort</Text>

    <View style={styles.buttons}>
      <Pressable
        style={[
          styles.primaryBtn,
          { backgroundColor: isAttending ? accentColor : COLORS.textPrimary },
        ]}
        onPress={onAttend}
      >
        <Ionicons
          name={isAttending ? "checkmark-circle" : "calendar-outline"}
          size={20}
          color="#FFF"
          style={{ marginRight: SPACING.small }}
        />
        <Text style={styles.primaryText}>
          {isAttending ? "Teilnehmend" : attendingLabel}
        </Text>
      </Pressable>

      {onRemind && (
        <Pressable
          style={[
            styles.secondaryBtn,
            hasReminder && { backgroundColor: COLORS.warning, borderColor: "transparent" },
          ]}
          onPress={onRemind}
        >
          <Ionicons
            name={hasReminder ? "alarm" : "alarm-outline"}
            size={20}
            color={hasReminder ? COLORS.textPrimary : accentColor}
            style={{ marginRight: SPACING.small }}
          />
          <Text style={[styles.secondaryText, { color: hasReminder ? COLORS.textPrimary : accentColor }]}>
            {hasReminder ? "Erinnert" : remindLabel}
          </Text>
        </Pressable>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.card,
    padding: SPACING.section,
    marginHorizontal: SPACING.page,
    ...SHADOWS.subtle,
  },
  title: {
    fontSize: FONT_SIZES.h3,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: SPACING.std,
  },
  buttons: {
    flexDirection: "row",
    gap: SPACING.compact,
  },
  primaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: BORDER_RADIUS.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...SHADOWS.subtle,
  },
  primaryText: {
    fontSize: FONT_SIZES.body,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    flex: 1,
    height: 52,
    borderRadius: BORDER_RADIUS.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  secondaryText: {
    fontSize: FONT_SIZES.body,
    fontWeight: "600",
  },
});

export default RSVPSection;

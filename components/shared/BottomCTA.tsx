import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from "../../lib/designTokens";

type BottomCTAProps = {
  primaryLabel: string;
  primaryIcon?: keyof typeof Ionicons.glyphMap;
  secondaryLabel?: string;
  accentColor?: string;
  useGradient?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  saved?: boolean;
  onSave?: () => void;
  onShare?: () => void;
  onWhatsApp?: () => void;
};

export const BottomCTA = ({
  primaryLabel,
  primaryIcon,
  secondaryLabel,
  accentColor = COLORS.primary,
  useGradient = false,
  onPrimary,
  onSecondary,
  saved = false,
  onSave,
  onShare,
  onWhatsApp,
}: BottomCTAProps) => (
  <View style={styles.container}>
    <Pressable
      style={[styles.primaryBtn, !useGradient && { backgroundColor: accentColor }]}
      onPress={onPrimary}
    >
      {useGradient && (
        <LinearGradient
          colors={["#FF7A1A", "#FFC400"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {primaryIcon && (
        <Ionicons name={primaryIcon} size={20} color="#FFF" style={{ marginRight: SPACING.small }} />
      )}
      <Text style={styles.primaryText} numberOfLines={1} ellipsizeMode="tail">{primaryLabel}</Text>
    </Pressable>

    {secondaryLabel && onSecondary && (
      <Pressable
        style={[styles.secondaryBtn, { borderColor: accentColor }]}
        onPress={onSecondary}
      >
        <Text style={[styles.secondaryText, { color: accentColor }]} numberOfLines={1}>{secondaryLabel}</Text>
      </Pressable>
    )}

    {(onWhatsApp || onShare || onSave) && (
      <View style={styles.actionRow}>
        {onWhatsApp && (
          <Pressable style={styles.actionBtn} onPress={onWhatsApp}>
            <Ionicons name="logo-whatsapp" size={18} color="#22C55E" />
            <Text style={styles.actionText}>WhatsApp</Text>
          </Pressable>
        )}
        {onShare && (
          <Pressable style={styles.actionBtn} onPress={onShare}>
            <Ionicons name="share-social-outline" size={18} color="#264348" />
            <Text style={styles.actionText}>Teilen</Text>
          </Pressable>
        )}
        {onSave && (
          <Pressable style={styles.actionBtn} onPress={onSave}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={18}
              color={saved ? COLORS.gold : "#264348"}
            />
            <Text style={styles.actionText}>{saved ? "Gespeichert" : "Speichern"}</Text>
          </Pressable>
        )}
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.section,
    paddingTop: SPACING.compact,
    gap: SPACING.small,
  },
  primaryBtn: {
    height: 56,
    borderRadius: BORDER_RADIUS.button,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.std,
    overflow: "hidden",
  },
  primaryText: {
    fontSize: FONT_SIZES.body,
    fontWeight: "700",
    color: "#FFFFFF",
    flexShrink: 1,
  },
  secondaryBtn: {
    height: 48,
    borderRadius: BORDER_RADIUS.button,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.section,
  },
  secondaryText: {
    fontSize: FONT_SIZES.body,
    fontWeight: "600",
    flexShrink: 1,
  },
  iconRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.gap,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: SPACING.small,
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(38,67,72,0.05)",
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#264348",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    ...SHADOWS.subtle,
  },
});

export default BottomCTA;

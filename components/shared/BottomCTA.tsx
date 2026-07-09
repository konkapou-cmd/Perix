import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, SHADOWS } from "../../lib/designTokens";

type BottomCTAProps = {
  primaryLabel: string;
  primaryIcon?: keyof typeof Ionicons.glyphMap;
  secondaryLabel?: string;
  accentColor?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  saved?: boolean;
  onSave?: () => void;
  onShare?: () => void;
};

export const BottomCTA = ({
  primaryLabel,
  primaryIcon,
  secondaryLabel,
  accentColor = COLORS.primary,
  onPrimary,
  onSecondary,
  saved = false,
  onSave,
  onShare,
}: BottomCTAProps) => (
  <View style={styles.container}>
    <Pressable
      style={[styles.primaryBtn, { backgroundColor: accentColor }]}
      onPress={onPrimary}
    >
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

    {(onSave || onShare) && (
      <View style={styles.iconRow}>
        {onSave && (
          <Pressable style={styles.iconBtn} onPress={onSave}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={22}
              color={saved ? COLORS.gold : COLORS.textSecondary}
            />
          </Pressable>
        )}
        {onShare && (
          <Pressable style={styles.iconBtn} onPress={onShare}>
            <Ionicons name="share-social" size={22} color={COLORS.textSecondary} />
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

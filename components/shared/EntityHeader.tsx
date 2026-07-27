import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES, ICON_SIZES } from "../../lib/designTokens";

type EntityHeaderProps = {
  title: string;
  subtitle: string;
  subtitlePrefix?: string;
  avatarUrl?: string;
  avatarIcon?: keyof typeof Ionicons.glyphMap;
  accentColor?: string;
  onPress?: () => void;
};

export const EntityHeader = ({
  title,
  subtitle,
  subtitlePrefix = "von",
  avatarUrl,
  avatarIcon = "business-outline",
  accentColor = COLORS.primary,
  onPress,
}: EntityHeaderProps) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>

    <Pressable style={styles.subtitleRow} onPress={onPress} disabled={!onPress}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatarPlaceholder, { backgroundColor: accentColor + "15" }]}>
          <Ionicons name={avatarIcon} size={ICON_SIZES.inline} color={accentColor} />
        </View>
      )}
      <Text style={styles.subtitle}>
        <Text style={styles.prefix}>{subtitlePrefix}{" "}</Text>
        {subtitle}
      </Text>
      {onPress && (
        <Ionicons name="chevron-forward" size={16} color={COLORS.textSecondary} />
      )}
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.page,
    paddingTop: SPACING.compact,
    marginBottom: SPACING.compact,
  },
  title: {
    fontSize: FONT_SIZES.h1,
    fontWeight: "700",
    color: COLORS.textPrimary,
    lineHeight: 34,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.small,
    gap: SPACING.small,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  prefix: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: "400",
  },
  subtitle: {
    fontSize: FONT_SIZES.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: "600",
    flex: 1,
  },
});

export default EntityHeader;

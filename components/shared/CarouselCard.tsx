import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";

interface CarouselCardProps {
  imageUrl?: string | null;
  videoUrl?: string | null;
  focalPoint?: { x: number; y: number } | null;
  title: string;
  subtitle?: string | null;
  thirdLine?: string | null;
  onPress: () => void;
  isSaved?: boolean;
  overlay?: React.ReactNode;
  textColor?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}

export function CarouselCard({
  imageUrl,
  videoUrl,
  focalPoint,
  title,
  subtitle,
  thirdLine,
  onPress,
  isSaved,
  overlay,
  textColor,
  fallbackIcon = "ellipse",
}: CarouselCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.imageArea}>
        {imageUrl ? (
          <FocalImage uri={imageUrl} aspectRatio={4 / 3} focalPoint={focalPoint ?? { x: 0.5, y: 0.5 }} style={styles.image} showLoader={false} />
        ) : videoUrl ? (
          <AdaptiveVideo uri={videoUrl} style={styles.image} autoPlay isLooping initialMuted />
        ) : (
          <View style={styles.fallback}>
            <Ionicons name={fallbackIcon} size={32} color={COLORS.textPlaceholder} />
          </View>
        )}
        {isSaved && (
          <View style={styles.savedBadge}>
            <Ionicons name="bookmark" size={14} color={COLORS.gold} />
          </View>
        )}
        {overlay}
      </View>
      <View style={styles.textArea}>
        <Text style={[styles.title, textColor ? { color: textColor } : undefined]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, textColor ? { color: textColor } : undefined]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {thirdLine ? (
          <Text style={styles.thirdLine} numberOfLines={1}>
            {thirdLine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: Platform.OS === "web" ? 180 : 145,
    backgroundColor: COLORS.background,
    marginRight: 12,
    marginBottom: 4,
    borderRadius: BORDER_RADIUS.card,
    overflow: "hidden",
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  imageArea: {
    width: Platform.OS === "web" ? 180 : 145,
    height: Platform.OS === "web" ? 135 : 110,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    borderTopLeftRadius: BORDER_RADIUS.card,
    borderTopRightRadius: BORDER_RADIUS.card,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  savedBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  textArea: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    fontSize: Platform.OS === "web" ? 15 : 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: Platform.OS === "web" ? 13 : 11,
    color: COLORS.textGray,
    marginTop: 1,
  },
  thirdLine: {
    fontSize: Platform.OS === "web" ? 13 : 11,
    color: COLORS.textGray,
    marginTop: 1,
  },
});

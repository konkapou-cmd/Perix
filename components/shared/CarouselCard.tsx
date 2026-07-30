import React from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";
import { COLORS, BORDER_RADIUS } from "../../lib/designTokens";

const CARD_WIDTH = Platform.OS === "web" ? 220 : 200;
const CARD_HEIGHT = Platform.OS === "web" ? 260 : 240;

interface CarouselCardProps {
  imageUrl?: string | null;
  videoUrl?: string | null;
  isCoverVideo?: boolean;
  muxThumbnailUrl?: string | null;
  videoStatus?: string | null;
  focalPoint?: { x: number; y: number } | null;
  title: string;
  subtitle?: string | null;
  subtitleOnPress?: () => void;
  subtitleAvatarUrl?: string | null;
  thirdLine?: string | null;
  onPress: () => void;
  isSaved?: boolean;
  overlay?: React.ReactNode;
  textColor?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  showGradient?: boolean;
}

export function CarouselCard({
  imageUrl,
  videoUrl,
  isCoverVideo,
  muxThumbnailUrl,
  videoStatus,
  focalPoint,
  title,
  subtitle,
  subtitleOnPress,
  subtitleAvatarUrl,
  thirdLine,
  onPress,
  isSaved,
  overlay,
  textColor,
  fallbackIcon = "ellipse",
  showGradient = true,
}: CarouselCardProps) {
  const showVideo = isCoverVideo && videoUrl;
  const hasMedia = !!(imageUrl || videoUrl);

  const renderBackground = () => {
    if (showVideo) {
      return (
        <View style={styles.mediaFill}>
          {muxThumbnailUrl ? (
            <FocalImage uri={muxThumbnailUrl} focalPoint={focalPoint ?? { x: 0.5, y: 0.5 }} showLoader={false} style={styles.videoFill} />
          ) : null}
          <AdaptiveVideo uri={videoUrl!} style={styles.videoFill} autoPlay isLooping initialMuted videoStatus={videoStatus} muxThumbnailUrl={muxThumbnailUrl || undefined} resizeMode="cover" />
        </View>
      );
    }
    if (imageUrl) {
      return (
        <View style={styles.mediaFill}>
          <FocalImage uri={imageUrl} focalPoint={focalPoint ?? { x: 0.5, y: 0.5 }} showLoader={false} style={styles.videoFill} />
        </View>
      );
    }
    if (videoUrl) {
      return (
        <View style={styles.mediaFill}>
          {muxThumbnailUrl && <FocalImage uri={muxThumbnailUrl} focalPoint={focalPoint ?? { x: 0.5, y: 0.5 }} showLoader={false} style={styles.videoFill} />}
          <AdaptiveVideo uri={videoUrl} style={styles.videoFill} autoPlay isLooping initialMuted videoStatus={videoStatus} muxThumbnailUrl={muxThumbnailUrl || undefined} resizeMode="cover" />
        </View>
      );
    }
    return (
      <View style={styles.fallback}>
        <Ionicons name={fallbackIcon} size={44} color={COLORS.textPlaceholder} />
      </View>
    );
  };

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardInner}>
        {renderBackground()}

        {showGradient && hasMedia && (
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.75)"]}
            style={styles.gradient}
          />
        )}

        <View style={styles.badgeRow}>
          <View style={styles.badgeLeft}>
            {showVideo && (
              <View style={styles.videoBadge}>
                <Ionicons name="play-circle" size={14} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.badgeRight}>
            {isSaved && (
              <View style={styles.saveBadge}>
                <Ionicons name="bookmark" size={14} color={COLORS.gold} />
              </View>
            )}
          </View>
        </View>

        {overlay}

        <View style={hasMedia ? styles.textOverlay : styles.textArea}>
          <Text style={[styles.title, !hasMedia && (textColor ? { color: textColor } : styles.titleDark)]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            subtitleOnPress ? (
              <Pressable onPress={subtitleOnPress} style={styles.subtitleRow}>
                {subtitleAvatarUrl ? (
                  <Image source={{ uri: subtitleAvatarUrl }} style={styles.subtitleAvatar} />
                ) : null}
                <Text style={[styles.subtitle, !hasMedia && (textColor ? { color: textColor } : styles.subtitleDark)]} numberOfLines={1}>
                  {subtitle}
                </Text>
              </Pressable>
            ) : (
              <Text style={[styles.subtitle, !hasMedia && (textColor ? { color: textColor } : styles.subtitleDark)]} numberOfLines={1}>
                {subtitle}
              </Text>
            )
          ) : null}
          {thirdLine ? (
            <View style={styles.thirdRow}>
              <Ionicons name="location-outline" size={11} color={hasMedia ? "rgba(255,255,255,0.7)" : COLORS.textMuted} />
              <Text style={[styles.thirdLine, !hasMedia && styles.thirdLineDark]} numberOfLines={1}>
                {thirdLine}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    marginRight: 12,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceSoft,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardInner: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    position: "relative",
  },
  gradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "65%",
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  fallback: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaFill: {
    ...StyleSheet.absoluteFillObject,
  },
  videoFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
  },
  badgeRow: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  badgeLeft: {
    flexDirection: "row",
    gap: 6,
  },
  badgeRight: {
    flexDirection: "row",
    gap: 6,
  },
  videoBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  saveBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  textOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    paddingBottom: 12,
  },
  textArea: {
    padding: 10,
    paddingBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 3,
  },
  titleDark: {
    color: COLORS.textPrimary,
    textShadowColor: "transparent",
    textShadowRadius: 0,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 2,
  },
  subtitleAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitleDark: {
    color: COLORS.textGray,
    textShadowColor: "transparent",
    textShadowRadius: 0,
  },
  thirdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  thirdLine: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    flex: 1,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  thirdLineDark: {
    color: COLORS.textMuted,
    textShadowColor: "transparent",
    textShadowRadius: 0,
  },
});

export { CARD_WIDTH, CARD_HEIGHT };

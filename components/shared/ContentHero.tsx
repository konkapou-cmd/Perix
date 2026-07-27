import React from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AdaptiveImage from "../AdaptiveImage";
import AdaptiveVideo from "../AdaptiveVideo";
import FocalImage from "../FocalImage";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../../lib/designTokens";
import type { MediaItem } from "../LazyMediaViewer";
import type { FocalPoint } from "../../lib/api/core";

type ContentHeroBadge = {
  icon: string;
  text?: string;
  color?: string;
};

type ContentHeroSubtitle = {
  text: string;
  icon?: string;
  onPress?: () => void;
  avatarUrl?: string | null;
};

type ContentHeroProps = {
  coverImageUrl?: string | null;
  videoUrl?: string | null;
  muxThumbnailUrl?: string | null;
  videoStatus?: string | null;
  isCoverVideo?: boolean;
  coverFocalPoint?: FocalPoint | null;
  imageUrls?: string[];
  title: string;
  badges?: ContentHeroBadge[];
  subtitle?: ContentHeroSubtitle;
  mediaItems: MediaItem[];
  onMediaPress?: (index: number) => void;
  onBack?: () => void;
};

export default function ContentHero({
  coverImageUrl,
  videoUrl,
  muxThumbnailUrl,
  videoStatus,
  isCoverVideo,
  coverFocalPoint,
  imageUrls,
  title,
  badges,
  subtitle,
  mediaItems,
  onMediaPress,
  onBack,
}: ContentHeroProps) {
  const router = useRouter();
  const handleBack = onBack || (() => router.back());

  const handleMediaTap = (index: number) => {
    if (onMediaPress) onMediaPress(index);
  };

  const renderMedia = () => {
    if (isCoverVideo && videoUrl) {
      return (
        <View style={StyleSheet.absoluteFill}>
          <FocalImage
            uri={muxThumbnailUrl || coverImageUrl}
            aspectRatio={16 / 9}
            focalPoint={coverFocalPoint ?? { x: 0.5, y: 0.5 }}
            showLoader={false}
          />
          <AdaptiveVideo
            uri={videoUrl}
            ratio={16 / 9}
            autoPlay={true}
            initialMuted={true}
            showMuteButton={false}
            videoStatus={videoStatus}
            muxThumbnailUrl={muxThumbnailUrl || undefined}
            onPress={() => handleMediaTap(0)}
          />
        </View>
      );
    }
    if (coverImageUrl) {
      return (
        <Pressable onPress={() => handleMediaTap(0)} style={{ width: "100%", height: "100%" }}>
          <FocalImage
            uri={coverImageUrl}
            aspectRatio={16 / 9}
            focalPoint={coverFocalPoint ?? { x: 0.5, y: 0.5 }}
          />
        </Pressable>
      );
    }
    if (videoUrl) {
      return (
        <View style={StyleSheet.absoluteFill}>
          <FocalImage
            uri={muxThumbnailUrl || imageUrls?.[0]}
            aspectRatio={16 / 9}
            focalPoint={coverFocalPoint ?? { x: 0.5, y: 0.5 }}
            showLoader={false}
          />
          <AdaptiveVideo
            uri={videoUrl}
            ratio={16 / 9}
            autoPlay={true}
            initialMuted={true}
            showMuteButton={false}
            videoStatus={videoStatus}
            muxThumbnailUrl={muxThumbnailUrl || undefined}
            onPress={() => handleMediaTap(0)}
          />
        </View>
      );
    }
    if (imageUrls?.[0]) {
      return (
        <Pressable onPress={() => handleMediaTap(0)} style={{ width: "100%", height: "100%" }}>
          <FocalImage
            uri={imageUrls[0]}
            aspectRatio={16 / 9}
            focalPoint={coverFocalPoint ?? { x: 0.5, y: 0.5 }}
          />
        </Pressable>
      );
    }
    return (
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        style={styles.heroMedia}
      >
        <View style={styles.heroFallbackIcon}>
          <Ionicons name="calendar" size={48} color="rgba(255,255,255,0.3)" />
        </View>
      </LinearGradient>
    );
  };

  return (
    <View style={styles.heroContainer}>
      {renderMedia()}

      <View style={styles.heroBackButton}>
        <Pressable style={styles.heroBackPill} onPress={handleBack}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
          <Text style={styles.heroBackText}>Zurück</Text>
        </Pressable>
      </View>

      {badges && badges.length > 0 && (
        <View style={styles.heroBadgeRow}>
          {badges.map((badge, idx) => (
            <View key={idx} style={[styles.heroBadge, badge.color ? { backgroundColor: badge.color } : undefined]}>
              <Ionicons name={badge.icon as any} size={11} color="#fff" />
              {badge.text ? <Text style={styles.heroBadgeText}>{badge.text}</Text> : null}
            </View>
          ))}
        </View>
      )}

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.05)", "rgba(0,0,0,0.30)", "rgba(0,0,0,0.65)"]}
        locations={[0, 0.4, 0.65, 1]}
        style={styles.heroGradientOverlay}
      >
        <Text style={styles.heroTitle}>{title}</Text>

        {subtitle && (
          <Pressable
            style={styles.heroSubtitleRow}
            onPress={subtitle.onPress}
            disabled={!subtitle.onPress}
          >
            {subtitle.avatarUrl ? (
              <Image source={{ uri: subtitle.avatarUrl }} style={styles.heroSubtitleAvatar} />
            ) : subtitle.icon ? (
              <Ionicons name={subtitle.icon as any} size={14} color="#fff" />
            ) : null}
            <Text style={styles.heroSubtitleText}>{subtitle.text}</Text>
          </Pressable>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  heroContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    maxWidth: Platform.OS === "web" ? 914 : undefined,
    alignSelf: "center",
    borderRadius: BORDER_RADIUS.xxl,
    overflow: "hidden",
  },
  heroMedia: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  heroFallbackIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBackButton: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
  },
  heroBackPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  heroBackText: {
    color: "#fff",
    fontSize: FONT_SIZES.small,
    fontWeight: "500",
  },
  heroBadgeRow: {
    position: "absolute",
    top: 54,
    left: SPACING.std,
    zIndex: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  heroBadgeText: {
    color: "#fff",
    fontSize: FONT_SIZES.small,
    fontWeight: "500",
  },
  heroGradientOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    paddingHorizontal: SPACING.std,
    paddingBottom: SPACING.std,
    justifyContent: "flex-end",
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  heroTitle: {
    fontSize: FONT_SIZES.h1,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  heroSubtitleAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  heroSubtitleText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: FONT_SIZES.small,
  },
});

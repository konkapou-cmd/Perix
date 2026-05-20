import React, { useRef, useEffect } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { GroupedStory, User } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { useTranslation } from "react-i18next";

const CARD_WIDTH = 120;

interface CityAdCirclesProps {
  user: User | null;
  storyGroups: GroupedStory[];
  onYourStoryPress: () => void;
  onStoryPress: (index: number) => void;
  activeIdentity?: {
    type: "user" | "business" | "artist";
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
}

function AdVideoPreview({ mediaUrl }: { mediaUrl: string }) {
  const player = useVideoPlayer(mediaUrl, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.videoPreview}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export function CityAdCircles({ user, storyGroups, onYourStoryPress, onStoryPress, activeIdentity }: CityAdCirclesProps) {
  const { t } = useTranslation();
  const isBusiness = activeIdentity?.type === "business";

  if (!user) return null;

  const ownAvatar = activeIdentity?.avatar || user?.profile_photo || user?.picture;
  const ownName = activeIdentity?.name || user?.name || "B";

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitle}>
          <View style={styles.iconContainer}>
            <Ionicons name="videocam" size={18} color="#fff" />
          </View>
          <Text style={styles.cardTitle}>{t("cityAd.sectionTitle") || "City Ads"}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {storyGroups.length === 0 && !isBusiness && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{t("cityAd.noAds") || "No ads yet"}</Text>
          </View>
        )}

        {/* Business "Your City Ad" card */}
        {isBusiness && (
          <Pressable style={styles.adCard} onPress={onYourStoryPress}>
            <View style={styles.uploadCardContent}>
              <View style={styles.uploadIconWrap}>
                <Ionicons name="add" size={28} color={COLORS.primaryDark} />
              </View>
              <Text style={styles.businessName} numberOfLines={1}>
                {t("cityAd.yourAd") || "Your Ad"}
              </Text>
            </View>
          </Pressable>
        )}

        {/* City Ad cards */}
        {storyGroups.map((group, idx) => (
          <Pressable
            key={group.actor_id}
            style={styles.adCard}
            onPress={() => onStoryPress(idx)}
          >
            <View style={styles.previewContainer}>
              {group.stories[0]?.media_url && (
                group.stories[0]?.media_type === "video" ? (
                  <AdVideoPreview mediaUrl={group.stories[0].media_url} />
                ) : (
                  <Image
                    source={{ uri: group.stories[0].media_url }}
                    style={styles.imagePreview}
                  />
                )
              )}
              {!group.stories[0]?.media_url && (
                <View style={styles.fallbackPreview}>
                  <Ionicons name="business" size={32} color={COLORS.textMuted} />
                </View>
              )}
              {!group.has_unseen && (
                <View style={styles.seenOverlay}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                </View>
              )}
            </View>
            <Text style={styles.businessName} numberOfLines={1}>
              {group.author_name || "Business"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  adCard: {
    width: CARD_WIDTH,
    marginRight: SPACING.lg,
  },
  previewContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.5,
    borderRadius: BORDER_RADIUS.sm,
    overflow: "hidden",
    backgroundColor: COLORS.border,
    position: "relative",
  },
  videoPreview: {
    width: "100%",
    height: "100%",
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  fallbackPreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  seenOverlay: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCardContent: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 1.5,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.backgroundPage,
  },
  uploadIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  businessName: {
    fontSize: FONT_SIZES.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: "center",
    fontWeight: FONT_WEIGHTS.medium,
  },
  emptyState: {
    width: CARD_WIDTH,
    paddingHorizontal: SPACING.sm,
    alignItems: "center",
  },
  emptyText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    textAlign: "center",
  },
});

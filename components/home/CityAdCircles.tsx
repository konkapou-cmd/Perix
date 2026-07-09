import React, { useRef, useEffect } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { GroupedStory, User } from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../../lib/designTokens";
import { useTranslation } from "react-i18next";

const CARD_WIDTH = Platform.OS === "web" ? 180 : 145;
const CARD_IMAGE_HEIGHT = Platform.OS === "web" ? 135 : 110;
const SNAP_INTERVAL = Platform.OS === "web" ? 192 : 157;

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
            <Ionicons name="videocam" size={18} color={COLORS.textLight} />
          </View>
          <Text style={styles.cardTitle}>{t("cityAd.sectionTitle") || "City Ads"}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={SNAP_INTERVAL} decelerationRate="fast">
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
                  <Ionicons name="checkmark" size={16} color={COLORS.textLight} />
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
    paddingVertical: SPACING.std,
    paddingHorizontal: SPACING.small,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.compact,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.background,
    marginRight: 12,
    marginBottom: 4,
    borderRadius: 12,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: "hidden",
  },
  previewContainer: {
    width: CARD_WIDTH,
    height: CARD_IMAGE_HEIGHT,
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
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  uploadCardContent: {
    width: CARD_WIDTH,
    height: CARD_IMAGE_HEIGHT,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.backgroundPage,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  uploadIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.small,
    shadowColor: COLORS.primaryDark,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  businessName: {
    fontSize: Platform.OS === "web" ? 15 : 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptyState: {
    width: CARD_WIDTH,
    paddingHorizontal: SPACING.small,
    alignItems: "center",
  },
  emptyText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    textAlign: "center",
  },
});

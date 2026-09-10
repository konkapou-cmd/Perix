import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
// Resolves to AdaptiveVideo.web.tsx on web, AdaptiveVideo.tsx on native
import AdaptiveVideoWeb from "../AdaptiveVideo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { GroupedStory, viewStory, markStorySeen } from "../../lib/api";
import { deleteStory } from "../../lib/api/stories";
import { useTranslation } from "react-i18next";
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from "../../lib/designTokens";
import { MEDIA_LIMITS } from "../../lib/constants/mediaLimits";
import { muxThumbnailUrl, lowLatencyPlaybackUrl } from "../../lib/media/mediaResolver";
import { confirmAction } from "../../lib/confirm";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const { width: vw, height: vh } = Dimensions.get("window");
const IMAGE_DURATION_MS = MEDIA_LIMITS.cityAd.imageDisplayMs;
const MAX_VIDEO_DURATION_MS = MEDIA_LIMITS.cityAd.maxDurationSeconds * 1000;

export function CityAdViewer({
  groups,
  initialGroupIndex = 0,
  onClose,
  onAdDeleted,
}: {
  groups: GroupedStory[];
  initialGroupIndex?: number;
  onClose: () => void;
  onAdDeleted?: () => void;
}) {
  const { sessionToken, user, activeIdentity, myBusinesses } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [deletingAd, setDeletingAd] = useState(false);

  const handleDeleteAd = async () => {
    if (!sessionToken || !currentStory) return;
    const ok = await confirmAction({
      title: t("cityAd.deleteTitle", "Delete Ad"),
      message: t("cityAd.deleteConfirm", "Remove this city ad?"),
      confirmText: t("common.delete", "Delete"),
      cancelText: t("common.cancel", "Cancel"),
      destructive: true,
    });
    if (!ok) return;
    try {
      setDeletingAd(true);
      await deleteStory(sessionToken, currentStory.story_id);
      onAdDeleted?.();
      onClose();
    } catch (e: any) {
      console.warn("Delete city ad failed:", e?.message || e);
      Alert.alert(t("common.error"), t("cityAd.deleteFailed", "Failed to delete"));
    } finally {
      setDeletingAd(false);
    }
  };

  const currentGroup = groups[groupIndex];
  const currentStory = currentGroup?.stories?.[storyIndex];
  const isOwnBusinessAd =
    !!currentGroup?.actor_id &&
    ((activeIdentity?.type === "business" && currentGroup?.actor_id === activeIdentity.id) ||
      myBusinesses.some((b) => b.business_id === currentGroup?.actor_id));

  console.log("[CityAd] viewer", {
    isOwnBusinessAd,
    activeId: activeIdentity?.id,
    groupActorId: currentGroup?.actor_id,
    hasStory: !!currentStory,
  });
  const isVideo = currentStory?.media_type === "video";
  const storyStartTimeRef = useRef(Date.now());

  // Track view on mount
  useEffect(() => {
    if (!sessionToken || !currentStory) return;
    storyStartTimeRef.current = Date.now();
    viewStory(sessionToken, currentStory.story_id).catch(() => {});
    return () => {
      const watchDuration = (Date.now() - storyStartTimeRef.current) / 1000;
      const duration = isVideo ? MEDIA_LIMITS.cityAd.maxDurationSeconds : (MEDIA_LIMITS.cityAd.imageDisplayMs / 1000);
      markStorySeen(sessionToken, currentStory.story_id, {
        watch_duration: watchDuration,
        completed: watchDuration >= duration * 0.8,
      }).catch(() => {});
    };
  }, [sessionToken, currentStory?.story_id]);

  // Auto-advance: go to next group after ad duration
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goNext = useCallback(() => {
    const nextIdx = storyIndex + 1;
    if (currentGroup && nextIdx < currentGroup.stories.length) {
      setStoryIndex(nextIdx);
    } else {
      const nextGroup = groupIndex + 1;
      if (nextGroup < groups.length) {
        setGroupIndex(nextGroup);
        setStoryIndex(0);
      } else {
        onClose();
      }
    }
  }, [storyIndex, groupIndex, currentGroup, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else if (groupIndex > 0) {
      setGroupIndex(groupIndex - 1);
      if (groups[groupIndex - 1]) {
        setStoryIndex(groups[groupIndex - 1].stories.length - 1);
      }
    }
  }, [storyIndex, groupIndex, groups]);

  // Auto-advance timer — videos close the viewer when finished
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const advanceMs = isVideo ? MEDIA_LIMITS.cityAd.maxDurationSeconds * 1000 : MEDIA_LIMITS.cityAd.imageDisplayMs;
    timerRef.current = setTimeout(() => {
      if (isVideo) onClose();
      else goNext();
    }, advanceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStory?.story_id, goNext, isVideo, onClose]);

  // Video player — falls back to the Mux playback id when media_url is still empty
  const cityAdVideoUrl = currentStory?.media_url
    || (currentStory?.mux_playback_id ? `https://stream.mux.com/${currentStory.mux_playback_id}.m3u8` : "");
  const player = useVideoPlayer(Platform.OS === "web" ? null : lowLatencyPlaybackUrl(cityAdVideoUrl), (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  // Show the Mux thumbnail as a poster while the HLS stream buffers
  // (status goes idle -> loading -> readyToPlay), so opening an ad feels instant.
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    setVideoReady(false);
    setVideoFailed(false);
  }, [currentStory?.story_id]);
  useEffect(() => {
    if (status === "readyToPlay") setVideoReady(true);
    if (status === "error") setVideoFailed(true);
  }, [status]);

  const thumb = currentStory?.mux_thumbnail_url
    || (currentStory?.mux_playback_id ? muxThumbnailUrl(currentStory.mux_playback_id, 640) : null);

  // Auto-advance on video end — only fire when status transitions TO idle (not on init)
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev !== undefined && prev !== "idle" && status === "idle" && cityAdVideoUrl) {
      // Video finished — close the viewer
      onClose();
    }
  }, [cityAdVideoUrl, status, onClose]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
      {/* Close button */}
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={28} color="#fff" />
      </Pressable>

      {/* Delete button — only for the business that owns this ad */}
      {isOwnBusinessAd && (
        <Pressable style={styles.deleteBtn} onPress={handleDeleteAd} disabled={deletingAd}>
          <Ionicons name={deletingAd ? "hourglass-outline" : "trash-outline"} size={20} color="#fff" />
        </Pressable>
      )}

      {/* Business name header */}
      <Pressable
        style={styles.header}
        onPress={() => {
          if (currentGroup?.actor_id) {
            player.pause();
            router.push(`/business/${currentGroup.actor_id}`);
          }
        }}
      >
        <Text style={styles.businessName}>
          {currentGroup?.author_name || "Business"}
        </Text>
        {!!currentGroup?.actor_id && (
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
        )}
      </Pressable>

      {/* Video player */}
      <View style={styles.videoContainer}>
        {Platform.OS === "web" && currentStory?.media_type === "video" && cityAdVideoUrl ? (
          <AdaptiveVideoWeb
            uri={cityAdVideoUrl}
            autoPlay
            fitPolicy="auto"
            resizeMode="cover"
            muxThumbnailUrl={thumb}
            showMuteButton={false}
            onEnded={onClose}
            showGifFallback
            style={{ width: "100%", height: "100%" }}
          />
        ) : currentStory?.media_type === "video" && cityAdVideoUrl && currentStory?.video_status !== "processing" && currentStory?.video_status !== "uploading" ? (
          videoReady ? (
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              nativeControls={false}
              surfaceType="textureView"
            />
          ) : videoFailed ? (
            thumb ? <Image source={{ uri: thumb }} style={styles.media} resizeMode="contain" /> : (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            )
          ) : (
            <View style={styles.loadingContainer}>
              {thumb ? <Image source={{ uri: thumb }} style={styles.media} resizeMode="contain" /> : null}
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            </View>
          )
        ) : currentStory?.media_type === "video" && cityAdVideoUrl ? (
          <View style={styles.loadingContainer}>
            {thumb ? <Image source={{ uri: thumb }} style={styles.media} resizeMode="contain" /> : null}
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Processing…</Text>
            </View>
          </View>
        ) : cityAdVideoUrl ? (
          <Image source={{ uri: cityAdVideoUrl }} style={styles.media} resizeMode="contain" />
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </View>

      {/* Tap zones for navigation */}
      <Pressable style={styles.tapLeft} onPress={goPrev} />
      <Pressable style={styles.tapRight} onPress={goNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // position: fixed on web — inside an RN Modal the ancestor height chain
    // collapses, so absolute + inset 0 falls back to the video's intrinsic
    // size (video rendered at 1072x1920 overflowing the screen).
    position: Platform.OS === "web" ? "fixed" : "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    height: "100%",
    maxWidth: 1280,
    alignSelf: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 50,
    left: 16,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  deleteBtn: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(239,68,68,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  businessName: {
    color: "#fff",
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  videoContainer: {
    width: "100%",
    height: "100%",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  loadingText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 10,
  },
  tapLeft: {
    position: "absolute",
    left: 0,
    top: 80,
    bottom: 80,
    width: "33%",
    zIndex: 5,
  },
  tapRight: {
    position: "absolute",
    right: 0,
    top: 80,
    bottom: 80,
    width: "33%",
    zIndex: 5,
  },
});

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { GroupedStory, viewStory, markStorySeen } from "../../lib/api";
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING } from "../../lib/designTokens";
import { MEDIA_LIMITS } from "../../lib/constants/mediaLimits";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const IMAGE_DURATION_MS = MEDIA_LIMITS.cityAd.imageDisplayMs;
const MAX_VIDEO_DURATION_MS = MEDIA_LIMITS.cityAd.maxDurationSeconds * 1000;

export function CityAdViewer({
  groups,
  initialGroupIndex = 0,
  onClose,
}: {
  groups: GroupedStory[];
  initialGroupIndex?: number;
  onClose: () => void;
}) {
  const { sessionToken, user } = useAuth();
  const router = useRouter();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);

  const currentGroup = groups[groupIndex];
  const currentStory = currentGroup?.stories?.[storyIndex];
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

  // Auto-advance timer
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const advanceMs = isVideo ? MEDIA_LIMITS.cityAd.maxDurationSeconds * 1000 : MEDIA_LIMITS.cityAd.imageDisplayMs;
    timerRef.current = setTimeout(goNext, advanceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStory?.story_id, goNext]);

  // Video player
  const player = useVideoPlayer(currentStory?.media_url || "", (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });

  // Show the Mux thumbnail as a poster while the HLS stream buffers
  // (status goes idle -> loading -> readyToPlay), so opening an ad feels instant.
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    setVideoReady(false);
  }, [currentStory?.story_id]);
  useEffect(() => {
    if (status === "readyToPlay") setVideoReady(true);
  }, [status]);

  const thumb = currentStory?.mux_thumbnail_url
    || (currentStory?.mux_playback_id ? `https://image.mux.com/${currentStory.mux_playback_id}/thumbnail.jpg` : null);

  // Auto-advance on video end — only fire when status transitions TO idle (not on init)
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev !== undefined && prev !== "idle" && status === "idle" && currentStory?.media_url) {
      goNext();
    }
  }, [currentStory?.media_url, status, goNext]);

  return (
    <View style={styles.container}>
      {/* Close button */}
      <Pressable style={styles.closeBtn} onPress={onClose}>
        <Ionicons name="close" size={28} color="#fff" />
      </Pressable>

      {/* Business name header */}
      <Pressable
        style={styles.header}
        onPress={() => {
          if (currentGroup?.actor_type === "business" && currentGroup?.actor_id) {
            player.pause();
            router.push(`/business/${currentGroup.actor_id}`);
          }
        }}
      >
        <Text style={styles.businessName}>
          {currentGroup?.author_name || "Business"}
        </Text>
        {currentGroup?.actor_type === "business" && (
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
        )}
      </Pressable>

      {/* Video player */}
      <View style={styles.videoContainer}>
        {currentStory?.media_type === "video" && currentStory?.media_url && currentStory?.video_status !== "processing" && currentStory?.video_status !== "uploading" ? (
          videoReady ? (
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              nativeControls={false}
              surfaceType="textureView"
            />
          ) : (
            <View style={styles.loadingContainer}>
              {thumb ? <Image source={{ uri: thumb }} style={styles.media} resizeMode="contain" /> : null}
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#fff" />
              </View>
            </View>
          )
        ) : currentStory?.media_type === "video" && currentStory?.media_url ? (
          <View style={styles.loadingContainer}>
            {thumb ? <Image source={{ uri: thumb }} style={styles.media} resizeMode="contain" /> : null}
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Processing…</Text>
            </View>
          </View>
        ) : currentStory?.media_url ? (
          <Image source={{ uri: currentStory.media_url }} style={styles.media} resizeMode="contain" />
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
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
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
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
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
    width: SCREEN_WIDTH / 3,
    zIndex: 5,
  },
  tapRight: {
    position: "absolute",
    right: 0,
    top: 80,
    bottom: 80,
    width: SCREEN_WIDTH / 3,
    zIndex: 5,
  },
});

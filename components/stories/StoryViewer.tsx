import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
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
import { useAuth } from "../../context/AuthContext";
import {
  GroupedStory,
  Story,
  STORY_REACTIONS,
  viewStory,
  reactToStory,
  deleteStory,
  markStorySeen,
} from "../../lib/api";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS } from "../../lib/designTokens";
import { MEDIA_LIMITS } from "../../lib/constants/mediaLimits";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const STORY_DURATION = MEDIA_LIMITS.story.imageDisplayMs;
const MAX_VIDEO_DURATION = MEDIA_LIMITS.story.maxDurationSeconds * 1000;
const VIDEO_FALLBACK_DURATION = MEDIA_LIMITS.story.videoFallbackMs;
const ERROR_FALLBACK_DURATION = MEDIA_LIMITS.story.errorFallbackMs;
const PROGRESS_HEIGHT = 3;

type StoryViewerProps = {
  groups: GroupedStory[];
  initialGroupIndex?: number;
  onClose: () => void;
  onDelete?: (storyId: string) => void;
};

export const StoryViewer: React.FC<StoryViewerProps> = ({
  groups,
  initialGroupIndex = 0,
  onClose,
  onDelete,
}) => {
  const { sessionToken, user } = useAuth();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storyStartTimeRef = useRef<number>(Date.now());

  const group = groups[groupIndex];
  const story = group?.stories?.[storyIndex];

  const videoSource = story?.media_type === "video" && story?.media_url ? story.media_url : "";
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  const goNext = useCallback(() => {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex((i) => i + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex((i) => i + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  }, [groupIndex, storyIndex, groups.length, group, onClose]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
    } else if (groupIndex > 0) {
      setGroupIndex((i) => i - 1);
      const prevGroup = groups[groupIndex - 1];
      setStoryIndex(prevGroup ? prevGroup.stories.length - 1 : 0);
    }
  }, [groupIndex, storyIndex, groups]);

  const startTimer = useCallback(() => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) goNext();
    });
  }, [goNext, progressAnim]);

  const startVideoTimer = useCallback((durationMs: number) => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: durationMs,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    progressAnim.stopAnimation();

    if (story && sessionToken) {
      viewStory(sessionToken, story.story_id).catch((e) => console.warn("viewStory failed:", e));
      storyStartTimeRef.current = Date.now();
    }

    if (story?.media_type === "image") {
      startTimer();
    } else if (story?.media_type === "video") {
      if (status === "readyToPlay") {
        player.play();
        const videoDurationMs = story.duration_seconds
          ? Math.min(Math.round(story.duration_seconds * 1000), MAX_VIDEO_DURATION)
          : VIDEO_FALLBACK_DURATION;
        startVideoTimer(videoDurationMs);
      } else if (status === "error" || !story.media_url) {
        timerRef.current = setTimeout(goNext, ERROR_FALLBACK_DURATION);
      }
    }

    return () => {
      progressAnim.stopAnimation();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (story && sessionToken) {
        const watched = (Date.now() - storyStartTimeRef.current) / 1000;
        const storyDurationSec = story.media_type === "image"
          ? STORY_DURATION / 1000
          : (story.duration_seconds || VIDEO_FALLBACK_DURATION / 1000);
        const completed = watched >= storyDurationSec * 0.8;
        markStorySeen(sessionToken, story.story_id, {
          watch_duration: Math.min(watched, storyDurationSec),
          completed,
        }).catch((e) => console.warn("markStorySeen failed:", e));
      }
    };
  }, [story?.story_id, status]);

  useEffect(() => {
    if (story?.media_type === "video" && (status as string) === "ended") {
      goNext();
    }
  }, [status, story?.media_type, goNext]);

  const handleReaction = async (emoji: string) => {
    if (!sessionToken || !story) return;
    setShowReactions(false);
    try {
      await reactToStory(sessionToken, story.story_id, emoji);
    } catch (e) { console.warn("reactToStory failed:", e); }
  };

  const handleDelete = async () => {
    if (!sessionToken || !story) return;
    try {
      await deleteStory(sessionToken, story.story_id);
      onDelete?.(story.story_id);
      goNext();
    } catch (e) { console.warn("deleteStory failed:", e); }
  };

  if (!group || !story) return null;

  const isOwnStory = user?.user_id === group.user_id || user?.user_id === group.actor_id;
  const isVideoProcessing = story.media_type === "video" && (!story.media_url || story.video_status === "processing" || story.video_status === "uploading");

  return (
    <View style={styles.container}>
      {/* Progress bars */}
      <View style={styles.progressContainer}>
        {group.stories.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            {i < storyIndex ? (
              <View style={[styles.progressFill, { width: "100%" }]} />
            ) : i === storyIndex ? (
              <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            ) : null}
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {group.author_avatar ? (
            <Image source={{ uri: group.author_avatar }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>
                {(group.author_name || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.headerName} numberOfLines={1}>
            {group.author_name || "User"}
          </Text>
          <Text style={styles.headerTime}>
            {formatTimeAgo(story.created_at)}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isOwnStory && (
            <Pressable style={styles.headerBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </Pressable>
          )}
          <Pressable style={styles.headerBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Tap zones */}
      <Pressable style={styles.tapLeft} onPress={goPrev} />
      <Pressable style={styles.tapRight} onPress={goNext} />

      {/* Story content */}
      <View style={styles.storyContent} pointerEvents="none">
        {isVideoProcessing ? (
          <View style={styles.processingContainer}>
            {story.mux_thumbnail_url ? (
              <Image source={{ uri: story.mux_thumbnail_url }} style={styles.media} resizeMode="cover" />
            ) : null}
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : story.media_type === "video" && story.media_url ? (
          <VideoView
            player={player}
            style={styles.media}
            nativeControls={false}
            contentFit="contain"
          />
        ) : (
          <Image source={{ uri: story.media_url }} style={styles.media} resizeMode="contain" />
        )}
        {story.text && (
          <View style={styles.textOverlay}>
            <Text style={styles.storyText}>{story.text}</Text>
          </View>
        )}
      </View>

      {/* Reaction bar */}
      <View style={styles.reactionBar}>
        {showReactions ? (
          <View style={styles.reactionRow}>
            {STORY_REACTIONS.map((emoji) => (
              <Pressable key={emoji} style={styles.reactionBtn} onPress={() => handleReaction(emoji)}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable style={styles.reactTrigger} onPress={() => setShowReactions(true)}>
            <Ionicons name="heart-outline" size={24} color="#fff" />
          </Pressable>
        )}
      </View>
    </View>
  );
};

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  progressContainer: {
    flexDirection: "row",
    paddingHorizontal: SPACING.small,
    paddingTop: 50,
    gap: SPACING.tiny,
  },
  progressTrack: {
    flex: 1,
    height: PROGRESS_HEIGHT,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 1,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.small,
    paddingTop: SPACING.small,
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.small,
    flex: 1,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: FONT_WEIGHTS.bold as any,
  },
  headerName: {
    color: "#fff",
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
  },
  headerTime: {
    color: "rgba(255,255,255,0.6)",
    fontSize: FONT_SIZES.small,
  },
  headerRight: {
    flexDirection: "row",
    gap: SPACING.small,
  },
  headerBtn: {
    padding: SPACING.tiny,
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
  storyContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  processingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  textOverlay: {
    position: "absolute",
    bottom: 120,
    left: SPACING.std,
    right: SPACING.std,
  },
  storyText: {
    color: "#fff",
    fontSize: FONT_SIZES.h4,
    fontWeight: FONT_WEIGHTS.semibold as any,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowRadius: 4,
  },
  reactionBar: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  reactionRow: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 24,
    paddingVertical: SPACING.small,
    paddingHorizontal: SPACING.small,
    gap: SPACING.tiny,
  },
  reactionBtn: {
    padding: SPACING.small,
  },
  reactionEmoji: {
    fontSize: 24,
  },
  reactTrigger: {
    backgroundColor: "rgba(0,0,0,0.4)",
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default StoryViewer;

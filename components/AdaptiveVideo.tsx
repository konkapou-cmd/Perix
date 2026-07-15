import React, { useEffect, useState, useRef } from "react";
import { AppState, AppStateStatus, Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle, Text, Image as RNImage, ActivityIndicator, Dimensions } from "react-native";
import { useVideoPlayer, VideoView, VideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type AdaptiveVideoProps = {
  uri?: string;
  source?: { uri: string };
  style?: StyleProp<ViewStyle>;
  isLooping?: boolean;
  ratio?: number;
  autoPlay?: boolean;
  showMuteButton?: boolean;
  initialMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
  onPlay?: () => void;
  resizeMode?: "contain" | "cover";
  videoStatus?: string | null;
  muxThumbnailUrl?: string | null;
  coverPhoto?: string | null;
  maxHeight?: number;
  borderRadius?: number;
  onPress?: () => void;
  useNativeControls?: boolean;
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DEFAULT_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;

type VideoPlayerCoreProps = {
  videoUri: string;
  isLooping: boolean;
  initialMuted: boolean;
  resizeMode: "contain" | "cover";
  useNativeControls: boolean;
  onPlayerCreated: (player: VideoPlayer | null) => void;
};

function VideoPlayerCore({
  videoUri,
  isLooping,
  initialMuted,
  resizeMode,
  useNativeControls,
  onPlayerCreated,
}: VideoPlayerCoreProps) {
  const player = useVideoPlayer(videoUri || null, (p) => {
    p.loop = isLooping;
    p.muted = initialMuted;
  });

  useEffect(() => {
    onPlayerCreated(player);
    return () => {
      try { player.pause(); } catch (_) {}
      onPlayerCreated(null);
    };
  }, [player, onPlayerCreated]);

  if (!player) return null;

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit={resizeMode}
      nativeControls={useNativeControls}
    />
  );
}

function isMuxProcessingPlaceholder(url: string): boolean {
  return !!url && url.startsWith("mux://");
}

function getMuxThumbnail(uri: string): string | null {
  const match = uri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  return match ? `https://image.mux.com/${match[1]}/thumbnail.jpg` : null;
}

export default function AdaptiveVideo({
  uri,
  source,
  style,
  isLooping = false,
  ratio,
  autoPlay = false,
  showMuteButton = true,
  initialMuted = false,
  onMuteChange,
  onPlay,
  resizeMode = "cover",
  videoStatus,
  muxThumbnailUrl,
  coverPhoto,
  maxHeight = DEFAULT_MAX_HEIGHT,
  borderRadius = 0,
  onPress,
  useNativeControls = false,
}: AdaptiveVideoProps) {
  const { t } = useTranslation();
  const videoUri = uri || source?.uri || "";
  const isProcessing = videoStatus === "processing" || isMuxProcessingPlaceholder(videoUri);
  const validRatio = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : null;

  const [player, setPlayer] = useState<VideoPlayer | null>(null);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const naturalAspectRef = useRef<number | null>(null);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<View>(null);
  const playedRef = useRef(false);

  const clearLoadTimeout = () => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  const handleNaturalAspect = (aspect: number) => {
    naturalAspectRef.current = aspect;
    setNaturalAspect(aspect);
    clearLoadTimeout();
    setHasError(false);
  };

  useEffect(() => {
    setNaturalAspect(null);
    naturalAspectRef.current = null;
    playedRef.current = false;
    setHasError(false);
    clearLoadTimeout();
  }, [videoUri]);

  useEffect(() => {
    if (!player || autoPlay) return;
    player.muted = true;
    player.pause();
  }, [autoPlay, player]);

  const coverUrl = coverPhoto || muxThumbnailUrl || getMuxThumbnail(videoUri);

  const styleHasHeight = !!(style && typeof style === "object" && "height" in style);

  const containerStyle: ViewStyle = {
    width: "100%",
    aspectRatio: styleHasHeight ? undefined : (validRatio || 4 / 5),
    maxHeight,
    overflow: "hidden",
    backgroundColor: "#000",
  };

  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (player) player.loop = isLooping;
  }, [isLooping, player]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
      if (e.isPlaying && !playedRef.current) {
        playedRef.current = true;
        onPlay?.();
      }
    });
    return () => sub.remove();
  }, [player, onPlay]);

  useEffect(() => {
    if (validRatio || naturalAspect) return;
    if (!player) return;
    const sub = player.addListener("sourceLoad", (payload: any) => {
      const track = payload.availableVideoTracks?.[0];
      if (track?.size?.width && track?.size?.height) {
        handleNaturalAspect(track.size.width / track.size.height);
      }
    });
    return () => sub.remove();
  }, [player, validRatio, naturalAspect]);

  useEffect(() => {
    if (Platform.OS !== "web" || validRatio || naturalAspect) return;
    const domNode = containerRef.current as unknown as HTMLElement | null;
    if (!domNode) return;
    const check = () => {
      const video = domNode.querySelector("video");
      if (video && video.videoWidth && video.videoHeight) {
        handleNaturalAspect(video.videoWidth / video.videoHeight);
        return true;
      }
      return false;
    };
    const t = setTimeout(() => check(), 600);
    const id = setInterval(() => { if (check()) clearInterval(id); }, 400);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [validRatio, naturalAspect]);

  useEffect(() => {
    if (!player || isProcessing || !videoUri || !autoPlay) return;
    try {
      player.muted = initialMuted;
      player.play();
    } catch (_) {}
  }, [player, isProcessing, videoUri, initialMuted, autoPlay]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (!player) return;
      if (nextState === "active" && autoPlay && videoUri && !isProcessing) {
        player.muted = true;
        player.play();
      } else if (nextState === "background" || nextState === "inactive") {
        player.pause();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => { sub.remove(); };
  }, [player, autoPlay, videoUri, isProcessing]);

  useEffect(() => {
    setHasError(false);
    clearLoadTimeout();
    if (!videoUri || isProcessing) return;
    loadTimeoutRef.current = setTimeout(() => {
      if (!naturalAspectRef.current && !validRatio) {
        setHasError(true);
      }
    }, 10000);
    return clearLoadTimeout;
  }, [videoUri, isProcessing, validRatio, retryKey]);

  const handleRetry = () => {
    setHasError(false);
    setNaturalAspect(null);
    naturalAspectRef.current = null;
    clearLoadTimeout();
    setRetryKey((k) => k + 1);
  };

  const toggleMute = () => {
    if (!player) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    onMuteChange?.(newMuted);
  };

  const togglePlayPause = () => {
    if (!player) return;
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    togglePlayPause();
  };

  const effectiveStyle: ViewStyle = {
    ...containerStyle,
    aspectRatio: styleHasHeight ? undefined : (validRatio || naturalAspect || 4 / 5),
    maxHeight,
  };

  return (
    <View ref={containerRef} style={[effectiveStyle, style]}>
      {hasError ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={32} color="#fff" />
          <Text style={styles.errorText}>{t("common.videoCannotLoad", "Video kann nicht geladen werden")}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryText}>{t("common.retry", "Wiederholen")}</Text>
          </Pressable>
        </View>
      ) : isProcessing && !coverUrl ? (
        <View style={styles.overlayCenter}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>{t("common.processingVideo", "Video wird verarbeitet...")}</Text>
        </View>
      ) : (
        <>
          {coverUrl && (
            <RNImage
              source={{ uri: coverUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          )}
          {!isProcessing && videoUri ? (
            <VideoPlayerCore
              key={`${videoUri}-${retryKey}`}
              videoUri={videoUri}
              isLooping={isLooping}
              initialMuted={initialMuted}
              resizeMode={resizeMode}
              useNativeControls={useNativeControls}
              onPlayerCreated={setPlayer}
            />
          ) : null}
          <Pressable
            onPress={handlePress}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Play video"
          />
          {showMuteButton && (
            <Pressable style={styles.muteButton} onPress={toggleMute}>
              <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  muteButton: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  processingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 16,
  },
  errorText: {
    color: "#999",
    fontSize: 14,
    marginTop: 8,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    gap: 6,
  },
  retryText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

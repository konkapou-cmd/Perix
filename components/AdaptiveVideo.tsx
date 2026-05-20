import React, { useEffect, useRef, useState } from "react";
import { Dimensions, Pressable, StyleProp, StyleSheet, View, ViewStyle, Text, Image as RNImage, ActivityIndicator } from "react-native";
import { useVideoPlayer, VideoView, VideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";

// ─── Playback coordinator ───────────────────────────────────────
// Ensures only the single best-centered visible video plays at any time.
class PlaybackCoordinator {
  private videos = new Map<string, {
    player: VideoPlayer;
    offset: () => number;
    shouldPlay: () => boolean;
  }>();
  private activeId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private threshold: number;

  constructor() {
    this.threshold = Dimensions.get("window").height * 0.55;
  }

  register(id: string, player: VideoPlayer, offset: () => number, shouldPlay: () => boolean) {
    this.videos.set(id, { player, offset, shouldPlay });
    this.start();
  }

  unregister(id: string) {
    this.videos.delete(id);
    if (this.videos.size === 0) this.stop();
    if (this.activeId === id) this.activeId = null;
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.evaluate(), 300);
  }

  private stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private evaluate() {
    let bestId: string | null = null;
    let bestOffset = Infinity;
    for (const [id, entry] of this.videos) {
      const off = entry.offset();
      if (off < bestOffset) { bestOffset = off; bestId = id; }
    }
    if (bestId === this.activeId) return;
    // Pause previous
    if (this.activeId) {
      try { this.videos.get(this.activeId)?.player.pause(); } catch (_) {}
    }
    this.activeId = null;
    // Play new if close enough to center
    const bestEntry = bestId ? this.videos.get(bestId) : undefined;
    if (bestEntry && bestOffset < this.threshold && bestEntry.shouldPlay()) {
      try { bestEntry.player.play(); } catch (_) {}
      this.activeId = bestId;
    }
  }
}

const coordinator = new PlaybackCoordinator();
let videoIdCounter = 0;
// ────────────────────────────────────────────────────────────────

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
  maxHeight?: number;
  borderRadius?: number;
  onPress?: () => void;
  pauseWhenNotVisible?: boolean;
  useNativeControls?: boolean;
};

const DEFAULT_MAX_HEIGHT = 470;

function isMuxProcessingPlaceholder(url: string): boolean {
  return !!url && url.startsWith("mux://");
}

export default function AdaptiveVideo({
  uri,
  source,
  style,
  isLooping = false,
  ratio,
  autoPlay = false,
  showMuteButton = false,
  initialMuted = false,
  onMuteChange,
  onPlay,
  resizeMode = "cover",
  videoStatus,
  muxThumbnailUrl,
  maxHeight = DEFAULT_MAX_HEIGHT,
  borderRadius = 0,
  onPress,
  pauseWhenNotVisible = false,
  useNativeControls = false,
}: AdaptiveVideoProps) {
  const videoUri = uri || source?.uri || "";
  const isProcessing = videoStatus === "processing" || isMuxProcessingPlaceholder(videoUri);
  const containerRef = useRef<View>(null);
  const shouldPlayRef = useRef(autoPlay);
  const videoIdRef = useRef<string | null>(null);

  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = isLooping;
    p.muted = initialMuted;
    if (autoPlay) p.play();
  });

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(initialMuted);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e) => {
      setIsPlaying(e.isPlaying);
      if (e.isPlaying) onPlay?.();
    });
    return () => sub.remove();
  }, [player, onPlay]);

  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (player) player.loop = isLooping;
  }, [isLooping, player]);

  useEffect(() => {
    if (!pauseWhenNotVisible || !player || isProcessing || !videoUri) return;
    const id = `v${++videoIdCounter}`;
    videoIdRef.current = id;
    const centerRef = { current: Infinity };

    coordinator.register(
      id,
      player,
      () => centerRef.current,
      () => shouldPlayRef.current,
    );

    let mounted = true;
    const measure = () => {
      if (!mounted || !containerRef.current) return;
      containerRef.current.measureInWindow((x, y, w, h) => {
        if (!mounted) return;
        const sh = Dimensions.get("window").height;
        const vt = Math.max(0, y);
        const vb = Math.min(sh, y + h);
        const vh = vb - vt;
        if (vh < h * 0.5) { centerRef.current = Infinity; return; }
        const vc = y + h / 2;
        const sc = sh / 2;
        centerRef.current = Math.abs(vc - sc);
      });
    };
    const interval = setInterval(measure, 300);
    measure();
    return () => {
      coordinator.unregister(id);
      mounted = false;
      clearInterval(interval);
    };
  }, [pauseWhenNotVisible, player, isProcessing, videoUri]);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    onMuteChange?.(newMuted);
  };

  const togglePlayPause = () => {
    shouldPlayRef.current = !isPlaying;
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

  const containerStyle: ViewStyle = {
    aspectRatio: ratio || 16 / 9,
    maxHeight,
    borderRadius,
    overflow: "hidden",
    backgroundColor: "#111827",
  };

  if (isProcessing) {
    const thumbUri = muxThumbnailUrl || null;
    return (
      <View ref={containerRef} style={[containerStyle, style]}>
        {thumbUri && <RNImage source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>Processing video...</Text>
        </View>
      </View>
    );
  }

  if (!videoUri) {
    return <View ref={containerRef} style={[containerStyle, style]} />;
  }

  const videoContent = (
    <View ref={containerRef} style={[containerStyle, style]}>
      {player && (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={resizeMode}
          nativeControls={useNativeControls}
        />
      )}
      {showMuteButton && (
        <Pressable style={styles.muteButton} onPress={toggleMute}>
          <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </Pressable>
      )}
      {!isPlaying && (
        <Pressable style={styles.playPauseOverlay} onPress={handlePress}>
          <View style={styles.playButton}>
            <Ionicons name="play" size={40} color="#fff" />
          </View>
        </Pressable>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Play video">
        {videoContent}
      </Pressable>
    );
  }

  return videoContent;
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
  playPauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 40,
    padding: 10,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    gap: 8,
  },
  processingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

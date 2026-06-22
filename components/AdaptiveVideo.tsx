import React, { useEffect, useState, useRef } from "react";
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle, Text, Image as RNImage, ActivityIndicator } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";

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

const DEFAULT_MAX_HEIGHT = 470;

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
  showMuteButton = false,
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
  const videoUri = uri || source?.uri || "";
  const isProcessing = videoStatus === "processing" || isMuxProcessingPlaceholder(videoUri);
  const [playerActive, setPlayerActive] = useState(autoPlay || false);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverRatio, setCoverRatio] = useState<number | null>(ratio || null);

  useEffect(() => {
    setCoverFailed(false);
  }, [coverPhoto, videoUri]);

  const coverUrl = coverPhoto || muxThumbnailUrl || getMuxThumbnail(videoUri);

  const containerStyle: ViewStyle = {
    aspectRatio: ratio || coverRatio || 16 / 9,
    maxHeight,
    borderRadius,
    overflow: "hidden",
    backgroundColor: "#111827",
  };

  if (isProcessing) {
    const thumbUri = muxThumbnailUrl || null;
    return (
      <View style={[containerStyle, style]}>
        {thumbUri && <RNImage source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View style={styles.overlayCenter}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>Processing video...</Text>
        </View>
      </View>
    );
  }

  if (!videoUri) {
    return <View style={[containerStyle, style]} />;
  }

  if (!playerActive) {
    return (
      <Pressable
        onPress={() => setPlayerActive(true)}
        accessibilityRole="button"
        accessibilityLabel="Play video"
        style={[containerStyle, style]}
      >
        {coverUrl && !coverFailed ? (
          <RNImage
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setCoverFailed(true)}
            onLoad={(e: any) => {
              const s = e.nativeEvent?.source;
              if (!ratio && s?.width && s?.height) {
                setCoverRatio(s.width / s.height);
              }
            }}
          />
        ) : null}
        <View style={styles.overlayCenter}>
          <View style={styles.playCircle}>
            <Ionicons name="play" size={36} color="#fff" />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <PlayerCore
      videoUri={videoUri}
      isProcessing={isProcessing}
      isLooping={isLooping}
      initialMuted={initialMuted}
      showMuteButton={showMuteButton}
      resizeMode={resizeMode}
      useNativeControls={useNativeControls}
      ratio={ratio}
      onMuteChange={onMuteChange}
      onPlay={onPlay}
      onPress={onPress}
      containerStyle={containerStyle}
      style={style}
    />
  );
}

// ─── Inner player — only mounted after first play tap ───

type PlayerCoreProps = {
  videoUri: string;
  isProcessing: boolean;
  isLooping: boolean;
  initialMuted: boolean;
  showMuteButton: boolean;
  resizeMode: "contain" | "cover";
  useNativeControls: boolean;
  ratio?: number;
  onMuteChange?: (muted: boolean) => void;
  onPlay?: () => void;
  onPress?: () => void;
  containerStyle: ViewStyle;
  style?: StyleProp<ViewStyle>;
};

function PlayerCore({
  videoUri,
  isProcessing,
  isLooping,
  initialMuted,
  showMuteButton,
  resizeMode,
  useNativeControls,
  ratio,
  onMuteChange,
  onPlay,
  onPress,
  containerStyle,
  style,
}: PlayerCoreProps) {
  const player = useVideoPlayer(videoUri || null, (p) => {
    p.loop = isLooping;
    p.muted = initialMuted;
  });

  const containerRef = useRef<View>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(ratio || null);
  const playedRef = useRef(false);

  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  useEffect(() => {
    if (player) player.loop = isLooping;
  }, [isLooping, player]);

  useEffect(() => {
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
    return () => { try { player.pause(); } catch (_) {} };
  }, [player]);

  useEffect(() => {
    if (ratio || naturalAspect) return;
    const sub = player.addListener("sourceLoad", (payload: any) => {
      const track = payload.availableVideoTracks?.[0];
      if (track?.size?.width && track?.size?.height) {
        setNaturalAspect(track.size.width / track.size.height);
      }
    });
    return () => sub.remove();
  }, [player, ratio]);

  useEffect(() => {
    if (Platform.OS !== "web" || ratio || naturalAspect) return;
    const domNode = containerRef.current as unknown as HTMLElement | null;
    if (!domNode) return;
    const check = () => {
      const video = domNode.querySelector("video");
      if (video && video.videoWidth && video.videoHeight) {
        setNaturalAspect(video.videoWidth / video.videoHeight);
        return true;
      }
      return false;
    };
    const t = setTimeout(() => check(), 600);
    const id = setInterval(() => { if (check()) clearInterval(id); }, 400);
    return () => { clearTimeout(t); clearInterval(id); };
  }, [ratio, naturalAspect]);

  useEffect(() => {
    if (!player || isProcessing || !videoUri) return;
    const t = setTimeout(() => {
      try {
        player.muted = initialMuted;
        player.play();
      } catch (_) {}
    }, 200);
    return () => clearTimeout(t);
  }, [player, isProcessing, videoUri, initialMuted]);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    onMuteChange?.(newMuted);
  };

  const togglePlayPause = () => {
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
    aspectRatio: ratio || naturalAspect || containerStyle.aspectRatio,
  };

  return (
    <Pressable onPress={handlePress} accessibilityRole="button" accessibilityLabel="Play video">
      <View ref={containerRef} style={[effectiveStyle, style, { position: "relative" }]}>
        {player && (
          <VideoView
            player={player}
            style={{ width: "100%", height: "100%" }}
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
          <View style={styles.overlayCenter}>
            <View style={styles.playCircle}>
              <Ionicons name="play" size={36} color="#fff" />
            </View>
          </View>
        )}
      </View>
    </Pressable>
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
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  processingText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

import React, { useEffect, useState, useRef } from "react";
import { AppState, AppStateStatus, Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle, Text, Image as RNImage, ActivityIndicator } from "react-native";
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
  const videoUri = uri || source?.uri || "";
  const isProcessing = videoStatus === "processing" || isMuxProcessingPlaceholder(videoUri);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverRatio, setCoverRatio] = useState<number | null>(ratio || null);
  const containerRef = useRef<View>(null);
  const playedRef = useRef(false);
  const player = useVideoPlayer(isProcessing ? null : videoUri, (p) => {
    p.loop = isLooping;
    p.muted = initialMuted;
  });

  useEffect(() => {
    setCoverFailed(false);
  }, [coverPhoto, videoUri]);

  useEffect(() => {
    if (!player || autoPlay) return;
    player.muted = true;
    player.pause();
  }, [autoPlay, player]);

  const coverUrl = coverPhoto || muxThumbnailUrl || getMuxThumbnail(videoUri);

  const styleHasHeight = !!(style && typeof style === 'object' && 'height' in style);

  const containerStyle: ViewStyle = {
    width: "100%",
    aspectRatio: styleHasHeight ? undefined : (ratio || 16 / 9),
    maxHeight,
    overflow: "hidden",
    backgroundColor: "transparent",
  };

  useEffect(() => {
    if (!coverUrl || ratio) return;
    RNImage.getSize(
      coverUrl,
      (w, h) => { setCoverRatio(w / h); },
      () => {}
    );
  }, [coverUrl, ratio]);

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
    aspectRatio: styleHasHeight ? undefined : (ratio || naturalAspect || 16 / 9),
    maxHeight,
  };

  return (
    <View ref={containerRef} style={[effectiveStyle, style]}>
      {coverUrl && (
        <RNImage
          source={{ uri: coverUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      {player && (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={resizeMode}
          nativeControls={useNativeControls}
        />
      )}
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
  },
});

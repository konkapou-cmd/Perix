import React, { useEffect, useRef, useState, useCallback } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle, Platform, Linking, Text, Image as RNImage, Dimensions, ActivityIndicator } from "react-native";
import { AVPlaybackStatus, Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";

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
  useNativeControls?: boolean;
  resizeMode?: ResizeMode | string;
  pauseWhenNotVisible?: boolean;
  videoStatus?: string | null;
  muxThumbnailUrl?: string | null;
  maxHeight?: number;
  borderRadius?: number;
  onPress?: () => void;
};

const DEFAULT_MAX_HEIGHT = 470;

function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\s?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function isMuxUrl(url: string): boolean {
  return !!url && (url.includes('stream.mux.com') || url.includes('mux.com'));
}

function isMuxProcessingPlaceholder(url: string): boolean {
  return !!url && url.startsWith('mux://');
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
  useNativeControls = false,
  resizeMode,
  pauseWhenNotVisible = true,
  videoStatus,
  muxThumbnailUrl,
  maxHeight = DEFAULT_MAX_HEIGHT,
  borderRadius = 0,
  onPress,
}: AdaptiveVideoProps) {
  const videoUri = uri || source?.uri || "";
  const videoRef = useRef<Video>(null);
  const containerRef = useRef<View>(null);
  const [aspectRatio, setAspectRatio] = useState(ratio || 16 / 9);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showYouTubePlayer, setShowYouTubePlayer] = useState(false);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);

  const youtubeVideoId = getYouTubeVideoId(videoUri);
  const isYouTube = isYouTubeUrl(videoUri) || !!youtubeVideoId;
  const isProcessing = videoStatus === "processing" || isMuxProcessingPlaceholder(videoUri);

  const checkVisibility = useCallback(() => {
    if (!containerRef.current || !pauseWhenNotVisible) return;
    containerRef.current.measureInWindow((x, y, width, height) => {
      const screenHeight = Dimensions.get('window').height;
      const visibleTop = Math.max(0, y);
      const visibleBottom = Math.min(screenHeight, y + height);
      const visibleHeight = visibleBottom - visibleTop;
      setIsVisible(visibleHeight > height * 0.5);
    });
  }, [pauseWhenNotVisible]);

  useEffect(() => {
    if (!autoPlay || !pauseWhenNotVisible || isYouTube) return;
    if (isVisible && videoRef.current && hasPlaybackStarted) {
      videoRef.current.playAsync();
    } else if (!isVisible && videoRef.current) {
      videoRef.current.pauseAsync();
    }
  }, [isVisible, autoPlay, pauseWhenNotVisible, isYouTube, hasPlaybackStarted]);

  useEffect(() => { if (ratio) setAspectRatio(ratio); }, [ratio]);
  useEffect(() => { setIsMuted(initialMuted); }, [initialMuted]);

  const handleLoad = async (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const statusAny = status as any;
    const natural = statusAny.naturalSize as { width?: number; height?: number };
    if (natural?.width && natural?.height) {
      setAspectRatio(natural.width / natural.height);
    } else {
      const orientation = statusAny.naturalSize?.orientation;
      if (orientation === "portrait") setAspectRatio(9 / 16);
    }
    if (videoRef.current) await videoRef.current.setIsMutedAsync(isMuted);
    setHasPlaybackStarted(true);
    if (autoPlay && isVisible && videoRef.current) {
      try {
        await videoRef.current.playAsync();
        setIsPlaying(true);
        onPlay?.();
      } catch (error) {
        console.log("Auto-play failed:", error);
      }
    }
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      const wasPlaying = isPlaying;
      setIsPlaying(status.isPlaying);
      if (status.isPlaying && !wasPlaying) onPlay?.();
    }
  };

  const toggleMute = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    onMuteChange?.(newMuted);
    if (videoRef.current) await videoRef.current.setIsMutedAsync(newMuted);
  };

  const togglePlayPause = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
        setHasPlaybackStarted(true);
      }
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (autoPlay) {
      togglePlayPause();
    }
  };

  const effectiveResizeMode = (resizeMode as ResizeMode) || ResizeMode.COVER;

  const containerStyle: ViewStyle = {
    aspectRatio,
    maxHeight,
    borderRadius,
    overflow: "hidden",
    backgroundColor: "#111827",
  };

  if (isProcessing) {
    const thumbUri = muxThumbnailUrl || null;
    return (
      <View
        ref={containerRef}
        style={[containerStyle, style]}
        onLayout={checkVisibility}
      >
        {thumbUri ? (
          <RNImage source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : null}
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>Processing video...</Text>
        </View>
      </View>
    );
  }

  if (isYouTube && youtubeVideoId) {
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
    const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&rel=0`;
    const youtubeAppUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

    if (Platform.OS === 'web' && showYouTubePlayer) {
      return (
        <View style={[containerStyle, style]}>
          <iframe src={youtubeEmbedUrl} style={{ width: '100%', height: '100%', border: 'none' }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
          <Pressable style={styles.closeButton} onPress={() => setShowYouTubePlayer(false)}>
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable
        ref={containerRef}
        style={[containerStyle, style]}
        onLayout={checkVisibility}
        onPress={() => {
          if (Platform.OS === 'web') setShowYouTubePlayer(true);
          else Linking.openURL(youtubeAppUrl);
        }}
      >
        <RNImage source={{ uri: thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.youtubeOverlay}>
          <View style={styles.youtubePlayButton}>
            <Ionicons name="logo-youtube" size={50} color="#ff0000" />
          </View>
          <Text style={styles.youtubeBadge}>YouTube</Text>
        </View>
      </Pressable>
    );
  }

  const videoContent = (
    <View
      ref={containerRef}
      style={[containerStyle, style]}
      onLayout={checkVisibility}
    >
      <Video
        ref={videoRef}
        source={{ uri: videoUri }}
        style={StyleSheet.absoluteFill}
        useNativeControls={useNativeControls || !autoPlay}
        resizeMode={effectiveResizeMode}
        isLooping={isLooping}
        isMuted={isMuted}
        shouldPlay={autoPlay && isVisible && hasPlaybackStarted}
        onLoad={handleLoad}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
      />
      {showMuteButton && (
        <Pressable style={styles.muteButton} onPress={toggleMute}>
          <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
        </Pressable>
      )}
      {!isPlaying && hasPlaybackStarted && autoPlay && (
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
  youtubeOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  youtubePlayButton: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 50,
    padding: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  youtubeBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#ff0000",
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
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
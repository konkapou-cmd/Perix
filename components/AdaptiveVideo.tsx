import React, { useEffect, useRef, useState, useCallback } from "react";
import { Pressable, StyleProp, StyleSheet, View, ViewStyle, Platform, Linking, Text, Image as RNImage, Dimensions } from "react-native";
import { AVPlaybackStatus, Video, ResizeMode } from "expo-av";
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
  useNativeControls?: boolean;
  resizeMode?: ResizeMode | string;
  pauseWhenNotVisible?: boolean; // New prop for visibility-based playback
};

// Helper function to extract YouTube video ID from various URL formats
function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\s?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/, // Just the video ID
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Check if URL is a YouTube URL
function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  return url.includes('youtube.com') || url.includes('youtu.be');
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
  useNativeControls = false,
  resizeMode,
  pauseWhenNotVisible = true,
}: AdaptiveVideoProps) {
  const videoUri = uri || source?.uri || "";
  const videoRef = useRef<Video>(null);
  const containerRef = useRef<View>(null);
  const [aspectRatio, setAspectRatio] = useState(ratio || 16 / 9);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [showYouTubePlayer, setShowYouTubePlayer] = useState(false);

  // Check if this is a YouTube video
  const youtubeVideoId = getYouTubeVideoId(videoUri);
  const isYouTube = isYouTubeUrl(videoUri) || !!youtubeVideoId;

  // Handle visibility detection for autoplay/pause
  const checkVisibility = useCallback(() => {
    if (!containerRef.current || !pauseWhenNotVisible) return;
    
    containerRef.current.measureInWindow((x, y, width, height) => {
      const screenHeight = Dimensions.get('window').height;
      // Consider visible if at least 50% of video is on screen
      const visibleTop = Math.max(0, y);
      const visibleBottom = Math.min(screenHeight, y + height);
      const visibleHeight = visibleBottom - visibleTop;
      const isNowVisible = visibleHeight > height * 0.5;
      
      setIsVisible(isNowVisible);
    });
  }, [pauseWhenNotVisible]);

  // Control playback based on visibility
  useEffect(() => {
    if (!autoPlay || !pauseWhenNotVisible || isYouTube) return;
    
    if (isVisible && videoRef.current) {
      videoRef.current.playAsync();
    } else if (!isVisible && videoRef.current) {
      videoRef.current.pauseAsync();
    }
  }, [isVisible, autoPlay, pauseWhenNotVisible, isYouTube]);

  useEffect(() => {
    if (ratio) {
      setAspectRatio(ratio);
    }
  }, [ratio]);

  useEffect(() => {
    setIsMuted(initialMuted);
  }, [initialMuted]);

  const handleLoad = async (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const statusAny = status as any;
    const natural = statusAny.naturalSize as { width?: number; height?: number };
    if (natural?.width && natural?.height) {
      setAspectRatio(natural.width / natural.height);
    } else {
      const orientation = statusAny.naturalSize?.orientation;
      if (orientation === "portrait") {
        setAspectRatio(9 / 16);
      }
    }
    
    // Explicitly set mute state on load to ensure audio plays correctly
    if (videoRef.current) {
      await videoRef.current.setIsMutedAsync(isMuted);
    }
    
    // Auto-play if enabled
    if (autoPlay && videoRef.current) {
      try {
        await videoRef.current.playAsync();
        setIsPlaying(true);
      } catch (error) {
        console.log("Auto-play failed:", error);
      }
    }
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setIsPlaying(status.isPlaying);
    }
  };

  const toggleMute = async () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    onMuteChange?.(newMuted);
    if (videoRef.current) {
      await videoRef.current.setIsMutedAsync(newMuted);
    }
  };

  const togglePlayPause = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
    }
  };

  // YouTube video rendering
  if (isYouTube && youtubeVideoId) {
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`;
    const youtubeEmbedUrl = `https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1&rel=0`;
    const youtubeAppUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

    // For web, show embedded iframe player
    if (Platform.OS === 'web' && showYouTubePlayer) {
      return (
        <View style={[styles.container, style, { aspectRatio: 16/9 }]}>
          <iframe
            src={youtubeEmbedUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <Pressable 
            style={styles.closeButton} 
            onPress={() => setShowYouTubePlayer(false)}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
      );
    }

    // Show thumbnail with play button
    return (
      <View style={[styles.container, style, { aspectRatio: 16/9 }]}>
        <RNImage
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <View style={styles.youtubeOverlay}>
          <Pressable 
            style={styles.youtubePlayButton}
            onPress={() => {
              if (Platform.OS === 'web') {
                setShowYouTubePlayer(true);
              } else {
                Linking.openURL(youtubeAppUrl);
              }
            }}
          >
            <Ionicons name="logo-youtube" size={50} color="#ff0000" />
          </Pressable>
          <Text style={styles.youtubeBadge}>YouTube</Text>
        </View>
      </View>
    );
  }

  // Regular video rendering
  return (
    <View 
      ref={containerRef}
      style={[styles.container, style, { aspectRatio }]}
      onLayout={checkVisibility}
    > 
      <Video
        ref={videoRef}
        source={{ uri: videoUri }}
        style={StyleSheet.absoluteFill}
        useNativeControls={useNativeControls || !autoPlay}
        resizeMode={(resizeMode as ResizeMode) || ResizeMode.CONTAIN}
        isLooping={isLooping}
        isMuted={isMuted}
        shouldPlay={autoPlay && isVisible}
        onLoad={handleLoad}
        onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
      />
      {showMuteButton && (
        <Pressable style={styles.muteButton} onPress={toggleMute}>
          <Ionicons 
            name={isMuted ? "volume-mute" : "volume-high"} 
            size={20} 
            color="#fff" 
          />
        </Pressable>
      )}
      {autoPlay && (
        <Pressable style={styles.playPauseOverlay} onPress={togglePlayPause}>
          {!isPlaying && (
            <View style={styles.playButton}>
              <Ionicons name="play" size={40} color="#fff" />
            </View>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111827",
    overflow: "hidden",
  },
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
});
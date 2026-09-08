/**
 * AdaptiveVideo — Web implementation.
 * Uses the official Mux Player (@mux/mux-player) for Mux videos — the same
 * battle-tested player used by major sites, stable across Chrome/Brave/Edge/Safari.
 * Falls back to a plain <video> for non-Mux URLs and to an animated GIF
 * preview if playback cannot start (strict autoplay policies).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image as RNImage,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import MuxPlayer from "@mux/mux-player-react";

type AdaptiveVideoWebProps = {
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
  muxPlaybackId?: string | null;
  maxHeight?: number;
  borderRadius?: number;
  onPress?: () => void;
  useNativeControls?: boolean;
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DEFAULT_MAX_HEIGHT = SCREEN_HEIGHT * 0.75;

function getMuxThumbnail(uri: string): string | null {
  const match = uri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  return match ? `https://image.mux.com/${match[1]}/thumbnail.jpg` : null;
}

function extractPlaybackId(uri: string): string | null {
  const match = uri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function isProcessingUrl(url: string): boolean {
  return !!url && !/^(https?|blob|data):/i.test(url);
}

export default function AdaptiveVideoWeb({
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
  muxPlaybackId: muxPlaybackIdProp,
  maxHeight = DEFAULT_MAX_HEIGHT,
  borderRadius = 0,
  onPress,
  useNativeControls = false,
}: AdaptiveVideoWebProps) {
  const { t } = useTranslation();
  const videoUri = uri || source?.uri || "";
  const isProcessing = isProcessingUrl(videoUri);
  const playbackId = muxPlaybackIdProp || extractPlaybackId(videoUri);

  const validRatio = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : null;

  const playerRef = useRef<any>(null);
  const nativeVideoRef = useRef<HTMLVideoElement | null>(null);
  const playedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [useGifFallback, setUseGifFallback] = useState(false);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const gifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const coverUrl = coverPhoto || muxThumbnailUrl || getMuxThumbnail(videoUri);
  const gifUrl = coverUrl ? coverUrl.replace(/\/thumbnail\.jpg.*$/, "/animated.gif?width=1280") : null;
  const styleHasHeight = !!(style && typeof style === "object" && "height" in style);
  const aspectRatio = styleHasHeight ? undefined : validRatio || naturalAspect || 4 / 5;

  useEffect(() => {
    playedRef.current = false;
    setFailed(false);
    setUseGifFallback(false);
    setNaturalAspect(null);
    setIsPlaying(false);
    if (gifTimerRef.current) clearTimeout(gifTimerRef.current);
  }, [videoUri]);

  useEffect(() => {
    if (isProcessing || !videoUri || !coverUrl || playbackId === null) return;
    if (gifTimerRef.current) clearTimeout(gifTimerRef.current);
    gifTimerRef.current = setTimeout(() => {
      if (!playedRef.current && !failed) {
        setUseGifFallback(true);
      }
    }, 8000);
    return () => {
      if (gifTimerRef.current) clearTimeout(gifTimerRef.current);
    };
  }, [videoUri, isProcessing, failed, coverUrl, playbackId]);

  useEffect(() => {
    try {
      if (playerRef.current) playerRef.current.muted = isMuted;
      if (nativeVideoRef.current) nativeVideoRef.current.muted = isMuted;
    } catch (e) {}
  }, [isMuted]);

  const handlePlayEvent = () => {
    setIsPlaying(true);
    if (!playedRef.current) {
      playedRef.current = true;
      setUseGifFallback(false);
      onPlay?.();
    }
  };

  const togglePlay = () => {
    const el = playerRef.current || nativeVideoRef.current;
    if (!el) return;
    try {
      if (el.paused) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    } catch (e) {}
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    onMuteChange?.(next);
  };

  const playWithGesture = () => {
    setUseGifFallback(false);
    const el = playerRef.current || nativeVideoRef.current;
    if (el) {
      try {
        el.muted = isMuted;
        el.play().catch(() => {});
      } catch (e) {}
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    togglePlay();
  };

  const attachPlayerRef = (el: any) => {
    if (el && playerRef.current !== el) {
      playerRef.current = el;
      el.addEventListener("playing", handlePlayEvent);
      el.addEventListener("pause", () => setIsPlaying(false));
      el.addEventListener("ended", () => setIsPlaying(false));
      el.addEventListener("error", () => {
        if (!playbackId) setFailed(true);
      });
    }
  };

  const muxStyle: any = {
    width: "100%",
    height: "100%",
    display: useGifFallback ? "none" : "block",
    "--media-object-fit": resizeMode,
    backgroundColor: "#000",
  };

  return (
    <View style={[styles.container, { aspectRatio, maxHeight, borderRadius }, style]}>
      {useGifFallback && gifUrl && !failed ? (
        <View style={styles.center}>
          <RNImage source={{ uri: gifUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          <View style={styles.dim}>
            <Text style={styles.errText}>{t("common.videoGifPreview", "Vorschau (ohne Ton)")}</Text>
            <Pressable style={styles.retryBtn} onPress={playWithGesture}>
              <Ionicons name="play" size={16} color="#fff" />
              <Text style={styles.retryText}>{t("common.playVideo", "Video abspielen")}</Text>
            </Pressable>
          </View>
        </View>
      ) : failed ? (
        <View style={styles.center}>
          {gifUrl ? (
            <RNImage source={{ uri: gifUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          ) : (
            <Ionicons name="alert-circle-outline" size={32} color="#999" />
          )}
          <View style={styles.dim}>
            <Text style={styles.errText}>{t("common.videoCannotLoad", "Video kann nicht geladen werden")}</Text>
            <Pressable style={styles.retryBtn} onPress={playWithGesture}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryText}>{t("common.retry", "Wiederholen")}</Text>
            </Pressable>
          </View>
        </View>
      ) : isProcessing ? (
        <View style={styles.center}>
          {coverUrl ? <RNImage source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" /> : null}
          <View style={styles.dim}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.errText}>{t("common.processingVideo", "Video wird verarbeitet...")}</Text>
          </View>
        </View>
      ) : (
        <>
          {coverUrl && !isPlaying && !useGifFallback ? (
            <RNImage source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : null}
          {videoUri && playbackId ? (
            <MuxPlayer
              ref={attachPlayerRef}
              playbackId={playbackId}
              muted={isMuted}
              loop={isLooping}
              autoPlay={autoPlay}
              playsInline
              streamType="on-demand"
              style={muxStyle}
            />
          ) : videoUri ? (
            React.createElement("video", {
              ref: (el: HTMLVideoElement | null) => {
                nativeVideoRef.current = el;
                if (el) {
                  el.muted = isMuted;
                  el.playsInline = true;
                  el.loop = isLooping;
                  el.controls = useNativeControls;
                  try {
                    el.src = videoUri;
                  } catch (e) {}
                  if (autoPlay) el.play().catch(() => {});
                  el.onplay = handlePlayEvent;
                  el.onplaying = handlePlayEvent;
                  el.onpause = () => setIsPlaying(false);
                  el.onerror = () => setFailed(true);
                  el.onloadedmetadata = () => {
                    if (el.videoWidth && el.videoHeight) {
                      setNaturalAspect(el.videoWidth / el.videoHeight);
                    }
                  };
                }
              },
              playsInline: true,
              autoPlay,
              style: {
                width: "100%",
                height: "100%",
                objectFit: resizeMode as any,
                backgroundColor: "#000",
                opacity: useGifFallback ? 0 : 1,
              },
            })
          ) : null}
          {!useNativeControls && !useGifFallback && (
            <Pressable onPress={handlePress} style={StyleSheet.absoluteFill} />
          )}
          {!isPlaying && !failed && !useGifFallback && (
            <Pressable style={styles.playBigBtn} onPress={handlePress}>
              <Ionicons name="play" size={34} color="#fff" />
            </Pressable>
          )}
          {showMuteButton && !useNativeControls && !useGifFallback && (
            <Pressable style={styles.muteBtn} onPress={toggleMute}>
              <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  dim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  errText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  retryText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  muteBtn: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  playBigBtn: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -34,
    marginLeft: -34,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 11,
  },
});

/**
 * AdaptiveVideo — Web implementation.
 * Uses the native <video> element with hls.js for Mux HLS streams
 * (expo-video's web player can't play .m3u8 in Chrome).
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
import Hls from "hls.js";

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
  maxHeight = DEFAULT_MAX_HEIGHT,
  borderRadius = 0,
  onPress,
  useNativeControls = false,
}: AdaptiveVideoWebProps) {
  const { t } = useTranslation();
  const videoUri = uri || source?.uri || "";
  const isProcessing = videoStatus === "processing" || videoStatus === "uploading" || isProcessingUrl(videoUri);
  const validRatio = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);

  const coverUrl = coverPhoto || muxThumbnailUrl || getMuxThumbnail(videoUri);
  const styleHasHeight = !!(style && typeof style === "object" && "height" in style);
  const aspectRatio = styleHasHeight ? undefined : validRatio || naturalAspect || 4 / 5;

  useEffect(() => {
    playedRef.current = false;
    setFailed(false);
    setNaturalAspect(null);
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch (e) {}
      hlsRef.current = null;
    }
  }, [videoUri]);

  const attachSource = (el: HTMLVideoElement) => {
    if (!videoUri || isProcessing) return;
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch (e) {}
      hlsRef.current = null;
    }
    try {
      if (videoUri.includes(".m3u8") && Hls.isSupported()) {
        const hls = new Hls({ maxBufferLength: 30, enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data || !data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Manifest may still be publishing on Mux — retry with backoff
            retryCountRef.current += 1;
            if (retryCountRef.current > 12) {
              setFailed(true);
              return;
            }
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(() => {
              try { hls.startLoad(); } catch (e) {}
            }, 3000);
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError(); } catch (e) {
              setFailed(true);
            }
            return;
          }
          setFailed(true);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          retryCountRef.current = 0;
        });
        hls.loadSource(videoUri);
        hls.attachMedia(el);
      } else {
        el.src = videoUri;
      }
    } catch (e) {
      console.error("AdaptiveVideo.web attach failed:", e);
      setFailed(true);
    }
  };

  useEffect(() => {
    const el = videoRef.current;
    if (el && !isProcessing && !failed) {
      attachSource(el);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUri, retryKey, isProcessing]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (e) {}
        hlsRef.current = null;
      }
    };
  }, []);

  const handleRetry = () => {
    retryCountRef.current = 0;
    setFailed(false);
    setRetryKey((k) => k + 1);
  };

  useEffect(() => {
    if (isPlaying) return;
    if (autoPlay && !isProcessing && !failed && videoUri) {
      try { videoRef.current?.play().catch(() => {}); } catch (e) {}
    }
  }, [autoPlay, isProcessing, failed, videoUri, isPlaying]);

  const handlePlayEvent = () => {
    setIsPlaying(true);
    if (!playedRef.current) {
      playedRef.current = true;
      onPlay?.();
    }
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    onMuteChange?.(next);
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    togglePlay();
  };

  const videoProps: any = {
    ref: (el: HTMLVideoElement | null) => {
      videoRef.current = el;
    },
    playsInline: true,
    muted: isMuted,
    autoPlay,
    loop: isLooping,
    controls: useNativeControls,
    style: {
      width: "100%",
      height: "100%",
      objectFit: resizeMode as any,
      backgroundColor: "#000",
    },
    onPlay: handlePlayEvent,
    onPlaying: handlePlayEvent,
    onPause: () => setIsPlaying(false),
    onError: () => setFailed(true),
    onLoadedMetadata: (e: any) => {
      const el = e?.target as HTMLVideoElement | null;
      if (el && el.videoWidth && el.videoHeight) {
        setNaturalAspect(el.videoWidth / el.videoHeight);
      }
    },
  };

  return (
    <View style={[styles.container, { aspectRatio, maxHeight, borderRadius }, style]}>
      {failed ? (
        <View style={styles.center}>
          {coverUrl ? (
            <RNImage source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <Ionicons name="alert-circle-outline" size={32} color="#999" />
          )}
          <View style={styles.dim}>
            <Text style={styles.errText}>{t("common.videoCannotLoad", "Video kann nicht geladen werden")}</Text>
            <Pressable style={styles.retryBtn} onPress={handleRetry}>
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryText}>{t("common.retry", "Wiederholen")}</Text>
            </Pressable>
          </View>
        </View>
      ) : isProcessing ? (
        <View style={styles.center}>
          {coverUrl ? <RNImage source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.dim}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.errText}>{t("common.processingVideo", "Video wird verarbeitet...")}</Text>
          </View>
        </View>
      ) : (
        <>
          {coverUrl && (
            <RNImage source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {videoUri ? React.createElement("video", videoProps) : null}
          <Pressable onPress={handlePress} style={StyleSheet.absoluteFill} />
          {showMuteButton && !useNativeControls && (
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
});

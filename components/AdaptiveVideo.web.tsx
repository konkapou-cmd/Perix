/**
 * AdaptiveVideo — Web implementation.
 * Plain <video> + hls.js, managed imperatively (no custom elements, no React
 * churn). Plays Mux HLS directly — verified working in the target browsers.
 * Falls back to an animated GIF preview if playback cannot start.
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
  muxPlaybackId?: string | null;
  maxHeight?: number;
  borderRadius?: number;
  onPress?: () => void;
  useNativeControls?: boolean;
  fitPolicy?: "auto" | "cover" | "contain";
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
  maxHeight = DEFAULT_MAX_HEIGHT,
  borderRadius = 0,
  onPress,
  useNativeControls = false,
  fitPolicy,
}: AdaptiveVideoWebProps) {
  const { t } = useTranslation();
  const videoUri = uri || source?.uri || "";
  const isProcessing = isProcessingUrl(videoUri);
  const playbackId = extractPlaybackId(videoUri);

  const validRatio = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [useGifFallback, setUseGifFallback] = useState(false);
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null);
  const gifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const coverUrl = coverPhoto || muxThumbnailUrl || getMuxThumbnail(videoUri);
  const gifUrl = coverUrl ? coverUrl.replace(/\/thumbnail\.jpg.*$/, "/animated.gif?width=1280") : null;
  const styleHasHeight = !!(style && typeof style === "object" && "height" in style);
  const aspectRatio = styleHasHeight ? undefined : validRatio || naturalAspect || 4 / 5;

  const vwNow = typeof window !== "undefined" ? window.innerWidth : 400;
  const vhNow = typeof window !== "undefined" ? window.innerHeight : 800;
  // Smart fit for full-screen contexts: cover only when the video and screen
  // orientations match AND their shapes are close (no visible cropping);
  // contain otherwise (unknown → contain, never zoom).
  let effectiveFit: "cover" | "contain" = resizeMode;
  if (fitPolicy === "auto") {
    const screenPortrait = vhNow > vwNow;
    if (naturalAspect && naturalAspect > 0) {
      const videoPortrait = naturalAspect < 1;
      const screenAspect = vwNow / Math.max(vhNow, 1);
      const diff = Math.abs(screenAspect - naturalAspect) / Math.min(screenAspect, naturalAspect);
      effectiveFit = screenPortrait === videoPortrait && diff <= 0.12 ? "cover" : "contain";
    } else {
      effectiveFit = "contain";
    }
  }

  // Keep measuring the real video aspect until metadata is available
  // (MSE/hls sometimes reports 0 on the first loadedmetadata).
  useEffect(() => {
    if (!videoUri || naturalAspect) return;
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      const v = videoRef.current;
      if (v && v.videoWidth && v.videoHeight) {
        setNaturalAspect(v.videoWidth / v.videoHeight);
        clearInterval(id);
      } else if (tries > 20) {
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, [videoUri, naturalAspect]);

  // Debug: report the rendered box + intrinsic video size for the badge.
  const [debugBox, setDebugBox] = useState<{ bw: number; bh: number; iw: number; ih: number } | null>(null);
  useEffect(() => {
    if (fitPolicy !== "auto") return;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v) {
        setDebugBox({ bw: v.clientWidth, bh: v.clientHeight, iw: v.videoWidth, ih: v.videoHeight });
      }
    }, 500);
    return () => clearInterval(id);
  }, [fitPolicy]);

  // When the video is letterboxed in a full-screen box (portrait video on a
  // landscape screen, or vice versa), fill the empty space with a blurred,
  // darkened copy of the cover so the screen never looks "broken".
  const showBlurBackdrop =
    fitPolicy === "auto" && effectiveFit === "contain" && styleHasHeight && !!coverUrl;

  // Re-evaluate the smart fit when the screen rotates or is resized.
  const [, forceFitTick] = useState(0);
  useEffect(() => {
    if (fitPolicy !== "auto") return;
    const onResize = () => forceFitTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [fitPolicy]);

  // (Re)attach source whenever the URI changes — fully imperative, no per-render props
  useEffect(() => {
    playedRef.current = false;
    setHasStarted(false);
    setFailed(false);
    setUseGifFallback(false);
    setNaturalAspect(null);
    setIsPlaying(false);
    if (gifTimerRef.current) clearTimeout(gifTimerRef.current);
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch (e) {}
      hlsRef.current = null;
    }

    const el = videoRef.current;
    if (!el || !videoUri || isProcessing) return;

    if (videoUri.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, enableWorker: false });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad(); } catch (e) {}
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
      hls.loadSource(videoUri);
      hls.attachMedia(el);
    } else {
      try { el.src = videoUri; } catch (e) {}
    }

    if (autoPlay) {
      const t = setTimeout(() => {
        try { el.play().catch(() => {}); } catch (e) {}
      }, 100);
      return () => clearTimeout(t);
    }
  }, [videoUri, isProcessing]);

  // GIF fallback when nothing has played within 8s
  useEffect(() => {
    if (isProcessing || !videoUri || !gifUrl) return;
    if (gifTimerRef.current) clearTimeout(gifTimerRef.current);
    gifTimerRef.current = setTimeout(() => {
      if (!playedRef.current && !failed) setUseGifFallback(true);
    }, 8000);
    return () => {
      if (gifTimerRef.current) clearTimeout(gifTimerRef.current);
    };
  }, [videoUri, isProcessing, failed, gifUrl]);

  // Keep muted property in sync
  useEffect(() => {
    try {
      if (videoRef.current) videoRef.current.muted = isMuted;
    } catch (e) {}
  }, [isMuted]);

  const handlePlayEvent = () => {
    setIsPlaying(true);
    if (!playedRef.current) {
      playedRef.current = true;
      setHasStarted(true);
      setUseGifFallback(false);
      onPlay?.();
    }
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (el.paused) el.play().catch(() => {});
      else el.pause();
    } catch (e) {}
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    onMuteChange?.(next);
  };

  const playWithGesture = () => {
    setUseGifFallback(false);
    const el = videoRef.current;
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

  const videoProps: any = {
    ref: (el: HTMLVideoElement | null) => {
      videoRef.current = el;
    },
    playsInline: true,
    muted: isMuted,
    autoPlay,
    loop: isLooping,
    controls: useNativeControls,
    style: styleHasHeight
      ? {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          objectFit: effectiveFit as any,
          backgroundColor: "#000",
          opacity: useGifFallback ? 0 : 1,
        }
      : {
          width: "100%",
          height: "100%",
          objectFit: effectiveFit as any,
          backgroundColor: "#000",
          opacity: useGifFallback ? 0 : 1,
        },
    onPlay: handlePlayEvent,
    onPlaying: handlePlayEvent,
    onPause: () => setIsPlaying(false),
    onError: () => {
      if (!hlsRef.current) setFailed(true);
    },
    onLoadedMetadata: (e: any) => {
      const v = e?.target as HTMLVideoElement | null;
      if (v && v.videoWidth && v.videoHeight) {
        setNaturalAspect(v.videoWidth / v.videoHeight);
      }
    },
  };

  return (
    <View style={[styles.container, { aspectRatio: styleHasHeight ? undefined : aspectRatio, maxHeight: styleHasHeight ? undefined : maxHeight, borderRadius }, style]}>
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
          {showBlurBackdrop && coverUrl
            ? React.createElement("img", {
                src: coverUrl,
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: "blur(26px) brightness(0.55)",
                  transform: "scale(1.2)",
                  pointerEvents: "none",
                },
              })
            : null}
          {coverUrl && !hasStarted && !useGifFallback ? (
            <RNImage source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          ) : null}
          {videoUri ? React.createElement("video", videoProps) : null}
          {!useNativeControls && !useGifFallback && (
            <Pressable onPress={handlePress} style={StyleSheet.absoluteFill} />
          )}
          {!hasStarted && !failed && !useGifFallback && (
            <Pressable style={styles.playBigBtn} onPress={handlePress}>
              <Ionicons name="play" size={34} color="#fff" />
            </Pressable>
          )}
          {showMuteButton && !useNativeControls && !useGifFallback && (
            <Pressable style={styles.muteBtn} onPress={toggleMute}>
              <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={20} color="#fff" />
            </Pressable>
          )}
          {fitPolicy === "auto" && (
            <View style={styles.debugBadge} pointerEvents="none">
              <Text style={styles.debugText}>
                {`fit:${effectiveFit} ar:${naturalAspect ? naturalAspect.toFixed(2) : "?"} win:${vwNow}x${vhNow}`}
              </Text>
              {debugBox ? (
                <Text style={styles.debugText}>
                  {`box:${debugBox.bw}x${debugBox.bh} vid:${debugBox.iw}x${debugBox.ih}`}
                </Text>
              ) : null}
            </View>
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
    position: "relative",
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
  debugBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 20,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  debugText: {
    color: "#7CFC00",
    fontSize: 10,
    fontWeight: "700",
  },
});

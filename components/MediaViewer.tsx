import React, { useCallback, useEffect, useState } from "react";
import {
  Dimensions,
  Image as RNImage,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

export type MediaItem = {
  type: "image" | "video";
  uri: string;
  ratio?: number;
  muxThumbnailUrl?: string;
  videoStatus?: string | null;
};

type MediaViewerProps = {
  visible: boolean;
  media: MediaItem[];
  initialIndex?: number;
  onClose: () => void;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

function ImageItem({ item }: { item: MediaItem }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => { scale.value = savedScale.value * e.scale; })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1); savedScale.value = 1;
        translateX.value = withSpring(0); translateY.value = withSpring(0);
        savedTranslateX.value = 0; savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withSpring(4); savedScale.value = 4;
      } else { savedScale.value = scale.value; }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1.05) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => { savedTranslateX.value = translateX.value; savedTranslateY.value = translateY.value; });

  const doubleTapGesture = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    if (savedScale.value > 1.05) {
      scale.value = withSpring(1); savedScale.value = 1;
      translateX.value = withSpring(0); translateY.value = withSpring(0);
      savedTranslateX.value = 0; savedTranslateY.value = 0;
    } else { scale.value = withSpring(2.5); savedScale.value = 2.5; }
  });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.imageContainer, animatedStyle]}>
        <RNImage source={{ uri: item.uri }} style={styles.fullscreenImage} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Lazy player — only mounts after modal first opens ───

function MediaPlayer({ item }: { item: MediaItem }) {
  const isProcessing = item.videoStatus === "processing" || item.uri?.startsWith("mux://");
  const player = useVideoPlayer(isProcessing ? null : item.uri, (p) => {
    p.loop = true;
    p.muted = false;
  });

  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const sub = player.addListener("playingChange", (e) => { setIsPlaying(e.isPlaying); });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (!player || isProcessing) return;
    const t = setTimeout(() => { try { player.currentTime = 0; player.play(); setIsPlaying(true); } catch (_) {} }, 200);
    return () => clearTimeout(t);
  }, [player, isProcessing]);

  useEffect(() => {
    return () => { if (!isProcessing) try { player.pause(); } catch (_) {} };
  }, [player, isProcessing]);

  const toggle = () => {
    if (isPlaying) { player.pause(); setIsPlaying(false); }
    else { player.play(); setIsPlaying(true); }
  };

  if (isProcessing) {
    return (
      <View style={styles.videoContainer}>
        {item.muxThumbnailUrl && <RNImage source={{ uri: item.muxThumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color={COLORS.textLight} />
          <Text style={styles.processingText}>Processing video...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.videoContainer, { position: "relative" }]}>
      <VideoView player={player} style={{ width: "100%", height: "100%" }} contentFit="contain" nativeControls={false} />
      <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
        {!isPlaying && (
          <View style={styles.playIconOverlay}>
            <View style={styles.playIconCircle}>
              <Ionicons name="play" size={48} color={COLORS.textLight} />
            </View>
          </View>
        )}
      </Pressable>
    </View>
  );
}

export default function MediaViewer({ visible, media, initialIndex = 0, onClose }: MediaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [playerStarted, setPlayerStarted] = useState(false);

  useEffect(() => { setCurrentIndex(initialIndex); }, [initialIndex, visible]);
  useEffect(() => { if (visible && !playerStarted) setPlayerStarted(true); }, [visible, playerStarted]);

  const goPrev = useCallback(() => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); }, [currentIndex]);
  const goNext = useCallback(() => { if (currentIndex < media.length - 1) setCurrentIndex((i) => i + 1); }, [currentIndex, media.length]);

  const hasMedia = media.length > 0;
  const currentItem = media[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === media.length - 1;

  return (
    <Modal visible={visible && hasMedia} animationType="fade" transparent={true} onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View style={styles.overlay}>
          <StatusBar barStyle="light-content" />
          <Pressable style={styles.closeArea} onPress={onClose}>
            <View style={styles.closeButton}><Ionicons name="close" size={28} color={COLORS.textLight} /></View>
          </Pressable>
          <View style={styles.mediaArea}>
            {currentItem?.type === "video" && playerStarted ? (
              <MediaPlayer item={currentItem} />
            ) : currentItem ? (
              <ImageItem item={currentItem} />
            ) : null}
          </View>
          {media.length > 1 && (
            <>
              <Pressable style={[styles.sideTapZone, styles.sideTapZoneLeft]} onPress={goPrev} disabled={isFirst}>
                {!isFirst && <View style={styles.sideArrowHint}><Ionicons name="chevron-back" size={40} color="rgba(255,255,255,0.35)" /></View>}
              </Pressable>
              <Pressable style={[styles.sideTapZone, styles.sideTapZoneRight]} onPress={goNext} disabled={isLast}>
                {!isLast && <View style={styles.sideArrowHint}><Ionicons name="chevron-forward" size={40} color="rgba(255,255,255,0.35)" /></View>}
              </Pressable>
            </>
          )}
          {media.length > 1 && (
            <View style={styles.counter}><Text style={styles.counterText}>{currentIndex + 1}/{media.length}</Text></View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  closeArea: { position: "absolute", top: 50, right: 16, zIndex: 20 },
  closeButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  mediaArea: { flex: 1, width: SCREEN_WIDTH, justifyContent: "center", alignItems: "center" },
  imageContainer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: "center", alignItems: "center" },
  fullscreenImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, resizeMode: "contain" },
  videoContainer: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: "transparent", justifyContent: "center", alignItems: "center" },
  playIconOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center" },
  playIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  processingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", gap: 8 },
  processingText: { color: COLORS.textLight, fontSize: 14, fontWeight: "600" },
  sideTapZone: { position: "absolute", top: 0, bottom: 0, width: SCREEN_WIDTH / 3, justifyContent: "center", alignItems: "center", zIndex: 10 },
  sideTapZoneLeft: { left: 0 },
  sideTapZoneRight: { right: 0 },
  sideArrowHint: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center" },
  counter: { position: "absolute", bottom: 80, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  counterText: { color: COLORS.textLight, fontSize: 14, fontWeight: "600" },
});

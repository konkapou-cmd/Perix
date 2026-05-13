import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image as RNImage,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
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
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else if (scale.value > 4) {
        scale.value = withSpring(4);
        savedScale.value = 4;
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1.05) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1.05) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.imageContainer, animatedStyle]}>
        <RNImage
          source={{ uri: item.uri }}
          style={styles.fullscreenImage}
          resizeMode="contain"
          accessible={true}
          accessibilityLabel="Fullscreen image"
        />
      </Animated.View>
    </GestureDetector>
  );
}

function VideoItem({ item, isActive }: { item: MediaItem; isActive: boolean }) {
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    if (!isActive) {
      videoRef.current?.pauseAsync().catch(() => {});
    }
  }, [isActive]);

  if (item.videoStatus === "processing" || (item.uri && item.uri.startsWith("mux://"))) {
    const thumbUri = item.muxThumbnailUrl || null;
    return (
      <View style={styles.videoContainer}>
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

  return (
    <View style={styles.videoContainer}>
      <Video
        ref={videoRef}
        source={{ uri: item.uri }}
        style={StyleSheet.absoluteFill}
        useNativeControls={true}
        resizeMode={ResizeMode.CONTAIN}
        isLooping={true}
        isMuted={false}
        shouldPlay={isActive}
      />
    </View>
  );
}

export default function MediaViewer({ visible, media, initialIndex = 0, onClose }: MediaViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, visible]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / SCREEN_WIDTH);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < media.length) {
        setCurrentIndex(newIndex);
      }
    },
    [currentIndex, media.length]
  );

  // Always render the Modal — it handles visibility internally.
  // This ensures hooks are always called in the same order.
  const hasMedia = media.length > 0;

  return (
    <Modal visible={visible && hasMedia} animationType="fade" transparent={true} onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <View style={styles.overlay}>
          <StatusBar barStyle="light-content" />

          <Pressable style={styles.closeArea} onPress={onClose}>
            <View style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#fff" />
            </View>
          </Pressable>

          <View style={styles.swipeArea}>
            {hasMedia && (
              <Animated.FlatList
                data={media}
                keyExtractor={(_, index) => index.toString()}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                initialScrollIndex={Math.min(initialIndex, media.length - 1)}
                getItemLayout={(_, index) => ({
                  length: SCREEN_WIDTH,
                  offset: SCREEN_WIDTH * index,
                  index,
                })}
                renderItem={({ item, index }) => (
                  <View style={styles.slideItem}>
                    {item.type === "video" ? (
                      <VideoItem item={item} isActive={index === currentIndex} />
                    ) : (
                      <ImageItem item={item} />
                    )}
                  </View>
                )}
                style={styles.flatList}
              />
            )}
          </View>

          {media.length > 1 && (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {currentIndex + 1}/{media.length}
              </Text>
            </View>
          )}

          <Pressable style={styles.dismissArea} onPress={onClose}>
            <Text style={styles.dismissText}>Tap to close</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeArea: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  swipeArea: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: "center",
    alignItems: "center",
  },
  flatList: {
    flex: 1,
  },
  slideItem: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    resizeMode: "contain",
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
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
    fontSize: 14,
    fontWeight: "600",
  },
  counter: {
    position: "absolute",
    bottom: 80,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  counterText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  dismissArea: {
    position: "absolute",
    bottom: 30,
    alignSelf: "center",
    padding: 10,
  },
  dismissText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
  },
});
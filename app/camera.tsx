import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const MAX_VIDEO_DURATION = 30; // 30 seconds max like Instagram

type CameraMode = "picture" | "video";

export default function CameraScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mode: initialMode, returnTo } = useLocalSearchParams<{ mode?: string; returnTo?: string }>();
  
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [cameraMode, setCameraMode] = useState<CameraMode>(initialMode === "video" ? "video" : "picture");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flash, setFlash] = useState<"off" | "on">("off");
  
  const cameraRef = useRef<CameraView>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      if (!cameraPermission?.granted) {
        await requestCameraPermission();
      }
      if (!micPermission?.granted) {
        await requestMicPermission();
      }
    })();
  }, []);

  // Recording timer effect
  useEffect(() => {
    if (isRecording) {
      // Start progress animation
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: MAX_VIDEO_DURATION * 1000,
        useNativeDriver: false,
      }).start();

      // Start pulse animation for recording indicator
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      // Update timer every second
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= MAX_VIDEO_DURATION - 1) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      return () => {
        pulseLoop.stop();
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      };
    } else {
      progressAnim.setValue(0);
      setRecordingTime(0);
    }
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const toggleFlash = () => {
    setFlash((current) => (current === "off" ? "on" : "off"));
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });
      
      if (photo?.uri) {
        // Navigate to editor with the photo
        router.push({
          pathname: "/media-editor",
          params: { uri: encodeURIComponent(photo.uri), type: "image" },
        });
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert(t("common.error"), t("camera.photoError") || "Failed to take photo");
    }
  };

  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    
    try {
      setIsRecording(true);
      const video = await cameraRef.current.recordAsync({
        maxDuration: MAX_VIDEO_DURATION,
      });
      
      if (video?.uri) {
        // Navigate to editor with the video
        router.push({
          pathname: "/media-editor",
          params: { uri: encodeURIComponent(video.uri), type: "video" },
        });
      }
    } catch (error) {
      console.error("Error recording video:", error);
      setIsRecording(false);
    }
  };

  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecording) return;
    
    try {
      await cameraRef.current.stopRecording();
    } catch (error) {
      console.error("Error stopping recording:", error);
    } finally {
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleCapturePress = () => {
    if (cameraMode === "picture") {
      takePhoto();
    } else {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  const handleCaptureLongPress = () => {
    if (cameraMode === "picture") {
      // Switch to video mode and start recording on long press
      setCameraMode("video");
      setTimeout(() => startRecording(), 100);
    }
  };

  const openGallery = async () => {
    const mediaType = cameraMode === "picture" 
      ? ImagePicker.MediaTypeOptions.Images 
      : ImagePicker.MediaTypeOptions.Videos;
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mediaType,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
      const asset = result.assets[0];
      const type = asset.type === "video" ? "video" : "image";
      router.push({
        pathname: "/media-editor",
        params: { uri: encodeURIComponent(asset.uri), type },
      });
    }
  };

  // Permissions check
  if (!cameraPermission?.granted || !micPermission?.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text style={styles.permissionTitle}>{t("camera.permissionRequired") || "Camera Permission Required"}</Text>
        <Text style={styles.permissionText}>
          {t("camera.permissionMessage") || "We need camera and microphone access to record videos and take photos."}
        </Text>
        <Pressable style={styles.permissionButton} onPress={() => {
          requestCameraPermission();
          requestMicPermission();
        }}>
          <Text style={styles.permissionButtonText}>{t("camera.grantPermission") || "Grant Permission"}</Text>
        </Pressable>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("common.back")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Progress bar width interpolation
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        mode={cameraMode}
      >
        {/* Top Controls */}
        <SafeAreaView style={styles.topControls} edges={["top"]}>
          {/* Close Button */}
          <Pressable style={styles.controlButton} onPress={() => router.back()}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>

          {/* Recording Timer */}
          {isRecording && (
            <View style={styles.recordingBadge}>
              <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
              <Text style={styles.maxDuration}>/ {formatTime(MAX_VIDEO_DURATION)}</Text>
            </View>
          )}

          {/* Flash Toggle */}
          <Pressable style={styles.controlButton} onPress={toggleFlash}>
            <Ionicons 
              name={flash === "on" ? "flash" : "flash-off"} 
              size={24} 
              color="#fff" 
            />
          </Pressable>
        </SafeAreaView>

        {/* Progress Bar (for video recording) */}
        {cameraMode === "video" && (
          <View style={styles.progressBarContainer}>
            <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
          </View>
        )}

        {/* Bottom Controls */}
        <SafeAreaView style={styles.bottomControls} edges={["bottom"]}>
          {/* Mode Switcher */}
          <View style={styles.modeSwitcher}>
            <Pressable 
              style={[styles.modeButton, cameraMode === "picture" && styles.modeButtonActive]}
              onPress={() => !isRecording && setCameraMode("picture")}
            >
              <Text style={[styles.modeText, cameraMode === "picture" && styles.modeTextActive]}>
                {t("camera.photo") || "PHOTO"}
              </Text>
            </Pressable>
            <Pressable 
              style={[styles.modeButton, cameraMode === "video" && styles.modeButtonActive]}
              onPress={() => !isRecording && setCameraMode("video")}
            >
              <Text style={[styles.modeText, cameraMode === "video" && styles.modeTextActive]}>
                {t("camera.video") || "VIDEO"}
              </Text>
            </Pressable>
          </View>

          {/* Main Controls Row */}
          <View style={styles.controlsRow}>
            {/* Gallery Button */}
            <Pressable style={styles.sideButton} onPress={openGallery} disabled={isRecording}>
              <Ionicons name="images-outline" size={28} color={isRecording ? "#666" : "#fff"} />
            </Pressable>

            {/* Capture Button */}
            <Pressable
              style={[
                styles.captureButton,
                cameraMode === "video" && styles.captureButtonVideo,
                isRecording && styles.captureButtonRecording,
              ]}
              onPress={handleCapturePress}
              onLongPress={handleCaptureLongPress}
              delayLongPress={300}
            >
              <View style={[
                styles.captureButtonInner,
                cameraMode === "video" && styles.captureButtonInnerVideo,
                isRecording && styles.captureButtonInnerRecording,
              ]} />
            </Pressable>

            {/* Flip Camera Button */}
            <Pressable style={styles.sideButton} onPress={toggleCameraFacing} disabled={isRecording}>
              <Ionicons name="camera-reverse-outline" size={28} color={isRecording ? "#666" : "#fff"} />
            </Pressable>
          </View>

          {/* Hint Text */}
          <Text style={styles.hintText}>
            {cameraMode === "video" 
              ? (isRecording 
                ? (t("camera.tapToStop") || "Tap to stop recording")
                : (t("camera.tapToRecord") || "Tap to record (max 30s)"))
              : (t("camera.tapToCapture") || "Tap to capture, hold for video")}
          </Text>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  camera: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.huge,
  },
  permissionTitle: {
    color: COLORS.background,
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.xxxl,
    marginBottom: SPACING.lg,
    textAlign: "center",
  },
  permissionText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.bodySmall,
    textAlign: "center",
    marginBottom: SPACING.xxxl,
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: SPACING.huge,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.xl,
  },
  permissionButtonText: {
    color: COLORS.background,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  backButton: {
    padding: SPACING.lg,
  },
  backButtonText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.bodyLarge,
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.danger,
    marginRight: SPACING.md,
  },
  recordingTime: {
    color: COLORS.background,
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.bold,
    fontVariant: ["tabular-nums"],
  },
  maxDuration: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.bodySmall,
    marginLeft: SPACING.xs,
  },
  progressBarContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  progressBar: {
    height: "100%",
    backgroundColor: COLORS.danger,
  },
  bottomControls: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: SPACING.xxxl,
  },
  modeSwitcher: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: SPACING.xxxl,
    gap: SPACING.xxxl,
  },
  modeButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  modeButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.background,
  },
  modeText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 1,
  },
  modeTextActive: {
    color: COLORS.background,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
    marginBottom: SPACING.xl,
  },
  sideButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 4,
    borderColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  captureButtonVideo: {
    borderColor: COLORS.danger,
  },
  captureButtonRecording: {
    borderColor: COLORS.danger,
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
  },
  captureButtonInnerVideo: {
    backgroundColor: COLORS.danger,
  },
  captureButtonInnerRecording: {
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.danger,
  },
  hintText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.small,
    textAlign: "center",
  },
});

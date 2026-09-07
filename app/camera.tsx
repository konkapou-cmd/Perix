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
import { MEDIA_LIMITS } from "../lib/constants/mediaLimits";
import { useAuth } from "../context/AuthContext";
import { createPost, uploadMedia, uploadVideoMux } from "../lib/api";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type CameraViewMode = "picture" | "video";

export default function CameraScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { sessionToken, activeIdentity } = useAuth();
  const { mode, returnTo } = useLocalSearchParams<{ mode?: string; returnTo?: string }>();

  const maxDurationSeconds = mode === "cover"
    ? MEDIA_LIMITS.camera.coverMaxDurationSeconds
    : MEDIA_LIMITS.camera.generalMaxDurationSeconds;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [cameraMode, setCameraMode] = useState<CameraViewMode>(mode === "video" ? "video" : "picture");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [flash, setFlash] = useState<"off" | "on">("off");
  
  const cameraRef = useRef<CameraView>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Request permissions on mount
  useEffect(() => {
    if (Platform.OS === "web") return;
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
        duration: maxDurationSeconds * 1000,
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
          if (prev >= maxDurationSeconds - 1) {
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
        quality: MEDIA_LIMITS.image.pickerQuality,
        base64: true,
      });
      
      if (photo?.uri) {
        // Navigate to editor with the photo
        router.push({
          pathname: "/media-editor",
          params: { uri: encodeURIComponent(photo.uri), type: "image", mode: mode, ratio: photo.width && photo.height ? String(photo.width / photo.height) : undefined },
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
        maxDuration: maxDurationSeconds,
      });
      
      if (video?.uri) {
        // Navigate to editor with the video
        router.push({
          pathname: "/media-editor",
          params: { uri: encodeURIComponent(video.uri), type: "video", mode: mode },
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
      quality: cameraMode === "picture" ? MEDIA_LIMITS.image.pickerQuality : MEDIA_LIMITS.video.pickerQuality,
    });

    if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].uri) {
      const asset = result.assets[0];
      const type = asset.type === "video" ? "video" : "image";
      const ratio = asset.width && asset.height && asset.height > 0 ? String(asset.width / asset.height) : undefined;
      const navigate = Platform.OS === "web" ? router.replace : router.push;
      navigate({
        pathname: "/media-editor",
        params: { uri: encodeURIComponent(asset.uri), type, mode: mode, ratio },
      });
    }
  };

  // Web: live camera stream (getUserMedia) with photo/video capture + gallery option
  const [streaming, setStreaming] = useState(false);
  const [recordingStream, setRecordingStream] = useState(false);
  const [webFacing, setWebFacing] = useState<"user" | "environment">("environment");
  const [pendingMedia, setPendingMedia] = useState<{ uri: string; type: "image" | "video"; ratio?: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const webVideoRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const recorderRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const webMaxDuration = MEDIA_LIMITS.camera.generalMaxDurationSeconds;

  useEffect(() => {
    return () => {
      try {
        streamRef.current?.getTracks?.().forEach((t: any) => t.stop());
      } catch (e) {}
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const stopStream = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    try {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
    } catch (e) {}
    try {
      streamRef.current?.getTracks?.().forEach((t: any) => t.stop());
    } catch (e) {}
    streamRef.current = null;
    recorderRef.current = null;
    setStreaming(false);
    setRecordingStream(false);
    setRecordSeconds(0);
  };

  const startStream = async (facingMode?: "user" | "environment") => {
    const nextFacing = facingMode ?? webFacing;
    try {
      const stream = await (navigator as any)?.mediaDevices?.getUserMedia?.({
        video: { facingMode: nextFacing },
        audio: false,
      });
      if (!stream) {
        Alert.alert(t("common.error"), t("camera.permissionRequired") || "Camera Permission Required");
        return;
      }
      streamRef.current = stream;
      setWebFacing(nextFacing);
      setStreaming(true);
    } catch (e) {
      console.error("getUserMedia failed:", e);
      Alert.alert(t("common.error"), t("camera.permissionRequired") || "Camera Permission Required");
    }
  };

  const switchFacing = () => {
    const next: "user" | "environment" = webFacing === "environment" ? "user" : "environment";
    stopStream();
    startStream(next);
  };

  useEffect(() => {
    if (!streaming || !streamRef.current || !webVideoRef.current) return;
    try {
      webVideoRef.current.srcObject = streamRef.current;
      webVideoRef.current.play().catch(() => {});
    } catch (e) {
      console.error("Attach stream failed:", e);
    }
  }, [streaming]);

  const captureStreamPhoto = () => {
    const video = webVideoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const ratio = video.videoHeight > 0 ? video.videoWidth / video.videoHeight : undefined;
    stopStream();
    setPendingMedia({ uri: dataUrl, type: "image", ratio });
  };

  const toggleStreamRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    if (recordingStream) {
      recorderRef.current?.stop();
      setRecordingStream(false);
      return;
    }
    const chunks: Blob[] = [];
    chunksRef.current = chunks;
    try {
      const recorder = new (window as any).MediaRecorder(stream, { mimeType: "video/webm" });
      recorder.ondataavailable = (e: any) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        if (autoStopRef.current) clearTimeout(autoStopRef.current);
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const video = webVideoRef.current;
        const ratio = video && video.videoHeight ? video.videoWidth / video.videoHeight : undefined;
        stopStream();
        setPendingMedia({ uri: url, type: "video", ratio });
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecordingStream(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
      autoStopRef.current = setTimeout(() => {
        try {
          if (recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.stop();
          }
        } catch (e) {}
      }, webMaxDuration * 1000);
    } catch (e) {
      console.error("MediaRecorder failed:", e);
      Alert.alert(t("common.error"), t("camera.photoError") || "Failed to record video");
    }
  };

  const publishPending = async () => {
    if (!sessionToken || !pendingMedia || publishing) return;
    setPublishing(true);
    try {
      const actor = activeIdentity ? { type: activeIdentity.type, id: activeIdentity.id } : undefined;
      const businessId = activeIdentity?.type === "business" ? activeIdentity.id : undefined;
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const caption = t("home.sharedAnUpdate", "Shared an update");
      if (pendingMedia.type === "image") {
        const imageUrl = await uploadMedia(sessionToken, pendingMedia.uri, "image");
        await createPost(sessionToken, caption, null, null, businessId, actor, pendingMedia.ratio ?? null, [], null, null, imageUrl, null, null, null, null, undefined, undefined, requestId);
      } else {
        const muxResult = await uploadVideoMux(sessionToken, pendingMedia.uri);
        const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
        await createPost(
          sessionToken,
          caption,
          null,
          null,
          businessId,
          actor,
          pendingMedia.ratio ?? null,
          [],
          null,
          null,
          null,
          videoUrl,
          null,
          null,
          muxResult.mux_upload_id || null,
          muxResult.mux_playback_id || null,
          muxResult.video_status || (videoUrl ? "ready" : "processing"),
          requestId,
        );
      }
      setPendingMedia(null);
      router.replace("/(tabs)/home" as any);
    } catch (error: any) {
      console.error("[camera] publish failed:", error?.message);
      Alert.alert(t("common.error"), error?.message || t("editor.publishFailed", "Failed to publish"));
    } finally {
      setPublishing(false);
    }
  };

  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.webContainer}>
        <View style={styles.webHeader}>
          <Pressable style={styles.webBack} onPress={() => { stopStream(); router.back(); }}>
            <Ionicons name="close" size={28} color="#264348" />
          </Pressable>
          <Text style={styles.webTitle}>{t("camera.title", "Camera")}</Text>
          <View style={{ width: 40 }} />
        </View>
        {pendingMedia ? (
          <View style={styles.webBody}>
            {pendingMedia.type === "video"
              ? React.createElement("video", {
                  src: pendingMedia.uri,
                  controls: true,
                  playsInline: true,
                  style: { width: "100%", maxHeight: 440, borderRadius: 16, backgroundColor: "#000" },
                })
              : React.createElement("img", {
                  src: pendingMedia.uri,
                  style: { width: "100%", maxHeight: 440, borderRadius: 16, objectFit: "contain", backgroundColor: "#000" },
                })}
            <Pressable
              style={[styles.webPublishBtn, publishing && { opacity: 0.6 }]}
              onPress={publishPending}
              disabled={publishing}
            >
              <Ionicons name="paper-plane" size={20} color="#fff" />
              <Text style={styles.webPublishText}>
                {publishing ? (t("upload.uploading", "Uploading...")) : (t("editor.publishAsPost", "Als Beitrag veröffentlichen"))}
              </Text>
            </Pressable>
            <Pressable style={styles.webSmallBtn} onPress={() => setPendingMedia(null)} disabled={publishing}>
              <Ionicons name="refresh" size={20} color="#264348" />
              <Text style={styles.webSmallText}>{t("camera.retake", "Neu aufnehmen")}</Text>
            </Pressable>
          </View>
        ) : streaming ? (
          <View style={styles.webStreamWrap}>
            {React.createElement("video", {
              ref: (el: any) => {
                webVideoRef.current = el;
                if (el && streamRef.current) {
                  try {
                    el.srcObject = streamRef.current;
                    el.play().catch(() => {});
                  } catch (e) {}
                }
              },
              playsInline: true,
              muted: true,
              autoPlay: true,
              style: { width: "100%", height: "100%", objectFit: "cover", backgroundColor: "#000" },
            })}
            {recordingStream && (
              <View style={styles.webRecordBadge}>
                <View style={styles.webRecordDot} />
                <Text style={styles.webRecordText}>{recordSeconds}s / {webMaxDuration}s</Text>
              </View>
            )}
            <View style={styles.webStreamControls}>
              <Pressable style={styles.webCaptureBtn} onPress={switchFacing}>
                <Ionicons name="camera-reverse" size={24} color="#fff" />
              </Pressable>
              <Pressable style={styles.webCaptureBtn} onPress={captureStreamPhoto}>
                <Ionicons name="camera" size={26} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.webCaptureBtn, recordingStream && styles.webCaptureBtnActive]}
                onPress={toggleStreamRecording}
              >
                <Ionicons name={recordingStream ? "stop" : "videocam"} size={26} color="#fff" />
              </Pressable>
              <Pressable style={[styles.webCaptureBtn, styles.webCaptureBtnClose]} onPress={stopStream}>
                <Ionicons name="close" size={26} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : (
        <View style={styles.webBody}>
          <Pressable
            style={styles.webBigBtn}
            onPress={() => startStream()}
          >
            <Ionicons name="camera" size={48} color="#59ABE3" />
            <Text style={styles.webBigText}>{t("camera.openCamera", "Open camera")}</Text>
          </Pressable>
          <Pressable style={styles.webSmallBtn} onPress={openGallery}>
            <Ionicons name="images-outline" size={20} color="#264348" />
            <Text style={styles.webSmallText}>{t("camera.gallery", "Choose from gallery")}</Text>
          </Pressable>
        </View>
        )}
      </SafeAreaView>
    );
  }

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
            <Ionicons name="close" size={28} color={COLORS.textLight} />
          </Pressable>

          {/* Recording Timer */}
          {isRecording && (
            <View style={styles.recordingBadge}>
              <Animated.View style={[styles.recordingDot, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
              <Text style={styles.maxDuration}>/ {formatTime(maxDurationSeconds)}</Text>
            </View>
          )}

          {/* Flash Toggle */}
          <Pressable style={styles.controlButton} onPress={toggleFlash}>
            <Ionicons 
              name={flash === "on" ? "flash" : "flash-off"} 
              size={24} 
              color={COLORS.textLight} 
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
              <Ionicons name="images-outline" size={28} color={isRecording ? "#666" : COLORS.textLight} />
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
              <Ionicons name="camera-reverse-outline" size={28} color={isRecording ? "#666" : COLORS.textLight} />
            </Pressable>
          </View>

          {/* Hint Text */}
          <Text style={styles.hintText}>
            {cameraMode === "video" 
              ? (isRecording 
                ? (t("camera.tapToStop") || "Tap to stop recording")
                : (t("camera.tapToRecord") || `Tap to record (max ${maxDurationSeconds}s)`))
              : (t("camera.tapToCapture") || "Tap to capture, hold for video")}
          </Text>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: COLORS.backgroundPage,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  webBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  webTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#264348",
  },
  webBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  webBigBtn: {
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 22,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: "rgba(89,171,227,0.4)",
  },
  webBigText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#264348",
  },
  webSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.25)",
    backgroundColor: COLORS.background,
  },
  webSmallText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#264348",
  },
  webStreamWrap: {
    flex: 1,
    backgroundColor: "#000",
  },
  webStreamControls: {
    position: "absolute",
    bottom: 28,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    alignItems: "center",
  },
  webCaptureBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  webCaptureBtnActive: {
    backgroundColor: "#ef4444",
  },
  webCaptureBtnClose: {
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  webPublishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    maxWidth: 420,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#59ABE3",
  },
  webPublishText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  webRecordBadge: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  webRecordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
  },
  webRecordText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
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
    padding: SPACING.large,
  },
  permissionTitle: {
    color: COLORS.background,
    fontSize: FONT_SIZES.h3,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.page,
    marginBottom: SPACING.compact,
    textAlign: "center",
  },
  permissionText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.bodySmall,
    textAlign: "center",
    marginBottom: SPACING.page,
    lineHeight: 20,
  },
  permissionButton: {
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: SPACING.large,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.std,
  },
  permissionButtonText: {
    color: COLORS.background,
    fontSize: FONT_SIZES.bodyLarge,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  backButton: {
    padding: SPACING.compact,
  },
  backButtonText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZES.bodyLarge,
  },
  topControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: SPACING.std,
    paddingTop: SPACING.small,
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
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
    borderRadius: BORDER_RADIUS.xl,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.danger,
    marginRight: SPACING.small,
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
    marginLeft: SPACING.tiny,
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
    paddingBottom: SPACING.page,
  },
  modeSwitcher: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: SPACING.page,
    gap: SPACING.page,
  },
  modeButton: {
    paddingHorizontal: SPACING.std,
    paddingVertical: SPACING.small,
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
    marginBottom: SPACING.std,
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

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import {
  initiateCall,
  answerCall,
  endCall,
  rejectCall,
  User,
  CallResponse,
  AGORA_APP_ID,
} from "../lib/api";
import { Camera } from "expo-camera";
import { Audio } from "expo-av";

type CallMode = "outgoing" | "incoming" | "active";

export default function CallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId?: string;
    userName?: string;
    userPhoto?: string;
    callType?: string;
    callId?: string;
    mode?: string;
  }>();
  
  const { sessionToken } = useAuth();
  const [callMode, setCallMode] = useState<CallMode>(
    (params.mode as CallMode) || "outgoing"
  );
  const [callType, setCallType] = useState<"voice" | "video">(
    (params.callType as "voice" | "video") || "video"
  );
  const [isConnecting, setIsConnecting] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === "video");
  const [callData, setCallData] = useState<CallResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Call timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (callMode === "active") {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      }
    return () => clearInterval(timer);
  }, [callMode]);

  // Request camera and microphone permissions
  const requestPermissions = async () => {
    if (Platform.OS === "web") {
      // Web permissions are handled differently
      return true;
    }

    try {
      // Request microphone permission
      const audioPermission = await Audio.requestPermissionsAsync();
      if (audioPermission.status !== "granted") {
        Alert.alert(
          t("calls.permissionRequired"),
          t("calls.microphonePermission"),
          [{ text: t("common.close") }]
        );
        return false;
      }

      // Request camera permission for video calls
      if (callType === "video") {
        const cameraPermission = await Camera.requestCameraPermissionsAsync();
        if (cameraPermission.status !== "granted") {
          Alert.alert(
            t("calls.permissionRequired"),
            t("calls.cameraPermission"),
            [{ text: t("common.close") }]
          );
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error("Permission request failed:", err);
      return false;
    }
  };

  // Initialize call
  useEffect(() => {
    const initCall = async () => {
      if (!sessionToken) {
        setError("Not authenticated");
        return;
      }

      // Check if Agora SDK is available (react-native-agora needs to be installed)
      const isAgoraAvailable = false; // TODO: Set to true when react-native-agora is installed
      
      if (!isAgoraAvailable) {
        setError(t("calls.agoraNotAvailable") || "Video calls require app update. Coming soon!");
        setIsConnecting(false);
        return;
      }

      // Request permissions first
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        setError(t("calls.permissionDenied"));
        setIsConnecting(false);
        return;
      }

      try {
        if (callMode === "outgoing" && params.userId) {
          // Initiate outgoing call
          const response = await initiateCall(
            sessionToken,
            params.userId,
            callType
          );
          setCallData(response);
          setIsConnecting(false);
          
          // In a real app, you would connect to Agora here
          // For demo, we'll simulate connection after 3 seconds
          setTimeout(() => {
            // Simulating the call being answered
            // In production, this would be triggered by push notification response
          }, 3000);
          
        } else if (callMode === "incoming" && params.callId) {
          // Answer incoming call
          const response = await answerCall(sessionToken, params.callId);
          setCallData(response);
          setCallMode("active");
          setIsConnecting(false);
        }
      } catch (err: any) {
        setError(err.message || "Failed to connect call");
        setIsConnecting(false);
      }
    };

    initCall();
  }, [sessionToken, callMode, params.userId, params.callId, callType, t]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleEndCall = async () => {
    // Set a timeout to force navigation even if the API call hangs
    const navigationTimeout = setTimeout(() => {
      console.log("Force navigating due to timeout");
      navigateBack();
    }, 3000);

    try {
      if (sessionToken && callData?.call_id) {
        await endCall(sessionToken, callData.call_id);
      }
    } catch (err) {
      console.error("Failed to end call:", err);
    } finally {
      clearTimeout(navigationTimeout);
      navigateBack();
    }
  };

  const navigateBack = useCallback(() => {
    // Multiple fallback strategies for navigation
    try {
      // First try dismiss (for modals)
      if (router.canDismiss()) {
        router.dismiss();
        return;
      }
      // Then try going back
      if (router.canGoBack()) {
        router.back();
        return;
      }
      // Final fallback: replace with messages tab
      router.replace("/(tabs)/messages");
    } catch (e) {
      console.error("Navigation error:", e);
      // Ultimate fallback
      try {
        router.replace("/(tabs)/messages");
      } catch (e2) {
        console.error("Ultimate fallback failed:", e2);
      }
    }
  }, [router]);

  const handleRejectCall = async () => {
    const navigationTimeout = setTimeout(() => {
      navigateBack();
    }, 3000);

    try {
      if (sessionToken && params.callId) {
        await rejectCall(sessionToken, params.callId);
      }
    } catch (err) {
      console.error("Failed to reject call:", err);
    } finally {
      clearTimeout(navigationTimeout);
      navigateBack();
    }
  };

  const handleAcceptCall = async () => {
    if (!sessionToken || !params.callId) return;
    
    try {
      setIsConnecting(true);
      const response = await answerCall(sessionToken, params.callId);
      setCallData(response);
      setCallMode("active");
      setIsConnecting(false);
    } catch (err: any) {
      setError(err.message || "Failed to answer call");
      setIsConnecting(false);
    }
  };

  const toggleMute = () => setIsMuted(!isMuted);
  const toggleSpeaker = () => setIsSpeakerOn(!isSpeakerOn);
  const toggleVideo = () => setIsVideoEnabled(!isVideoEnabled);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.errorButton} onPress={() => router.back()}>
            <Text style={styles.errorButtonText}>{t("common.goBack")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Emergency back button */}
      <Pressable 
        style={styles.backButton} 
        onPress={navigateBack}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </Pressable>

      {/* Video background (placeholder) */}
      {callType === "video" && isVideoEnabled && (
        <View style={styles.videoBackground}>
          {/* In production, this would show the Agora video stream */}
          <View style={styles.localVideo}>
            <Ionicons name="videocam" size={32} color="#fff" />
          </View>
        </View>
      )}

      {/* User info */}
      <View style={styles.userInfo}>
        {params.userPhoto ? (
          <Image source={{ uri: params.userPhoto }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {params.userName?.charAt(0) || "?"}
            </Text>
          </View>
        )}
        <Text style={styles.userName}>{params.userName || t("calls.unknown")}</Text>
        
        {isConnecting && (
          <View style={styles.statusContainer}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.statusText}>
              {callMode === "outgoing" ? t("calls.calling") : t("calls.connecting")}
            </Text>
          </View>
        )}
        
        {callMode === "active" && (
          <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
        )}
        
        {callMode === "incoming" && !isConnecting && (
          <Text style={styles.statusText}>
            {callType === "video" ? t("calls.incomingVideo") : t("calls.incomingVoice")}
          </Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        {/* Media controls (only show when call is active or outgoing) */}
        {(callMode === "active" || callMode === "outgoing") && (
          <View style={styles.mediaControls}>
            <Pressable
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={toggleMute}
            >
              <Ionicons
                name={isMuted ? "mic-off" : "mic"}
                size={24}
                color="#fff"
              />
              <Text style={styles.controlLabel}>
                {isMuted ? t("calls.unmute") : t("calls.mute")}
              </Text>
            </Pressable>

            {callType === "video" && (
              <Pressable
                style={[styles.controlButton, !isVideoEnabled && styles.controlButtonActive]}
                onPress={toggleVideo}
              >
                <Ionicons
                  name={isVideoEnabled ? "videocam" : "videocam-off"}
                  size={24}
                  color="#fff"
                />
                <Text style={styles.controlLabel}>
                  {isVideoEnabled ? t("calls.videoOff") : t("calls.videoOn")}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
              onPress={toggleSpeaker}
            >
              <Ionicons
                name={isSpeakerOn ? "volume-high" : "volume-medium"}
                size={24}
                color="#fff"
              />
              <Text style={styles.controlLabel}>
                {isSpeakerOn ? t("calls.speakerOff") : t("calls.speaker")}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Call action buttons */}
        <View style={styles.callActions}>
          {callMode === "incoming" && !isConnecting && (
            <>
              <Pressable style={styles.rejectButton} onPress={handleRejectCall}>
                <Ionicons name="close" size={32} color="#fff" />
              </Pressable>
              <Pressable style={styles.acceptButton} onPress={handleAcceptCall}>
                <Ionicons name="call" size={32} color="#fff" />
              </Pressable>
            </>
          )}

          {(callMode === "outgoing" || callMode === "active") && (
            <Pressable style={styles.endCallButton} onPress={handleEndCall}>
              <Ionicons name="call" size={32} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  videoBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f0f1a",
  },
  localVideo: {
    position: "absolute",
    top: 100,
    right: 20,
    width: 100,
    height: 140,
    backgroundColor: "#333",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#4c6fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#fff",
  },
  userName: {
    fontSize: 28,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
  },
  durationText: {
    fontSize: 18,
    color: "#4ade80",
    fontWeight: "500",
  },
  controlsContainer: {
    paddingBottom: 50,
    paddingHorizontal: 20,
  },
  mediaControls: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    marginBottom: 40,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlButtonActive: {
    backgroundColor: "#4c6fff",
  },
  controlLabel: {
    fontSize: 10,
    color: "#fff",
    marginTop: 4,
  },
  callActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 40,
  },
  endCallButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
    transform: [{ rotate: "135deg" }],
  },
  acceptButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    alignItems: "center",
  },
  rejectButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ef4444",
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: "#fff",
    marginTop: 16,
    textAlign: "center",
  },
  errorButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#4c6fff",
    borderRadius: 8,
  },
  errorButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  backButton: {
    position: "absolute",
    top: 50,
    left: 20,
    zIndex: 100,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
});

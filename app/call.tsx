import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { COLORS } from "../lib/designTokens";
import { useSocket, useSocketEvent } from "../context/SocketContext";
import {
  initiateCall,
  answerCall,
  endCall,
  rejectCall,
  getCallStatus,
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
    channel?: string;
    token?: string;
    appId?: string;
  }>();
  
  const { sessionToken } = useAuth();
  const { connected: wsConnected } = useSocket();
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
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(callType === "video");
  
  const engineRef = useRef<any>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const [agoraAvailable, setAgoraAvailable] = useState(false);
  const [agoraModules, setAgoraModules] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const agora = await import("react-native-agora");
        if (mounted) {
          setAgoraModules(agora);
          setAgoraAvailable(true);
        }
      } catch (e) {
        console.log("[Call] react-native-agora not available (Expo Go). Calls require a development build.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  useSocketEvent("call_status", (data: any) => {
    const call = data.call;
    if (!call || call.call_id !== callIdRef.current) return;

    if (call.status === "active" && callMode === "outgoing") {
      if (pollingRef.current) clearInterval(pollingRef.current);
      const cd = callData;
      if (cd) joinChannel(cd.channel, cd.token, cd.caller_uid, callType === "video");
    } else if (call.status === "rejected" || call.status === "ended") {
      if (pollingRef.current) clearInterval(pollingRef.current);
      navigateBack();
    }
  });

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

  // Cleanup engine on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        try {
          engineRef.current.leaveChannel();
          engineRef.current.release();
        } catch (e) {
          // Engine may not be initialized
        }
        engineRef.current = null;
      }
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Request camera and microphone permissions
  const requestPermissions = async () => {
    if (Platform.OS === "web") {
      return true;
    }

    try {
      const audioPermission = await Camera.requestMicrophonePermissionsAsync();
      if (audioPermission.status !== "granted") {
        Alert.alert(
          t("calls.permissionRequired"),
          t("calls.microphonePermission"),
          [{ text: t("common.close") }]
        );
        return false;
      }

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

  // Initialize Agora engine
  const initEngine = useCallback((appId: string) => {
    if (engineRef.current) return engineRef.current;
    if (!agoraModules) return null;

    const engine = agoraModules.createAgoraRtcEngine();
    engine.initialize({ appId });

    engine.addListener("onJoinChannelSuccess", (connection: any, elapsed: any) => {
      console.log("Joined channel:", connection.channelId, "uid:", connection.localUid);
      setCallMode("active");
      setIsConnecting(false);
    });

    engine.addListener("onUserJoined", (connection: any, remoteUid_: number) => {
      console.log("Remote user joined:", remoteUid_);
      setRemoteUid(remoteUid_);
    });

    engine.addListener("onUserOffline", (connection: any, remoteUid_: number) => {
      console.log("Remote user left:", remoteUid_);
      setRemoteUid(null);
      handleEndCall();
    });

    engine.addListener("onConnectionStateChanged", (connection: any, state: number, reason: number) => {
      console.log("Connection state:", state, "reason:", reason);
      if (state === agoraModules.ConnectionStateType.ConnectionStateDisconnected) {
        navigateBack();
      }
    });

    engineRef.current = engine;
    return engine;
  }, [agoraModules]);

  // Join channel with engine
  const joinChannel = useCallback(async (channel: string, token: string, uid: number, enableVideo: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (e) {
      console.log("Audio mode error:", e);
    }

    engine.enableAudio();
    if (enableVideo) {
      engine.enableVideo();
    }

    engine.joinChannel(token, channel, uid, {
      publishMicrophoneTrack: true,
      publishCameraTrack: enableVideo,
      clientRoleType: agoraModules?.ClientRoleType.ClientRoleBroadcaster,
    });
  }, []);

  // Initialize call
  useEffect(() => {
    const initCall = async () => {
      if (!agoraAvailable || !agoraModules) {
        setError("Voice/Video calls require a development build of Perix. Please install the full app to use this feature.");
        setIsConnecting(false);
        return;
      }
      if (!sessionToken) {
        setError("Not authenticated");
        setIsConnecting(false);
        return;
      }

      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        setError(t("calls.permissionDenied"));
        setIsConnecting(false);
        return;
      }

      try {
        if (callMode === "outgoing" && params.userId) {
          const response = await initiateCall(sessionToken, params.userId, callType);
          setCallData(response);
          callIdRef.current = response.call_id;

          const appId = response.app_id || AGORA_APP_ID;
          const channel = response.channel;
          const token = response.token;
          const uid = response.caller_uid;

          const engine = initEngine(appId);

          if (!wsConnected) {
            pollingRef.current = setInterval(async () => {
              try {
                const status = await getCallStatus(sessionToken, response.call_id);
                if (status.status === "active") {
                  clearInterval(pollingRef.current!);
                  joinChannel(channel, token, uid, callType === "video");
                } else if (status.status === "rejected" || status.status === "ended") {
                  clearInterval(pollingRef.current!);
                  navigateBack();
                }
              } catch (e) {
                // Keep polling
              }
            }, 3000);
          }

          setIsConnecting(false);

        } else if (callMode === "incoming" && params.callId && params.channel && params.token) {
          const appId = params.appId || AGORA_APP_ID;
          const engine = initEngine(appId);

          const response = await answerCall(sessionToken, params.callId);
          setCallData(response);

          const channel = params.channel;
          const token = params.token;
          const uid = response.callee_uid;

          joinChannel(channel, token, uid, callType === "video");
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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    if (engineRef.current) {
      try {
        engineRef.current.leaveChannel();
        engineRef.current.release();
      } catch (e) {
        // May fail if not joined
      }
      engineRef.current = null;
    }

    const navigationTimeout = setTimeout(() => {
      navigateBack();
    }, 1000);

    try {
      if (sessionToken && callData?.call_id) {
        await endCall(sessionToken, callData.call_id);
      }
    } catch (err) {
      console.error("Failed to end call:", err);
    } finally {
      clearTimeout(navigationTimeout);
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
      // Final fallback: navigate to messages tab
      router.navigate("/(tabs)/messages" as any);
    } catch (e) {
      console.error("Navigation error:", e);
      try {
        router.navigate("/(tabs)/messages" as any);
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

  const toggleMute = () => {
    if (engineRef.current) {
      if (isMuted) {
        engineRef.current.enableAudio();
      } else {
        engineRef.current.disableAudio();
      }
    }
    setIsMuted(!isMuted);
  };

  const toggleSpeaker = () => {
    if (engineRef.current) {
      if (isSpeakerOn) {
        engineRef.current.setEnableSpeakerphone(false);
      } else {
        engineRef.current.setEnableSpeakerphone(true);
      }
    }
    setIsSpeakerOn(!isSpeakerOn);
  };

  const toggleVideo = () => {
    if (engineRef.current) {
      if (localVideoEnabled) {
        engineRef.current.disableVideo();
      } else {
        engineRef.current.enableVideo();
      }
    }
    setLocalVideoEnabled(!localVideoEnabled);
    setIsVideoEnabled(!localVideoEnabled);
  };

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

      {/* Video background */}
      {callType === "video" && agoraAvailable && (
        <View style={styles.videoBackground}>
          {remoteUid ? (
            <agoraModules.RtcSurfaceView
              style={styles.remoteVideo}
              canvas={{ uid: remoteUid, renderMode: agoraModules.RenderModeType.RenderModeHidden }}
            />
          ) : (
            <View style={styles.remoteVideoPlaceholder} />
          )}
          {localVideoEnabled && (
            <View style={styles.localVideo}>
              <agoraModules.RtcSurfaceView
                style={{ width: 100, height: 140, borderRadius: 12 }}
                canvas={{ uid: 0, renderMode: agoraModules.RenderModeType.RenderModeHidden }}
              />
            </View>
          )}
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

            {callType === "video" && isVideoEnabled && (
              <Pressable
                style={styles.controlButton}
                onPress={() => engineRef.current?.switchCamera()}
              >
                <Ionicons name="camera-reverse" size={24} color="#fff" />
                <Text style={styles.controlLabel}>{t("calls.swapCamera") || "Swap"}</Text>
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
    borderRadius: 12,
    overflow: "hidden",
    zIndex: 10,
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  remoteVideoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
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
    backgroundColor: COLORS.primaryDark,
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
    backgroundColor: "rgba(76, 111, 255, 0.8)",
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
    backgroundColor: COLORS.primaryDark,
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
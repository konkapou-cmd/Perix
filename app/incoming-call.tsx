import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Animated,
  Vibration,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Audio } from "expo-av";
import { useAuth } from "../context/AuthContext";
import { answerCall, rejectCall } from "../lib/api";

export default function IncomingCallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { sessionToken } = useAuth();
  const params = useLocalSearchParams<{
    callId: string;
    callerName: string;
    callerPhoto?: string;
    callType: string;
  }>();

  const [isAnswering, setIsAnswering] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for avatar
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Slide up animation for buttons
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  // Play ringtone and vibrate
  useEffect(() => {
    let isMounted = true;
    let soundObject: Audio.Sound | null = null;
    
    const playRingtone = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });

        // Create and play a simple ringtone using the bundled sound
        // We'll use a looping approach to create a ringtone effect
        const { sound: ringSound } = await Audio.Sound.createAsync(
          { uri: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' }, // Simple notification sound
          { 
            isLooping: true,
            volume: 1.0,
            shouldPlay: true,
          }
        );
        
        if (isMounted) {
          soundObject = ringSound;
          setSound(ringSound);
        } else {
          await ringSound.unloadAsync();
        }

        // Vibrate pattern: wait 500ms, vibrate 1000ms, repeat
        if (Platform.OS !== "web") {
          const pattern = [500, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000];
          Vibration.vibrate(pattern, true);
        }
      } catch (error) {
        console.log("Error setting up audio:", error);
        // Fallback to vibration only
        if (Platform.OS !== "web") {
          const pattern = [500, 1000, 500, 1000, 500, 1000];
          Vibration.vibrate(pattern, true);
        }
      }
    };

    playRingtone();

    return () => {
      isMounted = false;
      Vibration.cancel();
      if (soundObject) {
        soundObject.stopAsync().then(() => soundObject?.unloadAsync());
      }
    };
  }, []);

  const handleAnswer = async () => {
    if (!sessionToken || !params.callId || isAnswering) return;
    
    setIsAnswering(true);
    Vibration.cancel();
    
    try {
      const response = await answerCall(sessionToken, params.callId);
      
      // Navigate to call screen with active call
      router.push({
        pathname: "/call",
        params: {
          callId: params.callId,
          userId: response.caller_uid.toString(),
          userName: params.callerName,
          userPhoto: params.callerPhoto,
          callType: params.callType,
          mode: "active",
          channel: response.channel,
          token: response.token,
        },
      });
    } catch (error) {
      console.error("Failed to answer call:", error);
      router.back();
    }
  };

  const handleReject = async () => {
    Vibration.cancel();
    
    if (sessionToken && params.callId) {
      try {
        await rejectCall(sessionToken, params.callId);
      } catch (error) {
        console.error("Failed to reject call:", error);
      }
    }
    router.back();
  };

  const callTypeText = params.callType === "video" 
    ? t("calls.incomingVideo") 
    : t("calls.incomingVoice");

  return (
    <SafeAreaView style={styles.container}>
      {/* Background gradient effect */}
      <View style={styles.backgroundOverlay} />
      
      {/* Caller info */}
      <View style={styles.callerInfo}>
        <Animated.View 
          style={[
            styles.avatarContainer,
            { transform: [{ scale: pulseAnim }] }
          ]}
        >
          <View style={styles.pulseRing} />
          <View style={styles.pulseRingOuter} />
          {params.callerPhoto ? (
            <Image source={{ uri: params.callerPhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {params.callerName?.charAt(0) || "?"}
              </Text>
            </View>
          )}
        </Animated.View>
        
        <Text style={styles.callerName}>{params.callerName || t("calls.unknown")}</Text>
        <Text style={styles.callType}>{callTypeText}</Text>
        
        <View style={styles.callTypeIcon}>
          <Ionicons 
            name={params.callType === "video" ? "videocam" : "call"} 
            size={24} 
            color="rgba(255,255,255,0.8)" 
          />
        </View>
      </View>

      {/* Action buttons */}
      <Animated.View 
        style={[
          styles.actionsContainer,
          {
            transform: [{
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [100, 0],
              })
            }],
            opacity: slideAnim,
          }
        ]}
      >
        <View style={styles.actionRow}>
          {/* Reject button */}
          <View style={styles.actionItem}>
            <Pressable 
              style={[styles.actionButton, styles.rejectButton]}
              onPress={handleReject}
            >
              <Ionicons name="close" size={32} color="#fff" />
            </Pressable>
            <Text style={styles.actionLabel}>{t("calls.decline")}</Text>
          </View>

          {/* Accept button */}
          <View style={styles.actionItem}>
            <Pressable 
              style={[styles.actionButton, styles.acceptButton, isAnswering && styles.buttonDisabled]}
              onPress={handleAnswer}
              disabled={isAnswering}
            >
              <Ionicons 
                name={params.callType === "video" ? "videocam" : "call"} 
                size={32} 
                color="#fff" 
              />
            </Pressable>
            <Text style={styles.actionLabel}>{t("calls.accept")}</Text>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1a1a2e",
    opacity: 0.95,
  },
  callerInfo: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 24,
  },
  pulseRing: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(76, 111, 255, 0.2)",
    top: -20,
    left: -20,
  },
  pulseRingOuter: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(76, 111, 255, 0.1)",
    top: -40,
    left: -40,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#000000",
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#fff",
  },
  callerName: {
    fontSize: 32,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  callType: {
    fontSize: 18,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 16,
  },
  callTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  actionsContainer: {
    paddingBottom: 60,
    paddingHorizontal: 40,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  actionItem: {
    alignItems: "center",
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  rejectButton: {
    backgroundColor: "#ef4444",
  },
  acceptButton: {
    backgroundColor: "#22c55e",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionLabel: {
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
});

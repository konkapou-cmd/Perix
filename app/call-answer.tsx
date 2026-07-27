import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useAuth } from "../context/AuthContext";
import { answerCall, CallResponse } from "../lib/api";

export default function CallAnswerScreen() {
  const { sessionToken } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    callId: string;
    callerId: string;
    callerName: string;
    callerPhoto?: string;
    callType: string;
  }>();

  useEffect(() => {
    let cancelled = false;

    const accept = async () => {
      if (!sessionToken || !params.callId) {
        router.back();
        return;
      }

      try {
        const response: CallResponse = await answerCall(sessionToken, params.callId);

        if (cancelled) return;

        // Dismiss the incoming call notification
        await Notifications.dismissAllNotificationsAsync();

        // Navigate to active call screen
        router.replace({
          pathname: "/call",
          params: {
            callId: params.callId,
            userId: response.caller_uid.toString(),
            userName: params.callerName,
            userPhoto: params.callerPhoto || "",
            callType: params.callType,
            mode: "active",
            channel: response.channel,
            token: response.token,
          },
        });
      } catch (error) {
        console.error("Failed to answer call from deep link:", error);
        if (!cancelled) router.back();
      }
    };

    accept();

    return () => { cancelled = true; };
  }, [sessionToken, params.callId]);

  return (
    <View style={s.container}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
});

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { getCallHistory, deleteCallHistory, deleteAllCallHistory, CallRecord } from "../lib/api";
import { useSafeNavigation } from "../hooks/useSafeNavigation";

export default function CallHistoryScreen() {
  const { t } = useTranslation();
  const { safeGoBackToMessages, router } = useSafeNavigation();
  const { sessionToken, user } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCalls = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const data = await getCallHistory(sessionToken);
      setCalls(data);
    } catch (error) {
      console.error("Failed to load call history:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    loadCalls();
  }, [loadCalls]);

  const handleDeleteCall = (callId: string) => {
    Alert.alert(
      t("calls.deleteCall"),
      t("calls.deleteCallConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            if (!sessionToken) return;
            try {
              await deleteCallHistory(sessionToken, callId);
              setCalls(prev => prev.filter(c => c.call_id !== callId));
            } catch (error) {
              console.error("Failed to delete call:", error);
            }
          },
        },
      ]
    );
  };

  const handleClearAllCalls = () => {
    if (calls.length === 0) return;
    
    Alert.alert(
      t("calls.clearAll"),
      t("calls.clearAllConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("calls.clearAll"),
          style: "destructive",
          onPress: async () => {
            if (!sessionToken) return;
            try {
              await deleteAllCallHistory(sessionToken);
              setCalls([]);
            } catch (error) {
              console.error("Failed to clear call history:", error);
            }
          },
        },
      ]
    );
  };

  const handleOpenConversation = (call: CallRecord) => {
    const otherUserId = call.other_user?.user_id || (call.is_outgoing ? call.callee_id : call.caller_id);
    const otherUserName = call.other_user?.name || t("calls.unknown");
    
    router.push({
      pathname: "/(tabs)/messages/[id]",
      params: {
        id: otherUserId,
        name: otherUserName,
      },
    });
  };

  const formatCallTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (hours < 48) {
      return t("calls.yesterday");
    } else {
      return date.toLocaleDateString();
    }
  };

  const getCallIcon = (call: CallRecord) => {
    const isOutgoing = call.is_outgoing ?? call.caller_id === user?.user_id;
    const isMissed = call.status === "missed" || call.status === "rejected";
    
    if (isMissed) {
      return { name: "call-outline" as const, color: "#ef4444" };
    }
    if (isOutgoing) {
      return { name: "arrow-up-outline" as const, color: "#4c6fff" };
    }
    return { name: "arrow-down-outline" as const, color: "#10b981" };
  };

  const renderCall = ({ item }: { item: CallRecord }) => {
    const isOutgoing = item.is_outgoing ?? item.caller_id === user?.user_id;
    const otherName = item.other_user?.name || t("calls.unknown");
    const icon = getCallIcon(item);
    const isMissed = item.status === "missed" || item.status === "rejected";
    const duration = item.duration_seconds;

    return (
      <Pressable
        style={styles.callItem}
        onPress={() => handleOpenConversation(item)}
        data-testid={`call-item-${item.call_id}`}
      >
        <View style={styles.callIcon}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>
        <View style={styles.callInfo}>
          <Text style={[styles.callName, isMissed && styles.missedText]}>
            {otherName}
          </Text>
          <View style={styles.callMeta}>
            <Ionicons
              name={item.call_type === "video" ? "videocam-outline" : "call-outline"}
              size={14}
              color="#6b7280"
            />
            <Text style={styles.callStatus}>
              {isMissed ? t("calls.missed") : isOutgoing ? t("calls.outgoing") : t("calls.incoming")}
              {duration ? ` · ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}` : ""}
            </Text>
          </View>
        </View>
        <View style={styles.callActions}>
          <Text style={styles.callTime}>{formatCallTime(item.created_at)}</Text>
          <Pressable
            style={styles.deleteButton}
            onPress={(e) => {
              e.stopPropagation();
              handleDeleteCall(item.call_id);
            }}
            data-testid={`delete-call-${item.call_id}`}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={safeGoBackToMessages} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>
          <Text style={styles.title}>{t("calls.callHistory")}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#4c6fff" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={safeGoBackToMessages} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.title}>{t("calls.callHistory")}</Text>
        {calls.length > 0 ? (
          <Pressable onPress={handleClearAllCalls} style={styles.clearAllButton} data-testid="clear-all-calls-btn">
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {calls.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="call-outline" size={48} color="#9ca3af" />
          <Text style={styles.emptyText}>{t("calls.noCalls")}</Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          keyExtractor={(item) => item.call_id}
          renderItem={renderCall}
          onRefresh={() => {
            setRefreshing(true);
            loadCalls();
          }}
          refreshing={refreshing}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f6fb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    padding: 8,
  },
  clearAllButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
  },
  list: {
    padding: 16,
  },
  callItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  callIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  callInfo: {
    flex: 1,
  },
  callName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  missedText: {
    color: "#ef4444",
  },
  callMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  callStatus: {
    fontSize: 13,
    color: "#6b7280",
    marginLeft: 4,
  },
  callActions: {
    alignItems: "flex-end",
  },
  callTime: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 8,
  },
  deleteButton: {
    padding: 4,
  },
});

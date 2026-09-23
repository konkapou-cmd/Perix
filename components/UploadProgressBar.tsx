import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useUploads } from "../context/UploadContext";
import { COLORS } from "../lib/designTokens";

export default function UploadProgressBar() {
  const { t } = useTranslation();
  const { tasks, dismiss } = useUploads();
  const visible = tasks.filter((t) => t.status === "uploading" || t.status === "processing");

  if (visible.length === 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {visible.map((task) => (
        <View key={task.id} style={styles.card}>
          <Pressable
            style={styles.closeBtn}
            onPress={() => dismiss(task.id)}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color="#6b7280" />
          </Pressable>
          <View style={styles.headerRow}>
            {task.status === "processing" ? (
              <ActivityIndicator size="small" color="#59ABE3" />
            ) : (
              <Ionicons name="cloud-upload" size={18} color="#59ABE3" />
            )}
            <Text style={styles.title} numberOfLines={1}>
              {task.status === "processing"
                ? t("upload.videoProcessingShort", "Processing video")
                : `${task.label} ${task.progress}%`}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${task.progress}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 20 : 90,
    right: 16,
    left: Platform.OS === "web" ? undefined : 16,
    alignItems: "flex-end",
    gap: 8,
    zIndex: 300,
  },
  card: {
    minWidth: 240,
    maxWidth: 340,
    backgroundColor: COLORS.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(38,67,72,0.15)",
    padding: 12,
    paddingRight: 30,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#264348",
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EDF4FB",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#59ABE3",
  },
});

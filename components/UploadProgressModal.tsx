import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { UploadProgress } from "../lib/api";

type Props = {
  visible: boolean;
  progress: UploadProgress | null;
};

export const UploadProgressModal: React.FC<Props> = ({ visible, progress }) => {
  const { t } = useTranslation();

  const getPhaseText = (phase: string) => {
    switch (phase) {
      case "preparing":
        return t("upload.preparing", "Preparing video...");
      case "uploading":
        return t("upload.uploading", "Uploading...");
      case "processing":
        return t("upload.processing", "Processing...");
      case "complete":
        return t("upload.complete", "Complete!");
      default:
        return t("upload.uploading", "Uploading...");
    }
  };

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case "preparing":
        return "file-video";
      case "uploading":
        return "cloud-upload";
      case "processing":
        return "cog";
      case "complete":
        return "check-circle";
      default:
        return "cloud-upload";
    }
  };

  if (!progress) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            {progress.phase === "complete" ? (
              <View style={styles.checkIcon}>
                <Text style={styles.checkText}>✓</Text>
              </View>
            ) : (
              <ActivityIndicator size="large" color="#6366f1" />
            )}
          </View>

          <Text style={styles.phaseText}>{getPhaseText(progress.phase)}</Text>

          {progress.phase === "uploading" && progress.chunksUploaded !== undefined && (
            <Text style={styles.chunkText}>
              {t("upload.chunks", "Chunk {{current}} of {{total}}", {
                current: progress.chunksUploaded,
                total: progress.totalChunks,
              })}
            </Text>
          )}

          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${progress.progress}%` },
                progress.phase === "complete" && styles.progressBarComplete,
              ]}
            />
          </View>

          <Text style={styles.percentText}>{Math.round(progress.progress)}%</Text>

          {progress.phase !== "complete" && (
            <Text style={styles.hintText}>
              {t("upload.pleaseWait", "Please wait, do not close the app")}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "#1f2937",
    borderRadius: 16,
    padding: 24,
    width: "80%",
    maxWidth: 320,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    marginBottom: 16,
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  checkIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
  },
  checkText: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "bold",
  },
  phaseText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  chunkText: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 16,
  },
  progressBarContainer: {
    width: "100%",
    height: 8,
    backgroundColor: "#374151",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#6366f1",
    borderRadius: 4,
  },
  progressBarComplete: {
    backgroundColor: "#10b981",
  },
  percentText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6366f1",
    marginBottom: 8,
  },
  hintText: {
    fontSize: 12,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8,
  },
});

export default UploadProgressModal;

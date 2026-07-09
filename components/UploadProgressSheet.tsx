import React, { useEffect, useCallback } from "react";
import { Modal, Pressable, StyleSheet, Text, View, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS } from "../lib/designTokens";
import { UploadProgress } from "../lib/api";

type UploadContext = "post" | "gallery" | "avatar" | "cover" | "video" | "photo" | "story";

type Props = {
  visible: boolean;
  progress: UploadProgress | null;
  context?: UploadContext;
  mode?: "blocking" | "inline";
  onDismiss?: () => void;
};

const CONTEXT_ICONS: Record<UploadContext, React.ComponentProps<typeof Ionicons>["name"]> = {
  post: "document-text",
  gallery: "images",
  avatar: "person-circle",
  cover: "image",
  video: "videocam",
  photo: "camera",
  story: "play-circle",
};

export const UploadProgressSheet: React.FC<Props> = ({
  visible,
  progress,
  context = "post",
  mode = "blocking",
  onDismiss,
}) => {
  const { t } = useTranslation();

  const slideAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode !== "inline") return;
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, mode, slideAnim]);

  const autoDismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== "inline") return;
    if (progress?.phase === "complete") {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current);
      autoDismissTimer.current = setTimeout(() => {
        onDismiss?.();
        autoDismissTimer.current = null;
      }, 1500);
    }
    return () => {
      if (autoDismissTimer.current) {
        clearTimeout(autoDismissTimer.current);
        autoDismissTimer.current = null;
      }
    };
  }, [progress?.phase, mode, onDismiss]);

  const getUploadLabel = useCallback(() => {
    switch (context) {
      case "gallery":
        return t("upload.editingGallery", "Editing gallery...");
      case "video":
        return t("upload.processingVideo", "Processing video...");
      case "photo":
        return t("upload.processingPhoto", "Processing photo...");
      case "avatar":
        return t("upload.updatingAvatar", "Updating profile photo...");
      case "cover":
        return t("upload.updatingCover", "Updating cover photo...");
      case "story":
        return t("upload.creatingStory", "Creating story...");
      default:
        return t("upload.creatingPost", "Creating post...");
    }
  }, [context, t]);

  const getPhaseText = useCallback(() => {
    if (!progress) return "";
    switch (progress.phase) {
      case "preparing":
        return t("upload.preparing", "Preparing...");
      case "uploading":
        return getUploadLabel();
      case "processing":
        return t("upload.processing", "Processing...");
      case "complete":
        return t("upload.complete", "Complete!");
      default:
        return getUploadLabel();
    }
  }, [progress, getUploadLabel, t]);

  const getPhaseIcon = useCallback((): React.ComponentProps<typeof Ionicons>["name"] => {
    if (!progress) return CONTEXT_ICONS[context];
    switch (progress.phase) {
      case "preparing":
        return CONTEXT_ICONS[context];
      case "uploading":
        return "cloud-upload-outline";
      case "processing":
        return "cog-outline";
      case "complete":
        return "checkmark-circle-outline";
      default:
        return "cloud-upload-outline";
    }
  }, [progress, context]);

  if (!progress) return null;

  const isComplete = progress.phase === "complete";
  const icon = getPhaseIcon();
  const phaseText = getPhaseText();
  const percent = Math.round(progress.progress);

  if (mode === "inline") {
    const translateY = slideAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [120, 0],
    });

    return (
      <Animated.View
        style={[
          inlineS.container,
          {
            transform: [{ translateY }],
            opacity: slideAnim,
          },
        ]}
      >
        <View style={inlineS.inner}>
          <View style={inlineS.iconContainer}>
            {isComplete ? (
              <View style={inlineS.checkCircle}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            ) : (
              <Ionicons name={icon} size={16} color={COLORS.gold} />
            )}
          </View>
          <View style={inlineS.textContainer}>
            <Text style={inlineS.label} numberOfLines={1}>{phaseText}</Text>
            <View style={inlineS.progressBarBg}>
              <View
                style={[
                  inlineS.progressBar,
                  { width: `${percent}%` },
                  isComplete && inlineS.progressBarDone,
                ]}
              />
            </View>
          </View>
          <Text style={inlineS.percent}>{percent}%</Text>
          {isComplete && onDismiss && (
            <Pressable onPress={onDismiss} hitSlop={12}>
              <Ionicons name="close" size={18} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>
      </Animated.View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={blockingS.overlay}>
        <View style={blockingS.card}>
          <View style={blockingS.iconCircle}>
            {isComplete ? (
              <View style={blockingS.checkCircle}>
                <Ionicons name="checkmark" size={28} color="#fff" />
              </View>
            ) : (
              <Ionicons name={icon} size={28} color={COLORS.gold} />
            )}
          </View>

          <Text style={blockingS.phaseText}>{phaseText}</Text>

          <View style={blockingS.progressBarBg}>
            <View
              style={[
                blockingS.progressBar,
                { width: `${percent}%` },
                isComplete && blockingS.progressBarDone,
              ]}
            />
          </View>

          <Text style={blockingS.percentText}>{percent}%</Text>

          {!isComplete && (
            <Text style={blockingS.hintText}>
              {t("upload.pleaseWait", "Please wait, do not close the app")}
            </Text>
          )}

          {isComplete && onDismiss && (
            <Pressable style={blockingS.dismissBtn} onPress={onDismiss}>
              <Text style={blockingS.dismissText}>{t("upload.dismiss", "Done")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default UploadProgressSheet;

const blockingS = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.page,
    width: "80%",
    maxWidth: 320,
    alignItems: "center",
    ...SHADOWS.strong,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.backgroundPage,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.compact,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  phaseText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
    marginBottom: SPACING.small,
    textAlign: "center",
  },
  progressBarBg: {
    width: "100%",
    height: 8,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: SPACING.small,
  },
  progressBar: {
    height: "100%",
    backgroundColor: COLORS.gold,
    borderRadius: 4,
  },
  progressBarDone: {
    backgroundColor: COLORS.success,
  },
  percentText: {
    fontSize: FONT_SIZES.bodySmall,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.gold,
    marginBottom: SPACING.small,
  },
  hintText: {
    fontSize: FONT_SIZES.small,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: SPACING.tiny,
  },
  dismissBtn: {
    marginTop: SPACING.small,
    paddingHorizontal: SPACING.section,
    paddingVertical: SPACING.small,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
  },
  dismissText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: "#fff",
  },
});

const inlineS = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: SPACING.page,
    left: SPACING.compact,
    right: SPACING.compact,
    zIndex: 9999,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.compact,
    paddingHorizontal: SPACING.compact,
    gap: SPACING.small,
    ...SHADOWS.medium,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.success,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    gap: SPACING.tiny,
  },
  label: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.medium as any,
    color: COLORS.textPrimary,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: COLORS.gold,
    borderRadius: 2,
  },
  progressBarDone: {
    backgroundColor: COLORS.success,
  },
  percent: {
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.semibold as any,
    color: COLORS.gold,
    minWidth: 36,
    textAlign: "right",
  },
});

import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, TextInput, ScrollView,
  Dimensions, Animated, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { createPost, createStory, uploadMedia, uploadImageToCloudinary, uploadVideoMux, UploadProgress, deletePost } from "../lib/api";
import UploadProgressSheet from "../components/UploadProgressSheet";
import * as FileSystem from "expo-file-system/legacy";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CANVAS_HEIGHT = SCREEN_WIDTH * 0.75;
const MAX_VIDEO_DURATION = 30;

export default function MediaEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const { uri, type } = useLocalSearchParams<{ uri: string; type: string }>();
  const { sessionToken, activeIdentity } = useAuth();
  const isVideo = type === "video";
  const decodedUri = decodeURIComponent(uri || "");

  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ phase: "preparing", progress: 0 });
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(MAX_VIDEO_DURATION);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimMode, setTrimMode] = useState(false);

  const player = useVideoPlayer(isVideo ? decodedUri : "", (p) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    if (!isVideo) return;
    const sub = player.addListener("playingChange", (e) => setIsPlaying(e.isPlaying));
    return () => sub.remove();
  }, [player, isVideo]);

  useEffect(() => {
    if (!isVideo) return;
    const sub = player.addListener("sourceLoad", (payload: any) => {
      const d = payload?.duration ?? 30;
      setVideoDuration(Math.min(d, MAX_VIDEO_DURATION));
      setTrimEnd(Math.min(d, MAX_VIDEO_DURATION));
    });
    return () => sub.remove();
  }, [player, isVideo]);

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else player.play();
  };

  const publishAsPost = async () => {
    if (!sessionToken) return;
    setPublishing(true);
    try {
      const actor = activeIdentity ? { type: activeIdentity.type, id: activeIdentity.id } : undefined;
      const businessId = activeIdentity?.type === "business" ? activeIdentity.id : undefined;

      if (isVideo) {
        const isRemote = decodedUri.startsWith("http");
        if (isRemote) {
          const muxId = decodedUri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)\.m3u8/)?.[1];
          await createPost(sessionToken, caption || t("home.sharedAnUpdate", "Shared an update"), null, null, businessId, actor, null, [], null, null, null, decodedUri, null, null, muxId || undefined, muxId || undefined, "ready");
        } else {
          setShowUploadProgress(true);
          const post = await createPost(sessionToken, caption || t("home.sharedAnUpdate", "Shared an update"), null, null, businessId, actor, null, [], null, null, null, null, null, null);
          try {
            const muxResult = await uploadVideoMux(sessionToken, decodedUri, `post:${post.post_id}`, setUploadProgress);
            setShowUploadProgress(false);
            const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : undefined);
            await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api/posts/${post.post_id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
              body: JSON.stringify({ video_url: videoUrl, mux_playback_id: muxResult.mux_playback_id, mux_thumbnail_url: muxResult.mux_thumbnail_url, video_status: "ready" }),
            });
          } catch (uploadError) {
            try { await deletePost(sessionToken, post.post_id); } catch (_) {}
            throw uploadError;
          }
        }
      } else {
        setShowUploadProgress(true);
        const imageUrl = await uploadImageToCloudinary(sessionToken, decodedUri);
        setShowUploadProgress(false);
        await createPost(sessionToken, caption || t("home.sharedAnUpdate", "Shared an update"), null, null, businessId, actor, null, [], null, null, imageUrl, null, null, null);
      }
      Alert.alert(t("editor.success", "Success!"), t("editor.postPublished", "Your post has been published!"), [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert(t("common.error"), t("editor.publishFailed", "Failed to publish"));
    } finally {
      setPublishing(false);
      setShowUploadProgress(false);
    }
  };

  const publishAsCityAd = async () => {
    if (!sessionToken || activeIdentity?.type !== "business") return;
    setPublishing(true);
    try {
      if (isVideo) {
        const info = await FileSystem.getInfoAsync(decodedUri);
        if (info.exists && info.size) {
          const sizeMB = info.size / (1024 * 1024);
          if (sizeMB > 3) { Alert.alert(t("common.error"), t("editor.maxDuration", "City Ads must be under 3 minutes")); return; }
        }
      }
      const mediaUrl = isVideo ? decodedUri : await uploadImageToCloudinary(sessionToken, decodedUri);
      await createStory(sessionToken, { media_url: mediaUrl, media_type: isVideo ? "video" : "image", text: caption, actor_id: activeIdentity.id, actor_type: activeIdentity.type as "business" });
      Alert.alert(t("editor.success", "Success!"), t("editor.cityAdPublished", "Your city ad has been published!"), [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (error) {
      Alert.alert(t("common.error"), t("editor.publishFailed", "Failed to publish"));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{isVideo ? t("editor.editVideo", "Video") : t("editor.editPhoto", "Photo")}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Preview */}
          <View style={styles.previewContainer}>
            {isVideo ? (
              <View style={styles.videoWrapper}>
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
                <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
                  {!isPlaying && (
                    <View style={styles.playOverlay}>
                      <View style={styles.playBtn}><Ionicons name="play" size={40} color="#fff" /></View>
                    </View>
                  )}
                </Pressable>
                {/* Trim controls */}
                {trimMode && (
                  <View style={styles.trimBar}>
                    <Pressable onPress={() => { setTrimStart(Math.max(0, trimStart - 1)); try { player.currentTime = trimStart; } catch (_) {} }}>
                      <Text style={styles.trimBtn}>-1s</Text>
                    </Pressable>
                    <Text style={styles.trimInfo}>{trimStart.toFixed(1)}s — {trimEnd.toFixed(1)}s</Text>
                    <Pressable onPress={() => { setTrimEnd(Math.min(videoDuration, trimEnd + 1)); try { player.currentTime = trimEnd; } catch (_) {} }}>
                      <Text style={styles.trimBtn}>+1s</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : (
              <Image source={{ uri: decodedUri }} style={styles.previewImage} resizeMode="contain" />
            )}
          </View>

          {/* Video trim toggle */}
          {isVideo && (
            <Pressable style={styles.trimToggle} onPress={() => { setTrimMode(!trimMode); if (trimMode) { try { player.currentTime = trimStart; } catch (_) {} } }}>
              <Ionicons name="cut" size={16} color={trimMode ? COLORS.primary : "#6b7280"} />
              <Text style={[styles.trimToggleText, trimMode && { color: COLORS.primary }]}>{t("editor.trim", "Trim")}</Text>
            </Pressable>
          )}

          {/* Caption */}
          <View style={styles.captionSection}>
            <Text style={styles.captionLabel}>{t("editor.caption", "Caption")}</Text>
            <TextInput
              style={styles.captionInput}
              value={caption}
              onChangeText={setCaption}
              placeholder={t("editor.captionPlaceholder", "Write a caption...")}
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={500}
            />
            <Text style={styles.charCount}>{caption.length}/500</Text>
          </View>
        </ScrollView>

        {/* Publish buttons */}
        <View style={styles.footer}>
          <Pressable style={[styles.publishBtn, publishing && { opacity: 0.5 }]} onPress={publishAsPost} disabled={publishing}>
            {publishing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.publishText}>{t("editor.publishPost", "Publish")}</Text>}
          </Pressable>
          {activeIdentity?.type === "business" && (
            <Pressable style={[styles.cityAdBtn, publishing && { opacity: 0.5 }]} onPress={publishAsCityAd} disabled={publishing}>
              <Ionicons name="megaphone" size={16} color="#fff" />
              <Text style={styles.cityAdText}>{t("editor.publishCityAd", "City Ad")}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <UploadProgressSheet visible={showUploadProgress} progress={uploadProgress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff" },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  previewContainer: { backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  videoWrapper: { width: SCREEN_WIDTH, height: CANVAS_HEIGHT, backgroundColor: "#000" },
  playOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.1)" },
  playBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  previewImage: { width: SCREEN_WIDTH, height: CANVAS_HEIGHT },
  trimToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginHorizontal: 16 },
  trimToggleText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  trimBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 10, backgroundColor: "rgba(0,0,0,0.6)" },
  trimBtn: { color: "#fff", fontSize: 14, fontWeight: "700", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8 },
  trimInfo: { color: "#fff", fontSize: 13, fontWeight: "500" },
  captionSection: { paddingHorizontal: 16, paddingTop: 16 },
  captionLabel: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 },
  captionInput: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.textPrimary, minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: "#e5e7eb" },
  charCount: { fontSize: 12, color: "#9ca3af", textAlign: "right", marginTop: 4 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  publishBtn: { flex: 1, backgroundColor: "#000", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  publishText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cityAdBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  cityAdText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
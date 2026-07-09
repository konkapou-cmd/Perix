import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, TextInput, ScrollView,
  Dimensions, Animated, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { createPost, createStory, uploadMedia, uploadImageToCloudinary, uploadVideoMux, UploadProgress, deletePost, getBusinesses, getMyFriends, BACKEND_URL } from "../lib/api";
import UploadProgressSheet from "../components/UploadProgressSheet";
import * as FileSystem from "expo-file-system/legacy";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";
import { MEDIA_LIMITS } from "../lib/constants/mediaLimits";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CANVAS_HEIGHT = SCREEN_WIDTH * 0.75;

export default function MediaEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const { uri, type, mode } = useLocalSearchParams<{ uri: string; type: string; mode?: string }>();
  const { sessionToken, activeIdentity } = useAuth();
  const isVideo = type === "video";

  const maxDurationSeconds = mode === "cover"
    ? MEDIA_LIMITS.camera.coverMaxDurationSeconds
    : MEDIA_LIMITS.camera.generalMaxDurationSeconds;
  const decodedUri = decodeURIComponent(uri || "");

  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadContext, setUploadContext] = useState<"image" | "video">("image");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ phase: "preparing", progress: 0 });
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(maxDurationSeconds);
  const [videoDuration, setVideoDuration] = useState(0);
  const [originalDuration, setOriginalDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trimMode, setTrimMode] = useState(false);
  // Tagging state
  const [allMentionables, setAllMentionables] = useState<{ id: string; name: string; type: "user" | "business"; avatar?: string | null }[]>([]);
  const [pendingMentionIds, setPendingMentionIds] = useState<string[]>([]);
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCursorPosition, setMentionCursorPosition] = useState(0);

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
      const d = payload?.duration ?? 0;
      setOriginalDuration(d);
      setVideoDuration(Math.min(d, maxDurationSeconds));
      setTrimEnd(Math.min(d, maxDurationSeconds));
    });
    return () => sub.remove();
  }, [player, isVideo]);

  // Load businesses and friends for @-mention tagging
  useEffect(() => {
    if (!sessionToken) return;
    Promise.all([
      getBusinesses(sessionToken).catch(() => []),
      getMyFriends(sessionToken).catch(() => []),
    ]).then(([businesses, friends]) => {
      const bizItems = (businesses || []).map((b: any) => ({ id: b.business_id, name: b.name, type: "business" as const, avatar: b.logo_image }));
      const friendItems = (friends || []).map((f: any) => ({ id: f.user_id, name: f.name || f.user_id, type: "user" as const, avatar: f.profile_photo || f.picture }));
      setAllMentionables([...friendItems, ...bizItems]);
    }).catch(() => {});
  }, [sessionToken]);

  const filteredSuggestions = useMemo(() => {
    if (!mentionQuery) return allMentionables.slice(0, 10);
    const search = mentionQuery.toLowerCase();
    return allMentionables.filter(item =>
      (item.name || "").toLowerCase().includes(search)
    ).slice(0, 10);
  }, [allMentionables, mentionQuery]);

  const selectMention = (item: { id: string; name: string; type: "user" | "business" }) => {
    if (!pendingMentionIds.includes(item.id)) {
      setPendingMentionIds([...pendingMentionIds, item.id]);
    }
    setShowMentionSuggestions(false);
    setMentionQuery("");
  };

  const removeMention = (id: string) => {
    setPendingMentionIds(pendingMentionIds.filter(mid => mid !== id));
  };

  const handleCaptionChange = (text: string) => {
    setCaption(text);
    const atIndex = text.lastIndexOf("@");
    if (atIndex >= 0) {
      const prevChar = text[atIndex - 1];
      if (atIndex === 0 || prevChar === " " || prevChar === "\n") {
        const query = text.slice(atIndex + 1);
        if (!query.includes(" ") && !query.includes("\n")) {
          setMentionQuery(query);
          setMentionCursorPosition(atIndex);
          setShowMentionSuggestions(true);
          return;
        }
      }
    }
    setShowMentionSuggestions(false);
    setMentionQuery("");
  };

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else player.play();
  };

  const publishAsPost = async () => {
    if (!sessionToken || publishing) return;
    setPublishing(true);
    console.log("[media-editor] publishAsPost start:", { type, isVideo, mode, captionLength: caption.length });
    try {
      const actor = activeIdentity ? { type: activeIdentity.type, id: activeIdentity.id } : undefined;
      const businessId = activeIdentity?.type === "business" ? activeIdentity.id : undefined;

      const tagUserArray = pendingMentionIds.filter(id =>
        allMentionables.find(m => m.id === id && m.type === "user")
      );
      const tagBusinessArray = pendingMentionIds.filter(id =>
        allMentionables.find(m => m.id === id && m.type === "business")
      );
      const firstBusinessId = tagBusinessArray.length > 0 ? tagBusinessArray[0] : null;

      if (isVideo) {
        setShowUploadProgress(true);
        setUploadContext("video");
        setUploadProgress({ phase: "preparing", progress: 0 });
        const isRemote = decodedUri.startsWith("http");
        let videoUrl: string | null = null;
        let muxPlaybackId: string | null | undefined = undefined;
        let muxThumbnail: string | null | undefined = undefined;

        if (isRemote) {
          const muxId = decodedUri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)\.m3u8/)?.[1];
          videoUrl = decodedUri;
          muxPlaybackId = muxId;
        } else {
          const muxResult = await uploadVideoMux(sessionToken, decodedUri, undefined, setUploadProgress);
          videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
          muxPlaybackId = muxResult.mux_playback_id || undefined;
          muxThumbnail = muxResult.mux_thumbnail_url || undefined;
          if (!videoUrl && !muxPlaybackId) {
            throw new Error("Video-Upload fehlgeschlagen.");
          }
        }
        setShowUploadProgress(false);
        console.log("[media-editor] creating post with video:", { videoUrl, muxPlaybackId });
        await createPost(sessionToken, caption || t("home.sharedAnUpdate", "Shared an update"), null, null, businessId, actor, null, tagUserArray, firstBusinessId, null, null, videoUrl, null, null, muxPlaybackId, muxPlaybackId, "ready");
      } else {
        setShowUploadProgress(true);
        setUploadContext("image");
        setUploadProgress({ phase: "preparing", progress: 0 });
        const isRemote = decodedUri.startsWith("http") || decodedUri.startsWith("data:");
        const imageUrl = isRemote
          ? await uploadImageToCloudinary(sessionToken, decodedUri)
          : await uploadMedia(sessionToken, decodedUri, "image", (p) => setUploadProgress(p));
        setShowUploadProgress(false);
        console.log("[media-editor] creating post with image:", { imageUrl });
        await createPost(sessionToken, caption || t("home.sharedAnUpdate", "Shared an update"), null, null, businessId, actor, null, tagUserArray, firstBusinessId, null, imageUrl, null, null, null);
      }
      Alert.alert(t("editor.success", "Success!"), t("editor.postPublished", "Your post has been published!"), [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (error: any) {
      console.error("[media-editor] publishAsPost failed:", error?.message, error);
      Alert.alert(t("common.error"), error?.message || t("editor.publishFailed", "Failed to publish"));
    } finally {
      setPublishing(false);
      setShowUploadProgress(false);
    }
  };

  const publishAsCityAd = async () => {
    if (!sessionToken || activeIdentity?.type !== "business" || publishing) return;
    setPublishing(true);
    setUploadContext(isVideo ? "video" : "photo");
    try {
      if (isVideo) {
        const info = await FileSystem.getInfoAsync(decodedUri);
        if (info.exists && info.size) {
          if (info.size > MEDIA_LIMITS.cityAd.maxFileSizeBytes) {
            Alert.alert(t("common.error"), `City Ads dürfen maximal ${MEDIA_LIMITS.cityAd.maxFileSizeMb} MB groß sein.`);
            setPublishing(false);
            return;
          }
          if (originalDuration > MEDIA_LIMITS.cityAd.maxDurationSeconds) {
            Alert.alert(t("common.error"), `City Ads dürfen maximal ${MEDIA_LIMITS.cityAd.maxDurationSeconds} Sekunden lang sein.`);
            setPublishing(false);
            return;
          }
        }
      }
      const isRemote = decodedUri.startsWith("http") || decodedUri.startsWith("data:");
      const mediaUrl = isVideo ? decodedUri : (isRemote ? await uploadImageToCloudinary(sessionToken, decodedUri) : await uploadMedia(sessionToken, decodedUri, "image"));
      await createStory(sessionToken, { media_url: mediaUrl, media_type: isVideo ? "video" : "image", text: caption, actor_id: activeIdentity.id, actor_type: activeIdentity.type as "business" });
      Alert.alert(t("editor.success", "Success!"), t("editor.cityAdPublished", "Your city ad has been published!"), [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (error: any) {
      console.error("[media-editor] publishAsCityAd failed:", error?.message, error);
      Alert.alert(t("common.error"), error?.message || t("editor.publishFailed", "Failed to publish"));
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
              onChangeText={handleCaptionChange}
              placeholder={t("editor.captionPlaceholder", "Write a caption...")}
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={MEDIA_LIMITS.post.captionMaxLength}
            />
            <Text style={styles.charCount}>{caption.length}/500</Text>
          </View>

          {/* @-mention suggestions */}
          {showMentionSuggestions && filteredSuggestions.length > 0 && (
            <View style={styles.mentionContainer}>
              {filteredSuggestions.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.mentionRow}
                  onPress={() => selectMention(item)}
                >
                  <View style={styles.mentionAvatar}>
                    <Ionicons
                      name={item.type === "business" ? "business" : "person"}
                      size={16}
                      color="#6b7280"
                    />
                  </View>
                  <Text style={styles.mentionName}>{item.name}</Text>
                  <View style={styles.mentionBadge}>
                    <Text style={styles.mentionBadgeText}>
                      {item.type === "business" ? t("common.business", "Business") : t("common.friend", "Friend")}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          {/* Tagged items */}
          {pendingMentionIds.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={styles.tagsLabel}>{t("editor.tagged", "Tagged")}</Text>
              <View style={styles.tagsRow}>
                {pendingMentionIds.map((id) => {
                  const item = allMentionables.find(m => m.id === id);
                  if (!item) return null;
                  return (
                    <View key={id} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{item.name}</Text>
                      <Pressable onPress={() => removeMention(id)} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color="#6b7280" />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
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

      <UploadProgressSheet visible={showUploadProgress} progress={uploadProgress} context={uploadContext === "video" ? "video" : "photo"} />
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
  mentionContainer: { marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", maxHeight: 200, overflow: "hidden", marginTop: 4 },
  mentionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6" },
  mentionAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  mentionName: { flex: 1, fontSize: 14, fontWeight: "500", color: COLORS.textPrimary },
  mentionBadge: { backgroundColor: "#f3f4f6", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  mentionBadgeText: { fontSize: 11, color: "#6b7280", fontWeight: "500" },
  tagsSection: { paddingHorizontal: 16, paddingTop: 12 },
  tagsLabel: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginBottom: 6 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f3f4f6", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  tagChipText: { fontSize: 13, fontWeight: "500", color: COLORS.textPrimary },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e5e7eb" },
  publishBtn: { flex: 1, backgroundColor: "#000", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  publishText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cityAdBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  cityAdText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});

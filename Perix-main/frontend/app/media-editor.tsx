import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, Image, TextInput, ScrollView, Modal,
  Dimensions, Animated, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { createPost, uploadMedia, uploadVideoMux, UploadProgress, deletePost, getBusinesses, getMyFriends, getMyBusinesses, BACKEND_URL, getUserActivities } from "../lib/api";
import { getMyFriendProfiles } from "../lib/api/social";
import { getUserSellerListings } from "../lib/api/listings";
import { translateCategory } from "../lib/categoryTranslation";
import UploadProgressSheet from "../components/UploadProgressSheet";
import * as FileSystem from "expo-file-system/legacy";
import { COLORS, SPACING, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS } from "../lib/designTokens";
import { MEDIA_LIMITS } from "../lib/constants/mediaLimits";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CANVAS_HEIGHT = SCREEN_WIDTH * 0.75;

export default function MediaEditor() {
  const { t } = useTranslation();
  const router = useRouter();
  const { uri, type, mode, ratio } = useLocalSearchParams<{ uri: string; type: string; mode?: string; ratio?: string }>();
  const { sessionToken, activeIdentity, user } = useAuth();
  const isVideo = type === "video";

  const maxDurationSeconds = mode === "cover"
    ? MEDIA_LIMITS.camera.coverMaxDurationSeconds
    : MEDIA_LIMITS.camera.generalMaxDurationSeconds;
  const decodedUri = decodeURIComponent(uri || "");
  const mediaRatio = ratio ? parseFloat(ratio) : null;

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
  // Business tag picker
  const [allBusinesses, setAllBusinesses] = useState<any[]>([]);
  const [showBusinessPicker, setShowBusinessPicker] = useState(false);
  const [businessSearchQuery, setBusinessSearchQuery] = useState("");
  // Tagging something you created: activities + items
  const [ownActivities, setOwnActivities] = useState<any[]>([]);
  const [ownListings, setOwnListings] = useState<any[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [tagHintOpen, setTagHintOpen] = useState(false);

  const selectedBusiness = useMemo(() => {
    const bizId = pendingMentionIds.find(id =>
      allMentionables.find(m => m.id === id && m.type === "business")
    );
    return bizId ? allBusinesses.find(b => b.business_id === bizId) || allMentionables.find(m => m.id === bizId) : null;
  }, [pendingMentionIds, allMentionables, allBusinesses]);

  const filteredBusinesses = useMemo(() => {
    const q = businessSearchQuery.trim().toLowerCase();
    return allBusinesses
      .filter((b: any) => !q || (b.name || "").toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allBusinesses, businessSearchQuery]);

  const filteredActivities = useMemo(() => {
    const q = businessSearchQuery.trim().toLowerCase();
    return ownActivities.filter((a: any) => !q || (a.title || "").toLowerCase().includes(q));
  }, [ownActivities, businessSearchQuery]);

  const filteredListings = useMemo(() => {
    const q = businessSearchQuery.trim().toLowerCase();
    return ownListings.filter((l: any) => !q || (l.title || "").toLowerCase().includes(q));
  }, [ownListings, businessSearchQuery]);

  const selectBusinessTag = (business: any) => {
    setPendingMentionIds(prev => prev.includes(business.business_id) ? prev : [...prev, business.business_id]);
    setShowBusinessPicker(false);
    setBusinessSearchQuery("");
  };

  const selectActivityTag = (activity: any) => {
    setSelectedActivity(activity);
    setShowBusinessPicker(false);
    setBusinessSearchQuery("");
  };

  const selectListingTag = (listing: any) => {
    setSelectedListing(listing);
    setShowBusinessPicker(false);
    setBusinessSearchQuery("");
  };

  const removeBusinessTag = () => {
    setPendingMentionIds(prev => prev.filter(id => id !== selectedBusiness?.business_id));
  };

  // Idempotency key: stable across retries of the same content, new for fresh content.
  const publishReqIdRef = useRef<{ key: string; id: string } | undefined>(undefined);
  const getRequestId = () => {
    const key = `${decodedUri}|${caption}`;
    if (publishReqIdRef.current && publishReqIdRef.current.key === key) return publishReqIdRef.current.id;
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    publishReqIdRef.current = { key, id };
    return id;
  };
  const clearRequestId = () => {
    publishReqIdRef.current = undefined;
  };
  const withIdempotentRetry = async <T,>(fn: () => Promise<T>, idempotencyKey?: string): Promise<T> => {
    try {
      return await fn();
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      if (idempotencyKey && (msg.includes("network") || msg.includes("failed to fetch"))) {
        await new Promise((r) => setTimeout(r, 1500));
        return await fn();
      }
      throw e;
    }
  };

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
      setTrimEnd(Math.min(d, maxDurationSeconds) as any);
    });
    return () => sub.remove();
  }, [player, isVideo]);

  // Load business friends + own businesses (for the mandatory business tag)
  // and user friends (for @-mention tagging).
  useEffect(() => {
    if (!sessionToken) return;
    Promise.all([
      getMyFriendProfiles(sessionToken).catch(() => []),
      getMyBusinesses(sessionToken).catch(() => []),
      getMyFriends(sessionToken).catch(() => []),
    ]).then(([profiles, myBiz, friends]) => {
      const bizProfiles = (profiles || []).filter((p: any) => p.entity_type === "business");
      const ownBiz = (myBiz || []).filter((b: any) => b?.business_id);
      setAllBusinesses([
        ...ownBiz.map((b: any) => ({ business_id: b.business_id, name: b.name, logo_image: b.logo_image, category: b.root_category, isOwn: true })),
        ...bizProfiles.filter((p: any) => !ownBiz.some((o: any) => o.business_id === p.entity_id))
          .map((p: any) => ({ business_id: p.entity_id, name: p.name, logo_image: p.image, category: p.category, isOwn: false })),
      ]);
      const bizItems = ownBiz.map((b: any) => ({ id: b.business_id, name: b.name, type: "business" as const, avatar: b.logo_image }));
      bizProfiles.forEach((p: any) => {
        if (!bizItems.some((i) => i.id === p.entity_id)) bizItems.push({ id: p.entity_id, name: p.name, type: "business" as const, avatar: p.image });
      });
      const friendItems = (friends || []).map((f: any) => ({ id: f.user_id, name: f.name || f.user_id, type: "user" as const, avatar: f.profile_photo || f.picture }));
      setAllMentionables([...friendItems, ...bizItems]);
    }).catch(() => {});
  }, [sessionToken]);

  // Load the user's own activities and listings for tagging
  useEffect(() => {
    if (!sessionToken || !user?.user_id) return;
    Promise.all([
      getUserActivities(sessionToken, user.user_id).catch(() => []),
      getUserSellerListings(user.user_id).catch(() => []),
    ]).then(([activities, listings]) => {
      setOwnActivities((activities || []).filter((a: any) => a?.activity_id));
      setOwnListings((listings || []).filter((l: any) => l?.listing_id));
    }).catch(() => {});
  }, [sessionToken, user?.user_id]);

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

      // Personal posts must tag something the user owns or is friends with
      const postingAsBusiness = activeIdentity?.type === "business";
      const postingAsArtist = activeIdentity?.type === "artist";
      if (!postingAsBusiness && !postingAsArtist && tagBusinessArray.length === 0 && !selectedActivity && !selectedListing) {
        const msg = t("editor.businessTagRequired", "Tag a business you are friends with, one of your activities, or one of your items before publishing.");
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.alert(`${t("editor.businessTagRequiredTitle", "Tag required")}\n\n${msg}`);
        } else {
          Alert.alert(t("editor.businessTagRequiredTitle", "Tag required"), msg);
        }
        setPublishing(false);
        return;
      }

      if (isVideo) {
        const isRemote = decodedUri.startsWith("http");
        if (!isRemote) {
          const info = await FileSystem.getInfoAsync(decodedUri);
          if (info.exists && info.size && info.size > MEDIA_LIMITS.post.maxVideoFileSizeBytes) {
            Alert.alert(t("common.error"), `Das Video ist zu groß. Maximal erlaubt sind ${MEDIA_LIMITS.post.maxVideoFileSizeMb} MB.`);
            setPublishing(false);
            return;
          }
          if (originalDuration > MEDIA_LIMITS.post.maxVideoDurationSeconds) {
            Alert.alert("Video zu lang", `Videos dürfen maximal ${MEDIA_LIMITS.post.maxVideoDurationSeconds} Sekunden lang sein.`);
            setPublishing(false);
            return;
          }
        }
        setShowUploadProgress(true);
        setUploadContext("video");
        setUploadProgress({ phase: "preparing", progress: 0 });
        let videoUrl: string | null = null;
        let muxPlaybackId: string | null | undefined = undefined;
        let muxThumbnail: string | null | undefined = undefined;
        let videoStatus: string | undefined = undefined;

        if (isRemote) {
          const muxId = decodedUri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)\.m3u8/)?.[1];
          videoUrl = decodedUri;
          muxPlaybackId = muxId;
          videoStatus = "ready";
        } else {
          const muxResult = await uploadVideoMux(sessionToken, decodedUri, undefined, setUploadProgress);
          videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
          muxPlaybackId = muxResult.mux_playback_id || undefined;
          muxThumbnail = muxResult.mux_thumbnail_url || undefined;
          videoStatus = muxResult.video_status;
          if (!videoUrl && !muxPlaybackId) {
            throw new Error("Video-Upload fehlgeschlagen.");
          }
        }
        setShowUploadProgress(false);
        console.log("[media-editor] creating post with video:", { videoUrl, muxPlaybackId });
        const requestId = getRequestId();
        await withIdempotentRetry(
          () => createPost(sessionToken, caption || t("home.sharedAnUpdate", "Shared an update"), null, null, businessId, actor, mediaRatio, tagUserArray, firstBusinessId, null, selectedActivity ? [selectedActivity.activity_id] : null, selectedListing ? [selectedListing.listing_id] : null, null, videoUrl, null, null, muxPlaybackId, muxPlaybackId, videoStatus, requestId),
          requestId,
        );
      } else {
        const isRemote = decodedUri.startsWith("http") || decodedUri.startsWith("data:");
        if (!isRemote) {
          const info = await FileSystem.getInfoAsync(decodedUri);
          if (info.exists && info.size && info.size > MEDIA_LIMITS.image.maxFileSizeBytes) {
            Alert.alert(t("common.error"), `Das Bild ist zu groß. Maximal erlaubt sind ${MEDIA_LIMITS.image.maxFileSizeMb} MB.`);
            setPublishing(false);
            return;
          }
        }
        setShowUploadProgress(true);
        setUploadContext("image");
        setUploadProgress({ phase: "preparing", progress: 0 });
        const imageUrl = decodedUri.startsWith("http")
          ? decodedUri
          : await uploadMedia(sessionToken, decodedUri, "image", (p) => setUploadProgress(p));
        setShowUploadProgress(false);
        console.log("[media-editor] creating post with image:", { imageUrl });
        const requestId = getRequestId();
        await withIdempotentRetry(
          () => createPost(sessionToken, caption || t("home.sharedAnUpdate", "Shared an update"), null, null, businessId, actor, mediaRatio, tagUserArray, firstBusinessId, null, selectedActivity ? [selectedActivity.activity_id] : null, selectedListing ? [selectedListing.listing_id] : null, imageUrl, null, null, null, undefined, undefined, undefined, requestId),
          requestId,
        );
      }
      clearRequestId();
      Alert.alert(t("editor.success", "Success!"), t("editor.postPublished", "Your post has been published!"), [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (error: any) {
      console.error("[media-editor] publishAsPost failed:", error?.message, error);
      const msg = error?.message || t("editor.publishFailed", "Failed to publish");
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.alert(`${t("common.error")}\n\n${msg}`);
      } else {
        Alert.alert(t("common.error"), msg);
      }
    } finally {
      setPublishing(false);
      setShowUploadProgress(false);
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
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} surfaceType="textureView" />
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
                    <Pressable onPress={() => { setTrimEnd(Math.min(videoDuration, trimEnd + 1) as any); try { player.currentTime = trimEnd; } catch (_) {} }}>
                      <Text style={styles.trimBtn}>+1s</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : (
              <Image source={{ uri: decodedUri }} style={styles.previewImage} resizeMode="contain" />
            )}
          </View>

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

          {/* Tag (mandatory for personal posts): business friend, own activity or own item */}
          {activeIdentity?.type !== "business" && activeIdentity?.type !== "artist" && (
            <View style={styles.captionSection}>
              <Text style={styles.captionLabel}>{t("editor.businessTag", "Tag")}</Text>
              {(selectedBusiness || selectedActivity || selectedListing) ? (
                <View style={styles.businessChipRow}>
                  {selectedBusiness ? (
                    <View style={styles.businessChip}>
                      <Ionicons name="business" size={15} color="#59ABE3" />
                      <Text style={styles.businessChipText} numberOfLines={1}>
                        {(selectedBusiness as any).name || (selectedBusiness as any).id}
                      </Text>
                      <Pressable onPress={removeBusinessTag} hitSlop={8}>
                        <Ionicons name="close-circle" size={17} color="#6b7280" />
                      </Pressable>
                    </View>
                  ) : null}
                  {selectedActivity ? (
                    <View style={styles.businessChip}>
                      <Ionicons name="people" size={15} color="#FF9F1C" />
                      <Text style={styles.businessChipText} numberOfLines={1}>
                        {(selectedActivity as any).title}
                      </Text>
                      <Pressable onPress={() => setSelectedActivity(null)} hitSlop={8}>
                        <Ionicons name="close-circle" size={17} color="#6b7280" />
                      </Pressable>
                    </View>
                  ) : null}
                  {selectedListing ? (
                    <View style={styles.businessChip}>
                      <Ionicons name="pricetag" size={15} color="#10b981" />
                      <Text style={styles.businessChipText} numberOfLines={1}>
                        {(selectedListing as any).title}
                      </Text>
                      <Pressable onPress={() => setSelectedListing(null)} hitSlop={8}>
                        <Ionicons name="close-circle" size={17} color="#6b7280" />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : (
                <>
                  <Pressable style={styles.businessTagBtn} onPress={() => setShowBusinessPicker(true)}>
                    <Ionicons name="pricetag-outline" size={16} color="#59ABE3" />
                    <Text style={styles.businessTagBtnText}>{t("editor.tagBusiness", "Tag business, activity or item")}</Text>
                    <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
                  </Pressable>
                  <View style={styles.tagHintBox}>
                    <Pressable style={styles.tagHintHeader} onPress={() => setTagHintOpen((v) => !v)}>
                      <View style={styles.tagHintHeaderLeft}>
                        <Ionicons name="information-circle" size={18} color="#59ABE3" />
                        <Text style={styles.tagHintTitle}>{t("editor.tagHintTitle", "How to publish")}</Text>
                      </View>
                      <Ionicons name={tagHintOpen ? "chevron-up" : "chevron-down"} size={16} color="#264348" />
                    </Pressable>
                    {tagHintOpen && (
                      <Text style={styles.tagHint}>{t("editor.tagHint")}</Text>
                    )}
                  </View>
                </>
              )}
            </View>
          )}

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
        </View>
      </KeyboardAvoidingView>

      {/* Business tag picker */}
      <Modal visible={showBusinessPicker} transparent animationType="fade" onRequestClose={() => setShowBusinessPicker(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t("editor.selectBusiness", "Select business")}</Text>
              <Pressable onPress={() => setShowBusinessPicker(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={COLORS.textPrimary} />
              </Pressable>
            </View>
            <TextInput
              style={styles.pickerSearch}
              value={businessSearchQuery}
              onChangeText={setBusinessSearchQuery}
              placeholder={t("editor.searchBusinessPlaceholder", "Type the business name")}
              placeholderTextColor="#9ca3af"
            />
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {filteredBusinesses.length === 0 && filteredActivities.length === 0 && filteredListings.length === 0 ? (
                <Text style={styles.pickerEmpty}>{t("editor.noBusinessFriends", "Nothing to tag yet. Add a business as a friend, or create an activity or item first.")}</Text>
              ) : (
                <>
                  {filteredBusinesses.length > 0 && (
                    <Text style={styles.pickerGroupTitle}>{t("editor.groupBusinesses", "Businesses (friends)")}</Text>
                  )}
                  {filteredBusinesses.map((b: any) => (
                    <Pressable key={b.business_id} style={styles.pickerRow} onPress={() => selectBusinessTag(b)}>
                      <View style={styles.pickerAvatar}>
                        {b.logo_image ? (
                          <Image source={{ uri: b.logo_image }} style={styles.pickerAvatarImg} />
                        ) : (
                          <Text style={styles.pickerAvatarText}>{(b.name || "B").charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.pickerInfo}>
                        <Text style={styles.pickerName} numberOfLines={1}>{b.name}</Text>
                        {b.category ? <Text style={styles.pickerSub} numberOfLines={1}>{translateCategory(b.category, t)}</Text> : null}
                      </View>
                    </Pressable>
                  ))}
                  {filteredActivities.length > 0 && (
                    <Text style={styles.pickerGroupTitle}>{t("editor.groupActivities", "Your activities")}</Text>
                  )}
                  {filteredActivities.map((a: any) => (
                    <Pressable key={a.activity_id} style={styles.pickerRow} onPress={() => selectActivityTag(a)}>
                      <View style={styles.pickerAvatar}>
                        <Ionicons name="people" size={16} color="#FF9F1C" />
                      </View>
                      <View style={styles.pickerInfo}>
                        <Text style={styles.pickerName} numberOfLines={1}>{a.title}</Text>
                        {a.location ? <Text style={styles.pickerSub} numberOfLines={1}>{a.location}</Text> : null}
                      </View>
                    </Pressable>
                  ))}
                  {filteredListings.length > 0 && (
                    <Text style={styles.pickerGroupTitle}>{t("editor.groupItems", "Your items")}</Text>
                  )}
                  {filteredListings.map((l: any) => (
                    <Pressable key={l.listing_id} style={styles.pickerRow} onPress={() => selectListingTag(l)}>
                      <View style={styles.pickerAvatar}>
                        <Ionicons name="pricetag" size={16} color="#10b981" />
                      </View>
                      <View style={styles.pickerInfo}>
                        <Text style={styles.pickerName} numberOfLines={1}>{l.title}</Text>
                        {l.address ? <Text style={styles.pickerSub} numberOfLines={1}>{l.address}</Text> : null}
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <UploadProgressSheet visible={showUploadProgress} progress={uploadProgress} context={uploadContext === "video" ? "video" : "photo"} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundPage },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff" },
  headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  previewContainer: { backgroundColor: "#000", alignItems: "center", justifyContent: "center", overflow: "hidden" },
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
  businessChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  businessChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(89,171,227,0.1)", borderWidth: 1, borderColor: "rgba(89,171,227,0.4)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, maxWidth: "100%" },
  businessChipText: { fontSize: 13, fontWeight: "600", color: "#264348", flexShrink: 1 },
  businessTagBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(89,171,227,0.5)", borderStyle: "dashed", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  businessTagBtnText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#59ABE3" },
  tagHintBox: {
    backgroundColor: "rgba(89,171,227,0.08)",
    borderWidth: 1,
    borderColor: "rgba(89,171,227,0.35)",
    borderRadius: 12,
    marginTop: 10,
    overflow: "hidden",
  },
  tagHintHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tagHintHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tagHintTitle: { fontSize: 12.5, fontWeight: "800", color: "#264348" },
  tagHint: { fontSize: 12, color: "#4b5a60", lineHeight: 17, paddingHorizontal: 12, paddingBottom: 10 },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 20 },
  pickerCard: { width: "100%", maxWidth: 440, maxHeight: "80%", backgroundColor: "#fff", borderRadius: 18, padding: 16 },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  pickerTitle: { fontSize: 17, fontWeight: "700", color: "#264348" },
  pickerSearch: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#264348", marginBottom: 10 },
  pickerList: { maxHeight: 380 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f3f4f6" },
  pickerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  pickerAvatarImg: { width: "100%", height: "100%" },
  pickerAvatarText: { fontSize: 15, fontWeight: "700", color: "#264348" },
  pickerInfo: { flex: 1, minWidth: 0 },
  pickerName: { fontSize: 14, fontWeight: "600", color: "#264348" },
  pickerSub: { fontSize: 12, color: "#9ca3af", marginTop: 1 },
  pickerDistance: { fontSize: 12, fontWeight: "700", color: "#59ABE3" },
  pickerEmpty: { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingVertical: 20 },
  pickerGroupTitle: { fontSize: 11.5, fontWeight: "800", color: "#8a9aa3", textTransform: "uppercase", letterSpacing: 0.5, paddingTop: 10, paddingBottom: 4 },
});

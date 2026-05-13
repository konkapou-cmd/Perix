import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Dimensions,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import { uploadMedia, UploadProgress, GalleryItem, updateGalleryCaption } from "../lib/api";
import { useTranslation } from "react-i18next";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const THUMBNAIL_SIZE = (SCREEN_WIDTH - 64) / 3;

// No video size limit - streaming upload handles any size
const MAX_VIDEO_SIZE_MB = 300;
const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

// Props can accept either simple string[] or GalleryItem[] with captions
interface VideoGalleryProps {
  videos: string[] | GalleryItem[];
  onVideosChange: (videos: string[] | GalleryItem[]) => void;
  sessionToken: string;
  maxVideos?: number;
  editable?: boolean;
  title?: string;
  emptyText?: string;
  enableCaptions?: boolean;
  onCaptionChange?: (url: string, caption: string) => void;
}

// Helper to normalize videos to GalleryItem format
const normalizeVideos = (videos: string[] | GalleryItem[]): GalleryItem[] => {
  if (!videos || videos.length === 0) return [];
  if (typeof videos[0] === 'string') {
    return (videos as string[]).map(url => ({ uri: url, type: "video" as const }));
  }
  return videos as GalleryItem[];
};

// Helper to get URLs array from normalized videos
const getVideoUrls = (videos: GalleryItem[]): string[] => {
  return videos.map(v => v.uri);
};

export default function VideoGalleryUpload({
  videos,
  onVideosChange,
  sessionToken,
  maxVideos = 10,
  editable = true,
  title,
  emptyText,
  enableCaptions = false,
  onCaptionChange,
}: VideoGalleryProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  // Caption editing state
  const [captionModalVisible, setCaptionModalVisible] = useState(false);
  const [editingCaption, setEditingCaption] = useState("");
  const [editingVideoUrl, setEditingVideoUrl] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);

  // Normalize videos to GalleryItem format for internal use
  const normalizedVideos = normalizeVideos(videos);
  const videoUrls = getVideoUrls(normalizedVideos);

  const handlePickVideo = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.error"), t("auth.loginRequired") || "Please login first");
      return;
    }

    if (normalizedVideos.length >= maxVideos) {
      Alert.alert(
        t("common.error"),
        t("gallery.maxVideosReached") || `Maximum ${maxVideos} videos allowed`
      );
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          t("common.error"),
          t("gallery.permissionRequired") || "Permission to access media library is required"
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 180,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      
      // No file size limit - streaming upload handles any size

      setUploading(true);
      setUploadProgress({ phase: "preparing", progress: 0 });

      console.log("[VideoGallery] Starting video upload:", asset.uri.substring(0, 50));

      const uploadedUrl = await uploadMedia(
        sessionToken,
        asset.uri,
        "video",
        (progress) => {
          setUploadProgress(progress);
          console.log(`[VideoGallery] Upload progress: ${progress.phase} - ${progress.progress}%`);
        }
      );

      console.log("[VideoGallery] Upload complete:", uploadedUrl?.substring(0, 50));

      if (uploadedUrl) {
        // Check if we're working with GalleryItem[] or string[]
        if (enableCaptions || (videos.length > 0 && typeof videos[0] !== 'string')) {
          const newVideos: GalleryItem[] = [...normalizedVideos, { uri: uploadedUrl, type: "video" as const }];
          onVideosChange(newVideos);
        } else {
          const newUrls = [...videoUrls, uploadedUrl];
          onVideosChange(newUrls);
        }
        Alert.alert(t("common.success"), t("gallery.videoUploaded") || "Video uploaded successfully!");
      } else {
        throw new Error("Upload returned empty URL");
      }
    } catch (error: any) {
      console.error("[VideoGallery] Upload error:", error);
      Alert.alert(
        t("common.error"),
        error.message || t("gallery.uploadFailed") || "Failed to upload video"
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleDeleteVideo = (index: number) => {
    Alert.alert(
      t("common.confirm"),
      t("gallery.deleteVideoConfirm") || "Delete this video?",
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            if (enableCaptions || (videos.length > 0 && typeof videos[0] !== 'string')) {
              const newVideos = normalizedVideos.filter((_, i) => i !== index);
              onVideosChange(newVideos);
            } else {
              const newUrls = videoUrls.filter((_, i) => i !== index);
              onVideosChange(newUrls);
            }
          },
        },
      ]
    );
  };

  const handleMoveLeft = (index: number) => {
    if (index === 0) return;
    if (enableCaptions || (videos.length > 0 && typeof videos[0] !== 'string')) {
      const newVideos = [...normalizedVideos];
      [newVideos[index - 1], newVideos[index]] = [newVideos[index], newVideos[index - 1]];
      onVideosChange(newVideos);
    } else {
      const newUrls = [...videoUrls];
      [newUrls[index - 1], newUrls[index]] = [newUrls[index], newUrls[index - 1]];
      onVideosChange(newUrls);
    }
  };

  const handleMoveRight = (index: number) => {
    if (index === normalizedVideos.length - 1) return;
    if (enableCaptions || (videos.length > 0 && typeof videos[0] !== 'string')) {
      const newVideos = [...normalizedVideos];
      [newVideos[index], newVideos[index + 1]] = [newVideos[index + 1], newVideos[index]];
      onVideosChange(newVideos);
    } else {
      const newUrls = [...videoUrls];
      [newUrls[index], newUrls[index + 1]] = [newUrls[index + 1], newUrls[index]];
      onVideosChange(newUrls);
    }
  };

  const handleVideoPress = (videoUrl: string, index: number) => {
    if (editMode) return;
    setSelectedVideo(videoUrl);
    setSelectedIndex(index);
    setVideoModalVisible(true);
  };

  // Caption editing functions
  const handleEditCaption = (videoUrl: string, currentCaption: string | null | undefined) => {
    setEditingVideoUrl(videoUrl);
    setEditingCaption(currentCaption || "");
    setCaptionModalVisible(true);
  };

  const handleSaveCaption = async () => {
    if (!sessionToken || !editingVideoUrl) return;
    
    setSavingCaption(true);
    try {
      // If parent provides caption change handler, use it
      if (onCaptionChange) {
        await onCaptionChange(editingVideoUrl, editingCaption);
      } else {
        // Default: call the API directly
        await updateGalleryCaption(sessionToken, editingVideoUrl, editingCaption, "video");
      }
      
      // Update local state
      const updatedVideos = normalizedVideos.map(v => 
        v.uri === editingVideoUrl ? { ...v, caption: editingCaption } : v
      );
      onVideosChange(updatedVideos);
      
      setCaptionModalVisible(false);
      Alert.alert(t("common.success"), t("gallery.captionSaved") || "Caption saved!");
    } catch (error: any) {
      console.error("[VideoGallery] Failed to save caption:", error);
      Alert.alert(t("common.error"), error.message || t("gallery.captionFailed") || "Failed to save caption");
    } finally {
      setSavingCaption(false);
    }
  };

  const getProgressText = () => {
    if (!uploadProgress) return "";
    switch (uploadProgress.phase) {
      case "preparing":
        return t("gallery.preparing") || "Preparing...";
      case "uploading":
        return `${t("gallery.uploading") || "Uploading"} ${uploadProgress.progress}%`;
      case "processing":
        return t("gallery.processing") || "Processing...";
      case "complete":
        return t("gallery.complete") || "Complete!";
      default:
        return `${uploadProgress.progress}%`;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {title || t("gallery.videos") || "Videos"} 
          {normalizedVideos.length > 0 && <Text style={styles.countBadge}> ({normalizedVideos.length})</Text>}
        </Text>
        <View style={styles.headerActions}>
          {editable && normalizedVideos.length > 1 && (
            <Pressable
              style={[styles.editModeButton, editMode && styles.editModeButtonActive]}
              onPress={() => setEditMode(!editMode)}
            >
              <Ionicons name={editMode ? "checkmark" : "swap-horizontal"} size={16} color={editMode ? "#fff" : "#6b7280"} />
              <Text style={[styles.editModeText, editMode && styles.editModeTextActive]}>
                {editMode ? (t("common.done") || "Done") : (t("gallery.reorder") || "Reorder")}
              </Text>
            </Pressable>
          )}
          {editable && !editMode && (
            <Pressable
              style={[styles.addButton, uploading && styles.addButtonDisabled]}
              onPress={handlePickVideo}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  <Ionicons name="add" size={18} color="#000000" />
                  <Text style={styles.addButtonText}>{t("gallery.addVideo") || "Add"}</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* Upload Progress */}
      {uploading && uploadProgress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${uploadProgress.progress}%` }]}
            />
          </View>
          <Text style={styles.progressText}>{getProgressText()}</Text>
        </View>
      )}

      {/* Video Grid */}
      {normalizedVideos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={40} color="#d1d5db" />
          <Text style={styles.emptyText}>
            {emptyText || t("gallery.noVideos") || "No videos yet"}
          </Text>
          {editable && (
            <Pressable style={styles.emptyAddButton} onPress={handlePickVideo}>
              <Text style={styles.emptyAddButtonText}>
                {t("gallery.addFirstVideo") || "Add your first video"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.videoGrid}
        >
          {normalizedVideos.map((videoItem, index) => (
            <View key={`${videoItem.uri}-${index}`} style={styles.videoItem}>
              <Pressable
                style={[styles.videoThumbnail, editMode && styles.videoThumbnailEditMode]}
                onPress={() => handleVideoPress(videoItem.uri, index)}
              >
                <Video
                  source={{ uri: videoItem.uri }}
                  style={styles.videoPreview}
                  resizeMode={ResizeMode.COVER}
                  shouldPlay={false}
                  isMuted
                  isLooping={false}
                />
                {!editMode && (
                  <View style={styles.playOverlay}>
                    <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.9)" />
                  </View>
                )}
                {editMode && (
                  <View style={styles.editOverlay}>
                    <Text style={styles.indexBadge}>{index + 1}</Text>
                  </View>
                )}
              </Pressable>
              
              {/* Caption display and edit button */}
              {enableCaptions && editable && !editMode && (
                <Pressable 
                  style={styles.captionButton}
                  onPress={() => handleEditCaption(videoItem.uri, videoItem.caption)}
                >
                  <Ionicons 
                    name={videoItem.caption ? "text" : "text-outline"} 
                    size={14} 
                    color={videoItem.caption ? "#000000" : "#9ca3af"} 
                  />
                  <Text 
                    style={[styles.captionText, !videoItem.caption && styles.captionTextEmpty]} 
                    numberOfLines={1}
                  >
                    {videoItem.caption || (t("gallery.addCaption") || "Add caption")}
                  </Text>
                </Pressable>
              )}
              
              {/* Edit Mode Controls */}
              {editMode && editable && (
                <View style={styles.reorderControls}>
                  <Pressable
                    style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
                    onPress={() => handleMoveLeft(index)}
                    disabled={index === 0}
                  >
                    <Ionicons name="chevron-back" size={16} color={index === 0 ? "#d1d5db" : "#000000"} />
                  </Pressable>
                  <Pressable
                    style={styles.deleteButtonSmall}
                    onPress={() => handleDeleteVideo(index)}
                  >
                    <Ionicons name="trash" size={14} color="#ef4444" />
                  </Pressable>
                  <Pressable
                    style={[styles.reorderButton, index === normalizedVideos.length - 1 && styles.reorderButtonDisabled]}
                    onPress={() => handleMoveRight(index)}
                    disabled={index === normalizedVideos.length - 1}
                  >
                    <Ionicons name="chevron-forward" size={16} color={index === normalizedVideos.length - 1 ? "#d1d5db" : "#000000"} />
                  </Pressable>
                </View>
              )}
              
              {/* Delete button when not in edit mode */}
              {!editMode && editable && (
                <Pressable
                  style={styles.deleteButton}
                  onPress={() => handleDeleteVideo(index)}
                >
                  <Ionicons name="close-circle" size={22} color="#ef4444" />
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Video Player Modal */}
      <Modal
        visible={videoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setVideoModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setVideoModalVisible(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("gallery.video") || "Video"} {selectedIndex + 1}/{normalizedVideos.length}
              </Text>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setVideoModalVisible(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </View>
            {selectedVideo && (
              <Video
                source={{ uri: selectedVideo }}
                style={styles.modalVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                useNativeControls
                isLooping
              />
            )}
            {/* Show caption in modal if enabled */}
            {enableCaptions && selectedIndex >= 0 && normalizedVideos[selectedIndex]?.caption && (
              <View style={styles.modalCaptionContainer}>
                <Text style={styles.modalCaptionText}>
                  {normalizedVideos[selectedIndex].caption}
                </Text>
              </View>
            )}
            {/* Navigation arrows in modal */}
            {normalizedVideos.length > 1 && (
              <View style={styles.modalNav}>
                <Pressable
                  style={[styles.modalNavButton, selectedIndex === 0 && styles.modalNavButtonDisabled]}
                  onPress={() => {
                    if (selectedIndex > 0) {
                      setSelectedIndex(selectedIndex - 1);
                      setSelectedVideo(normalizedVideos[selectedIndex - 1].uri);
                    }
                  }}
                  disabled={selectedIndex === 0}
                >
                  <Ionicons name="chevron-back" size={32} color={selectedIndex === 0 ? "#666" : "#fff"} />
                </Pressable>
                <Pressable
                  style={[styles.modalNavButton, selectedIndex === normalizedVideos.length - 1 && styles.modalNavButtonDisabled]}
                  onPress={() => {
                    if (selectedIndex < normalizedVideos.length - 1) {
                      setSelectedIndex(selectedIndex + 1);
                      setSelectedVideo(normalizedVideos[selectedIndex + 1].uri);
                    }
                  }}
                  disabled={selectedIndex === normalizedVideos.length - 1}
                >
                  <Ionicons name="chevron-forward" size={32} color={selectedIndex === normalizedVideos.length - 1 ? "#666" : "#fff"} />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Caption Edit Modal */}
      <Modal
        visible={captionModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCaptionModalVisible(false)}
      >
        <View style={styles.captionModalOverlay}>
          <View style={styles.captionModalContent}>
            <View style={styles.captionModalHeader}>
              <Text style={styles.captionModalTitle}>
                {t("gallery.editCaption") || "Edit Caption"}
              </Text>
              <Pressable onPress={() => setCaptionModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </Pressable>
            </View>
            <TextInput
              style={styles.captionInput}
              value={editingCaption}
              onChangeText={setEditingCaption}
              placeholder={t("gallery.enterCaption") || "Enter a caption..."}
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={200}
              autoFocus
            />
            <Text style={styles.captionCharCount}>
              {editingCaption.length}/200
            </Text>
            <View style={styles.captionModalActions}>
              <Pressable
                style={styles.captionCancelButton}
                onPress={() => setCaptionModalVisible(false)}
              >
                <Text style={styles.captionCancelText}>{t("common.cancel") || "Cancel"}</Text>
              </Pressable>
              <Pressable
                style={[styles.captionSaveButton, savingCaption && styles.captionSaveButtonDisabled]}
                onPress={handleSaveCaption}
                disabled={savingCaption}
              >
                {savingCaption ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.captionSaveText}>{t("common.save") || "Save"}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  countBadge: {
    fontSize: 14,
    fontWeight: "400",
    color: "#6b7280",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editModeButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  editModeButtonActive: {
    backgroundColor: "#000000",
  },
  editModeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
  },
  editModeTextActive: {
    color: "#fff",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f4ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#000000",
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#000000",
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 8,
  },
  emptyAddButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#000000",
    borderRadius: 20,
  },
  emptyAddButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  videoGrid: {
    paddingVertical: 4,
    gap: 12,
  },
  videoItem: {
    position: "relative",
    marginRight: 12,
  },
  videoThumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1f2937",
  },
  videoThumbnailEditMode: {
    borderWidth: 2,
    borderColor: "#000000",
  },
  videoPreview: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(76,111,255,0.3)",
  },
  indexBadge: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  reorderControls: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 6,
    gap: 4,
  },
  reorderButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f0f4ff",
    justifyContent: "center",
    alignItems: "center",
  },
  reorderButtonDisabled: {
    backgroundColor: "#f3f4f6",
  },
  deleteButtonSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButton: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#fff",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.95)",
  },
  modalContent: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalHeader: {
    position: "absolute",
    top: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    zIndex: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalCloseButton: {
    padding: 8,
  },
  modalVideo: {
    width: "100%",
    height: "70%",
  },
  modalNav: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  modalNavButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalNavButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  // Caption styles
  captionButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    maxWidth: THUMBNAIL_SIZE,
    gap: 4,
  },
  captionText: {
    fontSize: 11,
    color: "#374151",
    flex: 1,
  },
  captionTextEmpty: {
    color: "#9ca3af",
    fontStyle: "italic",
  },
  modalCaptionContainer: {
    position: "absolute",
    bottom: 140,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 12,
    borderRadius: 8,
  },
  modalCaptionText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
  },
  // Caption edit modal styles
  captionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  captionModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  captionModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  captionModalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  captionInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    minHeight: 100,
    textAlignVertical: "top",
    backgroundColor: "#f9fafb",
  },
  captionCharCount: {
    fontSize: 12,
    color: "#9ca3af",
    textAlign: "right",
    marginTop: 4,
  },
  captionModalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    gap: 12,
  },
  captionCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  captionCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  captionSaveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#000000",
    alignItems: "center",
  },
  captionSaveButtonDisabled: {
    opacity: 0.6,
  },
  captionSaveText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
});

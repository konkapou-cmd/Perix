import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import AdaptiveImage from "../AdaptiveImage";
import AdaptiveVideo from "../AdaptiveVideo";
import { COLORS } from "../../lib/designTokens";

export type TaggedEntity = {
  id: string;
  name: string;
  type: 'business' | 'artist';
};

type Props = {
  postText: string;
  postImage: string | null;
  postVideo: string | null; // Needed for compatibility with `ArtistView`
  postVideoPreview: string | null;
  businessId?: string; // Optional depending on call context
  businessName?: string;
  businessLogo?: string | null;
  postMediaRatio?: number | null;
  taggedEntities?: TaggedEntity[]; // Tagged businesses/artists
  onTagClick?: () => void; // Show tag modal
  onRemoveTag?: (id: string) => void; // Remove tag
  // Handler props
  setPostText: (text: string) => void; // Using setPostText instead of onTextChange
  onPickImage: () => void;
  onPickVideo: () => void;
  onDiscardMedia?: () => void;
  onCreatePost: (text?: any) => void;
  onCreateStory?: () => void;
};

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;
const SOUNDCLOUD_REGEX = /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(?:[^\s]*)?/gi;
const isValidYoutube = (url: string) => /(?:youtube\.com|youtu\.be)/.test(url);
const isValidSoundcloud = (url: string) => /soundcloud\.com/.test(url);

export default function PostCreationSection({
  postText,
  postImage,
  postVideo,
  postVideoPreview,
  businessId,
  businessName,
  businessLogo,
  postMediaRatio,
  taggedEntities = [],
  onTagClick,
  onRemoveTag,
  setPostText,
  onPickImage,
  onPickVideo,
  onDiscardMedia,
  onCreatePost,
  onCreateStory,
}: Props) {
  const { t } = useTranslation();
  const [showYouTube, setShowYouTube] = useState(false);
  const [showSoundCloud, setShowSoundCloud] = useState(false);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [soundcloudInput, setSoundcloudInput] = useState("");

  const handlePost = () => {
    let text = postText.trim();
    if (youtubeInput.trim() && isValidYoutube(youtubeInput.trim())) {
      if (!text.includes(youtubeInput.trim())) {
        text = text ? text + "\n\n" + youtubeInput.trim() : youtubeInput.trim();
      }
      setYoutubeInput("");
      setShowYouTube(false);
    }
    if (soundcloudInput.trim() && isValidSoundcloud(soundcloudInput.trim())) {
      if (!text.includes(soundcloudInput.trim())) {
        text = text ? text + "\n\n" + soundcloudInput.trim() : soundcloudInput.trim();
      }
      setSoundcloudInput("");
      setShowSoundCloud(false);
    }
    if (text !== postText.trim()) {
      setPostText(text);
    }
    const fullText = text || postText.trim();
    setPostText(fullText);
    onCreatePost(fullText as any);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("business.contentCreation")}</Text>
      <TextInput
        placeholder={t("business.shareAnUpdate")}
        placeholderTextColor="#9ca3af"
        value={postText}
        onChangeText={setPostText}
        style={styles.input}
        multiline
      />
      
      {/* Tagged entities */}
      {taggedEntities.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagContainer}>
          {taggedEntities.map((entity) => (
            <View key={entity.id} style={styles.tagChip}>
              <Text style={styles.tagText}>{entity.name}</Text>
              <Pressable onPress={() => onRemoveTag?.(entity.id)} style={styles.removeTagButton}>
                <Ionicons name="close" size={14} color="#666" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      
      {postImage && (
        <AdaptiveImage
          uri={postImage}
          style={styles.postPreview}
          ratio={postMediaRatio || undefined}
        />
      )}
      {postVideoPreview && (
        <AdaptiveVideo
          uri={postVideoPreview}
          style={styles.postPreview}
          ratio={postMediaRatio || undefined}
        />
      )}

      {/* Media link toggles */}
      <View style={styles.mediaLinkRow}>
        <Pressable
          style={[styles.mediaLinkToggle, showYouTube && styles.mediaLinkToggleActive]}
          onPress={() => { setShowYouTube(!showYouTube); setShowSoundCloud(false); }}
        >
          <Ionicons name="logo-youtube" size={16} color={showYouTube ? "#fff" : "#ef4444"} />
          <Text style={[styles.mediaLinkToggleText, showYouTube && styles.mediaLinkToggleTextActive]}>YouTube</Text>
        </Pressable>
        <Pressable
          style={[styles.mediaLinkToggle, showSoundCloud && styles.mediaLinkToggleActive]}
          onPress={() => { setShowSoundCloud(!showSoundCloud); setShowYouTube(false); }}
        >
          <Ionicons name="cloud-outline" size={16} color={showSoundCloud ? "#fff" : "#ff5500"} />
          <Text style={[styles.mediaLinkToggleText, showSoundCloud && styles.mediaLinkToggleTextActive]}>SoundCloud</Text>
        </Pressable>
      </View>

      {showYouTube && (
        <View style={styles.mediaLinkInput}>
          <TextInput
            style={styles.mediaLinkTextInput}
            placeholder={t("home.youtubePlaceholder", "Paste YouTube URL...")}
            value={youtubeInput}
            onChangeText={setYoutubeInput}
            autoCapitalize="none"
            keyboardType="url"
          />
          {youtubeInput.length > 0 && !isValidYoutube(youtubeInput) && (
            <Text style={styles.mediaLinkError}>{t("home.invalidYoutube", "Invalid YouTube URL")}</Text>
          )}
        </View>
      )}

      {showSoundCloud && (
        <View style={styles.mediaLinkInput}>
          <TextInput
            style={styles.mediaLinkTextInput}
            placeholder={t("home.soundcloudPlaceholder", "Paste SoundCloud URL...")}
            value={soundcloudInput}
            onChangeText={setSoundcloudInput}
            autoCapitalize="none"
            keyboardType="url"
          />
          {soundcloudInput.length > 0 && !isValidSoundcloud(soundcloudInput) && (
            <Text style={styles.mediaLinkError}>{t("home.invalidSoundcloud", "Invalid SoundCloud URL")}</Text>
          )}
        </View>
      )}

      <View style={styles.postActions}>
        <Pressable style={styles.iconButton} onPress={onPickImage}>
          <Ionicons name="image-outline" size={18} color={COLORS.primaryDark} />
          <Text style={styles.iconButtonText}>{t("common.photo")}</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onPickVideo}>
          <Ionicons name="videocam-outline" size={18} color={COLORS.primaryDark} />
          <Text style={styles.iconButtonText}>{t("common.video")}</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onTagClick}>
          <Ionicons name="pricetag-outline" size={18} color={COLORS.primaryDark} />
          <Text style={styles.iconButtonText}>{t("common.tag")}</Text>
        </Pressable>
        <Pressable style={styles.postButton} onPress={handlePost}>
          <Ionicons name="paper-plane" size={16} color="#fff" />
          <Text style={styles.postButtonText}>{t("common.post")}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.secondaryButton} onPress={onCreateStory}>
        <Text style={styles.secondaryButtonText}>{t("business.publishStory")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: COLORS.textPrimary,
  },
  tagContainer: {
    marginBottom: 12,
    maxHeight: 40,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryDark,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primaryDark,
    marginRight: 6,
  },
  removeTagButton: {
    padding: 2,
  },
  postPreview: {
    width: "100%",
    borderRadius: 16,
    marginBottom: 12,
  },
  postActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iconButtonText: {
    color: COLORS.primaryDark,
    fontWeight: "600",
    marginLeft: 6,
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primaryDark,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryDark,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    gap: 8,
    minWidth: 100,
    shadowColor: COLORS.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  postButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryButtonText: {
    color: COLORS.primaryDark,
    fontWeight: "600",
  },
  mediaLinkRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  mediaLinkToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 6,
  },
  mediaLinkToggleActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  mediaLinkToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  mediaLinkToggleTextActive: {
    color: "#fff",
  },
  mediaLinkInput: {
    marginBottom: 8,
  },
  mediaLinkTextInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  mediaLinkError: {
    fontSize: 11,
    color: "#ef4444",
    marginTop: 4,
  },
});
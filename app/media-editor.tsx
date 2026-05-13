import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TextInput,
  ScrollView,
  Dimensions,
  PanResponder,
  Animated,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode, AVPlaybackStatus, Audio } from "expo-av";
import { useTranslation } from "react-i18next";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useAuth } from "../context/AuthContext";
import { useMapBounds } from "../context/MapBoundsContext";
import { createPost, createStory, uploadMedia, uploadImageToCloudinary, uploadVideoMux, UploadProgress, apiRequest, MAX_STORY_VIDEO_SIZE_MB, deletePost, deleteStory } from "../lib/api";
import UploadProgressSheet from "../components/UploadProgressSheet";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CANVAS_WIDTH = SCREEN_WIDTH;
const CANVAS_HEIGHT = SCREEN_WIDTH * 1.5; // 2:3 aspect ratio

// Get API URL from config
const BACKEND_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  "";

// Default fallback music tracks (used when API is unavailable)
const DEFAULT_MUSIC_TRACKS = [
  { id: "none", name: "No Music", icon: "volume-mute", uri: null, genre: null },
  { id: "upbeat", name: "Upbeat Pop", icon: "musical-notes", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", genre: "Pop" },
  { id: "chill", name: "Chill Vibes", icon: "cafe", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3", genre: "Lo-Fi" },
  { id: "energetic", name: "Energetic Beat", icon: "flash", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3", genre: "Electronic" },
  { id: "acoustic", name: "Acoustic Guitar", icon: "musical-note", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3", genre: "Acoustic" },
  { id: "happy", name: "Happy Days", icon: "sunny", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3", genre: "Pop" },
  { id: "dramatic", name: "Dramatic", icon: "thunderstorm", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3", genre: "Cinematic" },
  { id: "romantic", name: "Romantic", icon: "heart", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3", genre: "Ballad" },
  { id: "party", name: "Party Mode", icon: "bonfire", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", genre: "Dance" },
  { id: "ambient", name: "Ambient Space", icon: "planet", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3", genre: "Ambient" },
  { id: "jazz", name: "Smooth Jazz", icon: "wine", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3", genre: "Jazz" },
  { id: "hiphop", name: "Hip Hop Beat", icon: "mic", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3", genre: "Hip Hop" },
  { id: "classical", name: "Classical Piano", icon: "school", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3", genre: "Classical" },
  { id: "summer", name: "Summer Vibes", icon: "sunny", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3", genre: "Pop" },
  { id: "motivation", name: "Motivation", icon: "fitness", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3", genre: "Electronic" },
  { id: "indie", name: "Indie Folk", icon: "leaf", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3", genre: "Indie" },
  { id: "retro", name: "Retro Synthwave", icon: "radio", uri: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3", genre: "Synthwave" },
];

// Music track type
interface MusicTrack {
  id: string;
  name: string;
  icon: string;
  uri: string | null;
  genre: string | null;
  artist_name?: string;
}

// Available fonts - Extended collection with more variety
const FONTS = [
  // Basic styles
  { id: "default", name: "Default", fontFamily: undefined, fontWeight: undefined, fontStyle: undefined },
  { id: "bold", name: "Bold", fontFamily: undefined, fontWeight: "bold" as const, fontStyle: undefined },
  { id: "italic", name: "Italic", fontFamily: undefined, fontWeight: undefined, fontStyle: "italic" as const },
  { id: "bold-italic", name: "Bold Italic", fontFamily: undefined, fontWeight: "bold" as const, fontStyle: "italic" as const },
  // Weight variations
  { id: "thin", name: "Thin", fontFamily: undefined, fontWeight: "100" as const, fontStyle: undefined },
  { id: "light", name: "Light", fontFamily: undefined, fontWeight: "300" as const, fontStyle: undefined },
  { id: "medium", name: "Medium", fontFamily: undefined, fontWeight: "500" as const, fontStyle: undefined },
  { id: "semibold", name: "Semibold", fontFamily: undefined, fontWeight: "600" as const, fontStyle: undefined },
  { id: "black", name: "Black", fontFamily: undefined, fontWeight: "900" as const, fontStyle: undefined },
  // Font family variations
  { id: "mono", name: "Mono", fontFamily: "monospace", fontWeight: undefined, fontStyle: undefined },
  { id: "mono-bold", name: "Mono Bold", fontFamily: "monospace", fontWeight: "bold" as const, fontStyle: undefined },
  { id: "serif", name: "Serif", fontFamily: "serif", fontWeight: undefined, fontStyle: undefined },
  { id: "serif-bold", name: "Serif Bold", fontFamily: "serif", fontWeight: "bold" as const, fontStyle: undefined },
  { id: "serif-italic", name: "Serif Italic", fontFamily: "serif", fontWeight: undefined, fontStyle: "italic" as const },
  { id: "condensed", name: "Condensed", fontFamily: "sans-serif-condensed", fontWeight: undefined, fontStyle: undefined },
  { id: "condensed-bold", name: "Condensed Bold", fontFamily: "sans-serif-condensed", fontWeight: "bold" as const, fontStyle: undefined },
  { id: "cursive", name: "Script", fontFamily: "cursive", fontWeight: undefined, fontStyle: undefined },
  { id: "cursive-bold", name: "Script Bold", fontFamily: "cursive", fontWeight: "bold" as const, fontStyle: undefined },
];

// Available text colors - Extended palette
const TEXT_COLORS = [
  "#FFFFFF", "#000000", "#FF0000", "#FF6B00", "#FFD700",
  "#00FF00", "#00FFFF", "#0066FF", "#9933FF", "#FF1493",
  "#FF69B4", "#8B5CF6", "#EC4899", "#14B8A6", "#F59E0B",
  "#EF4444", "#3B82F6", "#10B981", "#6366F1", "#F97316",
];

// Text background styles - Enhanced with more creative options
const TEXT_BACKGROUNDS = [
  { id: "none", name: "None", style: {} },
  { id: "solid", name: "Solid", style: { backgroundColor: "rgba(0,0,0,0.7)", padding: 8, borderRadius: 4 } },
  { id: "solid-white", name: "White", style: { backgroundColor: "rgba(255,255,255,0.9)", padding: 8, borderRadius: 4 } },
  { id: "highlight", name: "Highlight", style: { backgroundColor: "rgba(255,255,0,0.5)", padding: 4 } },
  { id: "highlight-pink", name: "Pink", style: { backgroundColor: "rgba(255,105,180,0.5)", padding: 4 } },
  { id: "blur", name: "Blur", style: { backgroundColor: "rgba(255,255,255,0.2)", padding: 8, borderRadius: 8 } },
  { id: "blur-dark", name: "Blur Dark", style: { backgroundColor: "rgba(0,0,0,0.4)", padding: 8, borderRadius: 8 } },
  { id: "neon", name: "Neon", style: { textShadowColor: "#00FFFF", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 } },
  { id: "neon-pink", name: "Neon Pink", style: { textShadowColor: "#FF1493", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 } },
  { id: "neon-green", name: "Neon Green", style: { textShadowColor: "#00FF00", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 } },
  { id: "shadow", name: "Shadow", style: { textShadowColor: "rgba(0,0,0,0.75)", textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 4 } },
  { id: "shadow-soft", name: "Soft Glow", style: { textShadowColor: "rgba(255,255,255,0.5)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 } },
  { id: "outline", name: "Outline", style: { textShadowColor: "#000", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1 } },
  { id: "gradient-box", name: "Gradient", style: { backgroundColor: "rgba(102,51,153,0.7)", padding: 8, borderRadius: 8 } },
];

// Available filters
const FILTERS = [
  { id: "none", name: "Normal", style: {} },
  { id: "warm", name: "Warm", style: { tintColor: "rgba(255, 200, 100, 0.3)" } },
  { id: "cool", name: "Cool", style: { tintColor: "rgba(100, 150, 255, 0.3)" } },
  { id: "bw", name: "B&W", style: { filter: "grayscale(1)" } },
  { id: "vintage", name: "Vintage", style: { tintColor: "rgba(200, 150, 100, 0.4)" } },
  { id: "dramatic", name: "Dramatic", style: { tintColor: "rgba(50, 50, 80, 0.3)" } },
  { id: "bright", name: "Bright", style: { brightness: 1.2 } },
  { id: "fade", name: "Fade", style: { opacity: 0.85, tintColor: "rgba(255, 255, 255, 0.2)" } },
];

// Drawing types
interface DrawingPoint {
  x: number;
  y: number;
}

interface DrawingStroke {
  id: string;
  points: DrawingPoint[];
  color: string;
  width: number;
  tool: "pen" | "highlighter" | "eraser";
}

const DRAWING_COLORS = [
  "#FFFFFF", "#000000", "#FF3B30", "#FF9500", "#FFCC00",
  "#34C759", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55",
];

const BRUSH_SIZES = [2, 4, 8, 12, 20];

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontId: string;
  rotation: number;
  backgroundId: string;
  scale: number;
}

interface Sticker {
  id: string;
  type: "location" | "mention" | "hashtag" | "poll" | "emoji" | "countdown";
  x: number;
  y: number;
  rotation: number;
  scale: number;
  // Location
  locationName?: string;
  locationLat?: number;
  locationLng?: number;
  // Mention
  mentionUsername?: string;
  mentionUserId?: string;
  // Hashtag
  hashtagName?: string;
  // Poll
  pollQuestion?: string;
  pollOptions?: string[];
  // Emoji slider
  emojiValue?: number;
  // Countdown
  countdownDate?: string;
}

export default function MediaEditor() {
  const { uri, type, mode } = useLocalSearchParams<{ uri: string; type: "image" | "video"; mode?: "post" }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { sessionToken, activeIdentity, user } = useAuth();
  const { mapBounds } = useMapBounds();
  
  const [activeTab, setActiveTab] = useState<"text" | "filter" | "trim" | "music" | "sticker" | "draw" | "none">("none");
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("none");
  const [newText, setNewText] = useState("");
  const [selectedColor, setSelectedColor] = useState("#FFFFFF");
  const [selectedFont, setSelectedFont] = useState("default");
  const [selectedBackground, setSelectedBackground] = useState("none");
  const [fontSize, setFontSize] = useState(24);
  const [publishing, setPublishing] = useState(false);
  const [showPublishOptions, setShowPublishOptions] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [postCaption, setPostCaption] = useState("");
  
  // Music states
  const [selectedMusic, setSelectedMusic] = useState("none");
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.7);
  const [videoMuted, setVideoMuted] = useState(false);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>(DEFAULT_MUSIC_TRACKS);
  const [loadingMusic, setLoadingMusic] = useState(false);
  const musicRef = useRef<Audio.Sound | null>(null);
  
  // Sticker states
  const [activeStickerType, setActiveStickerType] = useState<"location" | "mention" | "hashtag" | "poll" | "emoji" | "countdown" | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [hashtagQuery, setHashtagQuery] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  
  // Drawing states
  const [activeDrawingTool, setActiveDrawingTool] = useState<"pen" | "highlighter" | "eraser" | null>(null);
  const [drawingStrokes, setDrawingStrokes] = useState<DrawingStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<DrawingPoint[]>([]);
  const [drawingColor, setDrawingColor] = useState("#FFFFFF");
  const [brushSize, setBrushSize] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [emojiValue, setEmojiValue] = useState(5);
  const [countdownDate, setCountdownDate] = useState(new Date(Date.now() + 86400000)); // Tomorrow
  
  // Video trimming states
  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(30);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoRef = useRef<Video>(null);
  const trimStartAnim = useRef(new Animated.Value(0)).current;
  const trimEndAnim = useRef(new Animated.Value(1)).current;

  // Fetch music tracks from API on mount
  useEffect(() => {
    const fetchMusicTracks = async () => {
      try {
        setLoadingMusic(true);
        const response = await fetch(`${BACKEND_URL}/api/music/featured?limit=50`);
        if (response.ok) {
          const data = await response.json();
          if (data.tracks && data.tracks.length > 0) {
            // Map API tracks to our format (already shuffled by backend)
            const apiTracks: MusicTrack[] = data.tracks.map((track: any) => ({
              id: track.id,
              name: track.name,
              icon: getGenreIcon(track.genre),
              uri: track.audio_url,
              genre: track.genre,
              artist_name: track.artist_name,
            }));
            
            // Add "No Music" at the beginning
            setMusicTracks([
              { id: "none", name: "No Music", icon: "volume-mute", uri: null, genre: null },
              ...apiTracks,
            ]);
          }
        }
      } catch (error) {
        console.log("Failed to fetch music tracks, using defaults:", error);
        // Shuffle default tracks randomly too
        const shuffledDefaults = [...DEFAULT_MUSIC_TRACKS.slice(1)].sort(() => Math.random() - 0.5);
        setMusicTracks([DEFAULT_MUSIC_TRACKS[0], ...shuffledDefaults]);
      } finally {
        setLoadingMusic(false);
      }
    };
    
    fetchMusicTracks();
  }, []);

  // Helper function to get icon based on genre
  const getGenreIcon = (genre: string | null): string => {
    if (!genre) return "musical-notes";
    const genreLower = genre.toLowerCase();
    if (genreLower.includes("pop") || genreLower.includes("dance")) return "musical-notes";
    if (genreLower.includes("rock")) return "flash";
    if (genreLower.includes("jazz") || genreLower.includes("chill") || genreLower.includes("lo-fi")) return "cafe";
    if (genreLower.includes("electronic") || genreLower.includes("edm")) return "flash";
    if (genreLower.includes("acoustic") || genreLower.includes("folk")) return "musical-note";
    if (genreLower.includes("classical") || genreLower.includes("cinematic")) return "thunderstorm";
    if (genreLower.includes("romantic") || genreLower.includes("ballad")) return "heart";
    return "musical-notes";
  };

  // Initialize and manage music playback
  useEffect(() => {
    const setupMusic = async () => {
      // Cleanup previous music
      if (musicRef.current) {
        await musicRef.current.unloadAsync();
        musicRef.current = null;
      }
      
      const track = musicTracks.find(t => t.id === selectedMusic);
      if (track && track.uri) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: track.uri },
            { isLooping: true, volume: musicVolume, isMuted: musicMuted }
          );
          musicRef.current = sound;
          if (isPlaying) {
            await sound.playAsync();
          }
        } catch (error) {
          console.log("Error loading music:", error);
        }
      }
    };
    
    setupMusic();
    
    return () => {
      if (musicRef.current) {
        musicRef.current.unloadAsync();
      }
    };
  }, [selectedMusic, musicTracks]);

  // Sync music with video playback
  useEffect(() => {
    const syncMusic = async () => {
      if (musicRef.current) {
        if (isPlaying && !musicMuted) {
          await musicRef.current.playAsync();
        } else {
          await musicRef.current.pauseAsync();
        }
      }
    };
    syncMusic();
  }, [isPlaying, musicMuted]);

  // Update music volume
  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.setVolumeAsync(musicVolume);
    }
  }, [musicVolume]);

  // Update music mute state
  useEffect(() => {
    if (musicRef.current) {
      musicRef.current.setIsMutedAsync(musicMuted);
    }
  }, [musicMuted]);

  // Video playback status update
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    
    if (status.durationMillis) {
      const duration = status.durationMillis / 1000;
      setVideoDuration(duration);
      if (trimEnd > duration) setTrimEnd(duration);
    }
    
    if (status.positionMillis) {
      const position = status.positionMillis / 1000;
      setCurrentPosition(position);
      
      // Loop within trim bounds
      if (position >= trimEnd && status.isPlaying) {
        videoRef.current?.setPositionAsync(trimStart * 1000);
      }
    }
    
    setIsPlaying(status.isPlaying || false);
  }, [trimStart, trimEnd]);

  // Seek to position
  const seekToPosition = async (position: number) => {
    if (videoRef.current) {
      await videoRef.current.setPositionAsync(position * 1000);
    }
  };

  // Toggle play/pause
  const togglePlayPause = async () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      // Start from trim start if at the end
      if (currentPosition >= trimEnd || currentPosition < trimStart) {
        await videoRef.current.setPositionAsync(trimStart * 1000);
      }
      await videoRef.current.playAsync();
    }
  };

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Calculate trim duration
  const trimDuration = trimEnd - trimStart;

  // Add new text overlay
  const addTextOverlay = () => {
    if (!newText.trim()) return;
    
    const newOverlay: TextOverlay = {
      id: `text_${Date.now()}`,
      text: newText.trim(),
      x: CANVAS_WIDTH / 2 - 50,
      y: CANVAS_HEIGHT / 2 - 20,
      color: selectedColor,
      fontSize: fontSize,
      fontId: selectedFont,
      rotation: 0,
      backgroundId: selectedBackground,
      scale: 1,
    };
    
    setTextOverlays([...textOverlays, newOverlay]);
    setNewText("");
    setSelectedTextId(newOverlay.id);
  };

  // Add new sticker
  const addSticker = (sticker: Sticker) => {
    setStickers([...stickers, sticker]);
    setSelectedStickerId(sticker.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Delete sticker
  const deleteSticker = (id: string) => {
    setStickers(stickers.filter(s => s.id !== id));
    if (selectedStickerId === id) setSelectedStickerId(null);
  };

  // Update sticker position
  const updateStickerPosition = (id: string, x: number, y: number) => {
    setStickers(stickers =>
      stickers.map(s => s.id === id ? { ...s, x, y } : s)
    );
  };

  // Update text overlay position
  const updateTextPosition = (id: string, x: number, y: number) => {
    setTextOverlays(overlays =>
      overlays.map(overlay =>
        overlay.id === id ? { ...overlay, x, y } : overlay
      )
    );
  };

  // Delete text overlay
  const deleteTextOverlay = (id: string) => {
    setTextOverlays(overlays => overlays.filter(o => o.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  // Update selected text properties
  const updateSelectedText = (updates: Partial<TextOverlay>) => {
    if (!selectedTextId) return;
    setTextOverlays(overlays =>
      overlays.map(overlay =>
        overlay.id === selectedTextId ? { ...overlay, ...updates } : overlay
      )
    );
  };

  const handleDone = () => {
    setShowPublishOptions(true);
  };

  // Publish as post
  const publishAsPost = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.error"), t("common.notLoggedIn"));
      return;
    }
    
    setPublishing(true);
    setShowPublishOptions(false);
    
    try {
      const decodedUri = decodeURIComponent(uri || "");
      const actor = activeIdentity
        ? { type: activeIdentity.type, id: activeIdentity.id }
        : undefined;
      const businessId =
        activeIdentity?.type === "business" ? activeIdentity.id : undefined;
      
      if (type === "video") {
        const isRemoteUri = decodedUri.startsWith("http://") || decodedUri.startsWith("https://");

        if (isRemoteUri) {
          const muxPlaybackId = decodedUri.match(/stream\.mux\.com\/([a-zA-Z0-9]+)\.m3u8/)?.[1];
          await createPost(
            sessionToken,
            postCaption || t("home.sharedAnUpdate") || "Shared an update",
            null,
            null,
            businessId,
            actor,
            null,
            [],
            null,
            null,
            null,
            decodedUri,
            null,
            null,
            muxPlaybackId || undefined,
            muxPlaybackId || undefined,
            "ready"
          );
        } else {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });

          const post = await createPost(
            sessionToken,
            postCaption || t("home.sharedAnUpdate") || "Shared an update",
            null,
            null,
            businessId,
            actor,
            null,
            [],
            null,
            null,
            null,
            null,
            null,
            null
          );

          try {
            const muxResult = await uploadVideoMux(sessionToken, decodedUri, `post:${post.post_id}`, (progress) => {
              setUploadProgress(progress);
            });
            const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : undefined);
            setShowUploadProgress(false);

            await apiRequest(`/posts/${post.post_id}`, "PUT", sessionToken, {
              video_url: videoUrl || undefined,
              mux_upload_id: muxResult.mux_upload_id,
              mux_asset_id: muxResult.mux_asset_id,
              mux_playback_id: muxResult.mux_playback_id,
              mux_thumbnail_url: muxResult.mux_thumbnail_url,
              video_status: muxResult.mux_playback_id ? "ready" : "processing",
            });
          } catch (uploadError) {
            try { await deletePost(sessionToken, post.post_id); } catch (_) {}
            throw uploadError;
          }
        }
      } else {
        setShowUploadProgress(true);
        setUploadProgress({ phase: "uploading", progress: 0 });
        const imageUrl = await uploadMedia(sessionToken, decodedUri, "image", (progress) => {
          setUploadProgress(progress);
        });
        setShowUploadProgress(false);
        
        await createPost(
          sessionToken,
          postCaption || t("home.sharedAnUpdate") || "Shared an update",
          null,
          null,
          businessId,
          actor,
          null,
          [],
          null,
          null,
          imageUrl,
          null,
          null,
          null
        );
      }
      
      Alert.alert(
        t("editor.success") || "Success!",
        t("editor.postPublished") || "Your post has been published!",
        [{ text: t("common.ok"), onPress: () => router.back() }]
      );
    } catch (error) {
      console.error("Error publishing post:", error);
      Alert.alert(t("common.error"), t("editor.publishFailed") || "Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
      setShowUploadProgress(false);
    }
  };

  const publishAsStory = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.error"), t("common.notLoggedIn"));
      return;
    }

    setPublishing(true);
    setShowPublishOptions(false);

    try {
      const decodedUri = decodeURIComponent(uri || "");
      const actor = activeIdentity
        ? { type: activeIdentity.type as "user" | "business" | "artist", id: activeIdentity.id }
        : undefined;

      if (type === "video") {
        if (!decodedUri.startsWith("http://") && !decodedUri.startsWith("https://")) {
          const videoInfo = await FileSystem.getInfoAsync(decodedUri);
          if (videoInfo.exists && videoInfo.size > MAX_STORY_VIDEO_SIZE_MB * 1024 * 1024) {
            Alert.alert(t("common.error"), `Video must be under ${MAX_STORY_VIDEO_SIZE_MB}MB`);
            setPublishing(false);
            return;
          }
        }

        const storyDuration = type === "video" ? (trimEnd - trimStart) : undefined;
        if (storyDuration !== undefined && storyDuration > 60) {
          Alert.alert(t("common.error"), t("stories.maxDurationError") || "Story videos must be 60 seconds or less");
          setPublishing(false);
          return;
        }

        const storyResp = await createStory(sessionToken, {
          media_url: undefined,
          media_type: "video",
          text: postCaption || undefined,
          actor_type: actor?.type,
          actor_id: actor?.id,
          video_status: "uploading",
          duration_seconds: storyDuration,
          latitude: user?.latitude ?? mapBounds?.centerLat ?? undefined,
          longitude: user?.longitude ?? mapBounds?.centerLng ?? undefined,
        });
        const storyId = storyResp.story_id;

        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "preparing", progress: 0 });
          const muxResult = await uploadVideoMux(sessionToken, decodedUri, `story:${storyId}`, (progress) => {
            setUploadProgress(progress);
          });
          setShowUploadProgress(false);

          const videoUrl = muxResult.url || (muxResult.mux_playback_id ? `https://stream.mux.com/${muxResult.mux_playback_id}.m3u8` : null);
          if (videoUrl || muxResult.mux_upload_id) {
            await apiRequest(`/stories/${storyId}`, "PATCH", sessionToken, {
              media_url: videoUrl || undefined,
              mux_upload_id: muxResult.mux_upload_id,
              mux_asset_id: muxResult.mux_asset_id,
              mux_playback_id: muxResult.mux_playback_id,
              mux_thumbnail_url: muxResult.mux_thumbnail_url,
              video_status: muxResult.mux_playback_id ? "ready" : "processing",
            });
          }
        } catch (uploadError) {
          try { await deleteStory(sessionToken, storyId); } catch (_) {}
          throw uploadError;
        }
      } else {
        let mediaUrl: string | undefined;
        try {
          setShowUploadProgress(true);
          setUploadProgress({ phase: "uploading", progress: 0 });
          mediaUrl = await uploadMedia(sessionToken, decodedUri, "image", (progress) => {
            setUploadProgress(progress);
          });
          setShowUploadProgress(false);
        } catch (uploadErr) {
          console.error("Image upload to Cloudinary failed:", uploadErr);
          Alert.alert(t("common.error"), "Failed to upload image. Please try again.");
          return;
        }

        if (!mediaUrl) {
          Alert.alert(t("common.error"), "Upload returned empty URL. Please try again.");
          return;
        }

        await createStory(sessionToken, {
          media_url: mediaUrl || undefined,
          media_type: "image",
          text: postCaption || undefined,
          actor_type: actor?.type,
          actor_id: actor?.id,
          latitude: user?.latitude ?? mapBounds?.centerLat ?? undefined,
          longitude: user?.longitude ?? mapBounds?.centerLng ?? undefined,
        });
      }

      Alert.alert(
        t("editor.success") || "Success!",
        t("stories.storyPublished") || "Your story has been published!",
        [{ text: t("common.ok"), onPress: () => router.back() }]
      );
    } catch (error) {
      console.error("Error publishing story:", error);
      Alert.alert(t("common.error"), t("editor.publishFailed") || "Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
      setShowUploadProgress(false);
    }
  };

  // Drawing handlers
  const handleStrokeStart = (x: number, y: number) => {
    if (!activeDrawingTool) return;
    setIsDrawing(true);
    setCurrentStroke([{ x, y }]);
    Haptics.selectionAsync();
  };

  const handleStrokeMove = (x: number, y: number) => {
    if (!isDrawing || !activeDrawingTool) return;
    setCurrentStroke(prev => [...prev, { x, y }]);
  };

  const handleStrokeEnd = () => {
    if (!isDrawing || !activeDrawingTool || currentStroke.length === 0) return;
    
    const newStroke: DrawingStroke = {
      id: `stroke_${Date.now()}`,
      points: currentStroke,
      color: activeDrawingTool === "eraser" ? "eraser" : drawingColor,
      width: activeDrawingTool === "highlighter" ? brushSize * 3 : brushSize,
      tool: activeDrawingTool,
    };
    
    setDrawingStrokes(prev => [...prev, newStroke]);
    setCurrentStroke([]);
    setIsDrawing(false);
  };

  // Drawing Canvas Component (simplified - tracks strokes)
  const DrawingCanvas = ({
    strokes,
    currentStroke,
    activeTool,
    color,
    brushSize,
    onStrokeStart,
    onStrokeMove,
    onStrokeEnd,
  }: {
    strokes: DrawingStroke[];
    currentStroke: DrawingPoint[];
    activeTool: "pen" | "highlighter" | "eraser";
    color: string;
    brushSize: number;
    onStrokeStart: (x: number, y: number) => void;
    onStrokeMove: (x: number, y: number) => void;
    onStrokeEnd: () => void;
  }) => {
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          onStrokeStart(locationX, locationY);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          onStrokeMove(locationX, locationY);
        },
        onPanResponderRelease: () => {
          onStrokeEnd();
        },
      })
    ).current;

    return (
      <View 
        style={styles.drawingCanvas} 
        {...panResponder.panHandlers}
        pointerEvents="box-only"
      >
        {/* Drawing indicator */}
        {activeTool && (
          <View style={styles.drawingIndicator}>
            <View style={[styles.drawingDot, { backgroundColor: activeTool === "eraser" ? "#FF3B30" : color, width: brushSize * 2, height: brushSize * 2 }]} />
          </View>
        )}
      </View>
    );
  };

  // Snap grid settings
  const SNAP_THRESHOLD = 10; // pixels to snap
  const GRID_LINES = {
    centerX: CANVAS_WIDTH / 2,
    centerY: CANVAS_HEIGHT / 2,
    thirds: [CANVAS_WIDTH / 3, (CANVAS_WIDTH * 2) / 3],
    thirdsY: [CANVAS_HEIGHT / 3, (CANVAS_HEIGHT * 2) / 3],
  };

  // State for showing alignment guides
  const [showGuides, setShowGuides] = useState<{ vertical?: number; horizontal?: number }>({});

  // Snap to grid helper with haptic feedback
  const snapToGrid = (x: number, y: number, width: number = 100, height: number = 50) => {
    let snappedX = x;
    let snappedY = y;
    const guides: { vertical?: number; horizontal?: number } = {};
    let didSnap = false;

    // Center X snap
    const centerX = x + width / 2;
    if (Math.abs(centerX - GRID_LINES.centerX) < SNAP_THRESHOLD) {
      snappedX = GRID_LINES.centerX - width / 2;
      guides.vertical = GRID_LINES.centerX;
      didSnap = true;
    }

    // Center Y snap
    const centerY = y + height / 2;
    if (Math.abs(centerY - GRID_LINES.centerY) < SNAP_THRESHOLD) {
      snappedY = GRID_LINES.centerY - height / 2;
      guides.horizontal = GRID_LINES.centerY;
      didSnap = true;
    }

    // Left edge snap
    if (Math.abs(x - 20) < SNAP_THRESHOLD) {
      snappedX = 20;
      guides.vertical = 20;
      didSnap = true;
    }

    // Right edge snap
    if (Math.abs(x + width - (CANVAS_WIDTH - 20)) < SNAP_THRESHOLD) {
      snappedX = CANVAS_WIDTH - 20 - width;
      guides.vertical = CANVAS_WIDTH - 20;
      didSnap = true;
    }

    // Top edge snap
    if (Math.abs(y - 20) < SNAP_THRESHOLD) {
      snappedY = 20;
      guides.horizontal = 20;
      didSnap = true;
    }

    // Bottom edge snap
    if (Math.abs(y + height - (CANVAS_HEIGHT - 20)) < SNAP_THRESHOLD) {
      snappedY = CANVAS_HEIGHT - 20 - height;
      guides.horizontal = CANVAS_HEIGHT - 20;
      didSnap = true;
    }

    // Trigger haptic feedback when snapping occurs
    if (didSnap) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    return { x: snappedX, y: snappedY, guides };
  };

  // Helper to normalize rotation to -180 to 180 range
  const normalizeRotation = (degrees: number): number => {
    let normalized = degrees % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
  };

  // Improved Draggable text component with pinch-to-zoom and two-finger rotation
  const DraggableText = ({ overlay }: { overlay: TextOverlay }) => {
    const pan = useRef(new Animated.ValueXY({ x: overlay.x, y: overlay.y })).current;
    const scaleAnim = useRef(new Animated.Value(overlay.scale)).current;
    const rotationAnim = useRef(new Animated.Value(overlay.rotation)).current;
    const isSelected = selectedTextId === overlay.id;
    const lastScale = useRef(overlay.scale);
    const lastRotation = useRef(overlay.rotation);
    const lastDistance = useRef(0);
    const lastAngle = useRef(0);
    const [gestureHint, setGestureHint] = useState<'drag' | 'pinch' | 'rotate' | null>(null);

    // Update animation values when overlay properties change externally
    useEffect(() => {
      Animated.parallel([
        Animated.spring(pan, {
          toValue: { x: overlay.x, y: overlay.y },
          useNativeDriver: true,
          bounciness: 5,
        }),
        Animated.spring(scaleAnim, {
          toValue: overlay.scale,
          useNativeDriver: true,
          bounciness: 5,
        }),
        Animated.spring(rotationAnim, {
          toValue: overlay.rotation,
          useNativeDriver: true,
          bounciness: 5,
        }),
      ]).start();
      lastScale.current = overlay.scale;
      lastRotation.current = overlay.rotation;
    }, [overlay.x, overlay.y, overlay.scale, overlay.rotation]);

    // Calculate distance between two touches
    const getTouchDistance = (touches: any[]) => {
      if (touches.length < 2) return 0;
      const dx = touches[1].pageX - touches[0].pageX;
      const dy = touches[1].pageY - touches[0].pageY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    // Calculate angle between two touches
    const getTouchAngle = (touches: any[]) => {
      if (touches.length < 2) return 0;
      return Math.atan2(
        touches[1].pageY - touches[0].pageY,
        touches[1].pageX - touches[0].pageX
      ) * (180 / Math.PI);
    };

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          setSelectedTextId(overlay.id);
          pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
          pan.setValue({ x: 0, y: 0 });
          
          const touches = evt.nativeEvent.touches;
          if (touches.length === 2) {
            lastDistance.current = getTouchDistance(touches);
            lastAngle.current = getTouchAngle(touches);
            setGestureHint('pinch');
          } else {
            setGestureHint('drag');
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          
          if (touches.length === 2) {
            // Two-finger gesture: pinch to scale OR rotate
            const newDistance = getTouchDistance(touches);
            const newAngle = getTouchAngle(touches);
            
            const distanceDelta = newDistance - lastDistance.current;
            const angleDelta = newAngle - lastAngle.current;
            
            // Determine gesture type based on which delta is larger
            if (Math.abs(distanceDelta) > Math.abs(angleDelta) * 2) {
              // Pinch gesture (scale)
              setGestureHint('pinch');
              const scaleDelta = distanceDelta / 150;
              const newScale = Math.max(0.3, Math.min(4, lastScale.current + scaleDelta));
              scaleAnim.setValue(newScale);
            } else if (Math.abs(angleDelta) > 2) {
              // Rotation gesture
              setGestureHint('rotate');
              const newRotation = lastRotation.current + angleDelta;
              rotationAnim.setValue(newRotation);
            }
            
            lastDistance.current = newDistance;
            lastAngle.current = newAngle;
          } else if (touches.length === 1) {
            // Single touch - drag
            setGestureHint('drag');
            pan.setValue({ x: gestureState.dx, y: gestureState.dy });
          }
        },
        onPanResponderRelease: () => {
          pan.flattenOffset();
          
          const finalX = Math.max(0, Math.min(CANVAS_WIDTH - 50, (pan.x as any)._value));
          const finalY = Math.max(0, Math.min(CANVAS_HEIGHT - 30, (pan.y as any)._value));
          
          setTextOverlays(overlays =>
            overlays.map(o =>
              o.id === overlay.id 
                ? { 
                    ...o, 
                    x: finalX, 
                    y: finalY, 
                    scale: lastScale.current,
                    rotation: normalizeRotation(lastRotation.current) 
                  }
                : o
            )
          );
          
          lastDistance.current = 0;
          lastAngle.current = 0;
          setGestureHint(null);
        },
      })
    ).current;

    const font = FONTS.find(f => f.id === overlay.fontId) || FONTS[0];
    const bgStyle = TEXT_BACKGROUNDS.find(b => b.id === (overlay.backgroundId || "none"))?.style || {};

    return (
      <Animated.View
        style={[
          styles.draggableText,
          {
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { rotate: rotationAnim.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) },
              { scale: scaleAnim },
            ],
          },
          isSelected && styles.draggableTextSelected,
        ]}
        {...panResponder.panHandlers}
      >
        {/* Selection border and handles */}
        {isSelected && (
          <>
            {/* Corner resize handles */}
            <View style={[styles.resizeHandle, styles.resizeHandleTL]} />
            <View style={[styles.resizeHandle, styles.resizeHandleTR]} />
            <View style={[styles.resizeHandle, styles.resizeHandleBL]} />
            <View style={[styles.resizeHandle, styles.resizeHandleBR]} />
            
            {/* Rotation indicator */}
            <View style={styles.rotationHandle}>
              <Ionicons name="refresh" size={14} color="#fff" />
            </View>
            <View style={styles.rotationLine} />
          </>
        )}
        
        <Text
          style={[
            styles.overlayText,
            {
              color: overlay.color,
              fontSize: overlay.fontSize,
              fontWeight: font.fontWeight,
              fontStyle: font.fontStyle,
              fontFamily: font.fontFamily,
            },
            bgStyle,
          ]}
        >
          {overlay.text}
        </Text>
        
        {/* Gesture hint tooltip */}
        {isSelected && gestureHint && (
          <View style={styles.gestureHint}>
            <Text style={styles.gestureHintText}>
              {gestureHint === 'drag' && '↔ Drag to move'}
              {gestureHint === 'pinch' && '⇲ Pinch to resize'}
              {gestureHint === 'rotate' && '↻ Two fingers to rotate'}
            </Text>
          </View>
        )}
        
        {/* Delete button */}
        {isSelected && (
          <Pressable
            style={styles.deleteTextButton}
            onPress={() => deleteTextOverlay(overlay.id)}
          >
            <View style={styles.deleteButtonInner}>
              <Ionicons name="close" size={14} color="#fff" />
            </View>
          </Pressable>
        )}
      </Animated.View>
    );
  };

  // Draggable Sticker component
  const DraggableSticker = ({ sticker, onDelete }: { sticker: Sticker; onDelete: () => void }) => {
    const pan = useRef(new Animated.ValueXY({ x: sticker.x, y: sticker.y })).current;
    const isSelected = selectedStickerId === sticker.id;

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          setSelectedStickerId(sticker.id);
          pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_, gesture) => {
          pan.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: () => {
          pan.flattenOffset();
          const finalX = (pan.x as any)._value;
          const finalY = (pan.y as any)._value;
          updateStickerPosition(sticker.id, finalX, finalY);
        },
      })
    ).current;

    const getStickerContent = () => {
      switch (sticker.type) {
        case "location":
          return (
            <View style={styles.stickerContentBox}>
              <Ionicons name="location" size={18} color="#FF3B30" />
              <Text style={styles.stickerText}>{sticker.locationName}</Text>
            </View>
          );
        case "mention":
          return (
            <View style={styles.stickerContentBox}>
              <Ionicons name="at" size={18} color="#3897f0" />
              <Text style={styles.stickerText}>{sticker.mentionUsername}</Text>
            </View>
          );
        case "hashtag":
          return (
            <View style={styles.stickerContentBox}>
              <Ionicons name="pricetag" size={18} color="#E4405D" />
              <Text style={styles.stickerText}>{sticker.hashtagName}</Text>
            </View>
          );
        case "poll":
          return (
            <View style={styles.pollSticker}>
              <Text style={styles.pollQuestionText}>{sticker.pollQuestion}</Text>
              {sticker.pollOptions?.map((option, idx) => (
                <View key={idx} style={styles.pollOptionItem}>
                  <View style={styles.pollCheckbox} />
                  <Text style={styles.pollOptionText}>{option}</Text>
                </View>
              ))}
            </View>
          );
        case "emoji":
          return (
            <View style={styles.emojiSticker}>
              <Text style={styles.emojiStickerText}>{["😂", "🔥", "❤️", "😍", "👍"][sticker.emojiValue || 0]}</Text>
            </View>
          );
        case "countdown":
          return (
            <View style={styles.countdownSticker}>
              <Ionicons name="time" size={24} color="#8b5cf6" />
              <Text style={styles.countdownLabel}>Countdown</Text>
              <Text style={styles.countdownTime}>
                {new Date(sticker.countdownDate || Date.now() + 86400000).toLocaleDateString()}
              </Text>
            </View>
          );
        default:
          return null;
      }
    };

    return (
      <Animated.View
        style={[
          styles.draggableSticker,
          {
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { rotate: `${sticker.rotation}deg` },
              { scale: sticker.scale },
            ],
          },
          isSelected && styles.draggableStickerSelected,
        ]}
        {...panResponder.panHandlers}
      >
        {getStickerContent()}
        {isSelected && (
          <>
            <Pressable style={styles.deleteStickerBtn} onPress={onDelete}>
              <View style={styles.deleteButtonInner}>
                <Ionicons name="close" size={12} color="#fff" />
              </View>
            </Pressable>
          </>
        )}
      </Animated.View>
    );
  };

  // Get filter overlay style
  const getFilterOverlay = () => {
    const filter = FILTERS.find(f => f.id === selectedFilter);
    if (!filter || selectedFilter === "none") return null;
    
    if (selectedFilter === "bw") {
      return <View style={[styles.filterOverlay, { backgroundColor: "rgba(128,128,128,0.5)" }]} />;
    }
    if (filter.style.tintColor) {
      return <View style={[styles.filterOverlay, { backgroundColor: filter.style.tintColor }]} />;
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {t("editor.title") || "Edit"}
          </Text>
          <Pressable onPress={handleDone} style={styles.doneButton}>
            <Text style={styles.doneButtonText}>{t("common.save") || "Done"}</Text>
          </Pressable>
        </View>

      {/* Canvas */}
      <View style={styles.canvasContainer}>
        <View style={styles.canvas}>
          {/* Media */}
          {type === "video" ? (
            <Video
              ref={videoRef}
              source={{ uri: decodeURIComponent(uri || "") }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              shouldPlay={true}
              isLooping={true}
              isMuted={false}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            />
          ) : (
            <Image
              source={{ uri: decodeURIComponent(uri || "") }}
              style={styles.media}
              resizeMode="cover"
            />
          )}

          {/* Filter Overlay */}
          {getFilterOverlay()}

          {/* Alignment Guides */}
          {showGuides.vertical !== undefined && (
            <View style={[styles.alignmentGuide, styles.verticalGuide, { left: showGuides.vertical }]} />
          )}
          {showGuides.horizontal !== undefined && (
            <View style={[styles.alignmentGuide, styles.horizontalGuide, { top: showGuides.horizontal }]} />
          )}

          {/* Text Overlays */}
          {textOverlays.map(overlay => (
            <DraggableText key={overlay.id} overlay={overlay} />
          ))}
          
          {/* Stickers */}
          {stickers.map(sticker => (
            <DraggableSticker key={sticker.id} sticker={sticker} onDelete={() => deleteSticker(sticker.id)} />
          ))}
          
          {/* Drawing Canvas Overlay */}
          {activeDrawingTool && (
            <DrawingCanvas
              strokes={drawingStrokes}
              currentStroke={currentStroke}
              activeTool={activeDrawingTool}
              color={drawingColor}
              brushSize={brushSize}
              onStrokeStart={handleStrokeStart}
              onStrokeMove={handleStrokeMove}
              onStrokeEnd={handleStrokeEnd}
            />
          )}
          
          {/* Video Play Button Overlay */}
          {type === "video" && !isPlaying && (
            <Pressable style={styles.playButtonOverlay} onPress={togglePlayPause}>
              <View style={styles.playButton}>
                <Ionicons name="play" size={40} color="#fff" />
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {/* Bottom Tools */}
      <View style={styles.toolsContainer}>
        {/* Tool Tabs */}
        <View style={styles.toolTabs}>
          <Pressable
            style={[styles.toolTab, activeTab === "text" && styles.toolTabActive]}
            onPress={() => setActiveTab(activeTab === "text" ? "none" : "text")}
          >
            <Ionicons name="text" size={24} color={activeTab === "text" ? "#000000" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "text" && styles.toolTabTextActive]}>
              {t("editor.text") || "Text"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toolTab, activeTab === "filter" && styles.toolTabActive]}
            onPress={() => setActiveTab(activeTab === "filter" ? "none" : "filter")}
          >
            <Ionicons name="color-filter" size={24} color={activeTab === "filter" ? "#000000" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "filter" && styles.toolTabTextActive]}>
              {t("editor.filter") || "Filter"}
            </Text>
          </Pressable>
          {type === "video" && (
            <Pressable
              style={[styles.toolTab, activeTab === "trim" && styles.toolTabActive]}
              onPress={() => setActiveTab(activeTab === "trim" ? "none" : "trim")}
            >
              <Ionicons name="cut" size={24} color={activeTab === "trim" ? "#000000" : "#fff"} />
              <Text style={[styles.toolTabText, activeTab === "trim" && styles.toolTabTextActive]}>
                {t("editor.trim") || "Trim"}
              </Text>
            </Pressable>
          )}
          {/* Music Tab */}
          <Pressable
            style={[styles.toolTab, activeTab === "music" && styles.toolTabActive]}
            onPress={() => setActiveTab(activeTab === "music" ? "none" : "music")}
          >
            <Ionicons name="musical-notes" size={24} color={activeTab === "music" ? "#000000" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "music" && styles.toolTabTextActive]}>
              {t("editor.music") || "Music"}
            </Text>
          </Pressable>
          {/* Sticker Tab */}
          <Pressable
            style={[styles.toolTab, activeTab === "sticker" && styles.toolTabActive]}
            onPress={() => setActiveTab(activeTab === "sticker" ? "none" : "sticker")}
          >
            <Ionicons name="happy-outline" size={24} color={activeTab === "sticker" ? "#000000" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "sticker" && styles.toolTabTextActive]}>
              {t("editor.stickers") || "Stickers"}
            </Text>
          </Pressable>
          {/* Draw Tab */}
          <Pressable
            style={[styles.toolTab, activeTab === "draw" && styles.toolTabActive]}
            onPress={() => setActiveTab(activeTab === "draw" ? "none" : "draw")}
          >
            <Ionicons name="pencil" size={24} color={activeTab === "draw" ? "#000000" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "draw" && styles.toolTabTextActive]}>
              {t("editor.draw") || "Draw"}
            </Text>
          </Pressable>
        </View>

        {/* Text Tool Panel */}
        {activeTab === "text" && (
          <View style={styles.toolPanel}>
            {/* Instructions */}
            <View style={styles.textInstructions}>
              <Ionicons name="finger-print-outline" size={16} color="#000000" />
              <Text style={styles.textInstructionsText}>
                {t("editor.dragToPosition") || "Add text, then drag to position it on the image"}
              </Text>
            </View>
            
            {/* Text Preview (if text is entered) */}
            {newText.length > 0 && (
              <View style={styles.textPreviewBox}>
                <Text style={styles.textPreviewLabel}>{t("editor.preview") || "Preview"}:</Text>
                <Text style={[
                  styles.textPreviewText,
                  { 
                    color: selectedColor,
                    fontSize: Math.min(fontSize, 24),
                    fontWeight: FONTS.find(f => f.id === selectedFont)?.fontWeight,
                    fontStyle: FONTS.find(f => f.id === selectedFont)?.fontStyle,
                  }
                ]}>
                  {newText}
                </Text>
              </View>
            )}
            
            {/* Text Input */}
            <View style={styles.textInputRow}>
              <TextInput
                style={styles.textInput}
                placeholder={t("editor.enterText") || "Enter text..."}
                placeholderTextColor="#999"
                value={newText}
                onChangeText={setNewText}
                onSubmitEditing={addTextOverlay}
              />
              <Pressable style={styles.addTextButton} onPress={addTextOverlay}>
                <Ionicons name="add-circle" size={32} color="#000000" />
              </Pressable>
            </View>

            {/* Color Picker */}
            <Text style={styles.toolLabel}>{t("editor.color") || "Color"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorRow}>
              {TEXT_COLORS.map(color => (
                <Pressable
                  key={color}
                  style={[
                    styles.colorButton,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorButtonSelected,
                  ]}
                  onPress={() => {
                    setSelectedColor(color);
                    updateSelectedText({ color });
                  }}
                />
              ))}
            </ScrollView>

            {/* Font Picker */}
            <Text style={styles.toolLabel}>{t("editor.font") || "Font"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fontRow}>
              {FONTS.map(font => (
                <Pressable
                  key={font.id}
                  style={[
                    styles.fontButton,
                    selectedFont === font.id && styles.fontButtonSelected,
                  ]}
                  onPress={() => {
                    setSelectedFont(font.id);
                    updateSelectedText({ fontId: font.id });
                  }}
                >
                  <Text
                    style={[
                      styles.fontButtonText,
                      { fontWeight: font.fontWeight, fontStyle: font.fontStyle },
                      selectedFont === font.id && styles.fontButtonTextSelected,
                    ]}
                  >
                    {font.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Font Size */}
            <Text style={styles.toolLabel}>{t("editor.size") || "Size"}: {fontSize}</Text>
            <View style={styles.sizeRow}>
              <Pressable
                style={styles.sizeButton}
                onPress={() => {
                  const newSize = Math.max(12, fontSize - 4);
                  setFontSize(newSize);
                  updateSelectedText({ fontSize: newSize });
                }}
              >
                <Ionicons name="remove" size={24} color="#fff" />
              </Pressable>
              <View style={styles.sizePreview}>
                <Text style={[styles.sizePreviewText, { fontSize: Math.min(fontSize, 32) }]}>Aa</Text>
              </View>
              <Pressable
                style={styles.sizeButton}
                onPress={() => {
                  const newSize = Math.min(72, fontSize + 4);
                  setFontSize(newSize);
                  updateSelectedText({ fontSize: newSize });
                }}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </Pressable>
            </View>

            {/* Text Background Style */}
            <Text style={styles.toolLabel}>{t("editor.textStyle") || "Text Style"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.backgroundRow}>
              {TEXT_BACKGROUNDS.map(bg => (
                <Pressable
                  key={bg.id}
                  style={[
                    styles.backgroundButton,
                    selectedBackground === bg.id && styles.backgroundButtonSelected,
                  ]}
                  onPress={() => {
                    setSelectedBackground(bg.id);
                    updateSelectedText({ backgroundId: bg.id });
                  }}
                >
                  <Text style={[styles.backgroundButtonText, bg.style]}>
                    {bg.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Precision Controls - Only show when text is selected */}
            {selectedTextId && (
              <>
                {/* Quick Actions Row */}
                <View style={styles.quickActionsRow}>
                  <Pressable 
                    style={styles.quickActionButton}
                    onPress={() => {
                      const current = textOverlays.find(o => o.id === selectedTextId);
                      if (current) updateSelectedText({ rotation: current.rotation - 45 });
                    }}
                  >
                    <Ionicons name="arrow-undo" size={18} color="#fff" />
                    <Text style={styles.quickActionText}>Rotate -45°</Text>
                  </Pressable>
                  <Pressable 
                    style={styles.quickActionButton}
                    onPress={() => {
                      const current = textOverlays.find(o => o.id === selectedTextId);
                      if (current) updateSelectedText({ rotation: current.rotation + 45 });
                    }}
                  >
                    <Ionicons name="arrow-redo" size={18} color="#fff" />
                    <Text style={styles.quickActionText}>Rotate +45°</Text>
                  </Pressable>
                  <Pressable 
                    style={[styles.quickActionButton, styles.resetActionButton]}
                    onPress={() => updateSelectedText({ rotation: 0, scale: 1 })}
                  >
                    <Ionicons name="refresh" size={18} color="#FF9500" />
                    <Text style={[styles.quickActionText, { color: '#FF9500' }]}>Reset</Text>
                  </Pressable>
                </View>

                {/* Fine-tune Rotation */}
                <View style={styles.sliderControl}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.sliderLabel}>Rotation</Text>
                    <Text style={styles.sliderValue}>
                      {Math.round(textOverlays.find(o => o.id === selectedTextId)?.rotation || 0)}°
                    </Text>
                  </View>
                  <View style={styles.stepperRow}>
                    <Pressable 
                      style={styles.stepperButton}
                      onPress={() => {
                        const current = textOverlays.find(o => o.id === selectedTextId)?.rotation || 0;
                        updateSelectedText({ rotation: Math.max(-180, current - 15) });
                      }}
                    >
                      <Ionicons name="remove" size={20} color="#fff" />
                    </Pressable>
                    <View style={styles.stepperDisplay}>
                      <Text style={styles.stepperValue}>
                        {Math.round(textOverlays.find(o => o.id === selectedTextId)?.rotation || 0)}°
                      </Text>
                    </View>
                    <Pressable 
                      style={styles.stepperButton}
                      onPress={() => {
                        const current = textOverlays.find(o => o.id === selectedTextId)?.rotation || 0;
                        updateSelectedText({ rotation: Math.min(180, current + 15) });
                      }}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </View>
                </View>

                {/* Fine-tune Size */}
                <View style={styles.sliderControl}>
                  <View style={styles.sliderHeader}>
                    <Text style={styles.sliderLabel}>Size</Text>
                    <Text style={styles.sliderValue}>
                      {Math.round((textOverlays.find(o => o.id === selectedTextId)?.scale || 1) * 100)}%
                    </Text>
                  </View>
                  <View style={styles.stepperRow}>
                    <Pressable 
                      style={styles.stepperButton}
                      onPress={() => {
                        const current = textOverlays.find(o => o.id === selectedTextId)?.scale || 1;
                        updateSelectedText({ scale: Math.max(0.3, current - 0.2) });
                      }}
                    >
                      <Ionicons name="remove" size={20} color="#fff" />
                    </Pressable>
                    <View style={styles.stepperDisplay}>
                      <Text style={styles.stepperValue}>
                        {Math.round((textOverlays.find(o => o.id === selectedTextId)?.scale || 1) * 100)}%
                      </Text>
                    </View>
                    <Pressable 
                      style={styles.stepperButton}
                      onPress={() => {
                        const current = textOverlays.find(o => o.id === selectedTextId)?.scale || 1;
                        updateSelectedText({ scale: Math.min(3, current + 0.2) });
                      }}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.tipText}>
                  💡 Drag text to move • Pinch with two fingers to resize • Two-finger rotate gesture
                </Text>
              </>
            )}
          </View>
        )}

        {/* Filter Tool Panel */}
        {activeTab === "filter" && (
          <View style={styles.toolPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {FILTERS.map(filter => (
                <Pressable
                  key={filter.id}
                  style={[
                    styles.filterButton,
                    selectedFilter === filter.id && styles.filterButtonSelected,
                  ]}
                  onPress={() => setSelectedFilter(filter.id)}
                >
                  <View style={styles.filterPreview}>
                    {type === "video" ? (
                      <View style={[styles.filterPreviewPlaceholder, filter.style.tintColor ? { backgroundColor: filter.style.tintColor } : {}]} />
                    ) : (
                      <Image
                        source={{ uri: decodeURIComponent(uri || "") }}
                        style={[styles.filterPreviewImage]}
                      />
                    )}
                    {filter.id !== "none" && filter.style.tintColor && (
                      <View style={[styles.filterPreviewOverlay, { backgroundColor: filter.style.tintColor }]} />
                    )}
                  </View>
                  <Text style={[
                    styles.filterName,
                    selectedFilter === filter.id && styles.filterNameSelected
                  ]}>
                    {filter.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Trim Tool Panel */}
        {activeTab === "trim" && type === "video" && (
          <View style={styles.toolPanel}>
            {/* Video Timeline */}
            <View style={styles.trimContainer}>
              {/* Duration Display */}
              <View style={styles.trimDurationRow}>
                <Text style={styles.trimDurationText}>
                  {formatTime(trimStart)} - {formatTime(trimEnd)}
                </Text>
                <Text style={styles.trimDurationBadge}>
                  {formatTime(trimDuration)} {t("editor.selected") || "selected"}
                </Text>
              </View>

              {/* Timeline Scrubber */}
              <View style={styles.timelineContainer}>
                {/* Background Track */}
                <View style={styles.timelineTrack}>
                  {/* Selected Range */}
                  <View 
                    style={[
                      styles.timelineSelected,
                      {
                        left: `${(trimStart / Math.max(videoDuration, 1)) * 100}%`,
                        width: `${((trimEnd - trimStart) / Math.max(videoDuration, 1)) * 100}%`,
                      }
                    ]}
                  />
                  {/* Current Position Indicator */}
                  <View 
                    style={[
                      styles.timelinePosition,
                      { left: `${(currentPosition / Math.max(videoDuration, 1)) * 100}%` }
                    ]}
                  />
                </View>

                {/* Start Handle */}
                <Pressable
                  style={[
                    styles.trimHandle,
                    styles.trimHandleStart,
                    { left: `${(trimStart / Math.max(videoDuration, 1)) * 100}%` }
                  ]}
                  onPress={() => seekToPosition(trimStart)}
                >
                  <View style={styles.trimHandleBar} />
                </Pressable>

                {/* End Handle */}
                <Pressable
                  style={[
                    styles.trimHandle,
                    styles.trimHandleEnd,
                    { left: `${(trimEnd / Math.max(videoDuration, 1)) * 100}%` }
                  ]}
                  onPress={() => seekToPosition(trimEnd)}
                >
                  <View style={styles.trimHandleBar} />
                </Pressable>
              </View>

              {/* Trim Controls */}
              <View style={styles.trimControlsRow}>
                <View style={styles.trimControl}>
                  <Text style={styles.trimControlLabel}>{t("editor.start") || "Start"}</Text>
                  <View style={styles.trimControlButtons}>
                    <Pressable
                      style={styles.trimControlBtn}
                      onPress={() => setTrimStart(Math.max(0, trimStart - 1))}
                    >
                      <Ionicons name="remove" size={20} color="#fff" />
                    </Pressable>
                    <Text style={styles.trimControlValue}>{formatTime(trimStart)}</Text>
                    <Pressable
                      style={styles.trimControlBtn}
                      onPress={() => setTrimStart(Math.min(trimEnd - 1, trimStart + 1))}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </View>
                </View>

                {/* Play/Pause Button */}
                <Pressable style={styles.playPauseButton} onPress={togglePlayPause}>
                  <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
                </Pressable>

                <View style={styles.trimControl}>
                  <Text style={styles.trimControlLabel}>{t("editor.end") || "End"}</Text>
                  <View style={styles.trimControlButtons}>
                    <Pressable
                      style={styles.trimControlBtn}
                      onPress={() => setTrimEnd(Math.max(trimStart + 1, trimEnd - 1))}
                    >
                      <Ionicons name="remove" size={20} color="#fff" />
                    </Pressable>
                    <Text style={styles.trimControlValue}>{formatTime(trimEnd)}</Text>
                    <Pressable
                      style={styles.trimControlBtn}
                      onPress={() => setTrimEnd(Math.min(videoDuration, trimEnd + 1))}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Quick Trim Presets */}
              <View style={styles.trimPresetsRow}>
                <Pressable
                  style={[styles.trimPreset, trimDuration <= 5 && styles.trimPresetActive]}
                  onPress={() => { setTrimStart(0); setTrimEnd(Math.min(5, videoDuration)); }}
                >
                  <Text style={styles.trimPresetText}>5s</Text>
                </Pressable>
                <Pressable
                  style={[styles.trimPreset, trimDuration > 5 && trimDuration <= 10 && styles.trimPresetActive]}
                  onPress={() => { setTrimStart(0); setTrimEnd(Math.min(10, videoDuration)); }}
                >
                  <Text style={styles.trimPresetText}>10s</Text>
                </Pressable>
                <Pressable
                  style={[styles.trimPreset, trimDuration > 10 && trimDuration <= 15 && styles.trimPresetActive]}
                  onPress={() => { setTrimStart(0); setTrimEnd(Math.min(15, videoDuration)); }}
                >
                  <Text style={styles.trimPresetText}>15s</Text>
                </Pressable>
                <Pressable
                  style={[styles.trimPreset, trimDuration > 15 && styles.trimPresetActive]}
                  onPress={() => { setTrimStart(0); setTrimEnd(Math.min(30, videoDuration)); }}
                >
                  <Text style={styles.trimPresetText}>{t("editor.full") || "Full"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Music Panel */}
        {activeTab === "music" && (
          <View style={styles.toolPanel}>
            <View style={styles.musicHeader}>
              <Text style={styles.musicTitle}>{t("editor.selectMusic") || "Select Music"}</Text>
              {selectedMusic !== "none" && (
                <View style={styles.musicControls}>
                  <Pressable
                    style={styles.musicControlButton}
                    onPress={() => setMusicMuted(!musicMuted)}
                  >
                    <Ionicons 
                      name={musicMuted ? "volume-mute" : "volume-high"} 
                      size={20} 
                      color={musicMuted ? "#666" : "#000000"} 
                    />
                  </Pressable>
                  {type === "video" && (
                    <Pressable
                      style={styles.musicControlButton}
                      onPress={() => setVideoMuted(!videoMuted)}
                    >
                      <Ionicons 
                        name={videoMuted ? "videocam-off" : "videocam"} 
                        size={20} 
                        color={videoMuted ? "#666" : "#10b981"} 
                      />
                      <Text style={styles.musicControlLabel}>
                        {videoMuted ? "Video Off" : "Video On"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>
            
            {/* Volume Slider */}
            {selectedMusic !== "none" && (
              <View style={styles.volumeContainer}>
                <Ionicons name="volume-low" size={18} color="#666" />
                <View style={styles.volumeSlider}>
                  <View style={[styles.volumeFill, { width: `${musicVolume * 100}%` }]} />
                  <Pressable
                    style={[styles.volumeThumb, { left: `${musicVolume * 100}%` }]}
                    onPress={() => {}}
                  />
                </View>
                <Ionicons name="volume-high" size={18} color="#666" />
                <View style={styles.volumeButtons}>
                  <Pressable 
                    style={styles.volumeBtn}
                    onPress={() => setMusicVolume(Math.max(0, musicVolume - 0.1))}
                  >
                    <Ionicons name="remove" size={16} color="#fff" />
                  </Pressable>
                  <Text style={styles.volumeText}>{Math.round(musicVolume * 100)}%</Text>
                  <Pressable 
                    style={styles.volumeBtn}
                    onPress={() => setMusicVolume(Math.min(1, musicVolume + 0.1))}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}
            
            {/* Music Track List */}
            <ScrollView style={styles.musicList} showsVerticalScrollIndicator={false}>
              {loadingMusic && (
                <View style={styles.loadingMusicContainer}>
                  <ActivityIndicator size="small" color="#000000" />
                  <Text style={styles.loadingMusicText}>Loading music...</Text>
                </View>
              )}
              {musicTracks.map(track => (
                <Pressable
                  key={track.id}
                  style={[
                    styles.musicTrack,
                    selectedMusic === track.id && styles.musicTrackSelected,
                  ]}
                  onPress={() => setSelectedMusic(track.id)}
                >
                  <View style={styles.musicTrackIcon}>
                    <Ionicons 
                      name={track.icon as any} 
                      size={24} 
                      color={selectedMusic === track.id ? "#000000" : "#fff"} 
                    />
                  </View>
                  <View style={styles.musicTrackInfo}>
                    <Text style={[
                      styles.musicTrackName,
                      selectedMusic === track.id && styles.musicTrackNameSelected,
                    ]}>
                      {track.name}
                    </Text>
                    {track.artist_name && (
                      <Text style={styles.musicTrackArtist}>{track.artist_name}</Text>
                    )}
                    {track.genre && (
                      <Text style={styles.musicTrackGenre}>{track.genre}</Text>
                    )}
                  </View>
                  {selectedMusic === track.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#000000" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Sticker Panel */}
        {activeTab === "sticker" && (
          <View style={styles.toolPanel}>
            {/* Sticker Type Selector */}
            <View style={styles.stickerTypeRow}>
              <Pressable
                style={[styles.stickerTypeBtn, activeStickerType === "location" && styles.stickerTypeBtnActive]}
                onPress={() => setActiveStickerType(activeStickerType === "location" ? null : "location")}
              >
                <Ionicons name="location" size={24} color={activeStickerType === "location" ? "#000000" : "#fff"} />
                <Text style={[styles.stickerTypeText, activeStickerType === "location" && styles.stickerTypeTextActive]}>
                  {t("editor.location") || "Location"}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.stickerTypeBtn, activeStickerType === "mention" && styles.stickerTypeBtnActive]}
                onPress={() => setActiveStickerType(activeStickerType === "mention" ? null : "mention")}
              >
                <Ionicons name="at" size={24} color={activeStickerType === "mention" ? "#000000" : "#fff"} />
                <Text style={[styles.stickerTypeText, activeStickerType === "mention" && styles.stickerTypeTextActive]}>
                  {t("editor.mention") || "Mention"}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.stickerTypeBtn, activeStickerType === "hashtag" && styles.stickerTypeBtnActive]}
                onPress={() => setActiveStickerType(activeStickerType === "hashtag" ? null : "hashtag")}
              >
                <Ionicons name="pricetag" size={24} color={activeStickerType === "hashtag" ? "#000000" : "#fff"} />
                <Text style={[styles.stickerTypeText, activeStickerType === "hashtag" && styles.stickerTypeTextActive]}>
                  {t("editor.hashtag") || "Hashtag"}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.stickerTypeBtn, activeStickerType === "poll" && styles.stickerTypeBtnActive]}
                onPress={() => setActiveStickerType(activeStickerType === "poll" ? null : "poll")}
              >
                <Ionicons name="bar-chart" size={24} color={activeStickerType === "poll" ? "#000000" : "#fff"} />
                <Text style={[styles.stickerTypeText, activeStickerType === "poll" && styles.stickerTypeTextActive]}>
                  {t("editor.poll") || "Poll"}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.stickerTypeBtn, activeStickerType === "emoji" && styles.stickerTypeBtnActive]}
                onPress={() => setActiveStickerType(activeStickerType === "emoji" ? null : "emoji")}
              >
                <Ionicons name="happy" size={24} color={activeStickerType === "emoji" ? "#000000" : "#fff"} />
                <Text style={[styles.stickerTypeText, activeStickerType === "emoji" && styles.stickerTypeTextActive]}>
                  {t("editor.emoji") || "Emoji"}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.stickerTypeBtn, activeStickerType === "countdown" && styles.stickerTypeBtnActive]}
                onPress={() => setActiveStickerType(activeStickerType === "countdown" ? null : "countdown")}
              >
                <Ionicons name="time" size={24} color={activeStickerType === "countdown" ? "#000000" : "#fff"} />
                <Text style={[styles.stickerTypeText, activeStickerType === "countdown" && styles.stickerTypeTextActive]}>
                  {t("editor.countdown") || "Timer"}
                </Text>
              </Pressable>
            </View>

            {/* Sticker Content Based on Type */}
            {activeStickerType === "location" && (
              <View style={styles.stickerContent}>
                <TextInput
                  style={styles.stickerInput}
                  placeholder={t("editor.searchLocation") || "Search location..."}
                  placeholderTextColor="#999"
                  value={locationQuery}
                  onChangeText={setLocationQuery}
                />
                <Pressable
                  style={styles.addStickerBtn}
                  onPress={() => {
                    if (locationQuery.trim()) {
                      addSticker({
                        id: `sticker_${Date.now()}`,
                        type: "location",
                        x: CANVAS_WIDTH / 2 - 50,
                        y: CANVAS_HEIGHT / 2 - 20,
                        rotation: 0,
                        scale: 1,
                        locationName: locationQuery.trim(),
                      });
                      setLocationQuery("");
                      setActiveStickerType(null);
                    }
                  }}
                >
                  <Ionicons name="add-circle" size={28} color="#000000" />
                  <Text style={styles.addStickerBtnText}>{t("editor.addLocation") || "Add Location"}</Text>
                </Pressable>
              </View>
            )}

            {activeStickerType === "mention" && (
              <View style={styles.stickerContent}>
                <TextInput
                  style={styles.stickerInput}
                  placeholder={t("editor.searchUser") || "Search @username..."}
                  placeholderTextColor="#999"
                  value={mentionQuery}
                  onChangeText={setMentionQuery}
                  autoCapitalize="none"
                />
                <Pressable
                  style={styles.addStickerBtn}
                  onPress={() => {
                    if (mentionQuery.trim()) {
                      addSticker({
                        id: `sticker_${Date.now()}`,
                        type: "mention",
                        x: CANVAS_WIDTH / 2 - 50,
                        y: CANVAS_HEIGHT / 2 - 20,
                        rotation: 0,
                        scale: 1,
                        mentionUsername: mentionQuery.trim().startsWith("@") ? mentionQuery.trim() : `@${mentionQuery.trim()}`,
                      });
                      setMentionQuery("");
                      setActiveStickerType(null);
                    }
                  }}
                >
                  <Ionicons name="add-circle" size={28} color="#000000" />
                  <Text style={styles.addStickerBtnText}>{t("editor.addMention") || "Add Mention"}</Text>
                </Pressable>
              </View>
            )}

            {activeStickerType === "hashtag" && (
              <View style={styles.stickerContent}>
                <TextInput
                  style={styles.stickerInput}
                  placeholder={t("editor.searchHashtag") || "Search #hashtag..."}
                  placeholderTextColor="#999"
                  value={hashtagQuery}
                  onChangeText={setHashtagQuery}
                  autoCapitalize="none"
                />
                <Pressable
                  style={styles.addStickerBtn}
                  onPress={() => {
                    if (hashtagQuery.trim()) {
                      addSticker({
                        id: `sticker_${Date.now()}`,
                        type: "hashtag",
                        x: CANVAS_WIDTH / 2 - 50,
                        y: CANVAS_HEIGHT / 2 - 20,
                        rotation: 0,
                        scale: 1,
                        hashtagName: hashtagQuery.trim().startsWith("#") ? hashtagQuery.trim() : `#${hashtagQuery.trim()}`,
                      });
                      setHashtagQuery("");
                      setActiveStickerType(null);
                    }
                  }}
                >
                  <Ionicons name="add-circle" size={28} color="#000000" />
                  <Text style={styles.addStickerBtnText}>{t("editor.addHashtag") || "Add Hashtag"}</Text>
                </Pressable>
              </View>
            )}

            {activeStickerType === "poll" && (
              <View style={styles.stickerContent}>
                <TextInput
                  style={styles.stickerInput}
                  placeholder={t("editor.pollQuestion") || "Ask a question..."}
                  placeholderTextColor="#999"
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                />
                {pollOptions.map((option, idx) => (
                  <View key={idx} style={styles.pollOptionRow}>
                    <TextInput
                      style={[styles.stickerInput, styles.pollOptionInput]}
                      placeholder={`Option ${idx + 1}`}
                      placeholderTextColor="#999"
                      value={option}
                      onChangeText={(text) => {
                        const newOptions = [...pollOptions];
                        newOptions[idx] = text;
                        setPollOptions(newOptions);
                      }}
                    />
                    {idx >= 2 && (
                      <Pressable onPress={() => {
                        const newOptions = pollOptions.filter((_, i) => i !== idx);
                        setPollOptions(newOptions);
                      }}>
                        <Ionicons name="close-circle" size={24} color="#FF3B30" />
                      </Pressable>
                    )}
                  </View>
                ))}
                {pollOptions.length < 4 && (
                  <Pressable style={styles.addOptionBtn} onPress={() => setPollOptions([...pollOptions, ""])}>
                    <Ionicons name="add" size={20} color="#000000" />
                    <Text style={styles.addOptionBtnText}>{t("editor.addOption") || "Add Option"}</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.addStickerBtn, !pollQuestion.trim() && styles.addStickerBtnDisabled]}
                  onPress={() => {
                    const validOptions = pollOptions.filter(o => o.trim());
                    if (pollQuestion.trim() && validOptions.length >= 2) {
                      addSticker({
                        id: `sticker_${Date.now()}`,
                        type: "poll",
                        x: CANVAS_WIDTH / 2 - 50,
                        y: CANVAS_HEIGHT / 2 - 20,
                        rotation: 0,
                        scale: 1,
                        pollQuestion: pollQuestion.trim(),
                        pollOptions: validOptions,
                      });
                      setPollQuestion("");
                      setPollOptions(["", ""]);
                      setActiveStickerType(null);
                    }
                  }}
                >
                  <Ionicons name="add-circle" size={28} color={pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2 ? "#000000" : "#999"} />
                  <Text style={[styles.addStickerBtnText, !pollQuestion.trim() && styles.addStickerBtnTextDisabled]}>
                    {t("editor.addPoll") || "Add Poll"}
                  </Text>
                </Pressable>
              </View>
            )}

            {activeStickerType === "emoji" && (
              <View style={styles.stickerContent}>
                <View style={styles.emojiPickerRow}>
                  {["😂", "🔥", "❤️", "😍", "👍", "🎉", "💯", "✨", "🙌", "😎"].map(emoji => (
                    <Pressable
                      key={emoji}
                      style={styles.emojiBtn}
                      onPress={() => {
                        addSticker({
                          id: `sticker_${Date.now()}`,
                          type: "emoji",
                          x: CANVAS_WIDTH / 2 - 50,
                          y: CANVAS_HEIGHT / 2 - 20,
                          rotation: 0,
                          scale: 1,
                          emojiValue: 5,
                        });
                        setActiveStickerType(null);
                      }}
                    >
                      <Text style={styles.emojiBtnText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {activeStickerType === "countdown" && (
              <View style={styles.stickerContent}>
                <View style={styles.countdownInfo}>
                  <Ionicons name="time-outline" size={24} color="#000000" />
                  <Text style={styles.countdownInfoText}>
                    {t("editor.countdownInfo") || "Countdown will be set for 24 hours from now"}
                  </Text>
                </View>
                <Pressable
                  style={styles.addStickerBtn}
                  onPress={() => {
                    addSticker({
                      id: `sticker_${Date.now()}`,
                      type: "countdown",
                      x: CANVAS_WIDTH / 2 - 50,
                      y: CANVAS_HEIGHT / 2 - 20,
                      rotation: 0,
                      scale: 1,
                      countdownDate: new Date(Date.now() + 86400000).toISOString(),
                    });
                    setActiveStickerType(null);
                  }}
                >
                  <Ionicons name="add-circle" size={28} color="#000000" />
                  <Text style={styles.addStickerBtnText}>{t("editor.addCountdown") || "Add Countdown"}</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Drawing Panel */}
        {activeTab === "draw" && (
          <View style={styles.toolPanel}>
            {/* Drawing Tools */}
            <View style={styles.drawingToolsRow}>
              <Pressable
                style={[styles.drawingToolBtn, activeDrawingTool === "pen" && styles.drawingToolBtnActive]}
                onPress={() => setActiveDrawingTool(activeDrawingTool === "pen" ? null : "pen")}
              >
                <Ionicons name="pencil" size={24} color={activeDrawingTool === "pen" ? "#000000" : "#fff"} />
                <Text style={[styles.drawingToolText, activeDrawingTool === "pen" && styles.drawingToolTextActive]}>
                  {t("editor.pen") || "Pen"}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.drawingToolBtn, activeDrawingTool === "highlighter" && styles.drawingToolBtnActive]}
                onPress={() => setActiveDrawingTool(activeDrawingTool === "highlighter" ? null : "highlighter")}
              >
                <Ionicons name="brush" size={24} color={activeDrawingTool === "highlighter" ? "#000000" : "#fff"} />
                <Text style={[styles.drawingToolText, activeDrawingTool === "highlighter" && styles.drawingToolTextActive]}>
                  {t("editor.highlighter") || "Marker"}
                </Text>
              </Pressable>
              
              <Pressable
                style={[styles.drawingToolBtn, activeDrawingTool === "eraser" && styles.drawingToolBtnActive]}
                onPress={() => setActiveDrawingTool(activeDrawingTool === "eraser" ? null : "eraser")}
              >
                <Ionicons name="trash-outline" size={24} color={activeDrawingTool === "eraser" ? "#FF3B30" : "#fff"} />
                <Text style={[styles.drawingToolText, activeDrawingTool === "eraser" && { color: "#FF3B30" }]}>
                  {t("editor.eraser") || "Eraser"}
                </Text>
              </Pressable>
              
              {drawingStrokes.length > 0 && (
                <Pressable
                  style={styles.drawingToolBtn}
                  onPress={() => {
                    setDrawingStrokes(strokes => strokes.slice(0, -1));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons name="arrow-undo" size={24} color="#fff" />
                  <Text style={styles.drawingToolText}>Undo</Text>
                </Pressable>
              )}
              
              <Pressable
                style={styles.drawingToolBtn}
                onPress={() => setDrawingStrokes([])}
              >
                <Ionicons name="refresh" size={24} color="#FF9500" />
                <Text style={[styles.drawingToolText, { color: "#FF9500" }]}>Clear</Text>
              </Pressable>
            </View>

            {/* Color Picker */}
            <View style={styles.colorPickerRow}>
              <Text style={styles.drawingLabel}>{t("editor.color") || "Color"}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScrollView}>
                {DRAWING_COLORS.map(color => (
                  <Pressable
                    key={color}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color },
                      drawingColor === color && styles.colorCircleSelected,
                    ]}
                    onPress={() => setDrawingColor(color)}
                  />
                ))}
              </ScrollView>
            </View>

            {/* Brush Size */}
            <View style={styles.brushSizeRow}>
              <Text style={styles.drawingLabel}>{t("editor.size") || "Size"}</Text>
              <View style={styles.brushSizeOptions}>
                {BRUSH_SIZES.map(size => (
                  <Pressable
                    key={size}
                    style={[
                      styles.brushSizeBtn,
                      brushSize === size && styles.brushSizeBtnActive,
                    ]}
                    onPress={() => setBrushSize(size)}
                  >
                    <View style={[styles.brushSizePreview, { width: size + 4, height: size + 4 }]} />
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Drawing Instructions */}
            {activeDrawingTool && (
              <View style={styles.drawingInstructions}>
                <Ionicons name="finger-print-outline" size={16} color="#000000" />
                <Text style={styles.drawingInstructionsText}>
                  {t("editor.drawInstructions") || "Draw on the image. Tap a tool again to deselect."}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Publish Options Modal */}
      <Modal
        visible={showPublishOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPublishOptions(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPublishOptions(false)}>
          <View style={styles.publishOptionsContainer}>
            <View style={styles.publishOptionsHandle} />
            <Text style={styles.publishOptionsTitle}>{t("editor.publishAs") || "Publish as..."}</Text>
            
            {/* Caption Input */}
            <TextInput
              style={styles.captionInput}
              placeholder={t("editor.addCaption") || "Add a caption..."}
              placeholderTextColor="#666"
              value={postCaption}
              onChangeText={setPostCaption}
              multiline
              maxLength={500}
            />

            {/* Publish as Post Button */}
            <Pressable style={styles.publishButton} onPress={publishAsPost}>
              <Ionicons name="grid-outline" size={24} color="#fff" />
              <View style={styles.publishButtonTextContainer}>
                <Text style={styles.publishButtonTitle}>{t("editor.publishPost") || "Publish as Post"}</Text>
                <Text style={styles.publishButtonSubtitle}>{t("editor.postStays") || "Stays on your profile"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </Pressable>

            {/* Publish as Story Button */}
            <Pressable style={[styles.publishButton, { backgroundColor: "#7c3aed" }]} onPress={publishAsStory}>
              <Ionicons name="play-circle-outline" size={24} color="#fff" />
              <View style={styles.publishButtonTextContainer}>
                <Text style={styles.publishButtonTitle}>{t("editor.publishStory") || "Publish as Story"}</Text>
                <Text style={styles.publishButtonSubtitle}>{t("editor.story24h") || "Visible for 24 hours"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={() => setShowPublishOptions(false)}>
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Upload Progress */}
      <UploadProgressSheet visible={showUploadProgress} progress={uploadProgress} context={type === "video" ? "video" : "photo"} mode="blocking" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  doneButton: {
    backgroundColor: "#000000",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  canvasContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: "#111",
    overflow: "hidden",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  filterOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
  },
  draggableText: {
    position: "absolute",
    padding: 12,
    borderRadius: 8,
    minWidth: 60,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  draggableTextSelected: {
    borderWidth: 2,
    borderColor: "#000000",
    borderStyle: "solid",
    backgroundColor: "rgba(22, 163, 74, 0.15)",
  },
  overlayText: {
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  // Draggable Sticker styles
  draggableSticker: {
    position: "absolute",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(10px)",
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  draggableStickerSelected: {
    borderWidth: 2,
    borderColor: "#000000",
    backgroundColor: "rgba(22, 163, 74, 0.2)",
  },
  stickerContentBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stickerText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  pollSticker: {
    minWidth: 150,
  },
  pollQuestionText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  pollOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  pollCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  pollOptionText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
  },
  emojiSticker: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiStickerText: {
    fontSize: 48,
  },
  countdownSticker: {
    alignItems: "center",
    gap: 4,
  },
  countdownLabel: {
    color: "#8b5cf6",
    fontSize: 10,
    textTransform: "uppercase",
  },
  countdownTime: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteStickerBtn: {
    position: "absolute",
    top: -12,
    right: -12,
    zIndex: 100,
  },
  // Drawing styles
  drawingCanvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  drawingIndicator: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    padding: 10,
  },
  drawingDot: {
    borderRadius: 10,
  },
  drawingToolsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  drawingToolBtn: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    minWidth: 60,
  },
  drawingToolBtnActive: {
    backgroundColor: "rgba(22,163,74,0.2)",
    borderWidth: 1,
    borderColor: "#000000",
  },
  drawingToolText: {
    color: "#fff",
    fontSize: 10,
    marginTop: 4,
  },
  drawingToolTextActive: {
    color: "#000000",
  },
  drawingLabel: {
    color: "#999",
    fontSize: 12,
    marginBottom: 8,
  },
  colorPickerRow: {
    marginBottom: 12,
  },
  colorScrollView: {
    flexDirection: "row",
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorCircleSelected: {
    borderColor: "#fff",
    borderWidth: 3,
  },
  brushSizeRow: {
    marginBottom: 12,
  },
  brushSizeOptions: {
    flexDirection: "row",
    gap: 12,
  },
  brushSizeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  brushSizeBtnActive: {
    backgroundColor: "rgba(22,163,74,0.3)",
    borderWidth: 2,
    borderColor: "#000000",
  },
  brushSizePreview: {
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  drawingInstructions: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(22,163,74,0.1)",
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  drawingInstructionsText: {
    color: "#999",
    fontSize: 12,
    flex: 1,
  },
  deleteTextButton: {
    position: "absolute",
    top: -16,
    right: -16,
    zIndex: 100,
  },
  deleteButtonInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  // Resize handles
  resizeHandle: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#000000",
    borderWidth: 2,
    borderColor: "#fff",
    zIndex: 10,
  },
  resizeHandleTL: {
    top: -10,
    left: -10,
  },
  resizeHandleTR: {
    top: -10,
    right: -10,
  },
  resizeHandleBL: {
    bottom: -10,
    left: -10,
  },
  resizeHandleBR: {
    bottom: -10,
    right: -10,
  },
  // Rotation handle
  rotationHandle: {
    position: "absolute",
    top: -30,
    alignSelf: "center",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#8b5cf6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  rotationLine: {
    position: "absolute",
    top: -8,
    width: 2,
    height: 8,
    backgroundColor: "#8b5cf6",
  },
  // Gesture hint tooltip
  gestureHint: {
    position: "absolute",
    bottom: -35,
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  gestureHintText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
  },
  // Quick actions row
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 16,
    marginTop: 4,
  },
  quickActionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  quickActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  resetActionButton: {
    backgroundColor: "rgba(255, 149, 0, 0.2)",
    borderWidth: 1,
    borderColor: "#FF9500",
  },
  // Slider controls
  sliderControl: {
    marginBottom: 16,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sliderLabel: {
    color: "#999",
    fontSize: 13,
  },
  sliderValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sliderTrack: {
    flex: 1,
    height: 32,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    position: "relative",
    justifyContent: "center",
  },
  // Stepper controls (replaced sliders)
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  stepperDisplay: {
    minWidth: 80,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    alignItems: "center",
  },
  stepperValue: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  toolsContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 8,
    maxHeight: SCREEN_HEIGHT * 0.48,
  },
  toolTabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  toolTab: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  toolTabActive: {
    backgroundColor: "rgba(76, 111, 255, 0.2)",
  },
  toolTabText: {
    fontSize: 9,
    color: "#888",
    marginTop: 2,
  },
  toolTabTextActive: {
    color: "#000000",
    fontWeight: "600",
  },
  toolPanel: {
    padding: 8,
    maxHeight: SCREEN_HEIGHT * 0.36,
  },
  // Sticker styles
  stickerTypeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },
  stickerTypeBtn: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    minWidth: 60,
  },
  stickerTypeBtnActive: {
    backgroundColor: "rgba(22, 163, 74, 0.2)",
    borderWidth: 1,
    borderColor: "#000000",
  },
  stickerTypeText: {
    color: "#fff",
    fontSize: 10,
    marginTop: 4,
  },
  stickerTypeTextActive: {
    color: "#000000",
    fontWeight: "600",
  },
  stickerContent: {
    padding: 8,
  },
  stickerInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
    marginBottom: 12,
  },
  addStickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22, 163, 74, 0.2)",
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  addStickerBtnDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  addStickerBtnText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "600",
  },
  addStickerBtnTextDisabled: {
    color: "#999",
  },
  pollOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  pollOptionInput: {
    flex: 1,
    marginBottom: 0,
  },
  addOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
  },
  addOptionBtnText: {
    color: "#000000",
    fontSize: 12,
  },
  emojiPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  emojiBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  emojiBtnText: {
    fontSize: 24,
  },
  countdownInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  countdownInfoText: {
    flex: 1,
    color: "#999",
    fontSize: 12,
  },
  textInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "#fff",
    fontSize: 13,
  },
  addTextButton: {
    padding: 0,
  },
  toolLabel: {
    color: "#888",
    fontSize: 10,
    marginBottom: 4,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colorRow: {
    flexDirection: "row",
  },
  colorButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorButtonSelected: {
    borderColor: "#000000",
  },
  fontRow: {
    flexDirection: "row",
  },
  fontButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  fontButtonSelected: {
    backgroundColor: "#000000",
  },
  fontButtonText: {
    color: "#fff",
    fontSize: 11,
  },
  fontButtonTextSelected: {
    fontWeight: "600",
  },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 4,
  },
  sizeButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  sizePreview: {
    width: 50,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  sizePreviewText: {
    color: "#fff",
  },
  backgroundRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  backgroundButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  backgroundButtonSelected: {
    borderColor: "#000000",
    backgroundColor: "rgba(76, 111, 255, 0.2)",
  },
  backgroundButtonText: {
    color: "#fff",
    fontSize: 12,
  },
  filterButton: {
    alignItems: "center",
    marginRight: 12,
  },
  filterButtonSelected: {},
  filterPreview: {
    width: 70,
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#333",
  },
  filterPreviewImage: {
    width: "100%",
    height: "100%",
  },
  filterPreviewPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#444",
  },
  filterPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  filterName: {
    color: "#999",
    fontSize: 12,
    marginTop: 6,
  },
  filterNameSelected: {
    color: "#000000",
    fontWeight: "600",
  },
  // Music Panel Styles
  musicHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  musicTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  musicControls: {
    flexDirection: "row",
    gap: 12,
  },
  musicControlButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  musicControlLabel: {
    color: "#fff",
    fontSize: 11,
  },
  volumeContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  volumeSlider: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    position: "relative",
  },
  volumeFill: {
    position: "absolute",
    height: "100%",
    backgroundColor: "#000000",
    borderRadius: 2,
  },
  volumeThumb: {
    position: "absolute",
    width: 16,
    height: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    top: -6,
    marginLeft: -8,
  },
  volumeButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  volumeBtn: {
    width: 24,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  volumeText: {
    color: "#fff",
    fontSize: 12,
    minWidth: 35,
    textAlign: "center",
  },
  musicList: {
    maxHeight: SCREEN_HEIGHT * 0.30,
  },
  musicTrack: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  musicTrackSelected: {
    backgroundColor: "rgba(76, 111, 255, 0.2)",
    borderWidth: 1,
    borderColor: "#000000",
  },
  musicTrackIcon: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  musicTrackInfo: {
    flex: 1,
  },
  musicTrackName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  musicTrackNameSelected: {
    color: "#000000",
  },
  musicTrackArtist: {
    color: "#999",
    fontSize: 11,
    marginTop: 1,
  },
  musicTrackGenre: {
    color: "#666",
    fontSize: 10,
    marginTop: 2,
  },
  loadingMusicContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 8,
  },
  loadingMusicText: {
    color: "#999",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  publishOptionsContainer: {
    backgroundColor: "#1a1a1a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  publishOptionsHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#444",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  publishOptionsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 20,
  },
  captionInput: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    padding: 16,
    color: "#fff",
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  publishButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a2a",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  publishButtonTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  publishButtonTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  publishButtonSubtitle: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  cancelButton: {
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  cancelButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "600",
  },
  // Play button overlay styles
  playButtonOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 4,
  },
  // Trim tool styles
  trimContainer: {
    paddingVertical: 8,
  },
  trimDurationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  trimDurationText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  trimDurationBadge: {
    backgroundColor: "#000000",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
    overflow: "hidden",
  },
  timelineContainer: {
    height: 50,
    position: "relative",
    marginBottom: 20,
  },
  timelineTrack: {
    position: "absolute",
    top: 15,
    left: 10,
    right: 10,
    height: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
  },
  timelineSelected: {
    position: "absolute",
    top: 0,
    height: "100%",
    backgroundColor: "#000000",
    borderRadius: 4,
  },
  timelinePosition: {
    position: "absolute",
    top: -4,
    width: 3,
    height: 28,
    backgroundColor: "#fff",
    borderRadius: 2,
    marginLeft: -1.5,
  },
  trimHandle: {
    position: "absolute",
    top: 5,
    width: 20,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  trimHandleStart: {
    marginLeft: 0,
  },
  trimHandleEnd: {
    marginLeft: -10,
  },
  trimHandleBar: {
    width: 6,
    height: 30,
    backgroundColor: "#fff",
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#000000",
  },
  trimControlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  trimControl: {
    alignItems: "center",
  },
  trimControlLabel: {
    color: "#999",
    fontSize: 11,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  trimControlButtons: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  trimControlBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  trimControlValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginHorizontal: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 40,
    textAlign: "center",
  },
  playPauseButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  trimPresetsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  trimPreset: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  trimPresetActive: {
    backgroundColor: "rgba(76, 111, 255, 0.3)",
    borderWidth: 1,
    borderColor: "#000000",
  },
  trimPresetText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "500",
  },
  textInstructions: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76, 111, 255, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  textInstructionsText: {
    color: "#000000",
    fontSize: 12,
    flex: 1,
  },
  textPreviewBox: {
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  textPreviewLabel: {
    color: "#999",
    fontSize: 11,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  textPreviewText: {
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  // Alignment guide styles
  alignmentGuide: {
    position: "absolute",
    backgroundColor: "#FF3B30",
    zIndex: 100,
  },
  verticalGuide: {
    width: 1,
    height: "100%",
    top: 0,
  },
  horizontalGuide: {
    height: 1,
    width: "100%",
    left: 0,
  },
  // Alignment controls
  alignmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  alignButton: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 8,
    minWidth: 50,
  },
  alignButtonText: {
    color: "#aaa",
    fontSize: 10,
    marginTop: 2,
  },
  // Rotation controls
  rotationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  rotateButton: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 8,
    minWidth: 45,
  },
  rotateButtonText: {
    color: "#fff",
    fontSize: 11,
    marginTop: 2,
  },
  rotationDisplay: {
    backgroundColor: "rgba(76, 111, 255, 0.2)",
    borderRadius: 8,
    padding: 10,
    minWidth: 50,
    alignItems: "center",
  },
  rotationDisplayText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "bold",
  },
  resetButton: {
    backgroundColor: "rgba(255, 149, 0, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 149, 0, 0.3)",
  },
  // Scale controls
  scaleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  scaleButton: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 8,
    minWidth: 60,
  },
  scaleButtonText: {
    color: "#fff",
    fontSize: 10,
    marginTop: 2,
  },
  scaleDisplay: {
    backgroundColor: "rgba(76, 111, 255, 0.2)",
    borderRadius: 8,
    padding: 10,
    minWidth: 55,
    alignItems: "center",
  },
  scaleDisplayText: {
    color: "#000000",
    fontSize: 14,
    fontWeight: "bold",
  },
  tipText: {
    color: "#666",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
});

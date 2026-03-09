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
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeNavigation } from "../hooks/useSafeNavigation";
import { Video, ResizeMode, AVPlaybackStatus, Audio } from "expo-av";
import { useTranslation } from "react-i18next";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useAuth } from "../context/AuthContext";
import { createStory, createPost, uploadMedia, uploadImageToCloudinary, UploadProgress } from "../lib/api";
import UploadProgressModal from "../components/UploadProgressModal";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CANVAS_WIDTH = SCREEN_WIDTH;
const CANVAS_HEIGHT = SCREEN_WIDTH * 1.5; // 2:3 aspect ratio for stories

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

export default function MediaEditor() {
  const { uri, type } = useLocalSearchParams<{ uri: string; type: "image" | "video" }>();
  const { safeGoBack, router } = useSafeNavigation();
  const { t } = useTranslation();
  const { sessionToken, activeIdentity } = useAuth();
  
  const [activeTab, setActiveTab] = useState<"text" | "filter" | "trim" | "music" | "none">("none");
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

  // Handle done - show publish options
  const handleDone = () => {
    setShowPublishOptions(true);
  };

  // Publish as story
  const publishAsStory = async () => {
    if (!sessionToken) {
      Alert.alert(t("common.error"), t("common.notLoggedIn"));
      return;
    }
    
    setPublishing(true);
    setShowPublishOptions(false);
    
    try {
      const decodedUri = decodeURIComponent(uri || "");
      let mediaUrl: string;
      let imageUrl: string | undefined;
      
      if (type === "video") {
        // Upload video to Cloudinary
        setShowUploadProgress(true);
        setUploadProgress({ phase: "preparing", progress: 0 });
        mediaUrl = await uploadMedia(sessionToken, decodedUri, "video", (progress) => {
          setUploadProgress(progress);
        });
        setShowUploadProgress(false);
      } else {
        // Upload image to Cloudinary
        setShowUploadProgress(true);
        setUploadProgress({ phase: "uploading", progress: 30 });
        const base64 = await FileSystem.readAsStringAsync(decodedUri, {
          encoding: 'base64',
        });
        const base64Uri = `data:image/jpeg;base64,${base64}`;
        
        try {
          imageUrl = await uploadImageToCloudinary(sessionToken, base64Uri);
          setUploadProgress({ phase: "uploading", progress: 100 });
        } catch (e) {
          console.error("Image upload to Cloudinary failed:", e);
          // Fallback to base64 if Cloudinary fails
          mediaUrl = base64Uri;
        }
        setShowUploadProgress(false);
      }
      
      const actor = activeIdentity
        ? { type: activeIdentity.type, id: activeIdentity.id }
        : undefined;
      const businessId =
        activeIdentity?.type === "business" ? activeIdentity.id : undefined;
      
      // Create story with Cloudinary URL
      await createStory(
        sessionToken, 
        type === "video" ? undefined : (imageUrl ? undefined : mediaUrl), // base64 fallback
        type === "video" ? mediaUrl : undefined, // video_url
        businessId, 
        actor,
        type === "video" ? undefined : imageUrl // image_url from Cloudinary
      );
      
      Alert.alert(
        t("editor.success") || "Success!",
        t("editor.storyPublished") || "Your story has been published!",
        [{ text: t("common.ok"), onPress: () => router.replace("/(tabs)/home") }]
      );
    } catch (error) {
      console.error("Error publishing story:", error);
      Alert.alert(t("common.error"), t("editor.publishFailed") || "Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
      setShowUploadProgress(false);
    }
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
      let imageUrl: string | undefined;
      let videoUrl: string | undefined;
      
      if (type === "video") {
        // Upload video first
        setShowUploadProgress(true);
        setUploadProgress({ phase: "preparing", progress: 0 });
        videoUrl = await uploadMedia(sessionToken, decodedUri, "video", (progress) => {
          setUploadProgress(progress);
        });
        setShowUploadProgress(false);
      } else {
        // For images, read as base64
        const base64 = await FileSystem.readAsStringAsync(decodedUri, {
          encoding: 'base64',
        });
        imageUrl = `data:image/jpeg;base64,${base64}`;
      }
      
      const actor = activeIdentity
        ? { type: activeIdentity.type, id: activeIdentity.id }
        : undefined;
      const businessId =
        activeIdentity?.type === "business" ? activeIdentity.id : undefined;
      
      await createPost(
        sessionToken,
        postCaption || t("home.sharedAnUpdate") || "Shared an update",
        imageUrl,
        videoUrl,
        businessId,
        actor
      );
      
      Alert.alert(
        t("editor.success") || "Success!",
        t("editor.postPublished") || "Your post has been published!",
        [{ text: t("common.ok"), onPress: () => router.replace("/(tabs)/home") }]
      );
    } catch (error) {
      console.error("Error publishing post:", error);
      Alert.alert(t("common.error"), t("editor.publishFailed") || "Failed to publish. Please try again.");
    } finally {
      setPublishing(false);
      setShowUploadProgress(false);
    }
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

  // Alignment functions with haptic feedback
  const alignText = (alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom') => {
    if (!selectedTextId) return;
    
    const overlay = textOverlays.find(o => o.id === selectedTextId);
    if (!overlay) return;

    const textWidth = 100 * overlay.scale; // Approximate
    const textHeight = overlay.fontSize * overlay.scale;

    let newX = overlay.x;
    let newY = overlay.y;

    switch (alignment) {
      case 'left':
        newX = 20;
        break;
      case 'center-h':
        newX = (CANVAS_WIDTH - textWidth) / 2;
        break;
      case 'right':
        newX = CANVAS_WIDTH - textWidth - 20;
        break;
      case 'top':
        newY = 20;
        break;
      case 'center-v':
        newY = (CANVAS_HEIGHT - textHeight) / 2;
        break;
      case 'bottom':
        newY = CANVAS_HEIGHT - textHeight - 20;
        break;
    }

    // Haptic feedback when aligning
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateTextPosition(selectedTextId, newX, newY);
  };

  // Rotation function with haptic feedback
  const rotateText = (degrees: number) => {
    if (!selectedTextId) return;
    const overlay = textOverlays.find(o => o.id === selectedTextId);
    if (!overlay) return;
    
    const newRotation = (overlay.rotation + degrees) % 360;
    Haptics.selectionAsync();
    updateSelectedText({ rotation: newRotation });
  };

  // Scale function with haptic feedback
  const scaleText = (delta: number) => {
    if (!selectedTextId) return;
    const overlay = textOverlays.find(o => o.id === selectedTextId);
    if (!overlay) return;
    
    const newScale = Math.max(0.5, Math.min(3, overlay.scale + delta));
    Haptics.selectionAsync();
    updateSelectedText({ scale: newScale });
  };

  // Draggable text component with rotation and scale
  const DraggableText = ({ overlay }: { overlay: TextOverlay }) => {
    const pan = useRef(new Animated.ValueXY({ x: overlay.x, y: overlay.y })).current;
    const scaleAnim = useRef(new Animated.Value(overlay.scale)).current;
    const isSelected = selectedTextId === overlay.id;
    const lastScale = useRef(overlay.scale);
    const lastDistance = useRef(0);
    
    // Update animation values when overlay changes
    useEffect(() => {
      scaleAnim.setValue(overlay.scale);
      lastScale.current = overlay.scale;
    }, [overlay.scale]);
    
    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Allow move if single touch or pinch
          return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
        },
        onPanResponderGrant: (evt) => {
          setSelectedTextId(overlay.id);
          pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
          pan.setValue({ x: 0, y: 0 });
          
          // Initialize pinch scale
          if (evt.nativeEvent.touches.length === 2) {
            const touch1 = evt.nativeEvent.touches[0];
            const touch2 = evt.nativeEvent.touches[1];
            lastDistance.current = Math.sqrt(
              Math.pow(touch2.pageX - touch1.pageX, 2) +
              Math.pow(touch2.pageY - touch1.pageY, 2)
            );
          }
        },
        onPanResponderMove: (evt, gestureState) => {
          // Handle pinch to scale
          if (evt.nativeEvent.touches.length === 2) {
            const touch1 = evt.nativeEvent.touches[0];
            const touch2 = evt.nativeEvent.touches[1];
            const distance = Math.sqrt(
              Math.pow(touch2.pageX - touch1.pageX, 2) +
              Math.pow(touch2.pageY - touch1.pageY, 2)
            );
            
            if (lastDistance.current > 0) {
              const scaleDelta = (distance - lastDistance.current) / 100;
              const newScale = Math.max(0.5, Math.min(3, lastScale.current + scaleDelta));
              scaleAnim.setValue(newScale);
              lastScale.current = newScale;
            }
            lastDistance.current = distance;
          } else {
            // Single touch - drag
            pan.setValue({ x: gestureState.dx, y: gestureState.dy });
          }
        },
        onPanResponderRelease: () => {
          pan.flattenOffset();
          const rawX = (pan.x as any)._value;
          const rawY = (pan.y as any)._value;
          
          // Apply snap to grid
          const { x: snappedX, y: snappedY, guides } = snapToGrid(rawX, rawY);
          
          const finalX = Math.max(0, Math.min(CANVAS_WIDTH - 100, snappedX));
          const finalY = Math.max(0, Math.min(CANVAS_HEIGHT - 50, snappedY));
          
          // Show guides briefly
          setShowGuides(guides);
          setTimeout(() => setShowGuides({}), 500);
          
          // Update position and scale
          setTextOverlays(overlays =>
            overlays.map(o =>
              o.id === overlay.id 
                ? { ...o, x: finalX, y: finalY, scale: lastScale.current }
                : o
            )
          );
          
          lastDistance.current = 0;
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
              ...pan.getTranslateTransform(),
              { rotate: `${overlay.rotation}deg` },
              { scale: scaleAnim },
            ] 
          },
          isSelected && styles.draggableTextSelected,
        ]}
        {...panResponder.panHandlers}
      >
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
        {isSelected && (
          <Pressable
            style={styles.deleteTextButton}
            onPress={() => deleteTextOverlay(overlay.id)}
          >
            <Ionicons name="close-circle" size={24} color="#FF3B30" />
          </Pressable>
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
          <Pressable onPress={safeGoBack} style={styles.headerButton}>
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
            <Ionicons name="text" size={24} color={activeTab === "text" ? "#4c6fff" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "text" && styles.toolTabTextActive]}>
              {t("editor.text") || "Text"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toolTab, activeTab === "filter" && styles.toolTabActive]}
            onPress={() => setActiveTab(activeTab === "filter" ? "none" : "filter")}
          >
            <Ionicons name="color-filter" size={24} color={activeTab === "filter" ? "#4c6fff" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "filter" && styles.toolTabTextActive]}>
              {t("editor.filter") || "Filter"}
            </Text>
          </Pressable>
          {type === "video" && (
            <Pressable
              style={[styles.toolTab, activeTab === "trim" && styles.toolTabActive]}
              onPress={() => setActiveTab(activeTab === "trim" ? "none" : "trim")}
            >
              <Ionicons name="cut" size={24} color={activeTab === "trim" ? "#4c6fff" : "#fff"} />
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
            <Ionicons name="musical-notes" size={24} color={activeTab === "music" ? "#4c6fff" : "#fff"} />
            <Text style={[styles.toolTabText, activeTab === "music" && styles.toolTabTextActive]}>
              {t("editor.music") || "Music"}
            </Text>
          </Pressable>
        </View>

        {/* Text Tool Panel */}
        {activeTab === "text" && (
          <View style={styles.toolPanel}>
            {/* Instructions */}
            <View style={styles.textInstructions}>
              <Ionicons name="finger-print-outline" size={16} color="#4c6fff" />
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
                <Ionicons name="add-circle" size={32} color="#4c6fff" />
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

            {/* Alignment Controls - Only show when text is selected */}
            {selectedTextId && (
              <>
                <Text style={styles.toolLabel}>{t("editor.align") || "Align"}</Text>
                <View style={styles.alignmentRow}>
                  <Pressable style={styles.alignButton} onPress={() => alignText('left')}>
                    <Ionicons name="arrow-back" size={20} color="#fff" />
                    <Text style={styles.alignButtonText}>Left</Text>
                  </Pressable>
                  <Pressable style={styles.alignButton} onPress={() => alignText('center-h')}>
                    <Ionicons name="remove-outline" size={20} color="#fff" style={{ transform: [{ rotate: '90deg' }] }} />
                    <Text style={styles.alignButtonText}>Center</Text>
                  </Pressable>
                  <Pressable style={styles.alignButton} onPress={() => alignText('right')}>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                    <Text style={styles.alignButtonText}>Right</Text>
                  </Pressable>
                  <Pressable style={styles.alignButton} onPress={() => alignText('top')}>
                    <Ionicons name="arrow-up" size={20} color="#fff" />
                    <Text style={styles.alignButtonText}>Top</Text>
                  </Pressable>
                  <Pressable style={styles.alignButton} onPress={() => alignText('center-v')}>
                    <Ionicons name="remove-outline" size={20} color="#fff" />
                    <Text style={styles.alignButtonText}>Middle</Text>
                  </Pressable>
                  <Pressable style={styles.alignButton} onPress={() => alignText('bottom')}>
                    <Ionicons name="arrow-down" size={20} color="#fff" />
                    <Text style={styles.alignButtonText}>Bottom</Text>
                  </Pressable>
                </View>

                {/* Rotation Controls */}
                <Text style={styles.toolLabel}>{t("editor.rotate") || "Rotate"}</Text>
                <View style={styles.rotationRow}>
                  <Pressable style={styles.rotateButton} onPress={() => rotateText(-15)}>
                    <Ionicons name="refresh-outline" size={22} color="#fff" style={{ transform: [{ scaleX: -1 }] }} />
                    <Text style={styles.rotateButtonText}>-15°</Text>
                  </Pressable>
                  <Pressable style={styles.rotateButton} onPress={() => rotateText(-5)}>
                    <Text style={styles.rotateButtonText}>-5°</Text>
                  </Pressable>
                  <View style={styles.rotationDisplay}>
                    <Text style={styles.rotationDisplayText}>
                      {textOverlays.find(o => o.id === selectedTextId)?.rotation || 0}°
                    </Text>
                  </View>
                  <Pressable style={styles.rotateButton} onPress={() => rotateText(5)}>
                    <Text style={styles.rotateButtonText}>+5°</Text>
                  </Pressable>
                  <Pressable style={styles.rotateButton} onPress={() => rotateText(15)}>
                    <Ionicons name="refresh-outline" size={22} color="#fff" />
                    <Text style={styles.rotateButtonText}>+15°</Text>
                  </Pressable>
                  <Pressable style={[styles.rotateButton, styles.resetButton]} onPress={() => updateSelectedText({ rotation: 0 })}>
                    <Ionicons name="refresh-circle-outline" size={22} color="#FF9500" />
                    <Text style={[styles.rotateButtonText, { color: '#FF9500' }]}>Reset</Text>
                  </Pressable>
                </View>

                {/* Scale Controls */}
                <Text style={styles.toolLabel}>{t("editor.scale") || "Scale"}</Text>
                <View style={styles.scaleRow}>
                  <Pressable style={styles.scaleButton} onPress={() => scaleText(-0.1)}>
                    <Ionicons name="contract-outline" size={22} color="#fff" />
                    <Text style={styles.scaleButtonText}>Smaller</Text>
                  </Pressable>
                  <View style={styles.scaleDisplay}>
                    <Text style={styles.scaleDisplayText}>
                      {Math.round((textOverlays.find(o => o.id === selectedTextId)?.scale || 1) * 100)}%
                    </Text>
                  </View>
                  <Pressable style={styles.scaleButton} onPress={() => scaleText(0.1)}>
                    <Ionicons name="expand-outline" size={22} color="#fff" />
                    <Text style={styles.scaleButtonText}>Larger</Text>
                  </Pressable>
                  <Pressable style={[styles.scaleButton, styles.resetButton]} onPress={() => updateSelectedText({ scale: 1 })}>
                    <Ionicons name="refresh-circle-outline" size={22} color="#FF9500" />
                    <Text style={[styles.scaleButtonText, { color: '#FF9500' }]}>Reset</Text>
                  </Pressable>
                </View>

                <Text style={styles.tipText}>
                  <Ionicons name="information-circle-outline" size={14} color="#666" /> Tip: Pinch with two fingers to resize text
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
                      color={musicMuted ? "#666" : "#4c6fff"} 
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
                  <ActivityIndicator size="small" color="#4c6fff" />
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
                      color={selectedMusic === track.id ? "#4c6fff" : "#fff"} 
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
                    <Ionicons name="checkmark-circle" size={24} color="#4c6fff" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
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

            {/* Publish Buttons */}
            <Pressable style={styles.publishButton} onPress={publishAsStory}>
              <Ionicons name="time-outline" size={24} color="#fff" />
              <View style={styles.publishButtonTextContainer}>
                <Text style={styles.publishButtonTitle}>{t("editor.publishStory") || "Publish as Story"}</Text>
                <Text style={styles.publishButtonSubtitle}>{t("editor.storyDisappears") || "Disappears after 24 hours"}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </Pressable>

            <Pressable style={styles.publishButton} onPress={publishAsPost}>
              <Ionicons name="grid-outline" size={24} color="#fff" />
              <View style={styles.publishButtonTextContainer}>
                <Text style={styles.publishButtonTitle}>{t("editor.publishPost") || "Publish as Post"}</Text>
                <Text style={styles.publishButtonSubtitle}>{t("editor.postStays") || "Stays on your profile"}</Text>
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
      <UploadProgressModal visible={showUploadProgress} progress={uploadProgress} />

      {/* Publishing Overlay */}
      {publishing && (
        <View style={styles.publishingOverlay}>
          <ActivityIndicator size="large" color="#4c6fff" />
          <Text style={styles.publishingText}>{t("editor.publishing") || "Publishing..."}</Text>
        </View>
      )}
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
    backgroundColor: "#4c6fff",
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
    padding: 8,
    borderRadius: 4,
  },
  draggableTextSelected: {
    backgroundColor: "rgba(76, 111, 255, 0.3)",
    borderWidth: 1,
    borderColor: "#4c6fff",
    borderStyle: "dashed",
  },
  overlayText: {
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  deleteTextButton: {
    position: "absolute",
    top: -12,
    right: -12,
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
    color: "#4c6fff",
    fontWeight: "600",
  },
  toolPanel: {
    padding: 8,
    maxHeight: SCREEN_HEIGHT * 0.36,
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
    borderColor: "#4c6fff",
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
    backgroundColor: "#4c6fff",
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
    borderColor: "#4c6fff",
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
    color: "#4c6fff",
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
    backgroundColor: "#4c6fff",
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
    borderColor: "#4c6fff",
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
    color: "#4c6fff",
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
    color: "#4c6fff",
    fontSize: 16,
    fontWeight: "600",
  },
  publishingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  publishingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 16,
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
    backgroundColor: "#4c6fff",
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
    backgroundColor: "#4c6fff",
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
    borderColor: "#4c6fff",
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
    backgroundColor: "#4c6fff",
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
    borderColor: "#4c6fff",
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
    color: "#4c6fff",
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
    color: "#4c6fff",
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
    color: "#4c6fff",
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

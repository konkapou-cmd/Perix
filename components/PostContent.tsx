import React, { useMemo } from "react";
import { Text, StyleSheet, View, StyleProp, ViewStyle, TextStyle, Image, Pressable, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import AdaptiveVideo from "./AdaptiveVideo";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";

interface PostContentProps {
  text: string;
  textStyle?: StyleProp<TextStyle>;
  videoStyle?: StyleProp<ViewStyle>;
  globalMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
  youtubeLink?: string | null;
  soundcloudUrl?: string | null;
  taggedUsers?: { id: string; name: string }[];
  taggedBusinesses?: { id: string; name: string }[];
  taggedArtists?: { id: string; name: string }[];
  onMentionPress?: (id: string, type: 'user' | 'business' | 'artist') => void;
}

// YouTube URL regex pattern - matches various YouTube URL formats
const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)?/gi;

// SoundCloud URL regex pattern
const SOUNDCLOUD_REGEX = /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(?:[^\s]*)?/gi;

type SegmentType = 'text' | 'youtube' | 'soundcloud';

// Extract media URLs and create text segments
function parsePostContent(text: string): { segments: Array<{ type: SegmentType; content: string }>; hasMedia: boolean } {
  const segments: Array<{ type: SegmentType; content: string }> = [];
  let hasMedia = false;
  
  // Find all media URLs with their positions
  const mediaMatches: Array<{ type: 'youtube' | 'soundcloud'; match: RegExpExecArray }> = [];
  
  // Reset regex lastIndex
  YOUTUBE_REGEX.lastIndex = 0;
  SOUNDCLOUD_REGEX.lastIndex = 0;
  
  let match;
  while ((match = YOUTUBE_REGEX.exec(text)) !== null) {
    mediaMatches.push({ type: 'youtube', match: { ...match } as RegExpExecArray });
  }
  
  SOUNDCLOUD_REGEX.lastIndex = 0;
  while ((match = SOUNDCLOUD_REGEX.exec(text)) !== null) {
    mediaMatches.push({ type: 'soundcloud', match: { ...match } as RegExpExecArray });
  }
  
  // Sort by position in text
  mediaMatches.sort((a, b) => a.match.index - b.match.index);
  
  if (mediaMatches.length === 0) {
    segments.push({ type: 'text', content: text });
    return { segments, hasMedia: false };
  }
  
  hasMedia = true;
  let lastIndex = 0;
  
  for (const { type, match } of mediaMatches) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index).trim();
      if (textBefore) {
        segments.push({ type: 'text', content: textBefore });
      }
    }
    
    // Add the media URL
    segments.push({ type, content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last match
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex).trim();
    if (remainingText) {
      segments.push({ type: 'text', content: remainingText });
    }
  }
  
  return { segments, hasMedia };
}

// SoundCloud embed component
function SoundCloudEmbed({ url }: { url: string }) {
  const handlePress = () => {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(fullUrl);
  };

  // On web, we could use an iframe, but for mobile we show a clickable card
  if (Platform.OS === 'web') {
    const encodedUrl = encodeURIComponent(url.startsWith('http') ? url : `https://${url}`);
    return (
      <View style={styles.soundcloudContainer}>
        <iframe
          width="100%"
          height="166"
          scrolling="no"
          frameBorder="no"
          allow="autoplay"
          src={`https://w.soundcloud.com/player/?url=${encodedUrl}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`}
          style={{ borderRadius: 12 }}
        />
      </View>
    );
  }

  // Mobile: Show a clickable card
  return (
    <Pressable style={styles.soundcloudCard} onPress={handlePress}>
      <View style={styles.soundcloudIconContainer}>
        <Ionicons name="cloud" size={40} color={COLORS.soundcloudOrange} />
      </View>
      <View style={styles.soundcloudInfo}>
        <Text style={styles.soundcloudLabel}>SoundCloud</Text>
        <Text style={styles.soundcloudUrl} numberOfLines={1}>{url}</Text>
        <Text style={styles.soundcloudTap}>Tap to play</Text>
      </View>
    </Pressable>
  );
}

const processTextWithMentions = (
  text: string,
  taggedUsers?: { id: string; name: string }[],
  taggedBusinesses?: { id: string; name: string }[]
): string => {
  if (!text) return "";
  
  let processedText = text;
  const allTags = [
    ...(taggedUsers || []).map(u => ({ id: u.id, name: u.name })),
    ...(taggedBusinesses || []).map(b => ({ id: b.id, name: b.name }))
  ];
  
  for (const tag of allTags) {
    // Replace @id with @name
    processedText = processedText.replace(`@${tag.id}`, `@${tag.name}`);
  }
  
  return processedText;
};

export default React.memo(function PostContent({ 
  text, 
  textStyle, 
  videoStyle,
  globalMuted = false,
  onMuteChange,
  onMentionPress,
  youtubeLink,
  soundcloudUrl,
  taggedUsers,
  taggedBusinesses,
  taggedArtists,
}: PostContentProps) {
  const router = useRouter();
  
  const displayText = useMemo(() => 
    processTextWithMentions(text, taggedUsers, taggedBusinesses), 
    [text, taggedUsers, taggedBusinesses]
  );
  
  const hasExplicitMedia = !!youtubeLink || !!soundcloudUrl;
  const { segments, hasMedia } = useMemo(() => parsePostContent(displayText), [displayText]);

  const handleMentionPress = (id: string, type: 'user' | 'business' | 'artist') => {
    if (onMentionPress) {
      onMentionPress(id, type);
    } else {
      // Default navigation
      if (type === 'business') {
        router.push(`/business/${id}`);
      } else {
        router.push(`/user/${id}`);
      }
    }
  };
  
// Parse text to find @mentions and make them clickable
  const renderTextWithMentions = () => {
    const allTags = [
      ...(taggedUsers || []).map(u => ({ id: u.id, name: u.name, type: 'user' as const })),
      ...(taggedBusinesses || []).map(b => ({ id: b.id, name: b.name, type: 'business' as const })),
      ...(taggedArtists || []).map(a => ({ id: a.id, name: a.name, type: 'artist' as const }))
    ];
    
    if (allTags.length === 0 || !displayText) {
      return <Text style={textStyle}>{displayText}</Text>;
    }
    
    // Build a regex to find all @names at once
    const tagNames = allTags.map(t => t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const mentionRegex = new RegExp(`@(${tagNames.join('|')})(?=\\s|$)`, 'gi');
    
    // Split text by mentions but keep the delimiters
    const parts = displayText.split(mentionRegex);
    const matches = displayText.match(mentionRegex) || [];
    
    return (
      <Text style={textStyle}>
        {parts.map((part, index) => {
          // Check if this part is a mention (it should appear at odd indices in split result)
          if (index > 0 && index % 2 === 1) {
            const matchIdx = (index - 1) / 2;
            const matchedName = matches[matchIdx]?.replace('@', '');
            const tag = allTags.find(t => t.name.toLowerCase() === matchedName?.toLowerCase());
            
            if (tag) {
              return (
                <Text
                  key={index}
                  style={styles.mention}
                  onPress={() => handleMentionPress(tag.id, tag.type)}
                >
                  @{matchedName}
                </Text>
              );
            }
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  if (!hasExplicitMedia && !hasMedia) {
    return renderTextWithMentions();
  }
  
  return (
    <View style={styles.container}>
      {youtubeLink && (
        <View style={styles.videoContainer}>
          <AdaptiveVideo
            uri={youtubeLink}
            autoPlay
            style={[styles.video, videoStyle]}
            isLooping={false}
            showMuteButton={true}
            initialMuted={globalMuted}
            onMuteChange={onMuteChange}
          />
        </View>
      )}
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <React.Fragment key={`text-${index}`}>
              {renderTextWithMentions()}
            </React.Fragment>
          );
        }
        
        if (segment.type === 'youtube' && !youtubeLink) {
          return (
            <View key={`youtube-${index}`} style={styles.videoContainer}>
              <AdaptiveVideo
                uri={segment.content}
                autoPlay
                style={[styles.video, videoStyle]}
                isLooping={false}
                showMuteButton={true}
                initialMuted={globalMuted}
                onMuteChange={onMuteChange}
              />
            </View>
          );
        }
        
        if (segment.type === 'soundcloud' && !soundcloudUrl) {
          return (
            <View key={`soundcloud-${index}`} style={styles.soundcloudWrapper}>
              <SoundCloudEmbed url={segment.content} />
            </View>
          );
        }
        
        return null;
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  mention: {
    color: COLORS.mentionBlue,
    fontWeight: "500",
  },
  videoContainer: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    borderRadius: 12,
  },
  soundcloudWrapper: {
    marginTop: 8,
  },
  soundcloudContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  soundcloudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  soundcloudIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: COLORS.soundcloudOrange,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  soundcloudInfo: {
    flex: 1,
  },
  soundcloudLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.soundcloudOrange,
  },
  soundcloudUrl: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  soundcloudTap: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
});

import React, { useMemo } from "react";
import { Text, StyleSheet, View, StyleProp, ViewStyle, TextStyle, Image, Pressable, Linking, Platform } from "react-native";
import AdaptiveVideo from "./AdaptiveVideo";
import { Ionicons } from "@expo/vector-icons";

interface PostContentProps {
  text: string;
  textStyle?: StyleProp<TextStyle>;
  videoStyle?: StyleProp<ViewStyle>;
  globalMuted?: boolean;
  onMuteChange?: (muted: boolean) => void;
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
        <Ionicons name="cloud" size={40} color="#FF5500" />
      </View>
      <View style={styles.soundcloudInfo}>
        <Text style={styles.soundcloudLabel}>SoundCloud</Text>
        <Text style={styles.soundcloudUrl} numberOfLines={1}>{url}</Text>
        <Text style={styles.soundcloudTap}>Tap to play</Text>
      </View>
    </Pressable>
  );
}

export default React.memo(function PostContent({ 
  text, 
  textStyle, 
  videoStyle,
  globalMuted = false,
  onMuteChange 
}: PostContentProps) {
  const { segments, hasMedia } = useMemo(() => parsePostContent(text), [text]);
  
  // If no media URLs, just render text
  if (!hasMedia) {
    return <Text style={textStyle}>{text}</Text>;
  }
  
  return (
    <View style={styles.container}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <Text key={`text-${index}`} style={textStyle}>
              {segment.content}
            </Text>
          );
        }
        
        if (segment.type === 'youtube') {
          return (
            <View key={`youtube-${index}`} style={styles.videoContainer}>
              <AdaptiveVideo
                uri={segment.content}
                style={[styles.video, videoStyle]}
                autoPlay={false}
                isLooping={false}
                showMuteButton={true}
                initialMuted={globalMuted}
                onMuteChange={onMuteChange}
              />
            </View>
          );
        }
        
        if (segment.type === 'soundcloud') {
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
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#FF5500',
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
    color: '#FF5500',
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

import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { Post } from "../../lib/api";
import AdaptiveVideo from "../AdaptiveVideo";
import AdaptiveImage from "../AdaptiveImage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const CONTAINER_WIDTH = SCREEN_WIDTH - 16;
const MAX_MEDIA_HEIGHT = SCREEN_HEIGHT * 0.75;

interface PostMediaProps {
  post: Post;
  autoPlay: boolean;
  muted: boolean;
  showMuteButton: boolean;
  onMuteChange?: (muted: boolean) => void;
  onPress?: () => void;
}

export default function PostMedia({ post, autoPlay, muted, showMuteButton, onMuteChange, onPress }: PostMediaProps) {
  const ratio = post.media_ratio && Number.isFinite(post.media_ratio) && post.media_ratio > 0 ? post.media_ratio : 4 / 5;
  const naturalHeight = ratio > 0 ? CONTAINER_WIDTH / ratio : CONTAINER_WIDTH;
  const frameHeight = Math.min(naturalHeight, MAX_MEDIA_HEIGHT);

  if (post.video_url) {
    return (
      <View style={[styles.wrapper, { height: frameHeight }]}>
        <AdaptiveVideo
          uri={post.video_url}
          style={{ width: "100%", height: frameHeight }}
          ratio={ratio}
          autoPlay={autoPlay}
          isLooping
          initialMuted={muted}
          showMuteButton={showMuteButton}
          onMuteChange={onMuteChange}
          resizeMode="cover"
          coverPhoto={post.mux_thumbnail_url || undefined}
          maxHeight={frameHeight}
          borderRadius={0}
          videoStatus={post.video_status}
          muxThumbnailUrl={post.mux_thumbnail_url || undefined}
          onPress={onPress}
        />
      </View>
    );
  }

  if (post.image_url) {
    return (
      <View style={[styles.wrapper, { height: frameHeight }]}>
        <AdaptiveImage
          uri={post.image_url}
          style={{ width: "100%", height: frameHeight }}
          ratio={ratio}
          maxHeight={frameHeight}
          borderRadius={0}
          onPress={onPress}
        />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: "transparent",
    marginBottom: 8,
  },
});

import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { Post } from "../../lib/api";
import AdaptiveVideo from "../AdaptiveVideo";
import AdaptiveImage from "../AdaptiveImage";

interface PostMediaProps {
  post: Post;
  autoPlay: boolean;
  muted: boolean;
  showMuteButton: boolean;
  onMuteChange?: (muted: boolean) => void;
  onPress?: () => void;
}

export default function PostMedia({ post, autoPlay, muted, showMuteButton, onMuteChange, onPress }: PostMediaProps) {
  if (post.video_url) {
    return (
      <View style={styles.wrapper}>
        <AdaptiveVideo
          uri={post.video_url}
          ratio={post.media_ratio || undefined}
          autoPlay={autoPlay}
          isLooping
          initialMuted={muted}
          showMuteButton={showMuteButton}
          onMuteChange={onMuteChange}
          resizeMode="cover"
          coverPhoto={post.mux_thumbnail_url || undefined}
          maxHeight={Dimensions.get("window").height * 0.75}
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
      <View style={styles.wrapper}>
        <AdaptiveImage
          uri={post.image_url}
          ratio={post.media_ratio || undefined}
          maxHeight={Dimensions.get("window").height * 0.75}
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

import React, { useEffect, useState } from "react";
import { Image, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

type AdaptiveImageProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  resizeMode?: "cover" | "contain";
  ratio?: number;
};

export default React.memo(function AdaptiveImage({
  uri,
  style,
  resizeMode = "cover",
  ratio,
}: AdaptiveImageProps) {
  const [aspectRatio, setAspectRatio] = useState(ratio || 16 / 9);

  useEffect(() => {
    if (ratio) {
      setAspectRatio(ratio);
    }
  }, [ratio]);

  return (
    <View style={[styles.container, style, { aspectRatio }]}> 
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={resizeMode}
        onLoad={(event) => {
          // Handle both native and web image load events
          const source = event?.nativeEvent?.source;
          const width = source?.width;
          const height = source?.height;
          if (width && height) {
            setAspectRatio(width / height);
          }
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111827",
    overflow: "hidden",
  },
});
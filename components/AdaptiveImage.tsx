import React, { useCallback, useEffect, useState } from "react";
import { DimensionValue, Image, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../lib/designTokens";

type AdaptiveImageProps = {
  uri: string;
  style?: StyleProp<ViewStyle>;
  resizeMode?: "cover" | "contain";
  ratio?: number;
  fallbackColor?: string;
  maxHeight?: number;
  borderRadius?: number;
  onPress?: () => void;
  showFallbackIcon?: boolean;
};

const DEFAULT_MAX_HEIGHT = 470;

export default React.memo(function AdaptiveImage({
  uri,
  style,
  resizeMode = "cover",
  ratio,
  fallbackColor = COLORS.surfaceDark,
  maxHeight = DEFAULT_MAX_HEIGHT,
  borderRadius = 12,
  onPress,
  showFallbackIcon = false,
}: AdaptiveImageProps) {
  const [aspectRatio, setAspectRatio] = useState(ratio || 16 / 9);
  const [hasError, setHasError] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (ratio) {
      setAspectRatio(ratio);
    }
    setHasError(false);
    setNaturalSize(null);
  }, [ratio, uri]);

  const isValidUri = uri && (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:image/') || uri.startsWith('file://'));

  const handleLoad = useCallback((event: any) => {
    const source = event?.nativeEvent?.source;
    const width = source?.width;
    const height = source?.height;
    if (width && height) {
      setNaturalSize({ width, height });
      const naturalRatio = width / height;
      if (!ratio) {
        setAspectRatio(naturalRatio);
      }
    }
  }, [ratio]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const containerStyle: ViewStyle = {
    width: "100%",
    aspectRatio,
    maxHeight,
    borderRadius,
    overflow: "hidden",
    backgroundColor: hasError || !isValidUri ? fallbackColor : COLORS.surfaceDark,
  };

  const imageResizeMode = resizeMode as any;

  const content = (
    <View style={[styles.container, containerStyle, style]}>
      {!hasError && isValidUri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode={imageResizeMode}
          onLoad={handleLoad}
          onError={handleError}
        />
      ) : (
        showFallbackIcon && (
          <View style={styles.fallback}>
            <Ionicons name="image-outline" size={32} color={COLORS.textPlaceholder} />
          </View>
        )
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="imagebutton">
        {content}
      </Pressable>
    );
  }

  return content;
});

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

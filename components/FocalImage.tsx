import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

export type FocalPoint = {
  x: number;
  y: number;
};

type FocalImageProps = {
  uri?: string | null;
  aspectRatio?: number;
  focalPoint?: FocalPoint | null;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  showLoader?: boolean;
};

const DEFAULT_FOCAL_POINT: FocalPoint = { x: 0.5, y: 0.5 };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveFocalPoint(point?: FocalPoint | null): FocalPoint {
  return {
    x: clamp(point?.x ?? DEFAULT_FOCAL_POINT.x, 0, 1),
    y: clamp(point?.y ?? DEFAULT_FOCAL_POINT.y, 0, 1),
  };
}

function getCoverLayout(params: {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  focalPoint: FocalPoint;
}) {
  const { containerWidth, containerHeight, imageWidth, imageHeight, focalPoint } = params;
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;

  const scale = Math.max(containerWidth / imageWidth, containerHeight / imageHeight);
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;

  const minLeft = containerWidth - scaledWidth;
  const maxLeft = 0;
  const minTop = containerHeight - scaledHeight;
  const maxTop = 0;

  const left = clamp(containerWidth / 2 - focalPoint.x * scaledWidth, minLeft, maxLeft);
  const top = clamp(containerHeight / 2 - focalPoint.y * scaledHeight, minTop, maxTop);

  return { width: scaledWidth, height: scaledHeight, left, top };
}

export default function FocalImage({
  uri,
  aspectRatio = 16 / 9,
  focalPoint,
  borderRadius = 0,
  style,
  imageStyle,
  showLoader = true,
}: FocalImageProps) {
  const safeFocal = useMemo(() => resolveFocalPoint(focalPoint), [focalPoint]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    setFailed(false);
    setNaturalSize(null);
    if (!uri) return;
    Image.getSize(
      uri,
      (w, h) => { if (mounted) setNaturalSize({ width: w, height: h }); },
      () => { if (mounted) setFailed(true); }
    );
    return () => { mounted = false; };
  }, [uri]);

  const coverLayout = useMemo(() => {
    if (!naturalSize) return null;
    return getCoverLayout({
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
      imageWidth: naturalSize.width,
      imageHeight: naturalSize.height,
      focalPoint: safeFocal,
    });
  }, [containerSize, naturalSize, safeFocal]);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setContainerSize({ width, height });
      }}
      style={[styles.container, { aspectRatio, borderRadius }, style]}
    >
      {!uri || failed ? (
        <View style={styles.fallback} />
      ) : coverLayout ? (
        <Image
          source={{ uri }}
          style={[
            styles.image,
            { width: coverLayout.width, height: coverLayout.height, left: coverLayout.left, top: coverLayout.top },
            imageStyle,
          ]}
        />
      ) : (
        <>
          {showLoader && <ActivityIndicator />}
          <Image source={{ uri }} style={styles.preload} resizeMode="cover" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", overflow: "hidden", backgroundColor: "#F3F5FA", justifyContent: "center", alignItems: "center" },
  image: { position: "absolute" },
  preload: { width: 1, height: 1, opacity: 0 },
  fallback: { width: "100%", height: "100%", backgroundColor: "#F3F5FA" },
});

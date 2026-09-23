import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, DimensionValue, ViewStyle, Easing } from "react-native";
import { COLORS } from "../../lib/designTokens";

type SkeletonBoxProps = {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
};

export const SkeletonBox = ({
  width = "100%",
  height = 16,
  borderRadius = 4,
  style,
}: SkeletonBoxProps) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.ease,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View
      style={[
        styles.container,
        { width, height, borderRadius },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX: shimmerTranslate }] },
        ]}
      >
        <View style={styles.shimmerInner} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.border,
    overflow: "hidden",
  },
  shimmer: {
    width: 300,
    height: "100%",
    position: "absolute",
    left: 0,
    top: 0,
  },
  shimmerInner: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
});

export default SkeletonBox;

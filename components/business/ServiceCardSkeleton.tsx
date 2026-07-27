import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { BORDER_RADIUS } from "../../lib/designTokens";

type Props = {
  width?: number | string;
};

export default function ServiceCardSkeleton({ width = "100%" }: Props) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <View style={[styles.card, typeof width === "number" ? { width } : { width: width as any }]}>
      <Animated.View style={[styles.image, { opacity }]} />
      <View style={styles.info}>
        <Animated.View style={[styles.line, styles.lineShort, { opacity }]} />
        <Animated.View style={[styles.line, { opacity }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: BORDER_RADIUS.lg, overflow: "hidden" },
  image: { width: "100%", aspectRatio: 4 / 3, backgroundColor: "#e5e7eb" },
  info: { padding: 10, gap: 8 },
  line: { height: 12, backgroundColor: "#e5e7eb", borderRadius: 4, width: "80%" },
  lineShort: { width: "50%" },
});

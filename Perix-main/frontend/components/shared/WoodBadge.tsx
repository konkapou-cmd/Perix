import React, { useState } from "react";
import { ImageBackground, StyleSheet, Text, View } from "react-native";

type Props = {
  text: string;
  /** Which wood from the kit — each keeps its own proportions. */
  variant?: "wide" | "medium" | "small";
  style?: any;
  textStyle?: any;
};

const VARIANTS = {
  // width/height aspect of the cropped wooden buttons
  wide: { source: require("../../assets/brand/wooden-wide.png"), aspect: 168 / 1356, minWidth: 260, fontSize: 16 },
  medium: { source: require("../../assets/brand/wooden-medium.png"), aspect: 160 / 428, minWidth: 150, fontSize: 15 },
  small: { source: require("../../assets/brand/wooden-small.png"), aspect: 124 / 244, minWidth: 110, fontSize: 13 },
} as const;

/**
 * Wooden button badge (Perix brand). The text is measured without a width
 * constraint first, then the selected wood scales uniformly to fit the whole
 * text in any language — longer labels grow the button, shorter ones shrink
 * it, always keeping the wood's natural proportions.
 *
 * Letters are white with a very soft light-blue halo (their "border") and
 * sit horizontally centred between the two nails at the ends of the plank.
 * The plank's bottom edge is shaded, so the letters are nudged upwards to
 * sit on the optical centre of the wood face.
 */
export default function WoodBadge({ text, variant = "medium", style, textStyle }: Props) {
  const [textWidth, setTextWidth] = useState(0);
  const config = VARIANTS[variant];
  // Nails sit ~2.4% in from each end of the plank — keep the text at least
  // 4.5% away from the edges so it always sits between them.
  const pad = Math.max(20, Math.round((textWidth + 40) * 0.045));
  const width = Math.max(config.minWidth, textWidth + pad * 2);
  const height = Math.round(width * config.aspect);
  // Bottom shaded edge of the plank measures ~16% of its height; shifting
  // the text up by half of that (via bottom padding) would overshoot, so we
  // use a quarter — halfway between the raw centre and the optical centre.
  const bottomPad = Math.round(height * 0.08);

  return (
    <View style={{ position: "relative" }}>
      {/* Invisible, unconstrained copy: measures the full text in any language. */}
      <Text
        onTextLayout={(event) => {
          const line = event.nativeEvent.lines[0];
          if (line) setTextWidth(line.width);
        }}
        style={[styles.measure, { fontSize: config.fontSize }]}
      >
        {text}
      </Text>
      <ImageBackground
        source={config.source}
        resizeMode="stretch"
        style={[styles.wood, { width, height, paddingHorizontal: pad, paddingBottom: bottomPad }, style]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit={false}
          style={[styles.text, { fontSize: config.fontSize }, textStyle]}
        >
          {text}
        </Text>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  measure: {
    position: "absolute",
    opacity: 0,
    left: 0,
    top: 0,
    alignSelf: "flex-start",
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  wood: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.4,
    // Very soft light-blue halo around the white letters.
    textShadowColor: "rgba(196, 228, 255, 0.95)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
});

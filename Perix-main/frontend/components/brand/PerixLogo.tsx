import React from "react";
import { Image } from "react-native";
import { useTranslation } from "react-i18next";

const WORDMARK = require("../../assets/brand/perix-wordmark.png");
const GREEK_WORDMARK = require("../../assets/brand/perix-wordmark-el.png");
// A fixed display slot avoids moving the header when the script changes.
// Each artwork keeps its own intrinsic proportions through `contain`.
const ASPECT_RATIO = 1139 / 400;
const WIDTHS = { compact: 108, header: 124, gateway: 176, login: 280 } as const;

/** Original supplied artwork, with only the surrounding whitespace cropped. */
export default function PerixLogo({ size = "header" }: { size?: keyof typeof WIDTHS }) {
  const { i18n } = useTranslation();
  const greek = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0] === "el";
  const width = WIDTHS[size];
  return <Image source={greek ? GREEK_WORDMARK : WORDMARK} resizeMode="contain" accessible accessibilityRole="image"
    accessibilityLabel={greek ? "Πέριξ" : "Perix"} testID={`perix-logo-${size}`}
    style={{ width, height: width / ASPECT_RATIO, flexShrink: 0 }} />;
}

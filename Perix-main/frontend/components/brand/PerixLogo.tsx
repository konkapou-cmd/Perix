import React from "react";
import { Image, Platform } from "react-native";

const WORDMARK = require("../../assets/brand/perix-carved-compass.png");
const ENGLISH_WORDMARK = require("../../assets/brand/perix-carved-compass.png");
// A fixed display slot avoids moving the header when the script changes.
// Each artwork keeps its own intrinsic proportions through `contain`.
const ASPECT_RATIO = 2089 / 753;
const WIDTHS = { mobileHeader:72, banner:72, compact: 108, header: 124, gateway: 176, login: 280 } as const;
const ENGLISH_WIDTHS = { mobileHeader:80, banner:80, compact:132, header:148, gateway:200, login:300 } as const;

/** Use the supplied 3D English artwork only in the Locator/App/Home headers. */
export default function PerixLogo({ size = "header", variant = "watercolor" }: { size?: keyof typeof WIDTHS; variant?: "watercolor" | "english" }) {
  const english=variant==="english";
  const width = (english ? ENGLISH_WIDTHS : WIDTHS)[size];
  const shadowStyle=english ? Platform.select({
    web: { filter:"drop-shadow(1px 1px 1px rgba(5,31,58,0.48))" } as any,
    default: { shadowColor:"#051F3A", shadowOffset:{width:1,height:1}, shadowOpacity:0.34, shadowRadius:1.2, elevation:1 },
  }) : undefined;
  return <Image source={english ? ENGLISH_WORDMARK : WORDMARK} resizeMode="contain" accessible accessibilityRole="image"
    accessibilityLabel="Perix" testID={`perix-logo-${size}`}
    style={[{ width, height: width / ASPECT_RATIO, flexShrink: 0 }, shadowStyle]} />;
}

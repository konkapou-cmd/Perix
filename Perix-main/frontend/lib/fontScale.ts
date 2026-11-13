import AsyncStorage from "@react-native-async-storage/async-storage";

export const FONT_SCALE_KEY = "perix-font-scale";

export type FontScaleChoice = "85" | "100" | "130";

export const FONT_SCALE_FACTORS: Record<FontScaleChoice, number> = {
  "85": 0.85,
  "100": 1,
  "130": 1.3,
};

export const FONT_SCALE_STEPS: FontScaleChoice[] = ["85", "100", "130"];

let currentFactor = 1;
let installed = false;

// One scaled copy per unique style object per factor. StyleSheet.create
// objects are stable identities, so repeated renders reuse the same copy
// (and RNW's atomic CSS cache keeps hitting instead of growing).
const scaledCache = new WeakMap<object, { factor: number; scaled: unknown }>();

function scaledCopy(style: unknown): unknown {
  if (currentFactor === 1 || style == null) return style;
  if (Array.isArray(style)) {
    let changed = false;
    const out = style.map((entry) => {
      const next = scaledCopy(entry);
      if (next !== entry) changed = true;
      return next;
    });
    return changed ? out : style;
  }
  if (typeof style === "object") {
    const record = style as Record<string, unknown>;
    if (typeof record.fontSize !== "number" && typeof record.lineHeight !== "number") return style;
    const hit = scaledCache.get(record);
    if (hit && hit.factor === currentFactor) return hit.scaled;
    const scaled: Record<string, unknown> = { ...record };
    if (typeof record.fontSize === "number") scaled.fontSize = Math.round(record.fontSize * currentFactor);
    // Keep line proportions so enlarged text never overlaps or clips.
    if (typeof record.lineHeight === "number") scaled.lineHeight = Math.round(record.lineHeight * currentFactor);
    scaledCache.set(record, { factor: currentFactor, scaled });
    return scaled;
  }
  return style;
}

function installPatches(): void {
  if (installed) return;
  installed = true;
  // Native: every Text/TextInput render flattens its style here.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native/Libraries/StyleSheet/flattenStyle");
    const original = mod && mod.default;
    if (typeof original === "function") {
      const wrapped = (style: unknown) => scaledCopy(original(style));
      Object.assign(wrapped, original);
      mod.default = wrapped;
    }
  } catch {}
  // Web (react-native-web): every element's props pass through here.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-web/modules/createDOMProps");
    const original = mod && mod.default;
    if (typeof original === "function") {
      const wrapped = (elementType: unknown, props: any, options: unknown) => {
        if (props && props.style) props = { ...props, style: scaledCopy(props.style) };
        return original(elementType, props, options);
      };
      Object.assign(wrapped, original);
      mod.default = wrapped;
    }
  } catch {}
}

/**
 * Global text-size preference (accessibility: vision). Only font sizes (and
 * their line heights, to avoid overlap) scale — layout, bounds and margins
 * stay the same, so the map stays stable. Patches are installed once and read
 * the current factor on every render, so switching is instant with no
 * animation (prefers-reduced-motion respected).
 */
export function applyFontScale(choice: FontScaleChoice): void {
  currentFactor = FONT_SCALE_FACTORS[choice] ?? 1;
  installPatches();
}

export async function setStoredFontScale(choice: FontScaleChoice): Promise<void> {
  try {
    await AsyncStorage.setItem(FONT_SCALE_KEY, choice);
  } catch {}
  applyFontScale(choice);
}

function normalize(saved: string | null): FontScaleChoice {
  if (saved === "85" || saved === "100" || saved === "130") return saved;
  // Migrate the earlier standard/large/xl values.
  if (saved === "standard") return "100";
  if (saved === "large" || saved === "xl") return "130";
  return "100";
}

export async function getStoredFontScale(): Promise<FontScaleChoice> {
  try {
    return normalize(await AsyncStorage.getItem(FONT_SCALE_KEY));
  } catch {
    return "100";
  }
}

/** Read the saved preference and activate it (call once at app start). */
export async function applyStoredFontScale(): Promise<void> {
  applyFontScale(await getStoredFontScale());
}

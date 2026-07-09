import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from "../lib/designTokens";

export type FocalPoint = { x: number; y: number };

type Props = {
  visible: boolean;
  uri: string;
  initialFocalPoint?: FocalPoint | null;
  aspectRatio?: number;
  title?: string;
  onCancel: () => void;
  onSave: (focalPoint: FocalPoint) => void;
};

const DEFAULT: FocalPoint = { x: 0.5, y: 0.5 };

function clamp(v: number, min: number, max: number) { return Math.min(Math.max(v, min), max); }
function resolve(point?: FocalPoint | null): FocalPoint {
  return { x: clamp(point?.x ?? DEFAULT.x, 0, 1), y: clamp(point?.y ?? DEFAULT.y, 0, 1) };
}

function getLayout(params: {
  cw: number; ch: number; iw: number; ih: number; fp: FocalPoint;
}) {
  const { cw, ch, iw, ih, fp } = params;
  const s = Math.max(cw / iw, ch / ih);
  const w = iw * s, h = ih * s;
  return {
    w, h,
    left: clamp(cw / 2 - fp.x * w, cw - w, 0),
    top: clamp(ch / 2 - fp.y * h, ch - h, 0),
    minL: cw - w, maxL: 0, minT: ch - h, maxT: 0,
  };
}

function fpFromPos(p: { left: number; top: number; sw: number; sh: number; cw: number; ch: number }): FocalPoint {
  return { x: clamp((p.cw / 2 - p.left) / p.sw, 0, 1), y: clamp((p.ch / 2 - p.top) / p.sh, 0, 1) };
}

export default function CoverPositionEditor({ visible, uri, initialFocalPoint, aspectRatio = 16 / 9, title = "Cover neu positionieren", onCancel, onSave }: Props) {
  const [contSz, setContSz] = useState({ w: 0, h: 0 });
  const [natSz, setNatSz] = useState<{ w: number; h: number } | null>(null);
  const [fp, setFp] = useState(resolve(initialFocalPoint));
  const [manual, setManual] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setFp(resolve(initialFocalPoint));
    setManual(null);
    Image.getSize(uri, (w, h) => setNatSz({ w, h }), () => setNatSz(null));
  }, [visible, uri, initialFocalPoint]);

  const base = useMemo(() => {
    if (!natSz || contSz.w <= 0) return null;
    return getLayout({ cw: contSz.w, ch: contSz.h, iw: natSz.w, ih: natSz.h, fp });
  }, [natSz, contSz, fp]);

  const layout = useMemo(() => {
    if (!base) return null;
    return { ...base, left: manual?.left ?? base.left, top: manual?.top ?? base.top, w: base.w, h: base.h };
  }, [base, manual]);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { if (layout) drag.current = { left: layout.left, top: layout.top }; },
    onPanResponderMove: (_, g) => {
      if (!base || !drag.current) return;
      const l = clamp(drag.current.left + g.dx, base.minL, base.maxL);
      const t = clamp(drag.current.top + g.dy, base.minT, base.maxT);
      setManual({ left: l, top: t });
      setFp(fpFromPos({ left: l, top: t, sw: base.w, sh: base.h, cw: contSz.w, ch: contSz.h }));
    },
    onPanResponderRelease: () => { drag.current = null; },
    onPanResponderTerminate: () => { drag.current = null; },
  }), [base, layout, contSz]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={s.screen}>
        <View style={s.header}>
          <Pressable onPress={onCancel} style={s.hBtn}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={s.hTitle} numberOfLines={1}>{title}</Text>
          <View style={s.hBtn} />
        </View>

        <View style={s.body}>
          <Text style={s.help}>
            Ziehe das Bild, bis der wichtigste Bereich gut sichtbar ist.
          </Text>

          <View onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setContSz({ w: width, h: height }); }} style={[s.preview, { aspectRatio }]} {...pan.panHandlers}>
            {layout && (
              <Image source={{ uri }} style={[s.img, { width: layout.w, height: layout.h, left: layout.left, top: layout.top }]} />
            )}
            <View pointerEvents="none" style={s.safeArea} />
            <View pointerEvents="none" style={s.crossV} />
            <View pointerEvents="none" style={s.crossH} />
          </View>

          <Pressable onPress={() => { setFp(DEFAULT); setManual(null); }} style={s.reset}>
            <Text style={s.resetText}>Zur Mitte zurücksetzen</Text>
          </Pressable>
        </View>

        <View style={s.footer}>
          <Pressable onPress={onCancel} style={[s.fBtn, s.cancel]}>
            <Text style={s.cancelText}>Abbrechen</Text>
          </Pressable>
          <Pressable onPress={() => onSave({ x: +fp.x.toFixed(4), y: +fp.y.toFixed(4) })} style={[s.fBtn, s.save]}>
            <Text style={s.saveText}>Speichern</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  header: { height: 64, paddingHorizontal: SPACING.std, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: "row", alignItems: "center" },
  hBtn: { width: 48, height: 48, justifyContent: "center", alignItems: "center" },
  hTitle: { flex: 1, textAlign: "center", fontSize: FONT_SIZES.h3, fontWeight: "800", color: COLORS.textPrimary },
  body: { flex: 1, padding: SPACING.std, justifyContent: "center" },
  help: { marginBottom: SPACING.std, textAlign: "center", color: COLORS.textSecondary, fontSize: FONT_SIZES.bodySmall },
  preview: { width: "100%", borderRadius: BORDER_RADIUS.xxl, overflow: "hidden", backgroundColor: "#F3F5FA" },
  img: { position: "absolute" },
  safeArea: { position: "absolute", left: "10%", right: "10%", top: "10%", bottom: "10%", borderWidth: 1, borderColor: "rgba(255,255,255,0.7)", borderRadius: BORDER_RADIUS.md },
  crossV: { position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: "rgba(255,255,255,0.75)" },
  crossH: { position: "absolute", left: 0, right: 0, top: "50%", height: 1, backgroundColor: "rgba(255,255,255,0.75)" },
  reset: { alignSelf: "center", marginTop: SPACING.std, paddingHorizontal: 18, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.border, justifyContent: "center" },
  resetText: { color: COLORS.primary, fontSize: FONT_SIZES.bodySmall, fontWeight: "700" },
  footer: { paddingHorizontal: SPACING.std, paddingTop: SPACING.compact, paddingBottom: SPACING.std, borderTopWidth: 1, borderTopColor: COLORS.border, flexDirection: "row", gap: SPACING.compact },
  fBtn: { flex: 1, height: 56, borderRadius: BORDER_RADIUS.button, justifyContent: "center", alignItems: "center" },
  cancel: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  save: { backgroundColor: COLORS.primary },
  cancelText: { fontSize: FONT_SIZES.body, fontWeight: "700", color: COLORS.textSecondary },
  saveText: { fontSize: FONT_SIZES.body, fontWeight: "700", color: "#fff" },
});

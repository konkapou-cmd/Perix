import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

export function useAppForeground() {
  const initial = Platform.OS === "web"
    ? typeof document === "undefined" || document.visibilityState !== "hidden"
    : AppState.currentState == null || AppState.currentState === "active";
  const [state, setState] = useState({ visible: initial, epoch: 0 });
  const visible = useRef(initial);
  const lastWake = useRef(Date.now());
  useEffect(() => {
    const update = (next: boolean) => {
      const wake = next && (!visible.current || Date.now() - lastWake.current > 1000);
      visible.current = next;
      if (wake) lastWake.current = Date.now();
      setState(old => old.visible === next && !wake ? old : { visible: next, epoch: old.epoch + (wake ? 1 : 0) });
    };
    if (Platform.OS === "web") {
      const show = () => update(document.visibilityState !== "hidden");
      window.addEventListener("focus", show);
      document.addEventListener("visibilitychange", show);
      return () => { window.removeEventListener("focus", show); document.removeEventListener("visibilitychange", show); };
    }
    const subscription = AppState.addEventListener("change", value => update(value === "active"));
    return () => subscription.remove();
  }, []);
  return state;
}

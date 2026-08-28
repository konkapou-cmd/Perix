import React from "react";
import { Text, TextInput } from "react-native";

let applied = false;

/**
 * Applies a default font family to every Text and TextInput across the app
 * by monkey-patching their render methods. Call once at app start.
 */
export function applyDefaultFontFamily(fontFamily: string): void {
  if (applied) return;
  applied = true;

  const patch = (Component: any) => {
    const original = Component.render;
    Component.render = function (...args: any[]) {
      const element = original.call(this, ...args);
      if (!React.isValidElement(element)) return element;
      const props: any = element.props || {};
      return React.cloneElement(element, {
        style: [{ fontFamily }, props.style],
      } as any);
    };
  };

  patch(Text);
  patch(TextInput);
}

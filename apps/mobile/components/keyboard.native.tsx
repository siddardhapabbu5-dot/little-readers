import { forwardRef, type ReactNode } from "react";
import type { ScrollView, ScrollViewProps } from "react-native";
import { KeyboardAwareScrollView, KeyboardProvider } from "react-native-keyboard-controller";

/** Tracks the on-screen keyboard natively; needed because Android draws edge-to-edge and no longer resizes the window. */
export function KeyboardRoot({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

/** ScrollView that keeps the focused input just above the keyboard without moving the rest of the page. */
export const KeyboardAwareScroll = forwardRef<ScrollView, ScrollViewProps & { bottomOffset?: number }>(
  function KeyboardAwareScroll({ bottomOffset = 24, ...rest }, ref) {
    return <KeyboardAwareScrollView ref={ref} bottomOffset={bottomOffset} {...rest} />;
  }
);

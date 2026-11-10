import { forwardRef, type ReactNode } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";

export function KeyboardRoot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** The browser moves focused inputs into view itself, so the web build uses a plain ScrollView. */
export const KeyboardAwareScroll = forwardRef<ScrollView, ScrollViewProps & { bottomOffset?: number }>(
  function KeyboardAwareScroll({ bottomOffset: _bottomOffset, ...rest }, ref) {
    return <ScrollView ref={ref} {...rest} />;
  }
);

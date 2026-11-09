import { useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export const tvColors = {
  ink: "#1E1B4B",
  muted: "#475569",
  blue: "#1D4ED8",
  white: "#FFFFFF",
  focus: "#FACC15",
  green: "#16A34A",
  orange: "#C2410C",
  red: "#DC2626",
};

/** Layout is designed for a 960×540 dp TV screen (1080p at density 2) and scaled to fit. */
export function useTvScale() {
  const { width, height } = useWindowDimensions();
  const k = Math.min(width / 960, height / 540);
  return (n: number) => Math.round(n * k);
}

export function TvBackground({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={["#7DD3FC", "#BAE6FD", "#E0F2FE", "#BBF7D0"]} style={StyleSheet.absoluteFill}>
      {children}
    </LinearGradient>
  );
}

type Tone = "soft" | "primary" | "go" | "danger" | "plain";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  soft: { bg: "#FFFFFF", fg: tvColors.ink },
  primary: { bg: "#7C3AED", fg: "#FFFFFF" },
  go: { bg: tvColors.green, fg: "#FFFFFF" },
  danger: { bg: tvColors.red, fg: "#FFFFFF" },
  plain: { bg: "transparent", fg: tvColors.ink },
};

/**
 * Remote-friendly button: the D-pad moves Android focus between these, OK presses the
 * focused one, and focus shows a thick yellow ring and slight zoom.
 */
export function TvButton({
  onPress,
  children,
  label,
  tone = "soft",
  disabled,
  dimmed,
  preferred,
  style,
  textStyle,
  accessibilityLabel,
}: {
  onPress: () => void;
  children?: ReactNode;
  label?: string;
  tone?: Tone;
  disabled?: boolean;
  /** Looks inactive but keeps remote focus (so focus does not jump away). */
  dimmed?: boolean;
  preferred?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const s = useTvScale();
  const [focused, setFocused] = useState(false);
  const colors = TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      focusable={!disabled}
      hasTVPreferredFocus={preferred && !disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          backgroundColor: colors.bg,
          borderRadius: s(16),
          paddingVertical: s(10),
          paddingHorizontal: s(20),
          alignItems: "center",
          justifyContent: "center",
          borderWidth: s(4),
          borderColor: "transparent",
          elevation: tone === "plain" ? 0 : 3,
        },
        style,
        focused && {
          borderColor: tvColors.focus,
          transform: [{ scale: 1.07 }],
          elevation: 10,
        },
        (disabled || dimmed) && { opacity: 0.45 },
      ]}
    >
      {label ? (
        <Text style={[{ color: colors.fg, fontSize: s(20), fontWeight: "900" }, textStyle]}>{label}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

export function TvPicture({
  imageUrl,
  emoji,
  size,
}: {
  imageUrl?: string | null;
  emoji: string;
  size: number;
}) {
  const [broken, setBroken] = useState(false);
  if (imageUrl && !broken && /^(https?:|data:image)/.test(imageUrl)) {
    return (
      <Image
        source={{ uri: imageUrl }}
        onError={() => setBroken(true)}
        resizeMode="contain"
        style={{ width: size, height: size, borderRadius: size * 0.1, backgroundColor: "#fff" }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.12,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.62 }}>{emoji || "🖼️"}</Text>
    </View>
  );
}

export function Pill({ text, star }: { text: string; star?: boolean }) {
  const s = useTvScale();
  return (
    <View
      style={{
        backgroundColor: star ? "#FEF08A" : "#fff",
        borderRadius: s(30),
        paddingVertical: s(5),
        paddingHorizontal: s(14),
      }}
    >
      <Text style={{ fontSize: s(17), fontWeight: "900", color: tvColors.ink }}>{text}</Text>
    </View>
  );
}

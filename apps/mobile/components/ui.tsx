import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { colors, radii, shadow } from "../theme";

/**
 * Vertical page scroller for screens with inputs: lifts content above the keyboard,
 * keeps taps on buttons working while it is open, and caps line length on tablets.
 */
export const KeyboardScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScroll(
  { style, contentContainerStyle, ...rest },
  ref
) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        ref={ref}
        style={[styles.flex, style]}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        {...rest}
      />
    </KeyboardAvoidingView>
  );
});

/** Refresh spinner that floats over the content below instead of pushing it down. */
export function LoadingSlot({
  active,
  color = colors.primary,
}: {
  active: boolean;
  color?: string;
}) {
  return (
    <View style={styles.loadingSlot} pointerEvents="none">
      {active ? (
        <View style={[styles.loadingBubble, shadow.card]}>
          <ActivityIndicator color={color} />
        </View>
      ) : null}
    </View>
  );
}

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  color = colors.card,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  return (
    <View style={[styles.card, shadow.card, { backgroundColor: color }, style]}>
      {children}
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  color = colors.primary,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: color, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryBtnText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SoftButton({
  label,
  onPress,
  active = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.softBtn, active && styles.softBtnActive]}
    >
      <Text style={[styles.softBtnText, active && styles.softBtnTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, editable = true, ...rest } = props;
  const locked = editable === false;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...rest}
        placeholderTextColor="#A1A1AA"
        editable={!locked}
        selectTextOnFocus={!locked}
        style={[styles.input, locked && styles.inputLocked, style]}
      />
    </View>
  );
}

export function ProgressBar({
  value,
  max,
  color = colors.primary,
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export function AvatarBubble({
  emoji,
  size = 56,
  bg = colors.primarySoft,
}: {
  emoji: string;
  size?: number;
  bg?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
  },
  loadingSlot: {
    height: 0,
    alignItems: "center",
    zIndex: 10,
    elevation: 8,
    overflow: "visible",
  },
  loadingBubble: {
    position: "absolute",
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textMuted,
    lineHeight: 22,
  },
  muted: {
    fontSize: 14,
    color: colors.textMuted,
  },
  primaryBtn: {
    borderRadius: radii.pill,
    paddingVertical: 16,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 17,
  },
  softBtn: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  softBtnActive: {
    backgroundColor: colors.primary,
  },
  softBtnText: {
    color: colors.primaryDark,
    fontWeight: "800",
    fontSize: 15,
  },
  softBtnTextActive: {
    color: "#fff",
  },
  fieldLabel: {
    fontWeight: "700",
    color: colors.text,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
  },
  inputLocked: {
    backgroundColor: "#F4F4F5",
    color: colors.textMuted,
  },
  progressTrack: {
    height: 12,
    backgroundColor: "#E4ECF7",
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  sectionAction: {
    color: colors.primary,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
  },
});

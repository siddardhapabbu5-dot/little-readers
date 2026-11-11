import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest, ApiError } from "../services/api";
import { unlockParentGate } from "../services/parent-gate";
import { getUser } from "../services/secure";
import { EmailOtpVerify } from "./EmailOtpVerify";
import { colors, radii, shadow } from "../theme";

export { isParentGateUnlocked } from "../services/parent-gate";

type Props = {
  visible: boolean;
  /** Cancel only (X, Cancel, hardware back). Never called after a successful unlock. */
  onClose: () => void;
  /** Called only after the server verified (or created) the PIN. */
  onUnlocked: () => void;
};

type Step = "loading" | "error" | "unlock" | "create" | "confirm";

const MIN_PIN = 4;
const MAX_PIN = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

export function ParentGateModal({ visible, onClose, onUnlocked }: Props) {
  const [step, setStep] = useState<Step>("loading");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Forgot PIN: a new PIN is saved only after the account password is confirmed on the server. */
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const shake = useRef(new Animated.Value(0)).current;
  const activeRef = useRef(false);

  async function loadStatus() {
    setError(null);
    setStep("loading");
    try {
      const data = await apiRequest<{ pinSet: boolean }>("/parent/auth/gate/status");
      if (!activeRef.current) return;
      setStep(data.pinSet ? "unlock" : "create");
    } catch (err) {
      if (!activeRef.current) return;
      setError(err instanceof ApiError ? err.message : "Could not load PIN status");
      setStep("error");
    }
  }

  useEffect(() => {
    activeRef.current = visible;
    if (!visible) return;
    setPin("");
    setFirstPin("");
    setReveal(false);
    setResetting(false);
    setPassword("");
    setVerificationToken("");
    void getUser<{ email?: string }>().then((u) => setEmail(u?.email ?? ""));
    void loadStatus();
    return () => {
      activeRef.current = false;
    };
  }, [visible]);

  function cancel() {
    activeRef.current = false;
    setPin("");
    setFirstPin("");
    onClose();
  }

  function runShake() {
    shake.setValue(0);
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true })
      )
    ).start();
  }

  function fail(message: string) {
    setError(message);
    setPin("");
    runShake();
  }

  function press(key: (typeof KEYS)[number]) {
    if (loading || step === "loading" || step === "error" || !key) return;
    setError(null);
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => (p.length >= MAX_PIN ? p : p + key));
  }

  async function submit() {
    if (loading || step === "loading" || step === "error" || pin.length < MIN_PIN) return;
    setError(null);

    if (step === "create") {
      setFirstPin(pin);
      setPin("");
      setStep("confirm");
      return;
    }
    if (step === "confirm" && pin !== firstPin) {
      setFirstPin("");
      setStep("create");
      fail("PINs didn't match. Please create your PIN again.");
      return;
    }

    setLoading(true);
    try {
      let seconds = 600;
      if (step === "confirm" && resetting) {
        await apiRequest("/parent/auth/gate/reset-pin", {
          method: "POST",
          body: JSON.stringify(verificationToken ? { pin, verificationToken } : { pin, password }),
        });
      } else if (step === "confirm") {
        await apiRequest("/parent/auth/gate/set-pin", {
          method: "POST",
          body: JSON.stringify({ pin }),
        });
      } else {
        const data = await apiRequest<{ unlockSeconds: number }>("/parent/auth/gate/verify-pin", {
          method: "POST",
          body: JSON.stringify({ pin }),
        });
        seconds = data.unlockSeconds ?? 600;
      }
      // Cancelled while the request was in flight: do not unlock or navigate.
      if (!activeRef.current) return;
      setPin("");
      unlockParentGate(seconds);
      onUnlocked();
    } catch (err) {
      if (!activeRef.current) return;
      if (step === "confirm" && resetting) {
        // Keep the confirmed PIN so only the proof needs redoing.
        setPassword("");
        setVerificationToken("");
        setError(err instanceof ApiError ? err.message : "Could not reset your PIN. Try again.");
        runShake();
        return;
      }
      fail(err instanceof ApiError ? err.message : "That PIN didn't work. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const copy = {
    loading: { title: "Parent PIN", body: "Checking your PIN settings…", action: "" },
    error: { title: "Parent PIN", body: "We couldn't check your Parent PIN.", action: "Try again" },
    unlock: { title: "Enter Parent PIN", body: "Grown-ups only. Enter your PIN to open parent tools.", action: "Unlock" },
    create: resetting
      ? { title: "Reset Parent PIN", body: "Choose a new 4–6 digit PIN. You'll confirm it with a code sent to your email.", action: "Continue" }
      : { title: "Create a Parent PIN", body: "Choose a 4–6 digit PIN to protect subscription, devices and parent tools.", action: "Continue" },
    confirm: resetting
      ? { title: "Confirm new PIN", body: "Enter the new PIN again, then verify the code we email you.", action: "Reset PIN" }
      : { title: "Confirm your PIN", body: "Enter the same PIN again to confirm.", action: "Save PIN" },
  }[step];

  const slots = Math.max(MIN_PIN, pin.length);
  const needsPassword = step === "confirm" && resetting;
  const ready =
    pin.length >= MIN_PIN && (!needsPassword || Boolean(verificationToken) || password.length > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <ScrollView style={styles.backdropScroll} contentContainerStyle={styles.backdrop} bounces={false}>
        <View style={styles.card}>
          <LinearGradient
            colors={[colors.primary, colors.primaryGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Pressable onPress={cancel} style={styles.close} accessibilityLabel="Close" hitSlop={10}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            <View style={styles.badge}>
              <Ionicons
                name={step === "unlock" ? "lock-closed" : "shield-checkmark"}
                size={30}
                color={colors.primary}
              />
            </View>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.body}>{copy.body}</Text>
            {step === "create" || step === "confirm" ? (
              <View style={styles.steps}>
                <View style={[styles.stepDot, styles.stepDotOn]} />
                <View style={[styles.stepDot, step === "confirm" && styles.stepDotOn]} />
              </View>
            ) : null}
          </LinearGradient>

          <View style={styles.content}>
            {step === "loading" ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
            ) : step === "error" ? (
              <>
                <Text style={[styles.hint, styles.errorText, styles.statusError]}>{error}</Text>
                <Pressable
                  onPress={() => void loadStatus()}
                  style={({ pressed }) => [styles.btnWrap, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.btn}
                  >
                    <Text style={styles.btnText}>{copy.action}</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={cancel} style={styles.linkBtn}>
                  <Text style={styles.linkText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Animated.View style={[styles.slotsRow, { transform: [{ translateX: shake }] }]}>
                  {Array.from({ length: slots }).map((_, i) => {
                    const filled = i < pin.length;
                    const active = i === pin.length;
                    return (
                      <View
                        key={i}
                        style={[styles.slot, filled && styles.slotFilled, active && styles.slotActive, error && styles.slotError]}
                      >
                        {filled ? (
                          reveal ? (
                            <Text style={styles.slotDigit}>{pin[i]}</Text>
                          ) : (
                            <View style={styles.slotDot} />
                          )
                        ) : null}
                      </View>
                    );
                  })}
                </Animated.View>

                <View style={styles.metaRow}>
                  <Text style={[styles.hint, error && styles.errorText]} numberOfLines={2}>
                    {error ?? (ready ? "Looks good!" : `${MIN_PIN}–${MAX_PIN} digits`)}
                  </Text>
                  <Pressable
                    onPress={() => setReveal((v) => !v)}
                    style={styles.revealBtn}
                    accessibilityLabel={reveal ? "Hide PIN" : "Show PIN"}
                    hitSlop={8}
                  >
                    <Ionicons name={reveal ? "eye-off-outline" : "eye-outline"} size={18} color={colors.primaryDark} />
                    <Text style={styles.revealText}>{reveal ? "Hide" : "Show"}</Text>
                  </Pressable>
                </View>

                {needsPassword ? (
                  <View style={styles.proof}>
                    {verificationToken ? (
                      <Text style={styles.proofOk}>Email verified. Tap Reset PIN.</Text>
                    ) : (
                      <>
                        {email ? (
                          <EmailOtpVerify email={email} purpose="RESET_PIN" onVerified={setVerificationToken} />
                        ) : null}
                        <Text style={styles.proofOr}>or use your account password</Text>
                        <TextInput
                          value={password}
                          onChangeText={(v) => {
                            setPassword(v);
                            setError(null);
                          }}
                          placeholder="Account password"
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                          accessibilityLabel="Account password"
                          style={styles.passwordInput}
                        />
                      </>
                    )}
                  </View>
                ) : null}

                <View style={styles.keypad}>
                  {KEYS.map((k, i) =>
                    k === "" ? (
                      <View key={i} style={styles.keySpacer} />
                    ) : (
                      <Pressable
                        key={i}
                        onPress={() => press(k)}
                        onLongPress={k === "back" ? () => setPin("") : undefined}
                        accessibilityLabel={k === "back" ? "Delete digit" : `Digit ${k}`}
                        style={({ pressed }) => [styles.key, k === "back" && styles.keyBack, pressed && styles.keyPressed]}
                      >
                        {k === "back" ? (
                          <Ionicons name="backspace-outline" size={24} color={colors.primaryDark} />
                        ) : (
                          <Text style={styles.keyText}>{k}</Text>
                        )}
                      </Pressable>
                    )
                  )}
                </View>

                <Pressable
                  disabled={!ready || loading}
                  onPress={() => void submit()}
                  style={({ pressed }) => [styles.btnWrap, (!ready || loading) && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }] }]}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.btn}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.btnText}>{copy.action}</Text>
                    )}
                  </LinearGradient>
                </Pressable>

                {step === "confirm" ? (
                  <Pressable
                    onPress={() => {
                      setStep("create");
                      setPin("");
                      setFirstPin("");
                      setError(null);
                    }}
                    style={styles.linkBtn}
                  >
                    <Text style={styles.linkText}>← Start over</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={cancel} style={styles.linkBtn}>
                    <Text style={styles.linkText}>Cancel</Text>
                  </Pressable>
                )}
                {step === "unlock" ? (
                  <Pressable
                    onPress={() => {
                      setResetting(true);
                      setStep("create");
                      setPin("");
                      setFirstPin("");
                      setPassword("");
                      setError(null);
                    }}
                    style={styles.linkBtn}
                  >
                    <Text style={styles.linkText}>Forgot PIN?</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

const KEY_SIZE = 64;

const styles = StyleSheet.create({
  backdropScroll: {
    flex: 1,
    backgroundColor: "rgba(31,22,53,0.6)",
  },
  backdrop: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 18,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    overflow: "hidden",
    ...shadow.card,
  },
  header: {
    alignItems: "center",
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 22,
    gap: 6,
  },
  close: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    ...shadow.soft,
  },
  title: { color: "#fff", fontSize: 21, fontWeight: "800", textAlign: "center" },
  body: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  steps: { flexDirection: "row", gap: 6, marginTop: 8 },
  stepDot: { width: 22, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)" },
  stepDotOn: { backgroundColor: "#fff" },
  content: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 14, alignItems: "center" },
  slotsRow: { flexDirection: "row", gap: 10, justifyContent: "center" },
  slot: {
    width: 44,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  slotFilled: { borderColor: colors.primaryGradientEnd, backgroundColor: colors.primarySoft },
  slotActive: { borderColor: colors.primary, backgroundColor: "#fff" },
  slotError: { borderColor: colors.danger },
  slotDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: colors.primaryDark },
  slotDigit: { fontSize: 22, fontWeight: "800", color: colors.primaryDark },
  metaRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 6,
    gap: 8,
  },
  hint: { flex: 1, color: colors.textMuted, fontSize: 12.5, fontWeight: "700" },
  errorText: { color: colors.danger },
  statusError: { flex: 0, textAlign: "center", marginTop: 8, marginBottom: 18 },
  revealBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  revealText: { color: colors.primaryDark, fontWeight: "800", fontSize: 12 },
  keypad: {
    width: KEY_SIZE * 3 + 18 * 2,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  keyBack: { backgroundColor: "transparent", borderColor: "transparent" },
  keyPressed: { backgroundColor: colors.primarySoft, borderColor: colors.primaryGradientEnd, transform: [{ scale: 0.94 }] },
  keySpacer: { width: KEY_SIZE, height: KEY_SIZE },
  keyText: { fontSize: 24, fontWeight: "700", color: colors.text },
  btnWrap: { width: "100%", borderRadius: radii.pill, overflow: "hidden" },
  btn: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.3 },
  proof: { width: "100%", gap: 6, marginBottom: 6 },
  proofOk: { color: colors.success, fontWeight: "800", fontSize: 13, textAlign: "center" },
  proofOr: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textAlign: "center" },
  passwordInput: {
    width: "100%",
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    marginBottom: 6,
  },
  linkBtn: { alignItems: "center", paddingVertical: 10, marginTop: 2 },
  linkText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
});

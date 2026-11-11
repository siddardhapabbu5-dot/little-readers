import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { apiRequest, ApiError } from "../services/api";
import { isValidEmail } from "../services/auth-errors";
import { colors, radii } from "../theme";

type Purpose = "REGISTER" | "RESET_PASSWORD" | "RESET_PIN";

/**
 * Email OTP step: send code → enter 6 digits → verify. Calls onVerified with the
 * single-use verification token the backend issues after a correct code.
 */
export function EmailOtpVerify({
  email,
  purpose,
  disabled,
  onVerified,
}: {
  email: string;
  purpose: Purpose;
  disabled?: boolean;
  onVerified: (verificationToken: string) => void;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Editing the email after sending requires a fresh code for the new address.
  const normalized = email.trim().toLowerCase();
  const codeSent = sentTo !== null && sentTo === normalized;

  async function send() {
    setError(null);
    setInfo(null);
    if (!isValidEmail(normalized)) {
      setError("Enter a valid email address first.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<{ message: string; resendInSec: number; expiresInSec: number }>(
        "/auth/email-otp/send",
        {
          method: "POST",
          mobile: false,
          body: JSON.stringify({ email: normalized, purpose }),
        }
      );
      setSentTo(normalized);
      setCode("");
      setResendIn(data.resendInSec ?? 60);
      setInfo(
        `${data.message} The code expires in ${Math.round((data.expiresInSec ?? 300) / 60)} minutes.`
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const wait = (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
        if (wait && wait < 120) setResendIn(wait);
      }
      setError(err instanceof ApiError ? err.message : "Could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setInfo(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<{ verificationToken: string }>("/auth/email-otp/verify", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({ email: normalized, purpose, otp: code }),
      });
      setInfo("Email verified.");
      onVerified(data.verificationToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const locked = disabled || busy;

  return (
    <View style={styles.wrap}>
      {codeSent ? (
        <>
          <Text style={styles.label}>6-digit code sent to {sentTo}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
              placeholder="Enter code"
              placeholderTextColor="#9B8EC4"
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              editable={!locked}
              accessibilityLabel="Email verification code"
              onSubmitEditing={() => void verify()}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Verify code"
            disabled={locked}
            onPress={() => void verify()}
            style={({ pressed }) => [styles.primaryBtn, (pressed || locked) && { opacity: 0.85 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? "Please wait…" : "Verify"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={locked || resendIn > 0}
            onPress={() => void send()}
            style={styles.linkBtn}
          >
            <Text style={[styles.linkText, (locked || resendIn > 0) && { opacity: 0.6 }]}>
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send verification code"
          disabled={locked || resendIn > 0}
          onPress={() => void send()}
          style={({ pressed }) => [
            styles.secondaryBtn,
            (pressed || locked || resendIn > 0) && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.secondaryBtnText}>
            {busy
              ? "Sending…"
              : resendIn > 0
                ? `Send code in ${resendIn}s`
                : "Send verification code"}
          </Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {info ? <Text style={styles.info}>{info}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontWeight: "700", color: colors.primaryDark, fontSize: 13 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7F4FF",
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: "#D8D0F5",
    paddingHorizontal: 10,
    minHeight: 44,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 6,
    paddingVertical: 8,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radii.pill,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryBtnText: { color: colors.primaryDark, fontWeight: "800", fontSize: 14 },
  linkBtn: { alignSelf: "center", paddingVertical: 4, minHeight: 28, justifyContent: "center" },
  linkText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  error: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  info: { color: colors.success, fontWeight: "700", fontSize: 12 },
});

import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Card,
  ErrorText,
  Field,
  PrimaryButton,
  SoftButton,
  KeyboardScroll,
  Title,
} from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { colors, radii } from "../theme";

const REQUIREMENTS = [
  { id: "len", label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  {
    id: "upper",
    label: "One uppercase letter",
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "One lowercase letter",
    test: (p: string) => /[a-z]/.test(p),
  },
  { id: "num", label: "One number", test: (p: string) => /[0-9]/.test(p) },
  {
    id: "special",
    label: "One special character",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
] as const;

function strengthScore(password: string) {
  return REQUIREMENTS.filter((r) => r.test(password)).length;
}

function strengthLabel(score: number) {
  if (score <= 1) return { label: "Very weak", color: "#DC2626" };
  if (score === 2) return { label: "Weak", color: "#EA580C" };
  if (score === 3) return { label: "Fair", color: "#CA8A04" };
  if (score === 4) return { label: "Strong", color: "#16A34A" };
  return { label: "Excellent", color: "#15803D" };
}

export default function AdminResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = useMemo(() => {
    const raw = params.token;
    return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
  }, [params.token]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const score = strengthScore(password);
  const strength = strengthLabel(score);

  async function onSubmit() {
    setError(null);
    setSuccess(null);
    if (!token || token.length < 20) {
      setError("This reset link is missing or invalid.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const failed = REQUIREMENTS.find((r) => !r.test(password));
    if (failed) {
      setError(`Password must include: ${failed.label.toLowerCase()}.`);
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>(
        "/admin/auth/reset-password",
        {
          method: "POST",
          mobile: false,
          body: JSON.stringify({ token, password, confirmPassword }),
        }
      );
      setSuccess(data.message);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not reset password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardScroll
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <SoftButton
            label="← Return to Admin Login"
            onPress={() => router.replace("/login")}
          />
          <Title>Reset Admin password</Title>
          <Text style={styles.sub}>
            Choose a strong new password. Previous Admin sessions will be signed
            out after a successful reset.
          </Text>

          <Card style={{ gap: 12, marginTop: 8 }}>
            <View>
              <Field
                label="New Password"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!loading && !success}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => setShowPassword((s) => !s)}
                style={styles.toggle}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                <Text style={styles.toggleText}>
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>

            <View>
              <Field
                label="Confirm New Password"
                secureTextEntry={!showConfirm}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!loading && !success}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                onPress={() => setShowConfirm((s) => !s)}
                style={styles.toggle}
                accessibilityRole="button"
              >
                <Text style={styles.toggleText}>
                  {showConfirm ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>

            {!success ? (
              <View style={styles.strengthBox}>
                <Text style={styles.strengthTitle}>Password strength</Text>
                <View style={styles.strengthTrack}>
                  {REQUIREMENTS.map((r, i) => (
                    <View
                      key={r.id}
                      style={[
                        styles.strengthSeg,
                        {
                          backgroundColor:
                            i < score ? strength.color : "#E4E4E7",
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>
                  {password ? strength.label : "Enter a password"}
                </Text>
                <Text style={styles.reqTitle}>Password requirements</Text>
                {REQUIREMENTS.map((r) => {
                  const ok = r.test(password);
                  return (
                    <Text
                      key={r.id}
                      style={[styles.req, ok && styles.reqOk]}
                    >
                      {ok ? "✓" : "○"} {r.label}
                    </Text>
                  );
                })}
              </View>
            ) : null}

            <ErrorText>{error}</ErrorText>
            {success ? <Text style={styles.ok}>{success}</Text> : null}

            {!success ? (
              <PrimaryButton
                label="Reset Password"
                loading={loading}
                onPress={() => void onSubmit()}
              />
            ) : (
              <PrimaryButton
                label="Return to Admin Login"
                onPress={() => router.replace("/login")}
              />
            )}
          </Card>
        </KeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10, paddingBottom: 40 },
  sub: { color: colors.textMuted, lineHeight: 20 },
  ok: { color: colors.success, fontWeight: "700", lineHeight: 20 },
  toggle: { alignSelf: "flex-end", paddingVertical: 4, marginTop: -4 },
  toggleText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
  strengthBox: {
    backgroundColor: "#F4F4F5",
    borderRadius: radii.md,
    padding: 12,
    gap: 6,
  },
  strengthTitle: { fontWeight: "800", color: colors.text, fontSize: 13 },
  strengthTrack: { flexDirection: "row", gap: 4, height: 6 },
  strengthSeg: { flex: 1, borderRadius: 3 },
  strengthLabel: { fontWeight: "700", fontSize: 12 },
  reqTitle: {
    marginTop: 6,
    fontWeight: "800",
    color: colors.text,
    fontSize: 13,
  },
  req: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  reqOk: { color: colors.success },
});

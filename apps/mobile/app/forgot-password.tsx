import { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
} from "react-native";
import { useRouter } from "expo-router";
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
import { EmailOtpVerify } from "../components/EmailOtpVerify";
import { apiRequest, ApiError } from "../services/api";
import { colors } from "../theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onReset() {
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>("/auth/reset-password-otp", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          verificationToken: token,
          password,
          confirmPassword,
        }),
      });
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SoftButton label="← Back to login" onPress={() => router.replace("/login")} />
          <Title>Forgot password</Title>
          <Text style={styles.sub}>
            {token
              ? "Email verified. Choose a new password (at least 8 characters, with a letter and a number)."
              : "Enter your account email. We'll send a 6-digit verification code to it."}
          </Text>
          <Card style={{ gap: 12, marginTop: 8 }}>
            {!token ? (
              <>
                <Field
                  label="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <EmailOtpVerify email={email} purpose="RESET_PASSWORD" onVerified={setToken} />
              </>
            ) : success ? (
              <>
                <Text style={styles.ok}>{success}</Text>
                <PrimaryButton label="Go to login" onPress={() => router.replace("/login")} />
              </>
            ) : (
              <>
                <Field
                  label="New password"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                />
                <Field
                  label="Confirm password"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!loading}
                />
                <ErrorText>{error}</ErrorText>
                <PrimaryButton
                  label="Update password"
                  loading={loading}
                  onPress={() => void onReset()}
                />
              </>
            )}
          </Card>
        </KeyboardScroll>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10 },
  sub: { color: colors.textMuted, lineHeight: 20 },
  ok: { color: colors.success, fontWeight: "700", lineHeight: 20 },
});

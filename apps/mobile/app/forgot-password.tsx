import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  Title,
} from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { isValidEmail } from "../services/auth-errors";
import { colors } from "../theme";

type ForgotResult = {
  accepted: boolean;
  message: string;
  deliveryChannel?: string;
  devResetToken?: string;
};

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setSuccess(null);
    setDevToken(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email address is required.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<ForgotResult>("/auth/forgot-password", {
        method: "POST",
        mobile: false,
        body: JSON.stringify({ email: trimmed, client: "mobile" }),
      });
      if (!data.accepted) {
        setError(data.message);
        return;
      }
      setSuccess(data.message);
      if (data.devResetToken) setDevToken(data.devResetToken);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not start password reset. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <SoftButton label="← Back to login" onPress={() => router.replace("/login")} />
          <Title>Forgot password</Title>
          <Text style={styles.sub}>
            Enter your account email. We only confirm success after the reset email is
            actually delivered (or logged in local test mode).
          </Text>
          <Card style={{ gap: 12, marginTop: 8 }}>
            <Field
              label="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />
            <ErrorText>{error}</ErrorText>
            {success ? <Text style={styles.ok}>{success}</Text> : null}
            {devToken ? (
              <PrimaryButton
                label="Open reset screen (test token)"
                onPress={() =>
                  router.push({
                    pathname: "/reset-password",
                    params: { token: devToken },
                  })
                }
              />
            ) : null}
            <PrimaryButton
              label="Send reset link"
              loading={loading}
              onPress={() => void onSubmit()}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 10 },
  sub: { color: colors.textMuted, lineHeight: 20 },
  ok: { color: colors.success, fontWeight: "700", lineHeight: 20 },
});
